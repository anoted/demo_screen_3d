"""Throwaway placement test for camera auto-calibration (UX §4.3).

Shows the tracking camera (Astra) and calibration camera (Lenovo) side by
side, detects the lab ChArUco board in both, and reports per camera:
corners, markers, px per marker cell (readability), approx. distance and
board angle. Goal: find a placement where BOTH cameras read OK at once,
and the calibration camera also sees both screens fully.

Keys: s = save snapshot + log line, q / Esc = quit.
Snapshots and placement_log_<board>.csv go to --out (default:
calibration/captures/<today>/).
"""
import argparse, csv, math, os, time
# OpenCV's bundled Qt ships no fonts; point it at the system ones (silences warnings).
os.environ.setdefault('QT_QPA_FONTDIR', '/usr/share/fonts/truetype/dejavu')
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
# cols, rows, square m, marker m, dictionary, bits per side
BOARDS = {'a4': (7, 5, 0.038, 0.028, cv2.aruco.DICT_4X4_50, 4),        # charuco_a4_7x5_38mm_4x4.pdf
          'lab': (9, 7, 0.0235, 0.013, cv2.aruco.DICT_6X6_250, 6)}     # the lab's small board
COLS, ROWS, SQUARE_M, MARKER_M, DICT, BITS = BOARDS['a4']
CELLS = BITS + 2                               # bits + black border
N_MARKERS, N_CORNERS = (COLS * ROWS) // 2, (COLS - 1) * (ROWS - 1)
MIN_CORNERS, MIN_PX_CELL, MAX_ANGLE = 8, 3.0, 70.0


def find_node(name):
    # Device numbers change when a camera is replugged; match by name instead.
    # Each UVC camera has two nodes; the capture node has index 0.
    if name.startswith('/dev/'):
        return name
    base = '/sys/class/video4linux'
    for node in sorted(os.listdir(base), key=lambda n: int(n[5:])):
        read = lambda f: open(os.path.join(base, node, f)).read().strip()
        if name.lower() in read('name').lower() and read('index') == '0':
            return '/dev/' + node
    raise SystemExit(f'No camera named "{name}" found. Is it plugged in?')


def open_cam(dev, w, h, fps=15):
    dev = find_node(dev)
    print(f'{dev}: opening')
    cap = cv2.VideoCapture(dev, cv2.CAP_V4L2)
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, w)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h)
    # 15 fps: two 1080p30 streams don't fit on one USB 2.0 hub.
    cap.set(cv2.CAP_PROP_FPS, fps)
    if not cap.isOpened():
        raise SystemExit(f'Cannot open {dev}. Is the app (browser tab) still using it?')
    return cap


def intrinsics(w, h, hfov):
    # Pinhole guess from the horizontal FOV; good enough for distance/angle.
    f = (w / 2) / math.tan(math.radians(hfov) / 2)
    return np.array([[f, 0, w / 2], [0, f, h / 2], [0, 0, 1]], np.float64)


def analyse(img, det, board, K):
    cc, ci, mc, mi = det.detectBoard(img)
    # OpenCV 5 returns flat arrays; draw/match want the (N,1,2) / (N,1) shapes.
    if ci is not None: cc, ci = cc.reshape(-1, 1, 2).astype(np.float32), ci.reshape(-1, 1).astype(np.int32)
    if mi is not None: mi = mi.reshape(-1, 1).astype(np.int32)
    r = dict(corners=0 if ci is None else len(ci), markers=0 if mi is None else len(mi),
             px_cell=0.0, dist=None, angle=None)
    if mc is not None and len(mc):
        sides = [np.linalg.norm(np.roll(m.reshape(4, 2), -1, 0) - m.reshape(4, 2), axis=1).mean() for m in mc]
        r['px_cell'] = float(np.mean(sides)) / CELLS
        cv2.aruco.drawDetectedMarkers(img, mc, mi)
    if ci is not None and len(ci) >= 6:
        cv2.aruco.drawDetectedCornersCharuco(img, cc, ci, (0, 255, 0))
        obj, pts = board.matchImagePoints(cc, ci)
        ok, rvec, tvec = cv2.solvePnP(obj, pts, K, None)
        if ok:
            R, _ = cv2.Rodrigues(rvec)
            centre = R @ np.array([COLS * SQUARE_M / 2, ROWS * SQUARE_M / 2, 0]) + tvec.ravel()
            normal = R[:, 2]
            r['dist'] = float(np.linalg.norm(centre))
            r['angle'] = math.degrees(math.acos(min(1, abs(normal @ centre) / np.linalg.norm(centre))))
    if r['corners'] == 0:
        r['status'], r['why'] = 'NO BOARD', ''
    else:
        why = []
        if r['corners'] < MIN_CORNERS: why.append(f'corners<{MIN_CORNERS}')
        if r['px_cell'] < MIN_PX_CELL: why.append('too far / small')
        if r['angle'] is not None and r['angle'] > MAX_ANGLE: why.append('too edge-on')
        r['status'], r['why'] = ('OK', '') if not why else ('WEAK', ', '.join(why))
    return r


def overlay(img, name, r, scale):
    col = {'OK': (0, 200, 0), 'WEAK': (0, 170, 255), 'NO BOARD': (0, 0, 255)}[r['status']]
    lines = [f"{name}: {r['status']} {r['why']}",
             f"corners {r['corners']}/{N_CORNERS}  markers {r['markers']}/{N_MARKERS}  {r['px_cell']:.1f} px/cell (need 3)",
             'dist ' + ('-' if r['dist'] is None else f"{r['dist']*100:.0f} cm") +
             '   angle ' + ('-' if r['angle'] is None else f"{r['angle']:.0f} deg") + ' (approx, assumed FOV)']
    s = 1.2 / scale
    for i, t in enumerate(lines):
        y = int((40 + i * 42) / scale)
        cv2.putText(img, t, (15, y), cv2.FONT_HERSHEY_SIMPLEX, s, (0, 0, 0), int(6 / scale) + 1)
        cv2.putText(img, t, (15, y), cv2.FONT_HERSHEY_SIMPLEX, s, col, int(2 / scale) + 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--track', default='Astra', help='tracking camera: name or /dev/videoN')
    ap.add_argument('--calib', default='Lenovo', help='calibration camera: name or /dev/videoN')
    ap.add_argument('--width', type=int, default=1920)
    ap.add_argument('--height', type=int, default=1080)
    ap.add_argument('--board', choices=BOARDS, default='a4', help='a4 = printed 7x5, lab = small 9x7')
    ap.add_argument('--fps', type=int, default=15, help='15 fits both cameras on one USB 2.0 hub')
    ap.add_argument('--track-fov', type=float, default=60, help='approx. horizontal FOV, deg')
    ap.add_argument('--out', default=os.path.join(HERE, '..', 'captures', time.strftime('%Y-%m-%d')),
                    help='folder for snapshots and the log')
    ap.add_argument('--calib-fov', type=float, default=70, help='approx. horizontal FOV, deg')
    a = ap.parse_args()
    global COLS, ROWS, SQUARE_M, MARKER_M, DICT, BITS, CELLS, N_MARKERS, N_CORNERS
    COLS, ROWS, SQUARE_M, MARKER_M, DICT, BITS = BOARDS[a.board]
    CELLS, N_MARKERS, N_CORNERS = BITS + 2, (COLS * ROWS) // 2, (COLS - 1) * (ROWS - 1)
    print(f'board {a.board}: {COLS}x{ROWS}, {SQUARE_M*1000:g} mm squares, {MARKER_M*1000:g} mm markers')

    board = cv2.aruco.CharucoBoard((COLS, ROWS), SQUARE_M, MARKER_M,
                                   cv2.aruco.getPredefinedDictionary(DICT))
    det = cv2.aruco.CharucoDetector(board)
    # [label, capture, fov, camera name, last reconnect attempt, dropouts]
    cams = [['TRACKING (Astra)', open_cam(a.track, a.width, a.height, a.fps), a.track_fov, a.track, 0, 0],
            ['CALIBRATION (Lenovo)', open_cam(a.calib, a.width, a.height, a.fps), a.calib_fov, a.calib, 0, 0]]
    for name, cap, *_ in cams:
        print(f"{name}: {int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}")

    os.makedirs(a.out, exist_ok=True)
    log_path = os.path.join(a.out, f'placement_log_{a.board}.csv')
    new_log = not os.path.exists(log_path) or os.path.getsize(log_path) == 0
    log = open(log_path, 'a', newline='')
    writer = csv.writer(log)
    if new_log:
        writer.writerow(['time', 'camera', 'res', 'status', 'corners', 'markers', 'px_cell', 'dist_cm', 'angle_deg', 'note'])

    cv2.namedWindow('placement', cv2.WINDOW_NORMAL)
    while True:
        frames, results = [], []
        for cam in cams:
            name, cap, fov = cam[:3]
            ok, img = cap.read() if cap is not None else (False, None)
            if not ok:
                # Camera dropped (e.g. USB bandwidth): release it and retry every 2 s.
                if cap is not None:
                    cap.release(); cam[1] = None; cam[5] += 1
                    print(f'{name}: lost camera (dropout {cam[5]}), reconnecting...')
                if time.time() - cam[4] > 2:
                    cam[4] = time.time()
                    try: cam[1] = open_cam(cam[3], a.width, a.height, a.fps)
                    except SystemExit as e: print(e)
                img = np.zeros((a.height, a.width, 3), np.uint8)
                results.append(dict(status='NO BOARD', why='CAMERA DISCONNECTED - reconnecting', corners=0, markers=0, px_cell=0, dist=None, angle=None))
            else:
                h, w = img.shape[:2]
                results.append(analyse(img, det, board, intrinsics(w, h, fov)))
            scale = img.shape[1] / 960
            overlay(img, name, results[-1], 1 / scale)
            frames.append(cv2.resize(img, (960, int(img.shape[0] * 960 / img.shape[1]))))
        hmax = max(f.shape[0] for f in frames)
        frames = [cv2.copyMakeBorder(f, 0, hmax - f.shape[0], 0, 0, cv2.BORDER_CONSTANT) for f in frames]
        view = np.hstack(frames)
        both = all(r['status'] == 'OK' for r in results)
        banner = 'BOTH OK - press s to save' if both else 'Need OK on both cameras  (s = save, q = quit)'
        bar = np.full((50, view.shape[1], 3), (0, 120, 0) if both else (40, 40, 40), np.uint8)
        cv2.putText(bar, banner + '   |  Lenovo must also see BOTH screens fully', (15, 34),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
        cv2.imshow('placement', np.vstack([bar, view]))
        k = cv2.waitKey(1) & 0xFF
        if k in (ord('q'), 27):
            break
        if k == ord('s'):
            stamp = time.strftime('%H%M%S')
            cv2.imwrite(os.path.join(a.out, f'snap_{stamp}.jpg'), view)
            for (name, cap, *_), r in zip(cams, results):
                res = '' if cap is None else f"{int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}"
                row = [stamp, name, res, r['status'], r['corners'], r['markers'], f"{r['px_cell']:.1f}",
                       '' if r['dist'] is None else f"{r['dist']*100:.0f}",
                       '' if r['angle'] is None else f"{r['angle']:.0f}", r['why']]
                writer.writerow(row); print(row)
            log.flush()
    for name, cap, *_, drops in cams:
        if cap is not None: cap.release()
        print(f'{name}: {drops} dropouts')
    log.close()
    cv2.destroyAllWindows()
    print(f'Log: {log_path}')


if __name__ == '__main__':
    main()
