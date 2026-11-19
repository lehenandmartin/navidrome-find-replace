import { normalizeTitle, similarity } from './normalize'
import type { Track } from './types'

/** Title similarity at or above which two titles are considered the same song. */
export const TITLE_MATCH_THRESHOLD = 0.85

export type PairStatus =
  /** Same disc and track number, and the titles agree. */
  | 'ok'
  /** Paired, but something disagrees (title, or position). The user should check it. */
  | 'uncertain'
  /** No candidate found in the new release. */
  | 'unmatched'
  /** Chosen by hand. */
  | 'manual'
  /** Explicitly excluded by the user. */
  | 'skipped'

/** Why a pair needs attention. Kept as data so the UI can translate it. */
export type PairReason =
  | { code: 'position'; d1: number; t1: number; d2: number; t2: number }
  | { code: 'title' }
  | { code: 'none' }
  | { code: 'skipped' }
  /** Only a live version was found (and the old track is not live). */
  | { code: 'live' }
  /** Durations differ by more than a few seconds (an edit or another mix?). */
  | { code: 'duration'; seconds: number }

export interface TrackPair {
  old: Track
  new: Track | null
  status: PairStatus
  /** Why the pair is uncertain, unmatched or skipped. */
  reason?: PairReason
  /** Title similarity between old and new, 0..1. */
  score?: number
}

export interface AlbumMatch {
  pairs: TrackPair[]
  /** Tracks of the new release that nothing was paired with (bonus tracks, usually). */
  unusedNew: Track[]
}

const disc = (t: Track) => (t.discNumber && t.discNumber > 0 ? t.discNumber : 1)
const posKey = (t: Track) => `${disc(t)}:${t.trackNumber ?? 0}`

export function sortTracks(tracks: Track[]): Track[] {
  return [...tracks].sort((a, b) => disc(a) - disc(b) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0) || a.title.localeCompare(b.title))
}

/**
 * Pair the tracks of an old release with those of a new one.
 *
 * 1. Same disc + track number and matching title → `ok`.
 * 2. Otherwise, best title match among the tracks still free → `uncertain` (position differs).
 * 3. Otherwise, same position with a differing title → `uncertain` (title differs).
 * 4. Otherwise → `unmatched`.
 */
export function matchAlbums(oldTracks: Track[], newTracks: Track[]): AlbumMatch {
  const olds = sortTracks(oldTracks)
  const news = sortTracks(newTracks)
  const used = new Set<string>()
  const byPos = new Map<string, Track>()
  for (const t of news) if (!byPos.has(posKey(t))) byPos.set(posKey(t), t)
  const norm = new Map<string, string>()
  const n = (t: Track) => {
    let v = norm.get(t.id)
    if (v === undefined) norm.set(t.id, (v = normalizeTitle(t.title)))
    return v
  }

  const result = new Map<string, TrackPair>()

  // Pass 1: exact position + title agreement.
  for (const o of olds) {
    const c = byPos.get(posKey(o))
    if (!c || used.has(c.id)) continue
    const score = similarity(n(o), n(c))
    if (score >= TITLE_MATCH_THRESHOLD) {
      used.add(c.id)
      result.set(o.id, { old: o, new: c, status: 'ok', score })
    }
  }

  // Pass 2: title match anywhere among the free tracks.
  for (const o of olds) {
    if (result.has(o.id)) continue
    let best: Track | null = null
    let bestScore = 0
    for (const c of news) {
      if (used.has(c.id)) continue
      const s = similarity(n(o), n(c))
      // Prefer the same disc when scores tie (e.g. a song present on two discs).
      if (s > bestScore || (s === bestScore && best && disc(c) === disc(o) && disc(best) !== disc(o))) {
        best = c
        bestScore = s
      }
    }
    if (best && bestScore >= TITLE_MATCH_THRESHOLD) {
      used.add(best.id)
      result.set(o.id, {
        old: o,
        new: best,
        status: 'uncertain',
        score: bestScore,
        reason: { code: 'position', d1: disc(o), t1: o.trackNumber, d2: disc(best), t2: best.trackNumber },
      })
    }
  }

  // Pass 3: same position, titles disagree.
  for (const o of olds) {
    if (result.has(o.id)) continue
    const c = byPos.get(posKey(o))
    if (c && !used.has(c.id)) {
      used.add(c.id)
      result.set(o.id, {
        old: o,
        new: c,
        status: 'uncertain',
        score: similarity(n(o), n(c)),
        reason: { code: 'title' },
      })
    } else {
      result.set(o.id, { old: o, new: null, status: 'unmatched', reason: { code: 'none' } })
    }
  }

  return {
    pairs: olds.map((o) => result.get(o.id)!),
    unusedNew: news.filter((t) => !used.has(t.id)),
  }
}

/** Pairs that will actually be applied. */
export function activePairs(pairs: TrackPair[]): { old: Track; new: Track }[] {
  return pairs
    .filter((p) => p.new && p.status !== 'skipped' && p.status !== 'unmatched' && p.old.id !== p.new.id)
    .map((p) => ({ old: p.old, new: p.new! }))
}

/** Change the target of a pair by hand. Passing null skips the pair. */
export function overridePair(pair: TrackPair, target: Track | null): TrackPair {
  if (!target) return { ...pair, new: null, status: 'skipped', reason: { code: 'skipped' }, score: undefined }
  return {
    ...pair,
    new: target,
    status: 'manual',
    reason: undefined,
    score: similarity(normalizeTitle(pair.old.title), normalizeTitle(target.title)),
  }
}

/** Fraction of old tracks that found a confident match: used to rank candidate releases. */
export function matchQuality(match: AlbumMatch): number {
  if (match.pairs.length === 0) return 0
  const pts = match.pairs.reduce((acc, p) => acc + (p.status === 'ok' ? 1 : p.status === 'uncertain' ? 0.5 : 0), 0)
  return pts / match.pairs.length
}
