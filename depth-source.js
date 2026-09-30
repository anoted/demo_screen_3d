/* Depth camera client (UX 4.4). Frames come from tools/depth_bridge.py as server-sent events:
   {"w":160,"h":120,"hfov":58.4,"unit":"mm","d":"<base64 little-endian uint16>"}; 0 = no reading. */
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
    const fov = depthFov || frame.hfov || 58;
    const map = mapToDepth(sample, rgbFov, fov, frame.width/frame.height, flip);
    if (map.u < 0 || map.u > 1 || map.v < 0 || map.v > 1) return null;
    const hit = depthAt(frame, map.u, map.v, 3*sample.iris*map.scale);
    return hit ? { ...hit, u: map.u, v: map.v } : null;
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
      this.source.onerror = () => { this.status = this.source?.readyState === 2 ? 'error' : 'connecting'; this.frame = null; };
      this.source.onmessage = event => {
        const frame = parse(event.data);
        if (!frame) return;
        const now = performance.now();
        this.frame = frame; this.time = now; this.status = 'connected'; this._n++;
        if (now-this._t >= 1000) { this.fps = this._n*1000/(now-this._t); this._n = 0; this._t = now; }
      };
    }
    close() { this.source?.close(); this.source = null; this.status = 'off'; this.frame = null; }
    // The latest frame if it is fresh (under maxAge ms), else null.
    fresh(maxAge = 300) { return this.frame && performance.now()-this.time < maxAge ? this.frame : null; }
  }
  root.DepthSource = Object.assign(DepthSource, { decode, parse, mapToDepth, depthAt, faceDepth, MIN_MM, MAX_MM });
})(typeof window === 'undefined' ? globalThis : window);
