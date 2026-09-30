/* 3D debug view (UX 8.3): a third-person, orbitable camera rendered into a floating panel, after
   3d_projection_demo-master/src/DebugView.js. Shows screens, eye, frusta, tracking and depth cameras. */
(function (root) {
  const LAYER = 1, COLORS = { left: 0x4fb3bf, right: 0xa58bd8, eye: 0xffd166, track: 0x6fa8ff, depth: 0x06d6a0, ray: 0x06d6a0, iris: 0x6fa8ff, seam: 0x56606e };

  class DebugView {
    constructor(renderer, scene, THREE) {
      this.THREE = THREE; this.renderer = renderer; this.scene = scene; this.pairKey = ''; this.visible = true;
      this.hint = RoomUI.el('span', { text: 'Debug view · drag to orbit · wheel to zoom' });
      this.view = RoomUI.el('div', { id: 'debug3d' }, this.hint);
      this.mini = RoomUI.el('canvas', { id: 'miniview' });
      this.panel = RoomUI.panel({ id: 'debug', title: 'Debug view', x: 300, y: Math.max(12, innerHeight-350), width: 300 });
      this.panel.body.append(this.view, this.mini);

      this.camera = new THREE.PerspectiveCamera(42, 1.5, .01, 50);
      this.camera.layers.enable(LAYER); this.camera.position.set(.95, .5, .95);
      this.controls = new THREE.OrbitControls(this.camera, this.view);
      this.controls.target.set(0, 0, -.1); this.controls.enableDamping = true; this.controls.update();

      this.group = new THREE.Group(); scene.add(this.group);
      this.screens = new THREE.Group(); this.group.add(this.screens);
      this.eye = this.mark(new THREE.Mesh(new THREE.SphereGeometry(.014, 20, 12), new THREE.MeshBasicMaterial({ color: COLORS.eye })));
      this.trailLine = this.mark(new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(40*3), 3)),
        new THREE.LineBasicMaterial({ color: COLORS.eye, transparent: true, opacity: .5 })));
      this.trailLine.frustumCulled = false;
      this.frusta = this.lines(16, [COLORS.left, COLORS.right]);
      this.trackCone = this.lines(8, COLORS.track); this.depthCone = this.lines(8, COLORS.depth);
      this.ray = this.lines(1, COLORS.ray);
      this.trackBox = this.mark(new THREE.Mesh(new THREE.BoxGeometry(.05, .016, .02), new THREE.MeshBasicMaterial({ color: COLORS.track })));
      this.depthBox = this.mark(new THREE.Mesh(new THREE.BoxGeometry(.03, .012, .012), new THREE.MeshBasicMaterial({ color: COLORS.depth })));
      const seam = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -.6, 0), new THREE.Vector3(0, .6, 0)]);
      this.mark(new THREE.Line(seam, new THREE.LineBasicMaterial({ color: COLORS.seam })));
      this.panel.listeners.push(() => this.layout());
    }
    mark(object) { object.layers.set(LAYER); object.traverse?.(o => o.layers.set(LAYER)); this.group.add(object); return object; }
    lines(count, colors) {
      const T = this.THREE, geo = new T.BufferGeometry().setAttribute('position', new T.BufferAttribute(new Float32Array(count*6), 3));
      const list = [].concat(colors), mat = new T.LineBasicMaterial({ color: list[0], transparent: true, opacity: .8 });
      const line = this.mark(new T.LineSegments(geo, mat)); line.frustumCulled = false; line.userData.extra = list; return line;
    }
    layout() {
      const box = this.view.getBoundingClientRect();
      this.rect = box; this.camera.aspect = Math.max(.1, box.width/Math.max(1, box.height)); this.camera.updateProjectionMatrix();
    }
    setVisible(value) { this.visible = value; this.panel.el.classList.toggle('hidden', !value); }
    setPairs(pair) {
      const key = JSON.stringify(pair);
      if (key === this.pairKey) return;
      this.pairKey = key;
      for (const child of [...this.screens.children]) { child.geometry.dispose(); this.screens.remove(child); }
      const T = this.THREE;
      pair.forEach(s => {
        const a = s.pa, b = s.pb, c = s.pc, d = a.map((v, i) => b[i]+c[i]-v), pts = [a, b, d, a, d, c].flat();
        const geo = new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(pts, 3));
        const quad = new T.Mesh(geo, new T.MeshBasicMaterial({ color: COLORS[s.name], transparent: true, opacity: .28, side: T.DoubleSide }));
        const edge = new T.LineLoop(new T.BufferGeometry().setFromPoints([a, b, d, c].map(p => new T.Vector3(...p))), new T.LineBasicMaterial({ color: COLORS[s.name] }));
        [quad, edge].forEach(o => { o.layers.set(LAYER); this.screens.add(o); });
      });
    }
    setCone(lines, origin, axes, fov, aspect, length) {
      const h = Math.tan(fov*Math.PI/360)*length, v = h/aspect, at = (sx, sy) => axes.forward.map((f, i) => origin[i]+f*length+axes.right[i]*h*sx+axes.up[i]*v*sy);
      const c = [at(-1, 1), at(1, 1), at(1, -1), at(-1, -1)], out = [];
      c.forEach((p, i) => out.push(...origin, ...p));
      c.forEach((p, i) => out.push(...p, ...c[(i+1) % 4]));
      lines.geometry.attributes.position.array.set(out); lines.geometry.attributes.position.needsUpdate = true;
    }
    // d: { pair, eye, trail, pose, depthModel, via }
    update(d) {
      if (!this.visible) return;
      const T = this.THREE, P = root.PortraitTracking, Dm = root.DepthSource;
      this.setPairs(d.pair);
      this.eye.position.set(d.eye.x, d.eye.y, d.eye.z);
      const trail = this.trailLine.geometry.attributes.position;
      for (let i = 0; i < 40; i++) { const p = d.trail[Math.max(0, d.trail.length-40+i)] || d.eye; trail.setXYZ(i, p.x, p.y, p.z); }
      trail.needsUpdate = true;
      // Frusta: eye -> the four corners of each lit area.
      const out = [];
      d.pair.forEach(s => { const c = s.pa.map((v, i) => s.pb[i]+s.pc[i]-v); [s.pa, s.pb, s.pc, c].forEach(p => out.push(d.eye.x, d.eye.y, d.eye.z, ...p)); });
      this.frusta.geometry.attributes.position.array.set(out); this.frusta.geometry.attributes.position.needsUpdate = true;
      // Tracking camera and depth camera (depth axes are given in the tracking camera's frame).
      const pose = d.pose, axes = P.basis(pose), origin = [pose.x, pose.y, pose.z];
      this.trackBox.position.set(...origin); this.setCone(this.trackCone, origin, axes, pose.fov, 16/9, .4);
      const m = d.depthModel, da = Dm.modelAxes(m.yaw, m.tilt);
      const comb = v => [0, 1, 2].map(i => v[0]*axes.right[i]+v[1]*axes.up[i]+v[2]*axes.forward[i]);
      const dorigin = origin.map((v, i) => v+comb([m.dx, m.dy, m.dz])[i]);
      const daxes = { right: comb(da.right), up: comb(da.up), forward: comb(da.forward) };
      this.depthBox.position.set(...dorigin); this.depthBox.visible = this.depthCone.visible = d.showDepth;
      this.setCone(this.depthCone, dorigin, daxes, m.fov, 4/3, .4);
      const rayPos = this.ray.geometry.attributes.position; rayPos.array.set([...origin, d.eye.x, d.eye.y, d.eye.z]); rayPos.needsUpdate = true;
      this.ray.material.color.setHex(d.via === 'depth' ? COLORS.ray : COLORS.iris);
    }
    render(camera, scissorSetter) {
      if (!this.visible || !this.panel.open) return;
      this.layout();
      const r = this.rect; if (!r || r.width < 8) return;
      this.controls.update();
      const y = innerHeight-r.bottom;
      this.renderer.setViewport(r.left, y, r.width, r.height); this.renderer.setScissor(r.left, y, r.width, r.height);
      this.renderer.render(this.scene, this.camera);
    }
  }
  root.DebugView3D = DebugView;
})(window);
