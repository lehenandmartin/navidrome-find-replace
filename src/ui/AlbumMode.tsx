import { useEffect, useState } from 'preact/hooks'
import type { Navidrome } from '../api/client'
import { formatDuration, formatsOf } from '../core/mappers'
import { activePairs, matchAlbums, overridePair, type PairReason, type TrackPair } from '../core/matching'
import type { AlbumSummary, Replacement, Track } from '../core/types'
import { AlbumCard, SearchBox } from './SearchBox'
import { t, tn } from '../i18n'
import { Badge, ErrorBox } from './util'

export interface AlbumPrefill {
  oldAlbum: AlbumSummary
  oldTracks: Track[]
  newAlbum?: AlbumSummary
}

interface Props {
  client: Navidrome
  prefill?: AlbumPrefill | null
  onPreview: (pairs: Replacement[], label: string) => void
}

export function AlbumMode({ client, prefill, onPreview }: Props) {
  const [oldAlbum, setOldAlbum] = useState<AlbumSummary | null>(prefill?.oldAlbum ?? null)
  const [newAlbum, setNewAlbum] = useState<AlbumSummary | null>(prefill?.newAlbum ?? null)
  const [oldTracks, setOldTracks] = useState<Track[] | null>(prefill?.oldTracks ?? null)
  const [newTracks, setNewTracks] = useState<Track[] | null>(null)
  const [pairs, setPairs] = useState<TrackPair[]>([])
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    setOldAlbum(prefill?.oldAlbum ?? null)
    setOldTracks(prefill?.oldTracks ?? null)
    setNewAlbum(prefill?.newAlbum ?? null)
  }, [prefill])

  useEffect(() => {
    setError(null)
    if (!oldAlbum) return setOldTracks(null)
    if (prefill?.oldAlbum.id === oldAlbum.id) return setOldTracks(prefill.oldTracks)
    setOldTracks(null)
    client.albumTracks(oldAlbum.id).then(setOldTracks, setError)
  }, [oldAlbum?.id, prefill])

  useEffect(() => {
    setNewTracks(null)
    if (newAlbum) client.albumTracks(newAlbum.id).then(setNewTracks, setError)
  }, [newAlbum?.id])

  useEffect(() => {
    setPairs(oldTracks && newTracks ? matchAlbums(oldTracks, newTracks).pairs : [])
  }, [oldTracks, newTracks])

  const active = activePairs(pairs)
  const counts = pairs.reduce<Record<string, number>>((acc, p) => ((acc[p.status] = (acc[p.status] ?? 0) + 1), acc), {})

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
          ) : (
            <SearchBox client={client} kind="album" label={t('album.newLabel')} onPick={(r) => r.kind === 'album' && setNewAlbum(r.album)} />
          )}
        </div>
      </div>
      {!client.hasNative && (
        <p class="fine">{t('album.nativeOnly')}</p>
      )}
      <ErrorBox error={error} />

      {oldAlbum && newAlbum && oldAlbum.id === newAlbum.id && <div class="notice notice-warn">{t('album.same')}</div>}

      {pairs.length > 0 && newTracks && (
        <>
          <div class="summary-line">
            {counts.ok ? <Badge kind="ok">{tn('n.matches', counts.ok)}</Badge> : null}
            {counts.uncertain ? <Badge kind="warn">{tn('n.toCheck', counts.uncertain)}</Badge> : null}
            {counts.unmatched ? <Badge kind="error">{tn('n.unmatched', counts.unmatched)}</Badge> : null}
            {counts.manual ? <Badge kind="info">{tn('n.manual', counts.manual)}</Badge> : null}
            {counts.skipped ? <Badge kind="muted">{tn('n.skipped', counts.skipped)}</Badge> : null}
          </div>
          <PairTable pairs={pairs} candidates={newTracks} onChange={setPairs} />
          <div class="actions">
            <button
              class="primary"
              disabled={active.length === 0}
              onClick={() => onPreview(active, `${oldAlbum!.name} → ${newAlbum!.name}`)}
            >
              {t('album.preview', { tracks: tn('n.tracks', active.length) })}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function PairTable({ pairs, candidates, onChange }: { pairs: TrackPair[]; candidates: Track[]; onChange: (p: TrackPair[]) => void }) {
  const pos = (x: Track) => `${x.discNumber > 1 || candidates.some((c) => c.discNumber > 1) ? x.discNumber + '-' : ''}${x.trackNumber}`
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
          {pairs.map((p, i) => (
            <tr key={p.old.id} class={`row-${p.status}`}>
              <td>
                <span class="num">{pos(p.old)}</span> {p.old.title}
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
                    next[i] = overridePair(p, candidates.find((c) => c.id === id) ?? null)
                    onChange(next)
                  }}
                >
                  <option value="">{t('pairs.skip')}</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {pos(c)}. {c.title} {formatDuration(c.duration)}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
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
