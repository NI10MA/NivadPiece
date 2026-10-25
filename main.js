(function(){ //یک محدوده مستقل برای کدهای پروژه ایجاد میکند
"use strict";  //فعال کردن حالت سخت گیرانه جاوا برای شناسایی خطاها
const THREE = window.THREE, { GLTFLoader, RoomEnvironment } = THREE, createExplore = window.createExplore;

gsap.registerPlugin(ScrollTrigger); //کنترل انیمیشن هنگام اسکرول

/* =====================================================================
   تنظیمات خودرو,افکت ها و زاویه های دوربین
   ===================================================================== */
const CAR_LENGTH = 5;      
const CAR_YAW = 0;         
const HIDE = [];           
const AUTO_HIDE_FLAT = true; 
const ROOM = 20, ROOM_H = 8; 
const PAINT_COLOR = null; 

const FX = {
  hardwip:true,
  impact:true,
  slash:true,
  letters:true,
  glitch:true,
  streaks:true,
};

const KEYS = [
  { angle: 28,  radius: 9.5,  height: 0.75, lx: 0,    ly: 0.62, lz: 0,     fov: 32, roll: -2, pan: 0   },  // 1 low front 3/4  (intro)
  { angle: 90,  radius: 12,   height: 0.95, lx: 0,    ly: 0.70, lz: 0,     fov: 24, roll: 0,  pan: 1.9 },  // 2 side profile   (specs)
  { angle: 152, radius: 6.2,  height: 0.55, lx: 0,    ly: 0.55, lz: -0.6,  fov: 38, roll: 4,  pan: 0   },  // 3 low rear dutch (taillights)
  { angle: 252, radius: 3.6,  height: 0.50, lx: -0.95,ly: 0.40, lz: -1.55, fov: 30, roll: -2, pan: 0   },  // 4 rear wheel     (grip)
  { angle: 318, radius: 4.6,  height: 1.90, lx: 0,    ly: 1.00, lz: 1.0,   fov: 26, roll: 3,  pan: 0   },  // 5 hood           (breathe)
  { angle: 360, radius: 5.2,  height: 0.55, lx: 0,    ly: 0.60, lz: 0,     fov: 50, roll: 0,  pan: 0   },  // 6 head-on, wide  (launch)
  { angle: 405, radius: 11,   height: 2.40, lx: 0,    ly: 0.70, lz: 0,     fov: 27, roll: 0,  pan: 0   },  // 7 hero pull-back (final)
];
/*----------------------------------------------------------------------*/

/* =====================================================================
   ساخت رندر و تنظیم کیفیت نمایش سه بعدی
   ===================================================================== */
const canvas   = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const isMobile = matchMedia('(max-width: 820px)').matches;
// weak phones / old laptops automatically get a lighter version (and any PC that is too slow is lightened after 3 seconds)
const LOW = isMobile || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1.25 : 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;   // keeps the model's real colours (no orange/grey shift)
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.localClippingEnabled = true;           // used to cut everything below the floor

/*===================================================================
ساخت صحنه و دوربین و نورپردازی
=====================================================================*/
const scene  = new THREE.Scene();     //ایجاد صحنه سه بعدی
scene.background = new THREE.Color(0xdcd8d1);
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 150);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.95;

// lights: all neutral white, so they never tint your model's colour
scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d0c4, 0.55));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(6, 9, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(LOW ? 1024 : 1024, LOW ? 1024 : 1024);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 25 });
sun.shadow.bias = -0.0004;
scene.add(sun);
const rim = new THREE.PointLight(0xffffff, 45, 18, 2); rim.position.set(6, 1.2, -6); scene.add(rim);
const fill = new THREE.PointLight(0xffffff, 40, 20, 2); fill.position.set(-7, 2.6, 5); scene.add(fill);
// small highlight light used by Explore mode (created now, intensity 0, so no shader recompiling later)
const partLight = new THREE.PointLight(0xffffff, 0, 7, 2); scene.add(partLight);

/* =====================================================================
   ساخت بافتها و محیط سه بعدی گاراژ
   ===================================================================== */
const rnd = (s = 1) => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function tex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const ORANGE = '#ff6a13';

function wallBase(g, w, h) {
  const px = w / (ROOM * 2), Y = u => h - u * (h / ROOM_H);
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#f7f4ef'); gr.addColorStop(.6, '#ede9e3'); gr.addColorStop(1, '#d8d3cb');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(0,0,0,.07)';       for (let x = 0; x < w; x += px * 2) g.fillRect(x, 0, 2, h);
  g.fillStyle = 'rgba(255,255,255,.55)'; for (let x = 3; x < w; x += px * 2) g.fillRect(x, 0, 1, h);
  g.fillStyle = ORANGE;   g.fillRect(0, Y(3.15), w, Y(3.0) - Y(3.15));
  g.fillStyle = '#1a1715'; g.fillRect(0, Y(3.0), w, Y(2.93) - Y(3.0));
  g.fillStyle = '#24201d'; g.fillRect(0, Y(.45), w, Y(0) - Y(.45));
  g.fillStyle = ORANGE;   g.fillRect(0, Y(.5), w, Y(.45) - Y(.5));
  // corner shading + top shade
  for (const [x0, x1] of [[0, 3 * px], [w, w - 3 * px]]) {
    const cg = g.createLinearGradient(x0, 0, x1, 0); cg.addColorStop(0, 'rgba(40,30,20,.28)'); cg.addColorStop(1, 'rgba(40,30,20,0)');
    g.fillStyle = cg; g.fillRect(Math.min(x0, x1), 0, 3 * px, h);
  }
  const tg = g.createLinearGradient(0, 0, 0, h * .25); tg.addColorStop(0, 'rgba(40,30,20,.22)'); tg.addColorStop(1, 'rgba(40,30,20,0)');
  g.fillStyle = tg; g.fillRect(0, 0, w, h * .25);
  return { px, Y };
}

const wallTex = {
  back: tex(2048, 410, (g, w, h) => {                      // SINCE 1970 sign + shelving
    const { px, Y } = wallBase(g, w, h), R = rnd(3);
    for (const side of [-1, 1]) for (let r = 0; r < 4; r++) {
      const x0 = w / 2 + side * px * 10.5 - px * 4, y = Y(0.6 + r * 0.8);
      g.fillStyle = '#2a2623'; g.fillRect(x0, y, px * 8, 4);
      for (let k = 0; k < 7; k++) { g.fillStyle = R() > .6 ? ORANGE : ['#8d877e', '#b9b3aa', '#55504a'][k % 3]; g.fillRect(x0 + k * px * 1.12 + 4, y - px * (.38 + R() * .28), px * .9, px * (.38 + R() * .28)); }
    }
    const sx = w / 2 + px * 9.5;
    g.fillStyle = '#1c1917'; g.fillRect(sx - px * 5.5, Y(6.2), px * 11, Y(4.4) - Y(6.2));
    g.strokeStyle = ORANGE; g.lineWidth = 5; g.strokeRect(sx - px * 5.5, Y(6.2), px * 11, Y(4.4) - Y(6.2));
    g.shadowColor = ORANGE; g.shadowBlur = 28; g.fillStyle = ORANGE; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `italic 900 ${px * 1.6}px Impact, "Arial Black", sans-serif`; g.fillText('SINCE 1970', sx, (Y(6.2) + Y(4.4)) / 2 + 4);
    g.shadowBlur = 0; g.fillRect(sx - px * 4, Y(4.25), px * 8, 5);
  }),
  front: tex(2048, 410, (g, w, h) => {                      // roll-up garage door
    const { px, Y } = wallBase(g, w, h);
    const x0 = w / 2 - px * 8, dw = px * 16, y0 = Y(6.0), y1 = Y(0.5);
    g.fillStyle = '#25211e'; g.fillRect(x0 - 10, y0 - 10, dw + 20, y1 - y0 + 10);
    const dg = g.createLinearGradient(0, y0, 0, y1); dg.addColorStop(0, '#fbfaf8'); dg.addColorStop(1, '#cfcac2');
    g.fillStyle = dg; g.fillRect(x0, y0, dw, y1 - y0);
    g.fillStyle = 'rgba(0,0,0,.16)'; for (let y = y0; y < y1; y += px * .35) g.fillRect(x0, y, dw, 2);
    g.fillStyle = '#26323c'; for (let k = 0; k < 8; k++) g.fillRect(x0 + px * .6 + k * px * 1.95, y0 + px * .5, px * 1.55, px * .5);
    g.fillStyle = ORANGE; g.fillRect(x0 - 10, y0 - 22, dw + 20, 12);
    const lg = g.createLinearGradient(0, y1 - px * 1.4, 0, y1); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(255,255,255,.75)');
    g.fillStyle = lg; g.fillRect(x0, y1 - px * 1.4, dw, px * 1.4);
  }),
  left: tex(2048, 410, (g, w, h) => {                       // big daylight windows
    const { px, Y } = wallBase(g, w, h);
    for (let k = 0; k < 6; k++) {
      const cx = w / 2 + (k - 2.5) * px * 5.6, x = cx - px * 1.7, y = Y(6.4), ww = px * 3.4, hh = Y(3.4) - Y(6.4);
      g.fillStyle = '#1f1c1a'; g.fillRect(x - 8, y - 8, ww + 16, hh + 16);
      const wg = g.createLinearGradient(0, y, 0, y + hh); wg.addColorStop(0, '#ffffff'); wg.addColorStop(1, '#e8f1fb');
      g.fillStyle = wg; g.fillRect(x, y, ww, hh);
      g.fillStyle = '#2a2623'; g.fillRect(x + ww / 2 - 3, y, 6, hh); for (let r = 1; r < 3; r++) g.fillRect(x, y + hh * r / 3 - 3, ww, 6);
    }
  }),
  right: tex(2048, 410, (g, w, h) => {                      // tool wall + cabinets
    const { px, Y } = wallBase(g, w, h), R = rnd(11);
    g.fillStyle = '#d3cec6'; g.fillRect(w / 2 - px * 13, Y(6.6), px * 26, Y(3.4) - Y(6.6));
    g.fillStyle = 'rgba(0,0,0,.18)'; for (let x = w / 2 - px * 13 + 8; x < w / 2 + px * 13; x += 14) for (let y = Y(6.6) + 8; y < Y(3.4); y += 14) g.fillRect(x, y, 2, 2);
    for (let k = 0; k < 70; k++) { const x = w / 2 - px * 12.6 + R() * px * 25.2, y = Y(6.4) + R() * (Y(3.6) - Y(6.4)); g.fillStyle = R() > .65 ? ORANGE : '#2a2623'; g.fillRect(x, y, 5 + R() * 6, px * (.35 + R() * .7)); }
    for (let k = 0; k < 9; k++) {
      const x = w / 2 - px * 13 + k * px * 2.9;
      g.fillStyle = k % 3 === 1 ? '#1d1a18' : ORANGE; g.fillRect(x, Y(2.2), px * 2.7, Y(.5) - Y(2.2));
      g.fillStyle = 'rgba(0,0,0,.35)'; for (let r = 1; r < 4; r++) g.fillRect(x, Y(.5) - r * (Y(.5) - Y(2.2)) / 4, px * 2.7, 3);
      g.fillStyle = '#d8d2c8'; for (let r = 0; r < 4; r++) g.fillRect(x + px * .9, Y(.5) - (r + .55) * (Y(.5) - Y(2.2)) / 4, px * .9, 4);
    }
  }),
};

const floorTex = tex(2048, 2048, (g, S) => {
  const R = rnd(5), X = x => (x + ROOM) / (ROOM * 2) * S, ppu = S / (ROOM * 2);
  const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * .72); rg.addColorStop(0, '#5d6066'); rg.addColorStop(1, '#45484d');
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 16000; i++) { g.fillStyle = `rgba(${R() > .5 ? '255,255,255' : '40,32,24'},${.03 + R() * .06})`; g.fillRect(R() * S, R() * S, 1 + R() * 3, 1 + R() * 3); }
  g.fillStyle = 'rgba(0,0,0,.14)'; for (let u = -ROOM; u <= ROOM; u += 5) { g.fillRect(X(u) - 1, 0, 2, S); g.fillRect(0, X(u) - 1, S, 2); }
  // rubber streaks behind the rear wheels
  for (const sx of [-.92, .92]) for (let k = 0; k < 9; k++) { g.strokeStyle = `rgba(24,20,17,${.05 + R() * .07})`; g.lineWidth = ppu * (.12 + R() * .2);
    g.beginPath(); g.moveTo(X(sx + (R() - .5) * .1), X(-2.4)); g.lineTo(X(sx + (R() - .5) * .35), X(-2.4 - 4 - R() * 6)); g.stroke(); }
  // orange bay
  g.fillStyle = 'rgba(0,0,0,.045)'; g.fillRect(X(-3.4), X(-4.2), ppu * 6.8, ppu * 8.4);
  g.strokeStyle = ORANGE; g.lineWidth = ppu * .1; g.strokeRect(X(-3.4), X(-4.2), ppu * 6.8, ppu * 8.4);
  g.lineWidth = ppu * .26; g.lineCap = 'butt';
  for (const [cx, cz, dx, dz] of [[-3.4, -4.2, 1, 1], [3.4, -4.2, -1, 1], [-3.4, 4.2, 1, -1], [3.4, 4.2, -1, -1]]) {
    g.beginPath(); g.moveTo(X(cx + dx * 1.3), X(cz)); g.lineTo(X(cx), X(cz)); g.lineTo(X(cx), X(cz + dz * 1.3)); g.stroke();
  }
  g.lineWidth = ppu * .12; g.setLineDash([ppu * 1.2, ppu * .9]);
  g.beginPath(); g.moveTo(X(0), X(5.2)); g.lineTo(X(0), X(ROOM)); g.moveTo(X(0), X(-5.2)); g.lineTo(X(0), X(-ROOM)); g.stroke(); g.setLineDash([]);
});

function buildGarage() {
  const grp = new THREE.Group();
  const basic = map => new THREE.MeshBasicMaterial({ map, toneMapped: false });
  const wall = (t, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(ROOM * 2, ROOM_H), basic(t)); m.position.set(x, ROOM_H / 2, z); m.rotation.y = ry; grp.add(m); };
  wall(wallTex.back, 0, -ROOM, 0);
  wall(wallTex.front, 0, ROOM, Math.PI);
  wall(wallTex.left, ROOM, 0, -Math.PI / 2);
  wall(wallTex.right, -ROOM, 0, Math.PI / 2);

  // ceiling
  const ceilTex = tex(512, 512, (g, S) => { g.fillStyle = '#efece7'; g.fillRect(0, 0, S, S); g.fillStyle = 'rgba(0,0,0,.06)'; for (let i = 0; i < S; i += 64) { g.fillRect(i, 0, 2, S); g.fillRect(0, i, S, 2); } });
  ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping; ceilTex.repeat.set(10, 10);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM * 2, ROOM * 2), new THREE.MeshBasicMaterial({ map: ceilTex, toneMapped: false }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = ROOM_H; grp.add(ceil);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x2b2724 }), lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), orMat = new THREE.MeshBasicMaterial({ color: 0xff6a13, toneMapped: false });
  for (let z = -16; z <= 16; z += 8) { const b = new THREE.Mesh(new THREE.BoxGeometry(ROOM * 2, .35, .5), beamMat); b.position.set(0, ROOM_H - .18, z); grp.add(b); }
  for (const x of [-12, -6, 0, 6, 12]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(.45, .08, 34), lightMat); s.position.set(x, ROOM_H - .42, 0); grp.add(s);
    const o = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, 34), orMat); o.position.set(x + .5, ROOM_H - .42, 0); grp.add(o);
  }
  for (const s of [-1, 1]) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(ROOM * 2, .07, .07), orMat); a.position.set(0, 7.2, s * (ROOM - .05)); grp.add(a);
    const b = new THREE.Mesh(new THREE.BoxGeometry(.07, .07, ROOM * 2), orMat); b.position.set(s * (ROOM - .05), 7.2, 0); grp.add(b);
  }

  // floor (semi-transparent so the mirrored car shows through as a reflection)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM * 2, ROOM * 2),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: .4, metalness: 0, transparent: true, opacity: 1, envMapIntensity: .5 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; grp.add(floor);

  // props: tire stacks + toolbox
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: .85 });
  const tire = new THREE.TorusGeometry(.42, .17, 14, 28);
  for (const [x, z, n] of [[-15, -16.5, 5], [-13.6, -16.8, 3], [15, 16.5, 4], [-16.5, 12, 4], [16.5, -10, 3]]) for (let i = 0; i < n; i++) {
    const t = new THREE.Mesh(tire, tireMat); t.rotation.x = Math.PI / 2; t.position.set(x + (i % 2) * .03, .17 + i * .34, z); t.castShadow = false; grp.add(t);
  }
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, .8), new THREE.MeshStandardMaterial({ color: 0xff6a13, roughness: .5, metalness: .2 }));
  box.position.set(13.5, .55, -17.8); grp.add(box);
  return grp;
}
scene.add(buildGarage());

/*======================================================================
ایجاد سایه محو زیر خودرو
========================================================================*/
const blobCanvas = document.createElement('canvas'); blobCanvas.width = blobCanvas.height = 256;
const bctx = blobCanvas.getContext('2d'), bg = bctx.createRadialGradient(128, 128, 0, 128, 128, 128);
bg.addColorStop(0, 'rgba(0,0,0,.6)'); bg.addColorStop(1, 'rgba(0,0,0,0)'); bctx.fillStyle = bg; bctx.fillRect(0, 0, 256, 256);
const blob = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 3.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(blobCanvas), transparent: true, depthWrite: false }));
blob.rotation.x = -Math.PI / 2; blob.position.y = 0.012; scene.add(blob);

/* =====================================================================
   آماده سازی ابزار های بارگذاری و مدل خودرو
   ===================================================================== */
let explore = null;
const loaderEl = document.getElementById('loader');
let mirror = null, degraded = LOW;
const keepAbove = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.01);   // y >= 0.01  (nothing under the floor)
const keepBelow = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);      // mirror copy: y <= 0
const withClip = (mat, plane) => { const arr = Array.isArray(mat) ? mat : [mat]; arr.forEach(m => { m.clippingPlanes = [plane]; m.clipShadows = true; }); return mat; };
const cloneMat = m => Array.isArray(m) ? m.map(x => x.clone()) : m.clone();

/*====================================================================
ترکیب مش های ثابت برای کاهش تعداد عملیات رسم
======================================================================*/
function mergeStaticMeshes(root) {
  const { mergeGeometries } = window.__BGU;
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map(), old = [];
  root.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || (o.morphTargetInfluences && o.morphTargetInfluences.length) || Array.isArray(o.material)) return;
    const g = o.geometry, sig = o.material.uuid + '|' + Object.keys(g.attributes).sort().join(',') + '|' + (g.index ? 'i' : 'n');
    if (!groups.has(sig)) groups.set(sig, { material: o.material, geos: [] });
    const c = g.clone(), mtx = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    c.applyMatrix4(mtx);
    if (mtx.determinant() < 0 && c.index) { const ix = c.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; } c.index.needsUpdate = true; }
    groups.get(sig).geos.push(c); old.push(o);
  });
  old.forEach(o => o.parent && o.parent.remove(o));
  for (const { material, geos } of groups.values()) {
    const merged = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
    if (merged) root.add(new THREE.Mesh(merged, material));
  }
}
let carReady = false;

/*==================================================================
تبدیل داده های متنی مدل خودرو به داده های قابل بارگذاری
====================================================================*/
function decodeModel() {
  const parts = window.CAR_GLB, sizes = parts.map(p => p.length * 3 / 4);
  const total = Math.floor(sizes.reduce((a, b) => a + b, 0)), out = new Uint8Array(total + 8);
  let pos = 0;
  for (const p of parts) { const bin = atob(p); for (let i = 0; i < bin.length; i++) out[pos++] = bin.charCodeAt(i); }
  return out.buffer.slice(0, pos);
}
new GLTFLoader().parse(decodeModel(), '', (gltf) => {
  const car = gltf.scene, carRoot = new THREE.Group();
  carRoot.add(car);

  // 1) manual + automatic removal of junk pieces (before measuring)
  const trash = [];
  car.updateMatrixWorld(true);
  const full = new THREE.Box3().setFromObject(car), fs = full.getSize(new THREE.Vector3());
  const Lh = Math.max(fs.x, fs.z);
  car.traverse(o => {
    if (HIDE.includes(o.name)) { trash.push(o); return; }
    if (AUTO_HIDE_FLAT && o.isMesh) {
      const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3());
      if (s.y < 0.03 * fs.y && b.max.y < full.min.y + 0.2 * fs.y && Math.max(s.x, s.z) > 0.6 * Lh) { trash.push(o); console.info('[garage] auto-hidden flat piece:', o.name || '(unnamed)'); }
    }
  });
  trash.forEach(o => o.parent && o.parent.remove(o));

  // 2) make the length run along Z, scale, centre, sit on the floor
  let box = new THREE.Box3().setFromObject(car), size = box.getSize(new THREE.Vector3());
  if (size.x > size.z) { car.rotation.y = Math.PI / 2; car.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(car); size = box.getSize(new THREE.Vector3()); }
  car.scale.setScalar(CAR_LENGTH / size.z);
  car.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(car);
  const ctr = box.getCenter(new THREE.Vector3());
  car.position.set(-ctr.x, -box.min.y, -ctr.z);
  carRoot.rotation.y = THREE.MathUtils.degToRad(CAR_YAW);

    // body paint: the colour swatches in Explore mode change this material
  let paintMat = null;
  car.traverse(o => { if (o.isMesh && !paintMat && /Paint_Material/i.test(o.material.name || '')) paintMat = o.material; });
  if (paintMat) {
    paintMat.envMap = scene.environment;   // needed so the next line works on this material only
    paintMat.envMapIntensity = 0.3;        // less white reflection = deeper colour
    paintMat.roughness = 0.2;
    paintMat.clearcoat = 0.8;
    paintMat.clearcoatRoughness = 0.1;
    const swatches = document.querySelectorAll('.ex-color');
    swatches.forEach(btn => btn.addEventListener('click', () => {
      paintMat.color.set(btn.dataset.color);
      swatches.forEach(b => b.classList.toggle('on', b === btn));
    }));
  }
  
  car.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; withClip(o.material, keepAbove); } });
  scene.add(carRoot);

  // 3) Explore Car mode: finds the parts (hood, doors, engine...) and puts them on hinges
  explore = createExplore({
    scene, camera, canvas, carRoot, light: partLight,
    getFit: () => fit, getMirror: () => mirror, isDegraded: () => degraded,
    getView: () => ({ pos: camera.position.clone(), target: tgt.clone(), fov: camera.fov }),
    getFinalPose: () => { const k = KEYS[KEYS.length - 1], a = THREE.MathUtils.degToRad(k.angle), r = k.radius * fit;
      return { pos: new THREE.Vector3(k.lx + Math.sin(a) * r, Math.max(k.height, 0.4), k.lz + Math.cos(a) * r), target: new THREE.Vector3(k.lx, k.ly, k.lz), fov: k.fov }; },
  });
  window.explore = explore;

  // 4) speed: glue the ~600 loose meshes of the body into a few big ones (the parts above stay separate)
  mergeStaticMeshes(car);
  car.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // 5) mirrored copy below the floor (cut at y = 0)
  if (false) {
    const cache = new Map(), mat = (m0) => { if (!cache.has(m0.uuid)) cache.set(m0.uuid, withClip(m0.clone(), keepBelow)); return cache.get(m0.uuid); };
    mirror = new THREE.Group();
    mirror.add(carRoot.clone(true), explore.partsRoot.clone(true));
    mirror.scale.y = -1;
    mirror.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.material = Array.isArray(o.material) ? o.material.map(mat) : mat(o.material); } });
    scene.add(mirror);
  }

  carReady = true;
  loaderEl.classList.add('done');
  gsap.from('.slide:first-of-type .c', { yPercent: 130, xPercent: -30, skewX: -28, opacity: 0, duration: .7, stagger: .045, ease: 'expo.out', delay: .15 });
  gsap.from('.slide:first-of-type .w', { yPercent: 115, duration: .9, stagger: .06, ease: 'power3.out', delay: .9 });
}, (err) => { console.error('GLB failed to load:', err); loaderEl.classList.add('done'); });

/* =====================================================================
   تقسیم نوشته ها به کلمات و حروف برای انیمیش
   ===================================================================== */
function splitWords(el) {
  Array.from(el.childNodes).forEach(n => {
    if (n.nodeType === 3) {
      const frag = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach(t => {
        if (!t) return;
        if (/^\s+$/.test(t)) { frag.append(' '); return; }
        const m = document.createElement('span'); m.className = 'mask';
        const w = document.createElement('span'); w.className = 'w'; w.textContent = t;
        m.append(w); frag.append(m);
      });
      n.replaceWith(frag);
    } else if (n.nodeType === 1) splitWords(n);
  });
}
document.querySelectorAll('.quote').forEach(splitWords);
// big titles: split into letters for the "slam" entrance
document.querySelectorAll('.word').forEach(el => {
  const txt = el.textContent; el.textContent = '';
  for (const ch of txt) {
    if (ch === ' ') { el.append(' '); continue; }
    const mk = document.createElement('span'); mk.className = 'cmask';
    const c = document.createElement('span'); c.className = 'c'; c.textContent = ch; mk.append(c); el.append(mk);
  }
});

/* =====================================================================
          SCROLL TIMELINE  
   ===================================================================== */
const cam = { ...KEYS[0] };
let velTarget = 0, vel = 0, kick = 0;
//کنترل نمایش دوربین,اسلایدها و مشخصات خودرو هنگام اسکرول
const tl = gsap.timeline({
  defaults: { ease: 'none' },
  scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom bottom', scrub: 1, onUpdate: (self) => { velTarget = self.getVelocity(); } }
});
//دوربین
KEYS.slice(1).forEach((k,i)=>{
  tl.to(cam,{...k,buration:.9, ease:'sine.in0ut'},i+ .15);
});

// slides
const slides = gsap.utils.toArray('.slide');
slides.forEach((el, i) => {
  const parts = el.querySelectorAll('.word, .info, .specs, .hud');
  if (i > 0) {
    tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: .22, ease: 'power2.out' }, i - .35);
    tl.fromTo(parts, { y: 50 }, { y: 0, duration: .35, ease: 'power3.out' }, i - .35);
    tl.fromTo(el.querySelectorAll('.w'), { yPercent: 115 }, { yPercent: 0, duration: .3, stagger: .025, ease: 'power3.out' }, i - .3);
    tl.fromTo(el.querySelectorAll('.c'), { yPercent: 130, xPercent: -30, skewX: -28, opacity: 0 }, { yPercent: 0, xPercent: 0, skewX: 0, opacity: 1, duration: .26, stagger: .02, ease: 'expo.out' }, i - .33);
  }
  if (i < slides.length - 1) {
    tl.to(el, { autoAlpha: 0, duration: .22, ease: 'power2.in' }, i + .16);
    tl.to(parts, { y: -40, duration: .3, ease: 'power2.in' }, i + .13);
  }
});

// spec counters (scene 2)
document.querySelectorAll('[data-count]').forEach((el) => {
  const o = { v: 0 }, target = +el.dataset.count, dec = +(el.dataset.dec || 0);
  tl.fromTo(o, { v: 0 }, { v: target, duration: .45, ease: 'power2.out', onUpdate: () => { el.textContent = o.v.toFixed(dec); } }, .55);
});

// launch HUD (scene 6): speed + rpm bar + speed lines
const rpm = document.getElementById('hudRpm');
for (let i = 0; i < 24; i++) { const s = document.createElement('i'); rpm.append(s); }
const rpmBars = Array.from(rpm.children), hudSpeed = document.getElementById('hudSpeed');
const sp = { v: 0 };
tl.to('.bar-bottom .hint', { autoAlpha: 0, duration: .2 }, 0);
tl.to('.progress span', { scaleY: 1, duration: KEYS.length - 1 }, 0);

/* =====================================================================
   NAVBAR (always on top,کتنرل نوبار و دکمه اکسپلور
   ===================================================================== */
const nav = document.getElementById('nav');
addEventListener('scroll', () => nav.classList.toggle('solid', scrollY > 10), { passive: true });

const links = Array.from(document.querySelectorAll('[data-target]'));
links.forEach(a => a.addEventListener('click', (e) => {
  e.preventDefault();
  if (explore && explore.active) explore.exit({ instant: true });   // leave Explore mode first
  const id = a.dataset.target, el = document.getElementById(id);
  window.scrollTo({ top: id === 'hero' ? 0 : el.offsetTop, behavior: 'smooth' });
}));
['hero', 'about', 'timeline', 'contact'].forEach(id => ScrollTrigger.create({
  trigger: '#' + id, start: 'top 55%', end: 'bottom 55%',
  onToggle: (s) => { if (s.isActive) document.querySelectorAll('.nav nav a').forEach(a => a.classList.toggle('active', a.dataset.target === id)); }
}));

document.getElementById('exploreBtn').addEventListener('click', () => { if (explore) explore.enter(); });
//انیمیشن تایم لاین
// reveals (inside the timeline they also fade out again when you scroll back up)
gsap.utils.toArray('.reveal').forEach(el => gsap.from(el, { y: 60, opacity: 0, duration: 1, ease: 'power3.out',
  scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: el.closest('.timeline') ? 'play none none reverse' : 'play none none none' } }));

// timeline: wrap the year text in a span so it can animate on its own
document.querySelectorAll('.tl-item time').forEach(t => {
  const s = document.createElement('span');
  s.className = 'tl-year';
  s.textContent = t.firstChild.textContent.trim();
  t.firstChild.replaceWith(s);
});

// timeline: year -> car -> text, and it plays backwards when you scroll up
gsap.utils.toArray('.tl-item').forEach((el) => {
  const tlBox = document.querySelector('.tl'), carEl = el.querySelector('.tl-car');
  const side = carEl.getBoundingClientRect().left + carEl.offsetWidth / 2 < tlBox.getBoundingClientRect().left + tlBox.offsetWidth / 2 ? -80 : 80;
  gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 82%', toggleActions: 'play none none reverse' } })
    .from(el.querySelector('.tl-year'), { y: 50, opacity: 0, duration: .7, ease: 'power3.out' })
    .from(el.querySelector('.tl-car'),  { x: side, opacity: 0, duration: .8, ease: 'power3.out' }, '-=.2')
    .from(el.querySelector(':scope > div'), { y: 40, opacity: 0, duration: .7, ease: 'power3.out' }, '-=.5');
});

gsap.to('#tlFill', { scaleY: 1, ease: 'none', scrollTrigger: { trigger: '.tl', start: 'top 60%', end: 'bottom 60%', scrub: true } });

// Let's talk: حرف‌ها یکی‌یکی از پایین بالا میان، بعد horsepower سفید می‌شه
document.querySelectorAll('.talk .ln').forEach(function split(node) {
  [...node.childNodes].forEach(n => {
    if (n.nodeType === 3) {
      const frag = document.createDocumentFragment();
      [...n.textContent].forEach(t => {
        const s = document.createElement('span');
        s.className = 'ch';
        s.textContent = t === ' ' ? '\u00a0' : t;
        frag.append(s);
      });
      n.replaceWith(frag);
    } else split(n);
  });
});

gsap.timeline({ scrollTrigger: { trigger: '.talk', start: 'top 80%' } })
  .from('.talk .ch', { yPercent: 110, rotate: 8, skewX: -20, opacity: 0, duration: .9, stagger: .04, ease: 'expo.out' })
  .to('.talk em .ch', { color: '#fff', duration: .4, stagger: .05, ease: 'none' }, '-=.3');
/* =====================================================================
   RENDER LOOP: cinematic camera (orbit + dutch roll + lens + handheld shake)
   ===================================================================== */
let fit = 1, panScale = 1;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  fit = camera.aspect < 0.8 ? 1.65 : camera.aspect < 1.2 ? 1.25 : 1;
  panScale = camera.aspect < 1.2 ? 0 : 1;
}
addEventListener('resize', resize); resize();

const tmpR = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), tgt = new THREE.Vector3(), pos = new THREE.Vector3();
const clock = new THREE.Clock();
let lastT = 0, fpsFrames = 0, fpsStart = 0;
function checkFps(now) {
  if (degraded || !carReady) return;
  if (++fpsFrames === 60) fpsStart = now;              // skip the first 60 frames (shaders compiling)
  if (fpsFrames === 180) {
    const fps = 120 / ((now - fpsStart) / 1000);
    if (fps < 40) {                                    // weak system: make the scene lighter
      degraded = true; renderer.setPixelRatio(1); resize();
      if (mirror) mirror.visible = false;
      sun.castShadow = false;
    }
  }
}
const stageEl = document.querySelector('.stage'), streaksEl = document.getElementById('streaks');
let lastG = -1;
renderer.setAnimationLoop((now) => {
  checkFps(now);
  if (!(explore && explore.active) && scrollY > document.getElementById('hero').offsetHeight)return;
  const t = clock.getElapsedTime(), dt = Math.min(t - lastT, 0.1); lastT = t;

  // EXPLORE MODE: the visitor controls the camera
  if (explore && explore.active) {
    explore.update(dt);
    explore.applyCamera();
    explore.updateHotspots();
    renderer.render(scene, camera);
    return;
  }

  velTarget *= 0.9; vel += (velTarget - vel) * 0.12;
  const speed = Math.min(Math.abs(vel) / 1800, 1);                       // 0..1 how fast the user scrolls

  const a = THREE.MathUtils.degToRad(cam.angle * .5); // slow idle drift
  const r = cam.radius * fit;
  tgt.set(cam.lx, cam.ly, cam.lz);
  pos.set(cam.lx + Math.sin(a) * r, Math.max(cam.height, 0.4), cam.lz + Math.cos(a) * r);   // never lower than the car's underside

  // pan sideways (keeps the camera angle, moves the car across the frame)
  tmpR.copy(tgt).sub(pos).normalize().cross(UP).normalize().multiplyScalar(cam.pan * panScale);
  tgt.add(tmpR); pos.add(tmpR);

  // IMPACT: every time the camera lands on a new scene it "hits" -> shake + lens punch + RGB-split on the title
  kick *= 0.9;
  const sh = 0;
  pos.x += Math.sin(t * 9.1) * sh; pos.y += Math.sin(t * 11.3 + 1) * sh * .6; pos.z += Math.cos(t * 8.2) * sh;

  camera.position.copy(pos);
  camera.lookAt(tgt);
  camera.rotateZ(THREE.MathUtils.degToRad(cam.roll));
  camera.fov = cam.fov;                           // lens "punch" when scrolling fast / landing
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
});

})();
