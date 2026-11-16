#!/bin/sh
# Generate tagged silent audio files for testing: an original album and its remaster.
# Usage: generate-music.sh <output dir>
set -eu
OUT="${1:-./dev/music}"

# silence <file> <seconds> <artist> <album> <year> <disc> <track> <title> [extra ffmpeg args...]
silence() {
  file="$1"; secs="$2"; artist="$3"; album="$4"; year="$5"; disc="$6"; track="$7"; title="$8"
  shift 8
  [ -f "$file" ] && return 0
  mkdir -p "$(dirname "$file")"
  ffmpeg -loglevel error -nostdin -f lavfi -i "anullsrc=r=44100:cl=stereo" -t "$secs" \
    -metadata artist="$artist" -metadata album_artist="$artist" -metadata album="$album" \
    -metadata date="$year" -metadata disc="$disc" -metadata track="$track" -metadata title="$title" \
    "$@" "$file"
}

A="The Test Band"

# Original release, MP3, 5 tracks.
O="$OUT/$A/Great Album (2005)"
silence "$O/01 - Opening.mp3"         3 "$A" "Great Album" 2005 1 1 "Opening"         -c:a libmp3lame -b:a 64k
silence "$O/02 - Rock & Roll.mp3"     4 "$A" "Great Album" 2005 1 2 "Rock & Roll"     -c:a libmp3lame -b:a 64k
silence "$O/03 - Don't Stop.mp3"      5 "$A" "Great Album" 2005 1 3 "Don't Stop"      -c:a libmp3lame -b:a 64k
silence "$O/04 - Ballad.mp3"          6 "$A" "Great Album" 2005 1 4 "Ballad"          -c:a libmp3lame -b:a 64k
silence "$O/05 - Closing Time.mp3"    7 "$A" "Great Album" 2005 1 5 "Closing Time"    -c:a libmp3lame -b:a 64k

# Remaster, FLAC, 6 tracks: "Remastered" suffixes, a renamed track, a bonus track.
R="$OUT/$A/Great Album (2021 Remaster)"
RA="Great Album (2021 Remaster)"
silence "$R/01 - Opening.flac"        3 "$A" "$RA" 2021 1 1 "Opening - 2021 Remaster"
silence "$R/02 - Rock and Roll.flac"  4 "$A" "$RA" 2021 1 2 "Rock and Roll (Remastered)"
silence "$R/03 - Dont Stop.flac"      5 "$A" "$RA" 2021 1 3 "Dont Stop [2021 Remaster]"
silence "$R/04 - Ballad.flac"         6 "$A" "$RA" 2021 1 4 "Ballad for Nobody"
silence "$R/05 - Closing Time.flac"   7 "$A" "$RA" 2021 1 5 "Closing Time"
silence "$R/06 - Demo.flac"           8 "$A" "$RA" 2021 1 6 "Opening (Demo) [Bonus Track]"

# Unrelated tracks, to fill playlists.
X="$OUT/Someone Else/Other Record (2010)"
silence "$X/01 - Elsewhere.mp3"       3 "Someone Else" "Other Record" 2010 1 1 "Elsewhere" -c:a libmp3lame -b:a 64k
silence "$X/02 - Nowhere.mp3"         4 "Someone Else" "Other Record" 2010 1 2 "Nowhere"   -c:a libmp3lame -b:a 64k

# A smart playlist: must never be modified.
[ -f "$OUT/Smart - Test Band.nsp" ] || cat > "$OUT/Smart - Test Band.nsp" <<'EOF'
{ "name": "Smart: Test Band", "all": [{ "is": { "albumartist": "The Test Band" } }] }
EOF

echo "Test music ready in $OUT"
