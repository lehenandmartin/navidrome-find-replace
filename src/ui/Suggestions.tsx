import { useState } from 'preact/hooks'
import type { Navidrome } from '../api/client'
import { mapLimit } from '../core/pool'
import { candidateQuery, fullScore, groupMissingByAlbum, rankCandidates, type MissingAlbum } from '../core/suggest'
import type { AlbumSummary } from '../core/types'
import type { AlbumPrefill } from './AlbumMode'
import { Badge, Cover, ErrorBox, plural, ProgressBar } from './util'

interface Candidate {
  album: AlbumSummary
  score: number
}

interface Row {
  missing: MissingAlbum
  state: 'idle' | 'searching' | 'done' | 'error'
  candidates: Candidate[]
}

/** Lists albums with missing files and proposes a replacement release for each. */
export function Suggestions({ client, onUse }: { client: Navidrome; onUse: (p: AlbumPrefill) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null)
  const [error, setError] = useState<unknown>(null)

  async function load() {
    setError(null)
    setRows(null)
    try {
      setProgress({ label: 'Loading missing files', done: 0, total: 0 })
      const tracks = await client.missingTracks((n, total) => setProgress({ label: 'Loading missing files', done: n, total: total ?? n }))
      const groups = groupMissingByAlbum(tracks)
      let current: Row[] = groups.map((missing) => ({ missing, state: 'idle', candidates: [] }))
      setRows(current)
      const update = (i: number, patch: Partial<Row>) => {
        current = current.map((r, j) => (j === i ? { ...r, ...patch } : r))
        setRows(current)
      }
      await mapLimit(
        groups,
        3,
        async (g, i) => {
          update(i, { state: 'searching' })
          try {
            update(i, { state: 'done', candidates: await findCandidates(client, g) })
          } catch {
            update(i, { state: 'error' })
          }
        },
        (done, total) => setProgress({ label: 'Looking for replacements', done, total }),
      )
      setProgress(null)
    } catch (e) {
      setError(e)
      setProgress(null)
    }
  }

  return (
    <section class="stack">
      <p>
        Albums with files flagged as missing by Navidrome, with the most likely replacement release found in your library.
        Pick one to prefill the album replacement.
      </p>
      <div class="actions">
        <button class="primary" onClick={load} disabled={!!progress}>
          {rows ? 'Reload' : 'Find missing albums'}
        </button>
      </div>
      {progress && <ProgressBar {...progress} />}
      <ErrorBox error={error} />
      {rows && rows.length === 0 && <div class="notice notice-ok">No missing files. Nothing to fix.</div>}
      {rows && rows.length > 0 && (
        <ul class="suggestions">
          {rows.map((r) => (
            <li key={r.missing.albumId} class="card">
              <div class="media-row">
                <Cover client={client} id={r.missing.albumId ? `al-${r.missing.albumId}` : undefined} size={48} />
                <div class="media-text">
                  <div class="media-title">
                    {r.missing.album || '(no album)'} <Badge kind="error">{plural(r.missing.tracks.length, 'missing track')}</Badge>
                  </div>
                  <div class="media-sub">{[r.missing.artist, r.missing.year].filter(Boolean).join(' · ')}</div>
                </div>
              </div>
              <div class="candidates">
                {r.state === 'searching' && <span class="dim">Searching…</span>}
                {r.state === 'error' && <span class="dim">Search failed.</span>}
                {r.state === 'done' && r.candidates.length === 0 && <span class="dim">No candidate found. Use the Album tab to pick one by hand.</span>}
                {r.candidates.map((c, i) => (
                  <div class="candidate" key={c.album.id}>
                    <div class="media-row">
                      <Cover client={client} id={c.album.coverArt} size={36} />
                      <div class="media-text">
                        <div class="media-title">
                          {c.album.name} {i === 0 && <Badge kind={c.score > 0.8 ? 'ok' : 'warn'}>best · {Math.round(c.score * 100)}%</Badge>}
                          {i > 0 && <span class="dim small">{Math.round(c.score * 100)}%</span>}
                        </div>
                        <div class="media-sub">{[c.album.artist, c.album.year, `${c.album.songCount} tracks`].filter(Boolean).join(' · ')}</div>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        onUse({
                          oldAlbum: {
                            id: r.missing.albumId,
                            name: r.missing.album,
                            artist: r.missing.artist,
                            year: r.missing.year,
                            songCount: r.missing.tracks.length,
                            coverArt: r.missing.albumId ? `al-${r.missing.albumId}` : undefined,
                            missing: true,
                          },
                          oldTracks: r.missing.tracks,
                          newAlbum: c.album,
                        })
                      }
                    >
                      Use
                    </button>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

async function findCandidates(client: Navidrome, m: MissingAlbum): Promise<Candidate[]> {
  const queries = [...new Set([`${candidateQuery(m)} ${m.artist}`.trim(), candidateQuery(m)])]
  const found: AlbumSummary[] = []
  for (const q of queries) found.push(...(await client.search(q, { albums: 15, songs: 0 })).albums)
  const top = rankCandidates(m, found).slice(0, 3)
  const scored = await mapLimit(top, 2, async (c) => ({ album: c.album, score: fullScore(m, c.album, await client.albumTracks(c.album.id)) }))
  return scored
    .flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []))
    .filter((c) => c.score > 0.3)
    .sort((a, b) => b.score - a.score)
}
