/* Physical coordinates in metres: +x right, +y up, +z from seam toward viewer. */
(function (root) {
  const q = Math.SQRT1_2;
  function screens(width, height) {
    return [
      { name: 'left', pa: [-width*q, -height/2, width*q], pb: [0, -height/2, 0], pc: [-width*q, height/2, width*q] },
      { name: 'right', pa: [0, -height/2, 0], pb: [width*q, -height/2, width*q], pc: [0, height/2, 0] }
    ];
  }
  function clampEye(eye) {
    const z = Math.max(.30, Math.min(.60, eye.z));
    // Remain on the inward-facing side of BOTH planes, even while leaning.
    const limit = Math.min(.18, z - .08);
    return { x: Math.max(-limit, Math.min(limit, eye.x)), y: Math.max(-.18, Math.min(.18, eye.y)), z };
  }
  function foreground(width, height, forward) {
    const z = Math.max(.06, Math.min(.16, forward));
    // The 1.8-unit-tall mannequin fits inside a unit bounding sphere. Keep that
    // sphere in front of both panels and fit the full height at the nearest eye.
    const size = Math.min(.095, z*.65, height*.8*(.30-z)/(.30*1.8), width*.22);
    return { z, size };
  }
  // Off-axis projection keeps each physical panel fixed while the eye translates.
  function project(THREE, camera, screen, eye, seamOverlap = 0) {
    const pa = new THREE.Vector3(...screen.pa), pb = new THREE.Vector3(...screen.pb), pc = new THREE.Vector3(...screen.pc);
    const right = pb.clone().sub(pa).normalize();
    const up = pc.clone().sub(pa).normalize();
    const normal = new THREE.Vector3().crossVectors(right, up).normalize();
    const va = pa.sub(eye), vb = pb.sub(eye), vc = pc.sub(eye);
    const distance = -va.dot(normal);
    const near = .005, far = 10;
    camera.position.copy(eye);
    camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
    camera.updateMatrixWorld(true);
    camera.projectionMatrix.makePerspective(right.dot(va)*near/distance, right.dot(vb)*near/distance,
      up.dot(vc)*near/distance, up.dot(va)*near/distance, near, far);
    // Positive overlap pans each panel toward the seam, exposing shared content.
    // Offset only the horizontal center: scale, vertical alignment, and eye stay fixed.
    camera.projectionMatrix.elements[8] += (screen.name === 'left' ? 2 : -2)*seamOverlap;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  root.ConcaveGeometry = { screens, clampEye, foreground, project };
})(typeof window === 'undefined' ? globalThis : window);
