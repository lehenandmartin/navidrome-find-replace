import { describe, expect, it } from 'vitest'
import { normalizeAlbum, normalizeArtist, normalizeTitle, similarity, titleSimilarity } from '../src/core/normalize'

describe('normalizeTitle', () => {
  it.each([
    ['Hello World', 'hello world'],
    ['HELLO, World!', 'hello world'],
    ['Héllo Wörld', 'hello world'],
    ['Rock & Roll', 'rock and roll'],
    ["Don't Stop", 'don t stop'],
    ['Don’t Stop', 'don t stop'],
    ['Song (Remastered)', 'song'],
    ['Song (2011 Remaster)', 'song'],
    ['Song [Remastered 2009]', 'song'],
    ['Song - 2015 Remaster', 'song'],
    ['Song – Remastered', 'song'],
    ['Song (Digital Remaster)', 'song'],
    ['Song (Bonus Track)', 'song'],
    ['Song (Album Version)', 'song'],
    ['Song (Mono)', 'song'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeTitle(input)).toBe(expected)
  })

  it('keeps qualifiers that name a different recording', () => {
    expect(normalizeTitle('Song (Live)')).toBe('song live')
    expect(normalizeTitle('Song (Live, 2011 Remaster)')).toBe('song live 2011 remaster')
    expect(normalizeTitle('Song (Demo)')).not.toBe(normalizeTitle('Song'))
    expect(normalizeTitle('Song - Acoustic Version')).not.toBe(normalizeTitle('Song'))
    expect(normalizeTitle('Song (feat. Someone)')).toBe('song feat someone')
  })

  it('keeps a dash that is part of the title', () => {
    expect(normalizeTitle('Part 1 - The Beginning')).toBe('part 1 the beginning')
  })

  it('handles empty input', () => {
    expect(normalizeTitle('')).toBe('')
  })
})

describe('normalizeAlbum', () => {
  it('drops edition qualifiers', () => {
    expect(normalizeAlbum('Album (Deluxe Edition)')).toBe('album')
    expect(normalizeAlbum('Album [2019 Remaster]')).toBe('album')
    expect(normalizeAlbum('Album (25th Anniversary Edition)')).toBe('album')
    expect(normalizeAlbum('Album - Super Deluxe')).toBe('album')
  })
  it('keeps live albums apart', () => {
    expect(normalizeAlbum('Album (Live)')).toBe('album live')
  })
})

describe('normalizeArtist', () => {
  it('drops a leading "The" and punctuation', () => {
    expect(normalizeArtist('The Beatles')).toBe('beatles')
    expect(normalizeArtist('AC/DC')).toBe('ac dc')
  })
})

describe('similarity', () => {
  it('is 1 for equal strings and decreases with edits', () => {
    expect(similarity('abc', 'abc')).toBe(1)
    expect(similarity('', '')).toBe(1)
    expect(similarity('abcd', 'abce')).toBe(0.75)
    expect(similarity('abc', '')).toBe(0)
  })
  it('titleSimilarity ignores edition qualifiers', () => {
    expect(titleSimilarity('Song (2011 Remaster)', 'song')).toBe(1)
  })
})
