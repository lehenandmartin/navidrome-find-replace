import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import type { Navidrome } from '../api/client'
import { describeError } from '../core/errors'
import { mapLimit } from '../core/pool'
import { findAcrossLibrary } from '../api/trackSearch'
import { matchAlbums } from '../core/matching'
import { candidateQuery, fullScore, groupMissingByAlbum, rankCandidates, type MissingAlbum } from '../core/suggest'
import { coverage, type MultiMatch } from '../core/trackmatch'
import type { AlbumSummary } from '../core/types'
import type { AlbumPrefill } from './AlbumMode'
import { t, tn } from '../i18n'
import { Badge, Cover } from './util'

interface Candidate {
  album: AlbumSummary
  score: number
  /** Old tracks this album can replace. */
  found: number
}

/** Replacement found track by track, across several albums. */
interface TrackSuggestion {
  match: MultiMatch
  found: number
  total: number
  albums: string[]
}

interface Row {
  missing: MissingAlbum
  state: 'searching' | 'done' | 'error'
  candidates: Candidate[]
  tracks?: TrackSuggestion
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
          patch = { state: 'done', ...(await findCandidates(client, g)) }
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
        {t('sugg.loadError', { message: describeError(error).message })}{' '}
        <button class="link" onClick={reload}>
          {t('common.retry')}
        </button>
      </p>
    )
  }
  if (!rows) return loading ? <p class="fine">{t('sugg.checking')}</p> : null
  if (rows.length === 0) return null

  const visible = showAll ? rows : rows.slice(0, COLLAPSED_COUNT)
  return (
    <section class="card suggest-panel stack" aria-label={t('sugg.title')}>
      <div class="row-between">
        <div>
          <strong>{t('sugg.title')}</strong>{' '}
          <Badge kind="warn">{t('sugg.withMissing', { albums: tn('n.albums', rows.length) })}</Badge>
          {loading && <span class="dim small"> · {t('sugg.looking')}</span>}
        </div>
        <div class="actions">
          <button class="link" onClick={reload} disabled={loading}>
            {t('sugg.refresh')}
          </button>
          <button class="link" onClick={() => setHidden(!hidden)} aria-expanded={!hidden}>
            {hidden ? t('sugg.show') : t('sugg.hide')}
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
              {showAll ? t('sugg.showFewer') : t('sugg.showAll', { n: rows.length })}
            </button>
          )}
        </>
      )}
    </section>
  )
}

function SuggestionRow({ client, row, onUse }: { client: Navidrome; row: Row; onUse: (p: AlbumPrefill) => void }) {
  const { missing } = row
  const [bestAlbum, ...otherAlbums] = row.candidates
  // Track by track wins when it replaces more tracks than the best single album.
  const tracksFirst = !!row.tracks && row.tracks.found > (bestAlbum?.found ?? 0)
  const best = tracksFirst ? undefined : bestAlbum
  const others = tracksFirst ? row.candidates : otherAlbums
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
  const useTracks = () => onUse({ oldAlbum, oldTracks: missing.tracks, multi: row.tracks!.match })

  return (
    <li class="suggestion">
      <div class="media-row">
        <Cover client={client} id={oldAlbum.coverArt} size={40} />
        <div class="media-text">
          <div class="media-title">
            {missing.album || t('sugg.noAlbum')} <span class="dim small">{tn('n.missingTracks', missing.tracks.length)}</span>
          </div>
          <div class="media-sub">
            {[missing.artist, missing.year].filter(Boolean).join(' · ')}
            {row.state === 'searching' && ` · ${t('sugg.searching')}`}
            {row.state === 'error' && ` · ${t('sugg.failed')}`}
            {row.state === 'done' && !best && !tracksFirst && ` · ${t('sugg.none')}`}
            {tracksFirst && (
              <>
                {' → '}
                <strong>{t('sugg.tracksFrom', { albums: tn('n.albums', row.tracks!.albums.length) })}</strong>{' '}
                <Badge kind={row.tracks!.found === row.tracks!.total ? 'ok' : 'warn'}>
                  {row.tracks!.found}/{row.tracks!.total}
                </Badge>
                <div class="dim small">{row.tracks!.albums.join(', ')}</div>
              </>
            )}
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
              <summary>{tn('n.otherCandidates', others.length)}</summary>
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
      <button onClick={() => (tracksFirst ? useTracks() : use(best))} disabled={row.state === 'searching'}>
        {best || tracksFirst ? t('sugg.use') : t('sugg.pick')}
      </button>
    </li>
  )
}

/**
 * Replacement for one missing album: the best single albums first; when none of them
 * replaces every track cleanly, a track-by-track search across the whole library.
 */
async function findCandidates(client: Navidrome, m: MissingAlbum): Promise<Pick<Row, 'candidates' | 'tracks'>> {
  const queries = [...new Set([`${candidateQuery(m)} ${m.artist}`.trim(), candidateQuery(m)])]
  const found: AlbumSummary[] = []
  for (const q of queries) found.push(...(await client.search(q, { albums: 15, songs: 0 })).albums)
  const top = rankCandidates(m, found).slice(0, 3)
  const scored = await mapLimit(top, 2, async (c) => {
    const tracks = await client.albumTracks(c.album.id)
    const pairs = matchAlbums(m.tracks, tracks).pairs
    return {
      album: c.album,
      score: fullScore(m, c.album, tracks),
      found: pairs.filter((p) => p.status !== 'unmatched').length,
      complete: pairs.every((p) => p.status === 'ok'),
    }
  })
  const albums = scored
    .flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []))
    .filter((c) => c.score > 0.3)
    .sort((a, b) => b.score - a.score)
  const candidates: Candidate[] = albums.map(({ album, score, found }) => ({ album, score, found }))
  if (albums[0]?.complete) return { candidates }

  const match = await findAcrossLibrary(client, m.tracks, m.albumId || undefined)
  const cov = coverage(match.pairs)
  if (cov.found === 0) return { candidates }
  const names = [...new Map(match.pairs.flatMap((p) => (p.new ? [[p.new.albumId, p.new.album] as const] : []))).values()]
  return { candidates, tracks: { match, found: cov.found, total: cov.total, albums: names } }
}
