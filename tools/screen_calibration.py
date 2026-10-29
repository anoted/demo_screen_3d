"""Metric screen ChArUco calibration. All internal distances are metres.

Board axes: x right, y down, z into the display. World: x right, y up,
z toward viewer. Screen size is measured input, never estimated scale.
"""
import base64
import math
import cv2 as cv
import numpy as np

# Reserve IDs above 99: older printed targets beside this rig use 0–99.
DICTIONARY = cv.aruco.getPredefinedDictionary(cv.aruco.DICT_4X4_250)
MONITOR_DICTIONARY = cv.aruco.getPredefinedDictionary(cv.aruco.DICT_4X4_50)
MONITOR_SPEC = dict(squares=[7, 5], squareMm=35, markerMm=28, dictionary='DICT_4X4_50')


def config(raw):
    values = {k: float(raw[k]) for k in ('width', 'height', 'pixelWidth', 'pixelHeight')}
    if not all(math.isfinite(v) for v in values.values()):
        raise ValueError('Screen dimensions must be finite.')
    w, h, pw, ph = (values[k] for k in values)
    if not (20 <= w <= 150 and 30 <= h <= 250 and 400 <= pw <= 4096 and 600 <= ph <= 7680):
        raise ValueError('Screen size or resolution is outside supported limits.')
    if pw != int(pw) or ph != int(ph) or abs((w / pw) / (h / ph) - 1) > .015:
        raise ValueError('Physical and pixel aspect ratios disagree. Enter active display size and portrait resolution.')
    return dict(width=w / 100, height=h / 100, pw=int(pw), ph=int(ph))


def board_spec(cfg, side):
    if side == 'monitor':
        return cv.aruco.CharucoBoard((7, 5), .035, .028, MONITOR_DICTIONARY), (0., 0.), None
    if side == 'shared':
        return cv.aruco.CharucoBoard((5, 7), .03, .021, DICTIONARY, np.arange(164, 181, dtype=np.int32)), (0., 0.), 100
    px = int(min(cfg['pw'] * .82 / 5, cfg['ph'] * .82 / 9))
    # Slight measured pixel-aspect differences are included in object points below.
    square = px * cfg['width'] / cfg['pw']
    start = 100 if side == 'left' else 132
    board = cv.aruco.CharucoBoard((5, 9), square, square * .7, DICTIONARY, np.arange(start, start + 22, dtype=np.int32))
    offset = ((cfg['pw'] - px * 5) // 2, (cfg['ph'] - px * 9) // 2)
    return board, offset, px


def points(cfg, side, ids):
    board, _, _ = board_spec(cfg, side)
    obj = board.getChessboardCorners()[np.asarray(ids, dtype=int).reshape(-1)].copy()
    if side not in ('shared', 'monitor'):
        obj[:, 1] *= (cfg['height'] / cfg['ph']) / (cfg['width'] / cfg['pw'])
    return obj


def pattern(raw, side):
    if side not in ('left', 'right', 'shared'):
        raise ValueError('Unknown board.')
    cfg = config(raw)
    board, offset, px = board_spec(cfg, side)
    if side == 'shared':
        # 170 x 230 mm including a 10 mm white border. Print at that size.
        img = board.generateImage((500, 700), marginSize=0)
        img = cv.copyMakeBorder(img, 33, 33, 33, 33, cv.BORDER_CONSTANT, value=255)
    else:
        img = np.full((cfg['ph'], cfg['pw']), 255, np.uint8)
        x, y = offset
        img[y:y+px*9, x:x+px*5] = board.generateImage((px*5, px*9), marginSize=0)
    ok, data = cv.imencode('.png', img)
    if not ok:
        raise ValueError('Could not generate pattern.')
    return {'image': 'data:image/png;base64,' + base64.b64encode(data).decode(),
            'squareMm': 30 if side == 'shared' else px * cfg['width'] / cfg['pw'] * 1000,
            'printWidthMm': 169.8 if side == 'shared' else None,
            'printHeightMm': 229.8 if side == 'shared' else None}


def decode(value):
    if not isinstance(value, str) or len(value) > 16_000_000:
        raise ValueError('Camera image is missing or too large.')
    data = base64.b64decode(value.split(',')[-1], validate=True)
    img = cv.imdecode(np.frombuffer(data, np.uint8), cv.IMREAD_GRAYSCALE)
    if img is None or max(img.shape) > 4096:
        raise ValueError('Camera image must be at most 4096 pixels per side.')
    return img


def detect_one(img, cfg, side):
    board, _, _ = board_spec(cfg, side)
    corners, ids, _, _ = cv.aruco.CharucoDetector(board).detectBoard(img)
    if ids is None or len(ids) < 10:
        raise ValueError(f'{side.title()} board: need at least 10 clear corners. Reduce glare and show the whole board.')
    obj = points(cfg, side, ids)
    if np.linalg.matrix_rank(obj[:, :2] - obj[:, :2].mean(axis=0), tol=1e-5) < 2:
        raise ValueError(f'{side.title()} corners must span rows and columns.')
    xy = corners.reshape(-1, 2)
    if np.ptp(xy[:, 0]) < 70 or np.ptp(xy[:, 1]) < 70:
        raise ValueError(f'{side.title()} board is too small in the camera image. Move closer.')
    return {'ids': ids.reshape(-1).tolist(), 'corners': xy.tolist()}


def detect(raw):
    cfg = config(raw['screen'])
    img = decode(raw['image'])
    result = {'size': [img.shape[1], img.shape[0]],
              'left': detect_one(img, cfg, 'left'), 'right': detect_one(img, cfg, 'right')}
    # The physical rig also has an identical printed target on the wall.
    # Restrict this reference to the left of the central left display, so
    # repeated IDs on that wall cannot corrupt interpolation or pose.
    edge = int(min(p[0] for p in result['left']['corners'])) - 10
    if edge >= 100:
        try:
            result['monitor'] = detect_one(img[:, :edge], cfg, 'monitor')
        except ValueError:
            pass  # optional equipment reference never blocks screen capture
    if raw.get('trackingImage'):
        other = decode(raw['trackingImage'])
        result.update(shared=detect_one(img, cfg, 'shared'), tracking=detect_one(other, cfg, 'shared'),
                      trackingSize=[other.shape[1], other.shape[0]])
    return result


def observation(cfg, side, value):
    ids = np.asarray(value['ids'])
    xy = np.asarray(value['corners'], dtype=np.float32).reshape(-1, 2)
    count = 24 if side in ('shared', 'monitor') else 32
    if len(ids) < 10 or len(ids) != len(xy) or len(set(ids.tolist())) != len(ids) or not np.isfinite(xy).all():
        raise ValueError('Invalid detected corners.')
    if not np.issubdtype(ids.dtype, np.integer) or (ids < 0).any() or (ids >= count).any():
        raise ValueError('Invalid corner IDs.')
    return points(cfg, side, ids), xy


def intrinsics(cfg, frames, tracking=False):
    objects, images = [], []
    key = 'trackingSize' if tracking else 'size'
    size = tuple(frames[0][key])
    if len(size) != 2 or not all(isinstance(n, int) and 100 <= n <= 4096 for n in size):
        raise ValueError('Invalid camera resolution.')
    for f in frames:
        if tuple(f[key]) != size:
            raise ValueError('Camera resolution changed. Reset and capture again.')
        sides = ['tracking'] if tracking else ['left', 'right']
        if not tracking and f.get('monitor'):
            sides.append('monitor')
        for side in sides:
            obj, xy = observation(cfg, 'shared' if tracking else side, f[side])
            objects.append(obj); images.append(xy)
    # Constrain high-order distortion: screen captures rarely constrain it well.
    flags = cv.CALIB_FIX_K3 | cv.CALIB_ZERO_TANGENT_DIST
    rms, K, D, _, _ = cv.calibrateCamera(objects, images, size, None, None, flags=flags)
    fov = math.degrees(2 * math.atan(size[0] / (2 * K[0, 0])))
    if not np.isfinite(K).all() or rms > 1.5 or not 25 < fov < 125 or not .75 < K[0, 0]/K[1, 1] < 1.25:
        raise ValueError('Intrinsics are unreliable. Capture more varied distances and tilts; avoid glare/blur.')
    if not 0 < K[0, 2] < size[0] or not 0 < K[1, 2] < size[1] or np.max(np.abs(D)) > 2:
        raise ValueError('Unstable lens calibration. Use more varied views.')
    return K, D, float(rms), fov


def pose(cfg, side, observation_data, K, D):
    obj, xy = observation(cfg, side, observation_data)
    ok, r, t = cv.solvePnP(obj, xy, K, D)
    if not ok or t[2, 0] <= 0:
        raise ValueError('Board pose could not be solved in front of the camera.')
    projected, _ = cv.projectPoints(obj, r, t, K, D)
    error = float(np.sqrt(np.mean(np.sum((projected.reshape(-1, 2)-xy)**2, axis=1))))
    if error > 1.5:
        raise ValueError('Board reprojection error exceeds 1.5 pixels.')
    M = np.eye(4); M[:3, :3] = cv.Rodrigues(r)[0]; M[:3, 3] = t[:, 0]
    return M, error


def unit(v):
    n = np.linalg.norm(v)
    if n < 1e-8:
        raise ValueError('Degenerate screen geometry.')
    return v / n


def screen_frame(cfg, left, right):
    origins = []
    for side, M in [('left', left), ('right', right)]:
        _, (px, py), _ = board_spec(cfg, side)
        origins.append(M[:3, 3] - M[:3, :3] @ np.array([px*cfg['width']/cfg['pw'], py*cfg['height']/cfg['ph'], 0]))
    ul, ur = -left[:3, 1], -right[:3, 1]
    if np.dot(ul, ur) < math.cos(math.radians(2)):
        raise ValueError('Panels have relative roll/tilt above 2°. Align them upright first.')
    y = unit(ul + ur)
    lo, ro = -left[:3, 0], right[:3, 0]
    angle = math.degrees(math.acos(float(np.clip(np.dot(lo, ro), -1, 1))))
    # For nearly flat displays use the front normals instead of a vanishing bisector.
    z = unit(-(left[:3, 2] + right[:3, 2])); x = unit(np.cross(y, z)); z = unit(np.cross(x, y))
    li = origins[0] + left[:3, 0] * cfg['width']; ri = origins[1]
    delta = ri - li
    gap, vertical, depth = float(delta @ x), float(delta @ y), float(delta @ z)
    if abs(depth) > .01:
        raise ValueError('Inner edges differ in depth by over 1 cm; this renderer requires a symmetric pair.')
    if not 30 <= angle <= 179.9 or not -.002 <= gap <= .2 or abs(vertical) > .2:
        raise ValueError('Solved geometry is outside the supported angle/gap/offset range.')
    gap = max(0., gap)
    inner_depth = gap / (2 * math.tan(math.radians(angle/2)))
    origin = (li + ri) / 2 - y*cfg['height']/2 - z*inner_depth
    world = np.eye(4); world[:3, :3] = np.column_stack([x, y, z]); world[:3, 3] = origin
    return {'angle': angle, 'gap': gap*100, 'vOffset': vertical*100}, world


def camera_fields(camera_to_world, cfg, vertical, fov):
    p = camera_to_world[:3, 3]; forward = camera_to_world[:3, 2]
    return dict(x=float(p[0]*100), top=float(p[1]*100-cfg['height']*50-abs(vertical)/2),
                forward=float(p[2]*100), yaw=math.degrees(math.atan2(forward[0], forward[2])),
                tilt=math.degrees(math.asin(float(np.clip(-forward[1], -1, 1)))), fov=float(fov))


def monitor_reference(cfg, frames, worlds, K, D):
    """Known-size board plane on the left monitor, in the display frame."""
    candidates = []
    for frame, world in zip(frames, worlds):
        if not frame.get('monitor'):
            continue
        try:
            board, error = pose(cfg, 'monitor', frame['monitor'], K, D)
        except (ValueError, KeyError, TypeError):
            continue
        matrix = np.linalg.inv(world) @ board
        center = (matrix @ np.array([.245/2, .175/2, 0, 1]))[:3]
        # It is an auxiliary left-monitor reference, not the board on the wall.
        if not np.isfinite(center).all() or center[0] >= -.1 or np.max(np.abs(center)) > 5:
            continue
        candidates.append((matrix, center, error))
    if not candidates:
        return None
    centers = np.array([c[1] for c in candidates])
    if np.max(np.std(centers, axis=0)) > .02:
        return None  # a moved board/monitor must not supply a fixed room depth
    median = np.median(centers, axis=0)
    matrix, center, error = min(candidates, key=lambda c: np.linalg.norm(c[1]-median))
    return {**MONITOR_SPEC, 'matrix': matrix.tolist(), 'centerCm': (center*100).tolist(),
            'rms': error, 'views': len(candidates)}


def solve(raw):
    cfg = config(raw['screen']); frames = raw['frames']
    if not isinstance(frames, list) or not 8 <= len(frames) <= 30:
        raise ValueError('Capture 8–30 distinct views first.')
    K, D, rms, fov = intrinsics(cfg, frames)
    geometries, worlds = [], []
    for f in frames:
        left, _ = pose(cfg, 'left', f['left'], K, D); right, _ = pose(cfg, 'right', f['right'], K, D)
        geometry, world = screen_frame(cfg, left, right)
        geometries.append([geometry[k] for k in ('angle', 'gap', 'vOffset')]); worlds.append(world)
    spread = np.std(geometries, axis=0)
    if np.any(spread > [1.5, 1., 1.]):
        raise ValueError('Relative screen measurements vary too much. Keep displays fixed and collect sharper views.')
    # Reject nearly identical poses even if repeated observations have a tiny RMS.
    normals = np.array([M[:3, 2] for M in worlds])
    if np.max(np.linalg.norm(normals - normals[0], axis=1)) < .12:
        raise ValueError('Views need more angular diversity. Move the second camera sideways and tilt it between captures.')
    result = {'screen': dict(zip(('angle', 'gap', 'vOffset'), np.median(geometries, axis=0).tolist())),
              'rms': rms, 'views': len(frames), 'spread': spread.tolist(),
              'intrinsics': {'matrix': K.tolist(), 'distortion': D.tolist(), 'size': frames[0]['size']},
              'calibrationCamera': {'matrix': np.linalg.inv(worlds[-1]).tolist(), 'fov': fov,
                                    'leftReferenceEdge': min(p[0] for p in frames[-1]['left']['corners'])-10},
              'trackingCamera': None, 'leftMonitor': monitor_reference(cfg, frames, worlds, K, D)}
    return result


def solve_tracking(raw):
    cfg = config(raw['screen']); frames = raw['frames']; reference = raw['reference']
    if not isinstance(frames, list) or not 8 <= len(frames) <= 30:
        raise ValueError('Capture 8–30 shared-board poses first.')
    K = np.asarray(reference['matrix'], dtype=float); D = np.asarray(reference['distortion'], dtype=float)
    if K.shape != (3, 3) or not np.isfinite(K).all() or not np.isfinite(D).all():
        raise ValueError('Invalid second-camera intrinsics.')
    tK, tD, rms, fov = intrinsics(cfg, frames, tracking=True)
    fields, normals = [], []
    for f in frames:
        if f['size'] != reference['size']:
            raise ValueError('Second-camera resolution changed. Repeat screen calibration.')
        l, _ = pose(cfg, 'left', f['left'], K, D); r, _ = pose(cfg, 'right', f['right'], K, D)
        geo, world = screen_frame(cfg, l, r)
        board, _ = pose(cfg, 'shared', f['shared'], K, D)
        tracker, _ = pose(cfg, 'shared', f['tracking'], tK, tD)
        normals.append(tracker[:3, 2])
        camera_world = np.linalg.inv(world) @ board @ np.linalg.inv(tracker)
        # Current tracker supports yaw and pitch, not camera roll.
        if abs(camera_world[1, 0]) > math.sin(math.radians(3)):
            raise ValueError('Tracking camera roll exceeds 3°. Level the camera before applying.')
        fields.append(camera_fields(camera_world, cfg, geo['vOffset'], fov))
    if max(np.linalg.norm(n-normals[0]) for n in normals) < .15:
        raise ValueError('Tilt the shared board more between captures.')
    keys = list(fields[0]); values = np.array([[f[k] for k in keys] for f in fields])
    if np.any(np.std(values, axis=0) > [1, 1, 1, 2, 2, 2]):
        raise ValueError('Tracking poses disagree. Hold the board still during each paired capture.')
    result = dict(zip(keys, np.median(values, axis=0).tolist()))
    limits = {'x': (-150, 150), 'top': (-250, 100), 'forward': (-50, 100), 'yaw': (-80, 80), 'tilt': (-60, 80), 'fov': (30, 120)}
    if any(not limits[k][0] <= v <= limits[k][1] for k, v in result.items()):
        raise ValueError('Tracking camera pose is outside the supported manual field ranges.')
    return {'trackingCamera': result, 'rms': rms, 'views': len(frames)}


def solve_position(raw):
    """A single installed-position capture can reuse a measured lens model."""
    cfg = config(raw['screen']); frame = raw['frame']; reference = raw['reference']
    K = np.asarray(reference['matrix'], dtype=float)
    D = np.asarray(reference['distortion'], dtype=float)
    if (K.shape != (3, 3) or not np.isfinite(K).all() or not np.isfinite(D).all()
            or K[0, 0] <= 0 or K[1, 1] <= 0 or D.size not in (4, 5, 8, 12, 14)):
        raise ValueError('Invalid saved lens calibration.')
    if frame['size'] != reference['size']:
        raise ValueError('Camera resolution changed. Repeat lens calibration at the current resolution.')
    left, le = pose(cfg, 'left', frame['left'], K, D)
    right, re = pose(cfg, 'right', frame['right'], K, D)
    geometry, world = screen_frame(cfg, left, right)
    fov = math.degrees(2 * math.atan(frame['size'][0] / (2 * K[0, 0])))
    return {'screen': geometry, 'rms': max(le, re), 'views': 1,
            'intrinsics': reference,
            'calibrationCamera': {'matrix': np.linalg.inv(world).tolist(), 'fov': fov,
                                  'leftReferenceEdge': min(p[0] for p in frame['left']['corners'])-10},
            'trackingCamera': None, 'installedPosition': True,
            'leftMonitor': monitor_reference(cfg, [frame], [world], K, D)}


def measure_monitor(raw):
    """Paper-only capture using a calibrated camera that has stayed installed."""
    cfg = config(raw['screen']); reference = raw['reference']; img = decode(raw['image'])
    if reference.get('installedPosition') is not True:
        raise ValueError('Capture the installed camera position first, then keep the camera fixed.')
    lens = reference['intrinsics']; camera = reference['calibrationCamera']
    K = np.asarray(lens['matrix'], dtype=float); D = np.asarray(lens['distortion'], dtype=float)
    M = np.asarray(camera['matrix'], dtype=float); edge = camera.get('leftReferenceEdge')
    if (K.shape != (3, 3) or M.shape != (4, 4) or not np.isfinite(K).all()
            or not np.isfinite(D).all() or not np.isfinite(M).all() or D.size not in (4, 5, 8, 12, 14)
            or K[0, 0] <= 0 or K[1, 1] <= 0 or not np.allclose(M[3], [0, 0, 0, 1])
            or not np.allclose(M[:3, :3].T @ M[:3, :3], np.eye(3), atol=.01)):
        raise ValueError('Invalid saved lens or installed camera pose.')
    if lens['size'] != [img.shape[1], img.shape[0]]:
        raise ValueError('Camera resolution changed. Repeat installed-position calibration.')
    if not isinstance(edge, (int, float)) or not math.isfinite(edge) or not 100 <= edge < img.shape[1]:
        raise ValueError('Capture installed position again to locate the left monitor reference.')
    observation_data = detect_one(img[:, :int(edge)], cfg, 'monitor')
    measured = monitor_reference(cfg, [{'monitor': observation_data}], [np.linalg.inv(M)], K, D)
    if measured is None:
        raise ValueError('Left monitor pose could not be measured. Keep its board clear and the camera fixed.')
    return {'leftMonitor': measured}


def dispatch(path, body):
    if path == '/calibration/pattern': return pattern(body['screen'], body['side'])
    if path == '/calibration/detect': return detect(body)
    if path == '/calibration/solve': return solve(body)
    if path == '/calibration/tracking': return solve_tracking(body)
    if path == '/calibration/position': return solve_position(body)
    if path == '/calibration/monitor': return measure_monitor(body)
    raise ValueError('Unknown calibration operation.')
