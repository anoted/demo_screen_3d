/* Depth calibration (UX 8.4): fit the depth camera model to tape-measured captures. Pure functions. */
(function (root) {
  const D = () => root.DepthSource;
  // Parameters that are fitted, with a prior (default) and how far they are believed to stray.
  const PARAMS = [
    ['scale', 1, .05], ['bias', 0, .03], ['dx', 0, .03], ['dy', 0, .03], ['yaw', 0, 3], ['tilt', 0, 3], ['fov', 58.6, 5]
  ];
  const clampScale = (k, v) => k === 'scale' ? Math.min(1.3, Math.max(.7, v)) : v;

  // Median of many frames/samples -> one capture. samples: [{x,y,iris,aspect}], frames: [{width,height,data,hfov}].
  function summarize(samples, frames) {
    const med = a => { const b = [...a].sort((p, q) => p-q); return b[b.length >> 1]; };
    if (!samples.length || !frames.length) return null;
    const { width, height } = frames[0], data = new Uint16Array(width*height), column = [];
    for (let i = 0; i < data.length; i++) {
      column.length = 0;
      for (const f of frames) if (f.data[i] >= D().MIN_MM && f.data[i] <= D().MAX_MM) column.push(f.data[i]);
      data[i] = column.length*2 >= frames.length ? med(column) : 0;
    }
    return { sample: { x: med(samples.map(s => s.x)), y: med(samples.map(s => s.y)), iris: med(samples.map(s => s.iris)), aspect: samples[0].aspect },
      frame: { width, height, data, hfov: frames[0].hfov } };
  }
  // Predicted eye range (m) for a capture under a model; null if depth cannot be found.
  function predict(capture, model, eyeOffset) {
    const hit = D().locate(capture.frame, capture.sample, model);
    return hit ? hit.range+eyeOffset : null;
  }
  function toModel(values, base) {
    return { ...base, scale: values.scale, bias: values.bias, dx: values.dx, dy: values.dy, yaw: values.yaw, tilt: values.tilt, fov: values.fov };
  }
  // Errors in cm per capture (null = no depth found).
  function errors(captures, model, eyeOffset) {
    return captures.map(c => { const p = predict(c, model, eyeOffset); return p === null ? null : (p-c.range)*100; });
  }
  const rms = list => { const v = list.filter(e => e !== null); return v.length ? Math.sqrt(v.reduce((s, e) => s+e*e, 0)/v.length) : Infinity; };

  function nelderMead(f, x0, scale, iterations = 400) {
    const n = x0.length, pts = [x0.slice()];
    for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += scale[i]; pts.push(p); }
    let vals = pts.map(f);
    for (let it = 0; it < iterations; it++) {
      const order = vals.map((v, i) => i).sort((a, b) => vals[a]-vals[b]);
      const P = order.map(i => pts[i]), V = order.map(i => vals[i]);
      for (let i = 0; i <= n; i++) { pts[i] = P[i]; vals[i] = V[i]; }
      const centroid = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centroid[j] += pts[i][j]/n;
      const along = k => centroid.map((c, j) => c+k*(pts[n][j]-c));
      const r = along(-1), fr = f(r);
      if (fr < vals[0]) { const e = along(-2), fe = f(e); if (fe < fr) { pts[n] = e; vals[n] = fe; } else { pts[n] = r; vals[n] = fr; } }
      else if (fr < vals[n-1]) { pts[n] = r; vals[n] = fr; }
      else {
        const c = along(fr < vals[n] ? -.5 : .5), fc = f(c);
        if (fc < Math.min(fr, vals[n])) { pts[n] = c; vals[n] = fc; }
        else for (let i = 1; i <= n; i++) { pts[i] = pts[i].map((v, j) => pts[0][j]+.5*(v-pts[0][j])); vals[i] = f(pts[i]); }
      }
      if (Math.abs(vals[n]-vals[0]) < 1e-9) break;
    }
    const best = vals.indexOf(Math.min(...vals));
    return { x: pts[best], value: vals[best] };
  }

  // captures: [{ sample, frame, range (m, tape-measured lens-to-eyes) }]; base: current model (metres) ; returns null if too few.
  function fit(captures, base, eyeOffset = .015) {
    const usable = captures.filter(c => c && c.frame && c.range > 0);
    if (usable.length < 5 || new Set(usable.map(c => Math.round(c.range*10))).size < 3) return null;
    const before = errors(usable, base, eyeOffset);
    const priors = PARAMS.map(([, p]) => p), sigmas = PARAMS.map(([, , s]) => s);
    const cost = x => {
      const values = {}; PARAMS.forEach(([k], i) => { values[k] = clampScale(k, x[i]); });
      const e = errors(usable, toModel(values, base), eyeOffset).map(v => v === null ? 30 : v); // a missing reading costs 30 cm
      const data = e.reduce((s, v) => s+v*v, 0), prior = x.reduce((s, v, i) => s+((v-priors[i])/sigmas[i])**2, 0);
      return data+prior;
    };
    const start = PARAMS.map(([k]) => k === 'fov' ? (base.fov || 58.6) : base[k]);
    let best = { x: start, value: cost(start) };
    for (let round = 0; round < 3; round++) {                       // restarts shrink the simplex around the best point
      const next = nelderMead(cost, best.x, sigmas.map(v => v*(round === 0 ? .6 : .2)), 500);
      if (next.value < best.value) best = next;
    }
    const values = {}; PARAMS.forEach(([k], i) => { values[k] = clampScale(k, best.x[i]); });
    const model = toModel(values, base), after = errors(usable, model, eyeOffset);
    return { model, values, before, after, rmsBefore: rms(before), rmsAfter: rms(after), captures: usable };
  }
  root.DepthCalibration = { PARAMS, summarize, predict, errors, rms, fit, nelderMead };
})(typeof window === 'undefined' ? globalThis : window);
