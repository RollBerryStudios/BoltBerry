#!/bin/bash
# BoltBerry — local Linux build script.
#
# Builds a packaged BoltBerry .AppImage + .deb for Linux using
# electron-builder. Mirrors the CI release.yml Linux job (LFS gate,
# fuse flip via afterPack) and runs against the user's checkout.
#
# Usage:
#   ./scripts/build-linux.sh
#
# Output: release/*.AppImage and release/*.deb (x64).
#
# Prerequisites:
#   - Node.js + npm on PATH
#   - Git LFS installed (otherwise resources/token-variants and
#     resources/compendium ship as 130-byte pointer stubs — closes
#     audit BB-004)
#   - Build tooling for native modules (build-essential / python3 /
#     fakeroot / dpkg / rpm). On Debian / Ubuntu:
#       sudo apt-get install -y build-essential python3 rpm fakeroot dpkg

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

echo "=== BoltBerry — Linux build ==="
echo "Repo: $REPO_ROOT"
echo

# 1. Sanity: Node + npm.
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm not found on PATH. Install Node.js (e.g. via nvm)." >&2
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
  echo "Fix: install Git LFS and run 'git lfs pull'." >&2
  echo "  Debian/Ubuntu:  sudo apt-get install git-lfs && git lfs install && git lfs pull" >&2
  exit 1
fi
echo "  OK (no pointer stubs)"
echo

# 3. Install deps.
if [ -f package-lock.json ]; then
  echo "Installing dependencies (npm ci)…"
  npm ci
else
  echo "Installing dependencies (npm install)…"
  npm install
fi
echo

# 4. TypeScript build.
echo "[1/3] Building app (npm run build)"
npm run build
echo

# 5. Player-bundle sanity check.
echo "[2/3] Checking player bundle"
npm run check:bundle
echo

# 6. Package. AppImage + deb match release.yml; add `rpm` here too if
#    you ever need a Red Hat / Fedora artifact.
echo "[3/3] Packaging Linux app (electron-builder --linux AppImage deb)"
npx electron-builder --linux AppImage deb --x64 --publish never
echo

# 7. Summarise outputs.
echo "=== Build complete ==="
echo "Artifacts in release/:"
ls -lh release/*.AppImage release/*.deb 2>/dev/null || echo "  (no .AppImage/.deb found — check electron-builder output above)"
echo
echo "Verify the fuses are flipped on the packaged binary:"
echo "  npx @electron/fuses read --app release/linux-unpacked/boltberry"
echo
echo "AppImage is unsigned by default. Distribute alongside a detached"
echo "GPG signature if you want users to verify integrity:"
echo "  gpg --detach-sign --armor release/BoltBerry-*.AppImage"
