// Run with Node 18+: node concave.test.cjs (uses the same Three.js CDN as the app).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

async function run() {
  const source = fs.readFileSync(path.join(__dirname, 'concave.js'), 'utf8');
  new vm.Script(source);
  const html = fs.readFileSync(path.join(__dirname, 'concave.html'), 'utf8');
  for (const [, id] of source.matchAll(/\$\('([^']+)'\)/g)) assert.ok(html.includes(`id="${id}"`), `Missing control: ${id}`);
  const response = await fetch('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
  assert.ok(response.ok, 'Three.js CDN must be reachable');
  const context = vm.createContext({ console });
  vm.runInContext(await response.text(), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'concave-geometry.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'concave-tracking.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'concave-props.js'), 'utf8'), context);
  const { THREE: T, ConcaveGeometry: geometry } = context;
  const tracking = context.ConcaveTracking;
  const close = (a, b, label) => assert.ok(Math.abs(a-b) < 1e-9, `${label}: ${a} != ${b}`);
  let count = 0;
  for (const width of [.2, .531, 1.2]) for (const height of [.15, .299, .8]) {
    const screens = geometry.screens(width, height);
    const directions = screens.map(s => new T.Vector3(...s.pb).sub(new T.Vector3(...s.pa)).normalize());
    close(directions[0].dot(directions[1]), 0, 'Panels perpendicular');
    for (const z of [.30, .45, .60]) for (const x of [-.18, 0, .18]) for (const y of [-.18, 0, .18]) {
      const eye = new T.Vector3(x, y, z);
      const cameras = screens.map(s => {
        const camera = new T.PerspectiveCamera(); geometry.project(T, camera, s, eye);
        assert.ok(camera.projectionMatrix.elements.every(Number.isFinite));
        for (const [key, px, py] of [['pa', -1, -1], ['pb', 1, -1], ['pc', -1, 1]]) {
          const projected = new T.Vector3(...s[key]).project(camera);
          close(projected.x, px, 'Physical corner x'); close(projected.y, py, 'Physical corner y');
        }
        return camera;
      });
      // Every point along the seam must occupy the same vertical pixel on both panels.
      for (const seamHeight of [-height/2, 0, height/2]) {
        const left = new T.Vector3(0, seamHeight, 0).project(cameras[0]);
        const right = new T.Vector3(0, seamHeight, 0).project(cameras[1]);
        close(left.x, 1, 'Left seam edge'); close(right.x, -1, 'Right seam edge'); close(left.y, right.y, 'Seam continuity');
      }
      count++;
    }
  }
  for (const raw of [{x:9,y:9,z:.01},{x:-9,y:-9,z:9}]) {
    const eye = geometry.clampEye(raw);
    assert.ok(eye.z >= .30 && eye.z <= .60);
    assert.ok(eye.z-Math.abs(eye.x) >= .08-1e-9, 'Eye remains inside both panels');
  }
  let foregroundChecks = 0;
  for (const width of [.2,.531,1.2]) for (const height of [.15,.299,.8]) for (const forward of [.06,.12,.16]) {
    const layout = geometry.foreground(width,height,forward);
    const radius = layout.size;
    assert.ok(layout.z*Math.SQRT1_2 > radius, 'Entire mannequin stays in front of both physical panels');
    assert.ok(layout.z+radius < .30, 'Object stays behind the closest supported viewer');
    foregroundChecks++;
  }
  for (const screen of geometry.screens(.531,.299)) {
    const right = new T.Vector3(...screen.pb).sub(new T.Vector3(...screen.pa)).normalize();
    const eye = new T.Vector3(0,0,.45), leaned = eye.clone().addScaledVector(right,.02);
    const a = new T.PerspectiveCamera(), b = new T.PerspectiveCamera();
    geometry.project(T,a,screen,eye); geometry.project(T,b,screen,leaned);
    const front = new T.Vector3(0,0,.12), back = new T.Vector3(0,0,-.20);
    assert.ok(front.clone().project(b).x < front.clone().project(a).x, 'Foreground moves opposite a sideways lean');
    assert.ok(back.clone().project(b).x > back.clone().project(a).x, 'Background has the opposite parallax');
  }
  // Generate observations independently using a pinhole camera on the left panel.
  const setup = { width: .531, distance: .45, cameraHeight: .08, fov: 60 };
  const q = Math.SQRT1_2, aspect = 16/9;
  function observation(eye, config = setup) {
    const cx = -config.width*q/2, cz = config.width*q/2;
    const depth = (eye.x-cx)*q+(eye.z-cz)*q;
    const horizontal = -(eye.x-cx)*q+(eye.z-cz)*q;
    const focal = 1/(2*Math.tan(config.fov*Math.PI/360));
    return { x: .5+focal*horizontal/depth, y: .5-focal*aspect*(eye.y-config.cameraHeight)/depth,
      iris: focal*.0117/depth, aspect };
  }
  const centerSample = observation({x:0,y:0,z:.45});
  const ref = tracking.calibrate(Array.from({length:16}, () => centerSample), setup);
  assert.ok(ref);
  let depthChecks = 0;
  for (const z of [.30,.35,.45,.55,.60]) for (const x of [-.1,0,.1]) for (const y of [-.08,0,.08]) {
    const expected = {x,y,z}, result = tracking.estimate(observation(expected), ref);
    for (const axis of ['x','y','z']) close(result.eye[axis], expected[axis], `Left camera recovered ${axis}`);
    close(result.cameraRange, Math.hypot(x+setup.width*q/2,y-setup.cameraHeight,z-setup.width*q/2), 'Camera range');
    depthChecks++;
  }
  assert.equal(tracking.calibrate([centerSample], setup), null, 'Require stable calibration samples');
  assert.equal(tracking.estimate({...centerSample,aspect:1}, ref), null, 'Reject changed video aspect');
  function landmarksFor(sample) {
    const points = Array.from({length:478}, () => ({x:.5,y:.5,z:0}));
    for (const [base, offset, top, bottom] of [[468,-.04,159,145],[473,.04,386,374]]) {
      const x = sample.x+offset, y = sample.y, r = sample.iris/2;
      points[base] = {x,y}; points[base+1] = {x:x+r,y}; points[base+2] = {x,y:y-r*sample.aspect};
      points[base+3] = {x:x-r,y}; points[base+4] = {x,y:y+r*sample.aspect};
      points[top] = {x,y:y-r*sample.aspect}; points[bottom] = {x,y:y+r*sample.aspect};
    }
    return points;
  }
  const observed = tracking.sample(landmarksFor(centerSample), aspect);
  close(observed.iris, centerSample.iris, 'Iris diameter respects video aspect');
  const blinking = landmarksFor(centerSample); blinking[159] = blinking[145];
  assert.equal(tracking.sample(blinking, aspect), null, 'Blink rejected');
  assert.equal(tracking.sample([], aspect), null, 'Missing face rejected');
  assert.equal(tracking.sample(landmarksFor({...centerSample,iris:.0001}), aspect), null, 'Unreliable tiny iris rejected');
  assert.ok(!html.includes('input-mode') && !source.includes('pointermove'), 'Camera-only controls');

  // Exercise frame scheduling and application wiring with synthetic camera frames.
  const messages = [];
  for (const side of ['', 'left', 'right', 'denied']) {
    const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, {
      value: '', hidden: false, disabled: false, textContent: '', dataset: {}, style: {},
      setAttribute() {}, appendChild() {}, checkValidity: () => true,
      getContext: () => ({clearRect() {},beginPath() {},arc() {},stroke() {}})
    }]));
    const renderCalls = [], timers = [], frameCallbacks = [], events = {}, viewports = [], classes = new Set();
    let renderedScene;
    let now = 100, cameraRequests = 0, cameraCallback, resultCallback, inFlight = 0, maxInFlight = 0, stopped = 0, inferenceDelay = 0;
    let sample = observation({x:0,y:0,z:.45}, {...setup,cameraHeight:0});
    const video = elements.get('video');
    Object.assign(video, { videoWidth:1280, videoHeight:720, readyState:2, currentTime:0,
      play: async () => {}, requestVideoFrameCallback(fn) { cameraCallback = fn; return 1; },
      cancelVideoFrameCallback() { cameraCallback = undefined; } });
    const track = {stop() { stopped++; },addEventListener() {}};
    const fakeRenderer = class {
      constructor() { this.shadowMap = {}; this.domElement = { addEventListener: (name, fn) => { events[name] = fn; } }; }
      setPixelRatio() {} setScissorTest() {} setSize() {} setViewport(...args) { viewports.push(args); } setScissor() {}
      render(scene, camera) { renderedScene = scene; renderCalls.push(camera.position.clone()); }
    };
    const appContext = vm.createContext({
      console, URLSearchParams, THREE: { ...T, WebGLRenderer: fakeRenderer }, ConcaveGeometry: geometry, ConcaveTracking: tracking, ConcaveProps: context.ConcaveProps,
      location: { search: ['left','right'].includes(side) ? `?view=${side}` : '' }, devicePixelRatio: 1, innerWidth: 1920, innerHeight: 1080,
      performance: { now: () => now }, Date: {now: () => now}, navigator: {mediaDevices:{getUserMedia:async () => {
        cameraRequests++;
        if (side === 'denied') throw Object.assign(new Error('denied'),{name:'NotAllowedError'});
        return {getTracks:() => [track],getVideoTracks:() => [track]};
      }}},
      FaceMesh: class {
        setOptions(options) { assert.equal(options.refineLandmarks, true); }
        onResults(fn) { resultCallback = fn; }
        async send() { inFlight++; maxInFlight = Math.max(inFlight,maxInFlight); await Promise.resolve(); now += inferenceDelay; resultCallback({multiFaceLandmarks:[landmarksFor(sample)]}); inFlight--; }
        async close() {}
      },
      document: { getElementById: id => elements.get(id), querySelectorAll: () => [], body: { classList: { add(name) { classes.add(name); }, toggle(name) { if (classes.has(name)) {classes.delete(name);return false;} classes.add(name);return true; } } } },
      addEventListener() {}, requestAnimationFrame: fn => { frameCallbacks.push(fn); },
      setInterval: fn => { timers.push(fn); }, clearInterval() {}, setTimeout() {}, clearTimeout() {},
      BroadcastChannel: class { constructor() { this.onmessage = null; } postMessage(data) { messages.push(JSON.parse(JSON.stringify(data))); } close() {} }
    });
    appContext.window = appContext;
    vm.runInContext(source, appContext);
    for (let i=0;i<8;i++) await Promise.resolve();
    frameCallbacks.shift()(100);
    assert.equal(renderCalls.length, ['left','right'].includes(side) ? 1 : 2, 'Correct number of screen renders');
    assert.ok(renderCalls.every(eye => eye.z === .45), 'Initial eye distance');
    assert.equal(renderedScene.getObjectByName('foreground-object').position.z, .12, 'Object starts in front, not in the tunnel');
    if (!side) {
      const figure = renderedScene.getObjectByName('foreground-object');
      const hand = figure.getObjectByName('left-hand');
      const initialHand = hand.getWorldPosition(new T.Vector3());
      // Check the actual animated vertices over a full loop, including extremities.
      for (let frame=0;frame<=40;frame++) {
        now = 100+frame*100; frameCallbacks.shift()(now);
        figure.updateMatrixWorld(true);
        const inverse = figure.matrixWorld.clone().invert();
        const groundY = renderedScene.getObjectByName('ground').position.y;
        let lowestSole = Infinity;
        figure.traverse(part => {
          if (!part.isMesh) return;
          const matrix = new T.Matrix4().multiplyMatrices(inverse,part.matrixWorld);
          const positions = part.geometry.attributes.position;
          const point = new T.Vector3();
          for (let i=0;i<positions.count;i++) {
            point.fromBufferAttribute(positions,i).applyMatrix4(part.matrixWorld);
            assert.ok(point.y >= groundY-1e-9, 'Dancing figure does not penetrate the ground');
            if (part.name.endsWith('-foot')) lowestSole = Math.min(lowestSole,point.y);
            point.fromBufferAttribute(positions,i).applyMatrix4(matrix);
            assert.ok(point.length() < 1, 'Dancing limbs remain in the verified foreground envelope');
          }
        });
        close(lowestSole, groundY, 'Supporting foot remains on the ground throughout the dance');
      }
      now += 350; frameCallbacks.shift()(now);
      assert.ok(hand.getWorldPosition(new T.Vector3()).distanceTo(initialHand) > .001, 'Dance moves the articulated limbs');
      elements.get('toggle-dance').onclick();
      frameCallbacks.shift()(now);
      const pausedHand = hand.getWorldPosition(new T.Vector3());
      now += 500; frameCallbacks.shift()(now);
      close(hand.getWorldPosition(new T.Vector3()).distanceTo(pausedHand),0,'Pause holds the pose');
      assert.equal(messages.at(-1).state.dancePlaying,false,'Pause synchronizes with displays');
      elements.get('toggle-dance').onclick();
      frameCallbacks.shift()(now);
      close(hand.getWorldPosition(new T.Vector3()).distanceTo(pausedHand),0,'Resume starts without a jump');
      now += 300; frameCallbacks.shift()(now);
      assert.ok(hand.getWorldPosition(new T.Vector3()).distanceTo(pausedHand) > .001,'Dance resumes');
      elements.get('seam').oninput({target:{value:'47'}});
      frameCallbacks.shift()(now);
      assert.deepEqual(viewports.slice(-2), [[0,0,902,1080],[902,0,1018,1080]], 'Spanning view matches adjustable physical seam with no gap');
      elements.get('object-forward').oninput({target:{value:'16'}});
      frameCallbacks.shift()(now);
      assert.equal(renderedScene.getObjectByName('foreground-object').position.z, .16, 'Foreground depth control moves the actual object');
      assert.equal(messages.at(-1).state.forward, .16, 'Foreground settings synchronize');
      elements.get('hide-setup').onclick();
      assert.ok(classes.has('immersive'), 'Immersive spanning view hides setup');
      elements.get('show-setup').onclick();
      assert.ok(!classes.has('immersive'));
      assert.equal(cameraRequests, 1, 'Camera starts automatically');
      const feedFrame = async () => {
        now += 33; video.currentTime += .033;
        const next = cameraCallback; cameraCallback = undefined;
        assert.ok(next, 'Next video frame scheduled');
        await next(); timers[0]();
      };
      for (let i=0;i<16;i++) await feedFrame();
      assert.equal(elements.get('calibrate').disabled, false);
      elements.get('calibrate').onclick();
      assert.match(elements.get('status').textContent, /Depth calibrated/);
      sample = observation({x:0,y:0,z:.55}, {...setup,cameraHeight:0});
      for (let i=0;i<20;i++) await feedFrame();
      assert.equal(elements.get('live-depth').value, '55.0 cm', 'Live depth follows incoming iris size');
      assert.ok(messages.at(-1).state.eye.z > .54, 'Shared projection follows live depth');
      assert.ok(Math.abs(messages.at(-1).state.eye.x) < .001, 'Forward movement does not drift sideways');
      assert.match(elements.get('tracking-rate').value, /30.3 fps/);
      assert.equal(maxInFlight, 1, 'No overlapping inference');
      now += 600; timers[0]();
      assert.equal(elements.get('live-depth').value, '—', 'Stale distance is not shown as live');
      assert.equal(elements.get('calibrate').disabled, true);
      await feedFrame();
      assert.equal(elements.get('live-depth').value, '55.0 cm', 'Tracking resumes');
      inferenceDelay = 400;
      await feedFrame();
      assert.equal(elements.get('live-depth').value, '—', 'Slow inference is not mislabeled as a fresh measurement');
      inferenceDelay = 0;
      await feedFrame();
      assert.equal(elements.get('live-depth').value, '55.0 cm', 'Tracking recovers after inference delay');
      elements.get('distance').oninput({ target: { value: '30' } });
      assert.equal(elements.get('distance-value').value, '30 cm');
      assert.equal(elements.get('live-depth').value, '—', 'Changing setup invalidates calibration');
      timers[0]();
      assert.ok(messages.at(-1).state.distance === .30, 'Controller publishes distance');
      await elements.get('restart-camera').onclick();
      assert.equal(stopped, 1, 'Restart releases old camera');
      assert.equal(cameraRequests, 2, 'Camera can be restarted');
    } else if (side === 'denied') {
      assert.match(elements.get('status').textContent, /permission denied/, 'Permission error is actionable');
      assert.equal(elements.get('live-depth').value, '—');
    } else {
      assert.equal(cameraRequests, 0, 'Display windows do not compete for the camera');
    }
  }
  console.log(`PASS: ${count} projection configurations; ${foregroundChecks} foreground clearances; animated mannequin bounds, floor contact, movement and pause/resume; spanning layout; ${depthChecks} left-camera reconstructions; live camera checks.`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
