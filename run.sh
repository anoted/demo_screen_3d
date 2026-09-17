#!/bin/bash
# run.sh - serves the webapp directory using python's http.server

PORT=8000
echo "Starting local web server on port $PORT..."
echo "Open http://localhost:$PORT in your web browser (Chrome/Firefox)."
echo "Press Ctrl+C to stop the server."

# Start the python HTTP server
python3 -m http.server $PORT
