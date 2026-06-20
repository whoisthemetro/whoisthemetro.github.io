// THE METRO — bedroom, rebuilt in Babylon.js 9.
//
// phase 1 of the engine migration. the three.js world is one scene of toon-shaded
// canvas textures; here we get the things three.js made us fake: real PBR + image-based
// lighting (true reflections), cascaded sun shadows, volumetric god-rays through the
// window, a glow/bloom pipeline for the neon, SSAO contact shadows, GPU-particle dust,
// and Havok rigid bodies you can throw. everything is still procedural — no asset files.
//
// the room has rules, same as the boat's sea: light comes from outside, the neon is the
// only thing allowed to be brighter than the sun.

const BABYLON = window.BABYLON;
const canvas = document.getElementById("stage");
const gate = document.getElementById("gate");
const enterBtn = document.getElementById("enter-btn");
const loadbar = document.querySelector("#loadbar > i");
const hint = document.getElementById("hint");
const badge = document.getElementById("badge");

function progress(pct, label) {
  loadbar.style.width = Math.round(pct) + "%";
  if (label) enterBtn.textContent = label;
}

// ---- engine ----
const engine = new BABYLON.Engine(canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true,
  antialias: true,
  powerPreference: "high-performance",
  adaptToDeviceRatio: true,
});
engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));

const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color3(0.02, 0.02, 0.03);
scene.collisionsEnabled = true;
scene.gravity = new BABYLON.Vector3(0, -0.5, 0);

// ACES film tonemap so the bright window + neon don't clip ugly
const ip = scene.imageProcessingConfiguration;
ip.toneMappingEnabled = true;
ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
ip.exposure = 1.02;
ip.contrast = 1.28;

// ---- image-based lighting: a prefiltered studio env drives every PBR reflection ----
const envTex = BABYLON.CubeTexture.CreateFromPrefilteredData(
  "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
envTex.gammaSpace = false;
scene.environmentTexture = envTex;
scene.environmentIntensity = 0.55; // indoors — keep the IBL subtle, let the sun lead

// =====================================================================
// small procedural-texture helpers (the canvas-texture habit, ported)
// =====================================================================
function dyn(name, w, h, draw, frame = false) {
  const t = new BABYLON.DynamicTexture(name, { width: w, height: h }, scene, true);
  const ctx = t.getContext();
  draw(ctx, w, h);
  t.update(false);
  if (!frame) t.optimize?.();
  return t;
}

function carpetTexture() {
  return dyn("carpet", 1024, 1024, (c, w, h) => {
    c.fillStyle = "#3b3a40"; c.fillRect(0, 0, w, h);
    // fiber speckle
    for (let i = 0; i < 90000; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      const v = 0.5 + Math.random() * 0.5;
      c.fillStyle = `rgba(${Math.round(70 * v)},${Math.round(68 * v)},${Math.round(76 * v)},.5)`;
      c.fillRect(x, y, 2, 2);
    }
    // a couple of old stains, because the carpet remembers
    for (const [sx, sy, r] of [[300, 720, 120], [760, 240, 80]]) {
      const g = c.createRadialGradient(sx, sy, 4, sx, sy, r);
      g.addColorStop(0, "rgba(30,24,20,.5)"); g.addColorStop(1, "rgba(30,24,20,0)");
      c.fillStyle = g; c.beginPath(); c.arc(sx, sy, r, 0, 7); c.fill();
    }
  });
}

function wallTexture() {
  return dyn("wall", 1024, 1024, (c, w, h) => {
    c.fillStyle = "#d8d1c2"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 26000; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      c.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
      c.fillRect(x, y, 1, 1);
    }
    // faint vertical roller streaks
    for (let i = 0; i < 60; i++) {
      c.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`;
      c.fillRect(Math.random() * w, 0, 2, h);
    }
  });
}

function woodTexture() {
  return dyn("walnut", 1024, 512, (c, w, h) => {
    c.fillStyle = "#3a2418"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const y = (i / 70) * h + (Math.random() - 0.5) * 6;
      c.strokeStyle = `rgba(${90 + Math.random() * 50},${55 + Math.random() * 30},${30 + Math.random() * 20},.4)`;
      c.lineWidth = 1 + Math.random() * 2; c.beginPath();
      for (let x = 0; x <= w; x += 16) c.lineTo(x, y + Math.sin(x * 0.02 + i) * 4);
      c.stroke();
    }
    const g = c.createRadialGradient(820, 360, 6, 820, 360, 60); // coffee ring
    g.addColorStop(0, "rgba(20,12,6,0)"); g.addColorStop(.82, "rgba(20,12,6,0)");
    g.addColorStop(.9, "rgba(20,12,6,.4)"); g.addColorStop(1, "rgba(20,12,6,0)");
    c.fillStyle = g; c.beginPath(); c.arc(820, 360, 60, 0, 7); c.fill();
  });
}

// =====================================================================
// PBR material sugar
// =====================================================================
function mat(name, opts = {}) {
  const m = new BABYLON.PBRMetallicRoughnessMaterial(name, scene);
  const [r, g, b] = opts.color || [0.8, 0.8, 0.8];
  m.baseColor = new BABYLON.Color3(r, g, b);
  m.metallic = opts.metallic ?? 0;
  m.roughness = opts.roughness ?? 0.85;
  if (opts.tex) { m.baseTexture = opts.tex; if (opts.uv) opts.tex.uScale = opts.tex.vScale = opts.uv; }
  if (opts.emissive) m.emissiveColor = new BABYLON.Color3(...opts.emissive);
  if (opts.emissiveTex) m.emissiveTexture = opts.emissiveTex;
  if (opts.alpha != null) { m.alpha = opts.alpha; m.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND; }
  return m;
}

const casters = []; // meshes that throw shadows
const colliders = []; // walls/floor/furniture the player & physics bump into

function box(name, w, h, d, x, y, z, material, { cast = true, collide = true } = {}) {
  const m = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
  m.position.set(x, y, z);
  m.material = material;
  m.receiveShadows = true;
  if (cast) casters.push(m);
  if (collide) { m.checkCollisions = true; colliders.push(m); }
  return m;
}

// =====================================================================
// the shell — floor, ceiling, four walls, a real window opening
// =====================================================================
const ROOM = { w: 6.4, d: 5.4, h: 3.0 };
const HW = ROOM.w / 2, HD = ROOM.d / 2;

const floor = BABYLON.MeshBuilder.CreateGround("floor", { width: ROOM.w, height: ROOM.d }, scene);
floor.material = mat("carpetMat", { tex: carpetTexture(), uv: 3, roughness: 0.97 });
floor.receiveShadows = true;
floor.checkCollisions = true;

const ceil = BABYLON.MeshBuilder.CreateGround("ceil", { width: ROOM.w, height: ROOM.d }, scene);
ceil.material = mat("ceilMat", { color: [0.82, 0.79, 0.72], roughness: 1 });
ceil.position.y = ROOM.h; ceil.rotation.x = Math.PI; // face down
ceil.receiveShadows = true;

const wallMat = mat("wallMat", { tex: wallTexture(), uv: 2, roughness: 0.92 });
const baseboardMat = mat("baseboard", { color: [0.9, 0.88, 0.82], roughness: 0.6 });

// south (behind spawn), east, west solid. baseboards on each.
function wall(name, w, x, z, ry) {
  const m = box(name, w, ROOM.h, 0.12, x, ROOM.h / 2, z, wallMat);
  m.rotation.y = ry;
  const bb = box(name + "_bb", w, 0.12, 0.14, x, 0.06, z, baseboardMat, { cast: false });
  bb.rotation.y = ry;
}
wall("wS", ROOM.w, 0, HD, 0);
wall("wE", ROOM.d, HW, 0, Math.PI / 2);
wall("wW", ROOM.d, -HW, 0, Math.PI / 2);

// north wall = window wall: build it as a frame (sill, lintel, two jambs) around a hole
const WIN = { w: 2.8, sill: 0.85, top: 2.45 };
const jambW = (ROOM.w - WIN.w) / 2;
box("wN_sill", ROOM.w, WIN.sill, 0.12, 0, WIN.sill / 2, -HD, wallMat);
box("wN_head", ROOM.w, ROOM.h - WIN.top, 0.12, 0, (ROOM.h + WIN.top) / 2, -HD, wallMat);
box("wN_jL", jambW, WIN.top - WIN.sill, 0.12, -(WIN.w + jambW) / 2, (WIN.sill + WIN.top) / 2, -HD, wallMat);
box("wN_jR", jambW, WIN.top - WIN.sill, 0.12, (WIN.w + jambW) / 2, (WIN.sill + WIN.top) / 2, -HD, wallMat);
// window frame trim (dark aluminium)
const frameMat = mat("frame", { color: [0.06, 0.06, 0.07], metallic: 0.8, roughness: 0.4 });
box("wN_frame", WIN.w + 0.1, 0.06, 0.16, 0, WIN.sill, -HD, frameMat, { cast: false });
box("wN_frameT", WIN.w + 0.1, 0.06, 0.16, 0, WIN.top, -HD, frameMat, { cast: false });
box("wN_mull", 0.05, WIN.top - WIN.sill, 0.16, 0, (WIN.sill + WIN.top) / 2, -HD, frameMat, { cast: false });

// glass pane — thin, glossy, lets the outside through, blooms the sky
const glass = BABYLON.MeshBuilder.CreatePlane("glass", { width: WIN.w, height: WIN.top - WIN.sill }, scene);
glass.position.set(0, (WIN.sill + WIN.top) / 2, -HD + 0.02);
const glassMat = mat("glassMat", { color: [0.6, 0.72, 0.85], metallic: 0.0, roughness: 0.05, alpha: 0.16 });
glassMat.environmentIntensity = 1.2;
glass.material = glassMat;

// =====================================================================
// outside — a dusk sky plane behind the window (this is the god-ray source)
// =====================================================================
const skyTex = dyn("sky", 1024, 1024, (c, w, h) => {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#0a1840"); g.addColorStop(0.42, "#5a3f7a");
  g.addColorStop(0.62, "#d8654a"); g.addColorStop(0.78, "#ffb15c"); g.addColorStop(1, "#ffe39a");
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  // a distant city silhouette
  c.fillStyle = "#1a1426";
  for (let x = 0; x < w; x += 26) {
    const bh = 60 + Math.random() * 240;
    c.fillRect(x, h - bh, 22 + Math.random() * 6, bh);
    if (Math.random() < 0.5) { // lit windows
      c.fillStyle = "rgba(255,210,140,.6)";
      for (let k = 0; k < 6; k++) c.fillRect(x + 4 + (k % 2) * 8, h - bh + 10 + Math.floor(k / 2) * 16, 4, 6);
      c.fillStyle = "#1a1426";
    }
  }
});
const sky = box("sky", 30, 18, 0.1, 0, 6, -HD - 4, mat("skyMat", { color: [1, 1, 1], emissive: [1, 1, 1], roughness: 1 }), { cast: false, collide: false });
sky.material.emissiveTexture = skyTex;
sky.material.baseColor = new BABYLON.Color3(0, 0, 0);
sky.material.emissiveColor = new BABYLON.Color3(0.62, 0.6, 0.58); // dusk, not a lightbulb — let the city read

// a hot sun disc — the volumetric scatter origin, pushed to one side so the rays rake diagonally
const sunDisc = BABYLON.MeshBuilder.CreatePlane("sunDisc", { size: 2.0 }, scene);
sunDisc.position.set(-1.7, 2.9, -HD - 3.4);
const sunMat = mat("sunMat", { color: [0, 0, 0], emissive: [1.9, 1.45, 0.95], roughness: 1 });
sunMat.disableLighting = true;
sunDisc.material = sunMat;

// =====================================================================
// lighting — low IBL fill + a single shadow-casting sun raking through the glass
// =====================================================================
const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
hemi.intensity = 0.25;
hemi.diffuse = new BABYLON.Color3(0.55, 0.58, 0.68);
hemi.groundColor = new BABYLON.Color3(0.18, 0.15, 0.12);

const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.35, -0.62, 1), scene);
sun.position = new BABYLON.Vector3(2.5, 5.5, -7);
sun.intensity = 3.2;
sun.diffuse = new BABYLON.Color3(1.0, 0.86, 0.66);

const shadow = new BABYLON.ShadowGenerator(2048, sun);
shadow.usePercentageCloserFiltering = true;
shadow.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
shadow.bias = 0.0009;
shadow.normalBias = 0.012;
shadow.darkness = 0.32;

// =====================================================================
// furniture
// =====================================================================
const woodMat = mat("wood", { tex: woodTexture(), roughness: 0.55, metallic: 0.0 });

// --- the desk, under the window ---
const DESK = { w: 2.2, d: 0.72, top: 0.74, z: -HD + 0.5 };
box("deskTop", DESK.w, 0.05, DESK.d, 0, DESK.top, DESK.z, woodMat);
const legMat = mat("legs", { color: [0.05, 0.05, 0.06], metallic: 0.7, roughness: 0.4 });
for (const sx of [-1, 1]) {
  box("dlegF" + sx, 0.05, DESK.top, 0.05, sx * (DESK.w / 2 - 0.08), DESK.top / 2, DESK.z + DESK.d / 2 - 0.06, legMat, { cast: false });
  box("dlegB" + sx, 0.05, DESK.top, 0.05, sx * (DESK.w / 2 - 0.08), DESK.top / 2, DESK.z - DESK.d / 2 + 0.06, legMat, { cast: false });
}

// --- the ultrawide: an animated emissive screen (the glow layer + bloom carry it) ---
const screenW = 1.3, screenH = 0.42;
const screenTex = new BABYLON.DynamicTexture("screen", { width: 1024, height: 332 }, scene, true);
const sctx = screenTex.getContext();
const monitor = box("monitorBody", screenW + 0.06, screenH + 0.06, 0.03, 0, DESK.top + 0.06 + screenH / 2, DESK.z - DESK.d / 2 + 0.04, mat("monBody", { color: [0.02, 0.02, 0.02], roughness: 0.4 }));
const screen = BABYLON.MeshBuilder.CreatePlane("screen", { width: screenW, height: screenH }, scene);
screen.position.set(0, DESK.top + 0.06 + screenH / 2, DESK.z - DESK.d / 2 + 0.06);
const screenMat = mat("screenMat", { color: [0, 0, 0], roughness: 0.18 });
screenMat.emissiveTexture = screenTex;
screenMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
screen.material = screenMat;
// monitor stand
box("monStand", 0.06, 0.18, 0.06, 0, DESK.top + 0.09, DESK.z - DESK.d / 2 + 0.06, legMat, { cast: false });
box("monFoot", 0.3, 0.02, 0.16, 0, DESK.top + 0.01, DESK.z - DESK.d / 2 + 0.08, legMat, { cast: false });

// keyboard + a trackball
box("keeb", 0.44, 0.02, 0.14, 0, DESK.top + 0.03, DESK.z + 0.06, mat("keeb", { color: [0.08, 0.08, 0.09], roughness: 0.5 }));
const ball = BABYLON.MeshBuilder.CreateSphere("trackball", { diameter: 0.05 }, scene);
ball.position.set(0.32, DESK.top + 0.04, DESK.z + 0.06);
ball.material = mat("tb", { color: [0.7, 0.1, 0.1], metallic: 0.1, roughness: 0.3 });
casters.push(ball);

// the little black cube — a Mac Studio with a breathing LED
const macLed = mat("macled", { color: [0.05, 0.05, 0.06], emissive: [0.0, 0.8, 0.5], roughness: 0.3 });
box("mac", 0.2, 0.1, 0.2, -0.75, DESK.top + 0.05, DESK.z - 0.05, mat("mac", { color: [0.06, 0.06, 0.07], metallic: 0.6, roughness: 0.35 }));
box("macFront", 0.2, 0.02, 0.005, -0.75, DESK.top + 0.04, DESK.z - 0.15, macLed, { cast: false });

// =====================================================================
// the 12U rack on the east wall, with a strip of status LEDs
// =====================================================================
const rackMat = mat("rack", { color: [0.04, 0.04, 0.05], metallic: 0.5, roughness: 0.5 });
const rackX = HW - 0.35;
box("rack", 0.5, 1.5, 0.55, rackX, 0.75, 1.4, rackMat);
const ledColors = [[1, 0.2, 0.2], [0.2, 1, 0.4], [0.2, 0.6, 1], [1, 0.8, 0.1], [0.9, 0.2, 0.9]];
for (let i = 0; i < 9; i++) {
  const col = ledColors[i % ledColors.length];
  const u = box("ru" + i, 0.42, 0.13, 0.02, rackX, 0.2 + i * 0.15, 1.4 - 0.28, mat("ru" + i, { color: [0.07, 0.07, 0.08], roughness: 0.4 }), { cast: false });
  const led = box("led" + i, 0.03, 0.03, 0.01, rackX - 0.16, 0.2 + i * 0.15, 1.4 - 0.29, mat("ledm" + i, { color: [0, 0, 0], emissive: col, roughness: 0.3 }), { cast: false, collide: false });
  led._baseEmis = col;
}

// =====================================================================
// the lava lamp — glass cone, glowing blobs, its own point light
// =====================================================================
const lampBaseX = rackX, lampZ = -0.4;
box("lampBase", 0.16, 0.12, 0.16, lampBaseX, 0.06, lampZ, mat("lb", { color: [0.7, 0.6, 0.2], metallic: 0.9, roughness: 0.3 }), { cast: false });
const lampGlass = BABYLON.MeshBuilder.CreateCylinder("lampGlass", { height: 0.5, diameterTop: 0.1, diameterBottom: 0.22 }, scene);
lampGlass.position.set(lampBaseX, 0.37, lampZ);
lampGlass.material = mat("lg", { color: [0.9, 0.5, 0.2], roughness: 0.08, alpha: 0.32 });
const blobs = [];
for (let i = 0; i < 5; i++) {
  const b = BABYLON.MeshBuilder.CreateSphere("blob" + i, { diameter: 0.05 + Math.random() * 0.05 }, scene);
  b.material = mat("blobm" + i, { color: [0, 0, 0], emissive: [1.4, 0.3, 0.5], roughness: 0.4 });
  b._phase = Math.random() * 7; b._speed = 0.25 + Math.random() * 0.3;
  b.parent = null; b.position.set(lampBaseX, 0.2 + Math.random() * 0.3, lampZ);
  blobs.push(b);
}
const lampLight = new BABYLON.PointLight("lampLight", new BABYLON.Vector3(lampBaseX, 0.4, lampZ), scene);
lampLight.diffuse = new BABYLON.Color3(1, 0.35, 0.4);
lampLight.intensity = 0.6; lampLight.range = 2.2;

// =====================================================================
// the bed — this IS the bedroom now. a low platform, mattress, duvet, pillows
// =====================================================================
const bedX = -HW + 1.1, bedZ = 0.3;
box("bedFrame", 1.7, 0.22, 2.2, bedX, 0.11, bedZ, mat("bedframe", { color: [0.16, 0.11, 0.08], roughness: 0.7 }));
box("mattress", 1.55, 0.18, 2.05, bedX, 0.31, bedZ, mat("mattress", { color: [0.85, 0.84, 0.8], roughness: 0.95 }), { cast: false });
const duvet = box("duvet", 1.6, 0.12, 1.35, bedX, 0.42, bedZ + 0.35, mat("duvet", { color: [0.18, 0.22, 0.4], roughness: 1 }), { cast: false });
for (const px of [-0.34, 0.34]) box("pillow" + px, 0.6, 0.12, 0.36, bedX + px, 0.44, bedZ - 0.78, mat("pillow", { color: [0.92, 0.9, 0.86], roughness: 1 }), { cast: false });

// a round rug to soften the floor
const rug = BABYLON.MeshBuilder.CreateDisc("rug", { radius: 1.1, tessellation: 48 }, scene);
rug.rotation.x = Math.PI / 2; rug.position.set(0.2, 0.012, 0.4);
rug.material = mat("rug", { color: [0.35, 0.12, 0.16], roughness: 1 });
rug.receiveShadows = true;

// =====================================================================
// acoustic panels (east + south walls) — dark studio foam
// =====================================================================
const panelMat = mat("panel", { color: [0.09, 0.09, 0.1], roughness: 1 });
for (let i = 0; i < 3; i++)
  box("panelS" + i, 0.55, 0.55, 0.06, -1.2 + i * 1.2, 1.9, HD - 0.07, panelMat, { cast: false });

// =====================================================================
// THE METRO neon sign — the one thing allowed to outshine the sun
// =====================================================================
const neonTex = dyn("neon", 1024, 256, (c, w, h) => {
  c.fillStyle = "#000"; c.fillRect(0, 0, w, h);
  c.font = "bold 150px ui-monospace, monospace";
  c.textAlign = "center"; c.textBaseline = "middle";
  c.shadowColor = "#ff3bd0"; c.shadowBlur = 40;
  c.fillStyle = "#ff8fe0"; c.fillText("THE METRO", w / 2, h / 2);
  c.shadowBlur = 14; c.fillStyle = "#ffd9f4"; c.fillText("THE METRO", w / 2, h / 2);
});
const neon = BABYLON.MeshBuilder.CreatePlane("neon", { width: 1.8, height: 0.45 }, scene);
neon.position.set(0, 2.3, HD - 0.08); neon.rotation.y = Math.PI;
const neonMat = mat("neonMat", { color: [0, 0, 0], roughness: 1 });
neonMat.emissiveTexture = neonTex;
neonMat.emissiveColor = new BABYLON.Color3(2.2, 0.7, 1.8);
neon.material = neonMat;
const neonLight = new BABYLON.PointLight("neonLight", new BABYLON.Vector3(0, 2.2, HD - 0.4), scene);
neonLight.diffuse = new BABYLON.Color3(1, 0.3, 0.85); neonLight.intensity = 0.5; neonLight.range = 3.5;

// =====================================================================
// shadows: register every caster, let the big surfaces receive
// =====================================================================
for (const m of casters) shadow.addShadowCaster(m, true);

// =====================================================================
// camera — first person, pointer-lock look, WASD, gravity + collision
// =====================================================================
const camera = new BABYLON.UniversalCamera("cam", new BABYLON.Vector3(0.4, 1.62, HD - 0.8), scene);
camera.setTarget(new BABYLON.Vector3(0, 1.5, -HD));
camera.attachControl(canvas, true);
camera.minZ = 0.05;
camera.fov = 1.18;
camera.speed = 0.16;
camera.inertia = 0.78;
camera.angularSensibility = 2400;
camera.keysUp = [87, 38]; camera.keysDown = [83, 40];
camera.keysLeft = [65, 37]; camera.keysRight = [68, 39];
camera.checkCollisions = true;
camera.applyGravity = true;
camera.ellipsoid = new BABYLON.Vector3(0.35, 0.85, 0.35);
camera.ellipsoidOffset = new BABYLON.Vector3(0, 0.85, 0);

// =====================================================================
// post pipeline — glow, bloom, vignette, grain, FXAA, plus SSAO + god-rays
// =====================================================================
const glow = new BABYLON.GlowLayer("glow", scene, { mainTextureSamples: 4 });
glow.intensity = 0.85;

let pipeline;
try {
  pipeline = new BABYLON.DefaultRenderingPipeline("pipeline", true, scene, [camera]);
  pipeline.fxaaEnabled = true;
  pipeline.samples = 4;
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.86;
  pipeline.bloomWeight = 0.42;
  pipeline.bloomKernel = 64;
  pipeline.bloomScale = 0.6;
  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteWeight = 2.6;
  pipeline.imageProcessing.vignetteColor = new BABYLON.Color4(0, 0, 0, 0);
  pipeline.grainEnabled = true;
  pipeline.grain.intensity = 7;
  pipeline.grain.animated = true;
  pipeline.sharpenEnabled = true;
  pipeline.sharpen.edgeAmount = 0.18;
} catch (e) { console.warn("pipeline failed", e); }

// SSAO2 for contact shadows where geometry meets the floor
try {
  if (BABYLON.SSAO2RenderingPipeline.IsSupported) {
    const ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.75, blurRatio: 1 }, [camera]);
    ssao.radius = 0.55; ssao.totalStrength = 1.1; ssao.base = 0.12; ssao.samples = 16;
    ssao.expensiveBlur = true;
  }
} catch (e) { console.warn("ssao failed", e); }

// volumetric god-rays streaming through the window
try {
  const vls = new BABYLON.VolumetricLightScatteringPostProcess(
    "godrays", 1.0, camera, sunDisc, 90, BABYLON.Texture.BILINEAR_SAMPLINGMODE, engine, false, scene);
  vls.exposure = 0.22;
  vls.decay = 0.96815;
  vls.weight = 0.46;
  vls.density = 0.93;
} catch (e) { console.warn("godrays failed", e); }

// =====================================================================
// GPU-particle dust drifting in the sunbeam
// =====================================================================
const dotTex = dyn("dot", 64, 64, (c, w, h) => {
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,250,235,1)"); g.addColorStop(1, "rgba(255,250,235,0)");
  c.fillStyle = g; c.fillRect(0, 0, w, h);
});
try {
  const useGPU = BABYLON.GPUParticleSystem.IsSupported;
  const dust = useGPU
    ? new BABYLON.GPUParticleSystem("dust", { capacity: 3000 }, scene)
    : new BABYLON.ParticleSystem("dust", 1200, scene);
  dust.particleTexture = dotTex;
  dust.emitter = new BABYLON.Vector3(0, 1.4, -0.6);
  dust.minEmitBox = new BABYLON.Vector3(-HW + 0.4, -1.2, -HD + 0.4);
  dust.maxEmitBox = new BABYLON.Vector3(HW - 0.4, 1.4, HD - 0.4);
  dust.color1 = new BABYLON.Color4(1, 0.97, 0.9, 0.5);
  dust.color2 = new BABYLON.Color4(1, 0.9, 0.8, 0.25);
  dust.colorDead = new BABYLON.Color4(1, 1, 1, 0);
  dust.minSize = 0.004; dust.maxSize = 0.014;
  dust.minLifeTime = 8; dust.maxLifeTime = 16;
  dust.emitRate = 220;
  dust.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
  dust.gravity = new BABYLON.Vector3(0, -0.002, 0);
  dust.direction1 = new BABYLON.Vector3(-0.02, 0.02, -0.02);
  dust.direction2 = new BABYLON.Vector3(0.02, 0.04, 0.02);
  dust.minEmitPower = 0.01; dust.maxEmitPower = 0.04;
  dust.updateSpeed = 0.01;
  dust.start();
} catch (e) { console.warn("dust failed", e); }

// =====================================================================
// animation loop bits (screen, lava, leds, blobs)
// =====================================================================
let T = 0;
function drawScreen(t) {
  const w = 1024, h = 332;
  sctx.fillStyle = "#0a0c14"; sctx.fillRect(0, 0, w, h);
  // a DAW-ish timeline with moving playhead + waveform lanes
  sctx.fillStyle = "#121622"; sctx.fillRect(0, 0, w, 28);
  sctx.fillStyle = "#ff3bd0"; sctx.font = "bold 16px monospace"; sctx.fillText("● THE METRO — session", 12, 20);
  const lanes = ["#2dd4bf", "#a78bfa", "#fbbf24", "#f472b6"];
  for (let L = 0; L < 4; L++) {
    const y = 44 + L * 64;
    sctx.fillStyle = "#10131c"; sctx.fillRect(8, y, w - 16, 52);
    sctx.strokeStyle = lanes[L]; sctx.lineWidth = 2; sctx.beginPath();
    for (let x = 0; x < w - 24; x += 4) {
      const a = Math.sin(x * 0.05 + t * 2 + L) * Math.sin(x * 0.013 + L * 2);
      sctx.lineTo(12 + x, y + 26 + a * (10 + L * 3));
    }
    sctx.stroke();
  }
  const px = ((t * 60) % (w - 24)) + 12;
  sctx.strokeStyle = "#fff"; sctx.lineWidth = 1; sctx.beginPath();
  sctx.moveTo(px, 28); sctx.lineTo(px, h); sctx.stroke();
  screenTex.update(false);
}

scene.onBeforeRenderObservable.add(() => {
  const dt = engine.getDeltaTime() / 1000;
  T += dt;
  drawScreen(T);
  // lava blobs bob inside the cone
  for (const b of blobs) {
    const y = 0.18 + (Math.sin(T * b._speed + b._phase) * 0.5 + 0.5) * 0.34;
    b.position.y = y;
    b.position.x = lampBaseX + Math.sin(T * b._speed * 0.7 + b._phase) * 0.03;
    const s = 0.8 + Math.sin(T * b._speed * 1.3 + b._phase) * 0.3;
    b.scaling.set(s, 1.4 - s * 0.4, s);
  }
  lampLight.intensity = 0.55 + Math.sin(T * 1.7) * 0.08;
  // rack LEDs flicker like something's processing
  scene.meshes.forEach(m => {
    if (m.name.startsWith("led") && m.material && m._baseEmis) {
      const f = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(T * (2 + m.name.length) + m.name.charCodeAt(3)));
      m.material.emissiveColor.set(m._baseEmis[0] * f, m._baseEmis[1] * f, m._baseEmis[2] * f);
    }
  });
  // neon breathes
  const nb = 1.9 + Math.sin(T * 3.0) * 0.25 + (Math.random() < 0.01 ? -1.2 : 0); // occasional flicker
  neonMat.emissiveColor.set(nb * 1.15, nb * 0.36, nb * 0.95);
});

// =====================================================================
// Havok physics — throw things around the room
// =====================================================================
let physicsReady = false;
async function initPhysics() {
  try {
    const havok = await HavokPhysics({ locateFile: (f) => "https://cdn.babylonjs.com/havok/" + f });
    scene.enablePhysics(new BABYLON.Vector3(0, -9.81, 0), new BABYLON.HavokPlugin(true, havok));
    // static colliders: floor + walls + desk so thrown objects land and bounce
    new BABYLON.PhysicsAggregate(floor, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.4, friction: 0.8 }, scene);
    for (const m of colliders) {
      if (m === floor) continue;
      try { new BABYLON.PhysicsAggregate(m, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.5 }, scene); } catch {}
    }
    physicsReady = true;
  } catch (e) { console.warn("havok unavailable — room still works, just no throwing", e); }
}

let thrown = 0;
const throwColors = [[1, 0.3, 0.35], [0.3, 0.8, 1], [1, 0.85, 0.2], [0.6, 1, 0.4], [0.9, 0.4, 1]];
function throwBall() {
  if (!physicsReady || thrown > 40) return;
  const c = throwColors[thrown % throwColors.length];
  const s = BABYLON.MeshBuilder.CreateSphere("thrown" + thrown, { diameter: 0.12, segments: 16 }, scene);
  s.position.copyFrom(camera.position).addInPlace(camera.getDirection(BABYLON.Axis.Z).scale(0.4));
  s.material = mat("thrownm" + thrown, { color: c, metallic: 0.2, roughness: 0.25, emissive: c.map(v => v * 0.25) });
  s.receiveShadows = true; shadow.addShadowCaster(s);
  const agg = new BABYLON.PhysicsAggregate(s, BABYLON.PhysicsShapeType.SPHERE, { mass: 0.6, restitution: 0.72, friction: 0.5 }, scene);
  agg.body.applyImpulse(camera.getDirection(BABYLON.Axis.Z).scale(7), s.position);
  thrown++;
}

// =====================================================================
// input + gate wiring
// =====================================================================
scene.onPointerObservable.add((p) => {
  if (p.type === BABYLON.PointerEventTypes.POINTERDOWN) {
    if (!engine.isPointerLock) engine.enterPointerlock();
    else throwBall(); // locked + click = throw
  }
});

// resize
window.addEventListener("resize", () => engine.resize());

// render
engine.runRenderLoop(() => scene.render());

// build is synchronous; physics loads after so the room can paint immediately
progress(70, "almost…");
scene.whenReadyAsync().then(async () => {
  progress(88, "physics…");
  await initPhysics();
  progress(100, "enter ▸");
  enterBtn.disabled = false;
});

let entered = false;
function enter() {
  if (entered) return; entered = true;
  gate.classList.add("gone");
  badge.classList.add("show");
  hint.textContent = "WASD move · mouse look · click to throw · Esc to free cursor";
  hint.classList.add("show");
  setTimeout(() => hint.classList.remove("show"), 6500);
  canvas.focus();
  engine.enterPointerlock();
}
enterBtn.addEventListener("click", enter);

// expose for the smoke-test harness, mirroring window.METRO_DEBUG
window.METRO_BJS = { engine, scene, camera, throwBall, BABYLON };
