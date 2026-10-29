const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
require('./room-profile.js');
const P=globalThis.RoomProfile;
const p=P.defaults();
assert.equal(p.boxScene,'glass');assert.equal(p.screen.width,33.5);assert.equal(p.screen.height,60);
p.glass.daylightExposure=83;p.glass.whiteExposure=141;p.glass.daylightColor=0xbfc8c9;p.lighting='white';
const storage={value:null,getItem(){return this.value;},setItem(k,v){this.value=v;}};
P.save(storage,p);assert.deepEqual(P.load(storage).profile,p);
assert.equal(P.sanitize({glass:{frost:999,depth:NaN},lighting:'invalid'}).glass.frost,45);
assert.equal(P.sanitize({boxScene:'open'}).boxScene,'open');
storage.value=JSON.stringify({...p,version:2,boxScene:'cut',screen:{...p.screen,width:33.6,height:59.8}});
const old=P.load(storage).profile;assert.equal(old.boxScene,'cut');assert.equal(old.screen.height,59.8);assert.equal(old.screen.width,33.6);
assert.equal(P.sanitize({scene:{pandaForward:200}}).scene.pandaForward,200);
assert.equal(P.defaults().scene.pandaLift,15);
assert.equal(P.sanitize({scene:{pandaLift:60}}).scene.pandaLift,60);
assert.equal(P.sanitize({scene:{pandaLift:900}}).scene.pandaLift,15);
assert.equal(P.sanitize({scene:{pandaYaw:-120,pandaPitch:45}}).scene.pandaYaw,-120);
assert.equal(P.sanitize({scene:{pandaPitch:120}}).scene.pandaPitch,0);
// v4 measured wall: older profiles drop their estimated wall distance once.
assert.equal(p.version,5);assert.equal(p.glass.depth,26);assert.equal(p.glass.yaw,7.4);
assert.equal(P.sanitize({version:3,glass:{depth:85,frost:30}}).glass.depth,26);
assert.equal(P.sanitize({version:3,glass:{depth:85,frost:30}}).glass.frost,30);
assert.equal(P.sanitize({version:4,glass:{depth:40,yaw:-3}}).glass.depth,40);
assert.equal(P.sanitize({version:4,glass:{yaw:45}}).glass.yaw,7.4);
// Measured layout: wall behind the seam, tower against the wall right of the
// screens, monitor left of them, both standing on or above the desk.
const layout=JSON.parse(fs.readFileSync(__dirname+'/assets/room/glass/layout.json','utf8'));
assert.equal(layout.tower.z[0],0);assert.ok(layout.tower.x[0]>30&&layout.tower.y[0]===layout.deskY);
assert.ok(layout.monitor.x[1]<-30&&layout.monitor.y[0]>layout.deskY);
for(const name of ['wall','desk','tower-front','tower-side','monitor-front','monitor-stand'])
  assert.ok(fs.statSync(__dirname+`/assets/room/glass/${name}.jpg`).size>1000,name);
const lens={deviceId:'lenovo',rms:.4,capturedAt:new Date().toISOString(),intrinsics:{matrix:[[1400,0,960],[0,1400,540],[0,0,1]],distortion:[[0,0,0,0,0]],size:[1920,1080]},calibrationCamera:{matrix:[[1,0,0,0],[0,1,0,.2],[0,0,1,1.2],[0,0,0,1]],fov:68}};
p.calibration=lens;P.save(storage,p);assert.deepEqual(P.load(storage).profile.calibration,lens);
assert.equal(P.sanitize({calibration:{...lens,intrinsics:{...lens.intrinsics,size:[0,1080]}}}).calibration,null);
const monitor={squares:[7,5],squareMm:35,markerMm:28,dictionary:'DICT_4X4_50',matrix:[[1,0,0,-.68],[0,-1,0,.12],[0,0,-1,-.24],[0,0,0,1]],centerCm:[-55.75,3.25,-24],rms:.3,views:12};
p.calibration={...lens,leftMonitor:monitor};P.save(storage,p);assert.deepEqual(P.load(storage).profile.calibration.leftMonitor,monitor);
assert.equal(P.sanitize({calibration:{...lens,leftMonitor:{...monitor,squareMm:30}}}).calibration.leftMonitor,undefined);

// Bright central monitor pixels must not drive a neutral-wall match.
const pixels=new Uint8ClampedArray(160*100*4);
for(let y=0;y<100;y++)for(let x=0;x<160;x++){
  const border=x<=28||x>=132||y<=18||y>=82,i=(y*160+x)*4;
  pixels.set(border?[160,170,180,255]:[255,0,0,255],i);
}
const context={globalThis:{},document:{createElement(){return {getContext(){return {drawImage(){},getImageData(){return {data:pixels};}}}};}}};
vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/glass-room.js','utf8'),context);
const match=context.globalThis.GlassRoom.sampleSurroundings({});
assert.equal(match.exposure,81);assert.equal(match.color,(216<<16)|(230<<8)|244);
pixels.fill(0);assert.throws(()=>context.globalThis.GlassRoom.sampleSurroundings({}),/Too few neutral/);

// All literal UI bindings must exist in the page; catch integration failures.
const html=fs.readFileSync(__dirname+'/concave-room.html','utf8');
for(const file of ['concave-room.js','screen-calibration-ui.js']){
  const source=fs.readFileSync(__dirname+'/'+file,'utf8');new vm.Script(source);
  for(const [,id] of source.matchAll(/\$\('([^']+)'\)/g))assert.ok(html.includes(`id="${id}"`),`${file}: missing ${id}`);
}
console.log('PASS: glass profile persistence/migration, measured room layout, lighting isolation, border colour matching and UI bindings.');
