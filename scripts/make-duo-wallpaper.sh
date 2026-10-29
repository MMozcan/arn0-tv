#!/bin/sh
# Renders scripts/duo-night.html to src/img/wallpapers/duo-night.jpg (and its Settings thumbnail)
# with headless Chrome (macOS). Its catalog entry in src/js/wallpapers.js is written by hand:
# re-running prepare-wallpapers.mjs regenerates that file, so add the entry back afterwards.
set -eu
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
    --window-size=1920,1080 --virtual-time-budget=2000 --user-data-dir="$tmp/profile" \
    --screenshot="$tmp/duo.png" "file://$PWD/scripts/duo-night.html" >/dev/null 2>&1
sips -s format jpeg -s formatOptions 86 "$tmp/duo.png" --out src/img/wallpapers/duo-night.jpg >/dev/null
sips -Z 320 -s formatOptions 78 src/img/wallpapers/duo-night.jpg --out src/img/wallpapers/thumbs/duo-night.jpg >/dev/null
rm -rf "$tmp"
echo "Wrote src/img/wallpapers/duo-night.jpg"
