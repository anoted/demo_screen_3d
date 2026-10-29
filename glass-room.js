/* World-space room continuation, with a per-eye frosted background pass. */
(function (root) {
  function create(THREE) {
    const target = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    target.texture.encoding = THREE.sRGBEncoding;
    const material = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: { map: {value: target.texture}, pixel: {value: new THREE.Vector2(1, 1)}, frost: {value: .45} },
      vertexShader: 'varying vec2 uv0; void main(){uv0=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
      fragmentShader: `uniform sampler2D map; uniform vec2 pixel; uniform float frost; varying vec2 uv0;
        void main(){
          vec2 d=pixel*frost*22.0;
          vec3 c=texture2D(map,uv0).rgb*.2;
          for(int i=0;i<12;i++){
            float a=float(i)*6.2831853/12.0;
            vec2 p=vec2(cos(a),sin(a))*d;
            c+=texture2D(map,clamp(uv0+p,vec2(0.001),vec2(.999))).rgb*.05;
            c+=texture2D(map,clamp(uv0+p*.45,vec2(0.001),vec2(.999))).rgb/60.0;
          }
          float sheen=pow(max(0.0,1.0-abs(uv0.x*.4+uv0.y-.72)*2.0),5.0);
          c=mix(c,vec3(.91,.95,.96),frost*(.025+.035*sheen));
          gl_FragColor=vec4(c,1.0);
        }`
    });
    const post = new THREE.Scene(); post.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    const camera = new THREE.Camera();
    let image = null, texture = null, photo = null, revision = 0;
    const materials = {
      wall: new THREE.MeshStandardMaterial({color: 0xe8e9e5, roughness: .96}),
      board: new THREE.MeshStandardMaterial({color: 0xf4f5ef, roughness: .32}),
      metal: new THREE.MeshStandardMaterial({color: 0xb6bdbb, roughness: .48, metalness: .35}),
      desk: new THREE.MeshStandardMaterial({color: 0xe6e4df, roughness: .9}),
      floor: new THREE.MeshStandardMaterial({color: 0x898b87, roughness: 1}),
      glow: new THREE.MeshBasicMaterial({color: 0xfafaff})
    };
    function build(group, profile, bounds) {
      if(photo && profile.roomBackdrop === 'reconstructed' && !texture) return buildPhotoRoom(group, profile, bounds);
      const g=profile.glass, w=g.width/100, h=g.boardHeight/100, z=-g.depth/100, floor=-profile.screen.height/200-.12;
      materials.wall.color.setHex(Math.round(g[profile.lighting+'Color']));
      const box=(name,size,position,mat)=>{
        const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);
        mesh.name=name; mesh.position.set(...position); mesh.receiveShadow=true; group.add(mesh); return mesh;
      };
      Object.assign(bounds,{left:-w/2,right:w/2,back:z-.08,front:1.2,floor,ceiling:1.6});
      box('continuation-wall',[w,3,.04],[0,.5,z-.06],materials.wall);
      box('whiteboard',[w*.86,h,.025],[0,.14,z],materials.board);
      for(const sign of [-1,1]){
        box('whiteboard-frame',[.016,h+.025,.035],[sign*w*.43,.14,z+.01],materials.metal);
        box('whiteboard-frame',[w*.86,.016,.035],[0,.14+sign*h/2,z+.01],materials.metal);
        box('room-side',[.04,3,2.8],[sign*w/2,.5,z+1.3],materials.wall);
      }
      box('whiteboard-tray',[w*.83,.012,.06],[0,.14-h/2-.018,z+.025],materials.metal);
      box('desk-surface',[w,.035,1.3],[0,floor,z+.55],materials.desk);
      box('room-floor',[w,.04,3],[0,floor-.7,z+1.3],materials.floor);
      box('room-ceiling',[w,.04,3],[0,1.6,z+1.3],materials.wall);
      if(profile.lighting==='white') box('overhead-light',[w*.5,.012,.22],[0,1.56,z+.65],materials.glow);
      if(texture){
        const m=new THREE.MeshBasicMaterial({map:texture});
        const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w*.85,h*.97),m);
        mesh.name='clean-background-image'; mesh.position.set(0,.14,z+.014); mesh.userData.disposeMaterial=true; group.add(mesh);
      }
    }
    // Measured room behind the glass (tools/build_glass_room.py). The frame's
    // z axis is the wall normal: glass.depth is the wall's distance behind the
    // seam and glass.yaw its turn from the screen pair's bisector. Photo
    // surfaces are unlit, so the daylight photograph keeps its own shading.
    function photoGain(profile){
      const g=profile.glass, key=profile.lighting, fields=root.RoomProfile.FIELDS.glass;
      const tint=Math.round(g[key+'Color']), base=fields[key+'Color'][0], exposure=g[key+'Exposure']/fields[key+'Exposure'][0];
      const channel=shift=>Math.min(1.25,((tint>>shift)&255)/Math.max(1,(base>>shift)&255));
      const cool=key==='white'?[1.03,1.05,1.08]:[1,1,1];
      return new THREE.Color(channel(16)*exposure*cool[0],channel(8)*exposure*cool[1],channel(0)*exposure*cool[2]);
    }
    function buildPhotoRoom(group, profile, bounds){
      const {layout, maps}=photo, g=profile.glass, cm=v=>v/100, gain=photoGain(profile);
      const yaw=g.yaw*Math.PI/180, depth=cm(g.depth);
      const frame=new THREE.Group(); frame.name='room-frame';
      frame.rotation.y=yaw; frame.position.set(-depth*Math.sin(yaw),0,-depth*Math.cos(yaw)); group.add(frame);
      const material=(source)=>{
        const m=typeof source==='number'?new THREE.MeshBasicMaterial({color:source}):new THREE.MeshBasicMaterial({map:maps[source]});
        if(typeof source==='number')m.color.multiply(gain);else m.color.copy(gain);
        return m;
      };
      const span=([a,b])=>[cm(b-a),cm(a+b)/2];
      const add=(name,mesh,[x,y,z])=>{mesh.name=name;mesh.position.set(x,y,z);mesh.userData.disposeMaterial=true;frame.add(mesh);return mesh;};
      // Box faces: +x, -x, +y, -y, +z (front, toward the viewer), -z.
      const box=(name,{x,y,z},faces)=>{
        const [w,cx]=span(x),[h,cy]=span(y),[d,cz]=span(z);
        return add(name,new THREE.Mesh(new THREE.BoxGeometry(w,h,d),faces.map(material)),[cx,cy,cz]);
      };
      const wall=layout.wall, [ww,wx]=span(wall.x), [wh,wy]=span(wall.y);
      add('room-wall',new THREE.Mesh(new THREE.PlaneGeometry(ww,wh),material('wall')),[wx,wy,0]);
      const desk=add('room-desk',new THREE.Mesh(new THREE.PlaneGeometry(ww,cm(layout.deskDepth)),material('desk')),[wx,cm(layout.deskY),cm(layout.deskDepth)/2]);
      desk.rotation.x=-Math.PI/2;
      box('room-desk-edge',{x:wall.x,y:[layout.deskY-3,layout.deskY-.05],z:[layout.deskDepth-1,layout.deskDepth]},Array(6).fill(0xc9c8c3));
      const dark=0x1c1d1f;
      box('room-tower',layout.tower,[dark,'tower-side',0x232427,dark,'tower-front',dark]);
      // A measured left-monitor board (screen calibration) sets the panel depth.
      const monitor={...layout.monitor}, board=profile.calibration?.leftMonitor?.centerCm;
      if(board){
        const front=Math.sin(yaw)*board[0]+Math.cos(yaw)*board[2]+g.depth;
        if(front>5&&front<70)monitor.z=[front-(monitor.z[1]-monitor.z[0]),front];
      }
      const grey=0x2b2d30, silver=0xb9bcbd;
      box('room-monitor',monitor,[grey,grey,grey,grey,'monitor-front',grey]);
      box('room-monitor-stand',layout.stand,[silver,silver,silver,silver,'monitor-stand',silver]);
      box('room-monitor-base',layout.standBase,Array(6).fill(silver));
      // World-space extent for the debug mini-view (seam frame, metres).
      const corners=[[wall.x[0],0],[wall.x[1],0],[wall.x[0],layout.deskDepth],[wall.x[1],layout.deskDepth]]
        .map(([x,z])=>new THREE.Vector3(cm(x),0,cm(z)).applyMatrix4(frame.matrix.compose(frame.position,frame.quaternion,frame.scale)));
      Object.assign(bounds,{left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),
        back:Math.min(...corners.slice(0,2).map(p=>p.z)),front:1.2,floor:cm(layout.deskY),ceiling:cm(wall.y[1])});
    }
    async function loadImage(file){
      if(!file){ image=null; texture?.dispose(); texture=null; revision++; return; }
      if(file.size>20*1024*1024) throw Error('Choose a background image under 20 MB.');
      const bitmap=await createImageBitmap(file);
      const c=document.createElement('canvas'), scale=Math.min(1,2048/Math.max(bitmap.width,bitmap.height));
      c.width=Math.round(bitmap.width*scale); c.height=Math.round(bitmap.height*scale);
      c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height); bitmap.close();
      image=c; texture?.dispose(); texture=new THREE.CanvasTexture(image); texture.encoding=THREE.sRGBEncoding; revision++;
    }
    async function loadReconstruction(base='assets/room/glass/'){
      const layout=await (await fetch(base+'layout.json')).json(), loader=new THREE.TextureLoader(), maps={};
      await Promise.all(['wall','desk','tower-front','tower-side','monitor-front','monitor-stand'].map(name=>new Promise((resolve,reject)=>
        loader.load(`${base}${name}.jpg`,map=>{map.encoding=THREE.sRGBEncoding;map.anisotropy=8;maps[name]=map;resolve();},undefined,reject))));
      photo={layout,maps};revision++;
    }
    function render(renderer,scene,eyeCamera,room,person,x,width,height,frost){
      const ratio=Math.min(renderer.getPixelRatio(),1), rw=Math.max(1,Math.round(width*ratio)), rh=Math.max(1,Math.round(height*ratio));
      if(target.width!==rw||target.height!==rh) target.setSize(rw,rh);
      const background=scene.background, visible=person.visible, auto=renderer.autoClear;
      person.visible=false;
      // Render-target rectangles are physical pixels. Renderer.setViewport()
      // multiplies by the display DPR, which would crop this pass at OS scaling >100%.
      target.viewport.set(0,0,rw,rh); target.scissor.set(0,0,rw,rh); target.scissorTest=true;
      renderer.setRenderTarget(target);
      renderer.render(scene,eyeCamera);
      renderer.setRenderTarget(null); renderer.setViewport(x,0,width,height); renderer.setScissor(x,0,width,height);
      material.uniforms.pixel.value.set(1/rw,1/rh); material.uniforms.frost.value=frost/100;
      renderer.render(post,camera);
      renderer.autoClear=false; room.visible=false; person.visible=visible; scene.background=null;
      renderer.render(scene,eyeCamera);
      renderer.autoClear=auto; room.visible=true; scene.background=background;
    }
    return {build,render,loadImage,loadReconstruction,get revision(){return revision;}};
  }
  // Robust neutral colour from the camera border, never the central monitor area.
  function sampleSurroundings(canvas){
    const c=document.createElement('canvas'); c.width=160;c.height=100;
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0,160,100);
    const data=ctx.getImageData(0,0,160,100).data, pixels=[];
    for(let y=0;y<100;y++) for(let x=0;x<160;x++){
      if(x>28&&x<132&&y>18&&y<82)continue;
      const i=(y*160+x)*4,r=data[i],g=data[i+1],b=data[i+2],max=Math.max(r,g,b),min=Math.min(r,g,b);
      if(min>60&&max<250&&max-min<55)pixels.push([r,g,b]);
    }
    if(pixels.length<100)throw Error('Too few neutral surroundings are visible. Include more of the desk or wall around the screens.');
    const median=k=>pixels.map(p=>p[k]).sort((a,b)=>a-b)[Math.floor(pixels.length/2)];
    const rgb=[0,1,2].map(median), luminance=(rgb[0]+rgb[1]+rgb[2])/3;
    // Preserve hue separately from scene exposure; avoid applying brightness twice.
    const normalized=rgb.map(v=>Math.min(255,Math.round(v*230/luminance)));
    return {color:(normalized[0]<<16)|(normalized[1]<<8)|normalized[2],exposure:Math.max(30,Math.min(180,Math.round(luminance/210*100)))};
  }
  root.GlassRoom={create,sampleSurroundings};
})(typeof window==='undefined'?globalThis:window);
