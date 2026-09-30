#!/bin/bash
# Serves the app on http://localhost:8000 and, if the depth environment is set up,
# starts the depth bridge on http://localhost:8765. Ctrl+C stops both.
#   bash run.sh              app + depth bridge (if available)
#   bash run.sh --no-depth   app only
#   bash run.sh --simulate   app + fake depth stream (no hardware)
PORT=8000
HERE="$(cd "$(dirname "$0")" && pwd)"; cd "$HERE"
PIDS=()
cleanup() { for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; done; }
trap cleanup EXIT INT TERM

PY="$(ls "$HOME"/miniconda3/envs/depth_cam/bin/python "$HOME"/anaconda3/envs/depth_cam/bin/python 2>/dev/null | head -1)"
[ -z "$PY" ] && command -v conda >/dev/null && PY="$(conda run -n depth_cam which python 2>/dev/null)"

case "$1" in
  --no-depth) echo "Depth bridge: off" ;;
  --simulate) python3 tools/depth_bridge.py --simulate 0.9 & PIDS+=($!); echo "Depth bridge: simulation (0.9 m)" ;;
  *) if [ -n "$PY" ]; then "$PY" -u tools/depth_bridge.py & PIDS+=($!); echo "Depth bridge: starting ($PY)"
     else echo "Depth bridge: not set up (run: bash tools/setup_depth.sh). Iris tracking still works."; fi ;;
esac

echo "Open http://localhost:$PORT in Chrome. Press Ctrl+C to stop."
python3 -m http.server $PORT
