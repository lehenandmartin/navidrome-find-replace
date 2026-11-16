import { useMemo, useState } from 'preact/hooks'
import { buildFixCommands } from '../core/commands'
import type { Replacement } from '../core/types'
import { download, plural } from './util'

/** Admin only: `navidrome missing fix` commands for the validated pairs. */
export function FixCommands({ pairs }: { pairs: Replacement[] }) {
  const [prefix, setPrefix] = useState('')
  const [copied, setCopied] = useState(false)
  const result = useMemo(() => buildFixCommands(pairs, { prefix }), [pairs, prefix])

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
        <strong>Server-side fix commands (admin)</strong>
      </summary>
      <div class="stack">
        <p>
          <code>navidrome missing fix</code> remaps each missing file onto its replacement for <em>all</em> users: ratings, play counts
          and playlist entries follow. It keeps the old (missing) track id and deletes the new one, so run it before purging missing
          files.
        </p>
        <div class="notice notice-error">
          <strong>These commands are irreversible.</strong> Run <code>navidrome backup create</code> first. They run on the server,
          with access to the Navidrome database and configuration.
        </div>
        <label>
          Command prefix (optional)
          <input placeholder="docker exec navidrome" value={prefix} onInput={(e) => setPrefix(e.currentTarget.value)} />
        </label>
        {result.commandCount > 0 ? (
          <>
            <pre class="code">{result.script}</pre>
            <div class="actions">
              <button onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
              <button onClick={() => download('navidrome-missing-fix.sh', result.script, 'text/x-shellscript')}>Download .sh</button>
            </div>
          </>
        ) : (
          <p class="dim">No pair qualifies.</p>
        )}
        {result.skipped.length > 0 && (
          <details>
            <summary>{plural(result.skipped.length, 'pair')} left out</summary>
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
