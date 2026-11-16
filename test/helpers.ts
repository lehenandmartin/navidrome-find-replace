import type { Track } from '../src/core/types'

let seq = 0
export function track(p: Partial<Track> & { title: string }): Track {
  return {
    id: p.id ?? `t${++seq}`,
    album: 'Album',
    albumId: 'al1',
    artist: 'Artist',
    discNumber: 1,
    trackNumber: 1,
    ...p,
  }
}

/** Tracks numbered 1..n on disc 1 with the given titles. */
export function album(prefix: string, titles: string[], extra: Partial<Track> = {}): Track[] {
  return titles.map((title, i) => track({ id: `${prefix}${i + 1}`, title, trackNumber: i + 1, albumId: prefix, ...extra }))
}
