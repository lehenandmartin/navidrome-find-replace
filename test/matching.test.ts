import { describe, expect, it } from 'vitest'
import { activePairs, matchAlbums, matchQuality, overridePair } from '../src/core/matching'
import { album, track } from './helpers'

describe('matchAlbums', () => {
  it('pairs by disc and track number when titles agree', () => {
    const old = album('o', ['One', 'Two', 'Three'])
    const neu = album('n', ['One (2011 Remaster)', 'Two - Remastered', 'Three'])
    const m = matchAlbums(old, neu)
    expect(m.pairs.map((p) => [p.old.id, p.new?.id, p.status])).toEqual([
      ['o1', 'n1', 'ok'],
      ['o2', 'n2', 'ok'],
      ['o3', 'n3', 'ok'],
    ])
    expect(m.unusedNew).toEqual([])
    expect(matchQuality(m)).toBe(1)
  })

  it('falls back to title when positions shift, and flags it', () => {
    const old = album('o', ['One', 'Two', 'Three'])
    const neu = album('n', ['Intro', 'One', 'Two', 'Three'])
    const m = matchAlbums(old, neu)
    expect(m.pairs.map((p) => [p.new?.id, p.status])).toEqual([
      ['n2', 'uncertain'],
      ['n3', 'uncertain'],
      ['n4', 'uncertain'],
    ])
    expect(m.pairs[0].reason).toEqual({ code: 'position', d1: 1, t1: 1, d2: 1, t2: 2 })
    expect(m.unusedNew.map((t) => t.id)).toEqual(['n1'])
  })

  it('pairs by position with a warning when the title differs', () => {
    const old = album('o', ['One', 'Two'])
    const neu = album('n', ['One', 'Totally Different'])
    const m = matchAlbums(old, neu)
    expect(m.pairs[1]).toMatchObject({ status: 'uncertain', reason: { code: 'title' } })
    expect(m.pairs[1].new?.id).toBe('n2')
  })

  it('reports tracks that have no counterpart', () => {
    const old = album('o', ['One', 'Two', 'Three'])
    const neu = album('n', ['One', 'Two'])
    const m = matchAlbums(old, neu)
    expect(m.pairs[2]).toMatchObject({ status: 'unmatched', new: null })
    expect(matchQuality(m)).toBeCloseTo(2 / 3)
  })

  it('handles multi-disc releases and treats disc 0 as disc 1', () => {
    const old = [
      track({ id: 'a', title: 'A', discNumber: 0, trackNumber: 1 }),
      track({ id: 'b', title: 'B', discNumber: 2, trackNumber: 1 }),
    ]
    const neu = [
      track({ id: 'x', title: 'B', discNumber: 2, trackNumber: 1 }),
      track({ id: 'y', title: 'A', discNumber: 1, trackNumber: 1 }),
    ]
    const m = matchAlbums(old, neu)
    expect(m.pairs.map((p) => [p.old.id, p.new?.id, p.status])).toEqual([
      ['a', 'y', 'ok'],
      ['b', 'x', 'ok'],
    ])
  })

  it('never uses a new track twice', () => {
    const old = album('o', ['Same', 'Same'])
    const neu = album('n', ['Same'])
    const m = matchAlbums(old, neu)
    const used = m.pairs.map((p) => p.new?.id).filter(Boolean)
    expect(new Set(used).size).toBe(used.length)
    expect(m.pairs[1].status).toBe('unmatched')
  })

  it('does not pair a live version with the studio one', () => {
    const old = album('o', ['Song'])
    const neu = [track({ id: 'n1', title: 'Song (Live)', trackNumber: 5 })]
    expect(matchAlbums(old, neu).pairs[0].status).toBe('unmatched')
  })
})

describe('overridePair / activePairs', () => {
  it('lets the user pick a target or skip', () => {
    const [o] = album('o', ['One'])
    const [n] = album('n', ['Other'])
    const base = matchAlbums([o], []).pairs[0]
    const manual = overridePair(base, n)
    expect(manual.status).toBe('manual')
    expect(activePairs([manual])).toEqual([{ old: o, new: n }])
    const skipped = overridePair(manual, null)
    expect(skipped.status).toBe('skipped')
    expect(activePairs([skipped])).toEqual([])
  })

  it('ignores unmatched pairs and identity pairs', () => {
    const [o] = album('o', ['One'])
    expect(activePairs([{ old: o, new: null, status: 'unmatched' }])).toEqual([])
    expect(activePairs([{ old: o, new: o, status: 'manual' }])).toEqual([])
  })
})
