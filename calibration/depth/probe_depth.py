#!/usr/bin/env python3
"""Hardware probe for the Orbbec Astra depth camera (OpenNI2).

    conda activate depth_cam
    python probe_depth.py            # reads ~3 s of depth, prints stats, saves probe_depth.pgm

Uses the OpenNI2 runtime from tools/setup_depth.sh (or $OPENNI2_REDIST) (Orbbec OpenNI SDK 2.3.0.86-beta6, from orbbec.com).
"""
import os, sys, time
import numpy as np
from openni import openni2

HERE = os.path.dirname(os.path.abspath(__file__))
# Same search order as tools/depth_bridge.py; tools/setup_depth.sh puts the runtime in ../camera_tests/openni2_redist.
REDIST = next((c for c in [os.environ.get('OPENNI2_REDIST'), os.path.join(HERE, '..', '..', '..', 'camera_tests', 'openni2_redist'),
                           os.path.join(HERE, 'openni2_redist')] if c and os.path.exists(os.path.join(c, 'libOpenNI2.so'))), None)


def main():
    if not REDIST:
        sys.exit('OpenNI2 runtime not found. Run tools/setup_depth.sh, or set OPENNI2_REDIST.')
    openni2.initialize(REDIST)
    try:
        device = openni2.Device.open_any()
    except Exception as error:
        sys.exit(f'No depth device ({type(error).__name__}; is another program such as the depth bridge using it?)\n(udev rule? try: sudo cp orbbec-usb.rules /etc/udev/rules.d/556-orbbec-usb.rules && sudo udevadm control --reload)')
    print('device:', device.get_device_info())
    stream = device.create_depth_stream()
    mode = stream.get_video_mode()
    print(f'mode: {mode.resolutionX}x{mode.resolutionY} @ {mode.fps} fps, pixel format {mode.pixelFormat}')
    print('hfov: %.1f deg, vfov: %.1f deg' % (np.degrees(stream.get_horizontal_fov()), np.degrees(stream.get_vertical_fov())))
    try:
        print('mirroring:', stream.get_mirroring_enabled())
        stream.set_mirroring_enabled(False)
    except Exception as error:
        print('mirroring control unavailable:', error)
    stream.start()
    frames, t0 = [], time.time()
    while time.time() - t0 < 3:
        frame = stream.read_frame()
        frames.append(np.frombuffer(frame.get_buffer_as_uint16(), dtype=np.uint16).reshape(frame.height, frame.width).copy())
    fps = len(frames) / (time.time() - t0)
    last = frames[-1]
    valid = last[last > 0]
    h, w = last.shape
    center = last[h//2-10:h//2+10, w//2-10:w//2+10]
    center = center[center > 0]
    print(f'frames: {len(frames)} ({fps:.1f} fps)')
    print(f'valid pixels: {100*valid.size/last.size:.1f}%   depth range: {valid.min() if valid.size else 0}..{valid.max() if valid.size else 0} mm')
    print(f'centre 20x20 median: {np.median(center) if center.size else 0:.0f} mm')
    scaled = np.clip(last.astype(np.float32) / 4000 * 255, 0, 255).astype(np.uint8)
    with open('probe_depth.pgm', 'wb') as f:
        f.write(b'P5 %d %d 255\n' % (w, h)); f.write(scaled.tobytes())
    print('saved probe_depth.pgm')
    stream.stop()
    sys.stdout.flush()  # os._exit skips the flush when stdout is a pipe
    os._exit(0)  # openni2.unload() segfaults on exit with this SDK


if __name__ == '__main__':
    main()
