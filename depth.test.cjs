// v2.1 checks: depth-camera eye reconstruction, depth sampling and profile fields.
// Run with: node depth.test.cjs
const assert = require('node:assert/strict');
require('./concave-room-tracking.js'); require('./depth-source.js'); require('./room-profile.js');
const T = globalThis.PortraitTracking, D = globalThis.DepthSource, P = globalThis.RoomProfile;
const dot = (a, b) => a.reduce((s, x, i) => s+x*b[i], 0);

// Project a world eye into the tracking image (what MediaPipe would report) and into a depth frame.
function imageSample(eye, pose, aspect = 16/9) {
  const axes = T.basis(pose), delta = [eye.x-pose.x, eye.y-pose.y, eye.z-pose.z], z = dot(delta, axes.forward);
  const focal = 1/(2*Math.tan(pose.fov*Math.PI/360));
  return { x: .5+focal*dot(delta, axes.right)/z, y: .5-focal*aspect*dot(delta, axes.up)/z, iris: focal*.0117/z, aspect, z };
}
function depthFrame(sample, depthFov, rgbFov, mm, flip = false, w = 160, h = 120) {
  const data = new Uint16Array(w*h).fill(2400);
  const map = D.mapToDepth(sample, rgbFov, depthFov, w/h, flip);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (Math.hypot((x+.5)/w-map.u, ((y+.5)/h-map.v)*h/w) < .07) data[y*w+x] = mm;
  return { width: w, height: h, data, hfov: depthFov };
}

let count = 0;
for (const yaw of [-20, 0, 20]) for (const tilt of [0, 25, 40]) for (const dFov of [58.4, 70]) {
  const pose = { x: .02, y: .5, z: .01, yaw, tilt, fov: 60 };
  for (const eye of [{ x: 0, y: 0, z: 1.2 }, { x: .12, y: -.05, z: .8 }, { x: -.1, y: .1, z: 1.5 }]) {
    const sample = imageSample(eye, pose), z = sample.z;
    if (sample.x < .1 || sample.x > .9 || sample.y < .1 || sample.y > .9) continue; // outside the camera's view
    // Depth sensor reads the z-depth along its optical axis at the face.
    const frame = depthFrame(sample, dFov, pose.fov, Math.round(z*1000));
    const hit = D.faceDepth(frame, sample, pose.fov, dFov, false);
    assert.ok(hit, `depth found yaw=${yaw} tilt=${tilt} fov=${dFov} eye=${JSON.stringify(eye)} s=${JSON.stringify(sample)}`); assert.ok(Math.abs(hit.depth-z) < .002, `depth ${hit.depth} vs ${z}`);
    const got = T.eyeFromDepth(sample, pose, hit.depth);
    for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(got[k]-eye[k]) < .003, `eye ${k}: ${got[k]} vs ${eye[k]}`);
    count++;
  }
}
assert.ok(count >= 20, `only ${count} cases in view`);
console.log(`PASS: ${count} depth reconstructions across poses and depth FOVs.`);

// Flip: a mirrored depth frame is read correctly only with the flip flag.
{
  const pose = { x: 0, y: .5, z: 0, yaw: 0, tilt: 20, fov: 60 }, sample = imageSample({ x: .2, y: 0, z: 1 }, pose);
  const mirrored = depthFrame(sample, 58, 60, 1000, true);
  assert.ok(Math.abs(D.faceDepth(mirrored, sample, 60, 58, true).depth-1) < .002);
  assert.ok(Math.abs(D.faceDepth(mirrored, sample, 60, 58, false).depth-1) > 1, 'wrong flip reads the background');
  console.log('PASS: flip flag.');
}

// Invalid depth is ignored: zeros, too near, too far, too few pixels.
{
  const frame = { width: 20, height: 20, data: new Uint16Array(400), hfov: 58 };
  assert.equal(D.depthAt(frame, .5, .5, .1), null, 'all zero');
  frame.data.fill(100); assert.equal(D.depthAt(frame, .5, .5, .1), null, 'too near');
  frame.data.fill(4500); assert.equal(D.depthAt(frame, .5, .5, .1), null, 'too far');
  frame.data.fill(0); frame.data[210] = 900; assert.equal(D.depthAt(frame, .5, .5, .1), null, 'too few');
  frame.data.fill(900); frame.data[210] = 1500; assert.equal(D.depthAt(frame, .5, .5, .1).depth, .9, 'median rejects outliers');
  assert.equal(T.eyeFromDepth({ x: .5, y: .5, aspect: 1.7 }, { x: 0, y: 0, z: 0, yaw: 0, tilt: 0, fov: 60 }, .01), null, 'depth too small');
  assert.equal(T.eyeFromDepth(null, {}, 1), null);
  console.log('PASS: invalid depth rejection.');
}

// Frame message parsing (what depth_bridge.py sends).
{
  const w = 16, h = 12, data = new Uint16Array(w*h).map((_, i) => 500+i);
  const b64 = Buffer.from(data.buffer).toString('base64');
  const frame = D.parse(JSON.stringify({ w, h, hfov: 58.4, unit: 'mm', d: b64 }));
  assert.equal(frame.data[7], 507); assert.equal(frame.hfov, 58.4);
  assert.equal(D.parse(JSON.stringify({ w, h, d: b64.slice(4) })), null, 'wrong length');
  assert.equal(D.parse('nonsense'), null); assert.equal(D.parse(JSON.stringify({ w: 5000, h: 5000, d: '' })), null);
  console.log('PASS: bridge frame parsing.');
}

// Profile: new fields sanitize like the rest.
{
  const d = P.defaults();
  assert.equal(d.trackingSource, 'iris'); assert.equal(d.advanced.wallThickness, 8); assert.equal(d.advanced.modelDepth, 16);
  assert.equal(d.depth.fov, 58); assert.equal(d.depthUrl, 'http://localhost:8765');
  const s = P.sanitize({ trackingSource: 'depth', depthUrl: 'http://10.0.0.5:9000', advanced: { wallThickness: 99, modelDepth: 20 }, depth: { fov: 62, flip: 1, eyeOffset: 'x' } });
  assert.equal(s.trackingSource, 'depth'); assert.equal(s.depthUrl, 'http://10.0.0.5:9000');
  assert.equal(s.advanced.wallThickness, 8, 'out of range ignored'); assert.equal(s.advanced.modelDepth, 20);
  assert.equal(s.depth.fov, 62); assert.equal(s.depth.flip, 1); assert.equal(s.depth.eyeOffset, 1.5);
  assert.equal(P.sanitize({ trackingSource: 'laser', depthUrl: 'javascript:alert(1)' }).trackingSource, 'iris');
  assert.equal(P.sanitize({ depthUrl: 'javascript:alert(1)' }).depthUrl, 'http://localhost:8765');
  console.log('PASS: profile fields.');
}
