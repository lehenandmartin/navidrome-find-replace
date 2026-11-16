import { useMemo, useState } from 'preact/hooks'
import { buildFixCommands } from '../core/commands'
import type { Replacement } from '../core/types'
import { getLocale, t, tn, tParts } from '../i18n'
import { download } from './util'

/** Admin only: `navidrome missing fix` commands for the validated pairs. */
export function FixCommands({ pairs }: { pairs: Replacement[] }) {
  const [prefix, setPrefix] = useState('')
  const [copied, setCopied] = useState(false)
  const locale = getLocale()
  const result = useMemo(() => buildFixCommands(pairs, { prefix }), [pairs, prefix, locale])

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.script)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard not available: the text can still be selected */
    }
  }

  return (
    <details class="card">
      <summary>
        <strong>{t('fix.title')}</strong>
      </summary>
      <div class="stack">
        <p>{tParts('fix.intro', { cmd: <code>navidrome missing fix</code>, all: <em>{t('fix.all')}</em> })}</p>
        <div class="notice notice-error">
          <strong>{t('fix.warnStrong')}</strong> {tParts('fix.warnRest', { cmd: <code>navidrome backup create</code> })}
        </div>
        <label>
          {t('fix.prefix')}
          <input placeholder="docker exec navidrome" value={prefix} onInput={(e) => setPrefix(e.currentTarget.value)} />
        </label>
        {result.commandCount > 0 ? (
          <>
            <pre class="code">{result.script}</pre>
            <div class="actions">
              <button onClick={copy}>{copied ? t('fix.copied') : t('fix.copy')}</button>
              <button onClick={() => download('navidrome-missing-fix.sh', result.script, 'text/x-shellscript')}>{t('fix.download')}</button>
            </div>
          </>
        ) : (
          <p class="dim">{t('fix.none')}</p>
        )}
        {result.skipped.length > 0 && (
          <details>
            <summary>{tn('fix.leftOut', result.skipped.length)}</summary>
            <ul class="small">
              {result.skipped.map((s, i) => (
                <li key={i}>
                  {s.pair.old.title}: {s.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </details>
  )
}
