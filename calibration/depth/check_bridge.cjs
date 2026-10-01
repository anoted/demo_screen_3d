// Reads 40 frames from the running depth bridge and prints fps, size, valid % and centre depth.
require(require('path').join(__dirname, '..', '..', 'depth-source.js'));
const D=globalThis.DepthSource;
fetch('http://localhost:8765/stream').then(async r=>{
  const rd=r.body.getReader(); let buf='',n=0; const t0=Date.now();
  while(n<40){const {value}=await rd.read(); buf+=new TextDecoder().decode(value);
    let i; while((i=buf.indexOf('\n\n'))>=0){const m=buf.slice(0,i); buf=buf.slice(i+2); if(m.startsWith('data: ')){n++; if(n==40){const f=D.parse(m.slice(6)); let v=0,mn=1e9,mx=0; for(const x of f.data){if(x){v++;mn=Math.min(mn,x);mx=Math.max(mx,x);}} console.log('fps',(40000/(Date.now()-t0)).toFixed(1),f.width+'x'+f.height,'hfov',f.hfov.toFixed(1),'valid%',(100*v/f.data.length).toFixed(0),'range',mn,mx,'centre',D.depthAt(f,.5,.5,.05));}}}}
  process.exit(0)});
