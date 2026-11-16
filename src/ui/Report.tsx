import { useState } from 'preact/hooks'
import type { Navidrome } from '../api/client'
import { backupFileName, serializeBackup, type BackupFile } from '../core/backup'
import type { Replacement } from '../core/types'
import { restoreBackup, type ApplyReport, type RestoreResult } from '../core/workflow'
import { FixCommands } from './FixCommands'
import { t, tn } from '../i18n'
import { Badge, download, ErrorBox, ProgressBar } from './util'

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
      <h2>{t('report.done')}</h2>
      <div class="summary-line">
        <Badge kind="ok">{tn('report.updatedCount', updated.length)}</Badge>
        {problems.length > 0 && <Badge kind="error">{tn('n.problems', problems.length)}</Badge>}
      </div>
      <ul class="results">
        {report.results.map((r) => (
          <li key={r.playlistId}>
            <Badge kind={r.status === 'updated' ? 'ok' : r.status === 'skipped' ? 'warn' : 'error'}>{t(`result.${r.status}`)}</Badge> <strong>{r.name}</strong>
            {r.status === 'updated' && <span class="dim"> · {tn('report.replaced', r.replaced)}</span>}
            {r.message && <div class="dim small">{r.message}</div>}
          </li>
        ))}
      </ul>

      <div class="card stack">
        <h3>{t('report.backupTitle')}</h3>
        <p>{t('report.backupBody', { playlists: tn('n.playlists', report.backup.playlists.length) })}</p>
        <div class="actions">
          <button onClick={() => downloadBackup(report.backup)} disabled={report.backup.playlists.length === 0}>
            {t('report.download')}
          </button>
          {!confirmUndo && (
            <button onClick={() => setConfirmUndo(true)} disabled={report.backup.playlists.length === 0 || !!progress || !!restore}>
              {t('report.undo')}
            </button>
          )}
        </div>
        {confirmUndo && (
          <div class="confirm">
            <p>{t('report.undoConfirm', { playlists: tn('n.playlists', report.backup.playlists.length) })}</p>
            <div class="actions">
              <button class="primary" onClick={undo}>
                {t('report.yesUndo')}
              </button>
              <button onClick={() => setConfirmUndo(false)}>{t('common.cancel')}</button>
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
          {t('report.new')}
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
          <Badge kind={r.status === 'failed' ? 'error' : r.status === 'restored' ? 'ok' : 'muted'}>{t(`result.${r.status}`)}</Badge> {r.name}
          {r.message && <div class="dim small">{r.message}</div>}
        </li>
      ))}
    </ul>
  )
}
