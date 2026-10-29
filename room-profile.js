/* Saved screen-pair profile (UX §3). Units in the profile: cm and degrees. */
(function (root) {
  const KEY = 'concave-room-profile-v2';
  const FIELDS = {
    screen: {
      width: [33.5, 20, 150], height: [60, 30, 250], angle: [90, 30, 180],
      gap: [1.5, 0, 20], vOffset: [0, -20, 20], seamSplit: [50, 20, 80],
      pixelWidth: [1080, 400, 4096], pixelHeight: [1920, 600, 7680]
    },
    // Defaults: Orbbec Femto Bolt colour lens on top of the seam (Lenovo view + Femto IMU,
    // 2026-10-29: 3 cm above, 5 cm forward, level within 1°).
    trackingCamera: {
      top: [3, -250, 100], forward: [5, -50, 100], tilt: [-1, -60, 80], fov: [60, 30, 120],
      yaw: [0, -80, 80], x: [0, -150, 150]
    },
    advanced: { overlap: [0, -20, 20], smoothingMs: [180, 20, 1000], steadiness: [50, 0, 100] },
    glass: { depth: [26, 10, 250], yaw: [7.4, -30, 30], width: [280, 120, 500], boardHeight: [115, 60, 250], frost: [45, 0, 100],
      daylightExposure: [100, 30, 180], whiteExposure: [125, 30, 180], daylightColor: [0xe8e9e5, 0, 0xffffff], whiteColor: [0xf0f0eb, 0, 0xffffff] },
    // Panda size; pandaLift = panda's lowest point above the bottom of the lower panel;
    // pandaYaw turns it about the vertical axis, pandaPitch tilts it toward (+) or away from the viewer;
    // open-front box (boxForward = the opening's z from the seam line,
    // + toward the viewer); cut box (cut by the screen planes, cutDepth = back wall behind the seam).
    scene: { boxWidth: [54, 10, 300], boxHeight: [55, 10, 300], boxForward: [-10, -100, 30], pandaScale: [100, 10, 300], pandaForward: [8, -100, 200], pandaLift: [15, -30, 200], pandaYaw: [0, -180, 180], pandaPitch: [0, -90, 90],
      cutWidth: [40, 10, 300], cutHeight: [50, 10, 300], cutDepth: [60, 10, 300] }
  };
  const MODELS = ['panda', 'cube', 'sphere'], BOX_SCENES = ['glass', 'cut', 'open'], DETECTORS = ['two-stage', 'fullframe', 'landmarker', 'depth-rgb'];
  function defaults() {
    const profile = { version: 5, calibratedAt: null, trackingDeviceId: '', calibrationDeviceId: '', calibration: null, roomBackdrop: 'reconstructed', lighting: 'daylight', model: 'panda', detector: 'depth-rgb', boxScene: 'glass' };
    for (const [group, fields] of Object.entries(FIELDS)) {
      profile[group] = {};
      for (const [key, [value]] of Object.entries(fields)) profile[group][key] = value;
    }
    return profile;
  }
  // Merge untrusted input over defaults, keeping only known, in-range numbers.
  function sanitize(input) {
    const profile = defaults();
    if (!input || typeof input !== 'object') return profile;
    // v4 measured the wall at 26 cm behind the seam; older saved depths (85 cm
    // default) belonged to the estimated whiteboard room. v5 tracks with the
    // Femto Bolt: older detector, tilt and forward values belonged to the webcam.
    const version = Number(input.version) || 0;
    const stale = { glass: version >= 4 ? [] : ['depth'], trackingCamera: version >= 5 ? [] : ['tilt', 'forward'] };
    for (const [group, fields] of Object.entries(FIELDS)) {
      for (const [key, [, min, max]] of Object.entries(fields)) {
        if (stale[group]?.includes(key)) continue;
        const value = Number(input[group]?.[key]);
        if (input[group]?.[key] !== undefined && Number.isFinite(value) && value >= min && value <= max) profile[group][key] = value;
      }
    }
    if (typeof input.calibratedAt === 'string' && !Number.isNaN(Date.parse(input.calibratedAt))) profile.calibratedAt = input.calibratedAt;
    if (MODELS.includes(input.model)) profile.model = input.model;
    if (version >= 5 && DETECTORS.includes(input.detector)) profile.detector = input.detector;
    if (BOX_SCENES.includes(input.boxScene)) profile.boxScene = input.boxScene;
    if (['daylight', 'white'].includes(input.lighting)) profile.lighting = input.lighting;
    if (['procedural', 'reconstructed'].includes(input.roomBackdrop)) profile.roomBackdrop = input.roomBackdrop;
    if (typeof input.calibrationDeviceId === 'string') profile.calibrationDeviceId = input.calibrationDeviceId.slice(0, 256);
    if (typeof input.trackingDeviceId === 'string') profile.trackingDeviceId = input.trackingDeviceId.slice(0, 256);
    const c = input.calibration;
    const matrix = (v, n) => Array.isArray(v) && v.length === n && v.every(row => Array.isArray(row) && row.length === n && row.every(x => typeof x === 'number' && Number.isFinite(x)));
    if (c && typeof c.deviceId === 'string' && matrix(c.intrinsics?.matrix, 3) && matrix(c.calibrationCamera?.matrix, 4)
        && Array.isArray(c.intrinsics.size) && c.intrinsics.size.length === 2 && c.intrinsics.size.every(x => Number.isInteger(x) && x >= 100 && x <= 4096)
        && Array.isArray(c.intrinsics.distortion) && [4,5,8,12,14].includes(c.intrinsics.distortion.flat().length)
        && c.intrinsics.distortion.flat().every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 2)
        && c.intrinsics.matrix[0][0] > 0 && c.intrinsics.matrix[1][1] > 0 && Number.isFinite(c.rms) && c.rms >= 0 && c.rms <= 1.5
        && Number.isFinite(c.calibrationCamera.fov) && c.calibrationCamera.fov > 25 && c.calibrationCamera.fov < 125) {
      profile.calibration = { deviceId: c.deviceId.slice(0,256), intrinsics: JSON.parse(JSON.stringify(c.intrinsics)),
        calibrationCamera: JSON.parse(JSON.stringify(c.calibrationCamera)), rms: c.rms,
        capturedAt: typeof c.capturedAt === 'string' && !Number.isNaN(Date.parse(c.capturedAt)) ? c.capturedAt : null };
      if(c.installedPosition===true)profile.calibration.installedPosition=true;
      const m=c.leftMonitor;
      if(m && matrix(m.matrix,4) && Array.isArray(m.centerCm) && m.centerCm.length===3
          && m.centerCm.every(v=>Number.isFinite(v)&&Math.abs(v)<500) && m.centerCm[0]<-10
          && m.dictionary==='DICT_4X4_50' && m.squareMm===35 && m.markerMm===28
          && Array.isArray(m.squares) && m.squares[0]===7 && m.squares[1]===5
          && Number.isFinite(m.rms) && m.rms>=0 && m.rms<=1.5 && Number.isInteger(m.views) && m.views>=1 && m.views<=30) {
        profile.calibration.leftMonitor=JSON.parse(JSON.stringify(m));
      }
    }
    return profile;
  }
  function inRange(group, key, value) {
    const [, min, max] = FIELDS[group][key];
    return Number.isFinite(value) && value >= min && value <= max;
  }
  function load(storage) {
    try {
      const raw = storage?.getItem(KEY);
      if (!raw) return { profile: defaults(), saved: false };
      // Keep saved measurements and scene selection. Replacing screen height
      // would also invalidate the saved eye calibration's exact camera pose.
      return { profile: sanitize(JSON.parse(raw)), saved: true };
    }
    catch { return { profile: defaults(), saved: false }; }
  }
  function save(storage, profile) {
    try { storage?.setItem(KEY, JSON.stringify(profile)); return true; } catch { return false; }
  }
  // Geometry in metres for ConcaveGeometry.screens().
  function geometry(profile) {
    const s = profile.screen;
    return { width: s.width/100, height: s.height/100,
      options: { angle: s.angle, gap: s.gap/100, vOffset: s.vOffset/100 } };
  }
  // Tracking camera pose in metres/degrees, measured from the corner line.
  // Height is above the top of the higher panel.
  function cameraPose(profile) {
    const s = profile.screen, c = profile.trackingCamera;
    return { x: c.x/100, y: (s.height/2+Math.abs(s.vOffset)/2+c.top)/100, z: c.forward/100,
      yaw: c.yaw, tilt: c.tilt, fov: c.fov };
  }
  root.RoomProfile = { KEY, MODELS, BOX_SCENES, DETECTORS, FIELDS, defaults, sanitize, inRange, load, save, geometry, cameraPose };
})(typeof window === 'undefined' ? globalThis : window);
