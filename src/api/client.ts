import { AppError, httpError, subsonicError } from '../core/errors'
import { albumFromNative, albumFromSubsonic, playlistFromSubsonic, trackFromNative, trackFromSubsonic } from '../core/mappers'
import {
  buildSubsonicRequest,
  coverArtUrl,
  MAX_GET_URL_LENGTH,
  nativeQuery,
  replacePlaylistParams,
  type NativeQuery,
  type Params,
} from '../core/requests'
import { sortTracks } from '../core/matching'
import type { AlbumSummary, PlaylistContent, PlaylistInfo, Track } from '../core/types'
import type { PlaylistGateway } from '../core/workflow'
import { readJson, safeFetch } from './http'
import { saveSession, type Session } from './session'

type Obj = Record<string, unknown>
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : v ? [v as Obj] : [])

const PAGE = 500

/** Talks to one Navidrome server, through the Subsonic API and (when available) the native API. */
export class Navidrome implements PlaylistGateway {
  constructor(public session: Session) {}

  get hasNative(): boolean {
    return !!this.session.jwt
  }

  private get auth() {
    return { username: this.session.username, token: this.session.subsonicToken, salt: this.session.subsonicSalt }
  }

  // ---------- Subsonic ----------

  async subsonic(method: string, params: Params = [], opts: { post?: boolean } = {}): Promise<Obj> {
    const post = opts.post ?? this.session.formPost
    const req = buildSubsonicRequest(this.session.serverUrl, this.auth, method, params, post)
    if (!post && req.url.length > MAX_GET_URL_LENGTH) {
      throw new AppError(
        'protocol',
        'This request is too large for a URL, and the server does not support form POST requests.',
        'Update Navidrome to a version that supports the OpenSubsonic formPost extension.',
      )
    }
    const res = await safeFetch(this.session.serverUrl, req.url, req.init)
    if (!res.ok) throw httpError(res.status, await res.text().catch(() => ''))
    const json = (await readJson(res)) as Obj
    const body = json['subsonic-response'] as Obj | undefined
    if (!body) throw new AppError('protocol', 'Unexpected answer from the Subsonic API.')
    if (body.status !== 'ok') {
      const err = (body.error ?? {}) as Obj
      throw subsonicError(Number(err.code ?? 0), String(err.message ?? ''))
    }
    return body
  }

  coverUrl(id: string | undefined, size = 80): string | undefined {
    return id ? coverArtUrl(this.session.serverUrl, this.auth, id, size) : undefined
  }

  async search(query: string, opts: { albums?: number; songs?: number } = {}): Promise<{ albums: AlbumSummary[]; songs: Track[] }> {
    const body = await this.subsonic('search3', [
      ['query', query],
      ['artistCount', '0'],
      ['albumCount', String(opts.albums ?? 8)],
      ['songCount', String(opts.songs ?? 8)],
    ])
    const r = (body.searchResult3 ?? {}) as Obj
    return { albums: arr(r.album).map(albumFromSubsonic), songs: arr(r.song).map(trackFromSubsonic) }
  }

  /** Tracks of an album. Uses the native API when possible, because it includes missing files. */
  async albumTracks(albumId: string): Promise<Track[]> {
    if (this.hasNative) {
      const rows = await this.nativeAll('/api/song', { sort: 'album', order: 'ASC', filters: { album_id: albumId } })
      return sortTracks(rows.map(trackFromNative))
    }
    const body = await this.subsonic('getAlbum', [['id', albumId]])
    return sortTracks(arr((body.album as Obj)?.song).map(trackFromSubsonic))
  }

  async playlists(): Promise<PlaylistInfo[]> {
    const body = await this.subsonic('getPlaylists')
    return arr((body.playlists as Obj)?.playlist).map(playlistFromSubsonic)
  }

  // ---------- Native API ----------

  async native(path: string, q: NativeQuery = {}): Promise<{ data: unknown; total?: number }> {
    if (!this.session.jwt) throw new AppError('not-authorized', 'The Navidrome native API is not available in this session.')
    const qs = nativeQuery(q)
    const res = await safeFetch(this.session.serverUrl, `${this.session.serverUrl}${path}${qs ? '?' + qs : ''}`, {
      headers: { Accept: 'application/json', 'X-ND-Authorization': `Bearer ${this.session.jwt}` },
    })
    // Navidrome slides the session: each answer may carry a fresh token.
    const fresh = res.headers.get('x-nd-authorization')
    if (fresh && fresh !== this.session.jwt) {
      this.session = { ...this.session, jwt: fresh }
      saveSession(this.session)
    }
    if (!res.ok) throw httpError(res.status, await res.text().catch(() => ''))
    const total = res.headers.get('x-total-count')
    return { data: await readJson(res), total: total === null ? undefined : Number(total) }
  }

  /** Fetch every page of a native list endpoint. */
  async nativeAll(path: string, q: NativeQuery = {}, onPage?: (n: number, total?: number) => void): Promise<Obj[]> {
    const out: Obj[] = []
    for (let start = 0; ; start += PAGE) {
      const { data, total } = await this.native(path, { ...q, start, end: start + PAGE })
      const rows = arr(data)
      out.push(...rows)
      onPage?.(out.length, total)
      if (rows.length < PAGE || (total !== undefined && out.length >= total)) return out
    }
  }

  async missingTracks(onPage?: (n: number, total?: number) => void): Promise<Track[]> {
    const rows = await this.nativeAll('/api/missing', { sort: 'path', order: 'ASC' }, onPage)
    return rows.map(trackFromNative)
  }

  /** Albums whose files are all missing, by name. search3 never returns those. */
  async searchMissingAlbums(name: string): Promise<AlbumSummary[]> {
    const { data } = await this.native('/api/album', { start: 0, end: 8, sort: 'name', order: 'ASC', filters: { name, missing: true } })
    return arr(data).map(albumFromNative)
  }

  // ---------- Playlists (gateway) ----------

  /**
   * Full ordered content of a playlist, missing files included.
   *
   * Subsonic getPlaylist hides missing files, so the native API is the source of truth.
   * Without it we fall back to Subsonic, but refuse when songCount shows hidden entries:
   * rewriting such a playlist would silently drop them.
   */
  async read(playlistId: string): Promise<PlaylistContent> {
    return (await this.readWithTracks(playlistId)).content
  }

  async readWithTracks(playlistId: string): Promise<{ content: PlaylistContent; tracks: Map<string, Track> }> {
    const tracks = new Map<string, Track>()
    if (this.hasNative) {
      const [{ data: meta }, rows] = await Promise.all([
        this.native(`/api/playlist/${encodeURIComponent(playlistId)}`),
        this.nativeAll(`/api/playlist/${encodeURIComponent(playlistId)}/tracks`, { sort: 'id', order: 'ASC' }),
      ])
      for (const r of rows) {
        const t = trackFromNative(r)
        tracks.set(t.id, t)
      }
      return { content: { id: playlistId, name: String((meta as Obj).name ?? ''), trackIds: rows.map((r) => String(r.mediaFileId)) }, tracks }
    }
    const body = await this.subsonic('getPlaylist', [['id', playlistId]])
    const p = body.playlist as Obj
    const entries = arr(p.entry)
    const songCount = Number(p.songCount ?? entries.length)
    if (songCount !== entries.length) {
      throw new AppError(
        'protocol',
        `This playlist has ${songCount - entries.length} hidden entries (probably missing files).`,
        'The Subsonic API does not return missing files, so rewriting it would delete them. Sign in through the Navidrome login (native API) to handle this playlist.',
      )
    }
    for (const e of entries) {
      const t = trackFromSubsonic(e)
      tracks.set(t.id, t)
    }
    return { content: { id: playlistId, name: String(p.name ?? ''), trackIds: entries.map((e) => String(e.id)) }, tracks }
  }

  /** Replace the whole content, in order, in one transaction (Subsonic createPlaylist with playlistId). */
  async write(playlistId: string, trackIds: readonly string[]): Promise<void> {
    if (trackIds.length === 0) {
      // createPlaylist ignores an empty list, so it cannot empty a playlist.
      throw new AppError('protocol', 'Refusing to write an empty playlist.')
    }
    await this.subsonic('createPlaylist', replacePlaylistParams(playlistId, trackIds))
  }
}
