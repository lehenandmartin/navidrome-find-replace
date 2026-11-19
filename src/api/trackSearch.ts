import { normalizeTitle } from '../core/normalize'
import { mapLimit } from '../core/pool'
import { matchAcrossAlbums, type AlbumInfo, type MultiMatch } from '../core/trackmatch'
import type { Track } from '../core/types'
import type { Navidrome } from './client'

const SONGS_PER_SEARCH = 30

/** Search terms for one track: its title without edition noise, plus the artist to narrow it down. */
function queries(t: Track): string[] {
  const title = normalizeTitle(t.title) || t.title
  const artist = t.albumArtist || t.artist
  return [...new Set([artist ? `${title} ${artist}` : title, title])]
}

/**
 * Look for every track of `oldTracks` anywhere in the library, and pair each with its best
 * version (studio over live and compilation, closest duration…).
 */
export async function findAcrossLibrary(
  client: Navidrome,
  oldTracks: Track[],
  oldAlbumId?: string,
  onProgress?: (done: number, total: number) => void,
): Promise<MultiMatch> {
  const found = new Map<string, Track[]>()
  await mapLimit(
    oldTracks,
    3,
    async (t) => {
      const results: Track[] = []
      for (const q of queries(t)) {
        results.push(...(await client.search(q, { albums: 0, songs: SONGS_PER_SEARCH })).songs)
        // The artist-narrowed query is enough when it found something.
        if (results.length) break
      }
      found.set(t.id, results)
    },
    onProgress,
  )

  const albumIds = new Set([...found.values()].flat().map((t) => t.albumId))
  if (oldAlbumId) albumIds.add(oldAlbumId)
  const albums = new Map<string, AlbumInfo>()
  await mapLimit([...albumIds], 4, async (id) => {
    albums.set(id, await client.albumInfo(id))
  })
  return matchAcrossAlbums(oldTracks, found, albums, oldAlbumId ? albums.get(oldAlbumId) : undefined)
}
