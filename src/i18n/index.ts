/**
 * Minimal i18n: one flat dictionary per language, `{name}` placeholders, and plural forms
 * picked with Intl.PluralRules (so French treats 0 as singular). No DOM here: core modules
 * can use it, and tests run in English unless they switch.
 */
import { en } from './en'
import { fr } from './fr'

export type Key = keyof typeof en
type Plural = { readonly one: string; readonly other: string }
/** Same keys as English; plural entries stay plural. */
export type Dictionary = { [K in Key]: (typeof en)[K] extends string ? string : Plural }

export const LOCALES = { en: en as Dictionary, fr } as const
export type Locale = keyof typeof LOCALES

let current: Locale = 'en'
const listeners = new Set<() => void>()

export function getLocale(): Locale {
  return current
}

export function setLocale(l: Locale): void {
  if (l === current) return
  current = l
  listeners.forEach((fn) => fn())
}

export function onLocaleChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** First supported language among the user's preferences, else English. */
export function detectLocale(preferred: readonly string[]): Locale {
  for (const p of preferred) {
    const base = p.toLowerCase().split('-')[0]
    if (base in LOCALES) return base as Locale
  }
  return 'en'
}

type Params = Record<string, string | number>

function pick(key: Key, params?: Params): string {
  const entry = LOCALES[current][key] ?? (en as Dictionary)[key]
  if (typeof entry === 'string') return entry
  const n = Number(params?.n ?? 0)
  return new Intl.PluralRules(current).select(n) === 'one' ? entry.one : entry.other
}

/** Translate a key. Plural entries read the count from `params.n`. */
export function t(key: Key, params?: Params): string {
  const s = pick(key, params)
  return params ? s.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : s
}

/** Shorthand for counted nouns: tn('n.tracks', 3) → "3 tracks". */
export function tn(key: Key, n: number): string {
  return t(key, { n })
}
