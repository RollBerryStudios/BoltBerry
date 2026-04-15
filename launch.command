#!/bin/bash
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
cd ~/BoltBerry
echo "=== BoltBerry Launcher ==="
echo "Installing dependencies..."
npm install
echo "Starting BoltBerry in dev mode..."
npm run dev
