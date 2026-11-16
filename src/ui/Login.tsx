import { useState } from 'preact/hooks'
import type { Navidrome } from '../api/client'
import { login } from '../api/login'
import { t, type Key } from '../i18n'
import { ErrorBox, LanguageSelect } from './util'

const LAST_SERVER_KEY = 'navidrome-find-replace.lastServer'

function lastServer(): string {
  try {
    return localStorage.getItem(LAST_SERVER_KEY) ?? ''
  } catch {
    return ''
  }
}

export function Login({ onLogin }: { onLogin: (c: Navidrome, warning?: Key) => void }) {
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
      <div class="row-between login-head">
        <div>
          <h1>{t('app.title')}</h1>
          <p class="subtitle">{t('app.subtitle')}</p>
        </div>
        <LanguageSelect />
      </div>
      <p class="lead">{t('login.lead')}</p>
      <form onSubmit={submit} class="card stack">
        <label>
          {t('login.server')}
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
          {t('login.username')}
          <input value={username} onInput={(e) => setUsername(e.currentTarget.value)} required autoComplete="username" autoCapitalize="none" />
        </label>
        <label>
          {t('login.password')}
          <input name="password" type="password" required autoComplete="current-password" />
        </label>
        <button type="submit" class="primary" disabled={busy}>
          {busy ? t('login.submitting') : t('login.submit')}
        </button>
        <ErrorBox error={error} />
      </form>
      <p class="fine">{t('login.privacy')}</p>
    </main>
  )
}
