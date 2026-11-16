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
import { Suggestions } from './Suggestions'
import { TrackMode } from './TrackMode'
import { Badge } from './util'

type Tab = 'album' | 'track' | 'suggestions' | 'restore'
type Stage = { kind: 'build' } | { kind: 'impact'; pairs: Replacement[]; label: string } | { kind: 'report'; pairs: Replacement[]; report: ApplyReport }

export function App() {
  const [client, setClient] = useState<Navidrome | null>(() => {
    const s = loadSession()
    return s ? new Navidrome(s) : null
  })
  const [warning, setWarning] = useState<string | undefined>()
  const [tab, setTab] = useState<Tab>('album')
  const [stage, setStage] = useState<Stage>({ kind: 'build' })
  const [prefill, setPrefill] = useState<AlbumPrefill | null>(null)

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

  function logout() {
    clearSession()
    setClient(null)
    setStage({ kind: 'build' })
    setPrefill(null)
    setWarning(undefined)
    setTab('album')
  }

  const isAdmin = client.session.isAdmin
  const preview = (pairs: Replacement[], label: string) => setStage({ kind: 'impact', pairs, label })
  const tabs: { id: Tab; label: string; disabled?: string }[] = [
    { id: 'album', label: 'Album → album' },
    { id: 'track', label: 'Track → track' },
    ...(isAdmin
      ? [
          {
            id: 'suggestions' as Tab,
            label: 'Suggestions',
            disabled: client.hasNative ? undefined : 'Needs the Navidrome native API, which is not reachable in this session.',
          },
        ]
      : []),
    { id: 'restore', label: 'Restore' },
  ]

  return (
    <div class="app">
      <header class="topbar">
        <div class="brand">Navidrome playlist replace</div>
        <div class="who">
          <span class="dim">{client.session.serverUrl.replace(/^https?:\/\//, '')}</span>
          <span>
            {client.session.username} {isAdmin && <Badge kind="info">admin</Badge>}
          </span>
          <button class="link" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <main class="content">
        {warning && (
          <div class="notice notice-warn">
            {warning}{' '}
            <button class="link" onClick={() => setWarning(undefined)}>
              Dismiss
            </button>
          </div>
        )}
        {stage.kind === 'build' && (
          <>
            <nav class="tabs" role="tablist">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  class={tab === t.id ? 'tab active' : 'tab'}
                  disabled={!!t.disabled}
                  title={t.disabled}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </nav>
            {!isAdmin && <p class="fine">The Suggestions tab, based on missing files, is available to administrators only.</p>}
            {tab === 'album' && <AlbumMode client={client} prefill={prefill} onPreview={preview} />}
            {tab === 'track' && <TrackMode client={client} onPreview={preview} />}
            {tab === 'suggestions' && (
              <Suggestions
                client={client}
                onUse={(p) => {
                  setPrefill(p)
                  setTab('album')
                }}
              />
            )}
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
