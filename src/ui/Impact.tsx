import { useEffect, useMemo, useState } from 'preact/hooks'
import type { Navidrome } from '../api/client'
import { computePlaylistChange, toReplacementMap, type PlaylistChange } from '../core/diff'
import { describeError } from '../core/errors'
import { formatDuration } from '../core/mappers'
import { mapLimit } from '../core/pool'
import type { PlaylistInfo, Replacement, Track } from '../core/types'
import { applyChanges, isEditable, type ApplyReport } from '../core/workflow'
import { FixCommands } from './FixCommands'
import { Badge, ErrorBox, plural, ProgressBar } from './util'

interface Props {
  client: Navidrome
  pairs: Replacement[]
  label: string
  onBack: () => void
  onDone: (report: ApplyReport) => void
}

interface Scan {
  changes: PlaylistChange[]
  excluded: { notOwned: number; readonly: number }
  readErrors: { playlist: PlaylistInfo; message: string; detail?: string }[]
  scanned: number
}

export function Impact({ client, pairs, label, onBack, onDone }: Props) {
  const [scan, setScan] = useState<Scan | null>(null)
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dedupe, setDedupe] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [applying, setApplying] = useState(false)

  const byId = useMemo(() => {
    const m = new Map<string, Track>()
    for (const p of pairs) {
      m.set(p.old.id, p.old)
      m.set(p.new.id, p.new)
    }
    return m
  }, [pairs])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const map = toReplacementMap(pairs)
        setProgress({ label: 'Listing playlists', done: 0, total: 0 })
        const all = await client.playlists()
        const username = client.session.username
        const editable = all.filter((p) => isEditable(p, username))
        const excluded = {
          notOwned: all.filter((p) => p.owner !== username).length,
          readonly: all.filter((p) => p.owner === username && !isEditable(p, username)).length,
        }
        const readErrors: Scan['readErrors'] = []
        const results = await mapLimit(
          editable,
          4,
          (p) => client.read(p.id),
          (done, total) => !cancelled && setProgress({ label: 'Reading playlists', done, total }),
        )
        const changes: PlaylistChange[] = []
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            const d = describeError(r.reason)
            readErrors.push({ playlist: editable[i], message: d.message, detail: d.detail })
          } else {
            const c = computePlaylistChange({ ...r.value, name: r.value.name || editable[i].name }, map)
            if (c) changes.push(c)
          }
        })
        changes.sort((a, b) => a.name.localeCompare(b.name))
        if (cancelled) return
        setScan({ changes, excluded, readErrors, scanned: editable.length })
        setSelected(new Set(changes.map((c) => c.playlistId)))
        setProgress(null)
      } catch (e) {
        if (!cancelled) {
          setError(e)
          setProgress(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pairs, client])

  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const n = new Set(set)
    if (on) n.add(id)
    else n.delete(id)
    return n
  }

  const chosen = scan?.changes.filter((c) => selected.has(c.playlistId)) ?? []
  const totalOcc = chosen.reduce((n, c) => n + c.occurrences.length, 0)

  async function apply() {
    setApplying(true)
    setError(null)
    try {
      const report = await applyChanges(
        chosen.map((change) => ({ change, dedupe: dedupe.has(change.playlistId) })),
        client,
        { server: client.session.serverUrl, username: client.session.username },
        (label, done, total) => setProgress({ label, done, total }),
      )
      onDone(report)
    } catch (e) {
      setError(e)
    } finally {
      setApplying(false)
      setProgress(null)
    }
  }

  const title = (id: string) => {
    const t = byId.get(id)
    return t ? `${t.title}${t.album ? ` (${t.album})` : ''}` : id
  }

  /** Track cell: title, then album · year · format, so two releases of one album stay distinguishable. */
  const trackCell = (id: string) => {
    const t = byId.get(id)
    if (!t) return <span class="dim">{id}</span>
    return (
      <>
        {t.title} {t.missing && <Badge kind="error">missing</Badge>}
        <div class="dim small">{[t.album, t.year, t.suffix?.toUpperCase(), formatDuration(t.duration)].filter(Boolean).join(' · ')}</div>
      </>
    )
  }

  return (
    <section class="stack">
      <div class="row-between">
        <h2>Impact: {label}</h2>
        <button class="link" onClick={onBack} disabled={applying}>
          ← Back
        </button>
      </div>
      {progress && <ProgressBar {...progress} />}
      <ErrorBox error={error} />

      {scan && (
        <>
          <p>
            Scanned {plural(scan.scanned, 'playlist')} you own.{' '}
            {scan.excluded.notOwned > 0 && <>{plural(scan.excluded.notOwned, 'playlist')} owned by others skipped. </>}
            {scan.excluded.readonly > 0 && <>{plural(scan.excluded.readonly, 'smart or synced playlist')} skipped (read-only). </>}
          </p>

          {scan.readErrors.length > 0 && (
            <div class="notice notice-warn">
              <strong>{plural(scan.readErrors.length, 'playlist')} could not be checked and will not be modified:</strong>
              <ul>
                {scan.readErrors.map((e) => (
                  <li key={e.playlist.id}>
                    {e.playlist.name}: {e.message} {e.detail && <span class="dim">{e.detail}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {scan.changes.length === 0 ? (
            <div class="notice notice-ok">None of your playlists contains these tracks. Nothing to do.</div>
          ) : (
            <ul class="impact">
              {scan.changes.map((c) => (
                <li key={c.playlistId} class="card">
                  <label class="check">
                    <input
                      type="checkbox"
                      checked={selected.has(c.playlistId)}
                      onChange={(e) => setSelected(toggle(selected, c.playlistId, e.currentTarget.checked))}
                      disabled={applying}
                    />
                    <strong>{c.name}</strong> <Badge kind="info">{plural(c.occurrences.length, 'occurrence')}</Badge>
                    <span class="dim small"> {plural(c.originalIds.length, 'track')} in total</span>
                  </label>
                  <details>
                    <summary>Details</summary>
                    <table class="occ">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Old</th>
                          <th>New</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.occurrences.map((o) => (
                          <tr key={o.position}>
                            <td class="num">{o.position}</td>
                            <td>{trackCell(o.oldId)}</td>
                            <td>{trackCell(o.newId)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                  {c.duplicateIds.length > 0 && (
                    <div class="notice notice-warn">
                      {plural(c.duplicateIds.length, 'new track is', 'new tracks are')} already in this playlist:{' '}
                      {c.duplicateIds.map(title).join(', ')}. Replacing will create duplicates.
                      <label class="check">
                        <input
                          type="checkbox"
                          checked={dedupe.has(c.playlistId)}
                          onChange={(e) => setDedupe(toggle(dedupe, c.playlistId, e.currentTarget.checked))}
                          disabled={applying}
                        />
                        Remove the replaced entries instead (keep the existing ones, {c.originalIds.length - c.dedupedIds.length} fewer tracks)
                      </label>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {chosen.length > 0 && !confirming && (
            <div class="actions">
              <button class="primary" onClick={() => setConfirming(true)}>
                Apply to {plural(chosen.length, 'playlist')}…
              </button>
            </div>
          )}
          {confirming && (
            <div class="card confirm">
              <p>
                <strong>
                  Rewrite {plural(chosen.length, 'playlist')} ({plural(totalOcc, 'replacement')})?
                </strong>
              </p>
              <p>
                Each playlist is read again first: if it changed since this preview it is skipped. Its current content is saved as a
                backup you can download and restore afterwards.
              </p>
              <div class="actions">
                <button class="primary" onClick={apply} disabled={applying}>
                  {applying ? 'Applying…' : 'Yes, apply'}
                </button>
                <button onClick={() => setConfirming(false)} disabled={applying}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {client.session.isAdmin && <FixCommands pairs={pairs} />}
        </>
      )}
    </section>
  )
}
