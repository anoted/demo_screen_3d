#!/usr/bin/env python3
"""Static server for the app plus POST /span: fullscreen the focused browser
window across all monitors (X11, needs python-xlib). Used by the Span button.

Usage: python3 tools/serve.py [PORT]   (default 8000)
"""
import os, sys, json
from urllib.parse import urlsplit
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from display_pair import select_pair

def span(keep_fullscreen=False):
    from Xlib import X, display, protocol
    from Xlib.ext import xinerama
    d = display.Display()
    root = d.screen().root
    screens = xinerama.query_screens(d).screens
    left, right = select_pair(screens)
    active = root.get_full_property(d.intern_atom('_NET_ACTIVE_WINDOW'), X.AnyPropertyType)
    if not active or not active.value[0]:
        raise RuntimeError('no active window')
    window = d.create_resource_object('window', active.value[0])
    def message(kind, data):
        event = protocol.event.ClientMessage(window=window, client_type=d.intern_atom(kind),
                                             data=(32, data + [0] * (5 - len(data))))
        root.send_event(event, event_mask=X.SubstructureRedirectMask | X.SubstructureNotifyMask)
    fs = d.intern_atom('_NET_WM_STATE_FULLSCREEN')
    if not keep_fullscreen:
        message('_NET_WM_STATE', [0, fs, 0, 1])  # legacy Span behavior
        d.sync()
    message('_NET_WM_FULLSCREEN_MONITORS', [left, left, left, right, 1])
    message('_NET_WM_STATE', [1, fs, 0, 1])
    d.sync()
    return f'Spanning monitors {left}..{right}.'

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Revalidate app files so edits load on reload instead of stale cached code.
        if self.command in ('GET', 'HEAD'):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def do_POST(self):
        # Calibration images stay on the local server. Reject cross-origin POSTs.
        origin = self.headers.get('Origin')
        if origin and urlsplit(origin).netloc != self.headers.get('Host'):
            return self.send_error(403)
        if self.path.startswith('/calibration/'):
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 24_000_000:
                    return self.send_error(413)
                data = json.loads(self.rfile.read(length))
                if self.path == '/calibration/span':
                    result = {'message': span(keep_fullscreen=True)}
                else:
                    from screen_calibration import dispatch
                    result = dispatch(self.path, data)
                body, code = json.dumps(result, allow_nan=False), 200
            except ImportError:
                body, code = json.dumps({'error': 'Start bash tools/run_glass.sh using the concave-glass conda environment.'}), 503
            except Exception as error:
                body, code = json.dumps({'error': str(error)}), 422
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers(); self.wfile.write(body.encode())
            return
        if self.path != '/span':
            return self.send_error(404)
        try: body, code = span(), 200
        except Exception as error: body, code = f'{type(error).__name__}: {error}', 500
        self.send_response(code); self.send_header('Content-Type', 'text/plain')
        self.end_headers(); self.wfile.write(body.encode())

if __name__ == '__main__':
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8000), Handler).serve_forever()
