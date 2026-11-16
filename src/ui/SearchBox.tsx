import { useEffect, useRef, useState } from 'preact/hooks'
import type { Navidrome } from '../api/client'
import { formatDuration, formatsOf, trackFromNative } from '../core/mappers'
import { mapLimit } from '../core/pool'
import type { AlbumSummary, Track } from '../core/types'
import { Badge, Cover, useDebounced } from './util'

type Kind = 'album' | 'song'
type Result = { kind: 'album'; album: AlbumSummary } | { kind: 'song'; track: Track }

const formatCache = new Map<string, string[]>()

interface Props {
  client: Navidrome
  kind: Kind
  label: string
  /** Also look for missing albums/songs (native API only). */
  includeMissing?: boolean
  onPick: (r: Result) => void
}

/** Debounced autocomplete over search3 (plus missing items from the native API). */
export function SearchBox({ client, kind, label, includeMissing, onPick }: Props) {
  const [q, setQ] = useState('')
  const debounced = useDebounced(q.trim(), 300)
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [, setTick] = useState(0)
  const reqId = useRef(0)
  const listId = useRef(`sb-${Math.random().toString(36).slice(2)}`).current

  useEffect(() => {
    if (debounced.length < 2) {
      setResults([])
      return
    }
    const id = ++reqId.current
    setLoading(true)
    ;(async () => {
      const out: Result[] = []
      const tasks: Promise<void>[] = [
        client.search(debounced, kind === 'album' ? { albums: 10, songs: 0 } : { albums: 0, songs: 12 }).then((r) => {
          if (kind === 'album') out.push(...r.albums.map((album): Result => ({ kind: 'album', album })))
          else out.push(...r.songs.map((track): Result => ({ kind: 'song', track })))
        }),
      ]
      if (includeMissing && client.hasNative) {
        tasks.push(
          (kind === 'album'
            ? client.searchMissingAlbums(debounced).then((as) => as.map((album): Result => ({ kind: 'album', album })))
            : client
                .native('/api/song', { start: 0, end: 8, sort: 'title', order: 'ASC', filters: { title: debounced, missing: true } })
                .then(({ data }) => (data as Record<string, unknown>[]).map((r): Result => ({ kind: 'song', track: trackFromNative(r) })))
          )
            .then((rs) => void out.push(...rs))
            .catch(() => undefined),
        )
      }
      await Promise.allSettled(tasks)
      if (id !== reqId.current) return
      setResults(out)
      setOpen(true)
      setActive(-1)
      setLoading(false)
      // Album formats are not in search results: fetch them in the background.
      if (kind === 'album') {
        const todo = out.flatMap((r) => (r.kind === 'album' && !formatCache.has(r.album.id) ? [r.album.id] : []))
        await mapLimit(todo, 3, async (albumId) => {
          formatCache.set(albumId, formatsOf(await client.albumTracks(albumId)))
          if (id === reqId.current) setTick((t) => t + 1)
        })
      }
    })().catch(() => {
      if (id === reqId.current) setLoading(false)
    })
  }, [debounced, kind, includeMissing, client])

  function pick(r: Result) {
    setOpen(false)
    setQ('')
    setResults([])
    onPick(r)
  }

  function onKey(e: KeyboardEvent) {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(results.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      pick(results[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div class="search">
      <label>
        {label}
        <input
          type="search"
          value={q}
          placeholder={kind === 'album' ? 'Album or artist name…' : 'Track title or artist…'}
          onInput={(e) => setQ(e.currentTarget.value)}
          onKeyDown={onKey}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
        />
      </label>
      {loading && <span class="search-spinner" aria-label="Searching" />}
      {open && (
        <ul class="search-results" id={listId} role="listbox">
          {results.length === 0 && <li class="search-empty">No results</li>}
          {results.map((r, i) => (
            <li
              key={(r.kind === 'album' ? r.album.id : r.track.id) + i}
              role="option"
              aria-selected={i === active}
              class={i === active ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(r)
              }}
            >
              {r.kind === 'album' ? <AlbumRow client={client} album={r.album} /> : <SongRow client={client} track={r.track} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AlbumRow({ client, album }: { client: Navidrome; album: AlbumSummary }) {
  const formats = album.formats ?? formatCache.get(album.id)
  return (
    <div class="media-row">
      <Cover client={client} id={album.coverArt} size={40} />
      <div class="media-text">
        <div class="media-title">
          {album.name} {album.missing && <Badge kind="error">missing</Badge>}
        </div>
        <div class="media-sub">
          {[album.artist, album.year, `${album.songCount} tracks`, formats?.join(' / ')].filter(Boolean).join(' · ')}
        </div>
      </div>
    </div>
  )
}

function SongRow({ client, track }: { client: Navidrome; track: Track }) {
  return (
    <div class="media-row">
      <Cover client={client} id={track.coverArt} size={40} />
      <div class="media-text">
        <div class="media-title">
          {track.title} {track.missing && <Badge kind="error">missing</Badge>}
        </div>
        <div class="media-sub">
          {[track.artist, track.album, track.year, track.suffix?.toUpperCase(), formatDuration(track.duration)].filter(Boolean).join(' · ')}
        </div>
      </div>
    </div>
  )
}

export function AlbumCard({ client, album, onClear }: { client: Navidrome; album: AlbumSummary; onClear?: () => void }) {
  return (
    <div class="picked">
      <AlbumRow client={client} album={album} />
      {onClear && (
        <button type="button" class="link" onClick={onClear}>
          Change
        </button>
      )}
    </div>
  )
}

export function TrackCard({ client, track, onClear }: { client: Navidrome; track: Track; onClear?: () => void }) {
  return (
    <div class="picked">
      <SongRow client={client} track={track} />
      {onClear && (
        <button type="button" class="link" onClick={onClear}>
          Change
        </button>
      )}
    </div>
  )
}
