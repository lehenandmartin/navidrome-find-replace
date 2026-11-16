import type { PlaylistContent } from './types'

export const BACKUP_FORMAT = 'navidrome-find-replace-backup'
export const BACKUP_VERSION = 1

export interface PlaylistBackup {
  id: string
  name: string
  trackIds: string[]
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  createdAt: string
  server: string
  username: string
  playlists: PlaylistBackup[]
}

export class BackupError extends Error {}

export function createBackup(
  playlists: PlaylistContent[],
  meta: { server: string; username: string; now?: Date },
): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: (meta.now ?? new Date()).toISOString(),
    server: meta.server,
    username: meta.username,
    playlists: playlists.map((p) => ({ id: p.id, name: p.name, trackIds: [...p.trackIds] })),
  }
}

export function serializeBackup(b: BackupFile): string {
  return JSON.stringify(b, null, 2) + '\n'
}

export function backupFileName(b: BackupFile): string {
  const stamp = b.createdAt.replace(/[:]/g, '-').replace(/\.\d+Z$/, 'Z')
  return `navidrome-playlists-backup-${stamp}.json`
}

const isStr = (v: unknown): v is string => typeof v === 'string'

/** Parse and validate a backup file. Throws BackupError with a readable message. */
export function parseBackup(text: string): BackupFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BackupError('This file is not valid JSON.')
  }
  const d = data as Partial<BackupFile> | null
  if (!d || typeof d !== 'object' || d.format !== BACKUP_FORMAT) {
    throw new BackupError('This file is not a playlist backup made by this app.')
  }
  if (d.version !== BACKUP_VERSION) {
    throw new BackupError(`Unsupported backup version: ${String(d.version)}.`)
  }
  if (!isStr(d.createdAt) || !isStr(d.server) || !isStr(d.username) || !Array.isArray(d.playlists)) {
    throw new BackupError('The backup is incomplete (missing server, user, date or playlists).')
  }
  d.playlists.forEach((p, i) => {
    if (!p || !isStr(p.id) || p.id === '' || !isStr(p.name) || !Array.isArray(p.trackIds) || !p.trackIds.every(isStr)) {
      throw new BackupError(`Playlist #${i + 1} in the backup is malformed.`)
    }
  })
  return d as BackupFile
}

/** Problems worth showing before restoring a backup to the current server/user. */
export function backupWarnings(b: BackupFile, current: { server: string; username: string }): string[] {
  const w: string[] = []
  if (b.server.replace(/\/+$/, '') !== current.server.replace(/\/+$/, '')) {
    w.push(`This backup was made on ${b.server}, but you are connected to ${current.server}.`)
  }
  if (b.username !== current.username) {
    w.push(`This backup was made by user "${b.username}", but you are signed in as "${current.username}".`)
  }
  return w
}
