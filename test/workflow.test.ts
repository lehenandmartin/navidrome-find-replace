import { describe, expect, it } from 'vitest'
import { computePlaylistChange } from '../src/core/diff'
import type { PlaylistContent } from '../src/core/types'
import { applyChanges, isEditable, restoreBackup, type PlaylistGateway } from '../src/core/workflow'

class FakeServer implements PlaylistGateway {
  writes: { id: string; ids: string[] }[] = []
  /** Ids the server silently drops on write (e.g. tracks in a library the user can't access). */
  inaccessible = new Set<string>()
  failWrite = new Set<string>()
  constructor(public playlists: Record<string, PlaylistContent>) {}
  async read(id: string) {
    const p = this.playlists[id]
    if (!p) throw new Error('not found')
    return { ...p, trackIds: [...p.trackIds] }
  }
  async write(id: string, ids: readonly string[]) {
    if (this.failWrite.has(id)) throw new Error('boom')
    this.writes.push({ id, ids: [...ids] })
    this.playlists[id] = { ...this.playlists[id], trackIds: ids.filter((t) => !this.inaccessible.has(t)) }
  }
}

const meta = { server: 'https://h', username: 'alice' }
const map = new Map([['o1', 'n1']])

function setup() {
  const server = new FakeServer({
    a: { id: 'a', name: 'A', trackIds: ['x', 'o1', 'y'] },
    b: { id: 'b', name: 'B', trackIds: ['n1', 'o1'] },
  })
  const plans = Object.values(server.playlists).map((p) => ({ change: computePlaylistChange(p, map)!, dedupe: false }))
  return { server, plans }
}

describe('applyChanges', () => {
  it('backs up before writing, writes in order and verifies', async () => {
    const { server, plans } = setup()
    let backupSeenBeforeWrite = false
    const report = await applyChanges(plans, server, meta, undefined, () => {
      backupSeenBeforeWrite = server.writes.length === 0
    })
    expect(backupSeenBeforeWrite).toBe(true)
    expect(report.backup.playlists).toEqual([
      { id: 'a', name: 'A', trackIds: ['x', 'o1', 'y'] },
      { id: 'b', name: 'B', trackIds: ['n1', 'o1'] },
    ])
    expect(server.playlists.a.trackIds).toEqual(['x', 'n1', 'y'])
    expect(server.playlists.b.trackIds).toEqual(['n1', 'n1'])
    expect(report.results.map((r) => r.status)).toEqual(['updated', 'updated'])
  })

  it('dedupes when asked', async () => {
    const { server, plans } = setup()
    plans[1].dedupe = true
    await applyChanges(plans, server, meta)
    expect(server.playlists.b.trackIds).toEqual(['n1'])
  })

  it('skips a playlist that changed since the preview, and leaves it out of the backup', async () => {
    const { server, plans } = setup()
    server.playlists.a.trackIds.push('z')
    const report = await applyChanges(plans, server, meta)
    expect(report.results.find((r) => r.playlistId === 'a')?.status).toBe('skipped')
    expect(report.backup.playlists.map((p) => p.id)).toEqual(['b'])
    expect(server.writes.map((w) => w.id)).toEqual(['b'])
  })

  it('reports a verification failure when the server dropped tracks', async () => {
    const { server, plans } = setup()
    server.inaccessible.add('n1')
    const report = await applyChanges([plans[0]], server, meta)
    expect(report.results[0].status).toBe('failed')
    expect(report.results[0].message).toMatch(/Verification failed.*2 tracks \(expected 3\)/)
  })

  it('keeps going after a write error', async () => {
    const { server, plans } = setup()
    server.failWrite.add('a')
    const report = await applyChanges(plans, server, meta)
    expect(report.results.map((r) => [r.playlistId, r.status])).toEqual([
      ['a', 'failed'],
      ['b', 'updated'],
    ])
  })
})

describe('restoreBackup', () => {
  it('restores changed playlists and leaves identical ones alone', async () => {
    const { server, plans } = setup()
    const { backup } = await applyChanges(plans, server, meta)
    server.writes = []
    server.playlists.b.trackIds = ['n1', 'o1'] // already back to original
    const res = await restoreBackup(backup.playlists, server)
    expect(res.map((r) => [r.playlistId, r.status])).toEqual([
      ['a', 'restored'],
      ['b', 'unchanged'],
    ])
    expect(server.playlists.a.trackIds).toEqual(['x', 'o1', 'y'])
    expect(server.writes.map((w) => w.id)).toEqual(['a'])
  })

  it('reports playlists that no longer exist', async () => {
    const server = new FakeServer({})
    const res = await restoreBackup([{ id: 'gone', name: 'Gone', trackIds: ['a'] }], server)
    expect(res[0].status).toBe('failed')
  })
})

describe('isEditable', () => {
  it('requires ownership and readonly === false', () => {
    expect(isEditable({ id: '1', name: '', owner: 'alice', songCount: 0, readonly: false }, 'alice')).toBe(true)
    expect(isEditable({ id: '1', name: '', owner: 'bob', songCount: 0, readonly: false }, 'alice')).toBe(false)
    expect(isEditable({ id: '1', name: '', owner: 'alice', songCount: 0, readonly: true }, 'alice')).toBe(false)
    expect(isEditable({ id: '1', name: '', owner: 'alice', songCount: 0 }, 'alice')).toBe(false)
  })
})
