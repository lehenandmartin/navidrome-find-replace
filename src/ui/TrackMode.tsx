import { useState } from 'preact/hooks'
import type { Navidrome } from '../api/client'
import { titleSimilarity } from '../core/normalize'
import type { Replacement, Track } from '../core/types'
import { t } from '../i18n'
import { SearchBox, TrackCard } from './SearchBox'

export function TrackMode({ client, onPreview }: { client: Navidrome; onPreview: (pairs: Replacement[], label: string) => void }) {
  const [oldT, setOld] = useState<Track | null>(null)
  const [newT, setNew] = useState<Track | null>(null)
  const differs = oldT && newT && titleSimilarity(oldT.title, newT.title) < 0.85

  return (
    <section class="stack">
      <div class="grid2">
        <div class="stack">
          <h3>{t('track.old')}</h3>
          {oldT ? (
            <TrackCard client={client} track={oldT} onClear={() => setOld(null)} />
          ) : (
            <SearchBox client={client} kind="song" label={t('track.oldLabel')} includeMissing onPick={(r) => r.kind === 'song' && setOld(r.track)} />
          )}
        </div>
        <div class="stack">
          <h3>{t('track.new')}</h3>
          {newT ? (
            <TrackCard client={client} track={newT} onClear={() => setNew(null)} />
          ) : (
            <SearchBox client={client} kind="song" label={t('track.newLabel')} onPick={(r) => r.kind === 'song' && setNew(r.track)} />
          )}
        </div>
      </div>
      {oldT && newT && oldT.id === newT.id && <div class="notice notice-warn">{t('track.same')}</div>}
      {differs && <div class="notice notice-warn">{t('track.differs')}</div>}
      <div class="actions">
        <button class="primary" disabled={!oldT || !newT || oldT.id === newT.id} onClick={() => onPreview([{ old: oldT!, new: newT! }], `${oldT!.title} → ${newT!.title}`)}>
          {t('track.preview')}
        </button>
      </div>
    </section>
  )
}
