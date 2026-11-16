import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { md5 } from '../src/core/md5'
import { buildSubsonicRequest, nativeQuery, normalizeServerUrl, replacePlaylistParams } from '../src/core/requests'

describe('md5 (RFC 1321 test suite)', () => {
  it.each([
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['a', '0cc175b9c0f1b6a831c399e269772661'],
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
    ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
    ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
    ['12345678901234567890123456789012345678901234567890123456789012345678901234567890', '57edf4a22be3c955ac49da2e2107b67a'],
  ])('md5(%j)', (input, hex) => {
    expect(md5(input)).toBe(hex)
  })
  it('agrees with node:crypto on UTF-8 and block-boundary inputs', () => {
    const inputs = ['é', 'mot de passe ünïcødé 🎵', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(1000)]
    for (const s of inputs) expect(md5(s)).toBe(createHash('md5').update(s, 'utf8').digest('hex'))
  })
  it('matches the Subsonic spec example', () => {
    // http://www.subsonic.org/pages/api.jsp: password "sesame", salt "c19b2d"
    expect(md5('sesame' + 'c19b2d')).toBe('26719a1196d2a940705a59634eb18eab')
  })
})

const auth = { username: 'alice', token: 'tok', salt: 'salt' }

describe('buildSubsonicRequest', () => {
  it('builds a GET with auth params', () => {
    const r = buildSubsonicRequest('https://h', auth, 'ping')
    expect(r.init.method).toBe('GET')
    expect(r.url).toBe('https://h/rest/ping?u=alice&t=tok&s=salt&v=1.16.1&c=navidrome-find-replace&f=json')
  })

  it('builds a form POST with repeated params in order', () => {
    const r = buildSubsonicRequest('https://h/nd', auth, 'createPlaylist', replacePlaylistParams('p1', ['b', 'a', 'b']), true)
    expect(r.url).toBe('https://h/nd/rest/createPlaylist')
    expect(r.init.method).toBe('POST')
    expect(r.init.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' })
    expect(r.init.body).toBe('u=alice&t=tok&s=salt&v=1.16.1&c=navidrome-find-replace&f=json&playlistId=p1&songId=b&songId=a&songId=b')
  })

  it('encodes special characters', () => {
    const r = buildSubsonicRequest('https://h', { ...auth, username: 'a&b' }, 'search3', [['query', 'rock & roll']])
    expect(r.url).toContain('u=a%26b')
    expect(r.url).toContain('query=rock+%26+roll')
  })
})

describe('nativeQuery', () => {
  it('uses the json-server convention', () => {
    expect(nativeQuery({ start: 0, end: 50, sort: 'id', order: 'ASC', filters: { missing: true, album_id: 'x' } })).toBe(
      '_start=0&_end=50&_sort=id&_order=ASC&missing=true&album_id=x',
    )
  })
})

describe('normalizeServerUrl', () => {
  it.each([
    ['music.example.org', 'https://music.example.org'],
    ['  https://music.example.org/  ', 'https://music.example.org'],
    ['https://music.example.org/app/', 'https://music.example.org'],
    ['https://music.example.org/app/#/album', 'https://music.example.org'],
    ['https://example.org/navidrome/app', 'https://example.org/navidrome'],
    ['http://192.168.1.10:4533', 'http://192.168.1.10:4533'],
  ])('%s → %s', (input, out) => {
    expect(normalizeServerUrl(input)).toBe(out)
  })
  it('rejects junk', () => {
    expect(() => normalizeServerUrl('')).toThrow()
    expect(() => normalizeServerUrl('ftp://x')).toThrow()
  })
})
