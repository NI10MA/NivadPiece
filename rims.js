/* =====================================================================
   RIMS: ساخت هندسه رینگها,پره ها و توپیها,پیدا کردن رینگهی اصلی مدل
   اعمال طرح های مختلف و تغییر رنگ رینگها
   ===================================================================== */
window.createRims = function (partsRoot, { envMap = null } = {}) {
  const THREE = window.THREE, BGU = window.__BGU;

  /* ---- اندازه ها (a wheel 0.359 high is the reference, everything is scaled from it) ---- */
  const REF_R = 0.359;     // شعاع تایر که اعداد زیر برای ان ساخته شده اند
  const FACE_Z = 0.125;    // فاصله پره ها از یکدیگر(z = outside of the car)

  /* ---- materials: رنگ رینگ ها که یک ماده مشترک دارند ---- */
  const rimMat = new THREE.MeshStandardMaterial({ color: '#c9ccd1', metalness: .8, roughness: .28, envMap, envMapIntensity: 1.2, side: THREE.DoubleSide });
  const nutMat = new THREE.MeshStandardMaterial({ color: '#d9dadc', metalness: 1, roughness: .2, envMap, envMapIntensity: 1 });
  const capMat = new THREE.MeshStandardMaterial({ color: '#2b2d31', metalness: .6, roughness: .35, envMap, envMapIntensity: 1 });

  /* ---- کمک کننده های هندسه (همه چیز با محور چرخ Z= ساخته شده است) ---- */
  const flat = g => (g.index ? g.toNonIndexed() : g);
  const merge = list => BGU.mergeGeometries(list.map(g => { const f = flat(g); f.deleteAttribute('uv'); return f; }));
/*r0,r1:شعاع شروع و پایان پره
  w0,w1:عرض پره در ابتدا و انتها
  bend:میزان خمیدگی جانبی
  straight:تعیین نحوه خمیدگی در طول پره
  off:جا به جایی جانبی پره
  depth:ضخامت سه بعدی پره
  Z:موقعیت پره در راستای Z*/

  //ساخت هندسه سه بعدی یک پره رینگ
  //تابع زیر شکل 2بعدی یک پره را تعریف میکند
  function spoke({ r0, r1, w0, w1, bend = 0, straight = false, off = 0, depth = .035, z = FACE_Z }) {
    const top = [], bottom = [], N = 10; 
    for (let i = 0; i <= N; i++) { 
      const t = i / N, x = r0 + (r1 - r0) * t, w = w0 + (w1 - w0) * t, c = off + bend * (straight ? t : t * t);
      top.push(new THREE.Vector2(x, c + w / 2));
      bottom.push(new THREE.Vector2(x, c - w / 2));
    }
    const shape = new THREE.Shape([...bottom, ...top.reverse()]);
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: .005, bevelThickness: .006, bevelSegments: 2, curveSegments: 1 });
    g.translate(0, 0, z - depth / 2); //با ExtrudeGeometry به ان پره 2بعدی عمق میدهد تا یک قطعه 3بعدی ایجاد شود 
    return g;
  }

  //نسخه هایی از یک هندسه که با چرخش حول محور چرخ تکثیر شده اند
  function around(geo, n, offset = 0) {
    const out = [];
    for (let i = 0; i < n; i++) { const g = geo.clone(); g.rotateZ(offset + (i * Math.PI * 2) / n); out.push(g); }
    return out;
  }

  // بشکه + مرکز که هر طرحی با آن مشترک است
  function barrel() {
    const pts = [[.246, -.170], [.230, -.176], [.205, -.165], [.199, -.14], [.199, .14], [.205, .165], [.230, .176], [.246, .170]];
    const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), 64);
    g.rotateX(Math.PI / 2);                       // محور دستگاه تراش Y -> محور چرخ Z
    return g;
  }
  function hub() { //توپی مرکزی را میسازد و انرادر جهت مناسب میچرخاندو به موقعیت جلویی رینگ منتقل میکند
    const g = new THREE.CylinderGeometry(.075, .082, .05, 40);
    g.rotateX(Math.PI / 2); g.translate(0, 0, FACE_Z - .01);
    return g;
  }
  function nuts() {  //پنج مهره6ضلعی میسازد و انهارا در اطراف مرکز رینگ قرار میدهد
    const list = []; 
    for (let i = 0; i < 5; i++) {
      const g = new THREE.CylinderGeometry(.013, .013, .016, 6);
      g.rotateX(Math.PI / 2); g.translate(.055, 0, FACE_Z + .028); g.rotateZ((i * Math.PI * 2) / 5);
      list.push(g);
    }
    return merge(list);  //در پایان هندسه مهره ها با مرج ادغام میشوند
  }
  function cap() {  //ساخت اجزای مشترک بین طرح های مختلف رینگ
    const g = new THREE.CylinderGeometry(.03, .03, .012, 32);
    g.rotateX(Math.PI / 2); g.translate(0, 0, FACE_Z + .03);
    return g;
  }

  // ساخت طرح رینگ صفحه ای با هشت سوراخ برای ایجاد ظاهر آیرودینامیکی
  function disc() {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, .2, 0, Math.PI * 2);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8, hole = new THREE.Shape();
      hole.absarc(Math.cos(a) * .13, Math.sin(a) * .13, .032, 0, Math.PI * 2);
      shape.holes.push(hole);
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: .022, bevelEnabled: true, bevelSize: .004, bevelThickness: .005, bevelSegments: 2, curveSegments: 24 });
    g.translate(0, 0, FACE_Z - .011);
    return g;
  }

  /*======تعریف طرح های مختلف رینگ های قابل انتخاب=======*/
  /*ابجکت پایین مجموعه ای از توابع است که هر کدام یک طرح را میسازندکه پارامتر های متفاوتی دارند
  نکته مهم:توابع داخل ابجکت زیر به صورت تنبل اجرا میشوند یعنیتعریف انها به تنهایی هندسه نمیسازد
  هندسه زمانی تولید میشود که طرح برای اولین بار درخواست شود*/
  const DESIGNS = {
    five:    () => merge(around(spoke({ r0: .05, r1: .205, w0: .09, w1: .062 }), 5)),
    ten:     () => merge(around(spoke({ r0: .05, r1: .205, w0: .036, w1: .028 }), 10)),
    mesh:    () => merge([...around(spoke({ r0: .06, r1: .205, w0: .012, w1: .012, bend: .1, straight: true, depth: .02 }), 18),
                          ...around(spoke({ r0: .06, r1: .205, w0: .012, w1: .012, bend: -.1, straight: true, depth: .02, z: FACE_Z + .014 }), 18)]),
    twin:    () => merge([...around(spoke({ r0: .055, r1: .205, w0: .032, w1: .036, bend: .04, straight: true }), 6),
                          ...around(spoke({ r0: .055, r1: .205, w0: .032, w1: .036, bend: -.04, straight: true }), 6)]),
    turbine: () => merge(around(spoke({ r0: .05, r1: .205, w0: .07, w1: .05, bend: .13, depth: .03 }), 11)),
    seven:   () => merge(around(spoke({ r0: .05, r1: .205, w0: .04, w1: .026, bend: .06 }), 7)),
    fork:    () => merge([...around(spoke({ r0: .05, r1: .125, w0: .06, w1: .05 }), 5),
                          ...around(spoke({ r0: .115, r1: .205, w0: .04, w1: .04, bend: .05, straight: true }), 5),
                          ...around(spoke({ r0: .115, r1: .205, w0: .04, w1: .04, bend: -.05, straight: true }), 5)]),
    disc:    () => disc(),
    blade:   () => merge(around(spoke({ r0: .05, r1: .205, w0: .045, w1: .05, bend: .09, straight: true }), 9)),
    ring:    () => merge([...around(spoke({ r0: .05, r1: .205, w0: .03, w1: .026 }), 10),
                          new THREE.TorusGeometry(.14, .01, 10, 60).translate(0, 0, FACE_Z)]),
    double:  () => merge([...around(spoke({ r0: .05, r1: .205, w0: .03, w1: .034, off: .026 }), 5),
                          ...around(spoke({ r0: .05, r1: .205, w0: .03, w1: .034, off: -.026 }), 5)]),
  };

  /* ---- پیدا کردن چهارچرخ و تشخیص مش های رینگ اصلی و اماده سازی محل نصب طرح های جدید ---- */
  const wheels = [];
  partsRoot.updateMatrixWorld(true);
  partsRoot.traverse(n => { if (/^3DWheel_/.test(n.name)) wheels.push(n); });

  const v = new THREE.Vector3();
  for (const node of wheels) {
    const box = new THREE.Box3().setFromObject(node), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const R = size.y / 2, side = c.x >= 0 ? 1 : -1; //تعیین جهت بیرونی چرخ براساس سمت قرار گیری ان درمحورxخودرو
    node.userData.stockRim = [];
    node.traverse(m => { //نودهایی که نامشان با_3Dwheel شروع میشود پیدا میکند
      if (!m.isMesh) return;
      const p = m.geometry.attributes.position; let rMax = 0, rMin = 1e9, xMin = 1e9;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
        const r = Math.hypot(v.y - c.y, v.z - c.z); rMax = Math.max(rMax, r); rMin = Math.min(rMin, r);
        xMin = Math.min(xMin, (v.x - c.x) * side);
      }
      //شعاع رینگ نسبت به تایر کوچکتراست و سطح جلویی و پره هادر سمت بیرونی قرار دارند
      //یا بدنه حلقه رینگ از محور فاصله ی شعاعی زیادی دارد
      if (rMax / R < .8 && (xMin / R > .1 || rMin / R > .55)) node.userData.stockRim.push(m);
    });
    node.userData.rimGroup = new THREE.Group();
    node.userData.rimGroup.matrixAutoUpdate = false;
    //تنظیم موقعیت و جهت و مقیاس گروه رینگ متناسب با محور و اندازه هر چرخ
    /*نکته:تشخیص رینگ در این کد براساس نام قطعات و معیار های هندسی انجام میشود نه شناسایی
    هوشمند نوع قطعه.بنابراین اگر ساختار یا مقیاس مدل تغیر کند,
    ممکن است معیارهای تشخیص نیاز به اصلاح داشته باشند*/
    const world = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z)
      .multiply(new THREE.Matrix4().makeRotationY(side * Math.PI / 2))
      .multiply(new THREE.Matrix4().makeScale(R / REF_R, R / REF_R, R / REF_R));
    node.userData.rimGroup.matrix.copy(node.matrixWorld).invert().multiply(world);
    node.add(node.userData.rimGroup);
  }
/*-------------------------------------------------------------------------------------------------------*/
  // اختصاص متریال مشترک رینگ به تمام مشهای رینگ اصلی برای امکان تغیر رنگهای ان
  wheels.forEach(w => w.userData.stockRim.forEach(m => { m.material = rimMat; }));

  /* ---- هر طرح یکبار ساخته میشود و به تمام چرخها اعمال میشود ---- */
  const built = {};
  function build(id) {  //اجزای مشترک رینگ را میسازد
    const common = [barrel(), hub()];
    const geos = { rim: merge([...common, DESIGNS[id]()]), nuts: nuts(), cap: cap() };
    for (const w of wheels) {
      const g = new THREE.Group(); g.name = 'rim-' + id; g.visible = false;
      g.add(new THREE.Mesh(geos.rim, rimMat), new THREE.Mesh(geos.nuts, nutMat), new THREE.Mesh(geos.cap, capMat));
      g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
      w.userData.rimGroup.add(g);
    }
    built[id] = true;
  }
//شناسه طرح انتخاب شده فعلی را نگه میدارد
  let current = 'stock';
  //ابتدا بررسی میکند که شناسه معتبر باشد
  function setModel(id) {
    if (id !== 'stock' && !DESIGNS[id]) return;
    if (id !== 'stock' && !built[id]) build(id);
    current = id;
    for (const w of wheels) {
      w.userData.stockRim.forEach(m => { m.visible = id === 'stock'; });
      w.userData.rimGroup.children.forEach(g => { g.visible = g.name === 'rim-' + id; });
    }
  }
  //تغیر رنگ متریال اصلی
  function setColor(color) { rimMat.color.set(color); }
//طرح قابل نمایش را انتخاب میکند
  return { setModel, setColor, get model() { return current; } };
};
