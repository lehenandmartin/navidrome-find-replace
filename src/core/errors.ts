export type ErrorKind =
  | 'mixed-content'
  | 'cors'
  | 'unreachable'
  | 'bad-credentials'
  | 'not-authorized'
  | 'not-found'
  | 'server'
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
    'This page is served over HTTPS, so your browser blocks requests to an http:// server.',
    `Serve Navidrome over HTTPS (for example behind a reverse proxy with a certificate) and use https:// in the address. Address entered: ${serverUrl}`,
  )
}

/**
 * Explain a fetch() that failed without a response. `reachable` comes from a follow-up
 * `no-cors` probe: when the server answers that one, the failure was CORS.
 */
export function networkError(serverUrl: string, reachable: boolean): AppError {
  if (reachable) {
    return new AppError(
      'cors',
      'The server answered, but your browser blocked the response (CORS).',
      'Navidrome allows cross-origin requests by itself. A reverse proxy in front of it is probably removing or overriding the Access-Control-* headers, or redirecting to a login page.',
    )
  }
  return new AppError(
    'unreachable',
    `Cannot reach ${serverUrl}.`,
    'Check the address, that the server is running and reachable from this device, and that its HTTPS certificate is valid (open the address in a new tab to check).',
  )
}

/** Map a Subsonic error code to an AppError. */
export function subsonicError(code: number, message: string): AppError {
  switch (code) {
    case 40:
    case 41:
    case 44:
      return new AppError('bad-credentials', 'Wrong username or password.', message)
    case 50:
      return new AppError('not-authorized', 'You are not allowed to do this.', message)
    case 70:
      return new AppError('not-found', 'Not found on the server.', message)
    default:
      return new AppError('server', `Server error: ${message || 'unknown error'}`, `Subsonic error code ${code}`)
  }
}

export function httpError(status: number, body: string): AppError {
  if (status === 401) return new AppError('bad-credentials', 'Wrong username or password, or session expired.', body)
  if (status === 403) return new AppError('not-authorized', 'You are not allowed to do this.', body)
  if (status === 404) return new AppError('not-found', 'Not found on the server.', body)
  if (status === 429) return new AppError('server', 'Too many login attempts. Wait a minute and try again.', body)
  return new AppError('server', `The server returned HTTP ${status}.`, body.slice(0, 300))
}

export function describeError(e: unknown): { message: string; detail?: string } {
  if (e instanceof AppError) return { message: e.message, detail: e.detail }
  if (e instanceof Error) return { message: e.message }
  return { message: String(e) }
}
