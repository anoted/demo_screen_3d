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
