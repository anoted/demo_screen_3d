#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
CONCAVE_ENV="${CONCAVE_ENV:-$(pwd)/../.conda/concave-glass}"
if [[ ! -x "$CONCAVE_ENV/bin/python" ]]; then
  echo "Create the environment first (see README, Glass room)." >&2
  exit 1
fi
# Femto Bolt eye tracking helper (depth-rgb) next to the server, unless it is
# already running or DEPTH_RGB=0.
helper=
if [[ "${DEPTH_RGB:-1}" != 0 ]] && ! (: </dev/tcp/127.0.0.1/8766) 2>/dev/null; then
  log="${TMPDIR:-/tmp}/depth-rgb-helper.log"
  bash tools/run_depth_rgb.sh >"$log" 2>&1 &
  helper=$!
  echo "depth-rgb helper starting on http://localhost:8766 (log: $log)"
fi
trap '[[ -z $helper ]] || kill "$helper" 2>/dev/null' EXIT
"$CONCAVE_ENV/bin/python" tools/serve.py "${1:-8000}"
