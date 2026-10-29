/* Browser camera capture and review. OpenCV work stays on the local app server. */
(function(root){
  function init({profile, applyResult, onMatch, trackingVideo, canTrack}){
    const $=id=>document.getElementById(id), message=s=>{$('calib-status').textContent=s;$('calib-target-status').textContent=s;};
    let frames=[],shared=[],result=null,busy=false,signature='',patternKey='',generation=0,automatic=false;
    const screen=()=>({...profile.screen});
    const key=()=>JSON.stringify([profile.screen,profile.calibrationDeviceId,profile.trackingDeviceId,profile.detector]);
    const hide=()=>{automatic=false;$('screen-targets').hidden=true;document.body.classList.remove('calibration-targets');};
    const lens=()=>result?.intrinsics||(profile.calibration?.deviceId===profile.calibrationDeviceId?profile.calibration.intrinsics:null);
    const installed=()=>{
      if(result)return result.installedPosition?result:null;
      if(frames.length)return null;
      return profile.calibration?.deviceId===profile.calibrationDeviceId&&profile.calibration.installedPosition?profile.calibration:null;
    };
    function targetBrightness(){
      const value=Number($('calib-brightness').value);
      $('calib-brightness-value').value=`${value}%`;
      $('screen-targets').style.setProperty('--target-brightness',value/100);
    }
    $('calib-brightness').oninput=targetBrightness;targetBrightness();
    function counts(){
      $('calib-count').textContent=`${frames.length} / 8 screen views · ${shared.length} / 8 shared-board views · ${frames.filter(f=>f.monitor).length} left-monitor reference views`;
      $('calib-solve').disabled=busy||frames.length<8;
      $('calib-solve-tracking').disabled=busy||shared.length<8||!result;
      $('calib-copy').disabled=busy||!result;
      $('calib-position').disabled=busy||!lens();
      $('calib-monitor').disabled=busy||!installed();
      $('calib-auto').disabled=busy;
      $('calib-capture').disabled=busy;
    }
    function reset(){generation++;hide();frames=[];shared=[];result=null;patternKey='';signature=key();counts();$('calib-results').tBodies[0].replaceChildren();}
    function invalidate(){if(signature!==key()){reset();message('Setup changed. Start a fresh capture set.');}}
    async function api(action,body){
      const response=await fetch(`/calibration/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
      let data;try{data=await response.json();}catch{throw Error('Calibration helper unavailable. Start bash tools/run_glass.sh and reload.');}
      if(!response.ok)throw Error(data.error||'Calibration failed.');return data;
    }
    async function run(task){
      if(busy)return;invalidate();busy=true;counts();
      try{await task();}catch(error){hide();message(error.message);}finally{busy=false;counts();}
    }
    function layout(){
      const s=profile.screen, left=Math.round(innerWidth*s.seamSplit/100), scale=devicePixelRatio;
      if(!$('calib-fill-confirm').checked)throw Error('First confirm that the window fills both active displays and the seam is aligned.');
      if(Math.abs(left*scale-s.pixelWidth)>3||Math.abs((innerWidth-left)*scale-s.pixelWidth)>3||Math.abs(innerHeight*scale-s.pixelHeight)>3)
        throw Error(`Window is ${Math.round(innerWidth*scale)} × ${Math.round(innerHeight*scale)} device pixels; expected ${2*s.pixelWidth} × ${s.pixelHeight}. Span the two portrait screens, remove browser bars and check resolution/zoom.`);
      return left;
    }
    async function show(){
      const left=layout(), current=key(), token=generation;
      if(patternKey!==current){
        const [l,r]=await Promise.all(['left','right'].map(side=>api('pattern',{screen:screen(),side})));
        if(token!==generation||current!==key())throw Error('Setup changed while patterns were generated. Try again.');
        $('target-left').src=l.image;$('target-right').src=r.image;
        await Promise.all([$('target-left').decode(),$('target-right').decode()]);patternKey=current;
      }
      $('target-left').style.width=`${left}px`;$('target-right').style.width=`${innerWidth-left}px`;
      $('screen-targets').hidden=false;document.body.classList.add('calibration-targets');
    }
    function snapshot(video){
      if(!video||video.readyState<2||!video.videoWidth||video.paused)throw Error('Start a live camera preview first.');
      const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
      canvas.getContext('2d').drawImage(video,0,0);return canvas;
    }
    function duplicate(frame,collection,isShared){
      const side=isShared?'tracking':'left';
      return collection.some(old=>{
        const a=old[side],b=frame[side],errors=[];
        b.ids.forEach((id,i)=>{const j=a.ids.indexOf(id);if(j>=0)errors.push(Math.hypot(b.corners[i][0]-a.corners[j][0],b.corners[i][1]-a.corners[j][1]));});
        return errors.length>=8&&errors.reduce((a,b)=>a+b,0)/errors.length<12;
      });
    }
    async function captureFrame(isShared,keepVisible=false){
      await show();
      await new Promise(resolve=>setTimeout(resolve,2000));
      if($('screen-targets').hidden)throw Error('Capture cancelled.');
      layout();const token=generation,current=key();
      const image=snapshot($('calib-video')).toDataURL('image/jpeg',.95);
      const trackingImage=isShared?snapshot(trackingVideo()).toDataURL('image/jpeg',.95):null;
      if(!keepVisible)hide();message('Finding ChArUco corners…');
      const frame=await api('detect',{screen:screen(),image,trackingImage});
      if(token!==generation||current!==key()||(keepVisible&&!automatic))throw Error('Capture cancelled or setup changed. Frame discarded.');
      return frame;
    }
    async function capture(keepVisible=false){
      const isShared=$('calib-shared').checked, collection=isShared?shared:frames;
      if(collection.length>=30)throw Error('Thirty views collected. Solve or reset.');
      if(isShared&&(!result||!canTrack()))throw Error('Solve screens first and use a live browser tracking camera (not depth-rgb) for shared-board capture.');
      const frame=await captureFrame(isShared,keepVisible);
      if(collection.length&&JSON.stringify(collection[0].size)!==JSON.stringify(frame.size))throw Error('Camera resolution changed. Reset captures.');
      if(duplicate(frame,collection,isShared))throw Error(isShared?'Board pose repeats an earlier view. Move and tilt the printed board.':'View repeats an earlier capture. Move the second camera sideways or change its angle.');
      collection.push(frame);
      if(!isShared){result=null;shared=[];$('calib-results').tBodies[0].replaceChildren();}
      else if(result){result.trackingCamera=null;renderResults();}
      counts();message(`Accepted ${collection.length} ${isShared?'shared-board':'screen'} views. ${collection.length<8?'Shift or tilt slightly, then hold still.':'Ready to solve.'} ${keepVisible?'Escape stops.':''}`);
    }
    function renderResults(){
      const rows=[['Inside angle',result.screen.angle,'°'],['Gap',result.screen.gap,'cm'],['Vertical offset',result.screen.vOffset,'cm'],['Screen fit RMS',result.rms,'px']];
      if(result.trackingCamera)for(const [k,v] of Object.entries(result.trackingCamera))rows.push([`Tracking ${k}`,v,['yaw','tilt','fov'].includes(k)?'°':'cm']);
      else rows.push(['Tracking camera','Manual values retained','']);
      const pos=result.calibrationCamera.matrix.map(r=>r[3]);
      rows.push(['Second camera x / y / z',pos.slice(0,3).map(v=>(v*100).toFixed(1)).join(' / '),'cm']);
      if(result.leftMonitor){
        rows.push(['Left monitor board x / y / z',result.leftMonitor.centerCm.map(v=>v.toFixed(1)).join(' / '),'cm']);
        rows.push(['Left monitor board fit',result.leftMonitor.rms,'px']);
      }else rows.push(['Left monitor reference','Not measured; estimated room depth retained','']);
      const tbody=$('calib-results').tBodies[0];tbody.replaceChildren();
      for(const [label,value,unit] of rows){const tr=tbody.insertRow();tr.insertCell().textContent=label;tr.insertCell().textContent=`${typeof value==='number'?value.toFixed(2):value} ${unit}`;}
    }
    $('show-screen-targets').onclick=()=>run(show);
    $('calib-align').onclick=()=>run(async()=>{
      hide();await document.documentElement.requestFullscreen();
      // Let Chrome hide its bars before the window manager extends fullscreen.
      await new Promise(resolve=>setTimeout(resolve,750));
      await api('span',{});
      message('Both portrait displays aligned. Confirm the active areas and seam, then capture.');
    });
    $('calib-capture').onclick=()=>run(capture);
    $('calib-auto').onclick=()=>run(async()=>{
      const collection=$('calib-shared').checked?shared:frames;
      if($('calib-shared').checked&&(!result||!canTrack()))throw Error('Solve screens first and start the browser tracking camera for shared-board capture.');
      snapshot($('calib-video'));await show();
      automatic=true;message('Automatic capture: shift/tilt slightly, hold still, then repeat. Escape stops.');
      try{
        while(automatic&&collection.length<12){
          try{await capture(true);}catch(error){if(!automatic)break;message(`${error.message} Hold still with both boards visible. Escape stops.`);}
          if(automatic)await new Promise(resolve=>setTimeout(resolve,2000));
        }
      }finally{hide();}
      message(`Automatic capture stopped: ${collection.length} views. ${collection.length>=8?'Solve screens, return the Lenovo to its mount, then capture installed position.':'Collect at least eight varied views before solving.'}`);
    });
    $('calib-reset').onclick=()=>{reset();message('Captures reset. Screen and camera measurements are unchanged.');};
    $('calib-solve').onclick=()=>run(async()=>{
      hide();const token=generation;message('Solving lens and screen geometry…');
      const solved=await api('solve',{screen:screen(),frames});
      if(token!==generation)throw Error('Setup changed while solving. Results discarded.');
      result=solved;renderResults();message(`Lens/screens solved · RMS ${result.rms.toFixed(2)} px. Return the Lenovo to its mount and Capture installed position, then review and Copy to Manual.`);
    });
    $('calib-position').onclick=()=>run(async()=>{
      const reference=lens();if(!reference)throw Error('Calibrate the lens from varied views first.');
      const token=generation,frame=await captureFrame(false);
      const solved=await api('position',{screen:screen(),frame,reference});
      if(token!==generation)throw Error('Setup changed while solving. Results discarded.');
      result=solved;shared=[];renderResults();message(`Installed position measured · RMS ${result.rms.toFixed(2)} px. Review and Copy to Manual → Apply to save the lens and measurements.`);
    });
    $('calib-monitor').onclick=()=>run(async()=>{
      const reference=installed();if(!reference)throw Error('Capture installed position first and keep the Lenovo fixed.');
      hide();message('Keep the Lenovo fixed. Waiting for paper-board exposure…');
      const token=generation;await new Promise(resolve=>setTimeout(resolve,2000));
      const image=snapshot($('calib-video')).toDataURL('image/jpeg',.95);
      const measured=await api('monitor',{screen:screen(),image,reference});
      if(token!==generation)throw Error('Setup changed while measuring. Results discarded.');
      if(!result)result={screen:{angle:profile.screen.angle,gap:profile.screen.gap,vOffset:profile.screen.vOffset},
        intrinsics:reference.intrinsics,calibrationCamera:reference.calibrationCamera,rms:reference.rms,
        trackingCamera:null,installedPosition:true};
      result.leftMonitor=measured.leftMonitor;renderResults();
      message(`Left monitor board measured · RMS ${result.leftMonitor.rms.toFixed(2)} px. Review and Copy to Manual → Apply to save its depth.`);
    });
    $('calib-solve-tracking').onclick=()=>run(async()=>{
      const token=generation;message('Solving tracking camera…');
      const solved=await api('tracking',{screen:screen(),frames:shared,reference:result.intrinsics});
      if(token!==generation)throw Error('Setup changed while solving. Results discarded.');
      result.trackingCamera=solved.trackingCamera;renderResults();message(`Tracking camera solved · RMS ${solved.rms.toFixed(2)} px. Review before copying.`);
    });
    $('calib-copy').onclick=()=>{invalidate();if(!result)return;hide();applyResult(result);reset();message('Copied to Manual. Review measurements, then Apply to save.');};
    $('download-shared-board').onclick=()=>run(async()=>{
      const p=await api('pattern',{screen:screen(),side:'shared'}),a=document.createElement('a');a.href=p.image;a.download='charuco-shared-169.8x229.8mm-squares30mm.png';a.click();
      message('Print at 169.8 × 229.8 mm; measure a square to confirm exactly 30 mm.');
    });
    $('match-surroundings').onclick=()=>run(async()=>{
      if(!$('screen-targets').hidden)throw Error('Hide screen targets before matching the surroundings.');
      const frame=snapshot($('calib-video')),url=frame.toDataURL('image/jpeg',.92);
      $('room-capture').src=url;$('room-capture').hidden=false;$('download-room-capture').href=url;$('download-room-capture').hidden=false;
      const match=GlassRoom.sampleSurroundings(frame);
      onMatch(match);message(`Matched ${profile.lighting==='white'?'overhead white':'daylight'} surroundings. Inspect the reference and tune on Home; Apply saves the match.`);
    });
    addEventListener('keydown',event=>{
      if($('screen-targets').hidden&&!automatic)return;
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();hide();}
      else if(event.code==='Space'){event.preventDefault();event.stopImmediatePropagation();run(capture);}
    },true);
    addEventListener('resize',()=>{if(!$('screen-targets').hidden)hide();patternKey='';$('calib-fill-confirm').checked=false;});
    document.querySelectorAll('[data-group="screen"]').forEach(el=>el.addEventListener('input',()=>{invalidate();$('calib-fill-confirm').checked=false;}));
    signature=key();counts();
    return {hide,invalidate,reset,get result(){return result;}};
  }
  root.ScreenCalibrationUI={init};
})(window);
