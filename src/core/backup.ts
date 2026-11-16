import { t } from '../i18n'
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
    throw new BackupError(t('backup.notJson'))
  }
  const d = data as Partial<BackupFile> | null
  if (!d || typeof d !== 'object' || d.format !== BACKUP_FORMAT) {
    throw new BackupError(t('backup.notOurs'))
  }
  if (d.version !== BACKUP_VERSION) {
    throw new BackupError(t('backup.version', { version: String(d.version) }))
  }
  if (!isStr(d.createdAt) || !isStr(d.server) || !isStr(d.username) || !Array.isArray(d.playlists)) {
    throw new BackupError(t('backup.incomplete'))
  }
  d.playlists.forEach((p, i) => {
    if (!p || !isStr(p.id) || p.id === '' || !isStr(p.name) || !Array.isArray(p.trackIds) || !p.trackIds.every(isStr)) {
      throw new BackupError(t('backup.malformed', { n: i + 1 }))
    }
  })
  return d as BackupFile
}

/** Problems worth showing before restoring a backup to the current server/user. */
export function backupWarnings(b: BackupFile, current: { server: string; username: string }): string[] {
  const w: string[] = []
  if (b.server.replace(/\/+$/, '') !== current.server.replace(/\/+$/, '')) {
    w.push(t('backup.otherServer', { backup: b.server, current: current.server }))
  }
  if (b.username !== current.username) {
    w.push(t('backup.otherUser', { backup: b.username, current: current.username }))
  }
  return w
}
