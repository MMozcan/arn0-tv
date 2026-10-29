#!/bin/sh
# Renders scripts/duo-day.html and scripts/duo-night.html to src/img/wallpapers/duo-*.jpg (and
# their Settings thumbnails) with headless Chrome (macOS). Their catalog entries in
# src/js/wallpapers.js are written by hand: re-running prepare-wallpapers.mjs regenerates that
# file, so add them back afterwards.
set -eu
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
for name in duo-day duo-night; do
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
        --window-size=1920,1080 --virtual-time-budget=2000 --user-data-dir="$tmp/profile" \
        --screenshot="$tmp/$name.png" "file://$PWD/scripts/$name.html" >/dev/null 2>&1
    sips -s format jpeg -s formatOptions 86 "$tmp/$name.png" --out "src/img/wallpapers/$name.jpg" >/dev/null
    sips -Z 320 -s formatOptions 78 "src/img/wallpapers/$name.jpg" --out "src/img/wallpapers/thumbs/$name.jpg" >/dev/null
    echo "Wrote src/img/wallpapers/$name.jpg"
done
rm -rf "$tmp"
