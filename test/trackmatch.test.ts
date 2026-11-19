import { describe, expect, it } from 'vitest'
import {
  candidatesFor,
  coverage,
  isCompilation,
  isLiveAlbum,
  isLiveTitle,
  isLiveTrack,
  matchAcrossAlbums,
  rankCandidates,
  type AlbumInfo,
} from '../src/core/trackmatch'
import type { Track } from '../src/core/types'

let seq = 0
const tr = (title: string, albumId: string, extra: Partial<Track> = {}): Track => ({
  id: `${albumId}-${++seq}`,
  title,
  album: albumId,
  albumId,
  artist: 'Madonna',
  discNumber: 1,
  trackNumber: 1,
  duration: 300,
  ...extra,
})

const albums = new Map<string, AlbumInfo>([
  ['like-a-prayer', { id: 'like-a-prayer', name: 'Like a Prayer', releaseTypes: ['album'] }],
  ['true-blue', { id: 'true-blue', name: 'True Blue', releaseTypes: ['album'] }],
  ['celebration', { id: 'celebration', name: 'Celebration', releaseTypes: ['album', 'compilation'], compilation: true }],
  ['immaculate', { id: 'immaculate', name: 'The Immaculate Collection', releaseTypes: ['album', 'compilation'] }],
  ['blond-ambition', { id: 'blond-ambition', name: 'Blond Ambition World Tour', releaseTypes: ['album', 'live'] }],
  ['untagged-live', { id: 'untagged-live', name: 'Live at Wembley' }],
])

describe('live and compilation detection', () => {
  it('uses release types first', () => {
    expect(isLiveAlbum(albums.get('blond-ambition'))).toBe(true)
    expect(isLiveAlbum(albums.get('like-a-prayer'))).toBe(false)
    expect(isCompilation(albums.get('celebration'))).toBe(true)
    expect(isCompilation(albums.get('immaculate'))).toBe(true)
    expect(isCompilation(albums.get('true-blue'))).toBe(false)
  })

  it('falls back to the album name', () => {
    expect(isLiveAlbum({ name: 'Live at Wembley' })).toBe(true)
    expect(isLiveAlbum({ name: 'MTV Unplugged in New York' })).toBe(true)
    expect(isLiveAlbum({ name: 'The Concert in Central Park' })).toBe(true)
    expect(isLiveAlbum({ name: 'Greatest Hits (Live)' })).toBe(true)
    expect(isLiveAlbum({ name: 'Live' })).toBe(true)
  })

  it('does not take a studio album called "Live …" for a live one when tags say otherwise', () => {
    expect(isLiveAlbum({ name: 'Live Through This', releaseTypes: ['album'] })).toBe(false)
    expect(isLiveAlbum({ name: 'Live at Leeds', releaseTypes: ['album'] })).toBe(true)
  })

  it('detects live titles but not songs whose name starts with Live', () => {
    expect(isLiveTitle('Like a Prayer (Live)')).toBe(true)
    expect(isLiveTitle('Vogue [Live at Wembley 1990]')).toBe(true)
    expect(isLiveTitle('Holiday - Live 1987')).toBe(true)
    expect(isLiveTitle('Live to Tell')).toBe(false)
    expect(isLiveTitle('Like a Prayer')).toBe(false)
  })

  it('combines title and album', () => {
    expect(isLiveTrack(tr('Vogue', 'blond-ambition'), albums.get('blond-ambition'))).toBe(true)
    expect(isLiveTrack(tr('Vogue', 'x', { album: 'Live at Wembley' }))).toBe(true)
    expect(isLiveTrack(tr('Vogue', 'celebration'), albums.get('celebration'))).toBe(false)
  })
})

describe('candidatesFor', () => {
  const old = tr('Like a Prayer', 'celebration', { duration: 341 })

  it('keeps same-artist tracks with a matching title, from other albums', () => {
    const found = [
      tr('Like a Prayer', 'like-a-prayer', { duration: 351 }),
      tr('Like a Prayer (2009 Remaster)', 'immaculate'),
      tr('Like a Prayer', 'other', { artist: 'Someone Else' }),
      tr('Express Yourself', 'like-a-prayer'),
      tr('Like a Prayer', 'celebration'), // same album as the old track
      tr('Like a Prayer', 'true-blue', { missing: true }),
    ]
    const c = candidatesFor(old, found, albums)
    expect(c.map((x) => x.track.albumId)).toEqual(['like-a-prayer', 'immaculate'])
    expect(c[0]).toMatchObject({ exactTitle: true, live: false, compilation: false, durationDelta: 10 })
    expect(c[1]).toMatchObject({ exactTitle: true, compilation: true })
  })

  it('matches on album artist too (compilation tracks credited "feat.")', () => {
    const o = tr('4 Minutes', 'hard-candy', { artist: 'Madonna feat. Justin Timberlake', albumArtist: 'Madonna' })
    const c = candidatesFor(o, [tr('4 Minutes', 'celebration', { artist: 'Madonna', albumArtist: 'Madonna' })], albums)
    expect(c).toHaveLength(1)
  })
})

describe('rankCandidates', () => {
  const studio = { track: tr('Vogue', 'true-blue'), live: false, compilation: false, exactTitle: true, durationDelta: 1 }
  const comp = { track: tr('Vogue', 'celebration'), live: false, compilation: true, exactTitle: true, durationDelta: 1 }
  const live = { track: tr('Vogue', 'blond-ambition'), live: true, compilation: false, exactTitle: true, durationDelta: 0 }
  const edit = { track: tr('Vogue', 'immaculate'), live: false, compilation: true, exactTitle: true, durationDelta: 60 }

  it('avoids live versions for a studio track', () => {
    expect(rankCandidates([live, comp], false)[0]).toBe(comp)
  })
  it('prefers live versions for a live track', () => {
    expect(rankCandidates([studio, live], true)[0]).toBe(live)
  })
  it('prefers studio over compilation when both fit', () => {
    expect(rankCandidates([comp, studio], false)[0]).toBe(studio)
  })
  it('prefers the closest duration over studio-vs-compilation', () => {
    const studioEdit = { ...studio, durationDelta: 60 }
    expect(rankCandidates([studioEdit, comp], false)[0]).toBe(comp)
    expect(rankCandidates([edit, comp], false)[0]).toBe(comp)
  })
  it('breaks ties with the album that supplies the most tracks', () => {
    const a = { ...studio, track: tr('Vogue', 'a') }
    const b = { ...studio, track: tr('Vogue', 'b') }
    expect(rankCandidates([a, b], false, new Map([['b', 5], ['a', 1]]))[0]).toBe(b)
  })
})

describe('matchAcrossAlbums', () => {
  it('replaces a compilation with tracks from several studio albums', () => {
    const old = [
      tr('Like a Prayer', 'celebration', { duration: 341 }),
      tr('Papa Don’t Preach', 'celebration', { duration: 270 }),
      tr('Vogue', 'celebration', { duration: 300 }),
      tr('Hung Up', 'celebration', { duration: 337 }),
    ]
    const lap = tr('Like a Prayer', 'like-a-prayer', { duration: 351 })
    const lapLive = tr('Like a Prayer', 'blond-ambition', { duration: 342 })
    const pdp = tr('Papa Don’t Preach', 'true-blue', { duration: 269 })
    const vogueLive = tr('Vogue', 'blond-ambition', { duration: 300 })
    const found = new Map([
      [old[0].id, [lapLive, lap]],
      [old[1].id, [pdp]],
      [old[2].id, [vogueLive]],
      [old[3].id, []],
    ])
    const m = matchAcrossAlbums(old, found, albums, albums.get('celebration'))
    expect(m.pairs.map((p) => [p.new?.id, p.status, p.reason?.code])).toEqual([
      [lap.id, 'ok', undefined], // studio wins over the closer live version
      [pdp.id, 'ok', undefined],
      [vogueLive.id, 'uncertain', 'live'], // only a live version exists
      [undefined, 'unmatched', 'none'],
    ])
    expect(m.candidates.get(old[0].id)!.map((c) => c.track.id)).toEqual([lap.id, lapLive.id])
    expect(coverage(m.pairs)).toEqual({ found: 3, total: 4, albums: 3 })
  })

  it('replaces a studio album with a compilation, flagging different durations', () => {
    const old = [tr('Like a Prayer', 'like-a-prayer', { duration: 351 }), tr('Express Yourself', 'like-a-prayer', { duration: 279 })]
    const lap = tr('Like a Prayer', 'immaculate', { duration: 347 })
    const ey = tr('Express Yourself', 'immaculate', { duration: 240 })
    const m = matchAcrossAlbums(old, new Map([[old[0].id, [lap]], [old[1].id, [ey]]]), albums)
    expect(m.pairs.map((p) => [p.status, p.reason])).toEqual([
      ['ok', undefined],
      ['uncertain', { code: 'duration', seconds: 39 }],
    ])
  })
})
