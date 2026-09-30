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

| Parameter | Unit | Default |
|---|---|---|
| Height above top of screens | cm | 3 |
| Forward from seam (toward viewer) | cm | 0 |
| Tilt down | ° | 25 |
| Horizontal field of view | ° | 60 |
| Yaw | ° | 0 (along the bisector; shown under *Advanced*) |

### Saved profile

- Saved automatically in the browser on **Apply**, and loaded on the next
  launch. Every field stays editable.
- **Export / Import profile (.json)** buttons allow a backup or moving the
  setup to another computer.
- A timestamp records when the profile was last calibrated.

---

## 4. Setup drawer views

### 4.1 Home

- Status card: last calibration time, angle, gap, screen size, webcam state.
- **Tracking source** switch (§4.4): *Iris size* or *Depth camera*.
- Two large buttons:
  - **Manual measurement**: "Measure with a tape and type the numbers."
  - **Camera auto-calibration** (optional, shows a *Preview* badge): "Use a
    second camera to measure the screens automatically."
- **Manual measurement is the primary path**, and it alone is enough to run
  the full experience.
- Footer: **Apply & start experience**.

### 4.2 Manual measurement

Sections, top to bottom:

1. **Screens:** width, height, inside angle *or* outer-edge distance, gap,
   vertical offset.
2. **Tracking camera:** a camera dropdown (needed because a second USB
   camera may be connected), then height, forward, tilt and FOV. Yaw and
   left/right offset are under *Advanced*.
3. **Live diagram:** the debug mini-view directly below the setup panel
   (§5.1) *is* the live diagram. It redraws the screen pair to scale at the
   entered angle and gap, with the webcam and its view cone, on every
   keystroke. No second copy is shown.
4. **Alignment test pattern** (toggle): replaces the scene with a grid
   floor, a gridded back wall, a vertical pole on the seam line (x = 0)
   behind the screens, and horizontal lines running across both screens. When the numbers are right, the lines look
   straight and continuous from the calibrated eye position.
5. **Eye-distance calibration:** the live webcam preview, a slider for the
   measured eye → webcam distance, and a **Calibrate tracking** button.
   This step is the same on both setup paths.
6. **Advanced** (collapsed): seam overlap (default 0, labelled *non-physical
   correction*), webcam yaw, webcam left/right offset, and tracking
   smoothing time (default 180 ms).
7. **Profile:** Export JSON / Import JSON buttons, and a link to the v1.0
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

### 4.4 Tracking source: iris size or depth camera (v2.1)

The eye position needs a distance from the tracking camera. There are two
ways to get it, and the user can alternate between them at any time. Both
stay in the app.

| Source | Distance comes from | Needs |
|---|---|---|
| **Iris size** (default, v2.0 behaviour) | The apparent iris size compared with the calibrated reference | The eye-distance calibration step (§4.2 step 5) |
| **Depth camera** | A depth sensor (Orbbec Astra class) read at the face | The depth bridge running (see below). No eye-distance calibration |

**Switching.** A two-button segmented control at the top of Home, labelled
**Iris size | Depth camera**, plus the key **T** which toggles. The choice
is saved in the profile. The switch never restarts the webcam, and the eye
does not jump: the smoothing filter (§4.2 Advanced) blends the change.

**Depth camera panel** (Home, below the switch, folded when the source is
*Iris size*):

- A status line with a coloured dot: **grey** "Not connected", **amber**
  "Connected, no reading at your face", **green** "Reading 118 cm".
- The **bridge address** (default `http://localhost:8765`) and a
  **Reconnect** button.
- A small **depth thumbnail** (grayscale, near = bright) with a cross at the
  point where the app reads the depth and a circle showing the sampling
  area. If the cross does not sit on your face when you sit in front of the
  camera, the alignment is wrong (see *Depth field of view* and *Flip*).
- Fields (under *Advanced* on the Manual page): **Depth FOV** (°, default
  58 for Astra), **Flip depth horizontally** (No/Yes), **Eye behind the
  measured surface** (cm, default 1.5: the depth is read from the face
  surface, the eyeball is slightly behind it).

**How the depth is used.** The eye's direction still comes from the iris
landmarks in the tracking camera image. The depth sensor gives the
distance along the camera axis at that direction: the app takes the median
of the valid depth pixels in a small area around the eyes (forehead, nose
and cheeks, because the eyes themselves often return no depth). The eye
position is then: camera position + distance × (the ray through the eyes).
The depth sensor is assumed to sit at the tracking camera and face the
same way.

**Fallbacks and messages** (shown in the status pill and the mini-view
warnings):

| Situation | Behaviour |
|---|---|
| Depth source selected, bridge not running | Grey status. If the iris source is calibrated, tracking continues with iris size and the pill says "Depth camera offline: using iris size". If not calibrated, the last eye position is held and the pill says "Depth camera offline". |
| Bridge running, but no valid depth at the face for over 300 ms | Same fallback. Pill: "No depth at face: using iris size". |
| Depth reading outside 25 cm – 3 m | Ignored as invalid. |
| Eyes not visible | Same as today: "Tracking lost: eyes not visible". |

The mini-view tags (§5.1) always say which source produced the current eye:
**src depth** or **src iris**.

**The depth bridge.** A browser cannot open most depth cameras directly, so
a small program, `tools/depth_bridge.py`, reads the depth camera and serves
low-resolution depth frames on `http://localhost:8765`. It is started in
a second terminal (`python3 tools/depth_bridge.py`). It also has a
`--simulate` mode with a fake face at a chosen distance, used to try the UI
without the hardware. Nothing about screen geometry is stored in the bridge.

### 4.5 Look and feel (v2.1)

The visual design follows `3d_projection_demo-master` (only the look and the
arrangement of controls, not its process):

- **Palette:** near-black blue background `#0b0d12`, translucent dark
  panels `rgba(18,21,28,.86)` with a hairline border `rgba(255,255,255,.12)`,
  one cyan accent `#4cc9f0`, muted grey text `#8a93a6`. The left and right
  screen colours (teal / violet) stay in the mini-view only.
- **Foldable sections** (like the reference's settings panel folders):
  each group of fields in the setup panel is a section with a small
  chevron header that folds. Rows are compact: label on the left, control
  on the right, sliders with a live value readout.
- **Readout block** (like the reference's HUD): the debug section starts
  with a monospace table of `label  value` rows: Source, Eye, Depth,
  Screen, Wall, Tracking. It replaces the wrapping row of small tags.
  Warnings stay red below it.
- **Settings state line** at the bottom of the setup panel, like the
  reference's "Settings · saved": **Settings · unsaved changes**,
  **Settings · saved 14:10** or **Settings · defaults**. Buttons next to it:
  **Revert to saved** and **Reset to defaults** (Apply saves).
- **Key hints** in one muted line: `T source · H column · D mini-view · P pause · R camera · W preview`.
- **Webcam preview (W):** a small mirrored preview with the eye marker at the
  bottom of the column, hidden by default once the experience starts.
- **Fatal errors** (no WebGL, libraries missing) are shown in a red overlay
  at the bottom of the screen instead of only in the status line.

## 5. Experience view

- **Apply** saves the profile, stamps the calibration time and folds the
  setup panel. It does *not* use browser fullscreen: Chrome's fullscreen
  covers only one monitor. Instead the window is spanned edge to edge
  across both monitors by `tools/span_window.py` (see README). The script
  launches Chrome as a frameless app window and asks the window manager to
  make it fullscreen across both monitors.
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
- the virtual scene's outline (room box and panda position);
- the wall: its opening follows the screens and its back plane is drawn as a
  thick line, so the thickness can be checked against the values.

**Side view:** the same elements seen from the side, including the webcam
tilt and the eye height.

**Parameter tags** (the values typed in setup, in bold):
- **θ 97.0°**, **gap 1.5 cm**, **33.6 × 59.8 cm**, **offset 0 cm**
- **Cam: +3 cm top, 0 cm fwd, 25° tilt, 60° FOV**
- Eye (live): x / y / z in cm, distance to seam, distance to webcam
- Tracking: source (depth / iris), depth reading in cm, FPS, sample age (ms), calibrated yes/no, calibration time (see §4.5 for how these are laid out)
- Warnings in red, e.g. "Eye outside supported area" or "Eye behind
  left-screen plane".

This panel is how you find what's wrong. If the eye dot jumps while you
sit still, tracking is the problem. If the frusta don't meet the screen
edges, the screen geometry is the problem.

---

### 5.2 Thick wall (v2.1)

The scene is a **thick wall** with the two screens cut into it, like a real
window with deep sides. The wall hugs the screens exactly:

- The opening is the outline of the two lit areas (the tilted top and bottom
  edges, the vertical outer edges, and the gap bridged straight across the
  seam). There is no black frame and no border inset any more.
- The wall's front face is the screen surface. It is **thickness** cm deep
  at its thinnest point (the seam) and its back is a flat plane parallel to
  the seam line. The top, bottom and outer side faces of the opening are
  therefore visible, and because they are real geometry they keep the right
  perspective as the eye moves. The room continues behind the wall's back.
- **Wall thickness** slider (Home → Scene): 0–20 cm, default 8 cm. 0 removes
  the wall (the room begins right at the seam).
- The wall is drawn in a light stone colour with soft shading so its depth
  is easy to read against the darker room.
- **Character depth** (Home → Scene) now goes from −25 to +40 cm, default
  **+16 cm**. A positive value puts the character in front of the seam.
  The default puts it ahead of the wall, so it looks as if it steps out of
  the concave corner towards the viewer. Parts of the character that would
  leave the lit area are cut by the screen edges. This is unavoidable on a
  physical screen.
- The alignment test pattern (§4.2 step 4) hides the wall, as before.

## 6. What changes from the current code (for implementation)

| Area | Change |
|---|---|
| `concave-geometry.js` | `screens(width, height, {angle, gap, vOffset})`. The options default to the v1 90°/gapless pair, so the v1 demos are unchanged. Adds `planeDistance`, `inFront`, `angleFromOuterDistance`, `outerDistance`. `project()` is unchanged. |
| `concave-room.js` | Remove the 75% room follow. Remove the display-window / BroadcastChannel mode. The profile lives in `room-profile.js` and the mini-view drawing in `room-miniview.js`. |
| `concave-room.html` | Restructure the controls into the foldable drawer with Home / Manual / Camera views and a sticky **Apply** footer. Remove Open left/right. |
| New | `calibration-camera.js`: v2.0 = placeholder UI plus calibration-camera selection and preview only. Later: ChArUco detection via OpenCV.js and the shared-board pose solver. |
| Layout | Left 20% column on the left screen: setup panel above, mini-view below. |
| Versioning | The current demos are tagged `v1.0` and stay in the repo. v2.0 turns `concave-room.html` into the single app. |
| Depth | New `depth-source.js` (bridge client, depth sampling), `eyeFromDepth()` in `concave-room-tracking.js`, `tools/depth_bridge.py`. Profile gets `trackingSource` and a `depth` group. |
| Wall | `concave-room.js`: new opening-following thick wall replaces the flat portal and black frame. Profile gets `advanced.wallThickness`. |
| Look | `concave-room.css` / `concave-room.html`: §4.5. |
| Entry point | `index.html` redirects to `concave-room.html`. The old flat demo moves to `backup/index.html`. |
| Tests | `room-v2.test.cjs`: corner positions for angles 60°–180°, gaps and offsets; a flat 180°, 0-gap pair must match a single wide screen; the angle helper; profile sanitizing. |

---

## 7. Decisions

1. The v1.0 demo files (`index.html`, `concave.html`) **stay in the repo**.
2. Camera calibration is **optional**. It is a placeholder UI in v2.0, and
   manual input is the primary path.
3. The calibration camera is a **second USB webcam** (no phone support).
4. Later method: a **shared printed board** seen by both cameras. No marker
   is attached to the tracking camera.
5. **v2.1:** the depth camera is an *alternative* to iris size, never a
   replacement. Both stay selectable and iris size stays the default.
6. **v2.1:** `concave-room.html` is the app's entry point. `index.html` only
   redirects to it. The original flat demo lives in `backup/`.
