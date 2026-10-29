# Concave Room: head-tracked 3D on two angled screens

**Current update:** glass-room rendering and working Python ChArUco calibration
are described in [Glass room and screen calibration](#glass-room-and-screen-calibration)
below. The v2 placeholder task list is retained as historical context.

Two identical portrait monitors meet at a concave corner. A webcam on top of
the seam tracks the viewer's eyes, and each screen gets its own **off-axis
projection** from that eye position. The two screens then act like one
window into a 3D room with a floating panda.

| Version | Status | Where |
|---|---|---|
| **v1.0** | Original demos: flat screen, 90° concave, portrait room (90° only). | Tag [`v1.0`](../../tree/v1.0) · details in [`docs/v1-README.md`](docs/v1-README.md) |
| **v2.0** | Core app done: one app with calibration (adjustable angle, seam gap), a fully responsive room and a debug mini-view. Camera auto-calibration is a placeholder. | Spec: [`docs/UX.md`](docs/UX.md) |
| **v2.1.0** | Cut box (scene 2, cut by the screens) and open box with a Box switch, panda position/scale sliders, depth-rgb eye tracking (Orbbec Femto Bolt colour + depth), steadier iris distance. | Tag [`v2.1.0`](../../tree/v2.1.0) · spec: [`docs/UX.md`](docs/UX.md) |

## Run

```bash
bash run.sh                        # serves this folder (+ /span endpoint) on http://localhost:8000
python3 tools/span_window.py       # opens the app fullscreen across both monitors (X11)
```

`tools/span_window.py` needs `python-xlib` and Google Chrome. Browser
fullscreen covers only one monitor, so use this script instead. You can
also open `http://localhost:8000/concave-room.html` and stretch the window
by hand. The app needs a webcam, localhost or HTTPS, and internet access for
the Three.js and MediaPipe CDNs.

First run: open **Manual measurement** and enter the screen size, inside
angle (or the outer-edge distance) and gap. Check the tracking camera
values, calibrate the eye distance, then press **Apply & start
experience**. Values are saved in the browser. Keys: **H** hide column,
**D** mini-view mode, **P** pause, **R** restart camera.

depth-rgb tracking (Orbbec Femto Bolt) is the default eye detector: create the
`femto_bolt` conda env (see `sub-features/femto_bolt_charuco/README.md`).
`bash tools/run_glass.sh` starts the helper with the server; with `run.sh`, also
run `bash tools/run_depth_rgb.sh`. The default camera pose is the Femto as
mounted on the seam (3 cm above, 5 cm forward, level); no eye-distance
calibration is needed.

v2.0.1 adds: **Span both screens** button (F), live eye-distance readout (L),
saved eye calibration with auto-apply on launch, eye-detector and 3D-model
selectors, a steadiness (shake) filter, a tracking accuracy test on Home,
1080p zoom-search tracking, and calibration kept when out of range.

Tests (Node 18+): `node tracking-accuracy.test.cjs`, `node room-v2.test.cjs`, `node concave-room.test.cjs`
and `node concave.test.cjs`. `npm install three` enables the projection
check in `room-v2.test.cjs`.

---

## ⚠️ Workflow rule: UX first, then code

**Always update [`docs/UX.md`](docs/UX.md) before writing code.**

1. Create a branch for the task (`camera-calib/<short-name>`).
2. **First commit:** change `docs/UX.md` so it describes the new behaviour,
   including UI, flow, fields and edge cases.
3. Open a pull request with only the UX change and get it reviewed.
4. **Then** write the code, matching the approved UX. If the code needs to
   differ, update the UX again first.
5. Tick the task below in this README in the same pull request.

Pull requests with code but no matching UX change will be sent back.

---

## Task list

### 🎥 Camera calibration (collaborator)

Goal: turn the **Camera auto-calibration** view from a placeholder into a
working feature. It uses a second USB webcam (the *calibration camera*) and
a printed board to measure the *tracking camera's* position and facing
angle, plus the screen pair's inside angle, gap and offset.

Read first: [`docs/UX.md` §0, §3, §4.3, §5.1](docs/UX.md). Camera
calibration is **optional**, and manual input must always keep working.

Method (from the UX spec): a flat printed **ChArUco board** is held about
1 m in front of the screens. The tracking camera sees the board. The
calibration camera sees the board and the marker patterns on both screens.
Chaining the two gives every pose relative to the screens. Nothing is
attached to the tracking camera.

- [ ] **C0 · UX detail:** expand `docs/UX.md` §4.3 into the full working
      flow: exact screens and states, capture guidance text, error messages
      and what "good capture" means. Get it reviewed **before any code**.
- [ ] **C1 · Camera selection:** list USB cameras, exclude the tracking
      camera, show a live preview and remember the choice.
- [ ] **C2 · Board:** generate a ChArUco board PDF (A4/A3, 100% scale)
      with the square size printed on it, and enable **Download board PDF**.
- [ ] **C3 · Screen markers:** the **Show screen markers** toggle shows
      marker patterns full-screen on both monitors, placed using the current
      screen geometry.
- [ ] **C4 · Detection and capture:** detect the board and markers with
      OpenCV.js in both camera feeds, accept only frames where both cameras
      see the board, and drive the "N / 8 good captures" progress bar.
- [ ] **C5 · Tracking camera intrinsics:** estimate the tracking camera's
      real field of view from the board captures.
- [ ] **C6 · Pose solver:** board → tracking camera and board → screens,
      chained into the profile fields (see contract below), with a
      confidence value for each field.
- [ ] **C7 · Results and Copy to Manual:** fill the results table and
      enable **Copy to Manual**. Never overwrite manual values without the
      user confirming.
- [ ] **C8 · Mini-view:** draw the solved tracking camera and screens in
      the debug mini-view, next to the manual values, so differences are
      visible.
- [ ] **C9 · Tests:** synthetic tests that render the board and markers
      from known camera poses. The solver must recover them within
      tolerance (target: angle ±1°, positions ±0.5 cm).
- [ ] **C10 · Docs:** update this README and the UX spec to match the
      final behaviour.

**Output contract.** The solver returns the same fields as the Manual page
(units: cm and degrees):

```js
{
  screen: { width, height, angle, gap, vOffset },
  trackingCamera: { top, forward, yaw, tilt, fov },
  confidence: { /* same keys, 0–1 */ }
}
```

**Where to plug in:** `calibration-camera.js` already lists and previews
the calibration camera. `solve()` currently returns `null`. The placeholder
UI is in `concave-room.html` (`#view-camera`). Results must go into the
profile through `RoomProfile.sanitize()` (`room-profile.js`), and only after
the user confirms **Copy to Manual**. The v2 core app (tasks V1–V6) is done.

### 🧱 v2 core app

- [x] **V1 · Geometry:** make the screen pair geometry take the inside
      angle, gap and vertical offset (UX §3), with tests for several angles.
- [x] **V2 · Full room response:** remove the 75% room follow. Remove the
      separate display windows (Open left/right).
- [x] **V3 · Layout:** left 20% column with the foldable setup panel above
      and the debug mini-view below. Home / Manual / Camera (placeholder)
      views and a sticky **Apply & start experience** footer.
- [x] **V4 · Saved profile:** automatic save and load, editable fields,
      JSON export and import, and a last-calibrated timestamp.
- [x] **V5 · Manual page:** angle helper (outer-edge distance → angle),
      live diagram and alignment test pattern.
- [x] **V6 · Debug mini-view:** top and side views with eye, frusta,
      screens, tracking camera and parameter tags.

---

## Files

| File | Purpose |
|---|---|
| `concave-room.html/.js/.css` | The v2 app: setup column, experience, tracking |
| `concave-geometry.js` | Screen pair corners (angle, gap, offset) and off-axis projection |
| `room-profile.js` | Saved profile: defaults, validation, save/load, derived geometry |
| `room-miniview.js` | Debug mini-view drawing (top and side views) |
| `calibration-camera.js` | Camera auto-calibration (placeholder: camera select and preview) |
| `concave-tracking.js`, `concave-room-tracking.js` | MediaPipe iris tracking → eye position |
| `tools/span_window.py` | Launch fullscreen across both monitors |
| `models/panda.glb` | Panda model |
| `index.html`, `concave.html` | v1.0 demos (kept) |
| `docs/UX.md` | v2 UX specification: the source of truth |

## Glass room and screen calibration

Start the updated app with its **separate conda environment**:

```bash
# From demo_screen_3d; setup only once when network access is available:
conda create --prefix ../.conda/concave-glass python=3.12 pip -y
conda run --prefix ../.conda/concave-glass python -m pip install -r tools/glass-requirements.txt
bash tools/run_glass.sh
# Open http://localhost:8000/concave-room.html
```

The environment at `../.conda/concave-glass` was created for this workspace.
It is independent of `femto_bolt`. Offline validation used Python 3.12.14,
OpenCV headless 4.13.0 and NumPy 2.5.2, installed from local package caches. The server binds to localhost; the browser
owns both USB cameras and submits frames only to this local server. Existing
`run.sh` also works if this environment is activated. `/span` still needs an
accessible X11 session. Host access now exposes both USB cameras: the Lenovo
has been captured at 1920 × 1080 through OpenCV and the browser. Keep camera
focus/zoom and resolution unchanged when reusing lens calibration.

**Scene:** select **Glass · room continuation** on Home. Saved measurements,
camera calibration and existing scene selection are preserved. New profiles
use the supplied 33.5 × 60 cm screen measurements. The new scene places a whiteboard, wall,
tray and desk behind the displays, with view-dependent 3D perspective. A blur
pass softens only the room, leaving the foreground model sharp. Daylight and
bright overhead white keep independent tint/brightness settings. This is a
room approximation unless **Measured room (Lenovo photo)** is selected (the
default). That backdrop makes the two panels read as glass: the generated
[background](assets/room/room-equipment-daylight-v2.png) (central portrait pair
removed) is cut by `tools/build_glass_room.py` into textures in
`assets/room/glass/` and mapped onto proxies at the measured room positions:
the wall/whiteboard 26 cm behind the seam and turned 7.4°, the desk at −36 cm,
the Dell tower box right of the screens and the left landscape monitor with its
stand. Wires and small desk items are not modelled (the desk is drawn clean).
The surfaces are unlit, so the daylight photo keeps its own shading; Brightness,
Wall tint and **Match current lighting** scale it for the real room. If the
screens or desk move, adjust **Wall behind seam** and **Wall turn** on Home; a
measured left-monitor board (screen calibration) sets the monitor depth.
Re-run `python tools/build_glass_room.py` in the `concave-glass` environment
after editing its measured layout.

How the layout was measured (2026-10-29, Lenovo in front of the screens): the
screen ChArUco targets gave the Lenovo pose (0.45 px RMS); the printed 7 × 5
board on the whiteboard gave the wall plane; the tower and monitor edges were
back-projected from that view and from `lenovo-room-reference-v2.jpg`. To check
the illusion from a camera, open
`concave-room.html?eye=x,y,z` with the camera's solved position in cm from the
seam (shown as *Second camera x / y / z* in the calibration results). The eye
then stays there instead of following tracking.

The character's forward-position control now reaches **200 cm**, while saved
positions and the tracking coordinate calculations are retained.

Select the **Lenovo** in Camera auto-calibration and the **Femto Bolt** as the
tracking camera in Manual. **Match current lighting** samples neutral pixels
around the perimeter of the unmirrored Lenovo image. Inspect/download that
reference and adjust the result in Home. The generated [background](assets/room/room-equipment-daylight-v2.png) and its
[prompt](assets/room/generation-v2.md) are in `assets/room/`. For optional background art, load a
frontal image into **Custom background image**. The image stays
in this session; matching colours, lighting and geometry save with Apply.
An oblique room photo is a reference, not a complete 3D reconstruction.

**Screen targets and calibration:**

1. Manual: enter the measured **33.5 × 60 cm** active area for each panel.
   The connected Dell P2725H/P2722H report native 1920 × 1080 modes via EDID;
   use **1080 × 1920** for portrait orientation. A third P3223DE is also
   connected, so span only the portrait pair, not the entire desktop.
2. Use **Align both displays for calibration** to enter browser fullscreen
   and extend it over exactly the portrait pair (X11/local helper). Confirm
   there are no browser bars, and
   place the seam at the split. Confirm coverage. The app checks device-pixel
   dimensions; OS scaling/zoom, letterboxing and mismatched seam splits must
   be corrected before capturing. Both panels must have equal active sizes.
3. Select the Lenovo camera. **Show screen targets** shows independent 5 × 9
   ChArUco boards from DICT_4X4_250 (IDs 100–121 and 132–153), sized from physical dimensions and native
   resolution. **Space** captures and restores controls; **Escape** exits.
   **Capture** also briefly shows the targets before taking a frame.
4. For the first lens calibration, briefly move/tilt the Lenovo through at least eight distinct views, keeping
   both boards visible. Keep the monitors fixed. **Solve screens** estimates
   lens intrinsics, display angle, gap and vertical offset. Results include
   reprojection RMS and the second camera pose. **Start automatic capture**
   keeps the boards displayed and collects up to twelve views; hold still
   between small movements, and use Escape to stop. Return the Lenovo to
   its normal mount and **Capture installed position · reuse lens** before
   copying results. Later sessions can use that one capture with the saved
   lens model, provided camera selection, focus/zoom and resolution match. Screens
   with relative roll/tilt or asymmetric depth offsets are rejected because
   the existing symmetric-pair renderer cannot represent them.
5. Optional: download the shared board and print the complete image at
   **169.8 × 229.8 mm**, with **30 mm squares**. Both cameras must see its
   front, while the Lenovo also sees both screen patterns. Use browser video
   tracking for this step, not the depth-rgb bridge. Hold the board still
   while each paired frame is taken, then vary its angle/position for eight
   captures. **Solve tracking camera** estimates its lens and pose; without
   this step, manual tracking-camera values are retained. If the two cameras
   cannot see the same board face, reposition the second camera or keep the
   manual tracking-camera pose.
6. Review results → **Copy to Manual** → **Apply**. Nothing is saved or
   silently substituted after a failed solve. Changing setup resets captures.

Detection uses [OpenCV ChArUco detection and pose estimation](https://docs.opencv.org/4.11.0/df/d4a/tutorial_charuco_detection.html).
The physical **7 × 5** board on the left landscape monitor, with **35 mm
squares / 28 mm markers / DICT_4X4_50**, is detected as an optional third
reference. It contributes to the lens solve and measures its own plane in
the displays' coordinate system. Results show its x/y/z and fit; Copy/Apply
saves it and uses its plane for left-monitor depth within the room bounds.
It does not establish monitor dimensions or the offset from board to display.
The identical wall target is excluded from this reference. Missing or unstable
reference observations leave the estimated surrounding depth in place.
If bright targets make the paper unreadable, **Measure left monitor · camera
fixed** takes an extra capture with targets hidden after the installed-position
measurement. It reuses that camera pose and lens: keep the Lenovo fixed, and
repeat installed-position calibration if it moves. **Target brightness** starts
at 25% to reduce glare while preserving the target's native pixel geometry.
The generated room image contains no ChArUco artwork.
Metric scale comes from the supplied physical screen/printed-board dimensions.
A small reprojection error does not certify physical accuracy: verify a tape
measurement and seam alignment from several eye positions after applying.

Validation:

```bash
../.conda/concave-glass/bin/python tools/test_screen_calibration.py
node --test glass-room.test.cjs room-v2.test.cjs concave-room.test.cjs tracking-accuracy.test.cjs
```

New files: `glass-room.js` (scene/blur/colour matching),
`screen-calibration-ui.js` (capture/review), `tools/screen_calibration.py`
(boards, detections and metric solves), `tools/run_glass.sh` (environment launcher).
