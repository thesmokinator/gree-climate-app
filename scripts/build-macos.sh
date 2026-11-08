#!/usr/bin/env bash
#
# Build and package Gree Climate for macOS (unsigned distribution).
#
# Usage:
#   npm run dist:mac
#   bash scripts/build-macos.sh
#
# What it does:
#   1. Builds the frontend (tsc + vite).
#   2. Builds the macOS .app and .dmg via Tauri.
#   3. Applies an ad-hoc signature (codesign -s -) so the app
#      runs without a paid Apple Developer certificate.
#   4. Packs a distributable .zip (ditto, keeps symlinks) plus
#      SHA-256 checksums into dist-release/.
#
# The app is NOT notarized: on first launch macOS Gatekeeper will
# block it. Recipients clear the quarantine flag with:
#   xattr -c "/Applications/Gree Climate.app"
# then right-click the app -> Open.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP_NAME="Gree Climate"
VERSION="$(node -p "require('./package.json').version")"
OUT_DIR="$ROOT/dist-release"
BUNDLE_DIR="$ROOT/src-tauri/target/release/bundle"
APP_BUNDLE="$BUNDLE_DIR/macos/$APP_NAME.app"

for cmd in npm npx codesign ditto shasum; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing required tool: $cmd" >&2; exit 1; }
done

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This script must run on macOS (needs codesign/ditto)." >&2
  exit 1
fi

echo "==> Building frontend…"
npm run build

echo "==> Building macOS bundles (.app + .dmg)…"
# The .dmg step (bundle_dmg.sh) drives Finder via AppleScript and fails
# intermittently on recent macOS. The .zip is the primary artifact, so
# tolerate a bundling failure as long as the .app itself was produced.
if ! npx tauri build; then
  if [[ -d "$APP_BUNDLE" ]]; then
    echo "Warning: 'tauri build' reported an error but $APP_NAME.app exists; continuing…" >&2
  else
    echo "Build failed and no .app was produced." >&2
    exit 1
  fi
fi

if [[ ! -d "$APP_BUNDLE" ]]; then
  echo "Expected bundle not found: $APP_BUNDLE" >&2
  exit 1
fi

echo "==> Ad-hoc signing (no Developer ID)…"
codesign --force --deep --sign - "$APP_BUNDLE"
codesign --verify --verbose "$APP_BUNDLE"

# Drop local quarantine flags so the app launches on this machine.
xattr -cr "$APP_BUNDLE" || true

DMG="$(ls -t "$BUNDLE_DIR"/dmg/*.dmg 2>/dev/null | head -n 1 || true)"
if [[ -z "${DMG:-}" ]]; then
  echo "Warning: no .dmg found in $BUNDLE_DIR/dmg" >&2
fi

mkdir -p "$OUT_DIR"
ZIP="$OUT_DIR/Gree-Climate-${VERSION}-macos.zip"
rm -f "$ZIP" "$OUT_DIR"/SHA256SUMS-*.txt

echo "==> Packing $ZIP…"
ditto -c -k --keepParent --norsrc "$APP_BUNDLE" "$ZIP"

if [[ -n "${DMG:-}" ]]; then
  cp "$DMG" "$OUT_DIR/"
fi

cd "$OUT_DIR"
shasum -a 256 ./*.zip ./*.dmg 2>/dev/null > "SHA256SUMS-${VERSION}.txt" || true
cd "$ROOT"

echo ""
echo "Done. Artifacts in $OUT_DIR:"
ls -lh "$OUT_DIR"
echo ""
echo "Recipients on another Mac must clear the quarantine flag once:"
echo "  xattr -c \"/Applications/$APP_NAME.app\""
echo "then right-click the app -> Open."
