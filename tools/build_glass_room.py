#!/usr/bin/env python3
"""Cut assets/room/room-equipment-daylight-v2.png into textures for the glass
room proxies in glass-room.js (wall, desk, tower, left monitor).

Room frame (cm): x along the wall, y up (same as the app), z out of the wall
toward the viewer. glass-room.js places this frame with the measured wall yaw
and depth. Measurements (Lenovo camera, 2026-10-29): screen ChArUco targets
gave the camera pose; the 7 x 5 wall board gave the wall plane; the tower,
monitor and desk were back-projected from the live view and the v2 reference.

The asset is an edited photo, so it does not fit one camera exactly. The wall
and desk are reprojected through one frontal camera fitted to the whiteboard,
desk and side-equipment edges. The tower and monitor faces are rectified from
their outlines in the asset so each object fills its measured box.

Usage: python tools/build_glass_room.py   (needs opencv-python-headless, numpy)
"""
import json
import os
import cv2 as cv
import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SOURCE = os.path.join(ROOT, 'assets/room/room-equipment-daylight-v2.png')
OUT = os.path.join(ROOT, 'assets/room/glass')

# Frontal camera for the asset in the room frame: position, focal length and
# the image point straight ahead (the photo was levelled, so that is its horizon).
CAMERA = dict(x=3.1, y=-25.7, z=136.5, f=757.0, u0=836.0, v0=638.7)
DESK_Y, DESK_DEPTH = -36.0, 88.0
WALL = dict(x=(-170.0, 200.0), y=(DESK_Y, 140.0))
# Physical boxes (cm). Tower: Dell tower against the wall, right of the screens.
TOWER = dict(x=(47.6, 69.6), y=(DESK_Y, 13.0), z=(0.0, 55.7))
MONITOR = dict(x=(-124.6, -41.6), y=(-17.0, 26.0), z=(17.0, 20.9))
STAND = dict(x=(-93.5, -88.5), y=(DESK_Y, -17.0), z=(9.0, 13.0))
STAND_BASE = dict(x=(-102.0, -80.0), y=(DESK_Y, DESK_Y + 1.5), z=(3.0, 23.0))
# Object outlines in the asset (pixels): TL, TR, BR, BL of each visible face.
QUADS = {
    'tower-front': [(1252, 258), (1575, 255), (1578, 750), (1255, 748)],
    'tower-side': [(1088, 322), (1252, 258), (1255, 748), (1093, 742)],
    'monitor-front': [(0, 253), (529, 253), (529, 585), (0, 585)],
    'monitor-stand': [(252, 585), (298, 585), (298, 735), (252, 735)],
}
# Asset areas that belong to the tower, monitor and laptop, not the wall.
EQUIPMENT = [
    [(0, 240), (540, 240), (540, 600), (310, 600), (310, 750), (0, 760)],
    [(1050, 330), (1100, 330), (1252, 245), (1595, 245), (1595, 765), (1050, 765)],
]


def project(x, y, z):
    """Room-frame points -> asset pixels through the frontal asset camera."""
    c = CAMERA
    depth = c['z'] - z
    return c['u0'] + c['f'] * (x - c['x']) / depth, c['v0'] - c['f'] * (y - c['y']) / depth


def remap(image, u, v):
    return cv.remap(image, u.astype(np.float32), v.astype(np.float32), cv.INTER_CUBIC, borderMode=cv.BORDER_REPLICATE)


def wall_texture(image, density=5.5):
    # Remove the equipment first so it is not painted on the wall behind its box.
    # Fill from the wall only: rows below the desk line hold dark clutter.
    image = image[:int(project(0., DESK_Y, 0.)[1]) + 4]
    mask = np.zeros(image.shape[:2], np.uint8)
    for polygon in EQUIPMENT:
        cv.fillPoly(mask, [np.array(polygon, np.int32)], 255)
    small = cv.resize(image, None, fx=.25, fy=.25, interpolation=cv.INTER_AREA)
    small_mask = cv.dilate(cv.resize(mask, small.shape[1::-1], interpolation=cv.INTER_NEAREST), np.ones((5, 5), np.uint8))
    filled = cv.resize(cv.inpaint(small, small_mask, 9, cv.INPAINT_TELEA), image.shape[1::-1], interpolation=cv.INTER_CUBIC)
    soft = cv.GaussianBlur(mask, (31, 31), 0)[..., None] / 255.
    clean = (image * (1 - soft) + cv.GaussianBlur(filled, (0, 0), 6) * soft).astype(np.uint8)
    (x0, x1), (y0, y1) = WALL['x'], WALL['y']
    w, h = int((x1 - x0) * density), int((y1 - y0) * density)
    x, y = np.meshgrid(np.linspace(x0, x1, w), np.linspace(y1, y0, h))
    return remap(clean, *project(x, y, 0.))


def desk_texture(image, density=4.0):
    """Clean desk in the photo's desk colour; projecting the cluttered desk
    smears every upright object, so only shading is kept: darker toward the
    wall and under the tower and monitor stand."""
    (x0, x1) = WALL['x']
    w, h = int((x1 - x0) * density), int(DESK_DEPTH * density)
    colour = np.median(image[765:795, 560:1000].reshape(-1, 3), axis=0)
    x, z = np.meshgrid(np.linspace(x0, x1, w), np.linspace(0., DESK_DEPTH, h))
    shade = 1 - .16 * np.exp(-z / 14.)
    footprints = [(TOWER['x'], TOWER['z'], 4.), (STAND_BASE['x'], STAND_BASE['z'], 5.)]
    for (ax, bx), (az, bz), soft in footprints:
        dx = np.maximum(np.maximum(ax - x, x - bx), 0); dz = np.maximum(np.maximum(az - z, z - bz), 0)
        shade *= 1 - .45 * np.exp(-np.hypot(dx, dz) / soft)
    noise = cv.GaussianBlur(np.random.default_rng(7).normal(0, 1.2, (h, w)), (0, 0), 1.)
    return np.clip(colour * shade[..., None] + noise[..., None], 0, 255).astype(np.uint8)


def face_texture(image, quad, width, height):
    target = np.float32([(0, 0), (width, 0), (width, height), (0, height)])
    matrix = cv.getPerspectiveTransform(np.float32(quad), target)
    return cv.warpPerspective(image, matrix, (width, height), flags=cv.INTER_CUBIC, borderMode=cv.BORDER_REPLICATE)


def main():
    image = cv.imread(SOURCE, cv.IMREAD_COLOR)
    if image is None:
        raise SystemExit(f'Missing {SOURCE}')
    os.makedirs(OUT, exist_ok=True)
    textures = {
        'wall': wall_texture(image),
        'desk': desk_texture(image),
        'tower-front': face_texture(image, QUADS['tower-front'], 330, 500),
        'tower-side': face_texture(image, QUADS['tower-side'], 220, 500),
        'monitor-front': face_texture(image, QUADS['monitor-front'], 540, 340),
        'monitor-stand': face_texture(image, QUADS['monitor-stand'], 48, 150),
    }
    for name, texture in textures.items():
        cv.imwrite(os.path.join(OUT, f'{name}.jpg'), texture, [cv.IMWRITE_JPEG_QUALITY, 90])
    layout = {'source': os.path.basename(SOURCE), 'units': 'cm', 'deskY': DESK_Y, 'deskDepth': DESK_DEPTH,
              'wall': WALL, 'tower': TOWER, 'monitor': MONITOR, 'stand': STAND, 'standBase': STAND_BASE}
    with open(os.path.join(OUT, 'layout.json'), 'w') as f:
        json.dump(layout, f, indent=1)
    print('Wrote', ', '.join(sorted(textures)), 'and layout.json to', os.path.relpath(OUT, ROOT))


if __name__ == '__main__':
    main()
