// THE METRO — bedroom, rebuilt in Babylon.js 9 (faithful port of the three.js room).
//
// phase 1 of the engine migration. this is a 1:1 reconstruction of the real studio:
// same ROOM box (X 2.6, ZF -3.3, ZB 3.3, H 2.7), same objects in the same places —
// the desk rig, the music rig (drums, Tele, pedals, mixer, Kali monitors, rack, radio),
// the LA window, the cat + its corner, the lava lamp, the neon, the closet, the lot.
//
// we keep the three.js coordinates VERBATIM by running Babylon right-handed, then add the
// things three.js made us fake: real PBR + IBL reflections, a shadow-casting sun, god-rays
// through the glass, GlowLayer+bloom on every emissive, GPU-particle dust, and Havok you
// can throw things with. still 100% procedural — no asset files.

const B = window.BABYLON;
const V3 = B.Vector3;
const canvas = document.getElementById("stage");
const gate = document.getElementById("gate");
const enterBtn = document.getElementById("enter-btn");
const loadbar = document.querySelector("#loadbar > i");
const hint = document.getElementById("hint");
const badge = document.getElementById("badge");
const setProg = (p, l) => { loadbar.style.width = Math.round(p) + "%"; if (l) enterBtn.textContent = l; };

// ---- the room, exactly as world.js defines it ----
const ROOM = { X: 2.6, ZF: -3.3, ZB: 3.3, H: 2.7 };
const W = ROOM.X * 2, D = ROOM.ZB - ROOM.ZF, H = ROOM.H, X = ROOM.X, ZF = ROOM.ZF, ZB = ROOM.ZB;
const WIN = { w: 3.6, h: 1.4, cx: 0, cy: 1.6 };

// =====================================================================
// engine + scene (right-handed so three.js coords/rotations port literally)
// =====================================================================
const engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true, powerPreference: "high-performance" });
engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));
const scene = new B.Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = B.Color3.FromHexString("#07080b").toColor4(1);
scene.collisionsEnabled = true;
scene.gravity = new V3(0, -0.5, 0);
scene.fogMode = B.Scene.FOGMODE_LINEAR; scene.fogColor = B.Color3.FromHexString("#07080b"); scene.fogStart = 14; scene.fogEnd = 44;

const ip = scene.imageProcessingConfiguration;
ip.toneMappingEnabled = true; ip.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
ip.exposure = 0.9; ip.contrast = 1.18;
// cinematic color grade — warm highlights, cool shadows (subtle teal/orange depth)
ip.colorCurvesEnabled = true;
const grade = new B.ColorCurves();
grade.globalSaturation = 6;
grade.highlightsHue = 32; grade.highlightsDensity = 22; grade.highlightsSaturation = 12;
grade.shadowsHue = 220; grade.shadowsDensity = 16; grade.shadowsSaturation = 14;
ip.colorCurves = grade;

const envTex = B.CubeTexture.CreateFromPrefilteredData("https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
scene.environmentTexture = envTex;
scene.environmentIntensity = 0.16;

// =====================================================================
// helpers
// =====================================================================
const C = (hex) => new B.Color3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
const casters = [];
const glowMats = [];

function matte(name, hex, { rough = 0.9 } = {}) {
  const m = new B.StandardMaterial(name, scene);
  m.diffuseColor = C(hex); m.specularColor = new B.Color3(0.04, 0.04, 0.04); m.specularPower = 24;
  return m;
}
function metal(name, hex, metallic = 0.8, roughness = 0.35) {
  const m = new B.PBRMetallicRoughnessMaterial(name, scene);
  m.baseColor = C(hex); m.metallic = metallic; m.roughness = roughness;
  return m;
}
function emis(name, hex, { glow = true, add = false, alpha = 1 } = {}) {
  const m = new B.StandardMaterial(name, scene);
  m.emissiveColor = C(hex); m.diffuseColor = new B.Color3(0, 0, 0); m.disableLighting = true;
  if (alpha < 1) { m.alpha = alpha; }
  if (add) m.alphaMode = B.Engine.ALPHA_ADD;
  if (glow) glowMats.push(m);
  return m;
}
function glassMat(name, hex, alpha = 0.2, rough = 0.05) {
  const m = new B.PBRMetallicRoughnessMaterial(name, scene);
  m.baseColor = C(hex); m.metallic = 0; m.roughness = rough; m.alpha = alpha;
  m.transparencyMode = B.Material.MATERIAL_ALPHABLEND; m.environmentIntensity = 1.0;
  return m;
}
function dyn(name, w, h, draw, { flip = false } = {}) {
  const t = new B.DynamicTexture(name, { width: w, height: h }, scene, true);
  draw(t.getContext(), w, h); t.update(false);
  if (flip) { t.vScale = -1; t.vOffset = 1; }
  return t;
}
function node(name, x = 0, y = 0, z = 0, parent = null) {
  const n = new B.TransformNode(name, scene);
  n.position.set(x, y, z); if (parent) n.parent = parent; return n;
}
function box(name, w, h, d, x, y, z, m, parent = null, cast = true) {
  const me = B.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
  me.position.set(x, y, z); me.material = m; me.receiveShadows = true;
  if (parent) me.parent = parent; if (cast) casters.push(me); return me;
}
function plane(name, w, h, m, parent = null) {
  const me = B.MeshBuilder.CreatePlane(name, { width: w, height: h, sideOrientation: B.Mesh.DOUBLESIDE }, scene);
  me.material = m; me.receiveShadows = true; if (parent) me.parent = parent; return me;
}
function cyl(name, dTop, dBot, height, x, y, z, m, parent = null, tess = 16, cast = true) {
  const me = B.MeshBuilder.CreateCylinder(name, { diameterTop: dTop * 2, diameterBottom: dBot * 2, height, tessellation: tess }, scene);
  me.position.set(x, y, z); me.material = m; me.receiveShadows = true;
  if (parent) me.parent = parent; if (cast) casters.push(me); return me;
}
function sph(name, dia, x, y, z, m, parent = null, cast = true) {
  const me = B.MeshBuilder.CreateSphere(name, { diameter: dia, segments: 12 }, scene);
  me.position.set(x, y, z); me.material = m; me.receiveShadows = true;
  if (parent) me.parent = parent; if (cast) casters.push(me); return me;
}

// =====================================================================
// procedural textures (the canvas-texture habit, ported)
// =====================================================================
const carpetTex = dyn("carpet", 800, 1024, (c, w, h) => {
  c.fillStyle = "#6e6557"; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 42000; i++) { const v = 84 + Math.random() * 44; c.fillStyle = `rgba(${v},${v - 8},${v - 18},${0.2 + Math.random() * 0.3})`; c.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4); }
  for (let i = 0; i < 5000; i++) { const v = 70 + Math.random() * 26; c.fillStyle = `rgba(${v},${v - 6},${v - 14},.35)`; c.fillRect(Math.random() * w, Math.random() * h, 2.6, 1.2); }
  for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? "rgba(0,0,0,.03)" : "rgba(255,250,240,.025)"; c.fillRect((i * 140 + 30) % w, 0, 60, h); }
});
function wallTex(name, wm, hm) {
  const ppm = 96, w = Math.round(wm * ppm), h = Math.round(hm * ppm);
  return dyn(name, w, h, (c) => {
    c.fillStyle = "#e4dccb"; c.fillRect(0, 0, w, h);
    // clean drywall — just a whisper of paint-roller texture, no scuffs/handprints
    for (let i = 0; i < (w * h / 1400); i++) { c.fillStyle = `rgba(120,108,88,${Math.random() * 0.015})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    c.fillStyle = "#cfc6b2"; c.fillRect(0, h - 0.1 * ppm, w, 0.1 * ppm);
    c.fillStyle = "rgba(0,0,0,.18)"; c.fillRect(0, h - 0.1 * ppm, w, 3);
  });
}
const deskTex = dyn("desk", 1024, 512, (c, w, h) => {
  c.fillStyle = "#3a2a1c"; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 80; i++) { const y = (i / 80) * h + (Math.random() - 0.5) * 6; c.strokeStyle = `rgba(${90 + Math.random() * 50},${60 + Math.random() * 30},${36 + Math.random() * 20},.4)`; c.lineWidth = 1 + Math.random() * 2; c.beginPath(); for (let x = 0; x <= w; x += 16) c.lineTo(x, y + Math.sin(x * 0.02 + i) * 4); c.stroke(); }
  const g = c.createRadialGradient(820, 360, 8, 820, 360, 64); g.addColorStop(.82, "rgba(20,12,6,0)"); g.addColorStop(.9, "rgba(20,12,6,.4)"); g.addColorStop(1, "rgba(20,12,6,0)"); c.fillStyle = g; c.beginPath(); c.arc(820, 360, 64, 0, 7); c.fill();
});
const rackFaceTex = dyn("rackface", 256, 360, (c, w, h) => {
  c.fillStyle = "#0e1013"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#1c2025"; c.fillRect(0, 0, 18, h); c.fillRect(238, 0, 18, h);
  c.fillStyle = "#000"; for (let y = 8; y < h; y += 22) { c.fillRect(6, y, 7, 7); c.fillRect(243, y, 7, 7); }
  const unit = (y, hh, draw) => { c.fillStyle = "#15181d"; c.fillRect(20, y, 196, hh); c.strokeStyle = "#000"; c.strokeRect(20, y, 196, hh); draw(y); };
  unit(8, 52, (y) => { c.fillStyle = "#d8dee4"; c.font = "700 13px monospace"; c.fillText("PWR", 30, y + 30); for (let i = 0; i < 8; i++) { c.fillStyle = i < 6 ? "#3be07a" : "#222"; c.fillRect(110 + i * 14, y + 20, 8, 12); } });
  unit(64, 52, (y) => { for (let i = 0; i < 4; i++) { c.fillStyle = "#2a2e35"; c.beginPath(); c.arc(50 + i * 46, y + 24, 13, 0, 7); c.fill(); c.strokeStyle = "#888"; c.beginPath(); c.moveTo(50 + i * 46, y + 24); c.lineTo(50 + i * 46, y + 14); c.stroke(); } c.fillStyle = "#e0653a"; c.fillRect(208, y + 18, 8, 8); });
  unit(120, 100, (y) => { c.fillStyle = "#0a0c0e"; for (let k = 0; k < 7; k++) c.fillRect(28, y + 8 + k * 12, 180, 5); });
  unit(224, 52, (y) => { c.fillStyle = "#0a0b0d"; for (let r = 0; r < 2; r++) for (let i = 0; i < 12; i++) { c.beginPath(); c.arc(38 + i * 15, y + 18 + r * 18, 5, 0, 7); c.fill(); } });
});
const kaliTex = dyn("kali", 256, 420, (c, w, h) => {
  c.fillStyle = "#17191c"; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`; c.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
  let g = c.createRadialGradient(128, 110, 4, 128, 110, 58); g.addColorStop(0, "#0a0b0d"); g.addColorStop(.6, "#22262b"); g.addColorStop(1, "#101216"); c.fillStyle = g; c.beginPath(); c.arc(128, 110, 58, 0, 7); c.fill();
  c.fillStyle = "#06070a"; c.beginPath(); c.arc(128, 110, 22, 0, 7); c.fill();
  g = c.createRadialGradient(128, 268, 6, 128, 268, 86); g.addColorStop(0, "#1d2024"); g.addColorStop(.4, "#0b0c0f"); g.addColorStop(.7, "#23272c"); g.addColorStop(1, "#0a0b0d"); c.fillStyle = g; c.beginPath(); c.arc(128, 268, 86, 0, 7); c.fill();
  c.fillStyle = "#15181c"; c.beginPath(); c.arc(128, 268, 26, 0, 7); c.fill();
  c.fillStyle = "#000"; c.fillRect(48, 374, 160, 22);
  c.fillStyle = "#9aa3ad"; c.font = "700 17px monospace"; c.fillText("KALI", 22, 40);
  c.fillStyle = "#3be07a"; c.fillRect(222, 392, 6, 6);
}, { flip: true });
const keysTex = dyn("keys", 440, 115, (c, w, h) => {
  c.fillStyle = "#d9dbdd"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#f4f5f6"; for (let y = 8; y < 105; y += 21) for (let x = 6; x < 431; x += 24) c.fillRect(x, y, 20, 17);
  c.fillStyle = "rgba(160,164,170,.5)"; c.fillRect(54, 50, 20, 17); c.fillRect(78, 50, 20, 17); c.fillRect(102, 50, 20, 17); c.fillRect(126, 92, 120, 15);
});
const blindsTex = dyn("blinds", 720, 280, (c, w, h) => {
  const slat = 19, gap = 11;
  for (let x = 0; x < w; x += slat + gap) { const g = c.createLinearGradient(x, 0, x + slat, 0); g.addColorStop(0, "rgba(176,169,152,.94)"); g.addColorStop(.5, "rgba(140,133,116,.94)"); g.addColorStop(1, "rgba(104,98,84,.94)"); c.fillStyle = g; c.fillRect(x, 0, slat, h); }
  c.fillStyle = "rgba(120,113,97,1)"; c.fillRect(0, 0, w, 10);
});

// ---- the LA window sky — redrawn for the real time of day (drawSky below) ----
const skyTex = new B.DynamicTexture("sky", { width: 720, height: 280 }, scene, true);
skyTex.vScale = -1; skyTex.vOffset = 1;
const skyStars = Array.from({ length: 90 }, () => ({ x: Math.random() * 720, y: Math.random() * 200, r: Math.random() }));
const rnd = (i) => { const v = Math.abs(Math.sin(i * 127.1) * 43758.5453); return v - Math.floor(v); };
const TOWERS = [78, 64, 96, 58, 110, 72, 122, 66, 88, 96, 54];
// sunAz/sunAlt/moonAlt in radians, frac = moon illumination, clouds 0..1
function drawSky(sunAz, sunAlt, moonAlt, frac, clouds) {
  const c = skyTex.getContext(), w = 720, h = 280, aD = sunAlt * 180 / Math.PI;
  let top, bot;
  if (aD > 5) { top = "#7fb2e0"; bot = "#c8dcec"; }
  else if (aD > -6) { top = "#2a3c5e"; bot = "#d88a52"; }
  else if (aD > -12) { top = "#141d33"; bot = "#3a3550"; }
  else { top = "#0a0f1f"; bot = "#1a2030"; }
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, top); g.addColorStop(1, bot); c.fillStyle = g; c.fillRect(0, 0, w, h);
  // stars when dark and clear
  if (aD < -8 && clouds < 0.55) for (const s of skyStars) { c.fillStyle = `rgba(255,255,255,${(0.25 + s.r * 0.5) * (1 - clouds)})`; const sz = s.r > 0.8 ? 2 : 1.4; c.fillRect(s.x, s.y, sz, sz); }
  // night sky-glow band over downtown
  if (aD < -4) { const ng = c.createLinearGradient(0, 280, 0, 160); ng.addColorStop(0, "rgba(255,150,70,.4)"); ng.addColorStop(1, "rgba(255,150,70,0)"); c.fillStyle = ng; c.fillRect(0, 160, w, 120); }
  // the sun, mapped from az/alt to the canvas
  const azD = sunAz * 180 / Math.PI;
  if (aD > -2 && Math.abs(azD) < 75) {
    const sx = 360 + (azD / 60) * 320, sy = 250 - (Math.min(aD, 60) / 60) * 235;
    const gl = c.createRadialGradient(sx, sy, 4, sx, sy, 130); gl.addColorStop(0, "rgba(255,247,224,.92)"); gl.addColorStop(.35, "rgba(255,220,150,.4)"); gl.addColorStop(1, "rgba(255,200,120,0)"); c.fillStyle = gl; c.fillRect(sx - 140, sy - 140, 280, 280);
    if (aD > -1) { c.fillStyle = "#fff7e0"; c.beginPath(); c.arc(sx, sy, 16, 0, 7); c.fill(); }
  }
  // skyline (far ridge + downtown), day vs night palette
  const night = aD < -4;
  c.fillStyle = night ? "rgba(12,14,22,.95)" : "rgba(70,60,80,.8)";
  for (let i = 0; i < 26; i++) { const x = i * 30 - 12, bw = 20 + rnd(i) * 20, bh = 12 + rnd(i + 9) * 16; c.fillRect(x, h - bh, bw, bh); }
  let x = 340;
  for (let i = 0; i < TOWERS.length; i++) {
    const bh = TOWERS[i], bw = 24 + rnd(i + 3) * 16, t = h - bh;
    c.fillStyle = night ? "#0c0e16" : "rgba(70,80,95,.9)"; c.fillRect(x, t, bw, bh);
    if (night) for (let k = 0; k < (bh * bw) / 48; k++) { const wr = rnd(i * 31 + k); if (wr < 0.5) { c.fillStyle = wr < 0.12 ? "rgba(170,210,255,.8)" : `rgba(255,${200 + wr * 40},130,${0.45 + wr * 0.4})`; c.fillRect(x + 3 + (k * 7) % (bw - 6), t + 6 + ((k * 11) % (bh - 10)), 1.8, 2.4); } }
    if (bh === 122 && night) { c.fillStyle = "#ff2030"; c.fillRect(x + bw - 3, t - 3, 4, 4); }
    x += bw + 4 + rnd(i + 7) * 12;
  }
  // clouds
  if (clouds > 0.1) { const dk = aD > 0 ? 225 : 38; for (let i = 0; i < clouds * 16; i++) { c.fillStyle = `rgba(${dk},${dk},${dk + 6},${0.1 + clouds * 0.16})`; c.beginPath(); c.ellipse(((i * 137) % 760) - 20, 20 + ((i * 71) % 140), 90 + (i * 31) % 70, 22 + (i * 13) % 16, 0, 0, 7); c.fill(); } }
  // moon with phase (when up and sky dark enough)
  if (moonAlt > 0 && aD < 2) { const mx = 200, my = 230 - (Math.min(moonAlt * 180 / Math.PI, 60) / 60) * 200, br = 0.55 + 0.45 * frac; c.fillStyle = `rgba(235,240,248,${br})`; c.beginPath(); c.arc(mx, my, 13, 0, 7); c.fill(); c.fillStyle = "rgba(10,15,31,.85)"; c.beginPath(); c.arc(mx + 26 * (1 - frac) * 0.6, my, 13, 0, 7); c.fill(); }
  skyTex.update(false);
}
const rainTex = dyn("rain", 256, 256, (c, w, h) => {
  for (let i = 0; i < 46; i++) { const x = Math.random() * w, y = Math.random() * h, len = 18 + Math.random() * 60; const g = c.createLinearGradient(x, y, x, y + len); g.addColorStop(0, "rgba(200,220,240,0)"); g.addColorStop(.8, `rgba(200,220,240,${0.25 + Math.random() * 0.3})`); g.addColorStop(1, "rgba(230,240,250,.6)"); c.fillStyle = g; c.fillRect(x, y, 1.4, len); c.fillStyle = "rgba(220,235,250,.5)"; c.fillRect(x - 0.6, y + len, 2.6, 2.6); }
});

// =====================================================================
// SHELL — floor, ceiling, four walls (window + closet openings framed)
// =====================================================================
const floor = B.MeshBuilder.CreateGround("floor", { width: W, height: D }, scene);
const floorMat = new B.StandardMaterial("floorMat", scene); floorMat.diffuseTexture = carpetTex; floorMat.specularColor = new B.Color3(0.02, 0.02, 0.02); floor.material = floorMat; floor.receiveShadows = true; floor.checkCollisions = false; // eye height is pinned; colliding with the floor only dragged movement

const ceil = B.MeshBuilder.CreateGround("ceil", { width: W, height: D }, scene);
ceil.material = matte("ceilMat", 0xd6cfc0); ceil.position.y = H; ceil.rotation.x = Math.PI; ceil.receiveShadows = true;

function wallMatFor(name, wm, hm) { const m = new B.StandardMaterial(name, scene); m.diffuseTexture = wallTex(name + "T", wm, hm); m.specularColor = new B.Color3(0.02, 0.02, 0.02); m.backFaceCulling = false; return m; }
function wallSeg(name, w, h, x, y, z, ry, m, collide = true) { const me = box(name, w, h, 0.12, x, y, z, m); me.rotation.y = ry; if (collide) { me.checkCollisions = true; } return me; }

const backMat = wallMatFor("back", W, H), eastMat = wallMatFor("east", D, H), westMat = wallMatFor("west", D, H), frontMat = wallMatFor("front", W, H);
// back (z=+3.3), east (x=+2.6) solid
wallSeg("wBack", W, H, 0, H / 2, ZB, 0, backMat);
wallSeg("wEast", D, H, X, H / 2, 0, Math.PI / 2, eastMat);
// west (x=-2.6) with closet hole z∈[-1.15,0.35], y∈[0,2.03]
wallSeg("wWest_a", 3.3 - 1.15, H, X * -1, H / 2, (ZF + -1.15) / 2, Math.PI / 2, westMat); // z -3.3..-1.15
wallSeg("wWest_b", 3.3 - 0.35, H, X * -1, H / 2, (0.35 + ZB) / 2, Math.PI / 2, westMat);   // z 0.35..3.3
wallSeg("wWest_top", 1.5, H - 2.03, X * -1, (2.03 + H) / 2, -0.4, Math.PI / 2, westMat, false); // above closet
// front (z=-3.3) with window hole x∈[-1.8,1.8], y∈[0.9,2.3]
wallSeg("wFront_l", X - 1.8, H, -(1.8 + X) / 2, H / 2, ZF, 0, frontMat);
wallSeg("wFront_r", X - 1.8, H, (1.8 + X) / 2, H / 2, ZF, 0, frontMat);
wallSeg("wFront_b", 3.6, 0.9, 0, 0.45, ZF, 0, frontMat, false);
wallSeg("wFront_t", 3.6, H - 2.3, 0, (2.3 + H) / 2, ZF, 0, frontMat, false);

// =====================================================================
// THE WINDOW — frame, sill, glass(LA sky), rain, blinds, curtains, rod
// =====================================================================
const frameMat = matte("winframe", 0xcfc6b2);
box("winTop", 3.72, 0.07, 0.06, 0, 2.335, ZF + 0.03, frameMat, null, false);
box("winBot", 3.72, 0.07, 0.06, 0, 0.865, ZF + 0.03, frameMat, null, false);
box("winL", 0.07, 1.54, 0.06, -1.835, 1.6, ZF + 0.03, frameMat, null, false);
box("winR", 0.07, 1.54, 0.06, 1.835, 1.6, ZF + 0.03, frameMat, null, false);
box("winSill", WIN.w + 0.2, 0.04, 0.14, 0, 0.81, ZF + 0.07, frameMat, null, false);
cyl("winRod", 0.014, 0.014, WIN.w + 0.7, 0, 2.6, ZF + 0.11, matte("rod", 0x4a443a), null, 8, false).rotation.z = Math.PI / 2;

const skyMat = emis("skyMat", 0xffffff, { glow: false }); skyMat.emissiveTexture = skyTex; skyMat.emissiveColor = new B.Color3(0.5, 0.49, 0.48);
const glass = plane("glass", WIN.w, WIN.h, skyMat); glass.position.set(0, 1.6, ZF + 0.01);
const glassFront = plane("glassPane", WIN.w, WIN.h, glassMat("glassPane", 0x9fc0e0, 0.12, 0.04)); glassFront.position.set(0, 1.6, ZF + 0.015);

const rainMat = emis("rainMat", 0xffffff, { glow: false, alpha: 0.0 }); rainMat.emissiveTexture = rainTex; rainMat.emissiveColor = new B.Color3(0.6, 0.7, 0.8); rainMat.alpha = 0; rainMat.useAlphaFromDiffuseTexture = false;
const rainPane = plane("rain", WIN.w, WIN.h, rainMat); rainPane.position.set(0, 1.6, ZF + 0.02); rainPane.isVisible = false;

// blinds — gathered to the left so the LA view shows
const blindsMat = new B.StandardMaterial("blindsMat", scene); blindsMat.diffuseTexture = blindsTex; blindsMat.diffuseTexture.hasAlpha = true; blindsMat.useAlphaFromDiffuseTexture = true; blindsMat.backFaceCulling = false; blindsMat.specularColor = new B.Color3(0, 0, 0);
const blinds = plane("blinds", WIN.w - 0.06, WIN.h - 0.04, blindsMat); blinds.position.set(WIN.cx - (WIN.w - 0.06) / 2 + 0.42, 1.6, ZF + 0.045); blinds.scaling.x = 0.18;

// blackout curtains — tied to the sides
const curtMat = matte("curtain", 0x2b2620);
[-1, 1].forEach((side) => {
  const piv = node("curtPivot" + side, side * (WIN.w / 2 + 0.12), WIN.cy + 0.08, ZF + 0.10);
  box("curtain" + side, 1, WIN.h + 0.5, 0.05, -side * 0.5, 0, 0, curtMat, piv);
  for (let i = 1; i <= 4; i++) box("curtFold" + side + i, 0.022, WIN.h + 0.5, 0.064, -side * (i / 5), 0, 0.01, curtMat, piv, false);
  piv.scaling.x = 0.5; // open
});

// =====================================================================
// ACOUSTIC PANELS — dark slabs with warm LED halo
// =====================================================================
const panelMat = matte("panelMat", 0x23262e);
const ledRimMat = emis("ledRim", 0xffc46a, { add: true, alpha: 0.85 });
function panelSlab(name, w, h, x, y, z, ry) {
  const slab = box(name, w, h, 0.07, x, y, z, panelMat); slab.rotation.y = ry;
  const rim = node(name + "rim", x, y, z); rim.rotation.y = ry;
  box(name + "rt", w + 0.07, 0.02, 0.012, 0, h / 2 + 0.035, -0.022, ledRimMat, rim, false);
  box(name + "rb", w + 0.07, 0.02, 0.012, 0, -(h / 2 + 0.035), -0.022, ledRimMat, rim, false);
  box(name + "rl", 0.02, h + 0.07, 0.012, -(w / 2 + 0.035), 0, -0.022, ledRimMat, rim, false);
  box(name + "rr", 0.02, h + 0.07, 0.012, (w / 2 + 0.035), 0, -0.022, ledRimMat, rim, false);
}
// back wall panels (z=+3.3, face -z)
[0.56, 1.72, 2.88, 4.04].forEach((u, i) => panelSlab("pB" + i, 0.6, 1.2, 2.6 - (u + 0.3), 1.6, ZB - 0.038, Math.PI));
// east wall panels (x=+2.6, face -x)
[0.58, 1.71, 2.85, 3.98].forEach((u, i) => panelSlab("pE" + i, 0.55, 1.2, X - 0.038, 1.6, -3.3 + (u + 0.275), -Math.PI / 2));
// west wall panels (x=-2.6, face +x) — the wall with the closet/arcade door.
// z given directly: a trio on the back side of the closet, an EVEN matched pair on
// the front side (both 0.55, evenly spaced — was an uneven 0.28 + 0.55).
[[2.715, 0.55], [1.855, 0.55], [0.995, 0.55], [-1.7, 0.55], [-2.7, 0.55]].forEach(([z, pw], i) => panelSlab("pW" + i, pw, 1.2, -X + 0.038, 1.6, z, Math.PI / 2));
// (the window wall is kept clean — no panels)

// =====================================================================
// CLOSET opening (frame + open leaves) and the passage mouth
// =====================================================================
const CZ = -0.4, OPEN_W = 1.5, OPEN_H = 2.03;
const cfm = matte("closetFrame", 0xc4bba6);
box("cJ1", 0.08, OPEN_H + 0.06, 0.06, -X + 0.01, (OPEN_H + 0.06) / 2, CZ - (OPEN_W / 2 + 0.03), cfm, null, false);
box("cJ2", 0.08, OPEN_H + 0.06, 0.06, -X + 0.01, (OPEN_H + 0.06) / 2, CZ + (OPEN_W / 2 + 0.03), cfm, null, false);
box("cHead", 0.08, 0.06, OPEN_W + 0.12, -X + 0.01, OPEN_H + 0.03, CZ, cfm, null, false);
box("cThresh", 0.1, 0.025, OPEN_W, -X, 0.012, CZ, matte("thresh", 0x8a6a4a), null, false);
// a dark recess behind the opening so it reads as depth
box("cRecess", 0.9, OPEN_H, OPEN_W, -X - 0.46, OPEN_H / 2, CZ, matte("recess", 0x14120f), null, false);
const leafMat = matte("leaf", 0xd8d0bd);
[[0.35, -OPEN_W / 4, 1.5], [-1.15, OPEN_W / 4, -1.5]].forEach(([hz, lz, ry], i) => {
  const hinge = node("cHinge" + i, -X + 0.035, 0, hz); hinge.rotation.y = ry;
  box("cLeaf" + i, 0.045, OPEN_H, OPEN_W / 2, 0, OPEN_H / 2, lz, leafMat, hinge);
});

// =====================================================================
// ENTRY DOOR (east wall) + METRO neon + dimmer + ceiling fixture
// =====================================================================
const entry = node("entry", X - 0.035, 0, 2.3); entry.rotation.y = -Math.PI / 2;
box("entryLeaf", 0.86, 2.03, 0.045, 0, 1.015, 0, matte("doorLeaf", 0xd8d0bd), entry, false);
const neonTex = dyn("neon", 512, 128, (c, w, h) => {
  c.fillStyle = "#000"; c.fillRect(0, 0, w, h);
  c.textAlign = "center"; c.textBaseline = "middle"; c.font = "700 78px Archivo, sans-serif";
  c.shadowColor = "#ff4d2e"; c.shadowBlur = 26; c.strokeStyle = "#ff6a4a"; c.lineWidth = 3; c.strokeText("METRO", w / 2, h / 2 + 4);
  c.shadowBlur = 8; c.fillStyle = "#fff1ec"; c.fillText("METRO", w / 2, h / 2 + 4);
}, { flip: true });
box("neonPlaque", 0.68, 0.19, 0.012, 0, 1.62, 0.062, matte("plaque", 0x141518), entry, false);
const neonMat = emis("neonMat", 0xffffff, { add: true }); neonMat.emissiveTexture = neonTex; neonMat.emissiveColor = new B.Color3(2.2, 0.55, 0.35);
const neon = plane("neon", 0.62, 0.155, neonMat); neon.parent = entry; neon.position.set(0, 1.62, 0.075);
// dimmer + ceiling fixture
box("dimPlate", 0.025, 0.14, 0.09, X - 0.035, 1.3, 1.78, matte("dim", 0xe8e2d4), null, false);
cyl("dimKnob", 0.018, 0.02, 0.02, X - 0.055, 1.3, 1.78, matte("dimk", 0xb8b2a4), null, 12, false).rotation.z = Math.PI / 2;
cyl("fixture", 0.16, 0.19, 0.05, 0, H - 0.03, 0.4, matte("fix", 0xd8d2c4), null, 16, false);
const fixtureGlow = cyl("fixtureGlow", 0.13, 0.13, 0.012, 0, H - 0.058, 0.4, emis("fixGlow", 0x222222, { glow: false }), null, 16, false);
const roomLamp = new B.PointLight("roomLamp", new V3(0, H - 0.35, 0.4), scene); roomLamp.diffuse = C(0xffe2b8); roomLamp.intensity = 0; roomLamp.range = 9;

// =====================================================================
// DESK RIG — desk(0.2,0,-2.81), D-Box, ultrawide+DAW, keyboard, trackball, Mac
// =====================================================================
const desk = node("desk", 0.2, 0, ZF + 0.49);
box("deskTop", 1.9, 0.04, 0.78, 0, 0.72, 0, (() => { const m = new B.StandardMaterial("deskTopM", scene); m.diffuseTexture = deskTex; m.specularColor = new B.Color3(0.08, 0.07, 0.05); return m; })(), desk).checkCollisions = true;
[-0.88, 0.88].forEach((lx) => box("deskLeg" + lx, 0.05, 0.7, 0.7, lx, 0.35, 0, matte("deskLeg", 0x16181b), desk, false));
// (D-Box removed — the ultrawide stands on its own)
// ultrawide + animated DAW screen
box("monBezel", 0.94, 0.41, 0.03, 0, 1.04, -0.21, matte("monBezel", 0x0c0d10), desk);
const dawTex = new B.DynamicTexture("daw", { width: 1024, height: 434 }, scene, false);
const dawMat = emis("dawMat", 0xffffff, { glow: false }); dawMat.emissiveTexture = dawTex; dawMat.emissiveColor = new B.Color3(1, 1, 1);
const monScreen = plane("monScreen", 0.92, 0.39, dawMat); monScreen.parent = desk; monScreen.position.set(0, 1.04, -0.194); monScreen.rotation.y = Math.PI;
// keyboard + trackball
const kb = box("kb", 0.44, 0.012, 0.115, -0.04, 0.748, 0.13, matte("kb", 0xd9dbdd), desk, false); kb.rotation.x = -0.04;
const kbTopMat = new B.StandardMaterial("kbTop", scene); kbTopMat.diffuseTexture = keysTex; kbTopMat.specularColor = new B.Color3(0.05, 0.05, 0.05);
const kbTop = plane("kbTop", 0.44, 0.115, kbTopMat); kbTop.parent = desk; kbTop.position.set(-0.04, 0.7555, 0.13); kbTop.rotation.x = Math.PI / 2 + 0.04;
box("tbBase", 0.1, 0.035, 0.12, 0.34, 0.7575, 0.12, matte("tbBase", 0x202327), desk, false);
sph("tbBall", 0.052, 0.34, 0.785, 0.105, metal("tbBall", 0x8a1f2d, 0.2, 0.25), desk);
// Mac Studio + portable monitor
box("mac", 0.2, 0.095, 0.2, 0.66, 0.7875, -0.18, metal("mac", 0xc9ccd1, 0.6, 0.45), desk);
box("pmBezel", 0.35, 0.225, 0.012, -0.58, 0.95, -0.16, matte("pmBezel", 0x0c0d10), desk).rotation.x = -0.12;
const meterTex = new B.DynamicTexture("meter", { width: 330, height: 200 }, scene, false);
const pmMat = emis("pmMat", 0xffffff, { glow: false }); pmMat.emissiveTexture = meterTex; pmMat.emissiveColor = new B.Color3(1, 1, 1);
const pmScreen = plane("pmScreen", 0.33, 0.2, pmMat); pmScreen.parent = desk; pmScreen.position.set(-0.58, 0.95, -0.153); pmScreen.rotation.x = -0.12; pmScreen.rotation.y = Math.PI;
// clock + mug
box("clockBody", 0.17, 0.07, 0.05, -0.58, 0.775, -0.15, matte("clock", 0x101216), desk, false).rotation.x = -0.1;
const clockTex = new B.DynamicTexture("clock", { width: 310, height: 116 }, scene, false);
const clockMat = emis("clockMat", 0xffffff, { glow: false }); clockMat.emissiveTexture = clockTex; clockMat.emissiveColor = new B.Color3(1, 1, 1);
const clockFace = plane("clockFace", 0.155, 0.058, clockMat); clockFace.parent = desk; clockFace.position.set(-0.58, 0.7755, -0.123); clockFace.rotation.y = Math.PI;
cyl("mug", 0.035, 0.032, 0.09, 0.49, 0.785, 0.04, matte("mug", 0xd8cdb8), desk, 14, false);
cyl("coffee", 0.029, 0.029, 0.004, 0.49, 0.828, 0.04, matte("coffee", 0x2a1c10), desk, 14, false);
// channel mixer (child of desk) + MIDI keybed
const mixer = node("mixer", 0.05, 0.74, 0.02, desk); mixer.rotation.x = -0.12;
box("mixChassis", 0.3, 0.04, 0.2, 0, 0.02, 0, matte("mixCh", 0x15171b), mixer, false);
const mixZ = (pct) => 0.058 + (-0.116) * Math.min(pct, 150) / 150;
const faderCaps = [];
[[-0.09, 0x4fbfe6], [0, 0xff7a3c], [0.09, 0x6bff8a]].forEach(([px, col], i) => {
  box("mixSlot" + i, 0.01, 0.006, 0.135, px, 0.044, 0, matte("mixSlot", 0x0a0b0d), mixer, false);
  const cap = box("mixCap" + i, 0.036, 0.02, 0.022, px, 0.052, mixZ(100), matte("mixCap" + i, col), mixer, false); faderCaps.push(cap);
  box("mixLed" + i, 0.008, 0.008, 0.005, px, 0.044, 0.084, emis("mixLed" + i, col), mixer, false);
});
box("midiBody", 0.96, 0.065, 0.27, 0, 0.46, 0.27, matte("midi", 0x191b1f), desk, false);
const midiMat = new B.StandardMaterial("midiKeys", scene); midiMat.diffuseTexture = keysTex; midiMat.specularColor = new B.Color3(0.05, 0.05, 0.05);
const midiKeys = plane("midiKeys", 0.9, 0.1, midiMat); midiKeys.parent = desk; midiKeys.position.set(0, 0.494, 0.345); midiKeys.rotation.x = Math.PI / 2;

// =====================================================================
// MUSIC RIG — drum kit, telecaster, pedalboard+wah, kb pedals, kali, rack+radio
// =====================================================================
// --- electronic drum kit (Simmons hex pads, cyan rims) ---
const ekit = node("ekit", -1.95, 0, -2.6); ekit.rotation.y = 0.85;
const padMat = matte("padMat", 0x141417), faceMat = matte("padFace", 0x202126), tubeMat = matte("tube", 0x26282e);
const rimMat = emis("rimMat", 0x39c2ff);
function hexPad(name, r, x, y, lean, parent) {
  const g = node(name, x, y, 0.04, parent); g.rotation.x = lean;
  cyl(name + "p", r, r, 0.055, 0, 0, 0, padMat, g, 6);
  cyl(name + "f", r - 0.018, r - 0.018, 0.012, 0, 0.03, 0, faceMat, g, 6, false);
  const rim = B.MeshBuilder.CreateTorus(name + "r", { diameter: (r - 0.004) * 2, thickness: 0.022, tessellation: 6 }, scene); rim.material = rimMat; rim.parent = g; rim.position.y = 0.034; rim.rotation.y = Math.PI / 6;
}
hexPad("ep2", 0.115, -0.40, 0.92, 1.06, ekit); hexPad("ep3", 0.115, -0.135, 0.95, 1.06, ekit);
hexPad("ep4", 0.115, 0.135, 0.95, 1.06, ekit); hexPad("ep5", 0.115, 0.40, 0.92, 1.06, ekit);
hexPad("ep1", 0.14, -0.14, 0.64, 1.12, ekit);
const kickG = node("kickG", 0.10, 0.26, 0.18, ekit); kickG.rotation.x = 1.45;
cyl("kick", 0.22, 0.22, 0.09, 0, 0, 0, padMat, kickG, 6);
[-1, 1].forEach((sd) => { cyl("dleg" + sd, 0.018, 0.018, 0.92, sd * 0.52, 0.46, 0, tubeMat, ekit, 8); cyl("dfoot" + sd, 0.016, 0.016, 0.42, sd * 0.52, 0.02, 0, tubeMat, ekit, 8, false).rotation.x = Math.PI / 2; });
[0.84, 0.56].forEach((by, i) => cyl("dbar" + i, 0.016, 0.016, 1.08, 0, by, 0.01, tubeMat, ekit, 8, false).rotation.z = Math.PI / 2);

// --- the yellow Telecaster on an A-frame ---
const tele = node("tele", 1.58, 0.21, ZF + 0.58); tele.rotation.y = 0.3; tele.rotation.x = -0.16;
const teleYellow = matte("teleYellow", 0xf2c84b);
try {
  const pts = [[-0.14, -0.18], [-0.2, 0.0], [-0.12, 0.13], [-0.045, 0.155], [0.04, 0.12], [0.16, 0.13], [0.185, 0.0], [0.12, -0.16], [-0.04, -0.21]].map(([px, py]) => new V3(px, 0, py));
  const body = B.MeshBuilder.ExtrudePolygon("teleBody", { shape: pts, depth: 0.045, sideOrientation: B.Mesh.DOUBLESIDE }, scene, window.earcut);
  body.material = teleYellow; body.parent = tele; body.rotation.x = -Math.PI / 2; body.position.set(0, 0, 0.045); casters.push(body);
} catch (e) { const b = B.MeshBuilder.CreateCylinder("teleBody", { diameter: 0.34, height: 0.045, tessellation: 28 }, scene); b.scaling.set(1, 1, 1.25); b.material = teleYellow; b.parent = tele; b.rotation.x = Math.PI / 2; casters.push(b); }
box("teleNeck", 0.055, 0.58, 0.022, 0, 0.425, 0.022, matte("teleNeck", 0xd8b878), tele);
box("teleHead", 0.07, 0.13, 0.018, 0.012, 0.775, 0.022, matte("teleHead", 0xe2c685), tele);
box("teleFret", 0.05, 0.58, 0.005, 0, 0.425, 0.036, matte("teleFret", 0x4a3526), tele, false);
[-0.012, 0, 0.012].forEach((sx, i) => box("teleStr" + i, 0.0022, 0.74, 0.0022, sx, 0.26, 0.052, emis("teleStr", 0xd9dde2, { glow: false }), tele, false));
box("teleBridge", 0.08, 0.035, 0.012, 0.02, -0.12, 0.052, metal("teleBridge", 0xb9bec6, 0.8, 0.35), tele, false);
box("telePlate", 0.065, 0.022, 0.006, 0.115, -0.04, 0.05, metal("telePlate", 0xc6cbd2, 0.85, 0.28), tele, false).rotation.z = -0.5;
[-1, 1].forEach((sd) => { cyl("teleLeg" + sd, 0.011, 0.011, 0.46, sd * 0.1, 0.21, -0.06, matte("teleStand", 0x23262b), tele, 8, false).rotation.z = sd * 0.32; });

// --- pedalboard (OD/delay/reverb) + wah treadle ---
const pedalboard = node("pedalboard", 1.52, 0, ZF + 1.02); pedalboard.rotation.y = 0.3;
box("pbPlate", 0.5, 0.018, 0.2, 0, 0.055, 0, matte("pbPlate", 0x18191d), pedalboard, false).rotation.x = -0.26;
function stomp(px, bodyCol, ledCol, parent, sz = 1) {
  const g = node("stomp" + px, px, 0.064, -0.012, parent); g.rotation.x = -0.26;
  box("enc", 0.105 * sz, 0.055, 0.125 * sz, 0, 0.0275, 0, matte("enc" + px + bodyCol, bodyCol), g, false);
  cyl("sw", 0.016, 0.016, 0.022, 0, 0.06, 0.04, matte("sw", 0xb9bec6), g, 12, false);
  box("led", 0.01, 0.01, 0.01, 0, 0.058, 0.006, emis("pedled" + px + ledCol, ledCol), g, false);
}
stomp(-0.15, 0x8a3b1e, 0xff7a3c, pedalboard); stomp(0, 0x1f7a6e, 0x46f0d6, pedalboard); stomp(0.15, 0x35307a, 0x8a7bff, pedalboard);
const wah = node("wah", -0.44, 0, 0, pedalboard);
box("wahBase", 0.135, 0.05, 0.215, 0, 0.025, 0, matte("wahBase", 0x101216), wah, false);
const treadle = node("treadle", 0, 0.052, 0, wah); treadle.rotation.x = -0.1;
box("tPlate", 0.125, 0.02, 0.205, 0, 0.01, 0, matte("tPlate", 0x7a1f2a), treadle, false);
box("wahLed", 0.012, 0.012, 0.012, 0, 0.026, 0.092, emis("wahLed", 0xffe04a), treadle, false);
// keyboard floor pedals
const kbPedals = node("kbPedals", 0.2, 0, ZF + 1.0); kbPedals.rotation.y = -0.08;
box("kbpPlate", 0.42, 0.018, 0.2, 0, 0.055, 0, matte("kbpPlate", 0x18191d), kbPedals, false).rotation.x = -0.24;
stomp(-0.13, 0x6a2f7a, 0xd66bff, kbPedals, 0.95); stomp(0, 0x1f5a7a, 0x4fbfe6, kbPedals, 0.95); stomp(0.13, 0x2f6a3a, 0x6bff8a, kbPedals, 0.95);

// --- Kali monitors on stands ---
function kali(x, toeIn) {
  const g = node("kali" + x, x, 0, ZF + 0.33); g.rotation.y = toeIn;
  cyl("kbase", 0.17, 0.19, 0.02, 0, 0.01, 0, matte("kbase", 0x1a1c1f), g, 16, false);
  cyl("kpole", 0.022, 0.022, 0.74, 0, 0.39, 0, matte("kpole", 0x202327), g, 10);
  box("kplate", 0.2, 0.012, 0.24, 0, 0.766, 0, matte("kplate", 0x1a1c1f), g, false);
  box("kcab", 0.225, 0.37, 0.26, 0, 0.957, 0, matte("kcab", 0x131519), g);
  // LIT face (not emissive) so the speaker no longer glows like a light source
  const fm = new B.StandardMaterial("kface" + x, scene); fm.diffuseTexture = kaliTex; fm.specularColor = new B.Color3(0.05, 0.05, 0.05);
  const face = plane("kface" + x, 0.215, 0.36, fm); face.parent = g; face.position.set(0, 0.957, 0.131);
  // only the power LED glows
  box("kled" + x, 0.011, 0.011, 0.006, 0.082, 0.802, 0.134, emis("kledm" + x, 0x3be07a), g, false);
}
kali(-0.95, Math.PI / 6); kali(1.35, -Math.PI / 6);

// --- 12U rack on casters + Apollo Twin + LA radio + lava lamp ---
const rack = node("rack", 2.1, 0, ZF + 0.78); rack.rotation.y = -0.25;
box("rackBody", 0.56, 0.62, 0.6, 0, 0.37, 0, matte("rackBody", 0x101317), rack).checkCollisions = true;
const rfm = emis("rackFaceM", 0xffffff, { glow: false }); rfm.emissiveTexture = rackFaceTex; rfm.emissiveColor = new B.Color3(0.5, 0.5, 0.52);
const rface = plane("rackFace", 0.52, 0.58, rfm); rface.parent = rack; rface.position.set(0, 0.37, 0.301);
[[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]].forEach(([cx, cz], i) => cyl("caster" + i, 0.035, 0.035, 0.03, cx, 0.035, cz, matte("caster", 0x222428), rack, 12, false).rotation.z = Math.PI / 2);
box("apollo", 0.16, 0.065, 0.15, 0, 0.7125, 0.1, metal("apollo", 0x9aa0a8, 0.65, 0.4), rack);
cyl("apKnob", 0.032, 0.032, 0.018, 0, 0.748, 0.12, metal("apKnob", 0x2c2f34, 0.7, 0.35), rack, 18, false);
// LA radio
const radio = node("radio", 0.15, 0.68, -0.1, rack); radio.rotation.y = 0.3;
box("rbody", 0.2, 0.11, 0.12, 0, 0.055, 0, matte("rbody", 0xcdb892), radio, false);
box("rtrim", 0.205, 0.012, 0.125, 0, 0.018, 0, matte("rtrim", 0x2a2622), radio, false);
const dialTex = dyn("dial", 180, 80, (c, w, h) => { c.fillStyle = "#0b0905"; c.fillRect(0, 0, w, h); c.fillStyle = "#6b5a32"; for (let i = 0; i < 19; i++) { const x = 8 + i * 9.1, tall = i % 3 === 0; c.fillRect(x, 14, 1, tall ? 16 : 9); } c.fillStyle = "#9c8550"; c.font = "10px monospace"; c.fillText("88", 6, 48); c.fillText("96", 78, 48); c.fillText("104", 150, 48); c.fillStyle = "#c8a85a"; c.font = "700 11px monospace"; c.fillText("FM · LOS ANGELES", 12, 66); }, { flip: true });
const dialMat = emis("dialMat", 0xffb347, { glow: false }); dialMat.emissiveTexture = dialTex; dialMat.emissiveColor = new B.Color3(1, 0.7, 0.28);
const dialFace = plane("dialFace", 0.085, 0.04, dialMat); dialFace.parent = radio; dialFace.position.set(0.05, 0.075, 0.0605);
box("rneedle", 0.0035, 0.036, 0.004, 0.05, 0.075, 0.0625, emis("rneedle", 0xff4030), radio, false);
[-0.075, 0.075].forEach((kx) => cyl("rknob" + kx, 0.011, 0.013, 0.012, kx, 0.028, 0.061, matte("rknob", 0x2a2622), radio, 16, false).rotation.x = Math.PI / 2);
cyl("rant", 0.0022, 0.0035, 0.2, 0.085, 0.13, -0.045, metal("rant", 0xb8bcc2, 0.8, 0.3), radio, 6, false).rotation.z = -0.5;

// ---- realistic hero prop: a real PBR boombox (Khronos "BoomBox", CC0) replaces the box radio ----
// placed LEFT of the Apollo on the rack top, facing the rack front (+z local), not touching anything
let heroFit = { ry: 0, x: 0, y: 0.74, z: 0.10, target: 0.22 }; // front-center of the rack top, where the Apollo was
let boombox = null;
function placeBoombox(x, y, z, ry, target) {
  if (!boombox) return;
  boombox.scaling.setAll(target / boombox._naturalMax);
  boombox.rotation = new V3(0, ry, 0);
  boombox.position.set(x, y, z);
  boombox.computeWorldMatrix(true);
  const { min } = boombox.getHierarchyBoundingVectors(); // auto-rest the bottom on the rack top (world y 0.68)
  boombox.position.y += 0.68 - min.y;
}
let pbRef = null, apolloGLB = null;
async function importGLB(file) {
  const res = await B.SceneLoader.ImportMeshAsync("", "/assets/models/", file, scene);
  const root = res.meshes[0];
  const { min, max } = root.getHierarchyBoundingVectors();
  root._naturalMax = Math.max(max.x - min.x, max.y - min.y, max.z - min.z) / root.scaling.x;
  for (const m of res.meshes) if (m.getTotalVertices && m.getTotalVertices() > 0) { m.receiveShadows = true; try { shadow.addShadowCaster(m); } catch {} }
  return root;
}
function fitOn(root, target, x, y, z, ry, restY = 0) {
  root.scaling.setAll(target / root._naturalMax);
  root.rotation = new V3(0, ry, 0);
  root.position.set(x, y, z);
  root.computeWorldMatrix(true);
  const { min } = root.getHierarchyBoundingVectors();
  root.position.y += restY - min.y; // rest the model's bottom on restY
}
function tuneApollo(rx, ry, rz, t, x, z) {
  if (!apolloGLB) return;
  apolloGLB.scaling.setAll(t / apolloGLB._naturalMax);
  apolloGLB.rotation = new V3(rx, ry, rz);
  apolloGLB.position.set(x, 0.68, z);
  apolloGLB.computeWorldMatrix(true);
  const { min } = apolloGLB.getHierarchyBoundingVectors();
  apolloGLB.position.y += 0.68 - min.y; // rest on the rack top
}
async function loadHeroProps() {
  try { // realistic PBR boombox (Khronos BoomBox, CC0) replaces the box radio
    boombox = await importGLB("BoomBox.glb");
    boombox.parent = rack;
    placeBoombox(heroFit.x, heroFit.y, heroFit.z, heroFit.ry, heroFit.target);
    radio.setEnabled(false);
  } catch (e) { console.warn("boombox load failed — keeping procedural radio", e); }
  try { // realistic guitar pedals (Poly Pizza, CC-BY) on a board, replacing the procedural pedalboard
    const base = await importGLB("pedal.glb");
    const nm = base._naturalMax;
    const c2 = base.clone("pedalB"), c3 = base.clone("pedalC");
    [c2, c3].forEach(c => c.getChildMeshes().forEach(m => { m.receiveShadows = true; try { shadow.addShadowCaster(m); } catch { } }));
    const pbNode = node("pedalsGLB", 1.52, 0, ZF + 1.02); pbNode.rotation.y = 0.3;
    box("pbBoard", 0.5, 0.02, 0.22, 0, 0.01, 0, matte("pbBoard", 0x18191d), pbNode, false);
    [[base, -0.15, 0.0], [c2, 0.0, 0.12], [c3, 0.15, -0.1]].forEach(([r, dx, ry]) => {
      r.parent = pbNode; r.scaling.setAll(0.13 / nm); r.rotation = new V3(0, ry, 0); r.position.set(dx, 0.02, 0);
      r.computeWorldMatrix(true); const { min } = r.getHierarchyBoundingVectors(); r.position.y += 0.02 - min.y;
    });
    pedalboard.setEnabled(false);
    pbRef = pbNode;
  } catch (e) { console.warn("pedals load failed — keeping procedural", e); }
  // the radio (boombox) now sits where the Apollo was — drop the rackmount EQ, hide the procedural Apollo
  scene.getMeshByName("apollo")?.setEnabled(false);
  scene.getMeshByName("apKnob")?.setEnabled(false);
  await loadDeskProps();
}

// realistic desk props (Poly Pizza CC-BY / Kenney CC0) — keyboard, computer, mug, lamp.
// the ultrawide monitor stays procedural so it keeps its animated DAW screen.
const deskProps = {};
async function loadDeskProps() {
  const place = async (file, key, target, x, z, ry, hide = [], rx = 0, tint = null) => {
    try {
      const m = await importGLB(file);
      m.parent = desk;
      m.scaling.setAll(target / m._naturalMax);
      m.rotation = new V3(rx, ry, 0);
      m.position.set(x, 0.74, z);
      m.computeWorldMatrix(true);
      const { min } = m.getHierarchyBoundingVectors();
      m.position.y += 0.74 - min.y; // rest on the desk top
      if (tint != null) m.getChildMeshes().forEach(cm => { const mt = cm.material; if (mt) { if (mt.albedoColor) mt.albedoColor = C(tint); if (mt.baseColor) mt.baseColor = C(tint); if (mt.diffuseColor) mt.diffuseColor = C(tint); } });
      hide.forEach(n => scene.getMeshByName(n)?.setEnabled(false));
      deskProps[key] = m;
    } catch (e) { console.warn("desk model " + file + " failed", e); }
  };
  await place("kbapple.glb", "kb", 0.40, 0.12, 0.14, 0, ["kb", "kbTop"], 0, 0xcfd2d4); // Apple-aluminium recolour, typing area
  await place("mouse.glb", "mouse", 0.11, 0.44, 0.16, 0, ["tbBase", "tbBall"], -Math.PI / 2); // lay it flat; replaces trackball
  await place("mug2.glb", "mug", 0.1, -0.42, 0.28, 0, ["mug", "coffee"]); // better mug, front-left corner
  await place("midi.glb", "midi", 0.5, 0.0, 0.33, 0, ["midiBody", "midiKeys"]); // MIDI controller at the front edge
  await loadMonitors();
  // Mac Studio kept procedural (on the right) — no free Mac model, and the silver box reads more like a Studio than a generic PC tower
}

// real monitor bodies (Poly Pizza, CC-BY) — keep the live screens by mapping the animated DAW/meter textures onto the models
async function loadMonitors() {
  try { // ultrawide: a flat widescreen TV body; overlay the live DAW plane on its panel
    const tv = await importGLB("ultrawide.glb");
    tv.parent = desk;
    tv.scaling.setAll(0.98 / tv._naturalMax); // already ~1.8:1 widescreen
    tv.rotation = new V3(0, -Math.PI / 2, 0); // turn the screen to face the player
    tv.position.set(0, 0.74, -0.2);
    tv.computeWorldMatrix(true);
    let bb = tv.getHierarchyBoundingVectors();
    tv.position.y += 0.74 - bb.min.y; // rest the stand on the desk
    tv.computeWorldMatrix(true);
    bb = tv.getHierarchyBoundingVectors();
    // the TV screen mesh has no usable UVs, so put our live DAW plane on the panel face instead
    const h = bb.max.y - bb.min.y, panelBot = bb.min.y + h * 0.24, top = bb.max.y - h * 0.06;
    const sw = (bb.max.x - bb.min.x) * 0.9, sh = (top - panelBot) * 0.95;
    monScreen.setEnabled(false); // retire the procedural screen plane
    // a clean dark "on" screen (emissive color reliably renders here; the texture path did not)
    const uw = new B.StandardMaterial("uwScreen", scene);
    uw.emissiveColor = new B.Color3(0.05, 0.07, 0.13); uw.diffuseColor = new B.Color3(0, 0, 0);
    uw.specularColor = new B.Color3(0.02, 0.02, 0.03); uw.disableLighting = true;
    const uwPlane = B.MeshBuilder.CreatePlane("uwScreenPlane", { width: sw, height: sh }, scene);
    uwPlane.material = uw; uwPlane.parent = desk;
    uwPlane.position.set((bb.min.x + bb.max.x) / 2 - 0.2, (panelBot + top) / 2, (bb.max.z + 0.02) + 2.81);
    scene.getMeshByName("monBezel")?.setEnabled(false);
    deskProps.ultrawide = tv;
  } catch (e) { console.warn("ultrawide failed — keeping procedural", e); }
  try { // small portable display, propped on top of the Mac Studio, angled toward the player
    const tab = await importGLB("tablet.glb");
    tab.parent = desk;
    tab.scaling.setAll(0.30 / tab._naturalMax);
    tab.rotation = new V3(Math.PI / 2 - 0.28, -0.35, 0); // stand it up + angle toward the person
    tab.position.set(0.66, 0.835, -0.18); // sit it on the Mac Studio (right side)
    tab.computeWorldMatrix(true);
    const { min } = tab.getHierarchyBoundingVectors();
    tab.position.y += 0.835 - min.y; // rest on the Mac top
    scene.getMeshByName("pmBezel")?.setEnabled(false);
    pmScreen.setEnabled(false);
    deskProps.portable = tab;
  } catch (e) { console.warn("portable failed — keeping procedural", e); }
}

// --- lava lamp (on the rack) ---
const lava = node("lava", -0.17, 0.68, -0.12, rack);
const lampGold = matte("lampGold", 0x8a6a3a);
cyl("lampBase", 0.034, 0.05, 0.07, 0, 0.035, 0, lampGold, lava, 14, false);
cyl("lampCap", 0.02, 0.03, 0.045, 0, 0.247, 0, lampGold, lava, 14, false);
cyl("lampGlass", 0.028, 0.044, 0.155, 0, 0.1475, 0, glassMat("lampGlass", 0xb33a14, 0.34, 0.1), lava, 14, false);
const blobMat = emis("blobMat", 0xff8a3c);
const blobs = [];
for (let i = 0; i < 5; i++) { const b = B.MeshBuilder.CreateSphere("blob" + i, { diameter: (0.011 + (i % 3) * 0.004) * 2, segments: 10 }, scene); b.material = blobMat; b.parent = lava; b._speed = 0.16 + i * 0.07; b._phase = i * 1.7; blobs.push(b); }

// =====================================================================
// CAT CORNER — litter box, food/water bowls, treat jar
// =====================================================================
const litter = node("litter", -2.28, 0, 2.85);
const trayMat = matte("tray", 0x9aa0a4);
box("litFloor", 0.52, 0.03, 0.4, 0, 0.015, 0, trayMat, litter, false);
[[0.52, 0.025, 0, -0.19], [0.52, 0.025, 0, 0.19]].forEach(([w, d, x, z], i) => box("litW" + i, w, 0.12, d, x, 0.06, z, trayMat, litter, false));
[[0.025, 0.4, -0.248, 0], [0.025, 0.4, 0.248, 0]].forEach(([w, d, x, z], i) => box("litS" + i, w, 0.12, d, x, 0.06, z, trayMat, litter, false));
const sandTex = dyn("sand", 128, 128, (c, w, h) => { c.fillStyle = "#cfc3a4"; c.fillRect(0, 0, w, h); for (let i = 0; i < 3000; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); } });
const sandMat = new B.StandardMaterial("sandMat", scene); sandMat.diffuseTexture = sandTex; sandMat.emissiveColor = C(0x6b6048).scale(0.3); sandMat.specularColor = new B.Color3(0, 0, 0);
const sand = B.MeshBuilder.CreateGround("sand", { width: 0.47, height: 0.35 }, scene); sand.material = sandMat; sand.parent = litter; sand.position.y = 0.045;
function bowl(name, x, z, dishCol, fillMat) {
  const g = node(name, x, 0, z);
  const dm = matte(name + "dish", dishCol); dm.emissiveColor = C(dishCol).scale(0.35);
  cyl(name + "dish", 0.075, 0.06, 0.045, 0, 0.0225, 0, dm, g, 16, false);
  cyl(name + "fill", 0.058, 0.05, 0.03, 0, 0.025, 0, fillMat, g, 16, false);
}
const foodFillTex = dyn("food", 64, 64, (c, w, h) => { c.fillStyle = "#6a4a26"; c.fillRect(0, 0, w, h); for (let i = 0; i < 240; i++) { c.fillStyle = "#8a6438"; c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 2, 0, 7); c.fill(); } });
const foodMat = new B.StandardMaterial("foodMat", scene); foodMat.diffuseTexture = foodFillTex; foodMat.emissiveColor = C(0x6a4a26).scale(0.3); foodMat.specularColor = new B.Color3(0, 0, 0);
const waterMat = new B.PBRMetallicRoughnessMaterial("waterMat", scene); waterMat.baseColor = C(0x3a7ab8); waterMat.roughness = 0.1; waterMat.metallic = 0.1; waterMat.alpha = 0.85; waterMat.emissiveColor = C(0x2f6f9c).scale(0.3);
bowl("foodBowl", 2.32, 0.75, 0x8a3324, foodMat); bowl("waterBowl", 2.32, 1.08, 0x46606e, waterMat);
// treat jar on the sill
cyl("treatJar", 0.035, 0.035, 0.09, 1.4, 0.905, ZF + 0.07, glassMat("treatJar", 0xd8e4ea, 0.4, 0.05), null, 12, false);
cyl("treatKibble", 0.029, 0.029, 0.055, 1.4, 0.888, ZF + 0.07, matte("treatKibble", 0x7a5530), null, 12, false);

// =====================================================================
// ERGO CHAIR (gas-lift, 5-star base) at the sweet spot
// =====================================================================
const SWEET = { x: 0.2, z: (ZF + 0.33) + 2.3 * Math.sqrt(3) / 2 };
const chair = node("chair", SWEET.x, 0, SWEET.z); chair.rotation.y = Math.PI;
box("seat", 0.48, 0.07, 0.46, 0, 0.47, 0, matte("seat", 0x1c1e22), chair);
box("backrest", 0.46, 0.62, 0.06, 0, 0.85, -0.24, matte("backrest", 0x23262b), chair).rotation.x = 0.12;
cyl("gascol", 0.025, 0.025, 0.32, 0, 0.28, 0, matte("gascol", 0x33363b), chair, 10);
for (let i = 0; i < 5; i++) { const a = i / 5 * 2 * Math.PI; box("carm" + i, 0.3, 0.025, 0.05, Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15, matte("carm", 0x26282c), chair, false).rotation.y = -a; sph("ccaster" + i, 0.06, Math.cos(a) * 0.29, 0.03, Math.sin(a) * 0.29, matte("ccaster", 0x111316), chair, false); }

// =====================================================================
// ACCESSORIES — gold record (east wall), plant (sill), yarn (cat area)
// =====================================================================
// (gold record + plant removed per request)
const yarn = node("yarn", -1.85, 0.05, 2.6);
sph("yarnBall", 0.1, 0, 0, 0, matte("yarn", 0xc23b4e), yarn);

// =====================================================================
// THE CAT — ginger tabby, stays "Lambert" (matte, no glow), wanders + purrs
// =====================================================================
const FUR = 0xd98a3d, CHEST = 0xf0e3c8, EYE = 0x7ddc6a;
const catGrp = node("cat", 0.2, 0, SWEET.z + 0.3);
const catRig = node("catRig", 0, 0, 0, catGrp);
const furMat = matte("fur", FUR), chestMat = matte("chest", CHEST);
const catBody = B.MeshBuilder.CreateCapsule("catBody", { radius: 0.062, height: 0.16 + 0.124, tessellation: 10, capSubdivisions: 6 }, scene); catBody.material = furMat; catBody.parent = catRig; catBody.position.y = 0.115; catBody.rotation.z = Math.PI / 2; casters.push(catBody);
sph("catChest", 0.1, 0.07, 0.10, 0, chestMat, catRig);
const catHead = node("catHead", 0.135, 0.16, 0, catRig);
sph("catSkull", 0.108, 0, 0, 0, furMat, catHead);
[-1, 1].forEach((s) => { const ear = B.MeshBuilder.CreateCylinder("ear" + s, { diameterTop: 0, diameterBottom: 0.036, height: 0.035, tessellation: 4 }, scene); ear.material = furMat; ear.parent = catHead; ear.position.set(-0.01, 0.05, s * 0.032); });
[-1, 1].forEach((s) => sph("eye" + s, 0.015, 0.045, 0.012, s * 0.022, emis("catEye", EYE, { glow: false }), catHead, false));
// 3-segment tail (chained)
let tailParent = catRig; const tailSegs = [];
for (let i = 0; i < 3; i++) { const seg = node("tail" + i, i === 0 ? -0.13 : 0, i === 0 ? 0.13 : 0.08, 0, tailParent); seg.rotation.z = 0.5; const m = B.MeshBuilder.CreateCylinder("tailM" + i, { diameterTop: (0.011 - i * 0.002) * 2, diameterBottom: (0.013 - i * 0.002) * 2, height: 0.09, tessellation: 6 }, scene); m.material = furMat; m.parent = seg; m.position.y = 0.045; casters.push(m); tailSegs.push(seg); tailParent = seg; }
const catLegs = [];
[[0.07, 0.035], [0.07, -0.035], [-0.07, 0.035], [-0.07, -0.035]].forEach(([lx, lz], i) => { const leg = cyl("catLeg" + i, 0.011, 0.009, 0.075, lx, 0.038, lz, furMat, catRig, 6); catLegs.push(leg); });

// cat wander state
const catSpots = [{ x: 0.2, z: SWEET.z, y: 0.51 }, { x: 0.2, z: -2.4, y: 0 }, { x: -1.7, z: -2.7, y: 0 }, { x: 1.9, z: 0.9, y: 0 }, { x: -1.2, z: 1.8, y: 0 }, { x: 1.0, z: 2.2, y: 0 }];
let catState = { tx: 0.2, tz: SWEET.z + 0.3, ty: 0, yaw: Math.PI, baseY: 0, walking: false, dwell: 3 };

// hearts pool
const heartTex = dyn("heart", 64, 64, (c, w, h) => { c.fillStyle = "#ff7a9a"; c.font = "44px serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("♥", 32, 36); }, { flip: true });
const heartMat = emis("heartMat", 0xffffff, { glow: false }); heartMat.emissiveTexture = heartTex; heartMat.emissiveTexture.hasAlpha = true; heartMat.useAlphaFromEmissiveTexture = true; heartMat.opacityTexture = heartTex; heartMat.alpha = 1;
const hearts = [];
function popHearts() { const p = catGrp.getAbsolutePosition(); for (let i = 0; i < 3; i++) { const h = B.MeshBuilder.CreatePlane("heart", { size: 0.1 }, scene); h.material = heartMat; h.billboardMode = B.Mesh.BILLBOARDMODE_ALL; h.position.set(p.x + (Math.random() - 0.5) * 0.2, catState.baseY + 0.3, p.z + (Math.random() - 0.5) * 0.2); h._life = 1.6; h._vx = (Math.random() - 0.5) * 0.1; hearts.push(h); } }

// =====================================================================
// LIGHTS — outside sun raking through the glass, low fill, emissive points
// =====================================================================
const hemi = new B.HemisphericLight("hemi", new V3(0, 1, 0), scene);
hemi.intensity = 0.32; hemi.diffuse = C(0x8a96a8); hemi.groundColor = C(0x2a241c);
// golden-hour sun: az ~0.3 west, alt ~0.26 — position per world.js beam aiming
const az = 0.3, alt = 0.26;
const sun = new B.SpotLight("sun", new V3(Math.sin(az) * 10, WIN.cy + Math.tan(alt) * 10, ZF - 10), new V3(-Math.sin(az), -0.5, 1).normalize(), 1.3, 6, scene);
sun.intensity = 3.4; sun.diffuse = C(0xfff0d8); sun.range = 80;
const shadow = new B.ShadowGenerator(2048, sun);
shadow.usePercentageCloserFiltering = true; shadow.filteringQuality = B.ShadowGenerator.QUALITY_HIGH; shadow.bias = 0.0011; shadow.normalBias = 0.02; shadow.darkness = 0.16;
const windowLight = new B.PointLight("winLight", new V3(0, 1.6, ZF + 0.6), scene); windowLight.diffuse = C(0xffe9c0); windowLight.intensity = 2.2; windowLight.range = 3.8;
const lavaLight = new B.PointLight("lavaLight", new V3(0, 0, 0), scene); lavaLight.parent = lava; lavaLight.position.set(0, 0.15, 0); lavaLight.diffuse = C(0xff8040); lavaLight.intensity = 0.85; lavaLight.range = 0.95;
const neonLight = new B.PointLight("neonLight", new V3(0, 1.62, 0.4), scene); neonLight.parent = entry; neonLight.diffuse = C(0xff4d2e); neonLight.intensity = 1.3; neonLight.range = 1.7;
const screenGlow = new B.PointLight("screenGlow", new V3(0, 1.19, 0.1), scene); screenGlow.parent = desk; screenGlow.position.set(0, 0.45, 0.1); screenGlow.diffuse = C(0x8fb6ff); screenGlow.intensity = 1.7; screenGlow.range = 1.7;

// the bright sun disc outside, for the god-rays
// a round, soft sun glow (was a hard square that read as an obvious light panel through the window)
const sunGlowTex = dyn("sunGlow", 128, 128, (c, w, h) => { const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, "#ffffff"); g.addColorStop(0.4, "#cfcfcf"); g.addColorStop(1, "#000000"); c.fillStyle = g; c.fillRect(0, 0, w, h); });
const sunDisc = B.MeshBuilder.CreateDisc("sunDisc", { radius: 0.7, tessellation: 40 }, scene); sunDisc.position.set(Math.sin(az) * 3.2, 2.2, ZF - 2.4);
const sunDiscMat = emis("sunDiscMat", 0xffffff, { glow: false }); sunDiscMat.emissiveTexture = sunGlowTex; sunDiscMat.emissiveColor = new B.Color3(1.35, 1.05, 0.72); sunDiscMat.alphaMode = B.Engine.ALPHA_ADD; sunDisc.material = sunDiscMat;

// ---- switchable lighting moods (press L to cycle) ----
const MOODS = [
  { id: "golden", label: "golden hour", sun: 4.6, sunCol: 0xfff0d8, hemi: 0.14, hSky: 0x8a96a8, hGnd: 0x2a241c, win: 2.2, sky: [0.50, 0.49, 0.48], exp: 0.90, lamp: 0, disc: [1.35, 1.05, 0.72] },
  { id: "midday", label: "midday sun", sun: 5.6, sunCol: 0xfff6e8, hemi: 0.60, hSky: 0xbcd0ec, hGnd: 0x6a5e4c, win: 3.0, sky: [0.92, 0.93, 0.98], exp: 0.95, lamp: 0, disc: [1.90, 1.80, 1.60] },
  { id: "studio", label: "clean studio", sun: 2.4, sunCol: 0xffffff, hemi: 0.90, hSky: 0xc8ccd4, hGnd: 0x8a8680, win: 2.0, sky: [0.70, 0.70, 0.72], exp: 0.96, lamp: 3, disc: [1.00, 1.00, 1.00] },
  { id: "night", label: "night · neon", sun: 0.12, sunCol: 0x9fb6e8, hemi: 0.10, hSky: 0x3a4660, hGnd: 0x1a1610, win: 0.4, sky: [0.12, 0.13, 0.22], exp: 1.06, lamp: 7, disc: [0.18, 0.22, 0.40] },
];
function applyMood(m) {
  sun.intensity = m.sun; sun.diffuse = C(m.sunCol);
  hemi.intensity = m.hemi; hemi.diffuse = C(m.hSky); hemi.groundColor = C(m.hGnd);
  windowLight.intensity = m.win;
  skyMat.emissiveColor.set(m.sky[0], m.sky[1], m.sky[2]);
  sunDiscMat.emissiveColor.set(m.disc[0], m.disc[1], m.disc[2]);
  ip.exposure = m.exp;
  roomLamp.intensity = m.lamp;
  fixtureGlow.material.emissiveColor = m.lamp > 0.5 ? C(0xffe2b8) : C(0x222222);
}
// =====================================================================
// LIVE ENVIRONMENT — real day/night from your location, dynamic sky, astro, weather
// =====================================================================
let LAT = 33.9164, LNG = -118.3526;   // Hawthorne, CA — fallback; geolocation overrides
const weather = { clouds: 0, rain: 0 };
let envAcc = 0;

// astro ceiling — a star field + Big Dipper that fades in after dusk
const astroTex = new B.DynamicTexture("astro", { width: 512, height: 512 }, scene, true);
const astroStars = Array.from({ length: 70 }, () => ({ a: Math.random() * 7, r: 26 + Math.random() * 214, s: Math.random() }));
const DIPPER = [[0.17, 0.30], [0.29, 0.34], [0.41, 0.36], [0.51, 0.40], [0.54, 0.52], [0.43, 0.56], [0.39, 0.46]];
function drawAstro(rot) {
  const c = astroTex.getContext(), cx = 256, cy = 256; c.clearRect(0, 0, 512, 512);
  for (const s of astroStars) { const a = s.a + rot, x = cx + Math.cos(a) * s.r, y = cy + Math.sin(a) * s.r, rr = s.s > 0.85 ? 2.4 : 1.4; const gl = c.createRadialGradient(x, y, 0, x, y, rr * 2.6); gl.addColorStop(0, `rgba(255,255,255,${0.5 + s.s * 0.5})`); gl.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = gl; c.beginPath(); c.arc(x, y, rr * 2.6, 0, 7); c.fill(); }
  c.strokeStyle = "rgba(150,180,235,.5)"; c.lineWidth = 1.4; c.beginPath(); DIPPER.forEach(([px, py], i) => { const x = px * 512, y = py * 512; i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
  c.fillStyle = "rgba(190,205,235,.6)"; c.font = "15px monospace"; c.fillText("ursa major", 90, 320);
  astroTex.update(false);
}
const astroMat = new B.StandardMaterial("astroMat", scene); astroMat.emissiveTexture = astroTex; astroMat.emissiveTexture.hasAlpha = true; astroMat.diffuseColor = new B.Color3(0, 0, 0); astroMat.disableLighting = true; astroMat.alphaMode = B.Engine.ALPHA_ADD; astroMat.backFaceCulling = false;
const astro = B.MeshBuilder.CreateGround("astroCeil", { width: W - 0.12, height: D - 0.12 }, scene); astro.material = astroMat; astro.position.y = H - 0.04; astro.rotation.x = Math.PI; astro.isVisible = false;
drawAstro(0); // initialise the texture so the material is ready (otherwise whenReadyAsync hangs on it)

// the daylight driver — aims the sun/moon through the window and recolors everything
let autoMode = true;
function updateEnv(date) {
  if (!window.SunCalc) { applyMood(MOODS[0]); return; }
  const sp = SunCalc.getPosition(date, LAT, LNG), mp = SunCalc.getMoonPosition(date, LAT, LNG), mi = SunCalc.getMoonIllumination(date);
  const sunAlt = sp.altitude, moonAlt = mp.altitude, frac = mi.fraction;
  const useSun = sunAlt > -0.05;
  const az = Math.max(-0.9, Math.min(0.9, useSun ? sp.azimuth : mp.azimuth));
  const alt = Math.max(useSun ? sunAlt : moonAlt, 0.06);
  sun.position.set(Math.sin(az) * 10, WIN.cy + Math.tan(alt) * 10, ZF - 10);
  sun.setDirectionToTarget(new V3(0, 0.6, 0));
  sunDisc.position.set(Math.sin(az) * 3.0, 1.0 + Math.tan(alt) * 2.6, ZF - 2.4);
  // phase → colors + (deliberately low-ambient) intensities, keeping light only from the window
  let beamC, beamI, winC, winI, hS, hG, hI, skyS, disc, lamp;
  if (sunAlt > 0) { const k = Math.sin(Math.min(sunAlt, 1.2)); beamC = 0xfff2da; beamI = 2.6 + 4.2 * k; winC = 0xfff0d8; winI = 1.4 + 1.6 * k; hS = 0xaebbd0; hG = 0x6a5e4c; hI = 0.12 + 0.08 * k; skyS = 0.85 + 0.15 * k; disc = [0.5 + 1.2 * k, 0.45 + 1.1 * k, 0.4 + 0.95 * k]; lamp = 0; }
  else if (sunAlt > -0.2) { const k = 1 + sunAlt / 0.2; beamC = 0xe8a060; beamI = 1.4 + 3.0 * k; winC = 0xd8915a; winI = 1.0 + 1.4 * k; hS = 0x9a8da0; hG = 0x4a4034; hI = 0.1 + 0.05 * k; skyS = 0.45 + 0.35 * k; disc = [0.4 + 1.0 * k, 0.28 + 0.7 * k, 0.2 + 0.5 * k]; lamp = 1.5 * (1 - k); }
  else if (moonAlt > 0) { const k = Math.sin(moonAlt) * frac; beamC = 0xbfd0ee; beamI = 0.4 + 1.4 * k; winC = 0x9fb6e8; winI = 0.3 + 1.0 * k; hS = 0x6a7890; hG = 0x2a241c; hI = 0.08; skyS = 0.16 + 0.12 * k; disc = [0.08 + 0.25 * k, 0.1 + 0.3 * k, 0.16 + 0.45 * k]; lamp = 4; }
  else { beamC = 0x7a7080; beamI = 0.08; winC = 0x8a7a9a; winI = 0.3; hS = 0x565e6e; hG = 0x241f18; hI = 0.07; skyS = 0.12; disc = [0.06, 0.07, 0.13]; lamp = 5; }
  const dim = Math.max(0.2, 1 - 0.6 * weather.clouds - (weather.rain ? 0.1 : 0));
  beamI *= dim; winI *= Math.max(0.4, 1 - 0.4 * weather.clouds);
  sun.diffuse = C(beamC); sun.intensity = beamI;
  windowLight.diffuse = C(winC); windowLight.intensity = winI;
  hemi.diffuse = C(hS); hemi.groundColor = C(hG); hemi.intensity = hI;
  sunDiscMat.emissiveColor.set(disc[0], disc[1], disc[2]);
  skyMat.emissiveColor.set(0.6 * skyS, 0.59 * skyS, 0.58 * skyS);
  roomLamp.intensity = 0; fixtureGlow.material.emissiveColor = C(0x222222); // auto cycle = light only from outside; lamp stays a manual control
  ip.exposure = sunAlt > 0 ? 0.92 : sunAlt > -0.2 ? 0.95 : 1.04;
  drawSky(sp.azimuth, sunAlt, moonAlt, frac, weather.clouds);
  rainPane.isVisible = weather.rain > 0; rainMat.alpha = weather.rain > 0 ? 0.55 : 0;
  const fade = Math.max(0, Math.min(1, (-sunAlt * 57.3 - 4) / 6));
  astro.isVisible = fade > 0.02; astroMat.emissiveColor = new B.Color3(fade * 2, fade * 2, fade * 2.1);
  if (astro.isVisible) drawAstro((date.getHours() * 3600 + date.getMinutes() * 60) / 86400 * Math.PI * 2);
}

// weather from Open-Meteo (CORS-open, no key)
async function fetchWeather() {
  try { const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&current=cloud_cover,precipitation`); const j = await r.json(); const cur = j.current || {}; weather.clouds = (cur.cloud_cover || 0) / 100; weather.rain = cur.precipitation > 0.5 ? 2 : cur.precipitation > 0.05 ? 1 : 0; } catch (e) { /* clear on failure */ }
}
// the visitor's real location, with Hawthorne as the fallback
if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => { LAT = p.coords.latitude; LNG = p.coords.longitude; fetchWeather().then(() => { if (autoMode) updateEnv(new Date()); }); }, () => { }, { timeout: 8000, maximumAge: 6e5 });
fetchWeather();
updateEnv(new Date());
let moodIdx = -1; // -1 = auto (real time at your location); 0..n = a frozen mood

// =====================================================================
// SHADOWS — register casters, big surfaces receive
// =====================================================================
// only SOLID things cast shadows — emissive bits (LEDs, screens, neon, drum rims,
// lava blobs, guitar strings) are light, not occluders, so skip them.
for (const m of casters) { try { if (m.material && m.material.disableLighting) continue; shadow.addShadowCaster(m, true); } catch {} }

// =====================================================================
// POST — glow, default pipeline, SSAO, god-rays
// =====================================================================
const glow = new B.GlowLayer("glow", scene, { mainTextureSamples: 4 }); glow.intensity = 0.4;
let pipeline; // built after the camera exists, below

// =====================================================================
// DUST — GPU particles drifting through the room
// =====================================================================
const dotTex = dyn("dot", 64, 64, (c, w, h) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(200,194,180,1)"); g.addColorStop(1, "rgba(200,194,180,0)"); c.fillStyle = g; c.fillRect(0, 0, w, h); });
try {
  const dust = B.GPUParticleSystem.IsSupported ? new B.GPUParticleSystem("dust", { capacity: 2400 }, scene) : new B.ParticleSystem("dust", 900, scene);
  dust.particleTexture = dotTex; dust.emitter = new V3(0, 1.3, -0.6);
  dust.minEmitBox = new V3(-X, -1.1, ZF); dust.maxEmitBox = new V3(X, 1.3, ZB);
  dust.color1 = new B.Color4(0.6, 0.58, 0.53, 0.4); dust.color2 = new B.Color4(0.6, 0.55, 0.5, 0.2); dust.colorDead = new B.Color4(1, 1, 1, 0);
  dust.minSize = 0.005; dust.maxSize = 0.014; dust.minLifeTime = 9; dust.maxLifeTime = 18; dust.emitRate = 180;
  dust.blendMode = B.ParticleSystem.BLENDMODE_ADD; dust.gravity = new V3(0, 0.006, 0);
  dust.direction1 = new V3(-0.02, 0.02, -0.02); dust.direction2 = new V3(0.02, 0.05, 0.02);
  dust.minEmitPower = 0.01; dust.maxEmitPower = 0.03; dust.updateSpeed = 0.012; dust.start();
} catch (e) { console.warn("dust", e); }

// =====================================================================
// CAMERA — first-person, eye height 1.62, gravity + ellipsoid collision
// =====================================================================
const EYE_H = 1.62; // 5'8" eye height — desk (0.74) lands at mid-thigh, same as three.js controls.js
const camera = new B.UniversalCamera("cam", new V3(0.2, EYE_H, 1.4), scene);
camera.setTarget(new V3(0, EYE_H, ZF));
camera.attachControl(canvas, true);
camera.minZ = 0.05; camera.fov = 1.18; camera.speed = 0.20; camera.inertia = 0.72; camera.angularSensibility = 2400;
camera.keysUp = [87, 38]; camera.keysDown = [83, 40]; camera.keysLeft = [65, 37]; camera.keysRight = [68, 39];
// FIXED eye height — no gravity. the flat floor doesn't need it, and gravity+ellipsoid
// was making the camera CLIMB while walking (1.50 → 1.79). collisions stay on for walls/furniture.
camera.checkCollisions = true; camera.applyGravity = false;
// slimmer 0.3 bubble so you can step right up to the desk instead of being held back.
camera.ellipsoid = new V3(0.3, 0.9, 0.3); camera.ellipsoidOffset = new V3(0, -0.72, 0);
// post pipeline, now that the camera exists
pipeline = new B.DefaultRenderingPipeline("pipeline", true, scene, [camera]);
pipeline.fxaaEnabled = true; pipeline.samples = 4; pipeline.bloomEnabled = true; pipeline.bloomThreshold = 0.85; pipeline.bloomWeight = 0.4; pipeline.bloomKernel = 64; pipeline.bloomScale = 0.6;
pipeline.bloomThreshold = 0.92; pipeline.bloomWeight = 0.15;
pipeline.imageProcessingEnabled = true; pipeline.imageProcessing.vignetteEnabled = true; pipeline.imageProcessing.vignetteWeight = 2.4; pipeline.imageProcessing.vignetteColor = new B.Color4(0, 0, 0, 0);
pipeline.grainEnabled = true; pipeline.grain.intensity = 6; pipeline.grain.animated = true; pipeline.sharpenEnabled = true; pipeline.sharpen.edgeAmount = 0.16;
try { if (B.SSAO2RenderingPipeline.IsSupported) { const ssao = new B.SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.75, blurRatio: 1 }, [camera]); ssao.radius = 0.5; ssao.totalStrength = 1.0; ssao.base = 0.12; ssao.samples = 16; ssao.expensiveBlur = true; } } catch (e) { console.warn("ssao", e); }
try { const vls = new B.VolumetricLightScatteringPostProcess("godrays", 1.0, camera, sunDisc, 90, B.Texture.BILINEAR_SAMPLINGMODE, engine, false, scene); vls.exposure = 0.13; vls.decay = 0.96815; vls.weight = 0.28; vls.density = 0.9; } catch (e) { console.warn("godrays", e); }

// =====================================================================
// animated screens + clock
// =====================================================================
let T = 0;
const dctx = dawTex.getContext(), mctx = meterTex.getContext(), cctx = clockTex.getContext();
function drawDaw(t) {
  const w = 1024, h = 434; dctx.fillStyle = "#0a0c14"; dctx.fillRect(0, 0, w, h);
  dctx.fillStyle = "#121622"; dctx.fillRect(0, 0, w, 34); dctx.fillStyle = "#ff3bd0"; dctx.font = "700 18px monospace"; dctx.fillText("● THE METRO — session", 14, 24);
  const lanes = ["#2dd4bf", "#a78bfa", "#fbbf24", "#f472b6"];
  for (let L = 0; L < 5; L++) { const y = 54 + L * 74; dctx.fillStyle = "#10131c"; dctx.fillRect(8, y, w - 16, 60); dctx.strokeStyle = lanes[L % 4]; dctx.lineWidth = 2; dctx.beginPath(); for (let x = 0; x < w - 24; x += 4) { const a = Math.sin(x * 0.05 + t * 2 + L) * Math.sin(x * 0.013 + L * 2); dctx.lineTo(12 + x, y + 30 + a * (12 + L * 3)); } dctx.stroke(); }
  const px = ((t * 70) % (w - 24)) + 12; dctx.strokeStyle = "#fff"; dctx.lineWidth = 1; dctx.beginPath(); dctx.moveTo(px, 34); dctx.lineTo(px, h); dctx.stroke(); dawTex.update(false);
}
function drawMeter(t) {
  const w = 330, h = 200; mctx.fillStyle = "#0a0d10"; mctx.fillRect(0, 0, w, h);
  mctx.fillStyle = "#7be08a"; mctx.font = "700 14px monospace"; mctx.fillText("LUFS -14.2", 12, 22);
  for (let i = 0; i < 14; i++) { const v = 0.5 + 0.5 * Math.sin(t * 4 + i); const bh = v * 150; const hue = v > 0.85 ? "#ff4d4d" : v > 0.6 ? "#ffd23b" : "#3be07a"; mctx.fillStyle = hue; mctx.fillRect(14 + i * 22, h - 20 - bh, 14, bh); } meterTex.update(false);
}
function drawClock() {
  const w = 310, h = 116; cctx.fillStyle = "#06080c"; cctx.fillRect(0, 0, w, h);
  const now = new Date(); const opt = { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", hour12: false };
  let s = "--:--"; try { s = new Intl.DateTimeFormat("en-US", opt).format(now); } catch {}
  cctx.fillStyle = "#ff7a3c"; cctx.font = "700 64px monospace"; cctx.textAlign = "center"; cctx.fillText(s, w / 2, 74); cctx.font = "700 16px monospace"; cctx.fillStyle = "#9c6a3a"; cctx.fillText("LOS ANGELES", w / 2, 100); cctx.textAlign = "left"; clockTex.update(false);
}
let clockAcc = 0;

scene.onBeforeRenderObservable.add(() => {
  const dt = Math.min(0.05, engine.getDeltaTime() / 1000); T += dt;
  // re-read the real sun/moon every few seconds (cheap; the sky only changes slowly)
  envAcc += dt; if (envAcc > 4) { envAcc = 0; if (autoMode) updateEnv(new Date()); }
  if (rainPane.isVisible) rainTex.vOffset -= dt * (weather.rain === 2 ? 0.5 : 0.25);
  drawDaw(T); drawMeter(T); clockAcc += dt; if (clockAcc > 1) { clockAcc = 0; drawClock(); }
  // lava blobs
  for (const b of blobs) { const k = Math.sin(T * b._speed + b._phase); b.position.y = 0.10 + (k * 0.5 + 0.5) * 0.085; b.position.x = Math.sin(T * b._speed * 0.7 + b._phase * 2) * 0.012; b.position.z = Math.cos(T * b._speed * 0.6 + b._phase) * 0.012; b.scaling.y = 1 + 0.35 * Math.sin(T * b._speed * 1.9 + b._phase); }
  lavaLight.intensity = 0.8 + 0.12 * Math.sin(T * 0.9);
  // neon breathe + rare flicker
  const nb = 2.0 + Math.sin(T * 3) * 0.2 + (Math.random() < 0.008 ? -1.4 : 0); neonMat.emissiveColor.set(nb * 1.1, nb * 0.28, nb * 0.18);
  // radio needle scan
  // cat update
  updateCat(dt);
  // hearts
  for (let i = hearts.length - 1; i >= 0; i--) { const h = hearts[i]; h._life -= dt; if (h._life <= 0) { h.dispose(); hearts.splice(i, 1); continue; } h.position.y += dt * 0.35; h.position.x += h._vx * dt; h.material.alpha = Math.min(1, h._life / 0.8); }
  // pin the eye height — collisions can only push horizontally, never lift you
  if (scene.activeCamera) scene.activeCamera.position.y = EYE_H;
});

function updateCat(dt) {
  const cs = catState;
  if (cs.walking) {
    const dx = cs.tx - catGrp.position.x, dz = cs.tz - catGrp.position.z; const dist = Math.hypot(dx, dz);
    if (dist < 0.06) { cs.walking = false; cs.dwell = 4 + Math.random() * 10; }
    else { const want = Math.atan2(dx, dz); let dy = want - cs.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; cs.yaw += dy * Math.min(1, dt * 6); const spd = 0.5; catGrp.position.x += (dx / dist) * spd * dt; catGrp.position.z += (dz / dist) * spd * dt; }
  } else { cs.dwell -= dt; if (cs.dwell <= 0) { const spot = catSpots[Math.floor(Math.random() * catSpots.length)]; cs.tx = spot.x; cs.tz = spot.z; cs.ty = spot.y; cs.walking = true; } }
  cs.baseY += (cs.ty - cs.baseY) * Math.min(1, dt * 5);
  catGrp.position.y = cs.baseY; catGrp.rotation.y = cs.yaw - Math.PI / 2;
  // breathing / trot bob
  const bob = cs.walking ? Math.abs(Math.sin(T * 8)) * 0.012 : Math.sin(T * 1.6) * 0.006;
  catBody.position.y = 0.115 + bob;
  // tail sway
  const sway = Math.sin(T * (cs.walking ? 6 : 1.6)); tailSegs[0].rotation.x = sway * 0.35; tailSegs[1].rotation.x = sway * 0.30; tailSegs[2].rotation.x = sway * 0.25;
  // legs trot
  catLegs.forEach((leg, i) => { leg.rotation.x = cs.walking ? Math.sin(T * 8 + (i % 2 ? Math.PI : 0)) * 0.5 : 0; });
}

// =====================================================================
// HAVOK — throw things; click the cat for hearts
// =====================================================================
let physicsReady = false;
async function initPhysics() {
  try {
    const havok = await HavokPhysics({ locateFile: (f) => "https://cdn.babylonjs.com/havok/" + f });
    scene.enablePhysics(new V3(0, -9.81, 0), new B.HavokPlugin(true, havok));
    new B.PhysicsAggregate(floor, B.PhysicsShapeType.BOX, { mass: 0, restitution: 0.4, friction: 0.8 }, scene);
    physicsReady = true;
  } catch (e) { console.warn("havok", e); }
}
let thrown = 0;
const throwColors = [0xff4d59, 0x4dccff, 0xffd633, 0x99ff66, 0xe666ff];
function throwBall() {
  if (!physicsReady || thrown > 40) return;
  const col = throwColors[thrown % throwColors.length];
  const s = B.MeshBuilder.CreateSphere("thrown" + thrown, { diameter: 0.12, segments: 16 }, scene);
  const dir = camera.getDirection(B.Axis.Z);
  s.position.copyFrom(camera.position).addInPlace(dir.scale(0.4));
  const m = metal("thrownM" + thrown, col, 0.2, 0.25); m.emissiveColor = C(col).scale(0.25); s.material = m; s.receiveShadows = true; shadow.addShadowCaster(s);
  const agg = new B.PhysicsAggregate(s, B.PhysicsShapeType.SPHERE, { mass: 0.6, restitution: 0.72, friction: 0.5 }, scene);
  agg.body.applyImpulse(dir.scale(7), s.position); thrown++;
}
scene.onPointerObservable.add((p) => {
  if (p.type !== B.PointerEventTypes.POINTERDOWN) return;
  if (!engine.isPointerLock) { engine.enterPointerlock(); return; }
  const ray = camera.getForwardRay(3); const hit = scene.pickWithRay(ray, (m) => m.name.startsWith("cat") || m.name.startsWith("catSkull") || m.name.startsWith("catBody"));
  if (hit && hit.hit) popHearts(); else throwBall();
});

// =====================================================================
// boot
// =====================================================================
// =====================================================================
// DESK ARRANGE MODE — drag props on the desk; persists to localStorage and
// exports a layout you paste back so it gets baked in permanently.
// =====================================================================
const LS_KEY = "metro.desk.layout";
// baked-in arrangement (your "copy layout"); localStorage overrides this per-visitor
const DEFAULT_LAYOUT = {
  "monitor": { x: 0, y: 0.749, z: -0.2, ry: -1.571, s: 0.543 },
  "external-monitor": { x: 0.66, y: 0.979, z: -0.18, ry: -0.35, s: 0.004 },
  "keyboard": { x: -0.02, y: 0.751, z: 0.25, ry: 0, s: 0.181 },
  "mouse": { x: 0.31, y: 0.74, z: 0.2, ry: 0, s: 1.104 },
  "midi": { x: -0.03, y: 0.63, z: 0.478, ry: 0, s: 0.004 },
  "mixer": { x: -0.02, y: 0.74, z: 0.01, ry: 0, s: 1 },
  "mug": { x: 0.45, y: 0.779, z: -0.02, ry: 0, s: 0.004 },
  "clock": { x: -0.75, y: 0.775, z: -0.15, ry: 0.35, s: 1 },
  "mac": { x: 0.66, y: 0.787, z: -0.18, ry: 0, s: 1 },
};
let editMode = false, selected = null, dragging = false, grabOff = { x: 0, z: 0 }, editables = [], editHL = null;
const editToggle = document.getElementById("edit-toggle"), editPanel = document.getElementById("editpanel");
const editSel = document.getElementById("edit-sel"), editXform = document.getElementById("edit-xform");
function meshesOf(node) { const cm = node.getChildMeshes ? node.getChildMeshes(false) : []; return cm.length ? cm : [node]; }
function nodeXform(n) { return { x: +n.position.x.toFixed(3), y: +n.position.y.toFixed(3), z: +n.position.z.toFixed(3), ry: +n.rotation.y.toFixed(3), s: +n.scaling.x.toFixed(3) }; }
function applyXform(n, t) { n.position.set(t.x, t.y, t.z); n.rotation.y = t.ry; if (t.s) n.scaling.setAll(t.s); }
function layoutObj() { const o = {}; editables.forEach(e => o[e.name] = nodeXform(e.node)); return o; }
function saveLayout() { try { localStorage.setItem(LS_KEY, JSON.stringify(layoutObj())); } catch { } }
function setupEditor() {
  const uwScreen = scene.getMeshByName("uwScreenPlane"); if (uwScreen && deskProps.ultrawide) uwScreen.setParent(deskProps.ultrawide);
  const clockBody = scene.getMeshByName("clockBody"), clockFace = scene.getMeshByName("clockFace"); if (clockBody && clockFace) clockFace.setParent(clockBody);
  editables = [
    { name: "monitor", node: deskProps.ultrawide }, { name: "external-monitor", node: deskProps.portable },
    { name: "keyboard", node: deskProps.kb }, { name: "mouse", node: deskProps.mouse }, { name: "midi", node: deskProps.midi },
    { name: "mixer", node: mixer }, { name: "mug", node: deskProps.mug }, { name: "clock", node: clockBody }, { name: "mac", node: scene.getMeshByName("mac") },
    { name: "pedalboard", node: pbRef }, { name: "guitar", node: tele }, // floor items (world space)
  ].filter(e => e.node);
  editables.forEach(e => meshesOf(e.node).forEach(m => { m._editable = e; m.isPickable = true; }));
  editHL = new B.HighlightLayer("editHL", scene);
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { }
  const layout = Object.assign({}, DEFAULT_LAYOUT, saved); // saved (localStorage) overrides the baked default
  editables.forEach(e => { if (layout[e.name]) applyXform(e.node, layout[e.name]); });
  editToggle.addEventListener("click", () => toggleEdit(!editMode));
  document.getElementById("edit-copy").addEventListener("click", () => { const t = JSON.stringify(layoutObj(), null, 2); navigator.clipboard?.writeText(t).then(() => flashHint("layout copied — paste it to me to bake in")); console.log("DESK LAYOUT:\n" + t); });
  document.getElementById("edit-reset").addEventListener("click", () => { try { localStorage.removeItem(LS_KEY); } catch { } location.reload(); });
  document.getElementById("edit-done").addEventListener("click", () => toggleEdit(false));
  window.addEventListener("keydown", onEditKey);
  scene.onPointerObservable.add(onEditPointer);
}
function selectEd(e) {
  if (selected) meshesOf(selected.node).forEach(m => editHL.removeMesh(m));
  selected = e;
  if (e) { meshesOf(e.node).forEach(m => editHL.addMesh(m, B.Color3.FromHexString("#2dd4bf"))); editSel.textContent = "▸ " + e.name; updXformHud(); }
  else { editSel.textContent = "click an item to select"; editXform.textContent = ""; }
}
function updXformHud() { if (!selected) return; const t = nodeXform(selected.node); editXform.textContent = `x ${t.x}  y ${t.y}  z ${t.z}\nrot ${t.ry}  size ${t.s}`; }
function planeHit(h) { const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, B.Matrix.Identity(), camera); const t = (h - ray.origin.y) / ray.direction.y; if (t <= 0) return null; const p = ray.origin.add(ray.direction.scale(t)); return { x: p.x, z: p.z }; } // world x/z
function setWorldXZ(n, wx, wz) { const y = n.position.y; if (n.parent && n.parent.getWorldMatrix) { const loc = B.Vector3.TransformCoordinates(new V3(wx, n.getAbsolutePosition().y, wz), B.Matrix.Invert(n.parent.computeWorldMatrix(true))); n.position.x = loc.x; n.position.z = loc.z; } else { n.position.x = wx; n.position.z = wz; } n.position.y = y; }
function toggleEdit(on) {
  editMode = on; editToggle.classList.toggle("on", on); editPanel.classList.toggle("show", on);
  editToggle.textContent = on ? "✦ exit arrange" : "✦ arrange desk";
  if (on) { engine.exitPointerlock?.(); camera.detachControl(); flashHint("arrange mode — click an item, drag to move"); } else { selectEd(null); camera.attachControl(canvas, true); }
}
function onEditPointer(pi) {
  if (!editMode) return;
  if (pi.type === B.PointerEventTypes.POINTERDOWN) {
    const pick = scene.pick(scene.pointerX, scene.pointerY, m => !!m._editable);
    if (pick.hit && pick.pickedMesh && pick.pickedMesh._editable) {
      selectEd(pick.pickedMesh._editable);
      const abs = selected.node.getAbsolutePosition(), hit = planeHit(abs.y);
      grabOff = hit ? { x: abs.x - hit.x, z: abs.z - hit.z } : { x: 0, z: 0 };
      dragging = true;
    } else selectEd(null);
  } else if (pi.type === B.PointerEventTypes.POINTERUP) { dragging = false; if (selected) saveLayout(); }
  else if (pi.type === B.PointerEventTypes.POINTERMOVE && dragging && selected) {
    const hit = planeHit(selected.node.getAbsolutePosition().y);
    if (hit) { setWorldXZ(selected.node, hit.x + grabOff.x, hit.z + grabOff.z); updXformHud(); }
  }
}
function onEditKey(ev) {
  if (ev.code === "KeyG") { toggleEdit(!editMode); ev.preventDefault(); return; }
  if (!editMode || !selected) return;
  const n = selected.node, f = ev.shiftKey ? 0.2 : 1, st = 0.01 * f, rt = 0.05 * f, sc = 0.02 * f; let ok = true;
  switch (ev.code) {
    case "ArrowUp": n.position.z -= st; break; case "ArrowDown": n.position.z += st; break;
    case "ArrowLeft": n.position.x -= st; break; case "ArrowRight": n.position.x += st; break;
    case "BracketLeft": n.rotation.y -= rt; break; case "BracketRight": n.rotation.y += rt; break;
    case "Minus": n.position.y -= st; break; case "Equal": n.position.y += st; break;
    case "Comma": n.scaling.setAll(Math.max(0.05, n.scaling.x - sc)); break; case "Period": n.scaling.setAll(n.scaling.x + sc); break;
    default: ok = false;
  }
  if (ok) { ev.preventDefault(); updXformHud(); saveLayout(); }
}

window.addEventListener("resize", () => engine.resize());
engine.runRenderLoop(() => scene.render());
setProg(72, "almost…");
scene.whenReadyAsync().then(async () => { setProg(82, "loading models…"); await loadHeroProps(); setupEditor(); setProg(90, "physics…"); await initPhysics(); setProg(100, "enter ▸"); enterBtn.disabled = false; });

let entered = false;
function enter() {
  if (entered) return; entered = true;
  gate.classList.add("gone"); badge.classList.add("show"); document.getElementById("credits")?.classList.add("show"); editToggle.classList.add("show");
  hint.textContent = "WASD move · mouse look · G = arrange desk · L = lighting · click to throw · Esc frees cursor";
  hint.classList.add("show"); setTimeout(() => hint.classList.remove("show"), 7000);
  canvas.focus(); engine.enterPointerlock();
}
enterBtn.addEventListener("click", enter);

// press L to cycle the lighting mood (golden hour → midday → studio → night/neon)
function flashHint(t) { hint.textContent = t; hint.classList.add("show"); clearTimeout(flashHint._t); flashHint._t = setTimeout(() => hint.classList.remove("show"), 2400); }
window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyL") return;
  moodIdx = moodIdx + 1 >= MOODS.length ? -1 : moodIdx + 1;
  if (moodIdx < 0) { autoMode = true; updateEnv(new Date()); flashHint("lighting: auto — real time at your location"); }
  else { autoMode = false; applyMood(MOODS[moodIdx]); flashHint("lighting: " + MOODS[moodIdx].label + " (frozen)"); }
});

window.METRO_BJS = {
  engine, scene, camera, throwBall, popHearts, B, applyMood, MOODS,
  setMood: (i) => { autoMode = false; moodIdx = i % MOODS.length; applyMood(MOODS[moodIdx]); },
  // preview a time of day (hours 0-23) without waiting for the real clock
  previewTime: (h, m = 30) => { autoMode = false; const d = new Date(); d.setHours(h, m, 0, 0); updateEnv(d); },
  goAuto: () => { autoMode = true; updateEnv(new Date()); },
  toggleEdit: (on) => toggleEdit(on), get editLayout() { return layoutObj(); },
  get weather() { return weather; },
  get boombox() { return boombox; },
  get pedalboard() { return pbRef; },
  placeBoombox: (x, y, z, ry, t) => placeBoombox(x, y, z, ry, t),
  fitPedal: (t, x, y, z, ry) => { if (pbRef) fitOn(pbRef, t, x, y, z, ry, 0); },
  get apolloGLB() { return apolloGLB; },
  tuneApollo: (rx, ry, rz, t, x, z) => tuneApollo(rx, ry, rz, t, x, z),
  get deskProps() { return deskProps; },
  deskTune: (key, t, x, z, ry, rx = 0) => { const m = deskProps[key]; if (!m) return; m.scaling.setAll(t / m._naturalMax); m.rotation = new V3(rx, ry, 0); m.position.set(x, 0.74, z); m.computeWorldMatrix(true); const { min } = m.getHierarchyBoundingVectors(); m.position.y += 0.74 - min.y; },
};
