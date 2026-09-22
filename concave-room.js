(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const side = new URLSearchParams(location.search).get('view');
  const isDisplay = ['left', 'right'].includes(side);
  const state = { width: .60, height: 1.067, depth: 0,
    eye: { x: 0, y: 0, z: 1.20 }, dancePlaying: true, danceEpoch: Date.now(), danceOffset: 0 };
  let seam = .5, channel, lastMessage = 0;
  const status = message => { $('status').textContent = message; };
  if (isDisplay) {
    document.body.classList.add('display'); $('display-tools').hidden = false;
    $('display-title').textContent = `${side.toUpperCase()} SCREEN`;
  }
  if (!window.THREE) { status('3D library could not load. Check your connection and reload.'); $('connection').textContent = '3D library unavailable'; return; }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
  catch { status('WebGL unavailable. Enable hardware acceleration and reload.'); $('connection').textContent = 'WebGL unavailable'; return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setScissorTest(true); $('stage').appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x111d29);
  scene.add(new THREE.HemisphereLight(0xe1efff, 0x554130, .8));
  const light = new THREE.DirectionalLight(0xffe5bf, 1.25);
  light.position.set(-.5, 1.6, 1.4); light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: .01, far: 8 });
  light.shadow.camera.updateProjectionMatrix(); light.shadow.bias = -.0002; scene.add(light);
  const rim = new THREE.DirectionalLight(0x80bfff, .65); rim.position.set(1, .5, -1); scene.add(rim);
  const cameras = [new THREE.PerspectiveCamera(), new THREE.PerspectiveCamera()];
  const architecture = new THREE.Group(); scene.add(architecture);
  const material = color => new THREE.MeshStandardMaterial({ color, roughness: .8 });
  const plaster = material(0x284452), frameMat = material(0xd2ba91), trimMat = material(0x86694c);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), material(0x425260));
  floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor);
  function box(parent, name, size, position, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    mesh.name = name; mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }
  // A solid, upright mannequin provides a human silhouette from every viewpoint.
  const person = new THREE.Group();
  person.name = 'foreground-object'; person.userData.kind = 'placeholder-person';
  scene.add(person);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xf2bb78, roughness: .48, metalness: .06 });
  const jointMaterial = new THREE.MeshStandardMaterial({ color: 0x8f6550, roughness: .6 });
  const faceMaterial = new THREE.MeshStandardMaterial({ color: 0x263b46, roughness: .7 });
  const roundGeometry = new THREE.SphereGeometry(1, 24, 16);
  function roundedPart(name, position, scale, material = bodyMaterial) {
    const part = new THREE.Mesh(roundGeometry, material);
    part.name = name; part.position.set(...position); part.scale.set(...scale);
    part.castShadow = true; part.receiveShadow = true; person.add(part);
    return part;
  }
  function limb(name, start, end, radius, material = bodyMaterial) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
    const part = new THREE.Mesh(new THREE.CylinderGeometry(radius*.85, radius, a.distanceTo(b), 20), material);
    part.name = name; part.position.copy(a).add(b).multiplyScalar(.5);
    part.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), b.sub(a).normalize());
    part.castShadow = true; part.receiveShadow = true; person.add(part);
  }
  roundedPart('head', [0,.67,0], [.15,.20,.145]);
  limb('neck', [0,.41,0], [0,.52,0], .065, jointMaterial);
  roundedPart('torso', [0,.20,0], [.26,.28,.14]);
  roundedPart('pelvis', [0,-.14,0], [.21,.14,.13]);
  // Small facial landmarks distinguish the front from the back during parallax.
  roundedPart('nose', [0,.65,.142], [.025,.033,.035]);
  for (const sign of [-1,1]) {
    const sideName = sign < 0 ? 'left' : 'right';
    roundedPart(`${sideName}-eye`, [sign*.055,.71,.132], [.013,.015,.012], faceMaterial);
    const shoulder = [sign*.255,.36,0], elbow = [sign*.34,.06,.01], wrist = [sign*.365,-.20,.045];
    roundedPart(`${sideName}-shoulder`, shoulder, [.085,.09,.085]);
    limb(`${sideName}-upper-arm`, shoulder, elbow, .065);
    roundedPart(`${sideName}-elbow`, elbow, [.055,.055,.055], jointMaterial);
    limb(`${sideName}-forearm`, elbow, wrist, .052);
    roundedPart(`${sideName}-hand`, [sign*.37,-.255,.045], [.049,.075,.04]);
    const hip = [sign*.115,-.21,0], knee = [sign*.135,-.49,.015], ankle = [sign*.14,-.77,0];
    limb(`${sideName}-thigh`, hip, knee, .088);
    roundedPart(`${sideName}-knee`, knee, [.069,.067,.067], jointMaterial);
    limb(`${sideName}-shin`, knee, ankle, .065);
    roundedPart(`${sideName}-foot`, [sign*.14,-.825,.055], [.078,.052,.13]);
  }
  // Reparent the existing meshes around anatomical pivots while preserving the
  // neutral pose. All motion stays inside the foreground model's local bounds.
  const dancer = new THREE.Group(); dancer.name = 'dance-root';
  person.add(dancer);
  for (const part of [...person.children]) if (part !== dancer) dancer.attach(part);
  function joint(name, parent, position, parts) {
    const pivot = new THREE.Group(); pivot.name = name; pivot.position.set(...position);
    parent.add(pivot);
    for (const part of parts) pivot.attach(person.getObjectByName(part));
    return pivot;
  }
  const torsoPivot = joint('torso-pivot', dancer, [0,-.14,0], ['torso','neck','head','nose','left-eye','right-eye']);
  const headPivot = joint('head-pivot', torsoPivot, [0,.63,0], ['head','nose','left-eye','right-eye']);
  const danceJoints = [-1,1].map(sign => {
    const name = sign < 0 ? 'left' : 'right';
    const shoulder = joint(`${name}-shoulder-pivot`, torsoPivot, [sign*.255,.5,0],
      ['shoulder','upper-arm','elbow','forearm','hand'].map(part => `${name}-${part}`));
    const elbow = joint(`${name}-elbow-pivot`, shoulder, [sign*.085,-.30,.01],
      ['elbow','forearm','hand'].map(part => `${name}-${part}`));
    const hip = joint(`${name}-hip-pivot`, dancer, [sign*.115,-.21,0],
      ['thigh','knee','shin','foot'].map(part => `${name}-${part}`));
    const knee = joint(`${name}-knee-pivot`, hip, [sign*.02,-.28,.015],
      ['knee','shin','foot'].map(part => `${name}-${part}`));
    return {sign,shoulder,elbow,hip,knee};
  });
  const feet = ['left-foot','right-foot'].map(name => person.getObjectByName(name));
  function groundPerson() {
    person.updateMatrixWorld(true);
    let soleY = Infinity;
    for (const foot of feet) {
      // Use the rendered sole vertices so rotated feet neither hover nor sink.
      const positions = foot.geometry.attributes.position, matrix = foot.matrixWorld.elements;
      for (let i=0; i<positions.count; i++) {
        const y = matrix[1]*positions.getX(i) + matrix[5]*positions.getY(i) + matrix[9]*positions.getZ(i) + matrix[13];
        soleY = Math.min(soleY, y);
      }
    }
    person.position.y += floor.position.y-soleY;
  }
  function danceTime() {
    return state.danceOffset + (state.dancePlaying ? Math.max(0, Date.now()-state.danceEpoch)/1000 : 0);
  }
  function animateDance() {
    // Four-second repeating groove. Time is shared across both display windows.
    const beat = danceTime()*Math.PI;
    const sway = Math.sin(beat);
    dancer.position.set(.05*sway, 0, 0);
    torsoPivot.rotation.set(0, .12*sway, -.055*sway);
    headPivot.rotation.set(.07*Math.sin(beat*2), -.08*sway, .035*sway);
    for (const {sign,shoulder,elbow,hip,knee} of danceJoints) {
      const step = Math.sin(beat + (sign < 0 ? Math.PI : 0));
      shoulder.rotation.set(.38*step, 0, sign*(.32+.22*Math.sin(beat/2)));
      elbow.rotation.x = -.38-.22*Math.cos(beat + sign*.6);
      hip.rotation.set(.20*step, 0, sign*.055*(1-step));
      knee.rotation.x = .22*Math.max(0,-step);
    }
    const t = danceTime()*.48;
    // Circle the two pillars: alternating occlusion makes depth easy to read.
    person.position.x = Math.sin(t)*state.width*.31;
    person.position.z = Math.cos(t*2)*state.width*.30 + state.depth;
    person.rotation.y = .3*Math.sin(t);
    groundPerson();
  }

  let layoutKey = '';
  function updateLayout() {
    const key = `${state.width}/${state.height}`;
    if (key === layoutKey) return;
    layoutKey = key;
    for (const child of [...architecture.children]) {
      child.traverse(node => { if (node.geometry) node.geometry.dispose(); }); architecture.remove(child);
    }
    const w = state.width, h = state.height;
    floor.position.y = -h*.43;
    person.scale.setScalar(Math.min(h*.30, w*.40));
    // All architecture is in world coordinates, shared by the two projections.
    // Frame front faces lie exactly on each physical screen plane.
    for (const screen of ConcaveGeometry.screens(w, h)) {
      const a = new THREE.Vector3(...screen.pa), b = new THREE.Vector3(...screen.pb);
      const right = b.clone().sub(a).normalize(), up = new THREE.Vector3(0, 1, 0);
      const normal = new THREE.Vector3().crossVectors(right, up);
      const portal = new THREE.Group(); portal.position.copy(a).addScaledVector(right, w/2); portal.position.y = 0;
      portal.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
      architecture.add(portal);
      const border = w*.065, thickness = w*.10;
      for (const sign of [-1, 1]) {
        box(portal, 'window-jamb', [border, h, thickness], [sign*(w-border)/2, 0, -thickness/2], frameMat);
        box(portal, 'window-sill', [w, h*.045, thickness], [0, sign*h*.4775, -thickness/2], frameMat);
      }
    }
    const back = -w*1.4, roomWidth = w*2.8, roomHeight = h*1.8;
    box(architecture, 'back-wall', [roomWidth, roomHeight, .04], [0, floor.position.y+roomHeight/2, back], plaster);
    for (const sign of [-1, 1]) {
      box(architecture, 'side-wall', [.04, roomHeight, w*2.1], [sign*roomWidth/2, floor.position.y+roomHeight/2, back+w*1.05], plaster);
      box(architecture, 'occlusion-pillar', [w*.07, h*.86, w*.09], [sign*w*.22, 0, 0], frameMat);
      box(architecture, 'pillar-foot', [w*.12, h*.035, w*.15], [sign*w*.22, floor.position.y+h*.0175, 0], trimMat);
    }
    // Nested wall panels and floor joints supply scale and converging depth cues.
    for (let i=-3; i<=3; i++) {
      box(architecture, 'wall-batten', [w*.015, h*1.05, .03], [i*w*.36, floor.position.y+h*.525, back+.03], trimMat);
    }
    for (let i=0; i<9; i++) {
      box(architecture, 'floor-joint', [roomWidth, .002, .003], [0, floor.position.y+.002, back+i*w*.22], trimMat);
    }
    for (let i=-6; i<=6; i++) {
      box(architecture, 'floor-joint', [.003, .002, w*2], [i*w*.22, floor.position.y+.002, back+w], trimMat);
    }
    box(architecture, 'back-wall-band', [roomWidth, h*.02, .035], [0, floor.position.y+h*.83, back+.03], frameMat);
  }
  function publish() { channel?.postMessage({ type: 'state', state }); }
  function valid(s) {
    return s && [s.width,s.height,s.depth,s.eye?.x,s.eye?.y,s.eye?.z,s.danceEpoch,s.danceOffset].every(Number.isFinite)
      && s.width >= .2 && s.width <= 1.5 && s.height >= .3 && s.height <= 2.5
      && Math.abs(s.eye.x) <= .35 && Math.abs(s.eye.y) <= .4 && s.eye.z >= .7 && s.eye.z <= 2.5
      && s.depth >= -.25 && s.depth <= .1 && typeof s.dancePlaying === 'boolean';
  }
  try {
    channel = new BroadcastChannel('concave-portrait-room-v1');
    channel.onmessage = ({data}) => {
      if (isDisplay && data?.type === 'state' && valid(data.state)) {
        Object.assign(state, data.state); lastMessage = performance.now(); $('connection').textContent = 'Controller connected';
      } else if (!isDisplay && data?.type === 'hello') publish();
    };
    if (isDisplay) channel.postMessage({type: 'hello'});
  } catch { status('Window sync unavailable. Use the spanning view.'); }
  function readouts() {
    for (const axis of ['x','y','z']) {
      $('eye-'+axis).value = state.eye[axis]*100;
      $('eye-'+axis+'-value').value = `${Math.round(state.eye[axis]*100)} cm`;
    }
    $('model-depth-value').value = `${Math.round(state.depth*100)} cm`;
  }
  for (const axis of ['x','y','z']) $('eye-'+axis).oninput = event => {
    state.eye[axis] = Number(event.target.value)/100; readouts(); publish();
  };
  $('reset-view').onclick = () => { state.eye = {x: 0, y: 0, z: 1.2}; readouts(); publish(); };
  $('model-depth').oninput = event => { state.depth = Number(event.target.value)/100; readouts(); publish(); };
  for (const key of ['width','height']) $('screen-'+key).onchange = event => {
    if (!event.target.value || !event.target.checkValidity()) { event.target.value = state[key]*100; return; }
    state[key] = Number(event.target.value)/100; publish();
  };
  $('seam').oninput = event => { seam = Number(event.target.value)/100; $('seam-value').value = `${event.target.value}%`; $('seam-marker').style.left = `${event.target.value}%`; };
  $('toggle-dance').onclick = () => {
    state.danceOffset = danceTime(); state.danceEpoch = Date.now(); state.dancePlaying = !state.dancePlaying;
    $('toggle-dance').textContent = state.dancePlaying ? 'Pause motion' : 'Resume motion'; publish();
  };
  function toggleSetup() {
    if (isDisplay) return;
    $('presentation-tools').hidden = !document.body.classList.toggle('immersive');
  }
  $('hide-setup').onclick = $('show-setup').onclick = toggleSetup;
  addEventListener('keydown', event => {
    if (event.key.toLowerCase() === 'h' && !['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)) toggleSetup();
  });
  for (const name of ['left','right']) $('open-'+name).onclick = () => {
    if (!window.open(`concave-room.html?view=${name}`, `portrait-room-${name}`, 'popup,width=600,height=1000')) status('Popup blocked. Allow popups and try again.');
  };
  $('fullscreen').onclick = $('display-fullscreen').onclick = () => document.documentElement.requestFullscreen().catch(() => {
    status('Use your browser fullscreen shortcut.'); $('connection').textContent = 'Use your browser fullscreen shortcut.';
  });
  let trackingSession, trackingReference, trackingSamples = [], lastSeen = 0;
  function invalidateTracking() {
    trackingReference = null; trackingSamples = []; $('calibrate').disabled = true;
    if ($('view-mode').value === 'tracking') status('Set your known eye position, hold still, then calibrate tracking.');
  }
  function stopTracking() {
    const old = trackingSession; trackingSession = null;
    if (old) {
      cancelAnimationFrame(old.frame);
      old.stream?.getTracks().forEach(track => track.stop());
      Promise.resolve(old.inFlight).catch(() => {}).then(() => old.detector?.close()).catch(() => {});
    }
    $('video').srcObject = null; $('video').hidden = true; lastSeen = 0; invalidateTracking();
  }
  function webcamPose() {
    return { x: Number($('webcam-x').value)/100, y: state.height/2+Number($('webcam-top').value)/100,
      z: Number($('webcam-z').value)/100, yaw: Number($('webcam-yaw').value),
      tilt: Number($('webcam-tilt').value), fov: Number($('webcam-fov').value) };
  }
  async function startTracking() {
    if (isDisplay) return;
    stopTracking(); $('view-mode').value = 'tracking';
    const active = {}; trackingSession = active;
    status('Starting webcam…');
    try {
      if (!window.FaceMesh) throw Error('Tracking library unavailable. Check your connection and restart webcam.');
      if (!navigator.mediaDevices?.getUserMedia) throw Error('Webcam requires localhost or HTTPS.');
      const stream = await navigator.mediaDevices.getUserMedia({video: {width: {ideal: 1280}, height: {ideal: 720}}, audio: false});
      if (trackingSession !== active) { stream.getTracks().forEach(t => t.stop()); return; }
      active.stream = stream; const video = $('video'); video.srcObject = stream; await video.play();
      if (trackingSession !== active) return;
      video.hidden = false;
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (trackingSession === active) { stopTracking(); status('Webcam disconnected. Restart webcam or select Manual viewpoint.'); }
      });
      active.detector = new FaceMesh({locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`});
      active.detector.setOptions({maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: .6, minTrackingConfidence: .6});
      active.detector.onResults(results => {
        if (trackingSession !== active) return;
        const now = performance.now();
        const sample = now-active.captured < 300 ? ConcaveTracking.sample(results.multiFaceLandmarks?.[0], video.videoWidth/video.videoHeight) : null;
        if (!sample) { trackingSamples = []; $('calibrate').disabled = true; status('Eyes not visible or tracking delayed. Holding viewpoint.'); return; }
        lastSeen = now;
        trackingSamples.push({...sample, time: now}); trackingSamples = trackingSamples.filter(s => now-s.time < 1500).slice(-24);
        $('calibrate').disabled = trackingSamples.length < 12;
        if (!trackingReference) { status(trackingSamples.length < 12 ? 'Eyes detected. Hold still…' : 'Ready to calibrate at the manual eye position.'); return; }
        const eye = PortraitTracking.estimate(sample, trackingReference);
        if (!eye) { invalidateTracking(); return; }
        const safe = {x: Math.max(-.35, Math.min(.35, eye.x)), y: Math.max(-.4, Math.min(.4, eye.y)), z: Math.max(.7, Math.min(2.5, eye.z))};
        const limited = Object.keys(safe).some(k => Math.abs(safe[k]-eye[k]) > .001);
        for (const key of ['x','y','z']) state.eye[key] += (safe[key]-state.eye[key])*.35;
        status(limited ? 'Tracking outside supported viewing area; viewpoint limited.' : 'Tracking live · top-corner webcam');
        readouts(); publish();
      });
      let lastTime = -1;
      const frame = async () => {
        if (trackingSession !== active) return;
        if (video.readyState >= 2 && video.currentTime !== lastTime) {
          lastTime = video.currentTime; active.captured = performance.now();
          try { active.inFlight = active.detector.send({image: video}); await active.inFlight; }
          catch { if (trackingSession === active) { stopTracking(); status('Tracking failed. Restart webcam or select Manual viewpoint.'); } return; }
        }
        if (trackingSession === active) active.frame = requestAnimationFrame(frame);
      };
      status('Finding eyes…'); active.frame = requestAnimationFrame(frame);
    } catch(error) {
      if (trackingSession !== active) return;
      stopTracking(); status(error.name === 'NotAllowedError' ? 'Webcam permission denied. Select Manual viewpoint or allow access and restart.' : error.message);
    }
  }
  $('view-mode').onchange = () => {
    if ($('view-mode').value === 'tracking') startTracking();
    else { stopTracking(); status('Manual viewpoint ready.'); }
  };
  $('restart-camera').onclick = startTracking;
  $('calibrate').onclick = () => {
    if (!trackingSession || performance.now()-lastSeen > 300) return;
    const next = ConcaveTracking.calibrate(trackingSamples, {pose: webcamPose(), eye: {...state.eye}});
    if (!next || !PortraitTracking.estimate(next, next)) { status('Hold still with eyes in front of the webcam, then calibrate again.'); return; }
    trackingReference = next; status('Tracking calibrated. Move your head to look around the room.');
  };
  for (const id of ['webcam-x','webcam-top','webcam-z','webcam-yaw','webcam-tilt','webcam-fov']) {
    const input = $(id); let previous = input.value;
    input.onchange = () => {
      if (!input.value || !input.checkValidity()) { input.value = previous; return; }
      previous = input.value; invalidateTracking();
    };
  }
  for (const id of ['screen-width','screen-height','eye-x','eye-y','eye-z']) $(id).addEventListener(id.startsWith('eye') ? 'input' : 'change', invalidateTracking);
  $('reset-view').addEventListener('click', invalidateTracking);
  addEventListener('beforeunload', stopTracking);
  const syncTimer = setInterval(() => {
    if (!isDisplay) publish();
    if (trackingSession?.stream && lastSeen && performance.now()-lastSeen > 500) {
      $('calibrate').disabled = true; status('Tracking paused · eyes obscured or frames stale. Holding viewpoint.');
    }
  }, 50);
  addEventListener('beforeunload', () => { clearInterval(syncTimer); channel?.close(); });
  function resize() { renderer.setSize(innerWidth, innerHeight); }
  addEventListener('resize', resize); resize(); readouts();
  function animate(now) {
    requestAnimationFrame(animate); updateLayout(); animateDance();
    const eye = new THREE.Vector3(state.eye.x, state.eye.y, state.eye.z);
    const screens = ConcaveGeometry.screens(state.width, state.height);
    const split = Math.round(innerWidth*seam);
    for (let i=0; i<2; i++) {
      if (isDisplay && i !== (side === 'left' ? 0 : 1)) continue;
      const x = isDisplay || i === 0 ? 0 : split;
      const width = isDisplay ? innerWidth : i === 0 ? split : innerWidth-split;
      renderer.setViewport(x, 0, width, innerHeight); renderer.setScissor(x, 0, width, innerHeight);
      ConcaveGeometry.project(THREE, cameras[i], screens[i], eye); renderer.render(scene, cameras[i]);
    }
    if (isDisplay && now-lastMessage > 2000) $('connection').textContent = 'Controller disconnected — holding last view';
  }
  requestAnimationFrame(animate);
})();
