/** Request builders for the Subsonic and Navidrome native APIs. Pure: no fetch here. */
import { t } from '../i18n'

export const CLIENT_NAME = 'navidrome-find-replace'
export const SUBSONIC_API_VERSION = '1.16.1'
/** Above this, a GET URL risks being rejected by servers or proxies. */
export const MAX_GET_URL_LENGTH = 6000

export type Params = [string, string][]

export interface SubsonicAuth {
  username: string
  /** md5(password + salt) */
  token: string
  salt: string
}

export function subsonicAuthParams(auth: SubsonicAuth): Params {
  return [
    ['u', auth.username],
    ['t', auth.token],
    ['s', auth.salt],
    ['v', SUBSONIC_API_VERSION],
    ['c', CLIENT_NAME],
    ['f', 'json'],
  ]
}

export function encodeParams(params: Params): string {
  const sp = new URLSearchParams()
  for (const [k, v] of params) sp.append(k, v)
  return sp.toString()
}

export function subsonicEndpoint(serverUrl: string, method: string): string {
  return `${serverUrl}/rest/${method}`
}

export interface BuiltRequest {
  url: string
  init: { method: 'GET' | 'POST'; headers?: Record<string, string>; body?: string }
}

/**
 * Build a Subsonic call. With `post`, parameters (credentials included) travel in an
 * `application/x-www-form-urlencoded` body (OpenSubsonic `formPost`), which keeps them out
 * of URLs and server logs and has no length limit worth worrying about.
 */
export function buildSubsonicRequest(
  serverUrl: string,
  auth: SubsonicAuth,
  method: string,
  params: Params = [],
  post = false,
): BuiltRequest {
  const body = encodeParams([...subsonicAuthParams(auth), ...params])
  const endpoint = subsonicEndpoint(serverUrl, method)
  if (post) {
    return {
      url: endpoint,
      init: { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
    }
  }
  return { url: `${endpoint}?${body}`, init: { method: 'GET' } }
}

/** Parameters that replace the whole content of an existing playlist, in order. */
export function replacePlaylistParams(playlistId: string, trackIds: readonly string[]): Params {
  return [['playlistId', playlistId], ...trackIds.map((id): [string, string] => ['songId', id])]
}

export function coverArtUrl(serverUrl: string, auth: SubsonicAuth, id: string, size = 80): string {
  return `${subsonicEndpoint(serverUrl, 'getCoverArt')}?${encodeParams([...subsonicAuthParams(auth), ['id', id], ['size', String(size)]])}`
}

export interface NativeQuery {
  start?: number
  end?: number
  sort?: string
  order?: 'ASC' | 'DESC'
  filters?: Record<string, string | number | boolean>
}

/** Query string in the react-admin json-server convention the native API uses. */
export function nativeQuery(q: NativeQuery): string {
  const sp = new URLSearchParams()
  if (q.start !== undefined) sp.set('_start', String(q.start))
  if (q.end !== undefined) sp.set('_end', String(q.end))
  if (q.sort) sp.set('_sort', q.sort)
  if (q.order) sp.set('_order', q.order)
  for (const [k, v] of Object.entries(q.filters ?? {})) sp.set(k, String(v))
  return sp.toString()
}

/**
 * Normalize what the user typed as server address: add https:// when there is no scheme,
 * drop trailing slashes and the web UI suffix (/app, /app/#/...).
 */
export function normalizeServerUrl(input: string): string {
  let s = input.trim()
  if (s === '') throw new Error(t('url.empty'))
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s
  let u: URL
  try {
    u = new URL(s)
  } catch {
    throw new Error(t('url.invalid'))
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(t('url.scheme'))
  let path = u.pathname.replace(/\/+$/, '')
  path = path.replace(/\/app(\/.*)?$/, '')
  return `${u.protocol}//${u.host}${path}`
}
