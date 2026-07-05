/* ================================================================
   BFAM — Disoriented
   A modular-synth dreamworld: the viewer stands inside a circular
   wall of eurorack modules, threaded with sagging patch cables.
   ================================================================ */

const canvas = document.getElementById('scene');
const engine = new BABYLON.Engine(canvas, true, { stencil: true });
const scene = new BABYLON.Scene(engine);

scene.clearColor = BABYLON.Color4.FromHexString('#181a1bff');
scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
scene.fogDensity = 0.014;
scene.fogColor = BABYLON.Color3.FromHexString('#181a1b');

/* ---------------- helpers ---------------- */
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const C3 = (h) => BABYLON.Color3.FromHexString(h);
const V3 = (x, y, z) => new BABYLON.Vector3(x, y, z);

const animators = []; // callbacks (t, dt) run every frame

function stdMat(name, diffuseHex, opts = {}) {
  const m = new BABYLON.StandardMaterial(name, scene);
  m.diffuseColor = C3(diffuseHex);
  const s = opts.spec ?? 0.12;
  m.specularColor = new BABYLON.Color3(s, s, s);
  if (opts.emissive) m.emissiveColor = C3(opts.emissive).scale(opts.glow ?? 1);
  if (opts.unlit) m.disableLighting = true;
  if (opts.alpha !== undefined) m.alpha = opts.alpha;
  return m;
}

/* ---------------- camera (inside the machine ring) ---------------- */
const camera = new BABYLON.ArcRotateCamera('cam', -Math.PI / 2, 1.12, 10.5, V3(0, 3.4, 0), scene);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 5.5;
camera.upperRadiusLimit = 12.5;
camera.lowerBetaLimit = 0.5;
camera.upperBetaLimit = 1.46;
camera.panningSensibility = 0; // orbit only
camera.wheelPrecision = 40;
camera.pinchPrecision = 120;
camera.useAutoRotationBehavior = true;
camera.autoRotationBehavior.idleRotationSpeed = 0.07;
camera.autoRotationBehavior.idleRotationWaitTime = 2500;
camera.autoRotationBehavior.idleRotationSpinupTime = 2500;

/* ---------------- lights & glow ---------------- */
const hemi = new BABYLON.HemisphericLight('hemi', V3(0, 1, 0), scene);
hemi.intensity = 0.4;
hemi.diffuse = C3('#5a6a78');
hemi.groundColor = C3('#1a1410');

const coreLight = new BABYLON.PointLight('core', V3(0, 6.5, 0), scene);
coreLight.diffuse = C3('#64d2ff');
coreLight.intensity = 0.55;
coreLight.range = 34;

const warmLight = new BABYLON.PointLight('warm', V3(-7, 5, 7), scene);
warmLight.diffuse = C3('#ffb35c');
warmLight.intensity = 0.3;
warmLight.range = 26;

const glow = new BABYLON.GlowLayer('glow', scene, { blurKernelSize: 32 });
glow.intensity = 0.75;

/* ---------------- shared materials ---------------- */
const mats = {
  knob: stdMat('knob', '#17181b', { spec: 0.35 }),
  pointer: stdMat('pointer', '#e8e4da', { emissive: '#e8e4da', glow: 0.12 }),
  jackBarrel: stdMat('jackBarrel', '#0c0d0e', { spec: 0.4 }),
  silver: stdMat('silver', '#9aa0a6', { spec: 0.6 }),
  rail: stdMat('rail', '#7d838a', { spec: 0.5 }),
  wood: stdMat('wood', '#5b4632', { spec: 0.05 }),
  rackBack: stdMat('rackBack', '#121314', { spec: 0.02 }),
  sliderTrack: stdMat('sliderTrack', '#0e0f10', { spec: 0.2 }),
  screen: stdMat('screen', '#04211f', { emissive: '#0affd0', glow: 0.35 }),
  floor: stdMat('floor', '#141517', { spec: 0.04 }),
  column: stdMat('column', '#05364f', { emissive: '#64d2ff', glow: 0.7, unlit: true, alpha: 0.28 }),
  ringGlow: stdMat('ringGlow', '#052a3d', { emissive: '#05c6f4', glow: 0.6, unlit: true }),
};

// screen pulse
animators.push((t) => {
  const k = 0.28 + 0.1 * Math.sin(t * 2.1) + 0.04 * Math.sin(t * 9.7);
  mats.screen.emissiveColor.set(0.04 * k * 10, k, k * 0.82);
});

/* ================================================================
   INSTANCE MASTERS — one geometry per component type, hardware
   instanced everywhere. Masters are invisible; instances render.
   ================================================================ */
const masters = {};

function bake(mesh) {
  mesh.bakeCurrentTransformIntoVertices();
  mesh.isVisible = false;
  return mesh;
}

// knob body: cylinder facing +Z
{
  const m = BABYLON.MeshBuilder.CreateCylinder('mKnob', { diameter: 0.26, height: 0.12, tessellation: 18 }, scene);
  m.rotation.x = Math.PI / 2;
  m.material = mats.knob;
  masters.knob = bake(m);
}
// knob pointer: offset from center so rotation.z spins it around the knob axis
{
  const m = BABYLON.MeshBuilder.CreateBox('mPtr', { width: 0.035, height: 0.13, depth: 0.02 }, scene);
  m.position.set(0, 0.06, 0.065);
  m.material = mats.pointer;
  masters.pointer = bake(m);
}
// jack barrel + hex nut, facing +Z
{
  const m = BABYLON.MeshBuilder.CreateCylinder('mJack', { diameter: 0.16, height: 0.1, tessellation: 14 }, scene);
  m.rotation.x = Math.PI / 2;
  m.material = mats.jackBarrel;
  masters.jack = bake(m);

  const n = BABYLON.MeshBuilder.CreateTorus('mNut', { diameter: 0.2, thickness: 0.035, tessellation: 6 }, scene);
  n.rotation.x = Math.PI / 2;
  n.position.z = 0.035;
  n.material = mats.silver;
  masters.nut = bake(n);
}
// LEDs: 4 colors x 2 blink groups (each group blinks on its own clock)
const LED_COLORS = ['#ff453a', '#ffd60a', '#30d158', '#64d2ff'];
const ledMasters = [];
LED_COLORS.forEach((c, ci) => {
  for (let g = 0; g < 2; g++) {
    const mat = new BABYLON.StandardMaterial('ledMat' + ci + g, scene);
    mat.diffuseColor = C3('#0a0a0a');
    mat.emissiveColor = C3(c);
    const s = BABYLON.MeshBuilder.CreateSphere('mLed' + ci + g, { diameter: 0.09, segments: 8 }, scene);
    s.material = mat;
    s.isVisible = false;
    ledMasters.push(s);

    const base = C3(c);
    const speed = rnd(1.4, 4.6);
    const phase = rnd(0, Math.PI * 2);
    animators.push((t) => {
      const k = 0.18 + 0.82 * Math.pow(0.5 + 0.5 * Math.sin(t * speed + phase), 3);
      mat.emissiveColor.set(base.r * k, base.g * k, base.b * k);
    });
  }
});
// slider track + handle
{
  const tr = BABYLON.MeshBuilder.CreateBox('mTrack', { width: 0.05, height: 0.62, depth: 0.026 }, scene);
  tr.material = mats.sliderTrack;
  masters.track = bake(tr);

  const h = BABYLON.MeshBuilder.CreateBox('mHandle', { width: 0.17, height: 0.09, depth: 0.06 }, scene);
  h.position.set(0, 0.08, 0.025);
  h.material = mats.knob;
  masters.handle = bake(h);
}
// mini screen
{
  const m = BABYLON.MeshBuilder.CreateBox('mScreen', { width: 0.44, height: 0.3, depth: 0.025 }, scene);
  m.material = mats.screen;
  masters.screenBox = bake(m);
}
// panel faceplates: a few classic finishes (dark, silver, cream)
const PANEL_COLORS = ['#26282b', '#2e3134', '#1d1f21', '#d8d2c4', '#3a3d42'];
const panelMasters = PANEL_COLORS.map((c, i) => {
  const m = BABYLON.MeshBuilder.CreateBox('mPanel' + i, { width: 1, height: 2.4, depth: 0.06 }, scene);
  m.material = stdMat('panelMat' + i, c, { spec: 0.18 });
  m.isVisible = false;
  return m;
});
// rack rail
{
  const m = BABYLON.MeshBuilder.CreateBox('mRail', { width: 1, height: 0.09, depth: 0.05 }, scene);
  m.material = mats.rail;
  masters.rail = bake(m);
}

function inst(master, parent, x, y, z) {
  const i = master.createInstance(master.name + '_i');
  i.parent = parent;
  i.position.set(x, y, z);
  return i;
}

/* ================================================================
   EURORACK WALL — 6 racks in a ring, facing inward
   ================================================================ */
const RADIUS = 13;
const jacks = [];    // jack instances, endpoints for patch cables
const spinners = []; // slowly turning knob pointers

function buildModule(root, cx, cy, w) {
  const panel = pick(panelMasters).createInstance('panel_i');
  panel.parent = root;
  panel.position.set(cx, cy, 0);
  panel.scaling.x = w;

  const cols = Math.max(1, Math.round(w / 0.5));
  let rowsY = [-0.72, 0, 0.72];

  // some wide modules get a glowing display up top instead of a comp row
  if (w >= 0.95 && Math.random() < 0.28) {
    inst(masters.screenBox, root, cx, cy + 0.72, 0.045);
    rowsY = [-0.72, 0];
  }

  for (const oy of rowsY) {
    for (let i = 0; i < cols; i++) {
      const px = cx - w / 2 + (i + 0.5) * (w / cols);
      const py = cy + oy;
      const r = Math.random();
      if (r < 0.26) {
        inst(masters.knob, root, px, py, 0.09);
        const p = inst(masters.pointer, root, px, py, 0.09);
        p.rotation.z = rnd(0, Math.PI * 2);
        if (Math.random() < 0.16) spinners.push({ mesh: p, speed: rnd(0.2, 0.9) * pick([1, -1]) });
      } else if (r < 0.52) {
        const j = inst(masters.jack, root, px, py, 0.085);
        inst(masters.nut, root, px, py, 0.085);
        jacks.push(j);
      } else if (r < 0.64) {
        inst(pick(ledMasters), root, px, py, 0.055);
      } else if (r < 0.72) {
        inst(masters.track, root, px, py, 0.05);
        inst(masters.handle, root, px, py, 0.05);
      }
      // else: blank panel space
    }
  }
}

function buildRack(angle) {
  const root = new BABYLON.TransformNode('rack', scene);
  root.position.set(Math.sin(angle) * RADIUS, 0, Math.cos(angle) * RADIUS);
  root.rotation.y = angle + Math.PI; // face the center

  const W = 7;
  const rows = [1.5, 4.0, 6.5];

  // back plate
  const back = BABYLON.MeshBuilder.CreateBox('back', { width: W + 0.1, height: 7.9, depth: 0.06 }, scene);
  back.parent = root;
  back.position.set(0, 4.0, -0.06);
  back.material = mats.rackBack;

  // wooden side cheeks
  for (const sx of [-1, 1]) {
    const cheek = BABYLON.MeshBuilder.CreateBox('cheek', { width: 0.28, height: 8.1, depth: 0.75 }, scene);
    cheek.parent = root;
    cheek.position.set(sx * (W / 2 + 0.14), 4.0, -0.05);
    cheek.material = mats.wood;
  }

  for (const ry of rows) {
    // silver rails above and below each row
    for (const dy of [-1.24, 1.24]) {
      const rail = inst(masters.rail, root, 0, ry + dy, 0.02);
      rail.scaling.x = W;
    }
    // fill the row with random-width modules
    let x = -W / 2;
    while (x < W / 2 - 0.05) {
      let w = rnd(0.7, 1.8);
      if (W / 2 - (x + w) < 0.55) w = W / 2 - x; // last module fills the gap
      buildModule(root, x + w / 2, ry, w);
      x += w;
    }
  }
}

// 8 rack slots make a full ring of modules around the viewer
const SLOT = Math.PI / 4;
for (let i = 0; i < 8; i++) buildRack(i * SLOT + SLOT / 2);

/* ================================================================
   PATCH CABLES — sagging colored tubes between random jacks
   ================================================================ */
const CABLE_COLORS = ['#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#05c6f4', '#af52de'];
const cableMats = CABLE_COLORS.map((c, i) => {
  const m = stdMat('cableMat' + i, '#151515', { spec: 0.3 });
  m.emissiveColor = C3(c).scale(0.5);
  return m;
});

function buildCables() {
  const pts = jacks.map((j) => {
    j.computeWorldMatrix(true);
    return j.getAbsolutePosition().clone();
  });
  const used = new Set();
  let made = 0, guard = 0;
  while (made < 24 && guard++ < 900) {
    const i = (Math.random() * pts.length) | 0;
    const k = (Math.random() * pts.length) | 0;
    if (i === k || used.has(i) || used.has(k)) continue;
    const a = pts[i], b = pts[k];
    const d = BABYLON.Vector3.Distance(a, b);
    if (d < 1.2 || d > 9) continue;
    used.add(i); used.add(k);

    const sag = 0.5 + d * 0.28;
    const mid = (f) => {
      const p = BABYLON.Vector3.Lerp(a, b, f);
      p.y = Math.max(p.y - sag, 0.18); // droop, but never through the floor
      const inw = V3(-p.x, 0, -p.z).normalize().scale(0.3 + d * 0.05);
      return p.add(inw);
    };
    const curve = BABYLON.Curve3.CreateCatmullRomSpline([a, mid(0.32), mid(0.68), b], 12);
    const tube = BABYLON.MeshBuilder.CreateTube('cable', {
      path: curve.getPoints(), radius: 0.035, tessellation: 8, cap: BABYLON.Mesh.CAP_ALL,
    }, scene);
    tube.material = pick(cableMats);
    made++;
  }
}
buildCables();

/* ================================================================
   CENTERPIECE — light column and orbiting rings behind the player
   ================================================================ */
{
  const col = BABYLON.MeshBuilder.CreateCylinder('column', { diameter: 0.5, height: 12, tessellation: 20 }, scene);
  col.position.y = 6;
  col.material = mats.column;

  const ring1 = BABYLON.MeshBuilder.CreateTorus('ring1', { diameter: 3.4, thickness: 0.07, tessellation: 48 }, scene);
  ring1.position.y = 3.3;
  ring1.material = mats.ringGlow;

  const ring2 = BABYLON.MeshBuilder.CreateTorus('ring2', { diameter: 5, thickness: 0.05, tessellation: 48 }, scene);
  ring2.position.y = 3.3;
  ring2.material = mats.ringGlow;

  animators.push((t) => {
    ring1.rotation.set(Math.sin(t * 0.3) * 0.6, t * 0.25, Math.cos(t * 0.22) * 0.4);
    ring2.rotation.set(Math.PI / 2 + Math.sin(t * 0.2) * 0.35, 0, t * 0.18);
    coreLight.intensity = 0.5 + 0.1 * Math.sin(t * 0.9);
  });
}

/* ---------------- floor & glow rings ---------------- */
{
  const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 90, height: 90 }, scene);
  ground.material = mats.floor;

  [[9, 0.5], [16, 0.3], [24, 0.18]].forEach(([d, k], i) => {
    const ring = BABYLON.MeshBuilder.CreateTorus('floorRing' + i, { diameter: d, thickness: 0.05, tessellation: 64 }, scene);
    ring.position.y = 0.02;
    const m = stdMat('floorRingMat' + i, '#0a1a26', { unlit: true });
    m.emissiveColor = C3('#056cc4').scale(k);
    ring.material = m;
  });
}

/* ---------------- drifting dust motes ---------------- */
{
  const tex = new BABYLON.DynamicTexture('spark', { width: 64, height: 64 }, scene, false);
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  tex.update();
  tex.hasAlpha = true;

  const ps = new BABYLON.ParticleSystem('dust', 260, scene);
  ps.particleTexture = tex;
  ps.emitter = V3(0, 0, 0);
  ps.minEmitBox = V3(-12, 0.3, -12);
  ps.maxEmitBox = V3(12, 9, 12);
  ps.color1 = new BABYLON.Color4(0.4, 0.8, 1.0, 0.35);
  ps.color2 = new BABYLON.Color4(1.0, 0.75, 0.4, 0.25);
  ps.colorDead = new BABYLON.Color4(0, 0, 0, 0);
  ps.minSize = 0.04;
  ps.maxSize = 0.16;
  ps.minLifeTime = 6;
  ps.maxLifeTime = 12;
  ps.emitRate = 22;
  ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
  ps.direction1 = V3(-0.05, 0.06, -0.05);
  ps.direction2 = V3(0.05, 0.14, 0.05);
  ps.minEmitPower = 0.2;
  ps.maxEmitPower = 0.6;
  ps.updateSpeed = 0.01;
  ps.start();
}

/* ---------------- main loop ---------------- */
let elapsed = 0;
scene.registerBeforeRender(() => {
  const dt = engine.getDeltaTime() / 1000;
  elapsed += dt;
  for (const s of spinners) s.mesh.rotation.z += dt * s.speed;
  for (const fn of animators) fn(elapsed, dt);
});

engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
