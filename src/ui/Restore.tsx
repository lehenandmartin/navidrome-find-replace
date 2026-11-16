import { useState } from 'preact/hooks'
import type { Navidrome } from '../api/client'
import { backupWarnings, parseBackup, type BackupFile } from '../core/backup'
import { restoreBackup, type RestoreResult } from '../core/workflow'
import { RestoreResults } from './Report'
import { ErrorBox, plural, ProgressBar } from './util'

export function Restore({ client }: { client: Navidrome }) {
  const [backup, setBackup] = useState<BackupFile | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<unknown>(null)
  const [results, setResults] = useState<RestoreResult[] | null>(null)
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null)
  const [confirming, setConfirming] = useState(false)

  async function onFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0]
    setError(null)
    setResults(null)
    setBackup(null)
    if (!file) return
    try {
      const b = parseBackup(await file.text())
      setBackup(b)
      setSelected(new Set(b.playlists.map((p) => p.id)))
    } catch (err) {
      setError(err)
    }
  }

  async function run() {
    if (!backup) return
    setConfirming(false)
    try {
      setResults(
        await restoreBackup(
          backup.playlists.filter((p) => selected.has(p.id)),
          client,
          (label, done, total) => setProgress({ label, done, total }),
        ),
      )
    } catch (e) {
      setError(e)
    } finally {
      setProgress(null)
    }
  }

  const warnings = backup ? backupWarnings(backup, { server: client.session.serverUrl, username: client.session.username }) : []

  return (
    <section class="stack">
      <p>Restore playlists from a backup file downloaded after a replacement. Each playlist gets back its exact former content.</p>
      <label>
        Backup file
        <input type="file" accept="application/json,.json" onChange={onFile} />
      </label>
      <ErrorBox error={error} />
      {backup && (
        <div class="card stack">
          <p>
            Backup from {new Date(backup.createdAt).toLocaleString()} · {plural(backup.playlists.length, 'playlist')}
          </p>
          {warnings.map((w) => (
            <div class="notice notice-warn" key={w}>
              {w}
            </div>
          ))}
          <ul class="plain">
            {backup.playlists.map((p) => (
              <li key={p.id}>
                <label class="check">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={(e) => {
                      const n = new Set(selected)
                      if (e.currentTarget.checked) n.add(p.id)
                      else n.delete(p.id)
                      setSelected(n)
                    }}
                  />
                  {p.name} <span class="dim small">({plural(p.trackIds.length, 'track')})</span>
                </label>
              </li>
            ))}
          </ul>
          {!confirming ? (
            <div class="actions">
              <button class="primary" disabled={selected.size === 0 || !!progress} onClick={() => setConfirming(true)}>
                Restore {plural(selected.size, 'playlist')}…
              </button>
            </div>
          ) : (
            <div class="confirm">
              <p>Overwrite the current content of {plural(selected.size, 'playlist')} with the backup?</p>
              <div class="actions">
                <button class="primary" onClick={run}>
                  Yes, restore
                </button>
                <button onClick={() => setConfirming(false)}>Cancel</button>
              </div>
            </div>
          )}
          {progress && <ProgressBar {...progress} />}
          {results && <RestoreResults results={results} />}
        </div>
      )}
    </section>
  )
}
