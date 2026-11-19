/**
 * Track-level matching across the whole library.
 *
 * Used when no single album replaces a missing one: a compilation replaced by the studio
 * albums, or studio albums replaced by a compilation. Each missing track gets its own ranked
 * list of candidates, picked from any album of the same artist.
 */
import { TITLE_MATCH_THRESHOLD, type TrackPair } from './matching'
import { normalizeArtist, normalizeTitle, similarity } from './normalize'
import type { AlbumSummary, Track } from './types'

/** Album release info used for ranking. */
export type AlbumInfo = Pick<AlbumSummary, 'id' | 'name' | 'releaseTypes' | 'compilation'>

/** Phrasings that mean "live" whatever the tags say. */
const LIVE_ALBUM_STRONG =
  /\b(live (at|in|from|on|aus|au|à|a)|concerts?|in concert|en concert|unplugged|en direct|en vivo|ao vivo|dal vivo|bbc sessions?)\b|[([{][^)\]}]*\blive\b[^)\]}]*[)\]}]/i
/** The bare word, only trusted when the release type is unknown ("Live Through This" is a studio album). */
const LIVE_ALBUM_WEAK = /\blive\b/i
/** "(Live)", "[Live at …]", "- Live 1990", "(Live Version)"… */
const LIVE_TITLE = /[([{][^)\]}]*\blive\b[^)\]}]*[)\]}]|\s[-–—]\s.*\blive\b/i

export function isLiveAlbum(a: Pick<AlbumInfo, 'name' | 'releaseTypes'> | undefined): boolean {
  if (!a) return false
  if (a.releaseTypes?.includes('live')) return true
  if (LIVE_ALBUM_STRONG.test(a.name)) return true
  return !a.releaseTypes?.length && LIVE_ALBUM_WEAK.test(a.name)
}

export function isLiveTitle(title: string): boolean {
  return LIVE_TITLE.test(title)
}

export function isCompilation(a: AlbumInfo | undefined): boolean {
  return !!a && (a.compilation === true || !!a.releaseTypes?.includes('compilation'))
}

export function isLiveTrack(t: Track, album?: AlbumInfo): boolean {
  return isLiveTitle(t.title) || isLiveAlbum(album ?? { name: t.album })
}

export interface RankedCandidate {
  track: Track
  album?: AlbumInfo
  live: boolean
  compilation: boolean
  /** Normalized titles are identical. */
  exactTitle: boolean
  /** Absolute duration difference in seconds, when both durations are known. */
  durationDelta?: number
}

/** 0: ≤ 3 s, 1: ≤ 10 s or unknown, 2: ≤ 30 s, 3: more. */
function durationBucket(d: number | undefined): number {
  if (d === undefined) return 1
  if (d <= 3) return 0
  if (d <= 10) return 1
  if (d <= 30) return 2
  return 3
}

const artistOf = (t: Track) => [t.albumArtist, t.artist].filter(Boolean).map((a) => normalizeArtist(a!))

/** Same artist: either side's artist or album artist match closely. */
export function sameArtist(a: Track, b: Track): boolean {
  const as = artistOf(a)
  const bs = artistOf(b)
  return as.some((x) => bs.some((y) => similarity(x, y) >= 0.8))
}

/**
 * Keep the plausible replacements for `old` among `found` (search results), and describe them.
 * Excludes the track itself, its own album, missing files, other artists and other songs.
 */
export function candidatesFor(old: Track, found: Track[], albums: ReadonlyMap<string, AlbumInfo>): RankedCandidate[] {
  const title = normalizeTitle(old.title)
  const seen = new Set<string>()
  const out: RankedCandidate[] = []
  for (const t of found) {
    if (seen.has(t.id) || t.id === old.id || t.missing || (old.albumId && t.albumId === old.albumId)) continue
    seen.add(t.id)
    const other = normalizeTitle(t.title)
    if (similarity(title, other) < TITLE_MATCH_THRESHOLD || !sameArtist(old, t)) continue
    const album = albums.get(t.albumId)
    out.push({
      track: t,
      album,
      live: isLiveTrack(t, album),
      compilation: isCompilation(album),
      exactTitle: title === other,
      durationDelta: old.duration && t.duration ? Math.abs(old.duration - t.duration) : undefined,
    })
  }
  return out
}

/**
 * Order candidates, best first:
 * 1. same liveness as the old track (a studio track is not replaced by a live one);
 * 2. identical normalized title;
 * 3. closest duration (album version rather than radio edit), by buckets;
 * 4. studio album rather than compilation;
 * 5. the album that supplies the most tracks of this replacement (fewer albums overall);
 * 6. exact duration difference, then id for a stable order.
 */
export function rankCandidates(
  cands: RankedCandidate[],
  oldLive: boolean,
  albumSupport: ReadonlyMap<string, number> = new Map(),
): RankedCandidate[] {
  const key = (c: RankedCandidate) => [
    c.live === oldLive ? 0 : 1,
    c.exactTitle ? 0 : 1,
    durationBucket(c.durationDelta),
    c.compilation ? 1 : 0,
    -(albumSupport.get(c.track.albumId) ?? 0),
    c.durationDelta ?? 99,
  ]
  return [...cands].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]
    return a.track.id.localeCompare(b.track.id)
  })
}

export interface MultiMatch {
  pairs: TrackPair[]
  /** Ranked candidates per old track id, for manual changes. */
  candidates: Map<string, RankedCandidate[]>
}

/**
 * Pair every old track with its best candidate across albums.
 * `found` maps each old track id to the raw search results for it.
 */
export function matchAcrossAlbums(
  oldTracks: Track[],
  found: ReadonlyMap<string, Track[]>,
  albums: ReadonlyMap<string, AlbumInfo>,
  oldAlbum?: AlbumInfo,
): MultiMatch {
  const raw = new Map(oldTracks.map((o) => [o.id, candidatesFor(o, found.get(o.id) ?? [], albums)]))

  // How many old tracks each album could replace: used to keep the result on few albums.
  const support = new Map<string, number>()
  for (const list of raw.values()) {
    for (const albumId of new Set(list.map((c) => c.track.albumId))) support.set(albumId, (support.get(albumId) ?? 0) + 1)
  }

  const candidates = new Map<string, RankedCandidate[]>()
  const pairs: TrackPair[] = oldTracks.map((old) => {
    const oldLive = isLiveTrack(old, oldAlbum)
    const ranked = rankCandidates(raw.get(old.id)!, oldLive, support)
    candidates.set(old.id, ranked)
    const best = ranked[0]
    if (!best) return { old, new: null, status: 'unmatched', reason: { code: 'none' } }
    const score = similarity(normalizeTitle(old.title), normalizeTitle(best.track.title))
    if (best.live !== oldLive) return { old, new: best.track, status: 'uncertain', reason: { code: 'live' }, score }
    if (!best.exactTitle) return { old, new: best.track, status: 'uncertain', reason: { code: 'title' }, score }
    if (durationBucket(best.durationDelta) >= 2) {
      return { old, new: best.track, status: 'uncertain', reason: { code: 'duration', seconds: Math.round(best.durationDelta!) }, score }
    }
    return { old, new: best.track, status: 'ok', score }
  })
  return { pairs, candidates }
}

/** Number of old tracks with a replacement, and how many albums those come from. */
export function coverage(pairs: TrackPair[]): { found: number; total: number; albums: number } {
  const withNew = pairs.filter((p) => p.new)
  return { found: withNew.length, total: pairs.length, albums: new Set(withNew.map((p) => p.new!.albumId)).size }
}
