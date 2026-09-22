/* Pose-aware iris reconstruction; camera coordinates in metres, angles in degrees. */
(function(root) {
  function basis(pose) {
    const yaw = pose.yaw*Math.PI/180, tilt = pose.tilt*Math.PI/180;
    return {
      forward: [Math.sin(yaw)*Math.cos(tilt), -Math.sin(tilt), Math.cos(yaw)*Math.cos(tilt)],
      right: [-Math.cos(yaw), 0, Math.sin(yaw)],
      up: [Math.sin(yaw)*Math.sin(tilt), Math.cos(tilt), Math.cos(yaw)*Math.sin(tilt)]
    };
  }
  function estimate(sample, reference) {
    if (!sample || !reference || Math.abs(sample.aspect-reference.aspect) > .01) return null;
    const ratio = reference.iris/sample.iris;
    if (!Number.isFinite(ratio) || ratio < .35 || ratio > 3) return null;
    const {pose, eye: anchor} = reference, axes = basis(pose);
    const delta = [anchor.x-pose.x, anchor.y-pose.y, anchor.z-pose.z];
    const dot = axis => delta.reduce((sum,v,i) => sum+v*axis[i],0);
    const depth = dot(axes.forward)*ratio;
    if (depth <= .05) return null;
    const focal = 1/(2*Math.tan(pose.fov*Math.PI/360));
    const horizontal = dot(axes.right)*ratio+(sample.x-reference.x)*depth/focal;
    const vertical = dot(axes.up)*ratio-(sample.y-reference.y)*depth/(focal*sample.aspect);
    const eye = {};
    ['x','y','z'].forEach((key,i) => { eye[key] = pose[key]+axes.forward[i]*depth+axes.right[i]*horizontal+axes.up[i]*vertical; });
    return Object.values(eye).every(Number.isFinite) ? eye : null;
  }
  root.PortraitTracking = { basis, estimate };
})(typeof window === 'undefined' ? globalThis : window);
