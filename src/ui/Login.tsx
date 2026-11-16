import { useState } from 'preact/hooks'
import type { Navidrome } from '../api/client'
import { login } from '../api/login'
import { ErrorBox } from './util'

const LAST_SERVER_KEY = 'navidrome-find-replace.lastServer'

function lastServer(): string {
  try {
    return localStorage.getItem(LAST_SERVER_KEY) ?? ''
  } catch {
    return ''
  }
}

export function Login({ onLogin }: { onLogin: (c: Navidrome, warning?: string) => void }) {
  const [server, setServer] = useState(lastServer)
  const [username, setUsername] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: Event) {
    e.preventDefault()
    const form = e.currentTarget as HTMLFormElement
    const pwInput = form.elements.namedItem('password') as HTMLInputElement
    setBusy(true)
    setError(null)
    try {
      const { client, warning } = await login(server, username.trim(), pwInput.value)
      pwInput.value = ''
      try {
        // Only the address is remembered across visits, never credentials.
        localStorage.setItem(LAST_SERVER_KEY, client.session.serverUrl)
      } catch {
        /* ignore */
      }
      onLogin(client, warning)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main class="login">
      <div>
        <h1>Find &amp; Replace Tracks</h1>
        <p class="subtitle">for Navidrome</p>
      </div>
      <p class="lead">Replace a track, or a whole album, by another release in all your Navidrome playlists. Preview first, undo anytime.</p>
      <form onSubmit={submit} class="card stack">
        <label>
          Server address
          <input
            type="text"
            inputMode="url"
            autoCapitalize="none"
            spellcheck={false}
            placeholder="https://music.example.org"
            value={server}
            onInput={(e) => setServer(e.currentTarget.value)}
            required
            autoComplete="url"
          />
        </label>
        <label>
          Username
          <input value={username} onInput={(e) => setUsername(e.currentTarget.value)} required autoComplete="username" autoCapitalize="none" />
        </label>
        <label>
          Password
          <input name="password" type="password" required autoComplete="current-password" />
        </label>
        <button type="submit" class="primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <ErrorBox error={error} />
      </form>
      <p class="fine">
        Everything happens in your browser: requests go straight to your server. Your password is never stored; the session
        token is kept in this tab only and is erased when you sign out or close the tab.
      </p>
    </main>
  )
}
