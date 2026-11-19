/**
 * Old tracks already replaced during this session, hidden from the suggestions.
 * Kept in sessionStorage (cleared on sign-out and when the tab closes), per server and user.
 */
import { useEffect, useState } from 'preact/hooks'

const KEY = 'navidrome-find-replace.handled'

interface Stored {
  scope: string
  ids: string[]
}

let scope = ''
let ids = new Set<string>()
const listeners = new Set<() => void>()

function load(s: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(KEY)
    const d = raw ? (JSON.parse(raw) as Stored) : null
    return d && d.scope === s && Array.isArray(d.ids) ? new Set(d.ids) : new Set()
  } catch {
    return new Set()
  }
}

function save(): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ scope, ids: [...ids] } satisfies Stored))
  } catch {
    /* storage unavailable: memory only */
  }
}

function changed(): void {
  save()
  listeners.forEach((fn) => fn())
}

/** Switch to the signed-in server and user (another account starts empty). */
export function useHandledScope(serverUrl: string, username: string): void {
  const s = `${serverUrl}|${username}`
  if (s !== scope) {
    scope = s
    ids = load(s)
  }
}

export function markHandled(trackIds: readonly string[]): void {
  if (!trackIds.length) return
  trackIds.forEach((id) => ids.add(id))
  changed()
}

export function unmarkHandled(trackIds: readonly string[]): void {
  if (!trackIds.length) return
  trackIds.forEach((id) => ids.delete(id))
  changed()
}

/** Current set of handled track ids; re-renders when it changes. */
export function useHandled(): ReadonlySet<string> {
  const [, setVersion] = useState(0)
  useEffect(() => {
    const fn = () => setVersion((v) => v + 1)
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])
  return ids
}
