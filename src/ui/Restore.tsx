import { useState } from 'preact/hooks'
import type { Navidrome } from '../api/client'
import { backupWarnings, parseBackup, type BackupFile } from '../core/backup'
import { removeAddedFavorites, restoreBackup, type FavoritesResult, type RestoreResult } from '../core/workflow'
import { FavoritesUndone, RestoreResults } from './Report'
import { getLocale, t, tn } from '../i18n'
import { ErrorBox, ProgressBar } from './util'

export function Restore({ client }: { client: Navidrome }) {
  const [backup, setBackup] = useState<BackupFile | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<unknown>(null)
  const [results, setResults] = useState<RestoreResult[] | null>(null)
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [removeFavorites, setRemoveFavorites] = useState(true)
  const [favResult, setFavResult] = useState<FavoritesResult | null>(null)

  async function onFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0]
    setError(null)
    setResults(null)
    setFavResult(null)
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
      if (favIds.length) setFavResult(await removeAddedFavorites(favIds, client))
    } catch (e) {
      setError(e)
    } finally {
      setProgress(null)
    }
  }

  const backupFavorites = backup?.starred ?? []
  const favIds = removeFavorites ? backupFavorites : []
  const warnings = backup ? backupWarnings(backup, { server: client.session.serverUrl, username: client.session.username }) : []

  return (
    <section class="stack">
      <p>{t('restore.intro')}</p>
      <label>
        {t('restore.file')}
        <input type="file" accept="application/json,.json" onChange={onFile} />
      </label>
      <ErrorBox error={error} />
      {backup && (
        <div class="card stack">
          <p>
            {t('restore.from', { date: new Date(backup.createdAt).toLocaleString(getLocale()), playlists: tn('n.playlists', backup.playlists.length) })}
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
                  {p.name} <span class="dim small">({tn('n.tracks', p.trackIds.length)})</span>
                </label>
              </li>
            ))}
          </ul>
          {backupFavorites.length > 0 && (
            <label class="check">
              <input type="checkbox" checked={removeFavorites} onChange={(e) => setRemoveFavorites(e.currentTarget.checked)} />★{' '}
              {tn('restore.favorites', backupFavorites.length)}
            </label>
          )}
          {!confirming ? (
            <div class="actions">
              <button class="primary" disabled={(selected.size === 0 && favIds.length === 0) || !!progress} onClick={() => setConfirming(true)}>
                {t('restore.button', { playlists: tn('n.playlists', selected.size) })}
              </button>
            </div>
          ) : (
            <div class="confirm">
              {selected.size > 0 && <p>{t('restore.confirm', { playlists: tn('n.playlists', selected.size) })}</p>}
              {favIds.length > 0 && <p>★ {tn('report.undoFavorites', favIds.length)}</p>}
              <div class="actions">
                <button class="primary" onClick={run}>
                  {t('restore.yes')}
                </button>
                <button onClick={() => setConfirming(false)}>{t('common.cancel')}</button>
              </div>
            </div>
          )}
          {progress && <ProgressBar {...progress} />}
          {results && <RestoreResults results={results} />}
          {favResult && <FavoritesUndone result={favResult} />}
        </div>
      )}
    </section>
  )
}
