import { matchAlbums, matchQuality, sortTracks } from './matching'
import { normalizeAlbum, normalizeArtist, similarity } from './normalize'
import { isLiveAlbum } from './trackmatch'
import type { AlbumSummary, Track } from './types'

export interface MissingAlbum {
  albumId: string
  album: string
  artist: string
  year?: number
  tracks: Track[]
}

/** Group missing tracks by album, biggest groups first. */
export function groupMissingByAlbum(tracks: Track[]): MissingAlbum[] {
  const groups = new Map<string, MissingAlbum>()
  for (const t of tracks) {
    const key = t.albumId || `${t.albumArtist ?? t.artist}::${t.album}`
    let g = groups.get(key)
    if (!g) {
      g = { albumId: t.albumId, album: t.album, artist: t.albumArtist || t.artist, year: t.year, tracks: [] }
      groups.set(key, g)
    }
    g.tracks.push(t)
  }
  return [...groups.values()]
    .map((g) => ({ ...g, tracks: sortTracks(g.tracks) }))
    .sort((a, b) => b.tracks.length - a.tracks.length || a.artist.localeCompare(b.artist) || a.album.localeCompare(b.album))
}

/** Text to feed search3 when looking for a replacement release. */
export function candidateQuery(m: MissingAlbum): string {
  return normalizeAlbum(m.album) || m.album
}

/** Cheap pre-ranking of a candidate album from its summary alone (0..1). */
export function summaryScore(m: MissingAlbum, c: AlbumSummary): number {
  if (c.id === m.albumId || c.missing) return 0
  const artist = similarity(normalizeArtist(m.artist), normalizeArtist(c.artist))
  const album = similarity(normalizeAlbum(m.album), normalizeAlbum(c.name))
  if (artist < 0.6 || album < 0.5) return 0
  // The new release should hold at least the old tracks; a bigger one (deluxe) is fine.
  const countFit = c.songCount >= m.tracks.length ? 1 : c.songCount / Math.max(1, m.tracks.length)
  const score = artist * 0.35 + album * 0.45 + countFit * 0.2
  // A live album is a poor replacement for a studio one, and the other way round.
  return isLiveAlbum(c) === isLiveAlbum({ name: m.album }) ? score : score * 0.3
}

export interface RankedCandidate {
  album: AlbumSummary
  score: number
}

export function rankCandidates(m: MissingAlbum, candidates: AlbumSummary[]): RankedCandidate[] {
  const seen = new Set<string>()
  return candidates
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    .map((album) => ({ album, score: summaryScore(m, album) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
}

/** Final score once the candidate's tracks are known: summary score weighted by track matching. */
export function fullScore(m: MissingAlbum, c: AlbumSummary, candidateTracks: Track[]): number {
  return summaryScore(m, c) * 0.4 + matchQuality(matchAlbums(m.tracks, candidateTracks)) * 0.6
}
