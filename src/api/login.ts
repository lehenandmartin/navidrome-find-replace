import { AppError, httpError } from '../core/errors'
import { md5, randomSalt } from '../core/md5'
import { normalizeServerUrl } from '../core/requests'
import { Navidrome } from './client'
import { readJson, safeFetch } from './http'
import { saveSession, type Session } from './session'

type Obj = Record<string, unknown>

/**
 * Sign in. Prefers the Navidrome login (/auth/login), which also unlocks the native API
 * (missing files, full playlist contents). Falls back to Subsonic token auth when that
 * route is unreachable. The password is only used inside this function.
 */
export async function login(serverInput: string, username: string, password: string): Promise<{ client: Navidrome; warning?: string }> {
  const serverUrl = normalizeServerUrl(serverInput)
  let session: Session | null = null
  let warning: string | undefined

  try {
    const res = await safeFetch(serverUrl, `${serverUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (res.status === 401) throw httpError(401, '')
    if (res.ok) {
      const d = (await readJson(res)) as Obj
      if (typeof d.token === 'string' && typeof d.subsonicToken === 'string' && typeof d.subsonicSalt === 'string') {
        session = {
          serverUrl,
          username: String(d.username ?? username),
          isAdmin: d.isAdmin === true,
          jwt: d.token,
          subsonicToken: d.subsonicToken,
          subsonicSalt: d.subsonicSalt,
          formPost: false,
        }
      }
    } else if (res.status === 429) {
      throw httpError(429, '')
    }
  } catch (e) {
    // Wrong password or mixed content: no point trying the other API.
    if (e instanceof AppError && (e.kind === 'bad-credentials' || e.kind === 'mixed-content' || e.kind === 'unreachable')) throw e
    if (e instanceof AppError && e.message.startsWith('Too many')) throw e
  }

  if (!session) {
    const salt = randomSalt()
    session = { serverUrl, username, isAdmin: false, subsonicToken: md5(password + salt), subsonicSalt: salt, formPost: false }
    warning =
      'Signed in through the Subsonic API only: the Navidrome login was not reachable. Missing files cannot be listed, and playlists that contain missing files cannot be modified.'
  }

  const client = new Navidrome(session)
  // Validates the credentials and reports the version.
  const ping = await client.subsonic('ping', [], { post: false })
  session.serverVersion = typeof ping.serverVersion === 'string' ? ping.serverVersion : undefined
  if (ping.type !== undefined && ping.type !== 'navidrome') {
    throw new AppError('protocol', `This is a ${String(ping.type)} server, not Navidrome.`)
  }

  try {
    const ext = await client.subsonic('getOpenSubsonicExtensions', [], { post: false })
    session.formPost = ((ext.openSubsonicExtensions as Obj[]) ?? []).some((x) => x.name === 'formPost')
  } catch {
    session.formPost = false
  }

  if (session.jwt) {
    // Some reverse proxies only expose /rest: make sure /api answers too.
    try {
      await client.native('/api/keepalive/check')
    } catch {
      session.jwt = undefined
      warning =
        'The Navidrome native API (/api) is not reachable, only the Subsonic API. Missing files cannot be listed, and playlists that contain missing files cannot be modified.'
    }
  }

  if (!session.jwt) {
    try {
      const u = await client.subsonic('getUser', [['username', username]])
      session.isAdmin = (u.user as Obj)?.adminRole === true
    } catch {
      /* not critical */
    }
  }

  client.session = session
  saveSession(session)
  return { client, warning }
}

