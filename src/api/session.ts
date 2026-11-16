/** Session kept for the lifetime of the tab, in sessionStorage only. Never contains the password. */
export interface Session {
  serverUrl: string
  username: string
  isAdmin: boolean
  /** Subsonic token auth: t = md5(password + salt) */
  subsonicToken: string
  subsonicSalt: string
  /** Navidrome native API JWT. Absent when only the Subsonic API is usable. */
  jwt?: string
  /** Server supports OpenSubsonic formPost. */
  formPost: boolean
  serverVersion?: string
}

const KEY = 'nd-playlist-replace.session'

export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function saveSession(s: Session): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // Storage unavailable (private mode): the session lives in memory only.
  }
}

export function clearSession(): void {
  try {
    sessionStorage.clear()
  } catch {
    /* ignore */
  }
}
