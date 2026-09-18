/* Lightweight, deterministic 3D props, shared by the two monitor views. */
(function (root) {
  function create(THREE) {
    const group = new THREE.Group(); group.name = 'surrounding-props';
    const material = (color, roughness = .65) => new THREE.MeshStandardMaterial({ color, roughness });
    const wood = material(0xc98d55), dark = material(0x253540), metal = material(0x58717b);
    const terracotta = material(0xd37c5b), leaf = material(0x519a70), leafLight = material(0x81b780);
    const cream = material(0xe6d5b2), blue = material(0x6393ba), orange = material(0xe99049);
    const sphere = new THREE.SphereGeometry(1, 16, 12);
    function mesh(parent, geometry, surface, x, y, z) {
      const item = new THREE.Mesh(geometry, surface); item.position.set(x,y,z);
      item.castShadow = true; item.receiveShadow = true; parent.add(item); return item;
    }
    const box = (parent,w,h,d,surface,x,y,z) => mesh(parent,new THREE.BoxGeometry(w,h,d),surface,x,y,z);
    const cylinder = (parent,rt,rb,h,surface,x,y,z) => mesh(parent,new THREE.CylinderGeometry(rt,rb,h,20),surface,x,y,z);
    function prop(name,x,z,angle=0) {
      const item = new THREE.Group(); item.name = name; item.position.set(x,0,z); item.rotation.y = angle;
      group.add(item); return item;
    }
    function plant(name,x,z,scale=1) {
      const item = prop(name,x,z); item.scale.setScalar(scale);
      cylinder(item,.26,.19,.42,terracotta,0,.21,0);
      cylinder(item,.275,.275,.065,terracotta,0,.415,0);
      cylinder(item,.235,.235,.02,dark,0,.443,0);
      cylinder(item,.025,.035,.95,wood,0,.91,0);
      for (let i=0;i<7;i++) {
        const angle = i*2.4, radius = .2+(i%2)*.05;
        const foliage = mesh(item,sphere,i%2 ? leaf : leafLight,
          Math.cos(angle)*radius,.72+i*.115,Math.sin(angle)*radius);
        foliage.scale.set(.12,.33,.07); foliage.rotation.set(.5*Math.sin(angle),angle,.5*Math.cos(angle));
      }
    }
    plant('plant-left',-2.65,-1.8,1.1);
    plant('plant-right',2.7,-1.2,.9);

    for (const side of [-1,1]) {
      const speaker = prop(side<0 ? 'speaker-left' : 'speaker-right',side*1.45,-.8,-side*.16);
      box(speaker,.47,.91,.34,dark,0,.455,0);
      box(speaker,.40,.83,.025,metal,0,.455,.18);
      for (const [y,r] of [[.30,.145],[.68,.075]]) {
        const driver = cylinder(speaker,r,r,.026,dark,0,y,.208); driver.rotation.x = Math.PI/2;
        const rim = mesh(speaker,new THREE.TorusGeometry(r,.012,8,24),cream,0,y,.225);
        rim.castShadow = false;
      }
      box(speaker,.07,.018,.009,leafLight,.12,.09,.204);
    }

    const bench = prop('bench',-1.7,-2.5,.15);
    box(bench,1.65,.12,.52,wood,0,.58,0);
    box(bench,1.65,.32,.08,wood,0,.87,-.23);
    for (const x of [-.64,.64]) for (const z of [-.16,.16]) box(bench,.08,.52,.08,metal,x,.26,z);
    for (const x of [-.64,.64]) box(bench,.055,.3,.055,metal,x,.73,-.23);

    const table = prop('side-table',1.55,-2.05,-.1);
    cylinder(table,.47,.47,.07,wood,0,.68,0);
    cylinder(table,.055,.07,.58,metal,0,.355,0);
    cylinder(table,.28,.30,.065,dark,0,.0325,0);
    box(table,.34,.045,.23,blue,-.1,.737,0);
    const book = box(table,.3,.045,.21,terracotta,-.09,.782,.015); book.rotation.y = .2;
    cylinder(table,.085,.07,.14,cream,.22,.785,.03);
    const handle = mesh(table,new THREE.TorusGeometry(.052,.015,8,16),cream,.305,.80,.03);
    handle.rotation.y = Math.PI/2;

    const lamp = prop('floor-lamp',2.25,-2.65);
    cylinder(lamp,.25,.27,.06,dark,0,.03,0);
    cylinder(lamp,.023,.023,1.95,metal,0,1.025,0);
    cylinder(lamp,.20,.36,.32,cream,0,2.03,0);
    const bulb = material(0xffd28b);
    bulb.emissive = new THREE.Color(0xffba63); bulb.emissiveIntensity = .6;
    const globe = mesh(lamp,sphere,bulb,0,1.88,0); globe.scale.setScalar(.10);

    const crates = prop('stacked-crates',-1.8,.15,-.18);
    for (let i=0;i<2;i++) {
      const y = .19+i*.38;
      box(crates,.56,.36,.48,wood,i*.07,y,0);
      for (const offset of [-.1,.03,.16]) box(crates,.49,.028,.014,dark,i*.07,y+offset,.246);
    }
    const ball = prop('ball',1.5,.50);
    const ballSurface = mesh(ball,sphere,orange,0,.23,0); ballSurface.scale.setScalar(.23);
    for (const angle of [0,Math.PI/2]) {
      const stripe = mesh(ball,new THREE.TorusGeometry(.231,.006,6,32),dark,0,.23,0); stripe.rotation.y = angle;
    }

    const cone = prop('traffic-cone',-2.55,.75);
    box(cone,.36,.045,.36,dark,0,.0225,0);
    cylinder(cone,.035,.14,.40,orange,0,.245,0);
    cylinder(cone,.075,.098,.085,cream,0,.245,0);

    const stool = prop('stool',.65,-2.9);
    cylinder(stool,.27,.27,.08,blue,0,.48,0);
    for (let i=0;i<3;i++) {
      const a=i*Math.PI*2/3; cylinder(stool,.025,.035,.44,wood,Math.cos(a)*.17,.22,Math.sin(a)*.17);
    }
    // Painted floor marking leaves room for the dancer and its contact shadow.
    const mat = prop('dance-mat',0,0);
    const paint = material(0x395665); paint.polygonOffset = true; paint.polygonOffsetFactor = -1; paint.polygonOffsetUnits = -1;
    const rug = mesh(mat,new THREE.PlaneGeometry(2.55,1.8),paint,0,0,0);
    rug.rotation.x = -Math.PI/2; rug.castShadow = false;
    const ring = mesh(mat,new THREE.RingGeometry(.59,.61,64),cream,0,.001,0);
    ring.rotation.x = -Math.PI/2; ring.castShadow = false;

    return {
      group,
      update(layout, groundY) {
        group.position.set(0,groundY,layout.z);
        group.scale.setScalar(layout.size);
      }
    };
  }
  root.ConcaveProps = { create };
})(typeof window === 'undefined' ? globalThis : window);
