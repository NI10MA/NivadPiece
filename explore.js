(function(){
"use strict";
const THREE = window.THREE;

/* =====================================================================
   EXPLORE CAR MODE
   - free 360° orbit (drag / pinch / wheel) that can never go under the floor
   - clickable parts: hood, trunk, doors, fuel flap, engine, radiator, battery, tires, brake pads
   - light on purpose: no post-processing, only a few tweens + one small light
   ===================================================================== */

/* ---- 1) PART NAMES inside challenger_work.glb ------------------------
   These are the node names found in YOUR file (spaces become "_" after loading,
   dots are removed:  "Object_2400.001"  ->  "Object_2400001").
   If you rename something in Blender, change it here.
   Empty [] = the code tries to guess from the name.                      */
const PART_NAMES = {
  hood:     ['Object_2400001'],
  trunk:    ['Object_2392002'],
  doorL:    ['doorL'],
  doorR:    ['doorR'],
  fuel:     ['Object_2392003'],            // fuel filler flap
  engine:   ['engine'],
  radiator: ['Object_2392001'],
  battery:  ['batry', 'batry001'],
  wheels:   [],                            // found automatically by size
  calipers: [],                            // found automatically ("Calliper_...")
};

const MATCH = {                            // fallback guesses
  hood: /hood|bonnet/i, trunk: /trunk|decklid|tailgate|boot/i, door: /door/i, engine: /engine/i,
  radiator: /radiator/i, battery: /batter|batry/i, wheel: /wheel|tyre|tire/i, caliper: /callip|caliper/i,
};

/* ---- texts on the info card ---- */
const INFO = {
  engine: { sub: 'Engine', title: '6.2L Supercharged HEMI V8',
    rows: [['Power', '807 hp'], ['Torque', '707 lb-ft'], ['Displacement', '6.2 L'], ['Air', 'Supercharged']],
    text: 'The heart of the Super Stock. A supercharger forces extra air into the V8, so every stroke burns more fuel and makes far more power.' },
  radiator: { sub: 'Cooling system', title: 'Radiator',
    rows: [['Job', 'Carries engine heat away'], ['Liquid', 'Coolant (water + antifreeze)'], ['Air', 'Flows in through the grille']],
    text: 'Hot coolant runs through thin metal fins while air rushes past, so the engine stays cool even at full power.' },
  battery: { sub: 'Electrical', title: 'Battery',
    rows: [['Voltage', '12 V'], ['Main job', 'Starts the engine'], ['Also powers', 'Lights & electronics']],
    text: 'It gives the starter motor the big kick needed to crank an 807 hp V8. After that, the alternator keeps it charged.' },
  fuel: { sub: 'Fuel system', title: 'Fuel Tank',
    rows: [['Capacity', '≈ 70 L (18.5 US gal)'], ['Fuel', 'Premium, 91+ octane'], ['Filler', 'Rear left flap']],
    text: 'Behind this little flap sits the filler neck. A supercharged V8 drinks fast, so the tank is big enough for a long drive.' },
  wheel: { sub: 'Wheel assembly', title: 'Tires',
    rows: [['Tires', '315/40R18 drag radials'], ['Wheels', '18 × 11 in'], ['Grip', 'Extra-sticky rubber']],
    text: 'Wide, sticky drag radials put the power on the road. The wheel slides out so you can reach the brake hiding behind it.' },
  brake: { sub: 'Brake system', title: 'Brake Pads & Calipers',
    rows: [['Calipers', 'Brembo 4-piston'], ['Rotors', '14.2 in, vented'], ['Pads', 'High-friction performance']],
    text: 'When you press the pedal, the caliper squeezes the pads against the spinning rotor. Friction turns speed into heat and the car slows down.' },
};

const DEG = Math.PI / 180, MIN_CAM_Y = 0.45, clamp = THREE.MathUtils.clamp;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function createExplore(ctx) {
  const { scene, camera, canvas, carRoot, light, getView, getFinalPose, getFit } = ctx;
  const getMirror = ctx.getMirror || (() => null);
  const stage = document.querySelector('.stage');
  const hotLayer = document.getElementById('exHot');
  const card = document.getElementById('exCard');
  const toast = document.getElementById('exToast');
  const debug = /[?&]debug/.test(location.search);

  /* ---------------------------------------------------------------
     A) find the parts and put each one on a hinge (pivot)
     --------------------------------------------------------------- */
  const partsRoot = new THREE.Group(); scene.add(partsRoot);
  carRoot.updateMatrixWorld(true);
  const bx = new THREE.Box3(), tb = new THREE.Box3();
  function measure(ns) {
    bx.makeEmpty(); ns.forEach(n => { tb.setFromObject(n); bx.union(tb); });
    return { min: bx.min.clone(), max: bx.max.clone(), c: bx.getCenter(V()), s: bx.getSize(V()) };
  }
  const byName = (list) => list.map(n => carRoot.getObjectByName(n)).filter(Boolean);
  function findTop(rx, ok) {
    const out = [];
    (function walk(n) { for (const c of n.children) { if (rx.test(c.name) && (!ok || ok(measure([c]).s))) out.push(c); else walk(c); } })(carRoot);
    return out;
  }
  const biggest = (arr) => arr.sort((a, b) => { const A = measure([a]).s, B = measure([b]).s; return B.x * B.y * B.z - A.x * A.y * A.z; })[0];
  function nodesFor(key, rx, ok, all = false) {
    const f = byName(PART_NAMES[key] || []); if (f.length) return f;
    if (!rx) return []; const t = findTop(rx, ok); return t.length ? (all ? t : [biggest(t)]) : [];
  }

  const defs = [], byId = {};
  function rig(d) {
    const pivot = new THREE.Group();
    pivot.userData.partId = d.id;
    partsRoot.add(pivot);
    pivot.position.copy(d.pivotPos);
    pivot.updateMatrixWorld(true);
    d.nodes.forEach(n => pivot.attach(n));          // keeps every node exactly where it was
    Object.assign(d, { pivot, home: pivot.position.clone(), k: 0, spin: 0, open: false, timer: null,
      anchorLocal: pivot.worldToLocal(d.anchor.clone()) });
    defs.push(d); byId[d.id] = d;
  }

  // hood: hinge on its rear edge
  { const ns = nodesFor('hood', MATCH.hood, s => s.x > .7 && s.z > .6);
    if (ns.length) { const i = measure(ns);
      rig({ id: 'hood', label: 'Hood', nodes: ns, kind: 'hinge', axis: 'x', angle: -58, dur: 1.2, ease: 'back.out(1.3)', fly: 'always',
        pivotPos: V(i.c.x, i.c.y, i.min.z), anchor: V(i.c.x + .5, i.max.y, i.c.z + .35), facing: V(0, 1, 0),
        view: () => ({ theta: 28, phi: 28, r: 5.2, t: V(0, .8, 1.3) }) }); } }

  // trunk: hinge on its front edge
  { const ns = nodesFor('trunk', MATCH.trunk, s => s.x > .7 && s.z > .3);
    if (ns.length) { const i = measure(ns);
      rig({ id: 'trunk', label: 'Trunk', nodes: ns, kind: 'hinge', axis: 'x', angle: 58, dur: 1.2, ease: 'back.out(1.3)', fly: 'always',
        pivotPos: V(i.c.x, i.c.y, i.max.z), anchor: V(i.c.x, i.max.y, i.c.z), facing: V(0, 1, 0),
        view: () => ({ theta: 158, phi: 26, r: 5.2, t: V(0, .8, -1.6) }) }); } }

  // doors: +X side = car's LEFT, -X side = RIGHT (decided by position, not by name)
  { const named = [...(PART_NAMES.doorL || []), ...(PART_NAMES.doorR || [])];
    const doors = named.length ? byName(named) : findTop(MATCH.door, s => s.z > .8 && s.y > .45 && s.x < .6);
    for (const n of doors) { const i = measure([n]); if (Math.abs(i.c.x) < .15) continue;
      const left = i.c.x > 0, sd = left ? 1 : -1, id = left ? 'doorL' : 'doorR'; if (byId[id]) continue;
      rig({ id, label: left ? 'Left door' : 'Right door', nodes: [n], kind: 'hinge', axis: 'y', angle: left ? -64 : 64, dur: 1, ease: 'back.out(1.2)', fly: 'always',
        pivotPos: V(i.c.x, i.c.y, i.max.z), anchor: V(left ? i.max.x : i.min.x, i.c.y + .1, i.c.z), facing: V(sd, 0, 0),
        view: () => ({ theta: left ? 70 : 290, phi: 26, r: 3.6, t: V(0, .85, i.c.z) }) }); } }

  // fuel flap (small door on the rear quarter) + tank info
  { const ns = nodesFor('fuel', null);
    if (ns.length) { const i = measure(ns), sd = i.c.x >= 0 ? 1 : -1;
      rig({ id: 'fuel', label: 'Fuel tank', nodes: ns, kind: 'hinge', axis: 'y', angle: sd > 0 ? -85 : 85, dur: .7, ease: 'back.out(1.8)', fly: 'always', info: 'fuel',
        pivotPos: V(i.c.x, i.c.y, i.max.z), anchor: V(sd > 0 ? i.max.x : i.min.x, i.c.y, i.c.z), facing: V(sd, 0, 0),
        view: () => ({ theta: sd > 0 ? 122 : 238, phi: 10, r: 2.7, t: i.c.clone() }) }); } }

  // engine bay parts: come out of the car (hood opens first)
  for (const [id, label, rx, outFn, theta] of [
    ['engine',   'Engine',   MATCH.engine,   () => V(0, 1.25, 1.45), 30],
    ['radiator', 'Radiator', MATCH.radiator, () => V(0, .25, 1.9),   22],
    ['battery',  'Battery',  MATCH.battery,  (i) => V((i.c.x >= 0 ? 1 : -1) * 1.6, 1.0, .9), 322],
  ]) {
    const ns = nodesFor(id, rx, null, id === 'battery'); if (!ns.length) continue;
    const i = measure(ns), out = outFn(i), big = Math.max(i.s.x, i.s.y, i.s.z);
    rig({ id, label, nodes: ns, kind: 'move', out, requires: 'hood', needsHood: true, spinOn: true, dur: 1.4, ease: 'power3.inOut', fly: 'always', info: id,
      pivotPos: i.c.clone(), anchor: V(i.c.x, i.max.y, i.c.z), facing: V(0, 1, 0),
      view: () => ({ theta, phi: 20, r: clamp(big * 3.2, 3, 6), t: i.c.clone().add(out) }) });
  }

  // wheels (tire) slide out, then the brake (caliper + pads) can be pulled out too
  const wheelNodes = (PART_NAMES.wheels || []).length ? byName(PART_NAMES.wheels)
    : findTop(MATCH.wheel, s => s.y > .45 && s.y < 1.1 && s.z > .45 && s.z < 1.1 && s.x > .12 && s.x < .65);
  for (const n of wheelNodes) { const i = measure([n]), sd = i.c.x >= 0 ? 1 : -1, front = i.c.z > 0;
    rig({ id: 'wheel' + (front ? 'F' : 'R') + (sd > 0 ? 'L' : 'R'), label: 'Tire', nodes: [n], kind: 'move',
      out: V(sd * .7, 0, 0), dur: 1, ease: 'power3.inOut', fly: 'always', info: 'wheel',
      pivotPos: i.c.clone(), anchor: V(sd > 0 ? i.max.x : i.min.x, i.c.y, i.c.z), facing: V(sd, 0, 0),
      view: () => ({ theta: sd > 0 ? (front ? 62 : 118) : (front ? 298 : 242), phi: 8, r: 3, t: i.c.clone().add(V(sd * .35, 0, 0)) }) }); }
  const caliperNodes = (PART_NAMES.calipers || []).length ? byName(PART_NAMES.calipers) : findTop(MATCH.caliper);
  for (const n of caliperNodes) { const i = measure([n]), sd = i.c.x >= 0 ? 1 : -1, front = i.c.z > 0, suf = (front ? 'F' : 'R') + (sd > 0 ? 'L' : 'R');
    if (!byId['wheel' + suf]) continue;
    rig({ id: 'brake' + suf, label: 'Brake pads', nodes: [n], kind: 'move', out: V(sd * .32, 0, 0), requires: 'wheel' + suf, dur: .9, ease: 'power3.inOut',
      fly: 'always', info: 'brake',
      pivotPos: i.c.clone(), anchor: V(sd > 0 ? i.max.x : i.min.x, i.c.y, i.c.z), facing: V(sd, 0, 0),
      // look along the car so you can see the gap between the tire (pushed out) and the brake behind it
      view: () => ({ theta: sd > 0 ? (front ? 24 : 156) : (front ? 336 : 204), phi: 9, r: 3, t: i.c.clone().add(V(sd * .6, 0, 0)) }) }); }

  console.info('[explore] parts found:', defs.map(d => d.id).join(', ') || 'none',
    '\n[explore] not found:', ['hood', 'trunk', 'doorL', 'doorR', 'fuel', 'engine', 'radiator', 'battery'].filter(k => !byId[k]).join(', ') || 'none',
    '\n[explore] tip: add ?debug to the address, then click any part of the car to see its node name.');

  /* ---------------------------------------------------------------
     B) open / close animations
     --------------------------------------------------------------- */
  function apply(d) {
    if (d.kind === 'hinge') d.pivot.rotation[d.axis] = d.angle * DEG * d.k;
    else { d.pivot.position.copy(d.home).addScaledVector(d.out, d.k); d.pivot.rotation.y = d.spin; }
  }
  function run(d, to) {
    gsap.killTweensOf(d);
    gsap.to(d, { k: to ? 1 : 0, duration: to ? d.dur : d.dur * .8, ease: to ? d.ease : 'power2.inOut', onUpdate: () => apply(d) });
    if (!to && d.spinOn) gsap.to(d, { spin: Math.round(d.spin / (2 * Math.PI)) * 2 * Math.PI, duration: d.dur, ease: 'power2.inOut',
      onUpdate: () => apply(d), onComplete: () => { d.spin = 0; apply(d); } });
  }
  const killTimer = (d) => { if (d.timer) { d.timer.kill(); d.timer = null; } };

  function open(d) {
    d.open = true; killTimer(d);
    const dep = d.requires && byId[d.requires];
    const go = () => { run(d, true); if (d.info) { showCard(d); glow(d, true); } if (d.fly === 'always' || facingDot(d) < .3) focus(d); };
    if (dep && !dep.open) { open(dep); d.timer = gsap.delayedCall(dep.id === 'hood' ? .7 : .8, go); } else go();
  }
  function close(d) {
    d.open = false; killTimer(d);
    const kids = defs.filter(x => x.requires === d.id && x.open); kids.forEach(close);   // things that depend on it go back first
    if (kids.length) d.timer = gsap.delayedCall(.9, () => run(d, false)); else run(d, false);
    if (card.owner === d) hideCard();
    if (glowOwner === d) glow(d, false);
  }
  const toggle = (id) => { const d = byId[id]; if (d) (d.open ? close(d) : open(d)); };

  /* soft highlight: ONE small orange light that follows the selected part */
  let glowOwner = null;
  function glow(d, on) {
    if (!light) return;
    gsap.killTweensOf(light);
    if (on) {
      glowOwner = d;
      const v = d.view(), p = v.t.clone();
      light.position.set(p.x, p.y + .7, p.z + .5);
      gsap.to(light, { intensity: 9, duration: .7, ease: 'power2.out' });
    } else { if (glowOwner === d) glowOwner = null; gsap.to(light, { intensity: 0, duration: .5 }); }
  }

  /* info card */
  card.owner = null;
  function showCard(d) {
    const f = INFO[d.info]; card.owner = d;
    card.querySelector('.ex-sub').textContent = f.sub;
    card.querySelector('h3').textContent = f.title;
    card.querySelector('dl').innerHTML = f.rows.map(r => `<div><dt>${r[0]}</dt><dd>${r[1]}</dd></div>`).join('');
    card.querySelector('.ex-text').textContent = f.text;
    card.classList.add('show');
    gsap.fromTo(card.querySelectorAll('h3, dl div, .ex-text'), { x: 26, opacity: 0 },
      { x: 0, opacity: 1, duration: .5, stagger: .06, ease: 'power3.out', overwrite: true });
  }
  function hideCard() { card.classList.remove('show'); card.owner = null; }
  card.querySelector('.ex-x').addEventListener('click', () => { if (card.owner) close(card.owner); else hideCard(); });

  /* ---------------------------------------------------------------
     C) orbit camera (our own tiny OrbitControls)
     --------------------------------------------------------------- */
  const orbit = { theta: 35, phi: 13, r: 9.6, tx: 0, ty: .6, tz: 0, fov: 38, roll: 0, punch: 0 };
  let vTheta = 0, vPhi = 0, flying = false, active = false, interactive = false, shift = 0;

  function setOrbitFrom(pos, target, fov) {
    const d = pos.clone().sub(target), r = d.length();
    Object.assign(orbit, { theta: Math.atan2(d.x, d.z) / DEG, phi: Math.asin(d.y / r) / DEG, r, tx: target.x, ty: target.y, tz: target.z, fov, roll: 0, punch: 0 });
  }
  function calm() { gsap.to(orbit, { roll: 0, punch: 0, duration: .4, ease: 'power2.out', overwrite: 'auto' }); }
  function fly(to, dur = 1.3, onDone) {
    gsap.killTweensOf(orbit); vTheta = vPhi = 0; flying = true;
    const dth = ((to.theta - orbit.theta + 540) % 360) - 180, tilt = (Math.random() < .5 ? -1 : 1) * 2.4;
    gsap.to(orbit, { theta: orbit.theta + dth, phi: to.phi, r: to.r, tx: to.tx, ty: to.ty, tz: to.tz, fov: to.fov ?? orbit.fov,
      duration: dur, ease: 'power3.inOut', onComplete: () => { flying = false; onDone && onDone(); } });
    // cinematic extras: a little dutch tilt + lens "punch" while the camera moves, then settle
    gsap.to(orbit, { roll: tilt, punch: 5, duration: dur * .5, ease: 'sine.out', yoyo: true, repeat: 1 });
  }
  function focus(d) { const v = d.view(); fly({ theta: v.theta, phi: v.phi, r: v.r, tx: v.t.x, ty: v.t.y, tz: v.t.z }, 1.4); }
  const defaultView = () => ({ theta: 35, phi: 13, r: 9.6 * getFit(), tx: 0, ty: .6, tz: 0, fov: 38 });

  function update(dt) {
    if (!flying) { orbit.theta += vTheta; orbit.phi += vPhi; vTheta *= .92; vPhi *= .92; }
    for (const d of defs) if (d.spinOn && d.open && d.k > .95) { d.spin += dt * .7; apply(d); }
  }
  const _s = V();
  function applyCamera() {
    orbit.r = clamp(orbit.r, 1.3, 16);
    const phiMin = Math.asin(clamp((MIN_CAM_Y - orbit.ty) / orbit.r, -1, 1)) / DEG;   // never below the floor
    orbit.phi = clamp(orbit.phi, phiMin, 88);
    const th = orbit.theta * DEG, ph = orbit.phi * DEG, cp = Math.cos(ph);
    camera.position.set(orbit.tx + orbit.r * Math.sin(th) * cp, orbit.ty + orbit.r * Math.sin(ph), orbit.tz + orbit.r * Math.cos(th) * cp);
    camera.lookAt(orbit.tx, orbit.ty, orbit.tz);
    camera.rotateZ(orbit.roll * DEG);
    // when the info card is open (wide screens) slide the picture left so the card never covers the part
    const want = card.classList.contains('show') && camera.aspect > 1.2 ? 1 : 0;
    shift += (want - shift) * .08;
    if (shift > .001) {
      const side = orbit.r * Math.tan(orbit.fov * DEG / 2) * camera.aspect * .32 * shift;
      camera.position.add(_s.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(side));
    }
    camera.fov = orbit.fov + orbit.punch; camera.updateProjectionMatrix();
  }

  /* mouse / touch */
  const ptrs = new Map(); let moved = 0, pinch0 = 0;
  const pdist = () => { const a = [...ptrs.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };
  canvas.addEventListener('pointerdown', (e) => {
    if (!interactive) return;
    canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0; gsap.killTweensOf(orbit); flying = false; vTheta = vPhi = 0; calm();
    if (ptrs.size === 2) pinch0 = pdist();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!interactive || !ptrs.has(e.pointerId)) return;
    const p = ptrs.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 1) { vTheta = -dx * .35; vPhi = dy * .25; orbit.theta += vTheta; orbit.phi += vPhi; moved += Math.abs(dx) + Math.abs(dy); }
    else if (ptrs.size === 2) { const nd = pdist(); if (pinch0) orbit.r *= pinch0 / nd; pinch0 = nd; moved += 99; }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const wasOne = ptrs.size === 1; ptrs.delete(e.pointerId);
    if (interactive && wasOne && moved < 8) tap(e);
  });
  canvas.addEventListener('pointercancel', (e) => ptrs.delete(e.pointerId));
  canvas.addEventListener('wheel', (e) => { if (!interactive) return; e.preventDefault(); orbit.r *= Math.exp(e.deltaY * .0012); }, { passive: false });
  canvas.addEventListener('dblclick', () => { if (interactive) resetAll(); });

  /* click directly on the car */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function tap(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects([carRoot, partsRoot], true).find(h => { const m = h.object.material; return !(m && !Array.isArray(m) && (m.transmission > 0 || (m.transparent && m.opacity < .9))); });
    if (!hit) return;
    if (debug) { const chain = []; for (let o = hit.object; o && chain.length < 5; o = o.parent) chain.push(o.name || '(no name)');
      console.log('[explore] clicked node chain:', chain); toast.textContent = chain.join('  ‹  '); toast.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => toast.classList.remove('show'), 6000); }
    for (let o = hit.object; o; o = o.parent) if (o.userData.partId) { const d = byId[o.userData.partId]; if (shown(d, true)) toggle(d.id); return; }
  }

  /* ---------------------------------------------------------------
     D) glowing dots (hotspots)
     --------------------------------------------------------------- */
  defs.forEach((d, n) => {
    const b = document.createElement('button');
    b.className = 'hot'; b.innerHTML = `<i></i><span>${d.label}</span>`;
    b.addEventListener('click', (e) => { e.stopPropagation(); if (interactive) toggle(d.id); });
    hotLayer.append(b); d.el = b; d.idx = n;
  });
  const _p = V(), _c = V();
  // a part is clickable only after the thing it depends on is open (engine -> hood open, brake -> tire out)
  const shown = (d, ignoreHood) => { const r = d.requires && byId[d.requires]; return !r || ignoreHood || (r.open && r.k > .6); };
  function facingDot(d) { d.pivot.localToWorld(_p.copy(d.anchorLocal)); return d.facing.dot(_c.copy(camera.position).sub(_p).normalize()); }
  function updateHotspots() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const detailOpen = defs.some(x => x.info && x.open);           // a detail card is showing -> calm the other dots
    for (const d of defs) {
      d.pivot.localToWorld(_p.copy(d.anchorLocal));
      const fd = d.facing.dot(_c.copy(camera.position).sub(_p).normalize());
      _p.project(camera);
      const show = interactive && shown(d) && fd > .12 && _p.z < 1;
      d.el.style.opacity = show ? (detailOpen && !d.open ? .35 : 1) : 0; d.el.style.pointerEvents = show ? 'auto' : 'none';
      d.el.classList.toggle('dim', detailOpen && !d.open);
      if (show) d.el.style.transform = `translate(${(_p.x * .5 + .5) * w}px, ${(-_p.y * .5 + .5) * h}px) translate(-50%,-50%)`;
      d.el.classList.toggle('on', d.open);
    }
  }

  /* ---------------------------------------------------------------
     E) enter / exit
     --------------------------------------------------------------- */
  function enter() {
    if (active) return;
    active = true; interactive = true;
    document.documentElement.classList.add('ex-lock'); stage.classList.add('exploring'); canvas.style.touchAction = 'none';
    const mir = getMirror(); if (mir) mir.visible = false;   // the fake reflection can't follow moving parts
    const v = getView(); setOrbitFrom(v.pos, v.target, v.fov);
    fly(defaultView(), 2);
    defs.forEach(d => gsap.fromTo(d.el.firstChild, { scale: 0 }, { scale: 1, duration: .6, delay: 1.1 + d.idx * .06, ease: 'back.out(2.4)', overwrite: true }));
    gsap.fromTo('.ex-btn', { y: -14, opacity: 0 }, { y: 0, opacity: 1, duration: .6, delay: .6, stagger: .1, ease: 'power3.out' });
    gsap.fromTo('.ex-hint', { opacity: 0 }, { opacity: 1, duration: .8, delay: 1.4 });
  }
  function resetAll() { [...defs].reverse().filter(d => d.open).forEach(close); hideCard(); fly(defaultView(), 1.4); }
  function exit({ instant = false } = {}) {
    if (!active) return;
    interactive = false; ptrs.clear(); hideCard(); stage.classList.remove('exploring');
    if (light) gsap.to(light, { intensity: 0, duration: .3 });
    const done = () => { active = false; document.documentElement.classList.remove('ex-lock'); canvas.style.touchAction = ''; const mir = getMirror(); if (mir && !ctx.isDegraded()) mir.visible = true; };
    if (instant) { defs.forEach(d => { killTimer(d); gsap.killTweensOf(d); d.k = 0; d.spin = 0; d.open = false; apply(d); }); gsap.killTweensOf(orbit); orbit.roll = orbit.punch = 0; flying = false; done(); return; }
    [...defs].reverse().filter(d => d.open).forEach(close);
    const f = getFinalPose(), dir = f.pos.clone().sub(f.target), r = dir.length();
    fly({ theta: Math.atan2(dir.x, dir.z) / DEG, phi: Math.asin(dir.y / r) / DEG, r, tx: f.target.x, ty: f.target.y, tz: f.target.z, fov: f.fov }, 1.7, done);
  }
  document.getElementById('exExit').addEventListener('click', () => exit());
  document.getElementById('exReset').addEventListener('click', () => resetAll());
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && interactive) exit(); });

  return { get active() { return active; }, partsRoot, enter, exit, toggle, resetAll, update, applyCamera, updateHotspots, parts: defs.map(d => d.id),
    state: () => defs.map(d => `${d.id}:${d.open ? 'open' : 'closed'}:${d.k.toFixed(2)}`).join(' ') };
}

window.createExplore = createExplore;
})();
