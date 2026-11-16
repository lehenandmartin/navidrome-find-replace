/** English strings. The source of truth: every other language must define the same keys. */
export const en = {
  'lang.name': 'English',
  'lang.label': 'Language',

  'app.title': 'Find & Replace Tracks',
  'app.subtitle': 'for Navidrome',
  'common.change': 'Change',
  'common.cancel': 'Cancel',
  'common.back': '← Back',
  'common.missing': 'missing',
  'common.retry': 'Retry',
  'common.dismiss': 'Dismiss',
  'common.signOut': 'Sign out',
  'common.searching': 'Searching',

  // counts
  'n.tracks': { one: '{n} track', other: '{n} tracks' },
  'n.playlists': { one: '{n} playlist', other: '{n} playlists' },
  'n.albums': { one: '{n} album', other: '{n} albums' },
  'n.occurrences': { one: '{n} occurrence', other: '{n} occurrences' },
  'n.replacements': { one: '{n} replacement', other: '{n} replacements' },
  'n.entries': { one: '{n} entry', other: '{n} entries' },
  'n.problems': { one: '{n} problem', other: '{n} problems' },
  'n.matches': { one: '{n} match', other: '{n} matches' },
  'n.toCheck': { one: '{n} to check', other: '{n} to check' },
  'n.unmatched': { one: '{n} unmatched', other: '{n} unmatched' },
  'n.manual': { one: '{n} manual', other: '{n} manual' },
  'n.skipped': { one: '{n} skipped', other: '{n} skipped' },
  'n.missingTracks': { one: '{n} missing track', other: '{n} missing tracks' },
  'n.otherCandidates': { one: '{n} other candidate', other: '{n} other candidates' },

  // login
  'login.lead': 'Replace a track, or a whole album, by another release in all your Navidrome playlists. Preview first, undo anytime.',
  'login.server': 'Server address',
  'login.username': 'Username',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.submitting': 'Signing in…',
  'login.privacy':
    'Everything happens in your browser: requests go straight to your server. Your password is never stored; the session token is kept in this tab only and is erased when you sign out or close the tab.',
  'login.warnSubsonicOnly':
    'Signed in through the Subsonic API only: the Navidrome login was not reachable. Missing files cannot be listed, and playlists that contain missing files cannot be modified.',
  'login.warnNoNative':
    'The Navidrome native API (/api) is not reachable, only the Subsonic API. Missing files cannot be listed, and playlists that contain missing files cannot be modified.',

  // tabs
  'tab.track': 'Track → track',
  'tab.album': 'Album → album',
  'tab.restore': 'Restore',

  // search
  'search.placeholderAlbum': 'Album or artist name…',
  'search.placeholderSong': 'Track title or artist…',
  'search.noResults': 'No results',

  // track mode
  'track.old': 'Old track',
  'track.new': 'New track',
  'track.oldLabel': 'Track to replace',
  'track.newLabel': 'Replacement track',
  'track.same': 'This is the same track.',
  'track.differs': 'The titles look different. Double-check before going on.',
  'track.preview': 'Preview impact',

  // album mode
  'album.old': 'Old release',
  'album.new': 'New release',
  'album.oldLabel': 'Album to replace',
  'album.newLabel': 'Replacement album',
  'album.nativeOnly': 'Albums whose files are already missing can only be found through the Navidrome login (native API).',
  'album.same': 'Old and new release are the same album.',
  'album.preview': 'Preview impact ({tracks})',
  'pairs.old': 'Old track',
  'pairs.status': 'Status',
  'pairs.new': 'New track',
  'pairs.skip': '— Skip this track —',
  'pairs.replacementFor': 'Replacement for {title}',
  'status.ok': 'match',
  'status.uncertain': 'check',
  'status.unmatched': 'no match',
  'status.manual': 'manual',
  'status.skipped': 'skipped',
  'reason.position': 'Position differs (disc {d1} track {t1} → disc {d2} track {t2})',
  'reason.title': 'Title differs',
  'reason.none': 'No matching track in the new release',
  'reason.skipped': 'Skipped',

  // suggestions
  'sugg.title': 'Suggestions',
  'sugg.withMissing': '{albums} with missing files',
  'sugg.looking': 'looking for replacements…',
  'sugg.refresh': 'Refresh',
  'sugg.hide': 'Hide',
  'sugg.show': 'Show',
  'sugg.showFewer': 'Show fewer',
  'sugg.showAll': 'Show all {n}',
  'sugg.loadError': 'Could not load suggestions from missing files: {message}',
  'sugg.checking': 'Checking for missing files…',
  'sugg.noAlbum': '(no album)',
  'sugg.searching': 'searching…',
  'sugg.failed': 'search failed',
  'sugg.none': 'no replacement found',
  'sugg.use': 'Use',
  'sugg.pick': 'Pick by hand',

  // impact
  'impact.title': 'Impact: {label}',
  'impact.scanned': { one: 'Scanned {n} playlist you own.', other: 'Scanned {n} playlists you own.' },
  'impact.notOwned': { one: '{n} playlist owned by others skipped.', other: '{n} playlists owned by others skipped.' },
  'impact.readonly': { one: '{n} smart or synced playlist skipped (read-only).', other: '{n} smart or synced playlists skipped (read-only).' },
  'impact.readErrors': { one: '{n} playlist could not be checked and will not be modified:', other: '{n} playlists could not be checked and will not be modified:' },
  'impact.none': 'None of your playlists contains these tracks. Nothing to do.',
  'impact.inTotal': '{tracks} in total',
  'impact.details': 'Details',
  'impact.colOld': 'Old',
  'impact.colNew': 'New',
  'impact.duplicates': {
    one: '{n} new track is already in this playlist: {titles}. Replacing will create duplicates.',
    other: '{n} new tracks are already in this playlist: {titles}. Replacing will create duplicates.',
  },
  'impact.dedupe': {
    one: 'Remove the replaced entries instead (keep the existing ones, {n} fewer track)',
    other: 'Remove the replaced entries instead (keep the existing ones, {n} fewer tracks)',
  },
  'impact.apply': 'Apply to {playlists}…',
  'impact.confirmTitle': 'Rewrite {playlists} ({replacements})?',
  'impact.confirmBody':
    'Each playlist is read again first: if it changed since this preview it is skipped. Its current content is saved as a backup you can download and restore afterwards.',
  'impact.yesApply': 'Yes, apply',
  'impact.applying': 'Applying…',

  // progress
  'progress.listing': 'Listing playlists',
  'progress.reading': 'Reading playlists',
  'progress.checking': 'Checking playlists',
  'progress.updating': 'Updating playlists',
  'progress.restoring': 'Restoring playlists',
  'progress.done': 'Done',

  // report
  'report.done': 'Done',
  'report.updatedCount': { one: '{n} playlist updated', other: '{n} playlists updated' },
  'report.replaced': { one: '{n} entry replaced, verified', other: '{n} entries replaced, verified' },
  'report.backupTitle': 'Backup and undo',
  'report.backupBody':
    'The original content of {playlists} was saved before any change. Download it to restore later from the Restore tab, even after closing this page.',
  'report.download': 'Download backup (JSON)',
  'report.undo': 'Undo',
  'report.undoConfirm': 'Restore {playlists} to their content before the change?',
  'report.yesUndo': 'Yes, undo',
  'report.new': 'New replacement',
  'result.updated': 'updated',
  'result.skipped': 'skipped',
  'result.failed': 'failed',
  'result.restored': 'restored',
  'result.unchanged': 'unchanged',

  // restore
  'restore.intro': 'Restore playlists from a backup file downloaded after a replacement. Each playlist gets back its exact former content.',
  'restore.file': 'Backup file',
  'restore.from': 'Backup from {date} · {playlists}',
  'restore.button': 'Restore {playlists}…',
  'restore.confirm': 'Overwrite the current content of {playlists} with the backup?',
  'restore.yes': 'Yes, restore',


  // workflow
  'wf.changed': 'The playlist changed since the preview. Run the preview again.',
  'wf.verify':
    'Verification failed: the playlist now has {actual} tracks (expected {expected}), first difference at position {pos}. Some tracks may not be accessible to your user.',

  // backup
  'backup.notJson': 'This file is not valid JSON.',
  'backup.notOurs': 'This file is not a playlist backup made by this app.',
  'backup.version': 'Unsupported backup version: {version}.',
  'backup.incomplete': 'The backup is incomplete (missing server, user, date or playlists).',
  'backup.malformed': 'Playlist #{n} in the backup is malformed.',
  'backup.otherServer': 'This backup was made on {backup}, but you are connected to {current}.',
  'backup.otherUser': 'This backup was made by user "{backup}", but you are signed in as "{current}".',

  // server address
  'url.empty': 'Enter the address of your Navidrome server.',
  'url.invalid': 'This server address is not a valid URL.',
  'url.scheme': 'The server address must start with http:// or https://.',

  // errors
  'err.mixed': 'This page is served over HTTPS, so your browser blocks requests to an http:// server.',
  'err.mixedDetail':
    'Serve Navidrome over HTTPS (for example behind a reverse proxy with a certificate) and use https:// in the address. Address entered: {url}',
  'err.cors': 'The server answered, but your browser blocked the response (CORS).',
  'err.corsDetail':
    'Navidrome allows cross-origin requests by itself. A reverse proxy in front of it is probably removing or overriding the Access-Control-* headers, or redirecting to a login page.',
  'err.unreachable': 'Cannot reach {url}.',
  'err.unreachableDetail':
    'Check the address, that the server is running and reachable from this device, and that its HTTPS certificate is valid (open the address in a new tab to check).',
  'err.badCredentials': 'Wrong username or password.',
  'err.badCredentialsOrExpired': 'Wrong username or password, or session expired.',
  'err.notAuthorized': 'You are not allowed to do this.',
  'err.notFound': 'Not found on the server.',
  'err.server': 'Server error: {message}',
  'err.unknown': 'unknown error',
  'err.tooMany': 'Too many login attempts. Wait a minute and try again.',
  'err.http': 'The server returned HTTP {status}.',
  'err.notJson': 'The server sent something that is not JSON.',
  'err.notJsonDetail': 'Is this really a Navidrome address? A reverse proxy login page can also cause this. {body}',
  'err.tooLarge': 'This request is too large for a URL, and the server does not support form POST requests.',
  'err.tooLargeDetail': 'Update Navidrome to a version that supports the OpenSubsonic formPost extension.',
  'err.unexpected': 'Unexpected answer from the Subsonic API.',
  'err.noNative': 'The Navidrome native API is not available in this session.',
  'err.hidden': { one: 'This playlist has {n} hidden entry (probably a missing file).', other: 'This playlist has {n} hidden entries (probably missing files).' },
  'err.hiddenDetail':
    'The Subsonic API does not return missing files, so rewriting it would delete them. Sign in through the Navidrome login (native API) to handle this playlist.',
  'err.emptyWrite': 'Refusing to write an empty playlist.',
  'err.notNavidrome': 'This is a {type} server, not Navidrome.',
} as const
