# calibration

The two-camera calibration rig: board, tools, the tested placement and every
capture. The app-side flow is specified in [`docs/UX.md` §4.3](../docs/UX.md);
the solver is still to do (README tasks C2–C9).

**Current rig:** [`rig-2026-10-01.json`](rig-2026-10-01.json). Tracking camera
= Orbbec Astra Pro on top of the seam (colour 1080p for calibration, depth
640 × 480, 58.6° × 45.6°). Calibration camera = Lenovo FHD webcam. Board = the
A4 ChArUco board below, upright on a stand. The placement is verified, but no poses
are solved yet.

| Folder | What |
|---|---|
| `board/` | `charuco_a4_7x5_38mm_4x4.pdf` (7 × 5 squares of 38 mm, 28 mm `DICT_4X4_50` markers) and `make_a4_board.py`, which draws it. Print at **100% / Actual size** and check that 7 squares = 266 mm. Glue it to card or foam board. |
| `tools/board_placement_test.py` | Live side-by-side view of both cameras. It detects the board in each and shows corners, px per marker cell, approximate distance and angle, and OK / WEAK. `s` saves a snapshot and log line to `captures/<today>/`, `q` quits. `--board lab` for the 9 × 7 lab board. |
| `tools/synthetic_range.py` | How small the lab board can get in the image and still be detected (synthetic). |
| `depth/` | Depth camera hardware checks: `probe_depth.py` (OpenNI2 mode, FOV, fps, stats, saves `probe_depth.pgm`), `check_bridge.cjs` (reads the running bridge through `depth-source.js`), `orbbec-usb.rules` (udev rule, installed by `tools/setup_depth.sh`). |
| `captures/2026-10-01/` | Every placement capture of the first session (below). |

## Run

```bash
python3 -m venv .venv && .venv/bin/pip install -r calibration/tools/requirements.txt
.venv/bin/python calibration/tools/board_placement_test.py          # A4 board, Astra + Lenovo found by name
conda activate depth_cam && python calibration/depth/probe_depth.py  # depth sensor check (stop the bridge first)
bash run.sh                                                          # then, in a second terminal:
node calibration/depth/check_bridge.cjs                              # bridge check
```

Close the app first, because a camera can be opened by only one program at a time.
Both cameras run at 1080p 15 fps, because two 1080p30 streams don't fit on the
shared USB 2.0 hub.

## Captures, 2026-10-01

Each snapshot shows both cameras side by side (Astra left, Lenovo right) with
the detection overlay. Distances and angles assume a 60° / 70° FOV, so they
are approximate.

| Folder | Setup | Result |
|---|---|---|
| `lab-board/` | Lab board 9 × 7, 13 mm markers, hand-held | Lenovo at most 3.2 px/cell (needs 3): only 27 of 65 readable. **Too small.** |
| `a4-board/run1-handheld-lenovo-low` | A4 board, hand-held facing the Astra; Lenovo low and to the side | Readable (Astra 8.5–10.9, Lenovo 6.5–8.1 px/cell), but the Lenovo sees only one screen and 6–14 corners. |
| `a4-board/run2-handheld-lenovo-side` | Lenovo moved: sees both screens | 20–24 corners, but the board sits in the Lenovo's corner at 61–67°. Hand movement adds error. |
| `a4-board/run3-stand` | Board on the winch post | Lenovo 24/24 at 47–59°. Astra 12–17 (board at its edge, bottom cut). |
| `a4-board/run4-stand-final` | Post moved toward the Astra's centre, board raised | **Astra 19/24 at 50°, 94 cm; Lenovo 21/24 at 53°, 77 cm. Identical in all 6 captures. Use this.** |
| `depth/probe_depth.pgm` | Depth probe, viewer at the screens | 28.6 fps, 39% valid, 580–7399 mm. |

`placement_log.csv` in each board folder has one row per camera per
capture: corners, markers, px/cell, distance, angle and status. The A4 log
also has a `run` column.

**Not recorded:** the tape-measured positions of the Lenovo and the board
relative to the seam. Measure them the next time the rig is set up, and add
them to the rig file.
