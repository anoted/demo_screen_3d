(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const ui = { message: '' };
  const status = message => { ui.message = message; };
  const fatal = message => { const box = $('fatal'); box.hidden = false; box.textContent += message+'\n'; status(message); };
  const typing = el => ['INPUT','SELECT','TEXTAREA'].includes(el?.tagName);

  // ---------------------------------------------------------------- profile
  let storage = null;
  try { storage = localStorage; } catch {}
  const loaded = RoomProfile.load(storage);
  const profile = loaded.profile;
  let hasSavedProfile = loaded.saved;
  const state = { eye: { x: 0, y: 0, z: 1.20 }, dancePlaying: true, danceEpoch: Date.now(), danceOffset: 0,
    testPattern: false, trail: [], via: 'iris', viaTime: 0 };
  let dirty = false;
  let pair, geometryKey = '';
  function derive() {
    const g = RoomProfile.geometry(profile);
    pair = ConcaveGeometry.screens(g.width, g.height, g.options);
    geometryKey = JSON.stringify([profile.screen, profile.advanced.wallThickness]);
  }
  derive();

  if (!window.THREE || !window.lil) { fatal('3D or UI library could not load. Check your connection and reload.'); return; }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
  catch { fatal('WebGL unavailable. Enable hardware acceleration and reload.'); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // updated once per frame, not once per viewport
  renderer.setScissorTest(true); $('stage').appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
  scene.add(new THREE.HemisphereLight(0xe1efff, 0x30314a, .45));
  const light = new THREE.DirectionalLight(0xffead5, 1.1);
  light.castShadow = true; light.shadow.mapSize.set(2048, 2048); light.shadow.bias = -.0002; scene.add(light);
  const rim = new THREE.DirectionalLight(0x80bfff, .25); rim.position.set(1, .5, -1); scene.add(rim);
  const cameras = [new THREE.PerspectiveCamera(), new THREE.PerspectiveCamera()];

  // ---------------------------------------------------------------- room
  // The whole room responds fully to the tracked eye (UX §0): it is fixed in
  // world space like everything else.
  const room = new THREE.Group(); room.name = 'shared-room'; scene.add(room);
  const pattern = new THREE.Group(); pattern.name = 'test-pattern'; pattern.visible = false; scene.add(pattern);
  const roomMaterials = {
    back: new THREE.MeshStandardMaterial({color: 0x536986, roughness: .95}),
    left: new THREE.MeshStandardMaterial({color: 0x387d85, roughness: .95}),
    right: new THREE.MeshStandardMaterial({color: 0x77618d, roughness: .95}),
    floor: new THREE.MeshStandardMaterial({color: 0x696d88, roughness: .88}),
    frame: new THREE.MeshBasicMaterial({color: 0x030405}),
    edge: new THREE.MeshBasicMaterial({color: 0x303c49}),
    trim: new THREE.MeshStandardMaterial({color: 0x9cb9cb, roughness: .8}),
    wall: new THREE.MeshStandardMaterial({color: 0xcfc7b8, roughness: .92, side: THREE.DoubleSide})
  };
  function roomBox(name, size, position, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name; mesh.position.set(...position); mesh.receiveShadow = true;
    room.add(mesh); return mesh;
  }
  let roomLayout = '';
  const bounds = { left: 0, right: 0, back: 0, front: 0, floor: 0, ceiling: 0 };
  function clear(group) {
    for (const child of [...group.children]) { child.geometry?.dispose(); group.remove(child); }
  }
  function updateRoom() {
    if (geometryKey === roomLayout) return;
    roomLayout = geometryKey;
    clear(room); clear(pattern);
    const w = profile.screen.width/100, h = profile.screen.height/100;
    // Corners of the two lit areas. The opening is their outline, with the gap
    // bridged straight across the seam (UX 5.2).
    const [L, R] = pair, plus = (a, b) => a.map((v, i) => v+b[i]), minus = (a, b) => a.map((v, i) => v-b[i]);
    const top = [L.pc, plus(L.pc, minus(L.pb, L.pa)), R.pc, plus(R.pc, minus(R.pb, R.pa))];
    const bottom = [L.pa, L.pb, R.pa, R.pb];
    const outerX = Math.max(Math.abs(L.pa[0]), Math.abs(R.pb[0]));
    const topY = Math.max(...top.map(p => p[1])), floorY = Math.min(...bottom.map(p => p[1]));
    const zFront = Math.min(...top.concat(bottom).map(p => p[2])), zBack = zFront-profile.advanced.wallThickness/100;
    // The wall: its front face is the screen surface, its back a flat plane, and the
    // opening's top, bottom and outer sides are real geometry that keeps perspective.
    const positions = [];
    const quad = (p, q) => { const p2 = [p[0], p[1], zBack], q2 = [q[0], q[1], zBack]; positions.push(...p, ...q, ...q2, ...p, ...q2, ...p2); };
    for (const edge of [top, bottom]) for (let i = 0; i < 3; i++) quad(edge[i], edge[i+1]);
    quad(bottom[0], top[0]); quad(bottom[3], top[3]);
    const reveal = new THREE.BufferGeometry();
    reveal.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); reveal.computeVertexNormals();
    const wall = new THREE.Mesh(reveal, roomMaterials.wall);
    wall.name = 'thick-wall'; wall.castShadow = wall.receiveShadow = true; room.add(wall);
    // The room continues behind the wall's back plane.
    const halfWidth = outerX*1.7, back = zBack-Math.max(w*2, .65), front = zBack;
    const ceiling = topY+h*.35, depth = front-back;
    Object.assign(bounds, { left: -halfWidth, right: halfWidth, back, front, floor: floorY, ceiling, wallBack: zBack, wallTop: topY, outerX });
    roomBox('room-back-wall', [halfWidth*2, ceiling-floorY, .025], [0,(ceiling+floorY)/2,back-.0125], roomMaterials.back);
    roomBox('room-left-wall', [.025,ceiling-floorY,depth], [-halfWidth-.0125,(ceiling+floorY)/2,(front+back)/2], roomMaterials.left);
    roomBox('room-right-wall', [.025,ceiling-floorY,depth], [halfWidth+.0125,(ceiling+floorY)/2,(front+back)/2], roomMaterials.right);
    roomBox('room-ceiling', [halfWidth*2,.025,depth], [0,ceiling+.0125,(front+back)/2], roomMaterials.back);
    roomBox('room-floor', [halfWidth*2,.025,depth], [0,floorY-.0125,(front+back)/2], roomMaterials.floor);
    for (const x of [-.66,-.33,.33,.66]) roomBox('floor-seam', [.0015,.001,depth], [x*halfWidth,floorY+.0005,(front+back)/2], roomMaterials.trim);
    for (let i=1;i<=5;i++) roomBox('floor-seam', [halfWidth*2,.001,.0015], [0,floorY+.0005,back+i*depth/6], roomMaterials.trim);
    roomBox('back-skirting', [halfWidth*2,h*.012,.006], [0,floorY+h*.006,back+.003], roomMaterials.trim);
    for (const sign of [-1,1]) roomBox('side-skirting', [.006,h*.012,depth], [sign*(halfWidth-.003),floorY+h*.006,(front+back)/2], roomMaterials.trim);
    light.position.set(-w*.65,h*.65,w*1.8);
    light.target.position.set(0,-h*.12,-w*.45); scene.add(light.target);
    const reach = Math.max(w*2,h*1.5);
    Object.assign(light.shadow.camera, {left:-reach,right:reach,top:reach,bottom:-reach,near:.01,far:reach*5});
    light.shadow.camera.updateProjectionMatrix(); light.shadow.normalBias = .001;
    buildPattern(halfWidth, back, floorY, ceiling);
  }
  // Alignment test pattern (UX §4.2): straight lines that must look straight
  // and continuous across both screens from the calibrated eye.
  function buildPattern(halfWidth, back, floorY, ceiling) {
    const points = [], step = .05;
    for (let x = -halfWidth; x <= halfWidth+1e-6; x += step) points.push(x,floorY,back, x,floorY,.3);
    for (let z = back; z <= .3+1e-6; z += step) points.push(-halfWidth,floorY,z, halfWidth,floorY,z);
    for (let x = -halfWidth; x <= halfWidth+1e-6; x += step) points.push(x,floorY,back, x,ceiling,back);
    for (let y = floorY; y <= ceiling+1e-6; y += step) points.push(-halfWidth,y,back, halfWidth,y,back);
    const grid = new THREE.BufferGeometry(); grid.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    pattern.add(new THREE.LineSegments(grid, new THREE.LineBasicMaterial({ color: 0x3f7f8a })));
    const lines = [];
    for (const y of [-.25,0,.25].map(f => f*profile.screen.height/100)) lines.push(-halfWidth,y,-.15, halfWidth,y,-.15);
    const across = new THREE.BufferGeometry(); across.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    pattern.add(new THREE.LineSegments(across, new THREE.LineBasicMaterial({ color: 0xedc58d })));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, ceiling-floorY, 12), new THREE.MeshBasicMaterial({ color: 0xff6b6b }));
    pole.position.set(0, (ceiling+floorY)/2, -.15); pattern.add(pole);
  }

  // ---------------------------------------------------------------- panda
  const person = new THREE.Group();
  person.name = 'foreground-object'; person.userData.kind = 'panda';
  scene.add(person);
  const PANDA_HEIGHT = 1.9;
  if (THREE.GLTFLoader) {
    new THREE.GLTFLoader().load('models/panda.glb', gltf => {
      const model = gltf.scene;
      model.traverse(node => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      model.scale.setScalar(PANDA_HEIGHT/size.y);
      model.rotation.y = -Math.PI/2; // model's nose points +x; turn it to face the viewer (+z)
      model.position.sub(new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3()));
      person.add(model);
    }, undefined, error => { console.error(error); status('Panda model failed to load (models/panda.glb).'); });
  } else status('GLTFLoader unavailable. Check your connection and reload.');
  function danceTime() {
    return state.danceOffset + (state.dancePlaying ? Math.max(0, Date.now()-state.danceEpoch)/1000 : 0);
  }
  function pandaScale() { return Math.min(profile.screen.height/100*.31, profile.screen.width/100*.48); }
  function animatePanda() {
    person.position.set(0, 0, profile.advanced.modelDepth/100);
    person.scale.setScalar(pandaScale());
    // Gentle float; paused with P.
    if (person.children[0]) person.children[0].rotation.z = Math.sin(danceTime()*1.2)*.03;
  }

  // ---------------------------------------------------------------- floating panels (UX 8.2)
  const depthSource = new DepthSource();
  let depthReading = null, liveSample = null, liveTime = 0;
  const helper = { source: profile.trackingSource, eyeDistance: 120, device: '', outer: 0, motion: true, pattern: false,
    get flip() { return profile.depth.flip === 1; }, set flip(value) { profile.depth.flip = value ? 1 : 0; } };
  const gui = new lil.GUI({ title: 'Concave Room', autoPlace: false, width: 270 });
  document.body.append(gui.domElement);
  const refreshGui = () => gui.controllersRecursive().forEach(c => c.updateDisplay());

  function renderSettingsState() {
    const when = profile.calibratedAt ? new Date(profile.calibratedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    gui.title(dirty ? 'Concave Room · unsaved changes' : hasSavedProfile ? `Concave Room · saved${when ? ' '+when : ''}` : 'Concave Room · defaults');
  }
  function markDirty() { if (!dirty) { dirty = true; renderSettingsState(); } }
  function syncOuter() {
    const s = profile.screen; helper.outer = Number(ConcaveGeometry.outerDistance(s.angle, s.width, s.gap).toFixed(1)); ui.outer?.updateDisplay();
  }
  const trackingKeys = new Set(['width','height','angle','gap','vOffset','top','forward','tilt','fov','yaw','x']);
  const affectsTracking = (group, key) => (group === 'screen' || group === 'trackingCamera') && trackingKeys.has(key);
  function field(folder, group, key, name, step) {
    const [, min, max] = RoomProfile.FIELDS[group][key];
    return folder.add(profile[group], key, min, max, step).name(name)
      .onChange(() => {
        if (group === 'screen' || key === 'wallThickness') { derive(); if (group === 'screen' && key !== 'seamSplit') syncOuter(); }
        markDirty();
      })
      .onFinishChange(() => { if (affectsTracking(group, key)) invalidateTracking(); });
  }
  const extra = (folder, ...children) => { const node = RoomUI.el('div', { class: 'gui-extra' }, ...children); folder.$children.append(node); return node; };

  ui.apply = gui.add({ apply() { applyProfile(); } }, 'apply').name('▶  Apply & start experience');
  ui.apply.$name.style.fontWeight = '600'; ui.apply.$name.style.color = '#4cc9f0';

  // -- Tracking
  const fTrack = gui.addFolder('Tracking');
  fTrack.add(helper, 'source', { 'Iris size': 'iris', 'Depth camera': 'depth' }).name('Source (T)').onChange(value => setSource(value));
  ui.device = fTrack.add(helper, 'device', { 'Default camera': '' }).name('Camera').onChange(id => { profile.trackingDeviceId = id; markDirty(); startTracking(); });
  fTrack.add(helper, 'eyeDistance', 20, 400, 1).name('Eyes → lens (cm)').onChange(() => {
    trackingReference = null; trackingTarget = null;
    if (!calibrateTracking()) status('Distance selected. Hold still with both eyes visible, then calibrate.');
  });
  ui.calibrate = fTrack.add({ go() { calibrateTracking(); } }, 'go').name('Calibrate iris size'); ui.calibrate.disable();
  fTrack.add({ go() { startTracking(); } }, 'go').name('Restart webcam (R)');
  extra(fTrack, 'Measure the distance from the lens to your eyes, sit still with both eyes visible, then calibrate. Depth mode does not need this; it is the fallback.');

  // -- Depth camera
  const fDepth = gui.addFolder('Depth camera').close();
  ui.depthDot = RoomUI.el('i', { class: 'dot' }); ui.depthText = RoomUI.el('span', { text: 'Not connected' });
  ui.thumb = RoomUI.el('canvas', { width: 160, height: 120, 'aria-label': 'Depth thumbnail' });
  extra(fDepth, RoomUI.el('div', {}, ui.depthDot, ui.depthText), ui.thumb);
  ui.url = fDepth.add(profile, 'depthUrl').name('Bridge address').onFinishChange(value => {
    profile.depthUrl = RoomProfile.sanitize({ depthUrl: value.trim() }).depthUrl; ui.url.updateDisplay(); markDirty();
    if (profile.trackingSource === 'depth') depthSource.connect(profile.depthUrl);
  });
  fDepth.add({ go() { depthSource.connect(profile.depthUrl); } }, 'go').name('Reconnect');
  fDepth.add({ go() { DepthCalibrationUI.open(depthCalibrationContext()); } }, 'go').name('Calibrate depth camera…');
  const fModel = fDepth.addFolder('Depth camera model').close();
  field(fModel, 'depth', 'fov', 'FOV (°)', .5);
  fModel.add(helper, 'flip').name('Flip horizontally').onChange(markDirty);
  field(fModel, 'depth', 'dx', 'Offset right (cm)', .1); field(fModel, 'depth', 'dy', 'Offset up (cm)', .1);
  field(fModel, 'depth', 'yaw', 'Yaw (°)', .1); field(fModel, 'depth', 'tilt', 'Tilt down (°)', .1);
  field(fModel, 'depth', 'scale', 'Distance scale', .001); field(fModel, 'depth', 'bias', 'Distance bias (cm)', .1);
  field(fModel, 'depth', 'eyeOffset', 'Eye behind face (cm)', .1);
  fModel.add({ go() {
    RoomProfile.assign(profile.depth, RoomProfile.defaults().depth); fModel.controllersRecursive().forEach(c => c.updateDisplay()); markDirty();
  } }, 'go').name('Reset depth calibration');

  // -- Screens
  const fScreens = gui.addFolder('Screens').close();
  field(fScreens, 'screen', 'width', 'Width (cm)', .1); field(fScreens, 'screen', 'height', 'Height (cm)', .1);
  field(fScreens, 'screen', 'angle', 'Inside angle (°)', .5);
  ui.outer = fScreens.add(helper, 'outer', 1, 400, .1).name('Outer edges (cm)').onChange(value => {
    const s = profile.screen, angle = ConcaveGeometry.angleFromOuterDistance(value, s.width, s.gap);
    if (!RoomProfile.inRange('screen', 'angle', angle)) return;
    s.angle = Math.round(angle*10)/10; derive(); refreshGui(); markDirty();
  }).onFinishChange(() => { syncOuter(); invalidateTracking(); });
  field(fScreens, 'screen', 'gap', 'Gap at seam (cm)', .1); field(fScreens, 'screen', 'vOffset', 'Vertical offset (cm)', .1);
  field(fScreens, 'screen', 'seamSplit', 'Seam position (%)', .1);
  extra(fScreens, 'Angle between the display surfaces on your side (180 = flat), or type the straight distance between the two outer lit edges. Gap = straight distance between the inner lit edges.');

  // -- Tracking camera
  const fCamera = gui.addFolder('Tracking camera').close();
  field(fCamera, 'trackingCamera', 'top', 'Above top (cm)', .5); field(fCamera, 'trackingCamera', 'forward', 'Forward (cm)', .5);
  field(fCamera, 'trackingCamera', 'tilt', 'Tilt down (°)', 1); field(fCamera, 'trackingCamera', 'fov', 'Horizontal FOV (°)', 1);
  field(fCamera, 'trackingCamera', 'yaw', 'Yaw (°)', 1); field(fCamera, 'trackingCamera', 'x', 'Left/right (cm)', .5);

  // -- Scene
  const fScene = gui.addFolder('Scene');
  field(fScene, 'advanced', 'wallThickness', 'Wall thickness (cm)', .5); field(fScene, 'advanced', 'modelDepth', 'Character depth (cm)', 1);
  fScene.add(helper, 'motion').name('Motion (P)').onChange(() => togglePause(true));
  fScene.add(helper, 'pattern').name('Alignment test pattern').onChange(value => { state.testPattern = value; });

  // -- Advanced
  const fAdvanced = gui.addFolder('Advanced').close();
  field(fAdvanced, 'advanced', 'overlap', 'Seam overlap (non-physical)', .1); field(fAdvanced, 'advanced', 'smoothingMs', 'Smoothing (ms)', 10);

  // -- Profile
  const fProfile = gui.addFolder('Profile').close();
  fProfile.add({ go() { revertProfile(); } }, 'go').name('Revert to saved');
  fProfile.add({ go() { RoomProfile.assign(profile, RoomProfile.defaults()); afterProfileChange(); markDirty(); status('Defaults restored. Apply to keep them.'); } }, 'go').name('Reset to defaults');
  fProfile.add({ go() { exportProfile(); } }, 'go').name('Export JSON');
  fProfile.add({ go() { importProfile(); } }, 'go').name('Import JSON');
  fProfile.add({ go() { openCameraCalibration(); } }, 'go').name('Camera auto-calibration… (preview)');
  extra(fProfile, RoomUI.el('span', {}, 'v1.0 demos: ', RoomUI.el('a', { href: 'backup/index.html', text: 'flat' }), ' · ', RoomUI.el('a', { href: 'concave.html', text: '90° concave' })));

  function afterProfileChange() {
    derive(); helper.source = profile.trackingSource; helper.eyeDistance = helper.eyeDistance; syncOuter(); refreshGui(); invalidateTracking(); applySource(); renderSettingsState();
  }
  function revertProfile() {
    const saved = RoomProfile.load(storage);
    hasSavedProfile = saved.saved; dirty = false; RoomProfile.assign(profile, saved.profile); afterProfileChange();
    status(saved.saved ? 'Reverted to the saved profile.' : 'Nothing saved yet: showing defaults.');
  }
  function exportProfile() {
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'concave-room-profile.json' });
    link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  function importProfile() {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/json,.json' });
    input.onchange = async () => {
      const file = input.files[0]; if (!file) return;
      try { RoomProfile.assign(profile, RoomProfile.sanitize(JSON.parse(await file.text()))); afterProfileChange(); markDirty(); status('Profile imported. Check the values, then Apply.'); }
      catch { status('Could not read that file as a profile JSON.'); }
    };
    input.click();
  }
  function applyProfile() {
    profile.calibratedAt = new Date().toISOString();
    hasSavedProfile = RoomProfile.save(storage, profile); dirty = !hasSavedProfile; renderSettingsState();
    gui.close(); if (!trackingSession) startTracking();
    status(hasSavedProfile ? 'Applied and saved.' : 'Applied (this browser could not save the profile).');
  }
  function togglePause(fromGui) {
    state.danceOffset = danceTime(); state.danceEpoch = Date.now(); state.dancePlaying = !state.dancePlaying;
    helper.motion = state.dancePlaying; if (!fromGui) refreshGui();
  }

  // HUD, webcam preview and the 3D debug view are separate floating panels.
  const hud = RoomUI.panel({ id: 'hud', title: 'HUD', x: 300, y: 12, width: 250 });
  const previewVideo = RoomUI.el('video', { id: 'preview-video', muted: true, playsinline: true });
  const previewEye = RoomUI.el('i', { id: 'preview-eye' });
  const preview = RoomUI.panel({ id: 'preview', title: 'Webcam (tracking)', x: Math.max(12, innerWidth-280), y: Math.max(12, innerHeight-200), width: 260 });
  preview.body.append(previewVideo, previewEye); preview.el.classList.add('hidden');
  const debugView = THREE.OrbitControls ? new DebugView3D(renderer, scene, THREE) : null;
  if (!debugView) status('OrbitControls unavailable: the 3D debug view is off.');

  // ---------------------------------------------------------------- tracking source: iris size or depth camera (UX 4.4)
  function applySource() {
    const depth = profile.trackingSource === 'depth';
    if (depth) { if (depthSource.status === 'off' || depthSource.url !== profile.depthUrl) depthSource.connect(profile.depthUrl); }
    else { depthSource.close(); depthReading = null; }
    state.via = 'iris'; state.viaTime = 0;
  }
  function setSource(name) {
    if (profile.trackingSource === name) return;
    const clean = !dirty;
    profile.trackingSource = name; helper.source = name; applySource();
    if (clean) hasSavedProfile = RoomProfile.save(storage, profile) || hasSavedProfile; else markDirty();
    renderSettingsState(); refreshGui();
    status(name === 'depth' ? 'Tracking source: depth camera.' : 'Tracking source: iris size.');
  }
  let depthThumbTime = 0;
  function drawDepthThumb(now) {
    if (now-depthThumbTime < 100 || gui._closed || fDepth._closed || document.body.classList.contains('panels-hidden')) return;
    depthThumbTime = now;
    DepthSource.renderDepth(ui.thumb, depthSource.frame, depthReading && now-depthReading.time < 500 ? depthReading : null);
  }
  function depthStatus(now) {
    const live = depthReading && now-depthReading.time < 500;
    const [level, text] = depthSource.status === 'connected'
      ? (live ? ['ok', `Reading ${(depthReading.range*100).toFixed(0)} cm · ${depthSource.fps.toFixed(0)} fps`] : ['warn', 'Connected, no reading at your face'])
      : depthSource.status === 'connecting' ? ['warn', 'Connecting…'] : depthSource.status === 'error' ? ['off', 'Cannot reach the depth bridge'] : ['off', 'Not connected'];
    ui.depthDot.className = 'dot '+level; ui.depthText.textContent = text;
  }
  // What the depth calibration dialog needs from the running app.
  function depthCalibrationContext() {
    return { profile, RoomProfile, depthSource, status,
      live: () => ({ sample: liveSample, time: liveTime, frame: depthSource.fresh(500), stream: trackingSession?.stream || null, reading: depthReading }),
      ensureDepth: () => { if (depthSource.status === 'off') depthSource.connect(profile.depthUrl); },
      apply: values => { const clean = RoomProfile.sanitize({ depth: values }).depth; Object.keys(values).forEach(k => { profile.depth[k] = clean[k]; }); fModel.controllersRecursive().forEach(c => c.updateDisplay()); markDirty(); } };
  }

  // ---------------------------------------------------------------- camera auto-calibration (placeholder, UX 4.3)
  let trackingDeviceId = '';
  function openCameraCalibration() {
    const el = RoomUI.el, video = el('video', { autoplay: true, muted: true, playsinline: true, hidden: true, style: 'width:100%;margin-top:6px' });
    const select = el('select', {}, el('option', { value: '', text: 'Select a camera…' }));
    const dlg = RoomUI.dialog({ title: 'Camera auto-calibration (preview)', onClose: () => CalibrationCamera.stop(video) });
    const rows = [['Inside angle','°'],['Gap','cm'],['Vertical offset','cm'],['Cam height','cm'],['Cam forward','cm'],['Cam yaw','°'],['Cam tilt','°'],['Cam FOV','°']];
    dlg.content.append(
      el('p', { text: 'Preview — automatic calibration is not available yet. Use the manual folders (Screens, Tracking camera) instead.' }),
      el('h2', { text: 'Calibration camera' }), select, video,
      el('h2', { text: 'Board', style: 'margin-top:14px' }),
      el('div', { class: 'dlg-row' }, el('button', { text: 'Download board PDF', disabled: true }), el('button', { text: 'Capture', disabled: true }), el('small', { text: '0 / 8 good captures' })),
      el('h2', { text: 'Results', style: 'margin-top:14px' }),
      el('table', {}, el('thead', {}, el('tr', {}, el('th', { text: 'Field' }), el('th', { text: 'Value' }), el('th', { text: 'Conf.' }))),
        el('tbody', {}, rows.map(([n, u]) => el('tr', {}, el('td', { text: `${n} (${u})` }), el('td', { text: '—' }), el('td', { text: '—' }))))));
    CalibrationCamera.list(trackingDeviceId).then(cameras => cameras.forEach(c => select.append(el('option', { value: c.id, text: c.label }))))
      .catch(() => status('Cannot list cameras. Allow camera access.'));
    select.onchange = async () => { try { await CalibrationCamera.preview(select.value, video); } catch { status('Could not open that camera. It may be in use.'); } };
  }

  // ---------------------------------------------------------------- tracking
  let trackingSession, trackingReference, trackingTarget, trackingSamples = [], lastSeen = 0;
  let smoothingTime = performance.now(), fpsCount = 0, fps = 0, fpsTime = performance.now(), trackingError = '';
  function webcamPose() { return RoomProfile.cameraPose(profile); }
  function eyeValid(eye) {
    return eye && [eye.x,eye.y,eye.z].every(Number.isFinite) && Math.max(Math.abs(eye.x),Math.abs(eye.y),Math.abs(eye.z)) < 10
      && ConcaveGeometry.inFront(eye, pair, .03);
  }
  function invalidateTracking() {
    trackingReference = null; trackingTarget = null; trackingSamples = []; ui.calibrate.disable();
    status(profile.trackingSource === 'depth' ? 'Depth camera tracking. Iris calibration is only the fallback.' : 'Set the eye-to-webcam distance, hold still, then calibrate tracking.');
  }
  function stopTracking() {
    const old = trackingSession; trackingSession = null;
    if (old) {
      cancelAnimationFrame(old.frame);
      old.stream?.getTracks().forEach(track => track.stop());
      Promise.resolve(old.inFlight).catch(() => {}).then(() => old.detector?.close()).catch(() => {});
    }
    $('video').srcObject = null; previewVideo.srcObject = null; lastSeen = 0; invalidateTracking();
  }
  async function refreshTrackingDevices() {
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput' && d.deviceId);
      const options = { 'Default camera': '' };
      devices.forEach((d, i) => { options[d.label || `Camera ${i+1}`] = d.deviceId; });
      helper.device = devices.some(d => d.deviceId === trackingDeviceId) ? trackingDeviceId : '';
      ui.device = ui.device.options(options).onChange(id => { profile.trackingDeviceId = id; markDirty(); startTracking(); });
      ui.device.updateDisplay();
    } catch {}
  }
  async function startTracking() {
    stopTracking();
    const active = {}; trackingSession = active; trackingError = '';
    status('Starting webcam…');
    try {
      if (!window.FaceMesh) throw Error('Tracking library unavailable. Check your connection and restart webcam.');
      if (!navigator.mediaDevices?.getUserMedia) throw Error('Webcam requires localhost or HTTPS.');
      const video = { width: {ideal: 1280}, height: {ideal: 720} };
      if (profile.trackingDeviceId) video.deviceId = { exact: profile.trackingDeviceId };
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({video, audio: false}); }
      catch (error) {
        if (!profile.trackingDeviceId || error.name === 'NotAllowedError') throw error;
        delete video.deviceId; stream = await navigator.mediaDevices.getUserMedia({video, audio: false}); // saved camera missing
      }
      if (trackingSession !== active) { stream.getTracks().forEach(t => t.stop()); return; }
      active.stream = stream; trackingDeviceId = stream.getVideoTracks()[0].getSettings().deviceId || '';
      refreshTrackingDevices();
      const element = $('video'); element.srcObject = stream; previewVideo.srcObject = stream; previewVideo.play().catch(() => {}); await element.play();
      if (trackingSession !== active) return;
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (trackingSession === active) { stopTracking(); trackingError = 'Webcam disconnected'; status('Webcam disconnected. Restart webcam.'); }
      });
      active.detector = new FaceMesh({locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`});
      active.detector.setOptions({maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: .6, minTrackingConfidence: .6});
      active.detector.onResults(results => {
        if (trackingSession !== active) return;
        const now = performance.now();
        const sample = now-active.captured < 300 ? ConcaveTracking.sample(results.multiFaceLandmarks?.[0], element.videoWidth/element.videoHeight) : null;
        if (!sample) { trackingSamples = []; ui.calibrate.disable(); return; }
        lastSeen = now; fpsCount++;
        trackingSamples.push({...sample, time: now}); trackingSamples = trackingSamples.filter(s => now-s.time < 1500).slice(-24);
        ui.calibrate.disable(trackingSamples.length < 12); liveSample = sample; liveTime = now;
        previewEye.style.left = `${(1-sample.x)*100}%`; previewEye.style.top = `${sample.y*100}%`;
        // Depth camera first when selected (UX 4.4); the calibrated iris estimate is its fallback.
        let eye = null, via = 'iris';
        if (profile.trackingSource === 'depth') {
          const hit = DepthSource.locate(depthSource.fresh(), sample, RoomProfile.depthModel(profile));
          depthReading = hit ? { ...hit, time: now } : null;
          if (hit) { eye = PortraitTracking.eyeFromSample(sample, webcamPose(), hit.range+profile.depth.eyeOffset/100); if (eye) via = 'depth'; }
        }
        if (!eye && (profile.trackingSource !== 'depth' || trackingReference)) {
          eye = trackingReference ? PortraitTracking.estimate(sample, trackingReference)
            : PortraitTracking.eyeFromSample(sample, webcamPose(), helper.eyeDistance/100);
          if (!eye) { invalidateTracking(); return; }
        }
        if (!eye) return; // depth selected, no reading and no iris calibration: hold the last eye
        if (!eyeValid(eye)) { trackingTarget = null; return; }
        trackingTarget = eye; state.via = via; state.viaTime = now;
        status(via === 'depth' ? `Tracking live · depth camera (${(depthReading.range*100).toFixed(0)} cm).`
          : trackingReference ? 'Tracking live · calibrated.' : trackingSamples.length < 12
          ? 'Camera preview. Hold still…' : 'Camera preview. Check the distance, then calibrate tracking.');
      });
      let lastTime = -1;
      const frame = async () => {
        if (trackingSession !== active) return;
        if (element.readyState >= 2 && element.currentTime !== lastTime) {
          lastTime = element.currentTime; active.captured = performance.now();
          try { active.inFlight = active.detector.send({image: element}); await active.inFlight; }
          catch { if (trackingSession === active) { stopTracking(); trackingError = 'Tracking failed'; status('Tracking failed. Restart webcam.'); } return; }
        }
        if (trackingSession === active) active.frame = requestAnimationFrame(frame);
      };
      status('Finding eyes…'); active.frame = requestAnimationFrame(frame);
    } catch(error) {
      if (trackingSession !== active) return;
      stopTracking();
      trackingError = error.name === 'NotAllowedError' ? 'Webcam permission denied' : error.name === 'NotReadableError' ? 'Webcam in use by another app' : error.message;
      status(trackingError + '. Fix it, then press Restart webcam (R).');
    }
  }
  function calibrateTracking() {
    if (!trackingSession || performance.now()-lastSeen > 300) return false;
    const next = ConcaveTracking.calibrate(trackingSamples, {pose: webcamPose()});
    if (next) next.eye = PortraitTracking.eyeFromSample(next, next.pose, helper.eyeDistance/100);
    if (!next || !eyeValid(next.eye)) {
      status('Hold still with your eyes in front of both screens; check the webcam placement and distance.'); return false;
    }
    trackingReference = next; trackingTarget = {...next.eye}; state.eye = {...next.eye};
    status('Tracking calibrated.'); return true;
  }
  addEventListener('beforeunload', () => { stopTracking(); CalibrationCamera.stop(); });
  setInterval(() => {
    const now = performance.now(), dt = (now-smoothingTime)/1000; smoothingTime = now;
    if (trackingTarget && now-lastSeen < 500) {
      state.eye = PortraitTracking.smoothEye(state.eye, trackingTarget, dt, profile.advanced.smoothingMs/1000);
      const last = state.trail[state.trail.length-1];
      if (!last || Math.hypot(last.x-state.eye.x, last.y-state.eye.y, last.z-state.eye.z) > .004) state.trail = [...state.trail, {...state.eye}].slice(-40);
    }
    if (now-fpsTime >= 1000) { fps = fpsCount*1000/(now-fpsTime); fpsCount = 0; fpsTime = now; }
  }, 33);

  // ---------------------------------------------------------------- HUD and debug views
  const fmt = (v, d = 0) => (v*100).toFixed(d);
  let lastDebug = 0;
  function updateDebug(now) {
    if (now-lastDebug < 66) return;
    lastDebug = now;
    const pose = webcamPose(), eye = state.eye, fresh = trackingSession?.stream && lastSeen && now-lastSeen < 500;
    if (debugView?.visible && debugView.panel.open) {
      RoomMiniView.draw(debugView.mini, { pair, pose, eye: trackingTarget || trackingReference ? eye : null, trail: state.trail,
        room: bounds, panda: { z: profile.advanced.modelDepth/100, radius: pandaScale()*.35 }, wall: { back: bounds.wallBack, top: bounds.wallTop, floor: bounds.floor, outerX: bounds.outerX } }, 'top');
    }
    const s = profile.screen, c = profile.trackingCamera, a = profile.advanced;
    const depthMode = profile.trackingSource === 'depth', usingDepth = state.via === 'depth' && now-state.viaTime < 500;
    const live = depthReading && now-depthReading.time < 500;
    const rows = [
      ['Source', depthMode ? (usingDepth ? 'depth camera' : 'depth → iris fallback') : `iris size · ${trackingReference ? 'calibrated' : 'not calibrated'}`],
      ['Eye', `${fmt(eye.x, 1)} / ${fmt(eye.y, 1)} / ${fmt(eye.z, 1)} cm`],
      ['Depth', depthMode ? (live ? `${fmt(depthReading.range, 1)} cm along ray (+${profile.depth.eyeOffset} eye)` : '—') : 'off'],
      ['Distance', `seam ${fmt(Math.hypot(eye.x, eye.z))} · cam ${fmt(Math.hypot(eye.x-pose.x, eye.y-pose.y, eye.z-pose.z))} cm`],
      ['Screen', `${s.angle.toFixed(1)}° · gap ${s.gap} · ${s.width}×${s.height} cm`],
      ['Camera', `+${c.top} top · ${c.forward} fwd · ${c.tilt}° tilt · ${c.fov}° FOV`],
      ['Wall', `${a.wallThickness} cm · character ${a.modelDepth > 0 ? '+' : ''}${a.modelDepth} cm`],
      ['Tracking', `${fresh ? fps.toFixed(0) : 0} fps · age ${lastSeen ? Math.round(now-lastSeen) : '—'} ms`]
    ];
    const warnings = [];
    if (trackingError) warnings.push(trackingError);
    else if (!trackingSession?.stream) warnings.push('Webcam not running');
    else if (!fresh) warnings.push('Tracking lost: eyes not visible');
    for (const screen of pair) if (ConcaveGeometry.planeDistance(screen, eye) < .03) warnings.push(`Eye behind ${screen.name}-screen plane`);
    if (trackingSession?.stream && fresh && !trackingTarget) warnings.push('Eye outside supported area');
    let depthNote = '';
    if (depthMode && fresh && !usingDepth) {
      depthNote = depthSource.status === 'connected' ? 'No depth at face' : 'Depth camera offline';
      depthNote += trackingReference ? ': using iris size' : '';
      warnings.push(depthNote);
    }
    if (!trackingReference && fresh && !depthMode) warnings.push('Tracking not calibrated');
    if (hud.open) {
      hud.body.replaceChildren(...rows.map(([k, v]) => RoomUI.el('div', {}, RoomUI.el('b', { text: k }), RoomUI.el('span', { text: v }))),
        ...warnings.map(w => RoomUI.el('div', { class: 'warn', text: w })),
        RoomUI.el('div', { class: 'keys', text: ui.message }),
        RoomUI.el('div', { class: 'keys', text: 'T source · H HUD · D debug · G all panels · W webcam · P motion · R camera' }));
    }
    const pill = $('status-pill'), lost = trackingSession?.stream && !fresh, message = lost ? 'Tracking lost: eyes not visible' : depthNote;
    pill.hidden = !message; pill.textContent = message;
    depthStatus(now); drawDepthThumb(now);
  }

  // ---------------------------------------------------------------- keys & loop
  addEventListener('keydown', event => {
    if (typing(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'h') hud.el.classList.toggle('hidden');
    else if (key === 'd') debugView?.setVisible(!debugView.visible);
    else if (key === 'g') document.body.classList.toggle('panels-hidden');
    else if (key === 'p') togglePause();
    else if (key === 't') setSource(profile.trackingSource === 'depth' ? 'iris' : 'depth');
    else if (key === 'w') preview.el.classList.toggle('hidden');
    else if (key === 'r') startTracking();
    else return;
    event.preventDefault();
  });
  function resize() { renderer.setSize(innerWidth, innerHeight); }
  addEventListener('resize', resize);
  function animate(now) {
    requestAnimationFrame(animate);
    updateRoom(); animatePanda();
    room.visible = person.visible = !state.testPattern; pattern.visible = state.testPattern;
    const eye = new THREE.Vector3(state.eye.x, state.eye.y, state.eye.z);
    const split = Math.round(innerWidth*profile.screen.seamSplit/100);
    renderer.shadowMap.needsUpdate = true;
    for (let i = 0; i < 2; i++) {
      const x = i === 0 ? 0 : split, width = i === 0 ? split : innerWidth-split;
      renderer.setViewport(x, 0, width, innerHeight); renderer.setScissor(x, 0, width, innerHeight);
      ConcaveGeometry.project(THREE, cameras[i], pair[i], eye, profile.advanced.overlap/100); renderer.render(scene, cameras[i]);
    }
    if (debugView && !document.body.classList.contains('panels-hidden')) {
      debugView.update({ pair, eye: state.eye, trail: state.trail, pose: webcamPose(), depthModel: RoomProfile.depthModel(profile),
        showDepth: profile.trackingSource === 'depth', via: state.via });
      debugView.render();
    }
    updateDebug(now);
  }
  syncOuter(); resize(); applySource(); renderSettingsState();
  requestAnimationFrame(animate);
  startTracking();
})();
