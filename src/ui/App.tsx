import { useState } from 'preact/hooks'
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
import { Badge } from './util'

type Tab = 'track' | 'album' | 'restore'
type Stage = { kind: 'build' } | { kind: 'impact'; pairs: Replacement[]; label: string } | { kind: 'report'; pairs: Replacement[]; report: ApplyReport }

const TABS: { id: Tab; label: string }[] = [
  { id: 'track', label: 'Track → track' },
  { id: 'album', label: 'Album → album' },
  { id: 'restore', label: 'Restore' },
]

export function App() {
  const [client, setClient] = useState<Navidrome | null>(() => {
    const s = loadSession()
    return s ? new Navidrome(s) : null
  })
  const [warning, setWarning] = useState<string | undefined>()

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
  warning?: string
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
          Find &amp; Replace Tracks <span class="dim">for Navidrome</span>
        </div>
        <div class="who">
          <span class="dim">{client.session.serverUrl.replace(/^https?:\/\//, '')}</span>
          <span>
            {client.session.username} {isAdmin && <Badge kind="info">admin</Badge>}
          </span>
          <button class="link" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>
      <main class="content">
        {warning && (
          <div class="notice notice-warn">
            {warning}{' '}
            <button class="link" onClick={onDismissWarning}>
              Dismiss
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
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} class={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
                  {t.label}
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
            onDone={(report) => setStage({ kind: 'report', report, pairs: stage.pairs })}
          />
        )}
        {stage.kind === 'report' && (
          <Report
            client={client}
            report={stage.report}
            pairs={stage.pairs}
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
