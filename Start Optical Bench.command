#!/bin/bash
set -e
cd -- "$(dirname -- "$0")"
if [ -x .venv/bin/python3 ]; then
  optical_python=.venv/bin/python3
else
  optical_python=python3
fi
if ! "$optical_python" -c 'import numpy, scipy' 2>/dev/null; then
  echo "Install the Python dependencies first. See README.md, Quick start."
  read -r -p "Press Return to close. " optical_reply
  exit 1
fi
if [ ! -f dist/index.html ]; then
  echo "Build the browser application first: npm ci && npm run build"
  read -r -p "Press Return to close. " optical_reply
  exit 1
fi
exec "$optical_python" python/server.py
