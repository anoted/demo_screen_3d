/* Depth camera client (UX 4.4). Frames come from tools/depth_bridge.py as server-sent events:
   {"w":160,"h":120,"hfov":58.6,"unit":"mm","d":"<base64 little-endian uint16>"}; 0 = no reading. */
(function (root) {
  const MIN_MM = 250, MAX_MM = 3000;

  function decode(base64, width, height) {
    const binary = atob(base64), bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (bytes.length !== width*height*2) return null;
    return new Uint16Array(bytes.buffer);
  }
  function parse(text) {
    let message;
    try { message = JSON.parse(text); } catch { return null; }
    const w = message?.w, h = message?.h;
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 8 || h < 8 || w*h > 1e6 || typeof message.d !== 'string') return null;
    const data = decode(message.d, w, h);
    return data ? { width: w, height: h, data, hfov: Number(message.hfov) || null } : null;
  }
  // Where a colour-image point (normalised, un-mirrored) lands in the depth image,
  // assuming both sensors sit at the same place and face the same way.
  function mapToDepth(sample, rgbFov, depthFov, depthAspect, flip = false) {
    const rgbFocal = 1/(2*Math.tan(rgbFov*Math.PI/360)), depthFocal = 1/(2*Math.tan(depthFov*Math.PI/360));
    const tanH = (sample.x-.5)/rgbFocal, tanV = (.5-sample.y)/(rgbFocal*sample.aspect);
    const u = .5+tanH*depthFocal;
    return { u: flip ? 1-u : u, v: .5-tanV*depthFocal*depthAspect, scale: depthFocal/rgbFocal };
  }
  // Median of the valid pixels inside a circle (radius in image-width units). Metres, or null.
  function depthAt(frame, u, v, radius, minCount = 4) {
    const { width, height, data } = frame, values = [];
    const cx = u*width-.5, cy = v*height-.5, r = Math.max(radius*width, 1.2);
    for (let y = Math.max(0, Math.floor(cy-r)); y <= Math.min(height-1, Math.ceil(cy+r)); y++) {
      for (let x = Math.max(0, Math.floor(cx-r)); x <= Math.min(width-1, Math.ceil(cx+r)); x++) {
        const mm = data[y*width+x];
        if (mm >= MIN_MM && mm <= MAX_MM && Math.hypot(x-cx, y-cy) <= r) values.push(mm);
      }
    }
    if (values.length < minCount) return null;
    values.sort((a, b) => a-b);
    return { depth: values[values.length >> 1]/1000, count: values.length, radius: r/width };
  }
  // Depth in metres at the face for a tracking sample, or null. `iris` sets the patch size (~3 iris diameters).
  function faceDepth(frame, sample, rgbFov, depthFov, flip) {
    if (!frame || !sample) return null;
    const fov = depthFov || frame.hfov || 58.6;
    const map = mapToDepth(sample, rgbFov, fov, frame.width/frame.height, flip);
    if (map.u < 0 || map.u > 1 || map.v < 0 || map.v > 1) return null;
    const hit = depthAt(frame, map.u, map.v, 3*sample.iris*map.scale);
    return hit ? { ...hit, u: map.u, v: map.v } : null;
  }

  // ---- Depth camera model (UX 8.4). Frame of the tracking camera: x right, y up, z forward.
  const DEFAULT_MODEL = { rgbFov: 60, fov: 58.6, flip: false, dx: 0, dy: 0, dz: 0, yaw: 0, tilt: 0, scale: 1, bias: 0 }; // dx.. and bias in metres
  function modelAxes(yaw, tilt) {
    const y = yaw*Math.PI/180, t = tilt*Math.PI/180, sy = Math.sin(y), cy = Math.cos(y), st = Math.sin(t), ct = Math.cos(t);
    return { right: [cy, 0, -sy], up: [sy*st, ct, cy*st], forward: [sy*ct, -st, cy*ct] };
  }
  // Where the iris ray meets the face in the depth image. The point at range t along the ray is moved into
  // the depth camera's frame, projected to a depth pixel and compared with the measured (corrected) depth
  // there. Returns { range, depth, u, v, radius, count } or null. Handles sensor offset and angle at any distance.
  function locate(frame, sample, model = {}) {
    if (!frame || !sample) return null;
    const m = { ...DEFAULT_MODEL, ...model }, fov = m.fov || frame.hfov || 58.6;
    const rgbFocal = 1/(2*Math.tan(m.rgbFov*Math.PI/360)), focal = 1/(2*Math.tan(fov*Math.PI/360)), aspect = frame.width/frame.height;
    const hx = (sample.x-.5)/rgbFocal, hy = (.5-sample.y)/(rgbFocal*sample.aspect), norm = Math.hypot(hx, hy, 1);
    const dir = [hx/norm, hy/norm, 1/norm], axes = modelAxes(m.yaw, m.tilt), radius = 3*sample.iris*focal/rgbFocal;
    const dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2], cam = [m.dx, m.dy, m.dz];
    const at = t => {
      const d = [dir[0]*t-cam[0], dir[1]*t-cam[1], dir[2]*t-cam[2]], zd = dot(d, axes.forward);
      if (zd < .1) return null;
      const u0 = .5+dot(d, axes.right)/zd*focal, u = m.flip ? 1-u0 : u0, v = .5-dot(d, axes.up)/zd*focal*aspect;
      if (u < 0 || u > 1 || v < 0 || v > 1) return null;
      const hit = depthAt(frame, u, v, radius);
      return hit ? { zd, u, v, hit, r: zd-(m.scale*hit.depth+m.bias) } : null;
    };
    const step = .02;
    let prev = null, prevT = 0;
    for (let t = .25; t <= 3.2; t += step) {
      const cur = at(t);
      if (cur && prev && prev.r < 0 && cur.r >= 0) {
        let lo = prevT, hi = t, a = prev, b = cur;
        for (let i = 0; i < 12; i++) {
          const mid = (lo+hi)/2, c = at(mid);
          if (!c) break;
          if (c.r < 0) { lo = mid; a = c; } else { hi = mid; b = c; }
        }
        const pick = Math.abs(a.r) < Math.abs(b.r) ? a : b, range = pick === a ? lo : hi;
        return { range, depth: pick.zd, u: pick.u, v: pick.v, radius: pick.hit.radius, count: pick.hit.count };
      }
      prev = cur; prevT = t;
    }
    return null;
  }

  // Grayscale depth image (near = bright) with an optional marker { u, v, radius } (image fractions).
  function renderDepth(canvas, frame, marker) {
    const ctx = canvas.getContext('2d');
    if (!frame) { ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, 0, canvas.width, canvas.height); return; }
    if (canvas.width !== frame.width || canvas.height !== frame.height) { canvas.width = frame.width; canvas.height = frame.height; }
    const image = ctx.createImageData(frame.width, frame.height);
    for (let i = 0; i < frame.data.length; i++) {
      const mm = frame.data[i], valid = mm >= MIN_MM && mm <= MAX_MM;
      const v = valid ? 255-Math.min(215, (mm-MIN_MM)/(2000-MIN_MM)*215) : 20;
      image.data[i*4] = v; image.data[i*4+1] = valid ? v : 24; image.data[i*4+2] = valid ? v : 34; image.data[i*4+3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    if (marker) {
      const x = marker.u*frame.width, y = marker.v*frame.height, r = marker.radius*frame.width;
      ctx.strokeStyle = '#4cc9f0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.moveTo(x-r-3, y); ctx.lineTo(x+r+3, y); ctx.moveTo(x, y-r-3); ctx.lineTo(x, y+r+3); ctx.stroke();
    }
  }

  // Live connection. status: 'off' | 'connecting' | 'connected' | 'error'.
  class DepthSource {
    constructor() { this.status = 'off'; this.frame = null; this.time = 0; this.fps = 0; this._n = 0; this._t = 0; this.url = ''; }
    connect(url) {
      this.close();
      if (typeof EventSource === 'undefined') { this.status = 'error'; return; }
      this.url = url; this.status = 'connecting';
      try { this.source = new EventSource(url.replace(/\/+$/, '') + '/stream'); } catch { this.status = 'error'; return; }
      this.source.onopen = () => { this.status = 'connected'; };
      this.source.onerror = () => {
        this.frame = null;
        if (this.source?.readyState === 2) {   // closed for good: try again shortly
          this.status = 'error'; clearTimeout(this.retry);
          this.retry = setTimeout(() => { if (this.status === 'error' && this.url) this.connect(this.url); }, 2500);
        } else this.status = 'connecting';
      };
      this.source.onmessage = event => {
        const frame = parse(event.data);
        if (!frame) return;
        const now = performance.now();
        this.frame = frame; this.time = now; this.status = 'connected'; this._n++;
        if (now-this._t >= 1000) { this.fps = this._n*1000/(now-this._t); this._n = 0; this._t = now; }
      };
    }
    close() { clearTimeout(this.retry); this.source?.close(); this.source = null; this.status = 'off'; this.frame = null; }
    // The latest frame if it is fresh (under maxAge ms), else null.
    fresh(maxAge = 300) { return this.frame && performance.now()-this.time < maxAge ? this.frame : null; }
  }
  root.DepthSource = Object.assign(DepthSource, { decode, parse, mapToDepth, depthAt, faceDepth, locate, renderDepth, modelAxes, DEFAULT_MODEL, MIN_MM, MAX_MM });
})(typeof window === 'undefined' ? globalThis : window);
