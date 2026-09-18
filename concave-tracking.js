/* Calibrated monocular tracking. Distances are metres; landmark z is NOT metric depth. */
(function (root) {
  const q = Math.SQRT1_2;
  function sample(landmarks, aspect) {
    if (!landmarks || landmarks.length < 478 || !(aspect > 0)) return null;
    const valid = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1;
    const indices = [468,469,470,471,472,473,474,475,476,477,159,145,386,374];
    if (!indices.every(i => valid(landmarks[i]))) return null;
    // Express both axes in image-width units (pixels are square).
    const length = (a,b) => Math.hypot(landmarks[a].x-landmarks[b].x, (landmarks[a].y-landmarks[b].y)/aspect);
    const a = Math.max(length(469,471), length(470,472));
    const b = Math.max(length(474,476), length(475,477));
    // Reject tiny/occluded irises, blinks, and strongly inconsistent eye estimates.
    if (Math.min(a,b) < .003 || Math.max(a,b) > .15 || Math.max(a,b)/Math.min(a,b) > 1.6) return null;
    if (length(159,145) < a*.35 || length(386,374) < b*.35) return null;
    return { x: (landmarks[468].x+landmarks[473].x)/2,
      y: (landmarks[468].y+landmarks[473].y)/2, iris: (a+b)/2, aspect };
  }
  function calibrate(samples, setup) {
    if (samples.length < 12) return null;
    const median = key => { const values = samples.map(s => s[key]).sort((a,b) => a-b); return values[Math.floor(values.length/2)]; };
    const iris = median('iris');
    if (samples.some(s => Math.abs(s.iris/iris-1) > .12)) return null;
    return { x: median('x'), y: median('y'), iris, aspect: median('aspect'), ...setup };
  }
  function estimate(sample, reference) {
    if (!sample || !reference || Math.abs(sample.aspect-reference.aspect) > .01) return null;
    const ratio = reference.iris/sample.iris;
    if (!Number.isFinite(ratio) || ratio < .35 || ratio > 3) return null;
    // Camera is at the left-panel center, facing along its inward normal (+x,+z).
    // Its unmirrored image-right axis points toward (-x,+z), not world +x.
    const cx = -reference.width*q/2, cz = reference.width*q/2;
    const depth0 = reference.distance*q;
    const depth = depth0*ratio;
    const focal = 1/(2*Math.tan(reference.fov*Math.PI/360));
    const horizontal0 = reference.distance*q-reference.width/2;
    const horizontal = horizontal0*ratio + (sample.x-reference.x)*depth/focal;
    const vertical = -reference.cameraHeight*ratio - (sample.y-reference.y)*depth/(focal*sample.aspect);
    const eye = { x: cx+q*(depth-horizontal), y: reference.cameraHeight+vertical, z: cz+q*(depth+horizontal) };
    if (!Object.values(eye).every(Number.isFinite)) return null;
    return { eye, cameraRange: Math.hypot(horizontal, vertical, depth), cameraDepth: depth };
  }
  root.ConcaveTracking = { sample, calibrate, estimate };
})(typeof window === 'undefined' ? globalThis : window);
