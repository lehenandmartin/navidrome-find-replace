import { describe, expect, it } from 'vitest'
import { computePlaylistChange, finalIds, firstDifference, sameIds, toReplacementMap } from '../src/core/diff'

const pl = (trackIds: string[]) => ({ id: 'p1', name: 'Mix', trackIds })
const map = (o: Record<string, string>) => new Map(Object.entries(o))

describe('computePlaylistChange', () => {
  it('returns null when nothing matches', () => {
    expect(computePlaylistChange(pl(['a', 'b']), map({ x: 'y' }))).toBeNull()
  })

  it('replaces in place and keeps the exact order', () => {
    const c = computePlaylistChange(pl(['a', 'o1', 'b', 'o2', 'o1']), map({ o1: 'n1', o2: 'n2' }))!
    expect(c.replacedIds).toEqual(['a', 'n1', 'b', 'n2', 'n1'])
    expect(c.occurrences).toEqual([
      { position: 2, oldId: 'o1', newId: 'n1' },
      { position: 4, oldId: 'o2', newId: 'n2' },
      { position: 5, oldId: 'o1', newId: 'n1' },
    ])
    expect(c.duplicateIds).toEqual([])
    expect(c.dedupedIds).toEqual(c.replacedIds)
    expect(c.originalIds).toEqual(['a', 'o1', 'b', 'o2', 'o1'])
  })

  it('detects duplicates with tracks already present, and dedupes only introduced entries', () => {
    const c = computePlaylistChange(pl(['n1', 'x', 'o1', 'x']), map({ o1: 'n1' }))!
    expect(c.duplicateIds).toEqual(['n1'])
    expect(c.replacedIds).toEqual(['n1', 'x', 'n1', 'x'])
    // the user's own duplicate of "x" is kept
    expect(c.dedupedIds).toEqual(['n1', 'x', 'x'])
    expect(finalIds(c, true)).toEqual(c.dedupedIds)
    expect(finalIds(c, false)).toEqual(c.replacedIds)
  })

  it('does not count two replaced entries of the same track as a duplicate', () => {
    const c = computePlaylistChange(pl(['o1', 'o1']), map({ o1: 'n1' }))!
    expect(c.duplicateIds).toEqual([])
  })

  it('ignores identity mappings', () => {
    expect(computePlaylistChange(pl(['a']), map({ a: 'a' }))).toBeNull()
  })
})

describe('toReplacementMap', () => {
  it('rejects one old track mapped to two targets', () => {
    expect(() =>
      toReplacementMap([
        { old: { id: 'a' }, new: { id: 'b' } },
        { old: { id: 'a' }, new: { id: 'c' } },
      ]),
    ).toThrow(/two different targets/)
  })
  it('accepts repeated identical pairs and drops identities', () => {
    const m = toReplacementMap([
      { old: { id: 'a' }, new: { id: 'b' } },
      { old: { id: 'a' }, new: { id: 'b' } },
      { old: { id: 'c' }, new: { id: 'c' } },
    ])
    expect([...m]).toEqual([['a', 'b']])
  })
})

describe('sameIds / firstDifference', () => {
  it('compares order-sensitively', () => {
    expect(sameIds(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(sameIds(['a', 'b'], ['b', 'a'])).toBe(false)
    expect(firstDifference(['a', 'b'], ['a', 'c'])).toBe(1)
    expect(firstDifference(['a'], ['a', 'b'])).toBe(1)
    expect(firstDifference(['a'], ['a'])).toBe(-1)
  })
})
