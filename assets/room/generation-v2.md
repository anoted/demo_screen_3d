# Equipment-focused room background

Generated with the built-in image generation tool from [the Lenovo camera reference](lenovo-room-reference-v2.jpg).

Output: [room-equipment-daylight-v2.png](room-equipment-daylight-v2.png).

Removes only the central portrait display pair, their stands and mounted camera, and calibration papers. Retains the left landscape monitor/laptop, right desktop tower, desk peripherals and wiring. The whiteboard is subdued. Hidden surfaces and equipment depths in the renderer are estimates, not calibrated room measurements. Daylight is the photographic reference; the overhead-white setting changes the scene lighting rather than claiming a second measured photograph.

Original generated file: `/home/iotlabg1robot/.codex/generated_images/01a131a4-5fb5-7472-898e-06ddbf85c9f4/exec-a69ab93b-69b5-4455-b8d4-a0203cc08751.png`.

## Prompt

Use case: precise-object-edit.
Asset type: photorealistic room continuation texture for an interactive 3D scene viewed through frosted glass.
Input image 1 is the edit target: the actual Lenovo camera photo of this lab workstation.
Primary request: remove ONLY the two large central portrait monitors arranged in a concave 90-degree corner, their central stands, the panda content on those two monitors, and the small white tracking camera mounted above their seam. Reconstruct the small unseen area behind them naturally.
KEEP the surrounding workstation equipment as the main visual anchors: the landscape screen with its dark code/editor display and silver stand on the LEFT; the partly visible laptop and mouse at the lower left; the large black Dell desktop tower with diamond mesh front on the RIGHT, the blue tape and its connected white cable; and the real white tabletop, black keyboards, mouse, small adapters/hubs, notes, and believable few connecting wires. Do not remove these side screens or computers. Keep their relative left/right placement, shapes, materials, and approximate proportions faithful to the reference.
The whiteboard is incidental background. Keep its existing location behind the equipment, but make it plain and visually subdued with faint blurred writing rather than emphasizing or expanding it. Remove the taped ChArUco/checkerboard calibration papers.
Composition: wide landscape 16:9 view of the same workstation; gently level the tilted camera view so the desk edge is approximately horizontal; keep both side equipment clusters well visible near the left and right thirds, and open space where the two central portrait monitors were removed. The peripheral equipment should carry the scene; avoid a big blank whiteboard composition. Keep the desk edge and a small amount of the existing under-desk wires visible.
Lighting: preserve the actual soft daylight and neutral lab colors; plausible photo, ordinary real workspace, no stylization.
Constraints: no added people, no panda, no central replacement screens, no invented decorations, no calibration markers, no new room architecture. Do not turn the room into an empty wall. Produce one clean image without UI, labels, borders or a before/after layout.

