/* Depth calibration dialog (UX 8.4): Check -> Capture -> Fit -> Apply. */
(function (root) {
  const el = (...args) => RoomUI.el(...args);
  const POSITIONS = [];
  for (const [distance, hint] of [['Near', 60], ['Middle', 100], ['Far', 150]]) for (const side of ['left', 'centre', 'right']) POSITIONS.push({ label: `${distance} · ${side}`, hint });
  const captures = POSITIONS.map(() => null);          // kept until the page is reloaded
  const tape = POSITIONS.map(p => p.hint);
  let lastFit = null;

  function open(ctx) {
    const { profile, RoomProfile, depthSource } = ctx, D = root.DepthSource, C = root.DepthCalibration;
    const base = () => RoomProfile.depthModel(profile), eyeOffset = () => profile.depth.eyeOffset/100;
    let timer = null;
    const stop = () => { clearInterval(timer); timer = null; };
    ctx.ensureDepth();
    const dlg = RoomUI.dialog({ title: 'Depth camera calibration', onClose: stop, steps: [
      { title: 'Check', render: renderCheck }, { title: 'Capture', render: renderCapture },
      { title: 'Fit', render: renderFit }, { title: 'Apply', render: renderApply }] });

    // ---- 1 Check
    function renderCheck(box) {
      stop();
      const video = el('video', { autoplay: true, muted: true, playsinline: true }), marker = el('i', { style: 'position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border:2px solid #ffd166;border-radius:50%;left:50%;top:50%' });
      const depthCanvas = el('canvas', { width: 160, height: 120 }), info = el('div', { class: 'msg' });
      box.append(el('h2', { text: '1  Check the depth reading' }),
        el('p', { text: 'Sit about 80 cm from the screens with both eyes visible. The cyan circle on the depth image must sit on your face, at the same place as the yellow ring on the camera image. Bright = near.' }),
        el('div', { class: 'dlg-cols' }, el('div', { style: 'position:relative' }, video, marker), depthCanvas), info,
        el('div', { class: 'dlg-row' }, el('button', { text: 'Reconnect depth', onclick: () => depthSource.connect(profile.depthUrl) }), el('button', { class: 'primary', text: 'Next: capture ▸', onclick: () => dlg.go(1) })));
      const first = ctx.live(); if (first.stream) { video.srcObject = first.stream; video.play().catch(() => {}); }
      timer = setInterval(() => {
        const live = ctx.live(), fresh = live.sample && performance.now()-live.time < 400;
        const hit = fresh && live.frame ? D.locate(live.frame, live.sample, base()) : null;
        D.renderDepth(depthCanvas, live.frame || depthSource.frame, hit);
        if (live.sample) { marker.style.left = `${(1-live.sample.x)*100}%`; marker.style.top = `${live.sample.y*100}%`; }
        marker.style.display = fresh ? '' : 'none';
        info.textContent = depthSource.status !== 'connected' ? 'Depth camera not connected. Start the bridge (see README), then Reconnect.'
          : !live.stream ? 'Tracking webcam is not running (press R in the app).' : !fresh ? 'Eyes not visible to the tracking camera.'
          : hit ? `Depth found: ${(hit.range*100).toFixed(0)} cm along the eye ray.` : 'Camera sees you, but no depth at your face. Move a little, or check FOV / Flip.';
      }, 100);
    }

    // ---- 2 Capture
    function renderCapture(box) {
      stop();
      const done = () => captures.filter(Boolean).length;
      const bar = el('span', {}), msg = el('div', { class: 'msg' }), rows = [];
      const table = el('table', {}, el('thead', {}, el('tr', {}, ['Position', 'Tape (cm)', '', 'Error now'].map(t => el('th', { text: t })))), el('tbody'));
      const refresh = () => {
        bar.style.width = `${done()/POSITIONS.length*100}%`; progress.textContent = `${done()} / ${POSITIONS.length}`;
        rows.forEach((cell, i) => {
          const c = captures[i], e = c ? C.predict(c, base(), eyeOffset()) : null;
          cell.textContent = !c ? '—' : e === null ? 'no depth' : `${((e-c.range)*100).toFixed(1)} cm`;
          cell.className = c && e !== null && Math.abs(e-c.range) > .05 ? 'bad' : '';
        });
      };
      const progress = el('small');
      POSITIONS.forEach((pos, i) => {
        const input = el('input', { type: 'number', min: 20, max: 400, step: 1, value: tape[i] }), result = el('td');
        input.oninput = () => { tape[i] = Number(input.value); };
        rows.push(result);
        table.tBodies[0].append(el('tr', {}, el('td', { text: pos.label }), el('td', {}, input),
          el('td', {}, el('button', { text: captures[i] ? 'Redo' : 'Capture', onclick: async event => {
            const range = Number(input.value)/100;
            if (!(range >= .2 && range <= 4)) { msg.textContent = 'Type the tape distance from the tracking camera lens to your eyes (20–400 cm).'; return; }
            const button = event.target; button.disabled = true; msg.textContent = 'Hold still…';
            const got = await gather(); button.disabled = false;
            if (!got) { msg.textContent = 'Not enough samples. Both eyes and the depth camera must be live (see step 1).'; return; }
            captures[i] = { ...got, range, label: pos.label }; lastFit = null; button.textContent = 'Redo'; msg.textContent = `${pos.label} captured.`; refresh();
          } })), result));
      });
      box.append(el('h2', { text: '2  Capture positions' }),
        el('p', { text: 'For each row: sit there, measure the distance from the tracking camera lens to your eyes with a tape, type it, press Capture and hold still for one second. At least 5 captures at 3 different distances are needed. Include left and right positions: they set the camera offset and angle.' }),
        table, el('div', { class: 'dlg-row' }, el('span', { class: 'bar' }, bar), progress), msg,
        el('div', { class: 'dlg-row' }, el('button', { text: 'Clear all', onclick: () => { captures.fill(null); lastFit = null; refresh(); } }),
          el('button', { class: 'primary', text: 'Next: fit ▸', onclick: () => dlg.go(2) })));
      refresh();
    }
    function gather() {
      return new Promise(resolve => {
        const samples = [], frames = [], t0 = performance.now();
        const tick = setInterval(() => {
          const live = ctx.live(), now = performance.now();
          if (live.sample && now-live.time < 300 && live.frame) {
            samples.push(live.sample); if (frames[frames.length-1] !== live.frame) frames.push(live.frame);
          }
          if (now-t0 > 1000) { clearInterval(tick); resolve(samples.length >= 8 && frames.length >= 5 ? C.summarize(samples, frames) : null); }
        }, 33);
      });
    }

    // ---- 3 Fit
    function renderFit(box) {
      stop();
      const msg = el('div', { class: 'msg' }), out = el('div');
      const show = () => {
        out.replaceChildren();
        if (!lastFit) return;
        const f = lastFit, cm = v => `${v.toFixed(1)} cm`;
        const before = base(), pairs = [['Distance scale', before.scale, f.values.scale, 3, ''], ['Distance bias', before.bias*100, f.values.bias*100, 1, ' cm'], ['Offset right', before.dx*100, f.values.dx*100, 1, ' cm'],
          ['Offset up', before.dy*100, f.values.dy*100, 1, ' cm'], ['Yaw', before.yaw, f.values.yaw, 1, '°'], ['Tilt down', before.tilt, f.values.tilt, 1, '°'], ['FOV', before.fov, f.values.fov, 1, '°']];
        out.append(el('p', { text: `Average error: ${cm(f.rmsBefore)} → ${cm(f.rmsAfter)}` }),
          el('table', {}, el('thead', {}, el('tr', {}, ['Field', 'Now', 'Fitted'].map(t => el('th', { text: t })))),
            el('tbody', {}, pairs.map(([n, a, b, d, u]) => el('tr', {}, el('td', { text: n }), el('td', { text: a.toFixed(d)+u }), el('td', { text: b.toFixed(d)+u }))))),
          el('table', { style: 'margin-top:10px' }, el('thead', {}, el('tr', {}, ['Capture', 'Before', 'After'].map(t => el('th', { text: t })))),
            el('tbody', {}, f.captures.map((c, i) => el('tr', {}, el('td', { text: c.label }), el('td', { text: f.before[i] === null ? 'no depth' : `${f.before[i].toFixed(1)} cm` }),
              el('td', { class: f.after[i] === null || Math.abs(f.after[i]) > 5 ? 'bad' : 'good', text: f.after[i] === null ? 'no depth' : `${f.after[i].toFixed(1)} cm` }))))));
      };
      const fit = el('button', { class: 'primary', text: 'Fit', onclick: () => {
        msg.textContent = 'Fitting…';
        setTimeout(() => {
          lastFit = C.fit(captures.filter(Boolean), base(), eyeOffset());
          msg.textContent = lastFit ? '' : 'Need at least 5 captures at 3 different distances.';
          show();
        }, 30);
      } });
      box.append(el('h2', { text: '3  Fit' }),
        el('p', { text: 'Finds the distance scale/bias and the depth camera position, angle and FOV that best match your tape measurements. Values stay close to their defaults so a few captures cannot produce a wild result.' }),
        el('div', { class: 'dlg-row' }, fit, el('button', { text: 'Next: apply ▸', onclick: () => dlg.go(3) })), msg, out);
      show();
    }

    // ---- 4 Apply
    function renderApply(box) {
      stop();
      const msg = el('div', { class: 'msg' }), f = lastFit;
      const good = f && f.rmsAfter < f.rmsBefore;
      box.append(el('h2', { text: '4  Apply' }),
        el('p', { text: !f ? 'Run the fit first.' : good ? `The fit lowers the average error from ${f.rmsBefore.toFixed(1)} cm to ${f.rmsAfter.toFixed(1)} cm. Applying writes the values into the Depth camera model folder. Press Apply & start experience in the main panel to save them.`
          : 'The fit did not reduce the error, so it will not be applied. Redo the worst captures or check the depth alignment in step 1.' }),
        el('div', { class: 'dlg-row' }, el('button', { class: 'primary', text: 'Apply values', disabled: !good, onclick: () => {
          const v = f.values;
          ctx.apply({ scale: Number(v.scale.toFixed(4)), bias: Number((v.bias*100).toFixed(2)), dx: Number((v.dx*100).toFixed(2)), dy: Number((v.dy*100).toFixed(2)),
            yaw: Number(v.yaw.toFixed(2)), tilt: Number(v.tilt.toFixed(2)), fov: Number(v.fov.toFixed(2)) });
          msg.textContent = 'Applied.'; ctx.status('Depth calibration applied. Apply & start experience to save.');
        } }), el('button', { text: 'Close', onclick: dlg.close })), msg);
    }
  }
  root.DepthCalibrationUI = { open };
})(window);
