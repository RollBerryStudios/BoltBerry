#!/bin/bash
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
cd ~/BoltBerry
echo "=== BoltBerry QA Launch ==="
echo "Starting Vite dev server..."
node_modules/.bin/vite --config vite.config.ts &
VITE_PID=$!
echo "Waiting for Vite (port 5173)..."
# Wait until port 5173 is ready
for i in {1..30}; do
  if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo "Vite ready!"
    break
  fi
  sleep 1
done
echo "Launching Electron..."
./node_modules/.bin/electron .
kill $VITE_PID 2>/dev/null
