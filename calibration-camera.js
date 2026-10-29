/* Second-camera preview; pixel data is unmirrored for calibration and matching. */
(function(root){
  let stream=null,generation=0,currentVideo=null;
  async function list(excludeId){
    const devices=await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d=>d.kind==='videoinput'&&d.deviceId&&d.deviceId!==excludeId)
      .map((d,i)=>({id:d.deviceId,label:d.label||`Camera ${i+1}`}));
  }
  function stop(video=currentVideo){
    generation++;stream?.getTracks().forEach(t=>t.stop());stream=null;
    if(video){video.srcObject=null;video.hidden=true;}currentVideo=null;
  }
  async function preview(deviceId,video){
    stop();if(!deviceId)return;
    const token=generation;
    const next=await navigator.mediaDevices.getUserMedia({video:{deviceId:{exact:deviceId},width:{ideal:1920},height:{ideal:1080}},audio:false});
    if(token!==generation){next.getTracks().forEach(t=>t.stop());return;}
    stream=next;currentVideo=video;video.srcObject=stream;video.hidden=false;await video.play();
  }
  root.CalibrationCamera={list,preview,stop};
})(window);
