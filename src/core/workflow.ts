import { createBackup, type BackupFile, type PlaylistBackup } from './backup'
import { finalIds, firstDifference, sameIds, type PlaylistChange } from './diff'
import { describeError } from './errors'
import { t } from '../i18n'
import type { PlaylistContent, PlaylistInfo, Track } from './types'

/** What the workflow needs from the server. Implemented over HTTP in src/api, faked in tests. */
export interface PlaylistGateway {
  /** Full ordered content, missing files included. */
  read(playlistId: string): Promise<PlaylistContent>
  /** Replace the whole content, in order. */
  write(playlistId: string, trackIds: readonly string[]): Promise<void>
}

/** Favorites of the signed-in user (tracks only). */
export interface FavoritesGateway {
  star(trackIds: readonly string[]): Promise<void>
  unstar(trackIds: readonly string[]): Promise<void>
}

/**
 * New tracks to add to the favorites: those whose old version is a favorite and that are not
 * favorites yet. Both sides must carry a fresh `starred` flag.
 */
export function favoritesToTransfer(pairs: readonly { old: Track; new: Track }[]): string[] {
  return [...new Set(pairs.filter((p) => p.old.starred && !p.new.starred).map((p) => p.new.id))]
}

export interface FavoritesResult {
  ids: string[]
  error?: string
}

async function setFavorites(gw: Partial<FavoritesGateway>, ids: string[], on: boolean): Promise<FavoritesResult> {
  try {
    if (!gw.star || !gw.unstar) throw new Error('favorites are not supported')
    await (on ? gw.star(ids) : gw.unstar(ids))
    return { ids }
  } catch (e) {
    return { ids: [], error: describeError(e).message }
  }
}

/** Remove favorites that a replacement added (undo). */
export function removeAddedFavorites(ids: string[], gw: Partial<FavoritesGateway>): Promise<FavoritesResult> {
  return ids.length ? setFavorites(gw, ids, false) : Promise.resolve({ ids: [] })
}

/** Only playlists the signed-in user owns and may edit. Smart and synced ones are excluded. */
export function isEditable(p: PlaylistInfo, username: string): boolean {
  return p.readonly === false && p.owner === username
}

export interface PlannedChange {
  change: PlaylistChange
  dedupe: boolean
}

export type ResultStatus = 'updated' | 'skipped' | 'failed'

export interface PlaylistResult {
  playlistId: string
  name: string
  status: ResultStatus
  message?: string
  replaced: number
}

export interface ApplyReport {
  backup: BackupFile
  results: PlaylistResult[]
  /** New tracks added to the favorites, when asked. */
  favorites?: FavoritesResult
}

export type Progress = (step: string, done: number, total: number) => void

async function writeAndVerify(gw: PlaylistGateway, id: string, expected: readonly string[]): Promise<string | undefined> {
  await gw.write(id, expected)
  const after = await gw.read(id)
  if (sameIds(after.trackIds, expected)) return undefined
  const i = firstDifference(after.trackIds, expected)
  return t('wf.verify', { actual: after.trackIds.length, expected: expected.length, pos: i + 1 })
}

/**
 * Apply changes safely:
 * 1. re-read every playlist and skip those that changed since the preview;
 * 2. back up the fresh contents (before anything is written);
 * 3. rewrite each playlist, then read it back to verify;
 * 4. add the new tracks listed in `favorites` to the favorites.
 */
export async function applyChanges(
  plans: PlannedChange[],
  gw: PlaylistGateway & Partial<FavoritesGateway>,
  meta: { server: string; username: string },
  onProgress?: Progress,
  onBackup?: (b: BackupFile) => void,
  favorites: string[] = [],
): Promise<ApplyReport> {
  const results: PlaylistResult[] = []
  const ready: { plan: PlannedChange; current: PlaylistContent }[] = []

  for (const [i, plan] of plans.entries()) {
    onProgress?.(t('progress.checking'), i, plans.length)
    const { change } = plan
    try {
      const current = await gw.read(change.playlistId)
      if (!sameIds(current.trackIds, change.originalIds)) {
        results.push({
          playlistId: change.playlistId,
          name: change.name,
          status: 'skipped',
          replaced: 0,
          message: t('wf.changed'),
        })
      } else {
        ready.push({ plan, current })
      }
    } catch (e) {
      results.push({ playlistId: change.playlistId, name: change.name, status: 'failed', replaced: 0, message: describeError(e).message })
    }
  }

  const backup = createBackup(
    ready.map((r) => r.current),
    { ...meta, starred: favorites },
  )
  onBackup?.(backup)

  for (const [i, { plan, current }] of ready.entries()) {
    onProgress?.(t('progress.updating'), i, ready.length)
    const expected = finalIds(plan.change, plan.dedupe)
    const base = { playlistId: current.id, name: current.name }
    try {
      const problem = await writeAndVerify(gw, current.id, expected)
      results.push(
        problem
          ? { ...base, status: 'failed', replaced: plan.change.occurrences.length, message: problem }
          : { ...base, status: 'updated', replaced: plan.change.occurrences.length },
      )
    } catch (e) {
      results.push({ ...base, status: 'failed', replaced: 0, message: describeError(e).message })
    }
  }
  let favResult: FavoritesResult | undefined
  if (favorites.length) {
    onProgress?.(t('progress.favorites'), 0, 1)
    favResult = await setFavorites(gw, favorites, true)
  }
  onProgress?.(t('progress.done'), 1, 1)
  return { backup, results, favorites: favResult }
}

export interface RestoreResult {
  playlistId: string
  name: string
  status: 'restored' | 'unchanged' | 'failed'
  message?: string
}

/** Write each backed-up playlist back, and verify it. */
export async function restoreBackup(
  playlists: PlaylistBackup[],
  gw: PlaylistGateway,
  onProgress?: Progress,
): Promise<RestoreResult[]> {
  const out: RestoreResult[] = []
  for (const [i, p] of playlists.entries()) {
    onProgress?.(t('progress.restoring'), i, playlists.length)
    try {
      const current = await gw.read(p.id)
      if (sameIds(current.trackIds, p.trackIds)) {
        out.push({ playlistId: p.id, name: p.name, status: 'unchanged' })
        continue
      }
      const problem = await writeAndVerify(gw, p.id, p.trackIds)
      out.push(problem ? { playlistId: p.id, name: p.name, status: 'failed', message: problem } : { playlistId: p.id, name: p.name, status: 'restored' })
    } catch (e) {
      out.push({ playlistId: p.id, name: p.name, status: 'failed', message: describeError(e).message })
    }
  }
  onProgress?.(t('progress.done'), 1, 1)
  return out
}
