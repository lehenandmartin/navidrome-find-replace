import { describe, expect, it } from 'vitest'
import { BackupError, backupFileName, backupWarnings, createBackup, parseBackup, serializeBackup } from '../src/core/backup'

const meta = { server: 'https://music.example.org', username: 'alice', now: new Date('2026-01-02T03:04:05.678Z') }

describe('backup', () => {
  it('round-trips through JSON', () => {
    const b = createBackup([{ id: 'p1', name: 'Mix', trackIds: ['a', 'b', 'a'] }], meta)
    expect(parseBackup(serializeBackup(b))).toEqual(b)
    expect(b.createdAt).toBe('2026-01-02T03:04:05.678Z')
  })

  it('copies track lists so later mutations do not leak in', () => {
    const ids = ['a']
    const b = createBackup([{ id: 'p1', name: 'Mix', trackIds: ids }], meta)
    ids.push('b')
    expect(b.playlists[0].trackIds).toEqual(['a'])
  })

  it('names the file after the date', () => {
    expect(backupFileName(createBackup([], meta))).toBe('navidrome-playlists-backup-2026-01-02T03-04-05Z.json')
  })

  it.each([
    ['not json', /not valid JSON/],
    ['{}', /not a playlist backup/],
    ['{"format":"navidrome-playlist-replace-backup","version":2}', /Unsupported backup version/],
    ['{"format":"navidrome-playlist-replace-backup","version":1,"createdAt":"x","server":"s","username":"u"}', /incomplete/],
    [
      '{"format":"navidrome-playlist-replace-backup","version":1,"createdAt":"x","server":"s","username":"u","playlists":[{"id":"p","name":"n","trackIds":[1]}]}',
      /#1 .*malformed/,
    ],
  ])('rejects %s', (text, msg) => {
    expect(() => parseBackup(text)).toThrow(BackupError)
    expect(() => parseBackup(text)).toThrow(msg)
  })

  it('warns when restoring to another server or user', () => {
    const b = createBackup([], meta)
    expect(backupWarnings(b, { server: 'https://music.example.org/', username: 'alice' })).toEqual([])
    expect(backupWarnings(b, { server: 'https://other', username: 'bob' })).toHaveLength(2)
  })
})
