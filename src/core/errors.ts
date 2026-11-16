import { t } from '../i18n'

export type ErrorKind =
  | 'mixed-content'
  | 'cors'
  | 'unreachable'
  | 'bad-credentials'
  | 'not-authorized'
  | 'not-found'
  | 'server'
  | 'rate-limited'
  | 'protocol'

export class AppError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
    readonly detail?: string,
  ) {
    super(message)
  }
}

/** True when a page served over HTTPS would be blocked from calling this server. */
export function isMixedContent(pageProtocol: string, serverUrl: string): boolean {
  return pageProtocol === 'https:' && serverUrl.startsWith('http://') && !isLoopback(serverUrl)
}

/** Browsers treat http://localhost as potentially trustworthy, so it is not mixed content. */
function isLoopback(serverUrl: string): boolean {
  try {
    const h = new URL(serverUrl).hostname
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost')
  } catch {
    return false
  }
}

export function mixedContentError(serverUrl: string): AppError {
  return new AppError(
    'mixed-content',
    t('err.mixed'),
    t('err.mixedDetail', { url: serverUrl }),
  )
}

/**
 * Explain a fetch() that failed without a response. `reachable` comes from a follow-up
 * `no-cors` probe: when the server answers that one, the failure was CORS.
 */
export function networkError(serverUrl: string, reachable: boolean): AppError {
  if (reachable) {
    return new AppError('cors', t('err.cors'), t('err.corsDetail'))
  }
  return new AppError('unreachable', t('err.unreachable', { url: serverUrl }), t('err.unreachableDetail'))
}

/** Map a Subsonic error code to an AppError. */
export function subsonicError(code: number, message: string): AppError {
  switch (code) {
    case 40:
    case 41:
    case 44:
      return new AppError('bad-credentials', t('err.badCredentials'), message)
    case 50:
      return new AppError('not-authorized', t('err.notAuthorized'), message)
    case 70:
      return new AppError('not-found', t('err.notFound'), message)
    default:
      return new AppError('server', t('err.server', { message: message || t('err.unknown') }), `Subsonic error code ${code}`)
  }
}

export function httpError(status: number, body: string): AppError {
  if (status === 401) return new AppError('bad-credentials', t('err.badCredentialsOrExpired'), body)
  if (status === 403) return new AppError('not-authorized', t('err.notAuthorized'), body)
  if (status === 404) return new AppError('not-found', t('err.notFound'), body)
  if (status === 429) return new AppError('rate-limited', t('err.tooMany'), body)
  return new AppError('server', t('err.http', { status }), body.slice(0, 300))
}

export function describeError(e: unknown): { message: string; detail?: string } {
  if (e instanceof AppError) return { message: e.message, detail: e.detail }
  if (e instanceof Error) return { message: e.message }
  return { message: String(e) }
}
