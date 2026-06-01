#!/usr/bin/env bash
set -euo pipefail

VERSION=$(grep '"version"' manifest.json | sed 's/.*"version": "\(.*\)".*/\1/')

CHROMIUM_OUT="better-ukg-${VERSION}-edge-chrome.zip"
FIREFOX_OUT="better-ukg-${VERSION}-firefox.zip"

# Pliki wchodzące do każdej paczki
FILES=(
  content.js
  styles.css
  popup.html
  popup.js
  icons
  README.md
)

build_chromium() {
  echo "▶ Edge / Chrome..."
  rm -f "$CHROMIUM_OUT"
  zip -qr "$CHROMIUM_OUT" manifest.json "${FILES[@]}"
  echo "  ✓ $CHROMIUM_OUT ($(du -sh "$CHROMIUM_OUT" | cut -f1))"
}

build_firefox() {
  echo "▶ Firefox..."
  rm -f "$FIREFOX_OUT"
  local TMP
  TMP=$(mktemp -d)

  cp manifest.firefox.json "$TMP/manifest.json"
  cp content.js styles.css popup.html popup.js README.md "$TMP/"
  cp -r icons "$TMP/"

  (cd "$TMP" && zip -qr - .) > "$FIREFOX_OUT"
  rm -rf "$TMP"
  echo "  ✓ $FIREFOX_OUT ($(du -sh "$FIREFOX_OUT" | cut -f1))"
}

build_chromium
build_firefox

echo ""
echo "Gotowe — wersja v${VERSION}"
