import { AppError, isMixedContent, mixedContentError, networkError } from '../core/errors'

/**
 * fetch() with readable errors. A request that fails without a response is followed by a
 * `no-cors` probe of the server: if the probe gets through, the failure was CORS.
 */
export async function safeFetch(serverUrl: string, url: string, init: RequestInit = {}): Promise<Response> {
  if (isMixedContent(location.protocol, serverUrl)) throw mixedContentError(serverUrl)
  try {
    return await fetch(url, { ...init, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw networkError(serverUrl, await probe(serverUrl))
  }
}

async function probe(serverUrl: string): Promise<boolean> {
  try {
    await fetch(`${serverUrl}/ping`, { mode: 'no-cors', credentials: 'omit', cache: 'no-store' })
    return true
  } catch {
    return false
  }
}

export async function readJson(res: Response): Promise<unknown> {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new AppError(
      'protocol',
      'The server sent something that is not JSON.',
      'Is this really a Navidrome address? A reverse proxy login page can also cause this. ' + text.slice(0, 200),
    )
  }
}
