import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import type { Navidrome } from '../api/client'
import { describeError } from '../core/errors'
import { mapLimit } from '../core/pool'
import { candidateQuery, fullScore, groupMissingByAlbum, rankCandidates, type MissingAlbum } from '../core/suggest'
import type { AlbumSummary } from '../core/types'
import type { AlbumPrefill } from './AlbumMode'
import { Badge, Cover, plural } from './util'

interface Candidate {
  album: AlbumSummary
  score: number
}

interface Row {
  missing: MissingAlbum
  state: 'searching' | 'done' | 'error'
  candidates: Candidate[]
}

export interface SuggestionsState {
  rows: Row[] | null
  loading: boolean
  error: unknown
  reload: () => void
}

/**
 * Loads albums with missing files, and a likely replacement for each, as soon as the
 * session allows it (admin + native API). Lives in App so it survives screen changes.
 */
export function useSuggestions(client: Navidrome, enabled: boolean): SuggestionsState {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const run = useRef(0)

  const reload = useCallback(async () => {
    const id = ++run.current
    setLoading(true)
    setError(null)
    try {
      const groups = groupMissingByAlbum(await client.missingTracks())
      let current: Row[] = groups.map((missing) => ({ missing, state: 'searching', candidates: [] }))
      if (id !== run.current) return
      setRows(current)
      await mapLimit(groups, 3, async (g, i) => {
        let patch: Partial<Row>
        try {
          patch = { state: 'done', candidates: await findCandidates(client, g) }
        } catch {
          patch = { state: 'error' }
        }
        if (id !== run.current) return
        current = current.map((r, j) => (j === i ? { ...r, ...patch } : r))
        setRows(current)
      })
    } catch (e) {
      if (id === run.current) setError(e)
    } finally {
      if (id === run.current) setLoading(false)
    }
  }, [client])

  useEffect(() => {
    if (enabled) reload()
    else setRows(null)
    return () => {
      run.current++
    }
  }, [enabled, reload])

  return { rows, loading, error, reload }
}

const COLLAPSED_COUNT = 3

/** Shown above the tabs. Renders nothing when there are no missing files. */
export function SuggestionsPanel({ client, state, onUse }: { client: Navidrome; state: SuggestionsState; onUse: (p: AlbumPrefill) => void }) {
  const [showAll, setShowAll] = useState(false)
  const [hidden, setHidden] = useState(false)
  const { rows, loading, error, reload } = state

  if (error) {
    return (
      <p class="fine">
        Could not load suggestions from missing files: {describeError(error).message}{' '}
        <button class="link" onClick={reload}>
          Retry
        </button>
      </p>
    )
  }
  if (!rows) return loading ? <p class="fine">Checking for missing files…</p> : null
  if (rows.length === 0) return null

  const visible = showAll ? rows : rows.slice(0, COLLAPSED_COUNT)
  return (
    <section class="card suggest-panel stack" aria-label="Suggestions">
      <div class="row-between">
        <div>
          <strong>Suggestions</strong>{' '}
          <Badge kind="warn">{plural(rows.length, 'album')} with missing files</Badge>
          {loading && <span class="dim small"> · looking for replacements…</span>}
        </div>
        <div class="actions">
          <button class="link" onClick={reload} disabled={loading}>
            Refresh
          </button>
          <button class="link" onClick={() => setHidden(!hidden)} aria-expanded={!hidden}>
            {hidden ? 'Show' : 'Hide'}
          </button>
        </div>
      </div>
      {!hidden && (
        <>
          <ul class="suggestions">
            {visible.map((r) => (
              <SuggestionRow key={r.missing.albumId || r.missing.album} client={client} row={r} onUse={onUse} />
            ))}
          </ul>
          {rows.length > COLLAPSED_COUNT && (
            <button class="link" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer' : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </section>
  )
}

function SuggestionRow({ client, row, onUse }: { client: Navidrome; row: Row; onUse: (p: AlbumPrefill) => void }) {
  const { missing } = row
  const [best, ...others] = row.candidates
  const oldAlbum: AlbumSummary = {
    id: missing.albumId,
    name: missing.album,
    artist: missing.artist,
    year: missing.year,
    songCount: missing.tracks.length,
    coverArt: missing.albumId ? `al-${missing.albumId}` : undefined,
    missing: true,
  }
  const use = (c?: Candidate) => onUse({ oldAlbum, oldTracks: missing.tracks, newAlbum: c?.album })

  return (
    <li class="suggestion">
      <div class="media-row">
        <Cover client={client} id={oldAlbum.coverArt} size={40} />
        <div class="media-text">
          <div class="media-title">
            {missing.album || '(no album)'} <span class="dim small">{plural(missing.tracks.length, 'missing track')}</span>
          </div>
          <div class="media-sub">
            {[missing.artist, missing.year].filter(Boolean).join(' · ')}
            {row.state === 'searching' && ' · searching…'}
            {row.state === 'error' && ' · search failed'}
            {row.state === 'done' && !best && ' · no replacement found'}
            {best && (
              <>
                {' → '}
                <strong>{best.album.name}</strong>
                {best.album.year ? ` (${best.album.year})` : ''}{' '}
                <Badge kind={best.score > 0.8 ? 'ok' : 'warn'}>{Math.round(best.score * 100)}%</Badge>
              </>
            )}
          </div>
          {others.length > 0 && (
            <details class="small">
              <summary>{plural(others.length, 'other candidate')}</summary>
              <ul class="plain">
                {others.map((c) => (
                  <li key={c.album.id}>
                    <button class="link" onClick={() => use(c)}>
                      {c.album.name}
                    </button>{' '}
                    <span class="dim">
                      {[c.album.artist, c.album.year, `${Math.round(c.score * 100)}%`].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
      <button onClick={() => use(best)} disabled={row.state === 'searching'}>
        {best ? 'Use' : 'Pick by hand'}
      </button>
    </li>
  )
}

async function findCandidates(client: Navidrome, m: MissingAlbum): Promise<Candidate[]> {
  const queries = [...new Set([`${candidateQuery(m)} ${m.artist}`.trim(), candidateQuery(m)])]
  const found: AlbumSummary[] = []
  for (const q of queries) found.push(...(await client.search(q, { albums: 15, songs: 0 })).albums)
  const top = rankCandidates(m, found).slice(0, 3)
  const scored = await mapLimit(top, 2, async (c) => ({ album: c.album, score: fullScore(m, c.album, await client.albumTracks(c.album.id)) }))
  return scored
    .flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []))
    .filter((c) => c.score > 0.3)
    .sort((a, b) => b.score - a.score)
}
