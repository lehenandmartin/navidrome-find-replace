/**
 * Title normalization used to compare tracks and albums across releases.
 *
 * The goal is to make "Song (2011 Remaster)" and "song" compare equal, while keeping
 * versions that really are different recordings ("Live", "Demo", "Acoustic", remixes) apart.
 */

// Qualifiers that describe the release, not the recording.
const EDITION_WORDS = [
  'remaster',
  'remastered',
  'remasterizado',
  'remasterise',
  'remasterisee',
  'digital remaster',
  'digitally remastered',
  'bonus track',
  'bonus',
  'album version',
  'lp version',
  'explicit',
  'clean',
  'mono',
  'stereo',
]

// Extra qualifiers that only make sense for album names.
const ALBUM_EDITION_WORDS = [
  'deluxe',
  'deluxe edition',
  'deluxe version',
  'expanded',
  'expanded edition',
  'anniversary',
  'anniversary edition',
  'special edition',
  'collector s edition',
  'legacy edition',
  'super deluxe',
  'edition',
  'version',
  'reissue',
]

function baseFold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/&/g, ' and ')
}

function stripPunctuation(s: string): string {
  return s
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when a bracketed or dashed qualifier only names an edition (e.g. "2011 Remaster"). */
function isEditionQualifier(qualifier: string, words: string[]): boolean {
  const q = stripPunctuation(baseFold(qualifier))
    // years and ordinals ("2011", "25th") don't change the meaning
    .replace(/\b\d{4}\b/g, ' ')
    .replace(/\b\d+(st|nd|rd|th)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (q === '') return true
  if (/\b(live|demo|acoustic|remix|instrumental|edit|karaoke|session|feat|featuring|with)\b/.test(q)) return false
  return words.some((w) => new RegExp(`(^| )${w}( |$)`).test(q))
}

function stripQualifiers(input: string, words: string[]): string {
  let s = input
  // Bracketed qualifiers: (..), [..], {..}
  s = s.replace(/\s*[([{]([^)\]}]*)[)\]}]/g, (m, inner: string) => (isEditionQualifier(inner, words) ? ' ' : m))
  // Dash qualifiers: "Title - 2011 Remaster", "Title – Remastered"
  s = s.replace(/\s+[-–—]\s+([^-–—]+)$/u, (m, tail: string) => (isEditionQualifier(tail, words) ? '' : m))
  return s
}

/** Normalized form of a track title, for equality checks. */
export function normalizeTitle(title: string): string {
  return stripPunctuation(baseFold(stripQualifiers(title ?? '', EDITION_WORDS)))
}

/** Normalized form of an album name: also drops "Deluxe Edition" and friends. */
export function normalizeAlbum(name: string): string {
  return stripPunctuation(baseFold(stripQualifiers(name ?? '', [...EDITION_WORDS, ...ALBUM_EDITION_WORDS])))
}

/** Normalized artist name. Leading "The" is dropped. */
export function normalizeArtist(name: string): string {
  return stripPunctuation(baseFold(name ?? '')).replace(/^the /, '')
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/** Similarity of two already-normalized strings, from 0 (unrelated) to 1 (equal). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1
  const max = Math.max(a.length, b.length)
  if (max === 0) return 1
  return 1 - levenshtein(a, b) / max
}

export function titleSimilarity(a: string, b: string): number {
  return similarity(normalizeTitle(a), normalizeTitle(b))
}
