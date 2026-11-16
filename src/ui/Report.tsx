import { useState } from 'preact/hooks'
import type { Navidrome } from '../api/client'
import { backupFileName, serializeBackup, type BackupFile } from '../core/backup'
import type { Replacement } from '../core/types'
import { restoreBackup, type ApplyReport, type RestoreResult } from '../core/workflow'
import { FixCommands } from './FixCommands'
import { Badge, download, ErrorBox, plural, ProgressBar } from './util'

export function downloadBackup(b: BackupFile) {
  download(backupFileName(b), serializeBackup(b))
}

export function Report({ client, report, pairs, onNew }: { client: Navidrome; report: ApplyReport; pairs: Replacement[]; onNew: () => void }) {
  const [restore, setRestore] = useState<RestoreResult[] | null>(null)
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [confirmUndo, setConfirmUndo] = useState(false)
  const updated = report.results.filter((r) => r.status === 'updated')
  const problems = report.results.filter((r) => r.status !== 'updated')

  async function undo() {
    setConfirmUndo(false)
    setError(null)
    try {
      setRestore(await restoreBackup(report.backup.playlists, client, (label, done, total) => setProgress({ label, done, total })))
    } catch (e) {
      setError(e)
    } finally {
      setProgress(null)
    }
  }

  return (
    <section class="stack">
      <h2>Done</h2>
      <div class="summary-line">
        <Badge kind="ok">{plural(updated.length, 'playlist')} updated</Badge>
        {problems.length > 0 && <Badge kind="error">{plural(problems.length, 'problem')}</Badge>}
      </div>
      <ul class="results">
        {report.results.map((r) => (
          <li key={r.playlistId}>
            <Badge kind={r.status === 'updated' ? 'ok' : r.status === 'skipped' ? 'warn' : 'error'}>{r.status}</Badge> <strong>{r.name}</strong>
            {r.status === 'updated' && <span class="dim"> · {plural(r.replaced, 'entry', 'entries')} replaced, verified</span>}
            {r.message && <div class="dim small">{r.message}</div>}
          </li>
        ))}
      </ul>

      <div class="card stack">
        <h3>Backup and undo</h3>
        <p>
          The original content of {plural(report.backup.playlists.length, 'playlist')} was saved before any change. Download it to
          restore later from the Restore tab, even after closing this page.
        </p>
        <div class="actions">
          <button onClick={() => downloadBackup(report.backup)} disabled={report.backup.playlists.length === 0}>
            Download backup (JSON)
          </button>
          {!confirmUndo && (
            <button onClick={() => setConfirmUndo(true)} disabled={report.backup.playlists.length === 0 || !!progress || !!restore}>
              Undo
            </button>
          )}
        </div>
        {confirmUndo && (
          <div class="confirm">
            <p>Restore {plural(report.backup.playlists.length, 'playlist')} to their content before the change?</p>
            <div class="actions">
              <button class="primary" onClick={undo}>
                Yes, undo
              </button>
              <button onClick={() => setConfirmUndo(false)}>Cancel</button>
            </div>
          </div>
        )}
        {progress && <ProgressBar {...progress} />}
        <ErrorBox error={error} />
        {restore && <RestoreResults results={restore} />}
      </div>

      {client.session.isAdmin && <FixCommands pairs={pairs} />}

      <div class="actions">
        <button class="primary" onClick={onNew}>
          New replacement
        </button>
      </div>
    </section>
  )
}

export function RestoreResults({ results }: { results: RestoreResult[] }) {
  return (
    <ul class="results">
      {results.map((r) => (
        <li key={r.playlistId}>
          <Badge kind={r.status === 'failed' ? 'error' : r.status === 'restored' ? 'ok' : 'muted'}>{r.status}</Badge> {r.name}
          {r.message && <div class="dim small">{r.message}</div>}
        </li>
      ))}
    </ul>
  )
}
