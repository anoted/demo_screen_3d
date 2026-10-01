#!/usr/bin/env python3
"""Depth bridge (UX 4.4): serves low-resolution depth frames to the browser app.

    python3 tools/depth_bridge.py                  # first OpenNI2 device (Orbbec Astra)
    python3 tools/depth_bridge.py --simulate 0.9   # fake face 0.9 m away, no hardware

Browsers cannot open most depth cameras, so this reads the sensor and streams
frames as server-sent events on http://localhost:8765/stream. Standard library
only; the OpenNI2 backend needs `pip install openni` and the OpenNI2 redist
folder (pass it with --openni-path, or set OPENNI2_REDIST).

Frame message: {"w","h","hfov","unit":"mm","d": base64 little-endian uint16}, 0 = no reading.
"""
import argparse, base64, json, math, os, sys, threading, time
from array import array
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

OUT_W, OUT_H = 160, 120


class Latest:
    """Newest frame, shared with every connected client."""
    def __init__(self):
        self.cond, self.seq, self.payload = threading.Condition(), 0, None

    def put(self, payload):
        with self.cond:
            self.seq += 1
            self.payload = payload
            self.cond.notify_all()

    def wait(self, seq, timeout=2.0):
        with self.cond:
            self.cond.wait_for(lambda: self.seq != seq, timeout)
            return self.seq, self.payload


latest = Latest()
info = {'source': '', 'hfov': 58.6, 'frames': 0, 'started': time.time()}


def encode(samples, hfov):
    if sys.byteorder == 'big':
        samples = array('H', samples); samples.byteswap()
    return json.dumps({'w': OUT_W, 'h': OUT_H, 'hfov': hfov, 'unit': 'mm',
                       'd': base64.b64encode(samples.tobytes()).decode('ascii')})


def downsample(buffer, width, height):
    """Stride-sample a full frame down to OUT_W x OUT_H (no numpy needed)."""
    sx, sy = max(1, width // OUT_W), max(1, height // OUT_H)
    out = array('H')
    for row in range(OUT_H):
        line = buffer[row * sy * width:(row * sy + 1) * width]
        out.extend(line[::sx][:OUT_W])
    return out


def run_simulation(distance, hfov):
    """A tilted wall at 2.2 m with a face-shaped bump at `distance` metres, swaying gently."""
    info['hfov'] = hfov
    t0 = time.time()
    while True:
        t = time.time() - t0
        cx = OUT_W / 2 + math.sin(t * 0.7) * OUT_W * 0.12
        cy = OUT_H / 2 + math.cos(t * 0.5) * OUT_H * 0.06
        d = distance + math.sin(t * 0.4) * 0.05
        samples = array('H', [0]) * (OUT_W * OUT_H)
        for y in range(OUT_H):
            for x in range(OUT_W):
                r = math.hypot((x - cx) / (OUT_W * 0.13), (y - cy) / (OUT_H * 0.30))
                mm = 2200 - x * 1.5
                if r < 1:
                    mm = d * 1000 + 40 * (r * r)
                if not (y % 23 == 0 and x % 31 == 0):  # a few holes, like real sensors
                    samples[y * OUT_W + x] = int(mm)
        latest.put(encode(samples, hfov)); info['frames'] += 1
        time.sleep(1 / 30)


def run_openni(path):
    try:
        from openni import openni2
    except ImportError:
        sys.exit("The 'openni' package is missing: pip install openni  (or use --simulate)")
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [path, os.environ.get('OPENNI2_REDIST'), os.path.join(here, '..', '..', 'camera_tests', 'openni2_redist'), os.path.join(here, 'openni2_redist')]
    redist = next((c for c in candidates if c and os.path.exists(os.path.join(c, 'libOpenNI2.so'))), None)
    if not redist:
        sys.exit('OpenNI2 runtime not found. Run tools/setup_depth.sh, or pass --openni-path <folder with libOpenNI2.so>.')
    info['redist'] = redist
    openni2.initialize(redist)
    try:
        device = openni2.Device.open_any()
    except Exception as error:
        sys.exit(f'No depth camera found ({error}). Is it plugged in, and is the udev rule installed? See tools/setup_depth.sh.')
    stream = device.create_depth_stream()
    stream.set_mirroring_enabled(False)  # the app expects the same orientation as the colour image
    stream.start()
    hfov = math.degrees(stream.get_horizontal_fov())
    info['hfov'] = hfov
    while True:
        frame = stream.read_frame()
        raw = array('H'); raw.frombytes(bytes(frame.get_buffer_as_uint16()))
        latest.put(encode(downsample(raw, frame.width, frame.height), hfov)); info['frames'] += 1


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_GET(self):
        if self.path.startswith('/stream'):
            self.send_response(200); self._cors()
            self.send_header('Content-Type', 'text/event-stream'); self.end_headers()
            seq = 0
            try:
                while True:
                    seq, payload = latest.wait(seq)
                    if payload is None:
                        self.wfile.write(b': waiting for the sensor\n\n')
                    else:
                        self.wfile.write(('data: ' + payload + '\n\n').encode())
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                return
        elif self.path.startswith('/status'):
            body = json.dumps({**info, 'uptime': round(time.time() - info['started'], 1)}).encode()
            self.send_response(200); self._cors()
            self.send_header('Content-Type', 'application/json'); self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404); self.end_headers()

    def log_message(self, *args):
        pass


def guarded(target, *args):
    """Run a sensor loop; a failure ends the whole program with a readable message."""
    try:
        target(*args)
    except SystemExit as error:
        print(error, file=sys.stderr); os._exit(1)
    except Exception as error:
        print(f'Depth sensor failed: {error}', file=sys.stderr); os._exit(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--simulate', type=float, metavar='METRES', help='fake face at this distance instead of a sensor')
    parser.add_argument('--hfov', type=float, default=58.6, help='horizontal FOV reported in simulation (default: Astra Pro 58.6, measured)')
    parser.add_argument('--openni-path', help='OpenNI2 redist folder containing libOpenNI2.so')
    args = parser.parse_args()
    if args.simulate is not None:
        info['source'] = f'simulation {args.simulate} m'
        worker = threading.Thread(target=run_simulation, args=(args.simulate, args.hfov), daemon=True)
    else:
        info['source'] = 'openni2'
        worker = threading.Thread(target=guarded, args=(run_openni, args.openni_path), daemon=True)
    worker.start()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    server.daemon_threads = True
    print(f'Depth bridge ({info["source"]}) on http://localhost:{args.port}  ·  Ctrl+C to stop')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
