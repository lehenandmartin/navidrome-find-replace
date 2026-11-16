import type { PlaylistContent } from './types'

export interface Occurrence {
  /** 1-based position in the original playlist. */
  position: number
  oldId: string
  newId: string
}

export interface PlaylistChange {
  playlistId: string
  name: string
  originalIds: string[]
  occurrences: Occurrence[]
  /**
   * New track ids that were already in the playlist before the change.
   * Replacing would create duplicates of these.
   */
  duplicateIds: string[]
  /** Final list without deduplication. */
  replacedIds: string[]
  /** Final list with the replaced entries that would duplicate an existing track removed. */
  dedupedIds: string[]
}

/** Map old id → new id. Identity mappings are ignored. */
export type ReplacementMap = ReadonlyMap<string, string>

export function toReplacementMap(pairs: { old: { id: string }; new: { id: string } }[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const p of pairs) {
    if (p.old.id === p.new.id) continue
    const prev = map.get(p.old.id)
    if (prev !== undefined && prev !== p.new.id) {
      throw new Error(`Track ${p.old.id} is mapped to two different targets (${prev} and ${p.new.id})`)
    }
    map.set(p.old.id, p.new.id)
  }
  return map
}

/**
 * Compute what a playlist becomes once the replacements are applied. Order is kept exactly:
 * each replaced entry stays at its position. Returns null when the playlist is not affected.
 */
export function computePlaylistChange(content: PlaylistContent, map: ReplacementMap): PlaylistChange | null {
  const occurrences: Occurrence[] = []
  const replacedIds = content.trackIds.map((id, i) => {
    const target = map.get(id)
    if (target === undefined || target === id) return id
    occurrences.push({ position: i + 1, oldId: id, newId: target })
    return target
  })
  if (occurrences.length === 0) return null

  // Ids present before the change, excluding entries that get replaced away.
  const replacedPositions = new Set(occurrences.map((o) => o.position))
  const preexisting = new Set(content.trackIds.filter((_, i) => !replacedPositions.has(i + 1)))
  const duplicateIds = [...new Set(occurrences.map((o) => o.newId).filter((id) => preexisting.has(id)))]

  // Dedup only touches entries we introduce: user-made duplicates are left alone.
  const dup = new Set(duplicateIds)
  const dedupedIds = replacedIds.filter((id, i) => !(replacedPositions.has(i + 1) && dup.has(id)))

  return {
    playlistId: content.id,
    name: content.name,
    originalIds: [...content.trackIds],
    occurrences,
    duplicateIds,
    replacedIds,
    dedupedIds,
  }
}

export function finalIds(change: PlaylistChange, dedupe: boolean): string[] {
  return dedupe ? change.dedupedIds : change.replacedIds
}

export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

/** First position where two lists differ, or -1. Used to explain verification failures. */
export function firstDifference(a: readonly string[], b: readonly string[]): number {
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i
  return -1
}
