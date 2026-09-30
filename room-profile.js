/* Saved screen-pair profile (UX §3). Units in the profile: cm and degrees. */
(function (root) {
  const KEY = 'concave-room-profile-v2';
  const FIELDS = {
    screen: {
      width: [33.6, 20, 150], height: [59.8, 30, 250], angle: [90, 30, 180],
      gap: [1.5, 0, 20], vOffset: [0, -20, 20], seamSplit: [50, 20, 80]
    },
    trackingCamera: {
      top: [3, -250, 100], forward: [0, -50, 100], tilt: [25, -60, 80], fov: [60, 30, 120],
      yaw: [0, -80, 80], x: [0, -150, 150]
    },
    advanced: { overlap: [0, -20, 20], smoothingMs: [180, 20, 1000], wallThickness: [8, 0, 20], modelDepth: [16, -25, 40] },
    // Depth camera (UX 4.4): sensor horizontal FOV, mirror flag, and how far
    // the eyeball sits behind the measured face surface, plus the depth camera's position and angle
    // relative to the tracking camera and its distance correction (UX 8.4). cm / degrees.
    depth: { fov: [58, 20, 120], flip: [0, 0, 1], eyeOffset: [1.5, -5, 10], dx: [0, -30, 30], dy: [0, -30, 30],
      yaw: [0, -30, 30], tilt: [0, -30, 30], scale: [1, .7, 1.3], bias: [0, -20, 20] }
  };
  function defaults() {
    const profile = { version: 2, calibratedAt: null, trackingDeviceId: '', trackingSource: 'iris', depthUrl: 'http://localhost:8765' };
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
    for (const [group, fields] of Object.entries(FIELDS)) {
      for (const [key, [, min, max]] of Object.entries(fields)) {
        const value = Number(input[group]?.[key]);
        if (input[group]?.[key] !== undefined && Number.isFinite(value) && value >= min && value <= max) profile[group][key] = value;
      }
    }
    if (typeof input.calibratedAt === 'string' && !Number.isNaN(Date.parse(input.calibratedAt))) profile.calibratedAt = input.calibratedAt;
    if (typeof input.trackingDeviceId === 'string') profile.trackingDeviceId = input.trackingDeviceId.slice(0, 256);
    if (input.trackingSource === 'iris' || input.trackingSource === 'depth') profile.trackingSource = input.trackingSource;
    if (typeof input.depthUrl === 'string' && /^https?:\/\/[^\s]{1,200}$/.test(input.depthUrl)) profile.depthUrl = input.depthUrl;
    return profile;
  }
  function inRange(group, key, value) {
    const [, min, max] = FIELDS[group][key];
    return Number.isFinite(value) && value >= min && value <= max;
  }
  function load(storage) {
    try { const raw = storage?.getItem(KEY); return raw ? { profile: sanitize(JSON.parse(raw)), saved: true } : { profile: defaults(), saved: false }; }
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
  // Depth camera model in metres for DepthSource.locate() (UX 8.4).
  function depthModel(profile) {
    const d = profile.depth;
    return { rgbFov: profile.trackingCamera.fov, fov: d.fov, flip: d.flip === 1, dx: d.dx/100, dy: d.dy/100, dz: 0,
      yaw: d.yaw, tilt: d.tilt, scale: d.scale, bias: d.bias/100 };
  }
  // Copy a profile into another in place, so bound controllers keep pointing at the same group objects.
  function assign(target, source) {
    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === 'object' && target[key] && typeof target[key] === 'object') Object.assign(target[key], value);
      else target[key] = value;
    }
    return target;
  }
  root.RoomProfile = { depthModel, assign, KEY, FIELDS, defaults, sanitize, inRange, load, save, geometry, cameraPose };
})(typeof window === 'undefined' ? globalThis : window);
