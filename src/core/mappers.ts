/** Convert raw API payloads into the app's types. */
import type { AlbumSummary, PlaylistInfo, Track } from './types'

type Obj = Record<string, unknown>
const s = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)
const opt = (v: unknown) => (v == null || v === '' || v === 0 ? undefined : (v as never))

/** Subsonic `child` (song) → Track */
export function trackFromSubsonic(c: Obj): Track {
  return {
    id: s(c.id),
    title: s(c.title),
    album: s(c.album),
    albumId: s(c.albumId),
    artist: s(c.artist),
    albumArtist: opt(c.displayAlbumArtist) ?? undefined,
    discNumber: n(c.discNumber) || 1,
    trackNumber: n(c.track),
    year: opt(c.year),
    suffix: opt(c.suffix),
    duration: opt(c.duration),
    coverArt: opt(c.coverArt),
    path: opt(c.path),
    missing: false,
    starred: !!c.starred,
  }
}

/** Native API MediaFile (or PlaylistTrack, which embeds it) → Track */
export function trackFromNative(m: Obj): Track {
  return {
    id: s(m.mediaFileId ?? m.id),
    title: s(m.title),
    album: s(m.album),
    albumId: s(m.albumId),
    artist: s(m.artist),
    albumArtist: opt(m.albumArtist),
    discNumber: n(m.discNumber) || 1,
    trackNumber: n(m.trackNumber),
    year: opt(m.year),
    suffix: opt(m.suffix),
    duration: opt(m.duration),
    coverArt: m.albumId ? `al-${s(m.albumId)}` : undefined,
    path: opt(m.path),
    missing: m.missing === true,
    starred: m.starred === true,
  }
}

/** Subsonic album (search3 / getAlbum) → AlbumSummary */
export function albumFromSubsonic(a: Obj): AlbumSummary {
  return {
    id: s(a.id),
    name: s(a.name ?? a.title),
    artist: s(a.artist),
    year: opt(a.year),
    songCount: n(a.songCount),
    coverArt: opt(a.coverArt),
    missing: false,
    releaseTypes: releaseTypes(a.releaseTypes),
    compilation: a.isCompilation === true,
  }
}

/** Native API album → AlbumSummary */
export function albumFromNative(a: Obj): AlbumSummary {
  return {
    id: s(a.id),
    name: s(a.name),
    artist: s(a.albumArtist),
    year: opt(a.maxYear),
    songCount: n(a.songCount),
    coverArt: a.id ? `al-${s(a.id)}` : undefined,
    missing: a.missing === true,
    releaseTypes: releaseTypes((a.tags as Obj | undefined)?.releasetype),
    compilation: a.compilation === true,
  }
}

function releaseTypes(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  // Some taggers store "album;compilation" in a single value.
  return v.flatMap((x) => String(x).split(/[;/]/)).map((x) => x.trim().toLowerCase()).filter(Boolean)
}

export function playlistFromSubsonic(p: Obj): PlaylistInfo {
  return {
    id: s(p.id),
    name: s(p.name),
    owner: s(p.owner),
    songCount: n(p.songCount),
    readonly: typeof p.readonly === 'boolean' ? p.readonly : undefined,
  }
}

export function formatsOf(tracks: Track[]): string[] {
  return [...new Set(tracks.map((t) => (t.suffix ?? '').toUpperCase()).filter(Boolean))].sort()
}

export function formatDuration(sec?: number): string {
  if (!sec) return ''
  const total = Math.round(sec)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
