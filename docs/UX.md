# Concave Room — UX specification (v2 draft)

Versioning: the existing demos (`index.html`, `concave.html`,
`concave-room.html` with the 90°-only geometry) are tagged **v1.0** in git.
This document describes **v2.0**.

Status: design document only. Nothing here is implemented yet. It describes how
the current `concave-room.html` demo becomes a single app that does both
screen calibration and the head-tracked, off-axis 3D experience.

---

## 0. Answers to open questions

**Is the current program an off-axis projection?**
Yes. `concave-geometry.js → project()` implements the generalized (Kooima)
off-axis projection: each physical screen is described by three corners, a
camera is placed at the tracked eye, and an asymmetric frustum is built from
the eye through that exact rectangle. Both screens share one eye position.
Current limitations, all addressed below:

| Limitation today | Decision |
|---|---|
| Screen corners are hard-coded for a 90° inside angle (√½ factors). | Inside angle becomes a calibration input (§3). |
| No bezel/gap: the two visible areas touch at the seam. | Physical gap at the seam is modelled (§3). |
| Room follows only 25% of eye x/y movement (75% "follow"). Only the panda is physically correct. | Removed. Whole scene uses the full, physically correct response. |
| "Seam overlap" slider shifts images away from the exact projection. | Not a gap simulation. Moved to *Advanced* and defaults to 0. The gap is handled physically instead (§3). |
| Separate display windows (Open left / Open right, BroadcastChannel). | Removed. One app, one window that spans both screens. |

**Webcam mount:** top of the seam (centred on the shared edge, above the
top of the screens, facing the viewer). This is the default and the only
position the UI needs to describe in detail.

**Two cameras, two jobs:**

| Camera | Where | Job |
|---|---|---|
| **Tracking camera** | Fixed on top of the seam, facing the viewer | Eye tracking, live, during the experience. |
| **Calibration camera** (optional) | A second USB webcam, handheld or on a tripod, 1–2 m in front of the setup, used only during calibration | Measures where the tracking camera is and which way it faces (plus the screen pair's angle, gap and offset). |

**Screens:** always the same model and size. They are described *together*
as a pair by their relative position, not as two independently placed
screens.

---

## 1. Principles

1. **One app, one window.** A single page, stretched across both monitors.
   No second terminal, window, or page.
2. **Calibrate every session.** Screens get nudged. The app always offers
   calibration on launch but remembers the last values so it takes seconds.
3. **Physically correct first.** Everything in the 3D scene (room, frame,
   panda, shadows) uses the same off-axis projection from the same eye.
4. **Make errors visible.** A debug mini-view shows where the app *thinks*
   the screens, webcam, and eye are, with the numbers you typed.

---

## 2. App structure

```
one browser window spanning both screens (edge to edge)
┌──────────────── LEFT SCREEN ────────────────╥──────────────── RIGHT SCREEN ───────────────┐
│ ┌── 20% ───┐                                 ║                                             │
│ │ SETUP    │                                 ║                                             │
│ │ (fold ▲) │                                 ║                                             │
│ │ Home     │                                 ║                                             │
│ │ ├ Manual │                                 ║                                             │
│ │ └ Camera │     3D experience               ║      3D experience                          │
│ │[Apply ▶] │                                 ║                                             │
│ ├──────────┤                                 ║                                             │
│ │ DEBUG    │                                 ║                                             │
│ │ MINI-VIEW│                                 ║                                             │
│ │ top/side │                                 ║                                             │
│ │ + tags   │                                 ║                                             │
│ └──────────┘                                 ║                                             │
└──────────────────────────────────────────────╨─────────────────────────────────────────────┘
```

- **Side column:** the leftmost **20% of the left screen** is a column split
  into two horizontal sections:
  - **Upper:** the foldable **setup panel** (§4).
  - **Lower:** the **debug mini-view** (§5.1).
- **Folding:** when the setup panel is folded, it shrinks to a one-line
  header ("Setup ▼") and the mini-view grows to fill the column. When it's
  unfolded, the two sections split the column height about 50/50.
- **H** hides the whole column for a clean experience. **H** again brings it
  back.
- The column is an overlay. The 3D projection still covers the *entire*
  left screen, so hiding the column never changes the image geometry.
- The experience is always live, so every setup change is visible on the
  real screens straight away.
- The setup panel has three views: **Home**, **Manual measurement** and
  **Camera auto-calibration**.
- Every view has the same sticky footer button: **Apply & start experience**.

### Launch flow

```
Open app
  │
  ├─ saved profile exists? ── no ──▶ Setup Home (drawer open)
  │
  yes
  ▼
Setup Home shows: "Last calibrated 2026-09-29 14:10 · 97° · gap 1.8 cm"
  │   [Manual measurement]   [Camera auto-calibration]
  │   [Apply & start experience]   ← reuse saved values as they are
  ▼
Experience (drawer folded, fullscreen, tracking on)
```

---

## 3. Screen pair geometry (what the user enters)

The pair is described relative to the **seam**, the shared vertical edge
where the two screens meet.

| Parameter | Unit | Default | How to measure |
|---|---|---|---|
| Visible width (each screen) | cm | 33.6 | Lit display area only, no bezel |
| Visible height (each screen) | cm | 59.8 | Lit display area only |
| **Inside angle** θ | ° | 90 | Angle between the two *display surfaces*, measured on the viewer side (not the monitor backs). 180° = flat. |
| Gap at seam | cm | 1.5 | Straight-line distance from the inner edge of the left lit area to the inner edge of the right lit area (a ruler laid across the corner). Covers both bezels and any air gap. |
| Vertical offset | cm | 0 | How much higher the right lit area sits than the left (+ = right higher). |
| Seam position in window | % | 50 | Where the spanning window is split. 50% for two equal monitors. |

**Angle helper.** A protractor is awkward on a concave corner, so the
Manual page also accepts a tape measurement:
*"Distance between the two outer lit edges, straight across (cm)"*.
The app turns this into the angle and shows both values. The user can type
either one and the other updates. With outer-edge distance D, gap g and
width w: `sin(θ/2) = (D − g) / (2w)`.

**How the app places the screens.** The seam is the vertical z-axis. The
viewer is on +z. Each panel leans back by half the inside angle from the
bisector, so the left panel runs along `(−sin θ/2, 0, cos θ/2)` and the
right along `(+sin θ/2, 0, cos θ/2)`. The corner (origin) is where the
two display planes meet. Each lit area starts `g / (2·sin θ/2)` from the
corner along its panel, so the straight gap between the inner edges is `g`.
The vertical offset moves the right panel up by `+v/2` and the left down by
`v/2`. The off-axis projection math is unchanged; only the
corner positions change.

**Gap handling.** The 3D world is continuous across the corner. The gap
region simply has no pixels, like looking through two window panes with a
mullion between them. Straight lines therefore stay straight across the
seam from the calibrated eye. The seam overlap slider is no longer needed
for this.

### Webcam (top of seam)

Defaults are the Orbbec Femto Bolt colour lens as mounted on top of the seam
(measured from the Lenovo camera and the Femto's accelerometer, level within
1°). Profiles saved before v5 keep their other camera values but take the
Femto tilt, forward distance and the depth-rgb detector once.

| Parameter | Unit | Default |
|---|---|---|
| Height above top of screens | cm | 3 |
| Forward from seam (toward viewer) | cm | 5 |
| Tilt down | ° | −1 (slightly up) |
| Horizontal field of view | ° | 60 |
| Yaw | ° | 0 (along the bisector; shown under *Advanced*) |

### Saved profile

- Saved automatically in the browser on **Apply**, and loaded on the next
  launch. Every field stays editable.
- **Export / Import profile (.json)** buttons allow a backup or moving the
  setup to another computer.
- A timestamp records when the profile was last calibrated.
- The profile also stores the chosen foreground model and eye detector (§4.2).

---

## 4. Setup drawer views

### 4.1 Home

- Status card: last calibration time, angle, gap, screen size, webcam state.
- Two large buttons:
  - **Manual measurement**: "Measure with a tape and type the numbers."
  - **Camera auto-calibration** (optional, shows a *Preview* badge): "Use a
    second camera to measure the screens automatically."
- **Manual measurement is the primary path**, and it alone is enough to run
  the full experience.
- **Scene** section: a **Box** selector and sliders that change the 3D
  scene live while you watch. The panda and its controls are the same in
  both boxes.

  | Control | Unit | Default | Range | Meaning |
  |---|---|---|---|---|
  | Box | — | Cut box | Cut box / Open box | Which box scene is shown (below). |
  | Panda position | cm | 8 | −100 … 30 | Panda forward (+, toward you) or back (−, into the box) from the seam line. Saved in the profile (`scene.pandaForward`). |
  | Panda scale | % | 100 | 10 … 300 | Size of the panda relative to its automatic size (which follows the screen size). |
  | Panda height | cm | 15 | −30 … 200 | Height of the panda's lowest point above the bottom edge of the screens (the lower panel when they are offset). Scaling keeps the feet in place. Saved in the profile (`scene.pandaLift`). |
  | Panda turn | ° | 0 | −180 … 180 | Turns the panda about the vertical axis (+ turns it to its left, seen from above, counter-clockwise). Saved in the profile (`scene.pandaYaw`). |
  | Panda tilt | ° | 0 | −90 … 90 | Tilts the panda about the left–right axis: + leans its top toward you, − away. Its lowest point stays at Panda height. Saved in the profile (`scene.pandaPitch`). |

  **Cut box (default, scene 2).** The two screens cut a virtual box from
  top to bottom, and you look into the part of the box that is left behind
  the screens.

  | Control | Unit | Default | Range | Meaning |
  |---|---|---|---|---|
  | Box width | cm | 40 | 10 … 300 | Horizontal inside width; the side walls are at ± half of it. |
  | Box height | cm | 50 | 10 … 300 | Inside height, centred on the screen centre. |
  | Box depth | cm | 60 | 10 … 300 | Back wall distance behind the seam line. |

  - The cut lies **on the screen surfaces**. It is a folded hexagon across
    both screens: top edge outer-left → seam → outer-right, the two outer
    vertical edges, and the bottom edge back through the seam. Because it
    lies in the screen planes, its edges stay at fixed places on the
    screens for every eye position; only width and height move them.
  - Behind the cut, the side walls, back wall, floor and ceiling (floor and
    ceiling are notched where the screens cut them) are real 3D geometry
    and update with the tracked eye, so the space reaches back behind the
    screens.
  - Outside the hexagon the screens are black (a mask drawn exactly on the
    screen surfaces), so no outside face of the box is ever visible.
  - The mask only hides the box, **never the panda**: a panda taller or
    wider than the opening stays whole (on a concave pair its sides reach
    behind the screen planes). The box walls still hide the panda normally
    when it is moved into the box.
  - If the width is wider than the screens reach, the cut simply ends at
    the outer screen edges. Gap and screen angle are taken into account.

  **Open box (scene 1, the previous box).**

  | Control | Unit | Default | Range | Meaning |
  |---|---|---|---|---|
  | Box width | cm | 54 | 10 … 300 | Inside width of the box (the room). |
  | Box height | cm | 55 | 10 … 300 | Inside height of the box, centred on the screen centre. |
  | Box position | cm | −10 | −100 … 30 | Where the open front of the box sits: 0 = seam line, + toward you, − away. |

  - The box is a real open-front box: its front opening is the same size as
    its inside, and the black frame around the opening moves with it. Box
    depth stays automatic (2 × screen width, at least 65 cm).
  - Defaults put the box opening 10 cm behind the seam line and the panda
    8 cm in front of it, so the **panda floats outside the box**.

  Only the sliders of the selected box are shown. The box choice
  (`boxScene`: `cut` / `open`), panda scale and all box values are stored in
  the profile (`scene.pandaScale`, `scene.pandaLift`, `scene.pandaYaw`, `scene.pandaPitch`, `scene.cutWidth`, `scene.cutHeight`,
  `scene.cutDepth`, `scene.boxWidth`, `scene.boxHeight`, `scene.boxForward`),
  saved on **Apply** and included in Export / Import. Out-of-range or unknown
  values in an imported profile fall back to the defaults. The debug
  mini-view shows the box outline and panda size.
- Footer: **Apply & start experience**.

### 4.2 Manual measurement

Sections, top to bottom:

1. **Screens:** width, height, inside angle *or* outer-edge distance, gap,
   vertical offset.
2. **Tracking camera:** a camera dropdown (needed because a second USB
   camera may be connected), an **Eye detector** dropdown, then height,
   forward, tilt and FOV. Yaw and left/right offset are under *Advanced*.
   Eye detector options (all give the 478-point face + iris landmarks the
   tracker reads; the iris size gives the distance):
   - **Face Mesh + zoom search** (default): MediaPipe Face Mesh on a crop
     around the face once found (more iris pixels); while no face is found
     it cycles the full frame and zoomed centre/left/right crops so a
     distant face is found too.
   - **Face Mesh only**: MediaPipe Face Mesh on the whole frame (the v2.0
     behaviour, short range, about 2 m). Fastest.
   - **Face Landmarker (experimental)**: the newer MediaPipe Tasks
     Face Landmarker on the same crop. Needs internet to load its model; if
     it fails to load the status line says so and the previous detector is
     used.
   - **depth-rgb (Orbbec Femto Bolt, default)**: fuses the colour and depth cameras
     (algorithm from `sub-features/femto_bolt_charuco/iris_depth.py`).
     MediaPipe finds the irises in the colour image; the depth image is
     reprojected into the colour camera with the factory calibration and
     the measured depth at each iris centre gives the distance. Where depth
     is missing or implausible on an eye (the cornea is shiny), that eye
     falls back to the iris-size distance with the camera's factory focal
     length. The eye point is the midpoint of both irises.
     - Runs in a local helper, not the browser (the browser cannot read the
       depth camera): `bash tools/run_depth_rgb.sh` starts
       `tools/depth_rgb_bridge.py` on `http://localhost:8766`;
       `tools/run_glass.sh` starts it with the app server (`DEPTH_RGB=0`
       skips it). The helper
       owns the camera, so the browser does not open a webcam in this mode;
       the camera dropdown is ignored.
     - **No eye-distance calibration**: the distance is measured in mm. The
       eyes → lens slider and **Calibrate tracking** are disabled, and the
       status / debug strip read "depth-rgb (measured)" instead of
       "not calibrated". Only the camera pose fields (above top, forward,
       tilt, yaw, left/right) still matter. FOV is not used.
     - **Preview**: the eye-calibration area shows the helper's live
       colour image with the iris circles and the depth / source (depth or
       size) of each eye, instead of the webcam video.
     - If the helper is not running, status says "depth-rgb helper not
       running: start bash tools/run_depth_rgb.sh, then press Restart webcam
       (R)". It retries automatically every 2 s.
   Changing the detector restarts tracking and discards the eye calibration
   (iris sizes differ slightly per detector), so recalibrate afterwards. The
   choice is saved in the profile (`detector`: `two-stage`, `fullframe`,
   `landmarker`, `depth-rgb`). The Home status card shows the active detector.
3. **Foreground model:** a dropdown for the object floating in front of
   the seam. Options: **Panda** (default, `models/panda.glb`), **Cube**
   (edged cube, good for judging perspective), **Sphere** (checker pattern)
   and **Load file…** (a local `.glb`/`.gltf`, used for this session only;
   too big to store, so the next launch falls back to Panda). Every model
   is scaled to the same height and centred. The choice takes effect
   immediately and is saved in the profile on **Apply** (`model`: `panda`,
   `cube` or `sphere`). If a model fails to load, the status line says so and
   the previous model stays.
4. **Live diagram:** the debug mini-view directly below the setup panel
   (§5.1) *is* the live diagram. It redraws the screen pair to scale at the
   entered angle and gap, with the webcam and its view cone, on every
   keystroke. No second copy is shown.
5. **Alignment test pattern** (toggle): replaces the scene with a grid
   floor, a gridded back wall, a vertical pole on the seam line (x = 0)
   behind the screens, and horizontal lines running across both screens. When the numbers are right, the lines look
   straight and continuous from the calibrated eye position.
6. **Eye-distance calibration:** the live webcam preview, a slider for the
   measured eye → webcam distance, and a **Calibrate tracking** button.
   This step is the same on both setup paths.
7. **Advanced** (collapsed): seam overlap (default 0, labelled *non-physical
   correction*), webcam yaw, webcam left/right offset, and tracking
   smoothing time (default 180 ms).
8. **Profile:** Export JSON / Import JSON buttons, and a link to the v1.0
   demos.

Footer: **Apply & start experience**.

### 4.3 Camera auto-calibration (optional — placeholder in v2.0)

Camera calibration is **optional**. Manual measurement (§4.2) is always
enough. In v2.0 this view is a **placeholder with real UI**. The flow can be
clicked through, but the solver isn't implemented yet, and it never
overwrites manual values without the user confirming.

Intended method (for a later version): a printed **shared calibration
board**, with nothing attached to the tracking camera.

- The user holds a flat printed ChArUco board (A4/A3, printed at 100%)
  about 1 m in front of the screens.
- The **tracking camera** sees the board, which gives its pose relative to
  the board, including its real field of view.
- The **calibration camera** sees the board *and* the marker patterns shown
  on both screens, which gives the screen pair's pose relative to the board.
- Chaining the two gives the tracking camera's position and facing angle
  relative to the screens, plus the inside angle, gap and offset.

**v2.0 placeholder UI**, top to bottom:

1. A banner: "Preview — automatic calibration is not available yet. Use
   Manual measurement." with a **Go to Manual measurement** link.
2. **Calibration camera** dropdown listing USB cameras, excluding the
   tracking camera, and a live preview of the selected camera.
3. **Board settings:** square size (mm), board size (A4/A3), and a
   **Download board PDF** button (disabled in v2.0).
4. **Show screen markers** toggle (disabled in v2.0).
5. **Capture** button and a "0 / 8 good captures" progress bar (disabled
   in v2.0).
6. **Results table** with the same fields as Manual (angle, gap, offset,
   camera height / forward / yaw / tilt / FOV) and a confidence column.
   These show "—" until a solver exists. A **Copy to Manual** button is
   disabled until there are results.
7. The same eye-distance calibration step as the Manual page.

Footer: **Apply & start experience**. It uses the current saved/manual
values.

## 5. Experience view

- **Apply** saves the profile, stamps the calibration time and folds the
  setup panel. It does *not* use browser fullscreen: Chrome's fullscreen
  covers only one monitor. Instead the window is spanned edge to edge
  across both monitors by `tools/span_window.py` (see README). The script
  launches Chrome as a frameless app window and asks the window manager to
  make it fullscreen across both monitors.
- If tracking is not yet calibrated, **Apply** calibrates automatically as
  soon as 12 steady samples exist, using the eyes → webcam distance from the
  slider (the user must sit at that distance). Without calibration the eye
  distance stays fixed at the slider value.
- **Auto-apply on launch:** when a saved profile exists, the app opens with
  the setup panel folded and tracking running. The eye calibration (and the
  eyes → webcam distance) is saved on Apply and Calibrate, and restored on
  launch if the webcam pose and camera aspect are unchanged. Otherwise
  recalibrate.
- **Zoom-search tracking (range):** once a face is found, Face Mesh runs on
  a crop around it so a distant face gives the iris enough pixels; while
  searching it cycles the full frame and zoomed crops. (A separate MediaPipe
  face-finder was tried and removed: it crashed in the browser.)
- **Tracking accuracy test** (Home, Scene section): **Run accuracy test**
  simulates the webcam and shows the worst eye error (cm) per viewing
  distance for wrong FOV, tilt, slider distance and iris-pixel error.
  Same code as `node tracking-accuracy.test.cjs`.
- **Steadiness filter (shake reduction):** the eye position from the
  webcam is noisy (mostly the distance, from the iris size), which makes
  the picture shake while the viewer sits still. A speed-adaptive
  (One Euro) filter smooths heavily when the head is still and lightly
  when it moves, so it removes the shake without adding lag to real
  movement. **Advanced → Steadiness (%)**, default 50: higher = steadier
  but slightly slower to follow, 0 = almost no filtering. Saved in the
  profile (`advanced.steadiness`). It runs before the existing smoothing
  time; lower the smoothing time if the picture feels laggy.
- **Distance steadiness:** distance comes from the iris size in pixels,
  which is much noisier than the left/right/up/down position (an iris is only
  a few dozen pixels wide, less with a wide-angle camera). So the iris size
  gets its own, stronger speed-adaptive filter *before* the eye position is
  computed: the distance holds still while you sit still and follows when you
  really lean in or back. The same **Steadiness (%)** setting controls it.
- **Capture resolution:** the webcam is requested at 2560 × 1440 (falls back
  to the best the camera offers). More pixels across the iris = steadier
  distance, which matters most with wide-angle cameras.
- **Changing the webcam:** a saved eye calibration is only restored for the
  same camera (name and resolution). After switching cameras the app asks for
  a new calibration. Also enter the new camera's **Horiz. FOV** (e.g. Orbbec
  Femto Bolt colour camera, 16:9: 80°) before calibrating.
- **Span both screens** button (Home view, Scene section, key **F**): uses
  the Window Management API (`getScreenDetails`, asks the browser's
  permission once) to find the bounding box of all monitors, then moves and
  resizes the window to it. If the browser refuses to resize a normal tab,
  it opens the app in a popup window at that box instead. Status text
  reports failures (no permission, single monitor). `tools/span_window.py`
  remains the true-fullscreen option.
- Eye tracking runs on the seam-top webcam and drives one eye position for
  both screen projections.
- The whole scene responds fully and physically correctly: room, frame,
  panda and shadows.
- Keys: **H** shows or hides the whole left column, **D** cycles the
  mini-view between *both views*, *top only* and *side only*, **P** pauses
  motion, **R** restarts the camera. Keys are ignored while typing in a
  field.
- If tracking is lost, the last view is held and a small status pill shows
  "Tracking lost: eyes not visible".

### 5.1 Debug mini-view (digital review)

The lower section of the left-side 20% column (§2). It is always visible
while the column is shown. **D** cycles *both → top → side*.

**Top view, to scale:**
- the two screen segments at the calibrated angle, with the gap drawn;
- the **tracking camera** position, facing direction and view cone (as entered
  manually or as solved by the calibration camera);
- the live eye position (dot), with a short trail;
- the eye → screen frusta, one colour per screen: lines from the eye to
  each lit area's outer edges, showing the view range;
- the virtual scene's outline (room box and panda position).

**Side view:** the same elements seen from the side, including the webcam
tilt and the eye height.

**Parameter tags** (the values typed in setup, in bold):
- **θ 97.0°**, **gap 1.5 cm**, **33.6 × 59.8 cm**, **offset 0 cm**
- **Cam: +3 cm top, 0 cm fwd, 25° tilt, 60° FOV**
- Eye (live): x / y / z in cm, distance to seam, distance to webcam
- Tracking: FPS, sample age (ms), calibrated yes/no, calibration time
- Warnings in red, e.g. "Eye outside supported area" or "Eye behind
  left-screen plane".

This panel is how you find what's wrong. If the eye dot jumps while you
sit still, tracking is the problem. If the frusta don't meet the screen
edges, the screen geometry is the problem.

---

## 6. What changes from the current code (for implementation)

| Area | Change |
|---|---|
| `concave-geometry.js` | `screens(width, height, {angle, gap, vOffset})`. The options default to the v1 90°/gapless pair, so the v1 demos are unchanged. Adds `planeDistance`, `inFront`, `angleFromOuterDistance`, `outerDistance`. `project()` is unchanged. |
| `concave-room.js` | Remove the 75% room follow. Remove the display-window / BroadcastChannel mode. The profile lives in `room-profile.js` and the mini-view drawing in `room-miniview.js`. |
| `concave-room.html` | Restructure the controls into the foldable drawer with Home / Manual / Camera views and a sticky **Apply** footer. Remove Open left/right. |
| New | `calibration-camera.js`: v2.0 = placeholder UI plus calibration-camera selection and preview only. Later: ChArUco detection via OpenCV.js and the shared-board pose solver. |
| Layout | Left 20% column on the left screen: setup panel above, mini-view below. |
| Versioning | The current demos are tagged `v1.0` and stay in the repo. v2.0 turns `concave-room.html` into the single app. |
| Tests | `room-v2.test.cjs`: corner positions for angles 60°–180°, gaps and offsets; a flat 180°, 0-gap pair must match a single wide screen; the angle helper; profile sanitizing. |

---

## 7. Decisions

1. The v1.0 demo files (`index.html`, `concave.html`) **stay in the repo**.
2. Camera calibration is **optional**. It is a placeholder UI in v2.0, and
   manual input is the primary path.
3. The calibration camera is a **second USB webcam** (no phone support).
4. Later method: a **shared printed board** seen by both cameras. No marker
   is attached to the tracking camera.

## 8. Glass room and screen ChArUco calibration

This section supersedes the v2 placeholder calibration flow and initial scene
choice above. Saved scene choices, dimensions and camera measurements are
preserved. New profiles default to the supplied 33.5 × 60 cm active area.

This extension adds **Glass room**, selected explicitly for saved profiles.
A neutral wall, whiteboard, tray, desk and side walls
extend behind the physical displays in world space. The model remains sharp
in front of a frosted glass plane. Room depth, width, board height, frost and
exposure are editable. Daylight and overhead white have separate saved colour
and exposure matches. These are an approximate room until measured/captured;
unseen room detail is an approximation. A built-in imagegen background derived
from the Lenovo reference removes only the two central portrait monitors and
their mounted tracking camera. The left landscape screen/laptop, right desktop
tower, desk peripherals and connecting wires remain the visual anchors. The
whiteboard is subdued background. Equipment is mapped closer than the wall,
with depth changing as the viewer moves; these surrounding depths are estimates.
The desk and side walls provide additional 3D geometry.

**Measured room (glass illusion, default backdrop):** the panels should read
as glass in front of the real room. The generated background is mapped onto
measured proxies instead of one relief plane: the wall/whiteboard plane, the
desk top, the Dell tower box and the left landscape monitor box with stand.
Home shows **Wall behind seam (cm)** (default 26) and **Wall turn (°)**
(default 7.4, range −30…30); the proxies stay fixed relative to the wall.
Profiles saved before this change keep their other values but take the new
wall distance once (the old 85 cm default described the estimated room).
Wires and small desk items are not modelled; the desk is clean, with soft
shading near the wall and under the tower. The photo surfaces are unlit and
scaled by the lighting mode's Brightness and Wall tint, so **Match current
lighting** also darkens or tints the room photo. Frost and the sharp model in
front are unchanged. **Plain whiteboard room** keeps the procedural room.

**Fixed-eye check:** `concave-room.html?eye=x,y,z` (cm from the seam, z > 0)
holds the eye at that point, e.g. the Lenovo's solved position, so a camera
aimed at the screens shows whether the room on the panels continues the real
surroundings around their edges. Without the parameter, tracking is unchanged.
The character's forward-position range extends to 200 cm; its saved position
and existing tracking coordinate calculations are preserved. Home labels the
control **Panda / model distance** so it is easy to find.

**Left monitor depth reference:** an optional physical 7 × 5-square ChArUco
board (35 mm squares, 28 mm markers, DICT_4X4_50, standard IDs starting at 0)
can stay on the left landscape monitor. It is detected independently of the
central display targets (whose IDs start at 100). With calibrated Lenovo
intrinsics, its pose is transformed into the display coordinate system and
shown as a left-monitor reference in the results. Copy/Apply saves it; the
room uses the measured board-plane depth where representable. This measures
the board plane, not the monitor's dimensions or the board-to-monitor offset.
If the board is missing or unclear, screen calibration still works and the
surrounding equipment keeps estimated depth. Calibration artwork is never
included in the generated room image. A calibration-only target-brightness
slider (20–100%, initially 25%) reduces screen glare without changing target
size or the normal scene. Captures wait two seconds for exposure to settle.
After measuring the installed camera pose, **Measure left monitor · camera
fixed** can capture its paper board with screen targets hidden, avoiding the
screen/paper exposure difference. The camera must stay in the measured position;
repeat the installed-position capture if it moves. This extra capture reuses
the saved lens and camera pose and does not change the central screen geometry.

**Match surroundings** takes an unmirrored frame from the selected second
camera and samples the outer border (excluding the central monitor area),
using bright, low-saturation pixels to suggest neutral wall colour and
brightness for the selected lighting mode. A capture preview and download
allow inspection; camera auto-exposure is not a photometric measurement.
Colour matches are saved with the profile. The optional clean-background
image is mapped onto the whiteboard at a real depth, blurred with the room,
and kept for this session. Use a frontal, monitor-free image: a perspective
photo from the second camera cannot directly replace a head-tracked room.

**Calibration flow** (local Python/OpenCV helper through the app server):

1. Enter measured active screen width/height and native portrait pixel width/
   height. Both panels must be equal sized, upright, with no relative roll.
   Physical dimensions establish metric scale; the solver cannot infer size
   from an image alone. Span the window, set seam split correctly and confirm
   coverage. **Align both displays for calibration** hides browser bars first
   and then asks X11 to extend fullscreen across the portrait pair. Confirm
   the patterns fill exactly the active areas. Layout/resolution/aspect errors
   prevent capture. Patterns have separate ChArUco IDs and a white margin.
2. Select the second camera (exclude the tracking camera). Show targets across
   the full screens with setup hidden. Space takes a capture, Escape restores
   controls. Automatic capture leaves targets visible, accepts distinct views
   and shows progress in the white margin; Escape stops it. Use eight or more distinct camera positions/tilts, both boards
   visible and sharp. Display and camera resolution must stay constant.
   Duplicate views and insufficient/non-spread corners are rejected. Reset
   starts a fresh set. Screen geometry edits invalidate prior captures.
3. Solve camera intrinsics from the planar boards over these views, solve
   each display pose, and recover angle, seam gap and vertical offset in cm.
   Reject poor reprojection, inconsistent relative poses, non-upright panels
   and asymmetric depth offsets unsupported by the current renderer. Show
   reprojection RMS, accepted views, result fields and the second camera pose
   at the last capture, also drawn in green in the debug mini-view with
   the solved screens. Return the second camera to its mount and take a final
   installed-position capture using the solved lens. Copy/Apply persists the
   lens, selected camera and installed pose. Later sessions can reuse this lens
   with one fixed-camera capture if focus/zoom and resolution are unchanged.
   No invented confidence percentages.
4. Optional tracking-camera calibration: download the separate shared board
   PNG, print at the stated physical size without scaling, hold it still where
   both cameras see its front, with screen targets also visible to the second
   camera. Capture eight diverse board poses. Solve tracking-camera intrinsics
   and chain the shared-board poses into the same display coordinate system.
   Browser video tracking must be active (depth-rgb shared capture unsupported).
   If this step is skipped, retain manual tracking-camera pose and FOV.
5. **Copy to Manual** explicitly copies supported solved values for review.
   **Apply** saves them. Failed solves leave manual measurements intact.
   Changes to camera, board, screen or viewport invalidate dependent results.
   If the helper or hardware is absent, explain how to start/select it and
   preserve manual setup. No camera uploads to external services.

Synthetic solver tests cover metric geometry, camera poses, rejection and
board generation. Physical accuracy still requires a real-camera validation.

The Span controls select exactly two equal, adjacent portrait displays,
aligned at the top in system display settings. Additional landscape displays
are excluded. Unsupported display arrangements show a corrective message.
