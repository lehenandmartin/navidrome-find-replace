import { describe, expect, it } from 'vitest'
import { buildFixCommands, shellQuote } from '../src/core/commands'
import { isMixedContent, subsonicError } from '../src/core/errors'
import { trackFromNative, trackFromSubsonic } from '../src/core/mappers'
import { mapLimit } from '../src/core/pool'
import { candidateQuery, fullScore, groupMissingByAlbum, rankCandidates } from '../src/core/suggest'
import { album, track } from './helpers'

describe('groupMissingByAlbum', () => {
  it('groups by album id, sorts tracks and puts big albums first', () => {
    const groups = groupMissingByAlbum([
      track({ id: '1', title: 'B', albumId: 'x', album: 'X', trackNumber: 2 }),
      track({ id: '2', title: 'S', albumId: 'y', album: 'Y' }),
      track({ id: '3', title: 'A', albumId: 'x', album: 'X', trackNumber: 1 }),
    ])
    expect(groups.map((g) => [g.albumId, g.tracks.map((t) => t.id)])).toEqual([
      ['x', ['3', '1']],
      ['y', ['2']],
    ])
  })
})

describe('candidate ranking', () => {
  const missing = groupMissingByAlbum(album('o', ['One', 'Two', 'Three'], { album: 'Great Album', artist: 'The Band', missing: true }))[0]

  it('builds a search query without edition noise', () => {
    expect(candidateQuery({ ...missing, album: 'Great Album (Deluxe Edition)' })).toBe('great album')
  })

  it('ranks the remaster first and drops unrelated or same albums', () => {
    const ranked = rankCandidates(missing, [
      { id: 'o', name: 'Great Album', artist: 'The Band', songCount: 3 },
      { id: 'r', name: 'Great Album (2023 Remaster)', artist: 'Band', songCount: 3 },
      { id: 'd', name: 'Great Album (Deluxe)', artist: 'The Band', songCount: 2 },
      { id: 'z', name: 'Other Record', artist: 'Someone Else', songCount: 3 },
      { id: 'r', name: 'Great Album (2023 Remaster)', artist: 'Band', songCount: 3 },
    ])
    expect(ranked.map((r) => r.album.id)).toEqual(['r', 'd'])
  })

  it('uses track matching in the full score', () => {
    const c = { id: 'r', name: 'Great Album', artist: 'The Band', songCount: 3 }
    const good = fullScore(missing, c, album('n', ['One', 'Two', 'Three']))
    const bad = fullScore(missing, c, album('n', ['Foo', 'Bar', 'Baz']))
    expect(good).toBeGreaterThan(bad)
    expect(good).toBeCloseTo(1)
  })
})

describe('buildFixCommands', () => {
  const o = (id: string, missing = true) => track({ id, title: 'T', missing })
  const n = (id: string) => track({ id, title: 'T', album: 'New' })

  it('emits one command per valid pair, with the warning header', () => {
    const r = buildFixCommands([{ old: o('m1'), new: n('t1') }], { prefix: 'docker exec navidrome', now: new Date(0) })
    expect(r.commandCount).toBe(1)
    expect(r.script).toContain('docker exec navidrome navidrome missing fix m1 t1')
    expect(r.script).toContain('IRREVERSIBLE')
    expect(r.script).toContain('docker exec navidrome navidrome backup create')
  })

  it('skips non-missing sources and reused targets', () => {
    const r = buildFixCommands([
      { old: o('m1', false), new: n('t1') },
      { old: o('m2'), new: n('t2') },
      { old: o('m3'), new: n('t2') },
      { old: o('m2'), new: n('t3') },
    ])
    expect(r.commandCount).toBe(1)
    expect(r.skipped.map((s) => s.reason)).toEqual([
      expect.stringMatching(/not flagged as missing/),
      expect.stringMatching(/already used as a target/),
      expect.stringMatching(/already used in another/),
    ])
  })

  it('quotes unusual ids', () => {
    expect(shellQuote('abc123')).toBe('abc123')
    expect(shellQuote("it's")).toBe(`'it'\\''s'`)
  })
})

describe('errors', () => {
  it('detects mixed content but allows localhost', () => {
    expect(isMixedContent('https:', 'http://192.168.1.2:4533')).toBe(true)
    expect(isMixedContent('https:', 'http://localhost:4533')).toBe(false)
    expect(isMixedContent('https:', 'https://x')).toBe(false)
    expect(isMixedContent('http:', 'http://x')).toBe(false)
  })
  it('maps Subsonic codes', () => {
    expect(subsonicError(40, 'Wrong').kind).toBe('bad-credentials')
    expect(subsonicError(70, '').kind).toBe('not-found')
    expect(subsonicError(0, 'x').kind).toBe('server')
  })
})

describe('mappers', () => {
  it('reads a native playlist track, keeping the media file id and missing flag', () => {
    const t = trackFromNative({ id: '3', mediaFileId: 'mf1', playlistId: 'p', title: 'T', albumId: 'al', discNumber: 0, trackNumber: 4, missing: true })
    expect(t).toMatchObject({ id: 'mf1', discNumber: 1, trackNumber: 4, missing: true, coverArt: 'al-al' })
  })
  it('reads a Subsonic child', () => {
    expect(trackFromSubsonic({ id: 's', title: 'T', track: 2, discNumber: 2, suffix: 'flac' })).toMatchObject({ id: 's', trackNumber: 2, discNumber: 2, suffix: 'flac' })
  })
})

describe('mapLimit', () => {
  it('keeps order, limits concurrency and isolates failures', async () => {
    let inFlight = 0
    let peak = 0
    const progress: number[] = []
    const res = await mapLimit(
      [1, 2, 3, 4, 5],
      2,
      async (x) => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await new Promise((r) => setTimeout(r, 5))
        inFlight--
        if (x === 3) throw new Error('three')
        return x * 10
      },
      (d) => progress.push(d),
    )
    expect(peak).toBe(2)
    expect(res.map((r) => (r.status === 'fulfilled' ? r.value : 'err'))).toEqual([10, 20, 'err', 40, 50])
    expect(progress).toEqual([0, 1, 2, 3, 4, 5])
  })
})
