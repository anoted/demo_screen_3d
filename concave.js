(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const side = new URLSearchParams(location.search).get('view');
  const isDisplay = side === 'left' || side === 'right';
  const state = { width: .531, height: .299, distance: .45, forward: .12, guides: true,
    dancePlaying: true, danceEpoch: Date.now(), danceOffset: 0, eye: { x: 0, y: 0, z: .45 } };
  let target = { ...state.eye };
  let seam = .5;
  let channel;
  let lastControllerMessage = 0;
  let session, reference;
  let samples = [];
  let cameraHeight = 0, cameraFov = 60;
  let measurement, sampleRate = 0, previousResult = 0;
  let trackingGeneration = 0;
  let lastSeen = 0;
  const status = message => { $('status').textContent = message; };
  const overlay = $('tracking-overlay').getContext('2d');

  if (isDisplay) {
    document.body.classList.add('display');
    $('display-tools').hidden = false;
    $('display-title').textContent = `${side.toUpperCase()} SCREEN`;
    $('fullscreen').onclick = () => document.documentElement.requestFullscreen().catch(() => {
      $('connection').textContent = 'Use your browser fullscreen shortcut.';
    });
  }
  if (!window.THREE) { status('Could not load the 3D library. Check your connection and reload.'); $('connection').textContent = '3D library failed to load.'; return; }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
  catch (error) { status('WebGL is unavailable. Enable hardware acceleration and reload.'); $('connection').textContent = 'WebGL unavailable.'; return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setScissorTest(true);
  $('stage').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b151e);
  scene.fog = new THREE.Fog(0x0b151e, .8, 2.5);
  scene.add(new THREE.HemisphereLight(0xd8f3ff, 0x18202e, .55));
  const light = new THREE.DirectionalLight(0xffead3, 1.6);
  light.position.set(-.35, .65, .45);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  Object.assign(light.shadow.camera, { left: -.8, right: .8, top: .8, bottom: -.8, near: .01, far: 3 });
  light.shadow.camera.updateProjectionMatrix();
  light.shadow.bias = -.0001;
  light.shadow.normalBias = .001;
  scene.add(light);
  const rim = new THREE.DirectionalLight(0x69d9ff, .8);
  rim.position.set(.3, .15, -.4); scene.add(rim);
  const cameras = [new THREE.PerspectiveCamera(), new THREE.PerspectiveCamera()];
  const room = new THREE.Group(); scene.add(room);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), new THREE.MeshStandardMaterial({ color: 0x152c3c, roughness: .85 }));
  wall.position.set(0, .6, -.95); room.add(wall);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({ color: 0x213440, roughness: .95 }));
  floor.name = 'ground';
  floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; room.add(floor);
  const grid = new THREE.GridHelper(4, 80, 0x5b8999, 0x294350); room.add(grid);
  const surroundings = ConcaveProps.create(THREE); scene.add(surroundings.group);
  // A solid, upright mannequin provides a human silhouette from every viewpoint.
  const person = new THREE.Group();
  person.name = 'foreground-object'; person.userData.kind = 'placeholder-person';
  scene.add(person);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xb6d5df, roughness: .48, metalness: .06 });
  const jointMaterial = new THREE.MeshStandardMaterial({ color: 0x779aa8, roughness: .6 });
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
    groundPerson();
  }
  const screenGuides = new THREE.Group(); scene.add(screenGuides);
  const guideLines = [0,1].map(() => {
    const line = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x76ddcd, transparent: true, opacity: .5 }));
    screenGuides.add(line); return line;
  });
  let sceneLayout = '';
  function updateSceneLayout() {
    const key = `${state.width}/${state.height}/${state.forward}`;
    screenGuides.visible = state.guides;
    if (key === sceneLayout) return;
    sceneLayout = key;
    const layout = ConcaveGeometry.foreground(state.width, state.height, state.forward);
    person.position.set(0, 0, layout.z); person.scale.setScalar(layout.size);
    // Keep floor contact inside the panels even at the closest supported eye
    // position. Foreground feet at the physical bottom edge would be cropped.
    floor.position.y = -state.height*.42*(.30-layout.z)/.30;
    grid.position.y = floor.position.y+.0005;
    surroundings.update(layout, floor.position.y);
    ConcaveGeometry.screens(state.width, state.height).forEach((screen, i) => {
      // Inset a little so the screen-plane reference remains visible at viewport edges.
      const pa = new THREE.Vector3(...screen.pa), pb = new THREE.Vector3(...screen.pb), pc = new THREE.Vector3(...screen.pc);
      const right = pb.clone().sub(pa), up = pc.clone().sub(pa);
      const points = [[.015,.02],[.985,.02],[.985,.98],[.015,.98]].map(([u,v]) => pa.clone().addScaledVector(right,u).addScaledVector(up,v));
      guideLines[i].geometry.dispose(); guideLines[i].geometry = new THREE.BufferGeometry().setFromPoints(points);
    });
    $('object-position').setAttribute('cy', 16+layout.z*145);
  }

  function resize() { renderer.setSize(innerWidth, innerHeight); }
  addEventListener('resize', resize); resize();
  function publish() { channel?.postMessage({ type: 'state', state }); }
  try {
    channel = new BroadcastChannel('concave-window-v1');
    channel.onmessage = ({ data }) => {
      if (isDisplay && data?.type === 'state') {
        const s = data.state;
        if (!s || ![s.width, s.height, s.distance, s.eye?.x, s.eye?.y, s.eye?.z].every(Number.isFinite)) return;
        if (s.width < .2 || s.width > 1.2 || s.height < .15 || s.height > .8) return;
        if (!Number.isFinite(s.forward) || s.forward < .06 || s.forward > .16 || typeof s.guides !== 'boolean') return;
        if (typeof s.dancePlaying !== 'boolean' || !Number.isFinite(s.danceEpoch) || !Number.isFinite(s.danceOffset)) return;
        Object.assign(state, s); target = ConcaveGeometry.clampEye(s.eye);
        lastControllerMessage = performance.now();
        $('connection').textContent = 'Controller connected';
      } else if (!isDisplay && data?.type === 'hello') publish();
    };
    if (isDisplay) channel.postMessage({ type: 'hello' });
  } catch { status('Window sync is unavailable. Use a browser with BroadcastChannel support.'); }
  $('toggle-dance').onclick = () => {
    state.danceOffset = danceTime(); state.danceEpoch = Date.now();
    state.dancePlaying = !state.dancePlaying;
    $('toggle-dance').textContent = state.dancePlaying ? 'Pause dance' : 'Resume dance';
    publish();
  };
  $('seam').oninput = event => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value) || value < 20 || value > 80) return;
    seam = value/100; $('seam-value').value = `${value}%`;
    $('seam-marker').style.left = `${value}%`;
  };
  function toggleSetup() {
    if (isDisplay) return;
    const hidden = document.body.classList.toggle('immersive');
    $('presentation-tools').hidden = !hidden;
  }
  $('hide-setup').onclick = toggleSetup;
  $('show-setup').onclick = toggleSetup;
  addEventListener('keydown', event => {
    if (event.key?.toLowerCase() === 'h' && !['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)) toggleSetup();
  });
  $('object-forward').oninput = event => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value) || value < 6 || value > 16) return;
    state.forward = value/100;
    $('object-forward-value').value = `${value} cm`;
    publish();
  };
  $('screen-guides').onchange = event => { state.guides = event.target.checked; publish(); };
  function setDistance(cm) {
    state.distance = Number(cm) / 100;
    $('distance').value = cm; $('distance-value').value = `${cm} cm`;
    invalidateCalibration();
  }
  $('distance').oninput = event => setDistance(event.target.value);
  document.querySelectorAll('[data-distance]').forEach(button => button.onclick = () => setDistance(button.dataset.distance));
  for (const [id, key] of [['screen-width', 'width'], ['screen-height', 'height']]) {
    $(id).onchange = event => {
      if (!event.target.checkValidity() || !event.target.value) { event.target.value = (state[key]*100).toFixed(1); return; }
      state[key] = Number(event.target.value) / 100;
      invalidateCalibration();
    };
  }
  for (const id of ['camera-height', 'camera-fov']) $(id).onchange = event => {
    if (!event.target.checkValidity() || !event.target.value) {
      event.target.value = id === 'camera-height' ? cameraHeight*100 : cameraFov; return;
    }
    if (id === 'camera-height') cameraHeight = Number(event.target.value)/100;
    else cameraFov = Number(event.target.value);
    invalidateCalibration();
  };
  for (const name of ['left', 'right']) $('open-'+name).onclick = () => {
    const opened = window.open(`concave.html?view=${name}`, `concave-${name}`, 'popup,width=1100,height=700');
    if (!opened) status('Popup blocked. Allow popups for this page and try again.');
  };
  function stopCamera() {
    trackingGeneration++;
    const old = session; session = undefined;
    if (old) {
      clearTimeout(old.timer);
      if (old.videoFrame !== undefined) $('video').cancelVideoFrameCallback?.(old.videoFrame);
      old.stream?.getTracks().forEach(track => track.stop());
      // Retire the model only after its current inference completes.
      Promise.resolve(old.inFlight).catch(() => {}).then(() => old.detector?.close()).catch(() => {});
    }
    $('video').srcObject = null; $('video-container').hidden = true;
    $('calibrate').disabled = true; reference = undefined; samples = []; measurement = undefined;
    sampleRate = 0; previousResult = 0; lastSeen = 0;
    clearReadouts();
  }
  function clearReadouts() {
    for (const id of ['live-depth', 'camera-range', 'tracking-rate', 'tracking-age']) $(id).value = '—';
  }
  function invalidateCalibration() {
    reference = undefined; measurement = undefined; samples = [];
    $('calibrate').disabled = true; clearReadouts();
    target = { x: 0, y: 0, z: state.distance };
    status('Setup changed. Sit at the selected distance and calibrate depth.');
  }
  function onFace(results, capturedAt) {
    const now = performance.now(), video = $('video');
    // Measurement age includes inference latency, not just time since its callback.
    if (now-capturedAt > 250) {
      $('calibrate').disabled = true; samples = [];
      status('Camera processing is delayed. Waiting for a fresh eye measurement.');
      return;
    }
    const landmarks = results.multiFaceLandmarks?.[0];
    const sample = ConcaveTracking.sample(landmarks, video.videoWidth/video.videoHeight);
    const canvas = $('tracking-overlay');
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    }
    overlay.clearRect(0, 0, canvas.width, canvas.height);
    if (!sample) { $('calibrate').disabled = true; samples = []; return; }
    if (previousResult && now > previousResult) sampleRate = sampleRate ? sampleRate*.8+(.2*1000/(now-previousResult)) : 1000/(now-previousResult);
    previousResult = now; lastSeen = capturedAt;
    samples.push({ ...sample, time: now }); samples = samples.filter(s => now-s.time < 1200).slice(-24);
    $('calibrate').disabled = samples.length < 12;
    overlay.strokeStyle = '#76ddcd'; overlay.lineWidth = 2;
    for (const index of [468,473]) {
      overlay.beginPath(); overlay.arc(landmarks[index].x*canvas.width, landmarks[index].y*canvas.height, sample.iris*canvas.width/2, 0, Math.PI*2); overlay.stroke();
    }
    if (!reference) { status(samples.length < 12 ? 'Eyes detected. Hold still for calibration…' : 'Ready. Sit at the selected distance and press Calibrate depth.'); return; }
    measurement = ConcaveTracking.estimate(sample, reference);
    if (!measurement) { invalidateCalibration(); status('Video geometry changed. Calibrate depth again.'); return; }
    target = ConcaveGeometry.clampEye(measurement.eye);
    const limited = Object.keys(target).some(axis => Math.abs(target[axis]-measurement.eye[axis]) > .001);
    status(limited ? 'Tracking · outside the supported viewing area; projection limited.' : 'Tracking live · calibrated iris depth');
  }
  $('calibrate').onclick = () => {
    if (!session || performance.now()-lastSeen > 250) return;
    const next = ConcaveTracking.calibrate(samples, { width: state.width, distance: state.distance, cameraHeight, fov: cameraFov });
    if (!next) { status('Hold your head steady with both eyes visible, then calibrate again.'); return; }
    reference = next; target = { x: 0, y: 0, z: state.distance };
    measurement = ConcaveTracking.estimate(next, next);
    status('Depth calibrated. Head position and depth now update with every tracked frame.');
  };
  async function startCamera() {
    stopCamera();
    const generation = trackingGeneration;
    const active = {}; session = active;
    status('Starting webcam…');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Open this app on localhost or HTTPS for webcam access.');
      if (!window.FaceMesh) throw new Error('Iris tracking failed to load. Check your connection and restart the camera.');
      const acquired = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: 'user' }, audio: false });
      if (generation !== trackingGeneration) { acquired.getTracks().forEach(track => track.stop()); return; }
      active.stream = acquired; $('video').srcObject = acquired; await $('video').play();
      if (generation !== trackingGeneration) return;
      $('video-container').hidden = false;
      active.detector = new FaceMesh({ locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}` });
      active.detector.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: .6, minTrackingConfidence: .6 });
      active.detector.onResults(results => { if (generation === trackingGeneration) onFace(results, active.capturedAt); });
      acquired.getVideoTracks()[0].addEventListener('ended', () => {
        if (generation === trackingGeneration) { stopCamera(); status('Camera disconnected. Reconnect it and press Restart camera.'); }
      });
      status('Finding eyes… Look toward the seam with both eyes visible to the left camera.');
      let lastVideoTime = -1;
      const schedule = () => {
        if (generation !== trackingGeneration) return;
        if ($('video').requestVideoFrameCallback) active.videoFrame = $('video').requestVideoFrameCallback(frame);
        else active.timer = setTimeout(frame, 16);
      };
      const frame = async () => {
        if (generation !== trackingGeneration) return;
        if ($('video').readyState < 2 || $('video').currentTime === lastVideoTime) { schedule(); return; }
        lastVideoTime = $('video').currentTime;
        active.capturedAt = performance.now();
        try { active.inFlight = active.detector.send({ image: $('video') }); await active.inFlight; }
        catch { if (generation === trackingGeneration) { stopCamera(); status('Iris tracking failed. Check your connection and press Restart camera.'); } return; }
        schedule();
      };
      schedule();
    } catch (error) {
      if (generation !== trackingGeneration) return;
      stopCamera();
      status(error.name === 'NotAllowedError' ? 'Camera permission denied. Allow camera access, then press Restart camera.' : error.message);
    }
  }
  $('restart-camera').onclick = startCamera;
  let previous = performance.now();
  // Keep tracking and window synchronization independent of rendering visibility.
  const syncTimer = setInterval(() => {
    const now = performance.now();
    const alpha = 1 - Math.exp(-Math.min((now-previous)/1000, .1)*18); previous = now;
    if (!isDisplay && session?.stream) {
      const age = lastSeen ? now-lastSeen : Infinity;
      $('tracking-age').value = Number.isFinite(age) ? `${Math.round(age)} ms` : 'Waiting';
      $('tracking-rate').value = age < 500 && sampleRate ? `${sampleRate.toFixed(1)} fps` : '0 fps';
      if (age > 250) {
        $('calibrate').disabled = true;
        $('live-depth').value = '—'; $('camera-range').value = '—';
        if (lastSeen) status('Tracking paused · eyes obscured or frames stale. Holding last position.');
      } else if (measurement) {
        $('live-depth').value = `${(measurement.eye.z*100).toFixed(1)} cm`;
        $('camera-range').value = `${(measurement.cameraRange*100).toFixed(1)} cm`;
      }
    }
    if (!isDisplay) for (const axis of ['x','y','z']) state.eye[axis] += (target[axis]-state.eye[axis])*alpha;
    if (!isDisplay) publish();
  }, 33);
  addEventListener('beforeunload', () => { stopCamera(); clearInterval(syncTimer); channel?.close(); });
  function animate(now) {
    requestAnimationFrame(animate);
    const safeEye = ConcaveGeometry.clampEye(state.eye);
    const eye = new THREE.Vector3(safeEye.x, safeEye.y, safeEye.z);
    const screens = ConcaveGeometry.screens(state.width, state.height);
    updateSceneLayout();
    animateDance();
    for (let i = 0; i < 2; i++) {
      if (isDisplay && i !== (side === 'left' ? 0 : 1)) continue;
      const split = Math.round(innerWidth*seam);
      const x = isDisplay || i === 0 ? 0 : split;
      const width = isDisplay ? innerWidth : i === 0 ? split : innerWidth-split;
      renderer.setViewport(x, 0, width, innerHeight); renderer.setScissor(x, 0, width, innerHeight);
      ConcaveGeometry.project(THREE, cameras[i], screens[i], eye); renderer.render(scene, cameras[i]);
    }
    if (isDisplay && now-lastControllerMessage > 2000) $('connection').textContent = 'Controller disconnected — holding last view';
    const dx = 130 + state.eye.x*160, dy = 16 + state.eye.z*145;
    $('eye-dot').setAttribute('cx', dx); $('eye-dot').setAttribute('cy', dy);
    $('sightline').setAttribute('d', `M${dx} ${dy} L130 16`);
  }
  requestAnimationFrame(animate);
  if (!isDisplay) startCamera();
})();
