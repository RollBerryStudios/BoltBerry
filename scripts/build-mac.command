#!/bin/bash
# BoltBerry — local macOS build script.
#
# Builds a packaged BoltBerry .dmg + .zip for macOS using
# electron-builder. Mirrors the CI release.yml job (LFS gate, fuse
# flip via afterPack, codesign config) but runs against the user's
# checkout, so it's the right command for hand-cutting a release
# locally before tagging.
#
# Usage: double-click in Finder, or run from a terminal:
#   ./scripts/build-mac.command
#
# Output: release/*.dmg and release/*.zip (x64 + arm64).
#
# Prerequisites:
#   - Node.js + npm on PATH
#   - Git LFS installed (otherwise resources/token-variants and
#     resources/compendium ship as 130-byte pointer stubs — closes
#     audit BB-004)
#   - Xcode Command-Line Tools (for native module rebuild of
#     better-sqlite3)
#
# Codesigning is intentionally off here (electron-builder.yml has
# `identity: null`); sign with `codesign --force ...` after the .dmg
# is produced if you have a Developer ID identity available.

set -euo pipefail

# Resolve repo root from this script's location so it works whether
# launched via Finder double-click or from any cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

echo "=== BoltBerry — macOS build ==="
echo "Repo: $REPO_ROOT"
echo

# 1. Sanity: Node + npm.
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm not found on PATH. Install Node.js from nodejs.org." >&2
  exit 1
fi
echo "Node:  $(node --version)"
echo "npm:   $(npm --version)"
echo

# 2. LFS gate: refuse to build if any bundled asset is still a
#    pointer stub. Matches the CI step added in audit M1.
echo "Verifying LFS assets…"
stubs=$(find resources/token-variants resources/compendium -type f \
  \( -name '*.webp' -o -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' -o -name '*.pdf' \) \
  -size -1k 2>/dev/null \
  | xargs -I{} sh -c 'head -c 64 "{}" 2>/dev/null | grep -q "git-lfs" && echo "{}"' \
  || true)
if [ -n "$stubs" ]; then
  echo "ERROR: LFS pointer stubs found (the build would ship empty token / PDF resources):" >&2
  echo "$stubs" >&2
  echo >&2
  echo "Fix: install Git LFS (brew install git-lfs) and run 'git lfs pull'." >&2
  exit 1
fi
echo "  OK (no pointer stubs)"
echo

# 3. Install deps. Use npm ci when a lockfile is present so the build
#    is reproducible; fall back to npm install on a fresh clone.
if [ -f package-lock.json ]; then
  echo "Installing dependencies (npm ci)…"
  npm ci
else
  echo "Installing dependencies (npm install)…"
  npm install
fi
echo

# 4. TypeScript build (main + preload + renderer).
echo "[1/3] Building app (npm run build)"
npm run build
echo

# 5. Player-bundle sanity check (the smoke we already had — fails the
#    build if the player.html bundle missed a critical chunk).
echo "[2/3] Checking player bundle"
npm run check:bundle
echo

# 6. Package.
echo "[3/3] Packaging macOS app (electron-builder --mac)"
npx electron-builder --mac dmg zip --x64 --arm64 --publish never
echo

# 7. Summarise outputs.
echo "=== Build complete ==="
echo "Artifacts in release/:"
ls -lh release/*.dmg release/*.zip 2>/dev/null || echo "  (no .dmg/.zip found — check electron-builder output above)"
echo
echo "Verify the fuses are flipped on the packaged app:"
echo "  npx @electron/fuses read --app release/mac-arm64/BoltBerry.app/Contents/MacOS/BoltBerry"
echo
echo "If you have a Developer ID identity, codesign + notarise before distributing:"
echo "  codesign --force --deep --sign \"Developer ID Application: <Name>\" release/mac-arm64/BoltBerry.app"
echo "  xcrun notarytool submit release/BoltBerry-*.dmg --keychain-profile <profile> --wait"
