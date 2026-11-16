import { afterEach, describe, expect, it } from 'vitest'
import { detectLocale, LOCALES, setLocale, t, tn, type Key } from '../src/i18n'
import { parseBackup } from '../src/core/backup'

afterEach(() => setLocale('en'))

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
const forms = (v: string | { one: string; other: string }) => (typeof v === 'string' ? [v] : [v.one, v.other])

describe('dictionaries', () => {
  const en = LOCALES.en
  for (const [locale, dict] of Object.entries(LOCALES)) {
    it(`${locale} uses the same placeholders as English`, () => {
      for (const key of Object.keys(en) as Key[]) {
        const expected = placeholders(forms(en[key]).join(' '))
        const actual = placeholders(forms(dict[key]).join(' '))
        expect([...new Set(actual)], `${locale}:${key}`).toEqual([...new Set(expected)])
      }
    })
  }
})

describe('t', () => {
  it('interpolates and pluralizes', () => {
    expect(t('err.unreachable', { url: 'https://x' })).toBe('Cannot reach https://x.')
    expect(tn('n.tracks', 1)).toBe('1 track')
    expect(tn('n.tracks', 0)).toBe('0 tracks')
    expect(tn('n.tracks', 2)).toBe('2 tracks')
  })

  it('switches language, with French plural rules', () => {
    setLocale('fr')
    expect(tn('n.tracks', 0)).toBe('0 piste')
    expect(tn('n.tracks', 1)).toBe('1 piste')
    expect(tn('n.tracks', 3)).toBe('3 pistes')
    expect(t('album.preview', { tracks: tn('n.tracks', 13) })).toBe('Voir l’impact (13 pistes)')
  })

  it('translates messages built by core modules', () => {
    setLocale('fr')
    expect(() => parseBackup('nope')).toThrow('Ce fichier n’est pas un JSON valide.')
  })

  it('leaves unknown placeholders visible', () => {
    expect(t('err.unreachable', {})).toBe('Cannot reach {url}.')
  })
})

describe('detectLocale', () => {
  it('picks the first supported language', () => {
    expect(detectLocale(['fr-FR', 'en'])).toBe('fr')
    expect(detectLocale(['de-DE', 'en-GB'])).toBe('en')
    expect(detectLocale(['de'])).toBe('en')
    expect(detectLocale([])).toBe('en')
  })
})
