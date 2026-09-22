const assert = require('node:assert/strict');
require('./concave-room-tracking.js');
const {basis, estimate} = globalThis.PortraitTracking;
const dot = (a,b) => a.reduce((s,x,i)=>s+x*b[i],0);
function sample(eye, pose) {
  const axes=basis(pose), delta=[eye.x-pose.x,eye.y-pose.y,eye.z-pose.z];
  const depth=dot(delta,axes.forward), focal=1/(2*Math.tan(pose.fov*Math.PI/360)), aspect=16/9;
  return {x:.5+focal*dot(delta,axes.right)/depth,y:.5-focal*aspect*dot(delta,axes.up)/depth,iris:focal*.0117/depth,aspect};
}
let count=0;
for(const yaw of [-30,0,30]) for(const tilt of [0,25,45]) for(const height of [.6,1.067,2]) {
  const pose={x:.05,y:height/2+.03,z:.02,yaw,tilt,fov:60}, eye={x:0,y:0,z:1.2};
  const reference={...sample(eye,pose),pose,eye};
  for(const x of [-.3,0,.3]) for(const y of [-.3,0,.3]) for(const z of [.8,1.2,2]) {
    const expected={x,y,z}, actual=estimate(sample(expected,pose),reference);
    assert.ok(actual);
    for(const key of ['x','y','z']) assert.ok(Math.abs(actual[key]-expected[key])<1e-9,`reconstruction ${key}`);
    count++;
  }
  assert.equal(estimate({...reference,aspect:1},reference),null);
  assert.equal(estimate({...reference,iris:0},reference),null);
}
console.log(`PASS: ${count} webcam pose/eye reconstructions, invalid aspect and iris rejection.`);

const {eyeFromSample, validEye, smoothEye} = globalThis.PortraitTracking;
for (const range of [.2,.4,.6,.9,1.2,4]) for (const yaw of [-25,0,25]) {
  const pose = {x:.05,y:.5635,z:0,yaw,tilt:25,fov:60};
  const raySample = {x:.55,y:.58,aspect:16/9};
  const eye = eyeFromSample(raySample,pose,range);
  assert.ok(Math.abs(Math.hypot(eye.x-pose.x,eye.y-pose.y,eye.z-pose.z)-range)<1e-12);
  const projected = sample(eye,pose);
  assert.ok(Math.abs(projected.x-raySample.x)<1e-12);
  assert.ok(Math.abs(projected.y-raySample.y)<1e-12);
}
assert.ok(validEye({x:0,y:.4,z:.18}),'Close camera-based viewpoints allowed');
assert.equal(validEye({x:.3,y:0,z:.2}),false,'Reject eyes behind a panel');
assert.equal(eyeFromSample({x:.5,y:.5,aspect:1},{x:0,y:0,z:0,yaw:0,tilt:0,fov:60},NaN),null);
const initial = {x:0,y:0,z:1.2};
assert.deepEqual(smoothEye(initial,{x:.001,y:-.001,z:1.201},.033),initial);
function settle(hz) {
  let eye = {...initial};
  for(let i=0;i<hz;i++) eye = smoothEye(eye,{x:.2,y:-.1,z:1.5},1/hz);
  return eye;
}
for(const axis of ['x','y','z']) assert.ok(Math.abs(settle(30)[axis]-settle(60)[axis])<1e-9);
assert.ok(settle(30).x>.19 && settle(30).x<.2);
console.log('PASS: camera-ray distance reconstruction, close viewing positions, panel half-space validation, sub-2 mm jitter rejection, and frame-rate-independent smoothing.');
