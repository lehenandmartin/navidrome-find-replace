import { useEffect, useState } from 'preact/hooks'
import { Navidrome } from '../api/client'
import { clearSession, loadSession } from '../api/session'
import type { Replacement } from '../core/types'
import type { ApplyReport } from '../core/workflow'
import { AlbumMode, type AlbumPrefill } from './AlbumMode'
import { Impact } from './Impact'
import { Login } from './Login'
import { Report } from './Report'
import { Restore } from './Restore'
import { SuggestionsPanel, useSuggestions } from './Suggestions'
import { TrackMode } from './TrackMode'
import { onLocaleChange, t, type Key } from '../i18n'
import { Badge, LanguageSelect } from './util'

type Tab = 'track' | 'album' | 'restore'
type Stage = { kind: 'build' } | { kind: 'impact'; pairs: Replacement[]; label: string } | { kind: 'report'; report: ApplyReport }

const TABS: { id: Tab; label: Key }[] = [
  { id: 'track', label: 'tab.track' },
  { id: 'album', label: 'tab.album' },
  { id: 'restore', label: 'tab.restore' },
]

export function App() {
  const [client, setClient] = useState<Navidrome | null>(() => {
    const s = loadSession()
    return s ? new Navidrome(s) : null
  })
  const [warning, setWarning] = useState<Key | undefined>()
  // Re-render everything when the language changes.
  const [, setLocaleVersion] = useState(0)
  useEffect(() => onLocaleChange(() => setLocaleVersion((v) => v + 1)), [])

  if (!client) {
    return (
      <Login
        onLogin={(c, w) => {
          setClient(c)
          setWarning(w)
        }}
      />
    )
  }

  return (
    <Workspace
      // A new session gets a fresh workspace (tabs, suggestions…).
      key={`${client.session.serverUrl}|${client.session.username}`}
      client={client}
      warning={warning}
      onDismissWarning={() => setWarning(undefined)}
      onLogout={() => {
        clearSession()
        setClient(null)
        setWarning(undefined)
      }}
    />
  )
}

interface WorkspaceProps {
  client: Navidrome
  warning?: Key
  onDismissWarning: () => void
  onLogout: () => void
}

function Workspace({ client, warning, onDismissWarning, onLogout }: WorkspaceProps) {
  const [tab, setTab] = useState<Tab>('track')
  const [stage, setStage] = useState<Stage>({ kind: 'build' })
  const [prefill, setPrefill] = useState<AlbumPrefill | null>(null)
  const isAdmin = client.session.isAdmin
  // Missing files are only listed for administrators, through the native API.
  const suggestions = useSuggestions(client, isAdmin && client.hasNative)

  const preview = (pairs: Replacement[], label: string) => setStage({ kind: 'impact', pairs, label })

  return (
    <div class="app">
      <header class="topbar">
        <div class="brand">
          {t('app.title')} <span class="dim">{t('app.subtitle')}</span>
        </div>
        <div class="who">
          <span class="dim">{client.session.serverUrl.replace(/^https?:\/\//, '')}</span>
          <span>
            {client.session.username} {isAdmin && <Badge kind="info">admin</Badge>}
          </span>
          <LanguageSelect />
          <button class="link" onClick={onLogout}>
            {t('common.signOut')}
          </button>
        </div>
      </header>
      <main class="content">
        {warning && (
          <div class="notice notice-warn">
            {t(warning)}{' '}
            <button class="link" onClick={onDismissWarning}>
              {t('common.dismiss')}
            </button>
          </div>
        )}
        {stage.kind === 'build' && (
          <>
            <SuggestionsPanel
              client={client}
              state={suggestions}
              onUse={(p) => {
                setPrefill(p)
                setTab('album')
              }}
            />
            <nav class="tabs" role="tablist">
              {TABS.map((x) => (
                <button key={x.id} role="tab" aria-selected={tab === x.id} class={tab === x.id ? 'tab active' : 'tab'} onClick={() => setTab(x.id)}>
                  {t(x.label)}
                </button>
              ))}
            </nav>
            {tab === 'track' && <TrackMode client={client} onPreview={preview} />}
            {tab === 'album' && <AlbumMode client={client} prefill={prefill} onPreview={preview} />}
            {tab === 'restore' && <Restore client={client} />}
          </>
        )}
        {stage.kind === 'impact' && (
          <Impact
            client={client}
            pairs={stage.pairs}
            label={stage.label}
            onBack={() => setStage({ kind: 'build' })}
            onDone={(report) => setStage({ kind: 'report', report })}
          />
        )}
        {stage.kind === 'report' && (
          <Report
            client={client}
            report={stage.report}
            onNew={() => {
              setPrefill(null)
              setStage({ kind: 'build' })
            }}
          />
        )}
      </main>
    </div>
  )
}
