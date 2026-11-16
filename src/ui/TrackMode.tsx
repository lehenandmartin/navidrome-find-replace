import { useState } from 'preact/hooks'
import type { Navidrome } from '../api/client'
import { titleSimilarity } from '../core/normalize'
import type { Replacement, Track } from '../core/types'
import { SearchBox, TrackCard } from './SearchBox'

export function TrackMode({ client, onPreview }: { client: Navidrome; onPreview: (pairs: Replacement[], label: string) => void }) {
  const [oldT, setOld] = useState<Track | null>(null)
  const [newT, setNew] = useState<Track | null>(null)
  const differs = oldT && newT && titleSimilarity(oldT.title, newT.title) < 0.85

  return (
    <section class="stack">
      <div class="grid2">
        <div class="stack">
          <h3>Old track</h3>
          {oldT ? (
            <TrackCard client={client} track={oldT} onClear={() => setOld(null)} />
          ) : (
            <SearchBox client={client} kind="song" label="Track to replace" includeMissing onPick={(r) => r.kind === 'song' && setOld(r.track)} />
          )}
        </div>
        <div class="stack">
          <h3>New track</h3>
          {newT ? (
            <TrackCard client={client} track={newT} onClear={() => setNew(null)} />
          ) : (
            <SearchBox client={client} kind="song" label="Replacement track" onPick={(r) => r.kind === 'song' && setNew(r.track)} />
          )}
        </div>
      </div>
      {oldT && newT && oldT.id === newT.id && <div class="notice notice-warn">This is the same track.</div>}
      {differs && <div class="notice notice-warn">The titles look different. Double-check before going on.</div>}
      <div class="actions">
        <button class="primary" disabled={!oldT || !newT || oldT.id === newT.id} onClick={() => onPreview([{ old: oldT!, new: newT! }], `${oldT!.title} → ${newT!.title}`)}>
          Preview impact
        </button>
      </div>
    </section>
  )
}
