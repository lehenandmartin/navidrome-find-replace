#!/usr/bin/env node
// Helpers for the local test server started by docker-compose.yml.
//
//   node dev/dev.mjs seed      create user "bob" and test playlists
//   node dev/dev.mjs replace   delete the original album files and rescan (they become "missing")
//   node dev/dev.mjs status    print playlists and missing files
//
// Env: ND_URL (default http://localhost:4533), ND_MUSIC (default ./dev/music)
import { createHash, randomBytes } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

const URL_ = process.env.ND_URL ?? 'http://localhost:4533'
const MUSIC = process.env.ND_MUSIC ?? join(import.meta.dirname, 'music')
const ORIGINAL_DIR = join(MUSIC, 'The Test Band', 'Great Album (2005)')

const md5 = (s) => createHash('md5').update(s).digest('hex')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function sub(user, pass) {
  return async (method, params = []) => {
    const salt = randomBytes(6).toString('hex')
    const body = new URLSearchParams([['u', user], ['t', md5(pass + salt)], ['s', salt], ['v', '1.16.1'], ['c', 'dev-seed'], ['f', 'json'], ...params])
    const res = await fetch(`${URL_}/rest/${method}`, { method: 'POST', body })
    const json = (await res.json())['subsonic-response']
    if (json.status !== 'ok') throw new Error(`${method}: ${json.error?.message}`)
    return json
  }
}

async function nativeLogin(username, password) {
  const res = await fetch(`${URL_}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error(`login ${username}: HTTP ${res.status}`)
  return (await res.json()).token
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${URL_}/ping`)).ok) return
    } catch {}
    await sleep(1000)
  }
  throw new Error(`Navidrome not reachable at ${URL_}`)
}

async function scan(admin) {
  await admin('startScan', [['fullScan', 'true']])
  for (let i = 0; i < 120; i++) {
    await sleep(1000)
    const s = (await admin('getScanStatus')).scanStatus
    if (!s.scanning) return s
  }
  throw new Error('scan did not finish')
}

const admin = sub('admin', 'admin')

async function albumTracks(name) {
  const r = (await admin('search3', [['query', name], ['albumCount', '20'], ['songCount', '0'], ['artistCount', '0']])).searchResult3
  const album = (r.album ?? []).find((a) => a.name === name)
  if (!album) throw new Error(`album not found: ${name}`)
  return ((await admin('getAlbum', [['id', album.id]])).album.song ?? []).map((s) => s.id)
}

async function seed() {
  await waitForServer()
  console.log('Scanning…', await scan(admin))

  const jwt = await nativeLogin('admin', 'admin')
  const users = await (await fetch(`${URL_}/api/user`, { headers: { 'X-ND-Authorization': `Bearer ${jwt}` } })).json()
  if (!users.some((u) => u.userName === 'bob')) {
    const res = await fetch(`${URL_}/api/user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-ND-Authorization': `Bearer ${jwt}` },
      body: JSON.stringify({ userName: 'bob', name: 'Bob', password: 'bob', isAdmin: false }),
    })
    if (!res.ok) throw new Error(`create bob: HTTP ${res.status} ${await res.text()}`)
    console.log('Created user bob')
  }
  const bob = sub('bob', 'bob')

  const o = await albumTracks('Great Album')
  const r = await albumTracks('Great Album (2021 Remaster)')
  const x = await albumTracks('Other Record')

  const playlists = {
    admin: [
      ['Favourites', [o[0], x[0], o[2], o[4]]],
      // repeated old track, and the remastered track 2 already present (duplicate warning)
      ['Road trip', [o[1], x[1], r[1], o[1], o[3]]],
      ['Untouched', [x[0], x[1]]],
    ],
    bob: [["Bob's mix", [o[0], o[1]]]],
  }
  for (const [who, call] of [['admin', admin], ['bob', bob]]) {
    const existing = (await call('getPlaylists')).playlists.playlist ?? []
    for (const [name, ids] of playlists[who]) {
      for (const p of existing.filter((p) => p.name === name && p.owner === who)) await call('deletePlaylist', [['id', p.id]])
      await call('createPlaylist', [['name', name], ...ids.map((id) => ['songId', id])])
      console.log(`Playlist "${name}" (${who}): ${ids.length} tracks`)
    }
  }
  console.log('\nSeeded. Sign in at the app with admin/admin or bob/bob, server', URL_)
}

async function replace() {
  await waitForServer()
  await rm(ORIGINAL_DIR, { recursive: true, force: true })
  console.log('Deleted', ORIGINAL_DIR)
  console.log('Rescanning…', await scan(admin))
  await status()
}

async function status() {
  const jwt = await nativeLogin('admin', 'admin')
  const h = { headers: { 'X-ND-Authorization': `Bearer ${jwt}` } }
  const missing = await (await fetch(`${URL_}/api/missing?_start=0&_end=100`, h)).json()
  console.log(`Missing files: ${missing.length}`)
  const pls = (await admin('getPlaylists')).playlists.playlist ?? []
  for (const p of pls) {
    const tracks = await (await fetch(`${URL_}/api/playlist/${p.id}/tracks?_sort=id&_order=ASC`, h)).json()
    console.log(`- ${p.name} (${p.owner}${p.readonly ? ', readonly' : ''}): ${tracks.map((t) => `${t.title}${t.missing ? ' [missing]' : ''}`).join(' | ')}`)
  }
}

const cmd = process.argv[2]
const cmds = { seed, replace, status }
if (!cmds[cmd]) {
  console.log('Usage: node dev/dev.mjs seed|replace|status')
  process.exit(1)
}
cmds[cmd]().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
