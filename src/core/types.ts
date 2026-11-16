/** A media file, as far as this app cares. Built from Subsonic or native API payloads. */
export interface Track {
  id: string
  title: string
  album: string
  albumId: string
  artist: string
  albumArtist?: string
  discNumber: number
  trackNumber: number
  year?: number
  suffix?: string
  duration?: number
  coverArt?: string
  /** True when Navidrome has flagged the file as missing on disk. */
  missing?: boolean
  path?: string
}

export interface AlbumSummary {
  id: string
  name: string
  artist: string
  year?: number
  songCount: number
  coverArt?: string
  missing?: boolean
  /** Distinct file formats of the album's tracks, when known. */
  formats?: string[]
}

export interface PlaylistInfo {
  id: string
  name: string
  owner: string
  songCount: number
  /** OpenSubsonic `readonly`. Undefined when the server did not send it. */
  readonly?: boolean
}

/** Ordered contents of a playlist, as stored on the server (missing files included). */
export interface PlaylistContent {
  id: string
  name: string
  trackIds: string[]
}

/** One old → new replacement chosen by the user. */
export interface Replacement {
  old: Track
  new: Track
}
