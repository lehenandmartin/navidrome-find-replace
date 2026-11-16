<h1 align="center">Navidrome playlist replace</h1>
<h3 align="center">Swap a track, or a whole album, for another release in all your Navidrome playlists, right from your browser.</h3>

<p align="center">
  <img src="https://img.shields.io/github/license/lehenandmartin/navidrome-playlist-replace" alt="License">
  <img src="https://img.shields.io/badge/TypeScript%20%2B%20Preact-static%20site-3178C6?logo=typescript&logoColor=white" alt="TypeScript + Preact, static site">
</p>

<p align="center">
  <a href="https://lehenandmartin.github.io/navidrome-playlist-replace/"><strong>Open Navidrome playlist replace</strong></a> — runs in your browser, nothing to install
</p>

---

When you replace an album in your library with another release (a remaster, another edition…), Navidrome gives the new files new track ids. Your playlists keep pointing at the old tracks: these show up as missing once the files are gone, and disappear from the playlists for good when missing files are purged.

**The easiest way to use it is the hosted version: [lehenandmartin.github.io/navidrome-playlist-replace](https://lehenandmartin.github.io/navidrome-playlist-replace/).** Enter your server address, username and password, pick the old and the new release, check the preview, and apply.

Everything happens in your browser: the page talks directly to your Navidrome server. There is no backend, no analytics, nothing loaded from a CDN. Your password is never stored; the session token stays in the tab (`sessionStorage`) and is erased when you sign out or close the tab. Only the server address is remembered, for convenience.

## How to use it

1. **Sign in** with your Navidrome account.
2. **Choose what to replace:**
   - *Album → album*: search for the old release and the new one. Tracks are paired by disc and track number, with the title as a check ("Song (2011 Remaster)" matches "Song"). Uncertain or missing pairs are highlighted, and every pair can be changed by hand or skipped.
   - *Track → track*: for a single track.
   - *Suggestions* (administrators): lists the albums whose files Navidrome flags as missing, finds the most likely replacement in your library, and prefills the album replacement.
3. **Preview the impact**: every playlist you own is scanned. For each one affected you see the number of occurrences, their positions and the old → new tracks. Untick a playlist to leave it alone. If a new track is already in a playlist, you get a warning and can choose to drop the replaced entries instead of creating duplicates.
4. **Apply**. Each playlist is read again (and skipped if it changed since the preview), backed up, rewritten in the exact same order, then read back to check the result. A report lists what was done.
5. **Undo** right away, or **download the backup** (JSON) and restore it later from the *Restore* tab.

Do the replacement **before purging missing files** in Navidrome: purging removes the missing entries from playlists, and there is nothing left to replace.

### Server-side alternative for administrators

Recent Navidrome versions (checked with 0.64.2) have a command that remaps a missing file onto another one for *all* users, moving ratings, play counts and playlist entries: `navidrome missing fix <missing id> <target id>`. After a preview, administrators can copy or download these commands for the validated pairs.

- They are **irreversible**: run `navidrome backup create` first.
- They keep the old (missing) track id and delete the new one, so a JSON backup made by this app before running them becomes stale.
- They only accept tracks currently flagged as missing.

## Features

- Album → album replacement with automatic track pairing, manual corrections, and track → track replacement
- Search as you type, with cover, artist, year, format and track count; finds albums whose files are already missing
- Suggestions built from Navidrome's missing files (administrators)
- Preview per playlist, with duplicate detection and optional deduplication
- Exact order kept, verified after writing, backup and undo, JSON export and import
- Only touches playlists you own; smart playlists and playlists synced from files are never modified
- Large playlists are written with form POST requests, so URL length is not a problem
- Light and dark themes following your system, works on mobile

## Server requirements

- **HTTPS.** GitHub Pages serves the app over HTTPS, and browsers block requests from an HTTPS page to an `http://` server ("mixed content"). Put Navidrome behind a reverse proxy with a certificate. `http://localhost` is the only exception.
- **Cross-origin requests (CORS).** Navidrome allows them out of the box on `/auth`, `/api` and `/rest`. If you use a reverse proxy, make sure it does not strip or override the `Access-Control-*` headers, and that it doesn't put a login page in front of these paths.
- **The Navidrome login (`/auth/login`) and native API (`/api`) should be reachable**, not only the Subsonic API (`/rest`). The Subsonic API hides missing files from playlists, so without the native API, playlists that contain missing files cannot be modified safely, and the app refuses to touch them. Missing albums can't be listed either.
- **A server on your local network**: Chrome may ask for permission before a public website talks to a local address. Accept it, or use the address your proxy exposes.
- Tested with Navidrome 0.64.2.

## Limitations

- Pairing is based on disc/track numbers and titles. Always look at the preview: releases with a different track order or renamed tracks need a manual check.
- The app only modifies playlists owned by the signed-in user, even for administrators. Other users' playlists can be fixed with `navidrome missing fix`, or by each user signing in.
- A playlist cannot be emptied through the Subsonic API, so a playlist whose only tracks would all be removed by deduplication is left unchanged and reported as an error.
- Tracks the user can't access (another library) are dropped by Navidrome when a playlist is written; the verification step reports it.

## Development

Requirements: Node.js 22+, and Docker for the test server.

```bash
npm install
npm test          # unit tests (pairing, diff, backup, requests, workflow…)
npm run dev       # http://localhost:5173
npm run build     # static site in dist/, works from any sub-path
```

The business logic lives in `src/core` (no DOM, fully unit-tested); HTTP clients in `src/api`; the UI (Preact) in `src/ui`.

### End-to-end test server

`docker-compose.yml` starts Navidrome 0.64.2 with generated test music (tagged silent files made with ffmpeg): an original album in MP3, its remaster in FLAC with "Remastered" titles, a renamed track and a bonus track, plus a smart playlist.

```bash
docker compose up -d
node dev/dev.mjs seed      # users admin/admin and bob/bob, test playlists
node dev/dev.mjs replace   # delete the original album files and rescan: its tracks become missing
node dev/dev.mjs status    # playlists, with missing entries marked
```

Then sign in to `http://localhost:5173` with server `http://localhost:4533`. To start over: `docker compose down && rm -rf dev/data dev/music`.

## About

This project was built with the assistance of [Claude](https://claude.ai), under the author's direction and review.

## License

[MIT](LICENSE) — © 2026 Martin Le Hénand
