import { useEffect, useMemo, useState } from 'preact/hooks'
import type { Navidrome } from '../api/client'
import { computePlaylistChange, toReplacementMap, type PlaylistChange } from '../core/diff'
import { describeError } from '../core/errors'
import { formatDuration } from '../core/mappers'
import { mapLimit } from '../core/pool'
import type { PlaylistInfo, Replacement, Track } from '../core/types'
import { applyChanges, isEditable, type ApplyReport } from '../core/workflow'
import { FixCommands } from './FixCommands'
import { t, tn } from '../i18n'
import { Badge, ErrorBox, ProgressBar } from './util'

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
        setProgress({ label: t('progress.listing'), done: 0, total: 0 })
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
          (done, total) => !cancelled && setProgress({ label: t('progress.reading'), done, total }),
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
    const x = byId.get(id)
    return x ? `${x.title}${x.album ? ` (${x.album})` : ''}` : id
  }

  /** Track cell: title, then album · year · format, so two releases of one album stay distinguishable. */
  const trackCell = (id: string) => {
    const x = byId.get(id)
    if (!x) return <span class="dim">{id}</span>
    return (
      <>
        {x.title} {x.missing && <Badge kind="error">{t('common.missing')}</Badge>}
        <div class="dim small">{[x.album, x.year, x.suffix?.toUpperCase(), formatDuration(x.duration)].filter(Boolean).join(' · ')}</div>
      </>
    )
  }

  return (
    <section class="stack">
      <div class="row-between">
        <h2>{t('impact.title', { label })}</h2>
        <button class="link" onClick={onBack} disabled={applying}>
          {t('common.back')}
        </button>
      </div>
      {progress && <ProgressBar {...progress} />}
      <ErrorBox error={error} />

      {scan && (
        <>
          <p>
            {tn('impact.scanned', scan.scanned)}{' '}
            {scan.excluded.notOwned > 0 && <>{tn('impact.notOwned', scan.excluded.notOwned)} </>}
            {scan.excluded.readonly > 0 && <>{tn('impact.readonly', scan.excluded.readonly)} </>}
          </p>

          {scan.readErrors.length > 0 && (
            <div class="notice notice-warn">
              <strong>{tn('impact.readErrors', scan.readErrors.length)}</strong>
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
            <div class="notice notice-ok">{t('impact.none')}</div>
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
                    <strong>{c.name}</strong> <Badge kind="info">{tn('n.occurrences', c.occurrences.length)}</Badge>
                    <span class="dim small"> {t('impact.inTotal', { tracks: tn('n.tracks', c.originalIds.length) })}</span>
                  </label>
                  <details>
                    <summary>{t('impact.details')}</summary>
                    <table class="occ">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>{t('impact.colOld')}</th>
                          <th>{t('impact.colNew')}</th>
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
                      {t('impact.duplicates', { n: c.duplicateIds.length, titles: c.duplicateIds.map(title).join(', ') })}
                      <label class="check">
                        <input
                          type="checkbox"
                          checked={dedupe.has(c.playlistId)}
                          onChange={(e) => setDedupe(toggle(dedupe, c.playlistId, e.currentTarget.checked))}
                          disabled={applying}
                        />
                        {tn('impact.dedupe', c.originalIds.length - c.dedupedIds.length)}
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
                {t('impact.apply', { playlists: tn('n.playlists', chosen.length) })}
              </button>
            </div>
          )}
          {confirming && (
            <div class="card confirm">
              <p>
                <strong>
                  {t('impact.confirmTitle', { playlists: tn('n.playlists', chosen.length), replacements: tn('n.replacements', totalOcc) })}
                </strong>
              </p>
              <p>{t('impact.confirmBody')}</p>
              <div class="actions">
                <button class="primary" onClick={apply} disabled={applying}>
                  {applying ? t('impact.applying') : t('impact.yesApply')}
                </button>
                <button onClick={() => setConfirming(false)} disabled={applying}>
                  {t('common.cancel')}
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
