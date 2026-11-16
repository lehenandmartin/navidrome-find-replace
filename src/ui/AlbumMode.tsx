import { useEffect, useState } from 'preact/hooks'
import type { Navidrome } from '../api/client'
import { formatDuration, formatsOf } from '../core/mappers'
import { activePairs, matchAlbums, overridePair, type TrackPair } from '../core/matching'
import type { AlbumSummary, Replacement, Track } from '../core/types'
import { AlbumCard, SearchBox } from './SearchBox'
import { Badge, ErrorBox, plural } from './util'

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
          <h3>Old release</h3>
          {oldAlbum ? (
            <AlbumCard client={client} album={{ ...oldAlbum, formats: oldTracks ? formatsOf(oldTracks) : undefined }} onClear={() => setOldAlbum(null)} />
          ) : (
            <SearchBox client={client} kind="album" label="Album to replace" includeMissing onPick={(r) => r.kind === 'album' && setOldAlbum(r.album)} />
          )}
        </div>
        <div class="stack">
          <h3>New release</h3>
          {newAlbum ? (
            <AlbumCard client={client} album={{ ...newAlbum, formats: newTracks ? formatsOf(newTracks) : undefined }} onClear={() => setNewAlbum(null)} />
          ) : (
            <SearchBox client={client} kind="album" label="Replacement album" onPick={(r) => r.kind === 'album' && setNewAlbum(r.album)} />
          )}
        </div>
      </div>
      {!client.hasNative && (
        <p class="fine">Albums whose files are already missing can only be found through the Navidrome login (native API).</p>
      )}
      <ErrorBox error={error} />

      {oldAlbum && newAlbum && oldAlbum.id === newAlbum.id && <div class="notice notice-warn">Old and new release are the same album.</div>}

      {pairs.length > 0 && newTracks && (
        <>
          <div class="summary-line">
            {counts.ok ? <Badge kind="ok">{plural(counts.ok, 'match', 'matches')}</Badge> : null}
            {counts.uncertain ? <Badge kind="warn">{counts.uncertain} to check</Badge> : null}
            {counts.unmatched ? <Badge kind="error">{counts.unmatched} unmatched</Badge> : null}
            {counts.manual ? <Badge kind="info">{counts.manual} manual</Badge> : null}
            {counts.skipped ? <Badge kind="muted">{counts.skipped} skipped</Badge> : null}
          </div>
          <PairTable pairs={pairs} candidates={newTracks} onChange={setPairs} />
          <div class="actions">
            <button
              class="primary"
              disabled={active.length === 0}
              onClick={() => onPreview(active, `${oldAlbum!.name} → ${newAlbum!.name}`)}
            >
              Preview impact ({plural(active.length, 'track')})
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function PairTable({ pairs, candidates, onChange }: { pairs: TrackPair[]; candidates: Track[]; onChange: (p: TrackPair[]) => void }) {
  const pos = (t: Track) => `${t.discNumber > 1 || candidates.some((c) => c.discNumber > 1) ? t.discNumber + '-' : ''}${t.trackNumber}`
  return (
    <div class="table-wrap">
      <table class="pairs">
        <thead>
          <tr>
            <th>Old track</th>
            <th>Status</th>
            <th>New track</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map((p, i) => (
            <tr key={p.old.id} class={`row-${p.status}`}>
              <td>
                <span class="num">{pos(p.old)}</span> {p.old.title}
                <span class="dim"> {formatDuration(p.old.duration)}</span>
                {p.old.missing && <Badge kind="error">missing</Badge>}
              </td>
              <td>
                <StatusBadge pair={p} />
              </td>
              <td>
                <select
                  aria-label={`Replacement for ${p.old.title}`}
                  value={p.new?.id ?? ''}
                  onChange={(e) => {
                    const id = e.currentTarget.value
                    const next = [...pairs]
                    next[i] = overridePair(p, candidates.find((c) => c.id === id) ?? null)
                    onChange(next)
                  }}
                >
                  <option value="">— Skip this track —</option>
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

function StatusBadge({ pair }: { pair: TrackPair }) {
  switch (pair.status) {
    case 'ok':
      return <Badge kind="ok">match</Badge>
    case 'uncertain':
      return (
        <span title={pair.reason}>
          <Badge kind="warn">check</Badge> <span class="dim small">{pair.reason}</span>
        </span>
      )
    case 'unmatched':
      return <Badge kind="error">no match</Badge>
    case 'manual':
      return <Badge kind="info">manual</Badge>
    case 'skipped':
      return <Badge kind="muted">skipped</Badge>
  }
}
