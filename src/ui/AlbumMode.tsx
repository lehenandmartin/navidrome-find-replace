import { useEffect, useMemo, useState } from 'preact/hooks'
import type { Navidrome } from '../api/client'
import { findAcrossLibrary } from '../api/trackSearch'
import { formatDuration, formatsOf } from '../core/mappers'
import { activePairs, matchAlbums, overridePair, type PairReason, type TrackPair } from '../core/matching'
import { coverage, type MultiMatch, type RankedCandidate } from '../core/trackmatch'
import type { AlbumSummary, Replacement, Track } from '../core/types'
import { AlbumCard, SearchBox } from './SearchBox'
import { t, tn } from '../i18n'
import { Badge, ErrorBox, ProgressBar } from './util'

export interface AlbumPrefill {
  oldAlbum: AlbumSummary
  oldTracks: Track[]
  newAlbum?: AlbumSummary
  /** Replacement found track by track, across several albums. */
  multi?: MultiMatch
}

interface Props {
  client: Navidrome
  prefill?: AlbumPrefill | null
  onPreview: (pairs: Replacement[], label: string) => void
}

export function AlbumMode({ client, prefill, onPreview }: Props) {
  const [oldAlbum, setOldAlbum] = useState<AlbumSummary | null>(prefill?.oldAlbum ?? null)
  const [newAlbum, setNewAlbum] = useState<AlbumSummary | null>(prefill?.newAlbum ?? null)
  const [multi, setMulti] = useState<MultiMatch | null>(prefill?.multi ?? null)
  const [oldTracks, setOldTracks] = useState<Track[] | null>(prefill?.oldTracks ?? null)
  const [newTracks, setNewTracks] = useState<Track[] | null>(null)
  const [pairs, setPairs] = useState<TrackPair[]>([])
  const [error, setError] = useState<unknown>(null)
  const [searching, setSearching] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => {
    setOldAlbum(prefill?.oldAlbum ?? null)
    setOldTracks(prefill?.oldTracks ?? null)
    setNewAlbum(prefill?.newAlbum ?? null)
    setMulti(prefill?.multi ?? null)
  }, [prefill])

  useEffect(() => {
    setError(null)
    if (!oldAlbum) return setOldTracks(null)
    if (prefill?.oldAlbum.id === oldAlbum.id) return setOldTracks(prefill.oldTracks)
    setOldTracks(null)
    setMulti(null)
    client.albumTracks(oldAlbum.id).then(setOldTracks, setError)
  }, [oldAlbum?.id, prefill])

  useEffect(() => {
    setNewTracks(null)
    if (newAlbum) {
      setMulti(null)
      client.albumTracks(newAlbum.id).then(setNewTracks, setError)
    }
  }, [newAlbum?.id])

  useEffect(() => {
    if (multi) setPairs(multi.pairs)
    else setPairs(oldTracks && newTracks ? matchAlbums(oldTracks, newTracks).pairs : [])
  }, [oldTracks, newTracks, multi])

  async function searchTracks() {
    if (!oldTracks || !oldAlbum) return
    setError(null)
    setSearching({ done: 0, total: oldTracks.length })
    try {
      setMulti(await findAcrossLibrary(client, oldTracks, oldAlbum.id, (done, total) => setSearching({ done, total })))
    } catch (e) {
      setError(e)
    } finally {
      setSearching(null)
    }
  }

  const active = activePairs(pairs)
  const counts = pairs.reduce<Record<string, number>>((acc, p) => ((acc[p.status] = (acc[p.status] ?? 0) + 1), acc), {})
  const multiAlbums = multi ? [...new Map(multi.pairs.flatMap((p) => (p.new ? [[p.new.albumId, p.new.album] as const] : []))).values()] : []
  const ranked = useMemo(() => new Map([...(multi?.candidates.values() ?? [])].flat().map((c) => [c.track.id, c])), [multi])
  const showTable = pairs.length > 0 && (multi || newTracks)

  return (
    <section class="stack">
      <div class="grid2">
        <div class="stack">
          <h3>{t('album.old')}</h3>
          {oldAlbum ? (
            <AlbumCard client={client} album={{ ...oldAlbum, formats: oldTracks ? formatsOf(oldTracks) : undefined }} onClear={() => setOldAlbum(null)} />
          ) : (
            <SearchBox client={client} kind="album" label={t('album.oldLabel')} includeMissing onPick={(r) => r.kind === 'album' && setOldAlbum(r.album)} />
          )}
        </div>
        <div class="stack">
          <h3>{t('album.new')}</h3>
          {newAlbum ? (
            <AlbumCard client={client} album={{ ...newAlbum, formats: newTracks ? formatsOf(newTracks) : undefined }} onClear={() => setNewAlbum(null)} />
          ) : multi ? (
            <div class="picked">
              <div class="media-text">
                <div class="media-title">{t('album.multiTitle', { albums: tn('n.albums', multiAlbums.length) })}</div>
                <div class="media-sub">{multiAlbums.join(' · ')}</div>
              </div>
              <button type="button" class="link" onClick={() => setMulti(null)}>
                {t('common.change')}
              </button>
            </div>
          ) : (
            <>
              <SearchBox client={client} kind="album" label={t('album.newLabel')} onPick={(r) => r.kind === 'album' && setNewAlbum(r.album)} />
              {oldTracks && oldTracks.length > 0 && (
                <div class="stack">
                  <button type="button" onClick={searchTracks} disabled={!!searching}>
                    {t('album.searchTracks')}
                  </button>
                  <p class="fine">{t('album.searchTracksHint')}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {!client.hasNative && <p class="fine">{t('album.nativeOnly')}</p>}
      {searching && <ProgressBar label={t('album.searchingTracks')} done={searching.done} total={searching.total} />}
      <ErrorBox error={error} />

      {oldAlbum && newAlbum && oldAlbum.id === newAlbum.id && <div class="notice notice-warn">{t('album.same')}</div>}
      {multi && coverage(multi.pairs).found === 0 && <div class="notice notice-warn">{t('album.noTrackFound')}</div>}

      {showTable && (
        <>
          <div class="summary-line">
            {counts.ok ? <Badge kind="ok">{tn('n.matches', counts.ok)}</Badge> : null}
            {counts.uncertain ? <Badge kind="warn">{tn('n.toCheck', counts.uncertain)}</Badge> : null}
            {counts.unmatched ? <Badge kind="error">{tn('n.unmatched', counts.unmatched)}</Badge> : null}
            {counts.manual ? <Badge kind="info">{tn('n.manual', counts.manual)}</Badge> : null}
            {counts.skipped ? <Badge kind="muted">{tn('n.skipped', counts.skipped)}</Badge> : null}
          </div>
          <PairTable
            pairs={pairs}
            candidatesFor={(p) => (multi ? (multi.candidates.get(p.old.id) ?? []).map((c) => c.track) : newTracks!)}
            label={(c) => (multi ? multiLabel(c, ranked.get(c.id)) : `${trackPos(c, newTracks!)}. ${c.title} ${formatDuration(c.duration)}`)}
            onChange={setPairs}
          />
          <div class="actions">
            <button
              class="primary"
              disabled={active.length === 0}
              onClick={() => onPreview(active, `${oldAlbum!.name} → ${multi ? t('album.severalReleases') : newAlbum!.name}`)}
            >
              {t('album.preview', { tracks: tn('n.tracks', active.length) })}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

/** "3" or "2-3" when the release has several discs. */
function trackPos(x: Track, all: Track[]): string {
  return `${x.discNumber > 1 || all.some((c) => c.discNumber > 1) ? x.discNumber + '-' : ''}${x.trackNumber}`
}

/** Option text for a candidate from any album: title — album · year · format · duration (· live). */
function multiLabel(c: Track, r?: RankedCandidate): string {
  const meta = [c.album, c.year, c.suffix?.toUpperCase(), formatDuration(c.duration), r?.live ? t('common.live') : ''].filter(Boolean)
  return `${c.title} — ${meta.join(' · ')}`
}

interface PairTableProps {
  pairs: TrackPair[]
  /** Replacement options for one row: the new album's tracks, or that track's own candidates. */
  candidatesFor: (p: TrackPair) => Track[]
  label: (t: Track) => string
  onChange: (p: TrackPair[]) => void
}

function PairTable({ pairs, candidatesFor, label, onChange }: PairTableProps) {
  const oldTracks = pairs.map((p) => p.old)
  return (
    <div class="table-wrap">
      <table class="pairs">
        <thead>
          <tr>
            <th>{t('pairs.old')}</th>
            <th>{t('pairs.status')}</th>
            <th>{t('pairs.new')}</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map((p, i) => {
            const options = candidatesFor(p)
            return (
              <tr key={p.old.id} class={`row-${p.status}`}>
                <td>
                  <span class="num">{trackPos(p.old, oldTracks)}</span> {p.old.title}
                  <span class="dim"> {formatDuration(p.old.duration)}</span>
                  {p.old.missing && <Badge kind="error">{t('common.missing')}</Badge>}
                </td>
                <td>
                  <StatusBadge pair={p} />
                </td>
                <td>
                  <select
                    aria-label={t('pairs.replacementFor', { title: p.old.title })}
                    value={p.new?.id ?? ''}
                    onChange={(e) => {
                      const id = e.currentTarget.value
                      const next = [...pairs]
                      next[i] = overridePair(p, options.find((c) => c.id === id) ?? null)
                      onChange(next)
                    }}
                  >
                    <option value="">{t('pairs.skip')}</option>
                    {options.map((c) => (
                      <option key={c.id} value={c.id}>
                        {label(c)}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function reasonText(r: PairReason | undefined): string {
  if (!r) return ''
  switch (r.code) {
    case 'position':
      return t('reason.position', { d1: r.d1, t1: r.t1, d2: r.d2, t2: r.t2 })
    case 'title':
      return t('reason.title')
    case 'none':
      return t('reason.none')
    case 'skipped':
      return t('reason.skipped')
    case 'live':
      return t('reason.live')
    case 'duration':
      return t('reason.duration', { seconds: r.seconds })
  }
}

function StatusBadge({ pair }: { pair: TrackPair }) {
  switch (pair.status) {
    case 'ok':
      return <Badge kind="ok">{t('status.ok')}</Badge>
    case 'uncertain': {
      const reason = reasonText(pair.reason)
      return (
        <span title={reason}>
          <Badge kind="warn">{t('status.uncertain')}</Badge> <span class="dim small">{reason}</span>
        </span>
      )
    }
    case 'unmatched':
      return <Badge kind="error">{t('status.unmatched')}</Badge>
    case 'manual':
      return <Badge kind="info">{t('status.manual')}</Badge>
    case 'skipped':
      return <Badge kind="muted">{t('status.skipped')}</Badge>
  }
}
