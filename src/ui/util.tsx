import { useEffect, useState } from 'preact/hooks'
import { describeError } from '../core/errors'
import type { Navidrome } from '../api/client'

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function download(filename: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function Cover({ client, id, size = 48 }: { client: Navidrome; id?: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const src = client.coverUrl(id, size * 2)
  if (!src || failed) return <span class="cover cover-empty" style={{ width: size, height: size }} aria-hidden="true" />
  return (
    <img
      class="cover"
      src={src}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      referrerpolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  const { message, detail } = describeError(error)
  return (
    <div class="notice notice-error" role="alert">
      <strong>{message}</strong>
      {detail && <p>{detail}</p>}
    </div>
  )
}

export function ProgressBar({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div class="progress" role="status">
      <div class="progress-label">
        {label} {total > 0 && `(${done}/${total})`}
      </div>
      <div class="progress-track">
        <div class="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function Badge({ kind, children }: { kind: 'ok' | 'warn' | 'error' | 'info' | 'muted'; children: preact.ComponentChildren }) {
  return <span class={`badge badge-${kind}`}>{children}</span>
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`
}
