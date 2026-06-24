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

// invisible solid colliders — the walls have visual holes (window, closet) but you can't walk through
// glass or into the closet recess. only the arcade door (handled elsewhere) is a real opening; seal the rest.
function solid(name, w, h, d, x, y, z, ry = 0) {
  const me = B.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
  me.position.set(x, y, z); me.rotation.y = ry; me.isVisible = false; me.checkCollisions = true; me.isPickable = false;
  return me;
}
solid("colFront", 3.72, H, 0.12, 0, H / 2, ZF);          // seal the whole window wall (glass blocks you)
solid("colWest", D, H, 0.12, -X, H / 2, 0, Math.PI / 2);  // seal the closet mouth (it's a recess, not a passage)
solid("colBack", W, H, 0.12, 0, H / 2, ZB);               // belt-and-suspenders on the back wall
// furniture you shouldn't be able to walk through (the rack already collides on its own body)
solid("colDesk", 1.95, 0.78, 0.86, 0.2, 0.39, ZF + 0.49);     // the whole desk footprint
solid("colDrums", 0.95, 1.0, 0.95, -1.95, 0.5, -2.6, 0.85);   // the e-drum kit

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
  const slab = box(name, w, h, 0.07, x, y, z, panelMat); slab.rotation.y = ry; slab._panel = true; slab._blocker = true;
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
// light panel on the east wall — a vertical dimmer + a horizontal hue slider you point at & drag (no menu).
// dim runs y 1.20→1.40 (off→full); hue handle slides in z 1.73→1.85 across the rainbow track.
box("lp_back", 0.02, 0.36, 0.17, 2.53, 1.30, 1.78, matte("lp_back", 0x15151b), null, false);
box("lp_bezel", 0.024, 0.34, 0.15, 2.527, 1.30, 1.78, matte("lp_bezel", 0x222230), null, false);
box("lp_dimtrack", 0.014, 0.22, 0.022, 2.516, 1.31, 1.745, matte("lp_dimtrk", 0x07070a), null, false);
const dimHandle = box("lp_dimh", 0.032, 0.03, 0.07, 2.508, 1.20, 1.745, emis("lp_dimh", 0x666666, { glow: false }), null, false);
box("lp_huetrack", 0.014, 0.03, 0.14, 2.516, 1.155, 1.79, emis("lp_huetrk", 0x888888, { glow: false }), null, false);
const hueHandle = box("lp_hueh", 0.032, 0.05, 0.018, 2.508, 1.155, 1.79, emis("lp_hueh", 0xff8040, { glow: false }), null, false);
// invisible, forgiving pick pads in front of the handles so the crosshair doesn't need to be pixel-perfect
const dimPad = box("lp_dimpad", 0.006, 0.21, 0.16, 2.498, 1.325, 1.78, matte("lp_pad", 0x000000), null, false); dimPad.visibility = 0; dimPad._lightCtrl = "dim";
const huePad = box("lp_huepad", 0.006, 0.075, 0.16, 2.498, 1.16, 1.78, matte("lp_pad2", 0x000000), null, false); huePad.visibility = 0; huePad._lightCtrl = "hue";
cyl("fixture", 0.16, 0.19, 0.05, 0, H - 0.03, 0.4, matte("fix", 0xd8d2c4), null, 16, false);
const fixtureGlow = cyl("fixtureGlow", 0.13, 0.13, 0.012, 0, H - 0.058, 0.4, emis("fixGlow", 0x222222, { glow: false }), null, 16, false);
const roomLamp = new B.PointLight("roomLamp", new V3(0, H - 0.35, 0.4), scene); roomLamp.diffuse = C(0xffe2b8); roomLamp.intensity = 0; roomLamp.range = 9;
// the room light the panel controls (level 0..1, hue 0..360). manual — survives the day/night ticks.
let lampLevel = 0, lampHue = 38, lampSat = 0.35;
function lampColor() { return B.Color3.FromHSV(lampHue, lampSat, 1); }
function updateLamp() {
  const col = lampColor();
  // gentle: full-up is a soft room light, not a floodlight. ease-in curve so the low end isn't twitchy.
  roomLamp.diffuse = col; roomLamp.intensity = Math.pow(lampLevel, 1.5) * 5.0; roomLamp.range = 9;
  fixtureGlow.material.emissiveColor = lampLevel > 0.02 ? col.scale(0.6) : C(0x222222);
  dimHandle.position.y = 1.20 + lampLevel * 0.20; dimHandle.material.emissiveColor = lampLevel > 0.02 ? col : C(0x3a3a3a);
  hueHandle.position.z = 1.73 + (lampHue / 360) * 0.12; hueHandle.material.emissiveColor = col;
}

// =====================================================================
// DESK RIG — desk(0.2,0,-2.81), D-Box, ultrawide+DAW, keyboard, trackball, Mac
// =====================================================================
const desk = node("desk", 0.2, 0, ZF + 0.49);
box("deskTop", 1.9, 0.04, 0.78, 0, 0.72, 0, (() => { const m = new B.StandardMaterial("deskTopM", scene); m.diffuseTexture = deskTex; m.specularColor = new B.Color3(0.08, 0.07, 0.05); return m; })(), desk).checkCollisions = true;
[-0.88, 0.88].forEach((lx) => box("deskLeg" + lx, 0.05, 0.7, 0.7, lx, 0.35, 0, matte("deskLeg", 0x16181b), desk, false));
// (D-Box removed — the ultrawide stands on its own)
// ultrawide monitor — it's ON, slideshowing the photos people pinned to the wall (see slide driver below)
box("monBezel", 0.94, 0.41, 0.03, 0, 1.04, -0.21, matte("monBezel", 0x0c0d10), desk);
const slideTex = new B.DynamicTexture("slide", { width: 2048, height: 868 }, scene, true); // 2x the old 1024×434 — sharper photos
slideTex.uScale = -1; slideTex.uOffset = 1; slideTex.vScale = -1; slideTex.vOffset = 1; // monScreen is rotated 180°; un-rotate the image
const slideMat = emis("slideMat", 0xffffff, { glow: false }); slideMat.emissiveTexture = slideTex; slideMat.emissiveColor = new B.Color3(0.42, 0.42, 0.42); // dimmer — was 0.62, the screen was washing out the desk
const monScreen = plane("monScreen", 0.92, 0.39, slideMat); monScreen.parent = desk; monScreen.position.set(0, 1.04, -0.194); monScreen.rotation.y = Math.PI;
const dawTex = new B.DynamicTexture("daw", { width: 1024, height: 434 }, scene, false); // kept for the meter helper's sibling API; unused on screen
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
// kick-drum glow: a soft-lit port + the same cyan rim the hex pads wear
cyl("kickf", 0.185, 0.185, 0.012, 0, 0.047, 0, emis("kickFace", 0x123a4a), kickG, 6, false);
const kickRim = B.MeshBuilder.CreateTorus("kickr", { diameter: 0.404, thickness: 0.03, tessellation: 6 }, scene); kickRim.material = rimMat; kickRim.parent = kickG; kickRim.position.y = 0.05; kickRim.rotation.y = Math.PI / 6;
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
// keyboard floor pedals — REMOVED from the room (user: the clutter goes, the FX stays).
// their reverb/colour lives in the global audio chain (the convolver send in ensureAudio),
// so the sound is unchanged; we just don't draw the stompboxes. node built then disabled
// so the editor registry / layout JSON below stays valid.
const kbPedals = node("kbPedals", 0.2, 0, ZF + 1.0); kbPedals.rotation.y = -0.08;
box("kbpPlate", 0.42, 0.018, 0.2, 0, 0.055, 0, matte("kbpPlate", 0x18191d), kbPedals, false).rotation.x = -0.24;
stomp(-0.13, 0x6a2f7a, 0xd66bff, kbPedals, 0.95); stomp(0, 0x1f5a7a, 0x4fbfe6, kbPedals, 0.95); stomp(0.13, 0x2f6a3a, 0x6bff8a, kbPedals, 0.95);
kbPedals.setEnabled(false);

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
    // the TV screen mesh has no usable UVs (and a plane parented to the GLB __root__ won't render the
    // slideshow), so reuse the procedural monScreen — it's correctly oriented + already shows DynamicTextures.
    // just slide it onto the TV's panel face, proud of the glass, and size it to fit.
    const h = bb.max.y - bb.min.y, panelBot = bb.min.y + h * 0.24, top = bb.max.y - h * 0.06;
    const sw = (bb.max.x - bb.min.x) * 0.9, sh = (top - panelBot) * 0.95;
    const cx = (bb.min.x + bb.max.x) / 2, cy = (panelBot + top) / 2;
    monScreen.scaling.set(sw / 0.92, sh / 0.39, 1);
    monScreen.position.x = cx - desk.position.x; monScreen.position.y = cy - desk.position.y;
    monScreen._panelZ = bb.max.z - desk.position.z; applyScreenDepth(); // sits `screenDepth` proud of the panel — tunable in arrange mode
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
// spots all sit in the open middle/back of the room — the front third (z < -1.9) is desk/drums/rack,
// so the cat's straight-line trots between these never cross furniture. it's also clamped to the room each frame.
const catSpots = [{ x: 0.2, z: SWEET.z, y: 0.51 }, { x: 1.6, z: 0.6, y: 0 }, { x: -1.4, z: 0.4, y: 0 }, { x: 1.7, z: 2.2, y: 0 }, { x: -1.4, z: 2.2, y: 0 }, { x: 0.3, z: 1.6, y: 0 }];
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
const clampSun = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// keep the god-ray sun pinned INSIDE the window opening (so it's only ever seen through the glass, never bleeding over the wall)
const placeSun = (az2, alt2) => sunDisc.position.set(clampSun(Math.sin(az2) * 1.4, -1.1, 1.1), clampSun(1.0 + Math.tan(alt2) * 0.7, 1.05, 2.15), ZF + 0.05);
const sunDisc = B.MeshBuilder.CreateDisc("sunDisc", { radius: 0.32, tessellation: 40 }, scene); placeSun(az, alt);
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
const LAT = 33.9164, LNG = -118.3526;   // Hawthorne, CA — sun & moon are computed for exactly here
const weather = { clouds: 0, rain: 0 };
let envAcc = 0;

// astro ceiling — real GEOMETRY stars (emissive colour works + the glow layer makes them
// glow); only the stars glow, never the whole roof. Fades in at night.
const STAR_MAT = new B.StandardMaterial("starMat", scene);
STAR_MAT.diffuseColor = new B.Color3(0, 0, 0); STAR_MAT.specularColor = new B.Color3(0, 0, 0); STAR_MAT.emissiveColor = new B.Color3(0, 0, 0); STAR_MAT.disableLighting = true;
const astroGrp = node("astroGrp", 0, H - 0.05, 0);
const sRnd = (i) => { const v = Math.abs(Math.sin(i * 12.9898) * 43758.5453); return v - Math.floor(v); };
for (let i = 0; i < 95; i++) {
  const star = B.MeshBuilder.CreateSphere("star" + i, { diameter: 0.013 * (0.5 + sRnd(i + 33) * 0.7), segments: 6 }, scene);
  star.material = STAR_MAT; star.parent = astroGrp; star.position.set((sRnd(i) - 0.5) * (W - 0.4), 0, (sRnd(i + 99) - 0.5) * (D - 0.4));
}
const DIPPER = [[-1.7, -1.4], [-1.0, -1.05], [-0.3, -0.8], [0.35, -0.55], [0.5, 0.2], [-0.25, 0.45], [-0.55, -0.25]]; // Big Dipper, brighter
DIPPER.forEach((d, i) => { const s = B.MeshBuilder.CreateSphere("dip" + i, { diameter: 0.026, segments: 8 }, scene); s.material = STAR_MAT; s.parent = astroGrp; s.position.set(d[0], 0, d[1]); });
astroGrp.setEnabled(false);

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
  placeSun(az, alt); // clamped inside the window opening
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
  updateLamp(); // the room lamp is driven by the manual dimmer, not the day/night cycle
  ip.exposure = sunAlt > 0 ? 0.92 : sunAlt > -0.2 ? 0.95 : 1.04;
  drawSky(sp.azimuth, sunAlt, moonAlt, frac, weather.clouds);
  rainPane.isVisible = weather.rain > 0; rainMat.alpha = weather.rain > 0 ? 0.55 : 0;
  const fade = Math.max(0, Math.min(1, (-sunAlt * 57.3 - 4) / 6));
  astroGrp.setEnabled(fade > 0.02); STAR_MAT.emissiveColor.set(fade * 1.7, fade * 1.7, fade * 1.85);
}

// weather from Open-Meteo (CORS-open, no key)
async function fetchWeather() {
  try { const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&current=cloud_cover,precipitation`); const j = await r.json(); const cur = j.current || {}; weather.clouds = (cur.cloud_cover || 0) / 100; weather.rain = cur.precipitation > 0.5 ? 2 : cur.precipitation > 0.05 ? 1 : 0; } catch (e) { /* clear on failure */ }
}
// (location is pinned to Hawthorne, CA — no geolocation override)
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
  // ONLY the numbers glow: pure-black field emits nothing (emissive), so just the lit digits read.
  const w = 310, h = 116; cctx.fillStyle = "#000000"; cctx.fillRect(0, 0, w, h);
  const now = new Date(); const opt = { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", hour12: false };
  let s = "--:--"; try { s = new Intl.DateTimeFormat("en-US", opt).format(now); } catch {}
  cctx.fillStyle = "#ff7a3c"; cctx.font = "700 58px monospace"; cctx.textAlign = "center"; cctx.textBaseline = "middle";
  cctx.fillText(s, w / 2, h / 2 + 2); cctx.textAlign = "left"; cctx.textBaseline = "alphabetic"; clockTex.update(false);
}
let clockAcc = 0;

// THE MONITOR SLIDESHOW — the ultrawide is on, cycling the photos people pinned to the wall.
// urls are filled by importWallNotes(); we cover-fit each into slideTex (a DynamicTexture, which renders
// as emissive here — a loaded jpg as emissiveTexture would not).
const slide = { urls: [], i: -1, acc: 0, period: 6, lastImg: null, lastLabel: "" };
// live photo grade for ALL the screen pics at once (driven by the arrange-mode sliders)
const photoFx = { contrast: 1.08, shadows: -0.4 }; // shadows: <0 deepen, >0 lift the blacks
let screenDepth = 0; // how far the slideshow plane sits proud of the TV glass
const SCREEN_FX_KEY = "metro.screen.fx";
function applyScreenDepth() { if (monScreen._panelZ != null) monScreen.position.z = monScreen._panelZ + screenDepth; }
function drawSlide(img, label) {
  slide.lastImg = img; slide.lastLabel = label; // remember, so the sliders can re-grade the same shot live
  const sctx = slideTex.getContext(), sz = slideTex.getSize(), w = sz.width, h = sz.height, k = h / 434; // ui sized to the original 434px design
  sctx.globalCompositeOperation = "source-over"; sctx.filter = "none"; sctx.fillStyle = "#04050a"; sctx.fillRect(0, 0, w, h);
  if (img) {
    sctx.imageSmoothingEnabled = true; sctx.imageSmoothingQuality = "high";
    // CONTAIN, not cover — show the WHOLE photo (letterboxed), never crop/zoom into it
    const s = Math.min(w / img.width, h / img.height), dw = img.width * s, dh = img.height * s, dx = (w - dw) / 2, dy = (h - dh) / 2;
    sctx.filter = `contrast(${photoFx.contrast}) saturate(1.08)`;
    sctx.drawImage(img, dx, dy, dw, dh); sctx.filter = "none";
    if (photoFx.shadows > 0) { // lift the blacks toward grey
      sctx.globalCompositeOperation = "lighten"; const L = Math.round(255 * photoFx.shadows * 0.6);
      sctx.fillStyle = `rgb(${L},${L},${L})`; sctx.fillRect(dx, dy, dw, dh);
    } else if (photoFx.shadows < 0) { // deepen the shadows (multiply pulls darks down hardest)
      sctx.globalCompositeOperation = "multiply"; const m = Math.round(255 * (1 + photoFx.shadows));
      sctx.fillStyle = `rgb(${m},${m},${m})`; sctx.fillRect(dx, dy, dw, dh);
    }
    sctx.globalCompositeOperation = "source-over";
  }
  sctx.strokeStyle = "#0a0c12"; sctx.lineWidth = 10 * k; sctx.strokeRect(0, 0, w, h); // thin inner bezel
  const bar = 32 * k; sctx.fillStyle = "rgba(0,0,0,.42)"; sctx.fillRect(0, h - bar, w, bar);
  sctx.fillStyle = "#2dd4bf"; sctx.font = `700 ${Math.round(18 * k)}px ui-monospace, monospace`; sctx.textAlign = "left";
  sctx.fillText(label || "▸ THE WALL", 16 * k, h - 11 * k); slideTex.update(false);
}
function regrade() { drawSlide(slide.lastImg, slide.lastLabel); } // re-paint the current shot with the latest grade
function nextSlide() {
  if (!slide.urls.length) { drawSlide(null, "▸ the wall — powering on…"); return; }
  slide.i = (slide.i + 1) % slide.urls.length;
  const url = slide.urls[slide.i], n = slide.i + 1, tot = slide.urls.length;
  const im = new Image(); im.crossOrigin = "anonymous";
  im.onload = () => { try { drawSlide(im, `▸ the wall   ${n}/${tot}`); } catch (e) { drawSlide(null, `▸ the wall   ${n}/${tot}`); } };
  im.onerror = () => drawSlide(null, `▸ the wall   ${n}/${tot}`);
  im.src = url;
}
drawSlide(null, "▸ the wall — powering on…");

scene.onBeforeRenderObservable.add(() => {
  const dt = Math.min(0.05, engine.getDeltaTime() / 1000); T += dt;
  // re-read the real sun/moon every few seconds (cheap; the sky only changes slowly)
  envAcc += dt; if (envAcc > 4) { envAcc = 0; if (autoMode) updateEnv(new Date()); }
  if (rainPane.isVisible) rainTex.vOffset -= dt * (weather.rain === 2 ? 0.5 : 0.25);
  drawMeter(T); clockAcc += dt; if (clockAcc > 1) { clockAcc = 0; drawClock(); }
  slide.acc += dt; if (slide.acc > slide.period) { slide.acc = 0; nextSlide(); } // advance the monitor slideshow
  // lava blobs
  for (const b of blobs) { const k = Math.sin(T * b._speed + b._phase); b.position.y = 0.10 + (k * 0.5 + 0.5) * 0.085; b.position.x = Math.sin(T * b._speed * 0.7 + b._phase * 2) * 0.012; b.position.z = Math.cos(T * b._speed * 0.6 + b._phase) * 0.012; b.scaling.y = 1 + 0.35 * Math.sin(T * b._speed * 1.9 + b._phase); }
  lavaLight.intensity = 0.8 + 0.12 * Math.sin(T * 0.9);
  // neon breathe + rare flicker
  const nb = 2.0 + Math.sin(T * 3) * 0.2 + (Math.random() < 0.008 ? -1.4 : 0); neonMat.emissiveColor.set(nb * 1.1, nb * 0.28, nb * 0.18);
  // radio needle scan
  // instrument feedback: strummed strings shiver, hit pads bob down then spring back
  if (strumFx > 0) { strumFx = Math.max(0, strumFx - dt); for (let i = 0; i < 3; i++) { const s = scene.getMeshByName("teleStr" + i); if (s) s.rotation.z = Math.sin(T * 90 + i) * strumFx * 0.12; } }
  if (keyFx > 0) { keyFx = Math.max(0, keyFx - dt); if (keyGlow) keyGlow.visibility = keyFx / 0.16; }
  for (let i = btnFx.length - 1; i >= 0; i--) { const b = btnFx[i]; b.t -= dt; const k = Math.max(0, b.t / 0.22); if (b.cap) { b.cap.scaling.y = 1 + k; b.cap.material.emissiveColor = C(b.hue).scale(0.4 + 0.6 * k); } if (b.t <= 0) { if (b.cap) b.cap.scaling.y = 1; btnFx.splice(i, 1); } }
  for (let i = drumFx.length - 1; i >= 0; i--) { const f = drumFx[i]; f.t -= dt; const k = Math.max(0, f.t / 0.12); if (f.node) f.node.scaling.y = 1 - k * 0.4; if (f.t <= 0) { if (f.node) f.node.scaling.y = 1; drumFx.splice(i, 1); } }
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
  // never let the cat leave the room (or tunnel a wall on a long lerp)
  catGrp.position.x = Math.max(-2.35, Math.min(2.35, catGrp.position.x));
  catGrp.position.z = Math.max(-3.05, Math.min(3.05, catGrp.position.z));
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
// =====================================================================
// SOUND — the instruments are PLAYABLE. pure WebAudio synthesis. (Babylon's
// audio engine is for playing/spatialising files, not synthesis — so "better
// sounds" here means better synths, not a Babylon feature: a Karplus-Strong
// plucked guitar, an FM Rhodes for the keys, and synthesised drums, all
// through a shared reverb.) the context is built lazily on the first click.
// =====================================================================
let AC = null, master = null, verbSend = null, chorusIn = null;
function ensureAudio() {
  if (AC) { if (AC.state === "suspended") AC.resume(); return AC; }
  AC = new (window.AudioContext || window.webkitAudioContext)();
  master = AC.createGain(); master.gain.value = 0.5;
  const comp = AC.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.003; comp.release.value = 0.25;
  master.connect(comp); comp.connect(AC.destination);
  const verb = AC.createConvolver(); verb.buffer = makeImpulse(2.0, 2.4);
  verbSend = AC.createGain(); verbSend.gain.value = 0.9; verbSend.connect(verb); verb.connect(master); // a little room around everything
  // 80s CHORUS bus — voices that want that lush detuned shimmer (the pad, the clean guitar)
  // connect their output to chorusIn. dry blend + two LFO-modulated delay voices → master + reverb.
  chorusIn = AC.createGain();
  const cOut = AC.createGain(); cOut.gain.value = 0.6;
  const dryC = AC.createGain(); dryC.gain.value = 0.7; chorusIn.connect(dryC); dryC.connect(cOut);
  [[0.0185, 0.55, 0.0030], [0.0235, 0.34, 0.0038]].forEach(([dt, rate, depth]) => {
    const dl = AC.createDelay(0.05); dl.delayTime.value = dt;
    const lfo = AC.createOscillator(); lfo.type = "sine"; lfo.frequency.value = rate;
    const lg = AC.createGain(); lg.gain.value = depth; lfo.connect(lg); lg.connect(dl.delayTime); lfo.start();
    chorusIn.connect(dl); dl.connect(cOut);
  });
  cOut.connect(master); cOut.connect(verbSend); // chorus gets a reverb tail too
  return AC;
}
function makeImpulse(dur, decay) {
  const rate = AC.sampleRate, len = Math.floor(rate * dur), buf = AC.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
  return buf;
}
function noiseBuf(dur) { const len = Math.floor(AC.sampleRate * dur), b = AC.createBuffer(1, len, AC.sampleRate), d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; const s = AC.createBufferSource(); s.buffer = b; return s; }
function out(node, wet = 0.18) { node.connect(master); const g = AC.createGain(); g.gain.value = wet; node.connect(g); g.connect(verbSend); } // dry to master + a send to the reverb
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
// 80s analog PAD — three detuned saws + a sub through a filter sweep, into the chorus bus.
// soft (50ms) attack so it's still playable on a click; sits with the synth drums.
function playKey(midi, vel = 0.5) {
  const ac = ensureAudio(), t = ac.currentTime, f = mtof(midi);
  const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 3;
  lp.frequency.setValueAtTime(600, t); lp.frequency.linearRampToValueAtTime(2800, t + 0.07); lp.frequency.setTargetAtTime(1400, t + 0.2, 0.5);
  const amp = ac.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(vel * 0.5, t + 0.05);   // gentle swell in
  amp.gain.setTargetAtTime(vel * 0.32, t + 0.12, 0.3);          // settle to sustain
  amp.gain.setTargetAtTime(0.0001, t + 0.45, 0.24);            // tamed release (was t+1.0, tau 0.5)
  [-8, -0.5, 7].forEach((cents) => { const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = f * Math.pow(2, cents / 1200); o.connect(lp); o.start(t); o.stop(t + 1.9); });
  lp.connect(amp);
  const sub = ac.createOscillator(); sub.type = "sine"; sub.frequency.value = f / 2; const sg = ac.createGain(); sg.gain.value = 0.32; sub.connect(sg); sg.connect(amp); sub.start(t); sub.stop(t + 1.9);
  amp.connect(chorusIn); // 80s shimmer + reverb tail
}
// Karplus-Strong plucked string (rendered offline into a buffer, then played)
function pluck(freq, when, dur = 2.2, damp = 0.5, gain = 0.5, wet = 0.16, chorus = false) {
  const ac = ensureAudio(), rate = ac.sampleRate, n = Math.max(2, Math.round(rate / freq)), total = Math.floor(rate * dur);
  const buf = ac.createBuffer(1, total, rate), d = buf.getChannelData(0), ring = new Float32Array(n);
  for (let i = 0; i < n; i++) ring[i] = Math.random() * 2 - 1;
  const fb = 0.992 - damp * 0.02; let pi = 0;
  for (let i = 0; i < total; i++) { const cur = ring[pi], nxt = ring[(pi + 1) % n]; d[i] = cur; ring[pi] = (cur + nxt) * 0.5 * fb; pi = (pi + 1) % n; }
  const src = ac.createBufferSource(); src.buffer = buf; const g = ac.createGain(); g.gain.value = gain; src.connect(g);
  if (chorus) g.connect(chorusIn); else out(g, wet); // 80s clean guitar rides the chorus bus
  src.start(when || ac.currentTime);
}
// up the neck in the CURRENTLY-SELECTED scale: low at the headstock → high at the bridge.
// 80s clean electric: bright (low damping) Karplus pluck pushed through the chorus + reverb.
function guitarNote(frac) {
  const notes = guitarScaleNotes(), f = Math.max(0, Math.min(1, frac)); // 0 headstock → 1 bridge
  const midi = notes[Math.round(f * (notes.length - 1))];
  pluck(mtof(midi), 0, 2.9, 0.22, 0.5, 0.2, true); // bright + chorused
  strumFx = 0.25;
}
// a few nice voicings (midi) — kept for the debug API; a click in-world plays the positional scale above
const CHORDS = [[40, 47, 52, 56, 59, 64], [45, 52, 55, 60, 64, 69], [43, 47, 50, 55, 59, 67], [38, 45, 50, 57, 62, 66]]; // E  Am  G  D
let chordIdx = 0;
function strumGuitar() {
  const ac = ensureAudio(), notes = CHORDS[chordIdx % CHORDS.length], up = chordIdx % 2 === 1; chordIdx++;
  const order = up ? [...notes].reverse() : notes;
  order.forEach((m, i) => pluck(mtof(m), ac.currentTime + i * 0.022, 2.4, 0.45, 0.42));
  strumFx = 0.3;
}
function drum(kind) {
  const ac = ensureAudio(), t = ac.currentTime;
  if (kind === "kick") { const o = ac.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(155, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.11); const g = ac.createGain(); g.gain.setValueAtTime(0.95, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.24); o.connect(g); out(g, 0.06); o.start(t); o.stop(t + 0.26); }
  else if (kind === "snare") { const nz = noiseBuf(0.2), hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1400; const g = ac.createGain(); g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.17); nz.connect(hp); hp.connect(g); out(g, 0.22); nz.start(t); const o = ac.createOscillator(); o.type = "triangle"; o.frequency.setValueAtTime(185, t); const og = ac.createGain(); og.gain.setValueAtTime(0.45, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.11); o.connect(og); out(og, 0.1); o.start(t); o.stop(t + 0.12); }
  else if (kind === "hat") { const nz = noiseBuf(0.07), hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 8000; const g = ac.createGain(); g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); nz.connect(hp); hp.connect(g); out(g, 0.05); nz.start(t); }
  else { const f = kind === "tom1" ? 210 : kind === "tom2" ? 160 : 120; const o = ac.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(f * 1.4, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.18); const g = ac.createGain(); g.gain.setValueAtTime(0.75, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(g); out(g, 0.16); o.start(t); o.stop(t + 0.32); }
}
// tag the instrument meshes so a click finds them; map drum pads to sounds
let keyGlow = null, scaleScreenTex = null, scaleIdx = 0, octShift = 0;
// the two screen buttons cycle the SCALE. it no longer constrains the keybed (that's a real piano
// now) — it drives the GUITAR: change the scale here and the guitar plays in it.
// 0 chromatic, 1 major, 2 minor, 3 diminished, 4 augmented.
const SCALES = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], // chromatic
  [0, 2, 4, 5, 7, 9, 11],                  // major
  [0, 2, 3, 5, 7, 8, 10],                  // natural minor
  [0, 2, 3, 5, 6, 8, 9, 11],               // diminished (octatonic)
  [0, 3, 4, 7, 8, 11],                     // augmented (hexatonic)
];
// THE KEYBED is a real piano: 15 white keys (C→C, 2 octaves) with the sharps on the black keys.
// white-key semitones across an octave (C D E F G A B); black keys exist above C,D,F,G,A (not E,B).
const WHITE = [0, 2, 4, 5, 7, 9, 11], NW = 15, KEY_ROOT_C = 48; // leftmost white key = C3
function pianoKey(u, vBack) {
  const fx = Math.max(0, Math.min(1, u)) * NW; // fractional white-key position 0..15
  // black key: in the BACK ~half of the strip, near a white-key boundary that carries a sharp
  if (vBack > 0.5) {
    const bnd = Math.round(fx);
    if (bnd > 0 && bnd < NW && Math.abs(fx - bnd) < 0.32) {
      const lower = bnd - 1, io = lower % 7; // the black sits above the lower white key
      if (io === 0 || io === 1 || io === 3 || io === 4 || io === 5)
        return { midi: KEY_ROOT_C + octShift + Math.floor(lower / 7) * 12 + WHITE[io] + 1, black: true, gx: bnd / NW };
    }
  }
  let wi = Math.floor(fx); if (wi >= NW) wi = NW - 1; if (wi < 0) wi = 0;
  return { midi: KEY_ROOT_C + octShift + Math.floor(wi / 7) * 12 + WHITE[wi % 7], black: false, gx: (wi + 0.5) / NW };
}
// the GUITAR follows the selected scale (rooted A2, head→low → bridge→high)
const GUITAR_ROOT = 45;
function guitarScaleNotes() {
  const sc = SCALES[scaleIdx], out = []; let o = 0;
  while (out.length < 15) { for (const s of sc) { out.push(GUITAR_ROOT + o * 12 + s); if (out.length >= 15) break; } o++; }
  return out;
}
function drawScaleScreen() {
  if (!scaleScreenTex) return;
  const c = scaleScreenTex.getContext(), w = scaleScreenTex.getSize().width, h = scaleScreenTex.getSize().height;
  c.fillStyle = "#080808"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#ff3b30"; c.font = "bold " + Math.floor(h * 0.74) + "px monospace"; c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText(String(scaleIdx), w / 2, h * 0.52);
  scaleScreenTex.update(false);
}
const btnFx = [];
function flashBtn(cap, hue) { if (!cap) return; cap.material.emissiveColor = C(hue); cap.scaling.y = 2.0; btnFx.push({ cap, hue, t: 0.22 }); }
function setupInstruments() {
  const tag = (mesh, info) => { if (mesh) mesh._instr = info; };
  // guitar: click anywhere along the Tele — position picks the note (carry the node for the math)
  const teleNode = scene.getTransformNodeByName("tele"); if (teleNode) teleNode.getChildMeshes().forEach(m => tag(m, { type: "guitar", tele: teleNode }));
  // KEYS: an invisible forgiving pad over the GLB controller's FRONT key strip only (not the
  // pads/knobs on the top panel). pitch by where you click left→right; the pressed key lights up.
  const midiRoot = deskProps.midi;
  if (midiRoot) {
    const bb = midiRoot.getHierarchyBoundingVectors();
    // measured WHITE-KEY span on midi.glb (the front strip that reaches the front edge) — NOT the
    // full unit width: the left ~7cm is the screen/pads/knobs, no keys there. first white key = first note.
    const x0 = 0.024, x1 = 0.376;
    const zF = bb.max.z, zB = zF - 0.085;                // the white keys live in the front ~8.5cm
    const yT = 0.656;                                    // a hair above the white keytops (~0.653)
    const strip = { x0, x1, z0: zB, z1: zF };
    const pad = B.MeshBuilder.CreatePlane("midiKeyPad", { width: x1 - x0, height: zF - zB, sideOrientation: B.Mesh.DOUBLESIDE }, scene);
    pad.rotation.x = Math.PI / 2; pad.position.set((x0 + x1) / 2, yT, (zB + zF) / 2);
    pad.visibility = 0; pad.isPickable = true; pad._instr = { type: "key", strip };
    // the light-up: a warm additive quad one key wide, parked over the pressed key, faded by keyFx
    keyGlow = B.MeshBuilder.CreatePlane("keyGlow", { width: (x1 - x0) / 14, height: zF - zB, sideOrientation: B.Mesh.DOUBLESIDE }, scene);
    keyGlow.rotation.x = Math.PI / 2; keyGlow.position.set((x0 + x1) / 2, yT + 0.0006, (zB + zF) / 2);
    keyGlow.material = emis("keyGlowMat", 0xffe9a8, { add: true, alpha: 0.85 }); keyGlow.visibility = 0; keyGlow.isPickable = false;
    // SCREEN: replace the GLB's baked red "0" with a live scale-number readout (a DynamicTexture
    // as emissive — the only kind that renders self-lit in this scene). sxc carries the screen
    // centre x down to the buttons so they line up under it.
    let sxc = -0.02;
    const scr = scene.getMeshByName("screen");
    if (scr) {
      scene.getMeshByName("0")?.setEnabled(false); // hide the static digit; we draw our own
      const sb = scr.getBoundingInfo().boundingBox;
      sxc = (sb.minimumWorld.x + sb.maximumWorld.x) / 2;
      const sz = (sb.minimumWorld.z + sb.maximumWorld.z) / 2;
      const sw = (sb.maximumWorld.x - sb.minimumWorld.x) * 0.92, sd = (sb.maximumWorld.z - sb.minimumWorld.z) * 0.92;
      scaleScreenTex = new B.DynamicTexture("scaleScr", { width: 64, height: 48 }, scene, false);
      // the wall-photo recipe: a DynamicTexture wired to BOTH diffuse + emissive renders self-lit
      // here; emissive-only samples as flat white in this pipeline (the known gotcha).
      const sm = emis("scaleScrM", 0xffffff, { glow: false }); sm.emissiveTexture = scaleScreenTex; sm.diffuseTexture = scaleScreenTex; sm.emissiveColor = new B.Color3(1, 1, 1);
      const sQuad = plane("scaleScreen", sw, sd, sm); sQuad.rotation.x = Math.PI / 2; // flat, faces up; reads upright for the player out front
      sQuad.position.set(sxc, sb.maximumWorld.y + 0.0008, sz); sQuad.isPickable = false;
      drawScaleScreen();
    }
    // FOUR BUTTONS under the screen: scale −/+ (amber) then octave −/+ (cyan). left = down, right = up.
    // visible cap (dim emissive, flashes on press) + an invisible forgiving pick-pad over each.
    const mkBtn = (name, bx, bz, hex, action) => {
      const cap = B.MeshBuilder.CreateBox(name, { width: 0.024, height: 0.006, depth: 0.016 }, scene);
      cap.position.set(bx, 0.6655, bz); cap.material = emis(name + "M", hex, { glow: true }); cap.material.emissiveColor.scaleInPlace(0.4); cap.isPickable = false;
      const ppad = B.MeshBuilder.CreatePlane(name + "Pad", { width: 0.03, height: 0.026, sideOrientation: B.Mesh.DOUBLESIDE }, scene);
      ppad.rotation.x = Math.PI / 2; ppad.position.set(bx, 0.667, bz); ppad.visibility = 0; ppad.isPickable = true;
      ppad._instr = { type: "btn", action, cap, hue: hex };
    };
    const amber = 0xffae3b, cyan = 0x3bd6ff, lx = sxc - 0.018, rx = sxc + 0.018; // a pair straddling the screen centre
    mkBtn("scDn", lx, -2.352, amber, "scaleDown"); mkBtn("scUp", rx, -2.352, amber, "scaleUp");
    mkBtn("ocDn", lx, -2.322, cyan, "octDown");  mkBtn("ocUp", rx, -2.322, cyan, "octUp");
  } else {
    tag(scene.getMeshByName("midiKeys"), { type: "key" }); // fallback to the procedural keybed if the GLB failed to load
  }
  // drums: each pad → a voice (ep1 big = snare, kick = kick, others toms/hat)
  const padMap = { ep1: "snare", ep2: "hat", ep3: "tom1", ep4: "tom2", ep5: "tom3", kick: "kick" };
  for (const id in padMap) {
    const bobNode = scene.getTransformNodeByName(id) || scene.getTransformNodeByName(id + "G"); // hex pads are nodes; the kick lives under kickG
    const info = { type: "drum", drum: padMap[id], pad: bobNode };
    ["p", "f", "r", ""].forEach(s => tag(scene.getMeshByName(id + s), info)); // every piece of the pad triggers it
  }
}
let strumFx = 0, keyFx = 0; const drumFx = [];
function playInstrument(pick) {
  const info = pick.pickedMesh._instr; if (!info) return;
  const p = pick.pickedPoint;
  if (info.type === "key") {
    const s = info.strip; let u = 0.5, vBack = 0;
    if (p && s) { u = (p.x - s.x0) / (s.x1 - s.x0); vBack = (s.z1 - p.z) / (s.z1 - s.z0); } // u left→right, vBack front(0)→back(1)
    u = Math.max(0, Math.min(1, u)); vBack = Math.max(0, Math.min(1, vBack));
    const k = pianoKey(u, vBack); // real piano: white = natural, black (back) = sharp
    playKey(k.midi);
    if (keyGlow && s) { // snap the glow to the played key; black keys sit narrower + further back
      keyGlow.position.x = s.x0 + k.gx * (s.x1 - s.x0);
      keyGlow.position.z = k.black ? (s.z0 * 0.72 + s.z1 * 0.28) : (s.z0 + s.z1) / 2;
      keyGlow.scaling.x = k.black ? 0.5 : 1;
      keyGlow.visibility = 1; keyFx = 0.16;
    }
  } else if (info.type === "btn") {
    if (info.action === "scaleDown") scaleIdx = (scaleIdx + SCALES.length - 1) % SCALES.length;
    else if (info.action === "scaleUp") scaleIdx = (scaleIdx + 1) % SCALES.length;
    else if (info.action === "octDown") octShift = Math.max(-24, octShift - 12);
    else if (info.action === "octUp") octShift = Math.min(24, octShift + 12);
    drawScaleScreen(); flashBtn(info.cap, info.hue);
  } else if (info.type === "guitar") {
    let frac = 0.5;
    if (info.tele && p) {
      const inv = info.tele.getWorldMatrix().clone(); inv.invert();
      const local = B.Vector3.TransformCoordinates(p, inv);
      const HEAD_Y = 0.84, BRIDGE_Y = -0.18; // neck runs +Y; head top, bridge bottom
      frac = (HEAD_Y - local.y) / (HEAD_Y - BRIDGE_Y); // low at the head → high at the bridge
    }
    guitarNote(frac);
  } else if (info.type === "drum") { drum(info.drum); if (info.pad) drumFx.push({ node: info.pad, t: 0.12 }); }
}

let lightDrag = null;
scene.onPointerObservable.add((p) => {
  if (editMode || composerOpen) return;
  // dragging the light panel (point-and-drag dimmer / hue, no menu)
  if (lightDrag) {
    if (p.type === B.PointerEventTypes.POINTERMOVE) {
      const e = p.event;
      if (lightDrag === "dim") lampLevel = Math.max(0, Math.min(1, lampLevel - (e.movementY || 0) * 0.0022));
      else lampHue = ((lampHue + (e.movementX || 0) * 0.5) % 360 + 360) % 360;
      updateLamp(); return;
    }
    if (p.type === B.PointerEventTypes.POINTERUP) { lightDrag = null; camera.attachControl(canvas, true); return; }
  }
  if (p.type !== B.PointerEventTypes.POINTERDOWN) return;
  if (!engine.isPointerLock) { engine.enterPointerlock(); return; }
  const lc = scene.pickWithRay(camera.getForwardRay(3.5), (m) => !!m._lightCtrl);
  if (lc && lc.hit) { lightDrag = lc.pickedMesh._lightCtrl; camera.detachControl(); return; } // grab the dimmer/hue
  const ray = camera.getForwardRay(7);
  const instr = scene.pickWithRay(ray, (m) => !!m._instr);
  if (instr && instr.hit) { playInstrument(instr); return; } // play the guitar / keys / drums
  const wallHit = scene.pickWithRay(ray, (m) => !!m._noteWall);
  if (wallHit && wallHit.hit) { openComposer(wallHit.pickedMesh._noteWall, wallHit.pickedPoint); return; }
  const cat = scene.pickWithRay(ray, (m) => m.name.startsWith("cat"));
  if (cat && cat.hit) popHearts(); else throwBall();
});

// =====================================================================
// boot
// =====================================================================
// =====================================================================
// THE NOTES — click a wall to leave a note. Persists in localStorage for now
// (Supabase sharing comes when this room replaces the live site).
// =====================================================================
const NOTES_KEY = "metro.notes";
let composerOpen = false, pending = null, noteColor = "#f4ecc8", notes = [];
const NOTE_WALLS = {
  // uDir = "rightward as seen from the room" so text isn't mirrored; vDir = up; normal = into room (card faces this way)
  back: { origin: new V3(-X, 0, ZB), uDir: new V3(1, 0, 0), vDir: new V3(0, 1, 0), normal: new V3(0, 0, -1) },
  east: { origin: new V3(X, 0, ZB), uDir: new V3(0, 0, -1), vDir: new V3(0, 1, 0), normal: new V3(-1, 0, 0) },
  west: { origin: new V3(-X, 0, ZF), uDir: new V3(0, 0, 1), vDir: new V3(0, 1, 0), normal: new V3(1, 0, 0) },
};
const NOTE_COLORS = ["#f4ecc8", "#f7b7c8", "#bfe3ff", "#c8efc0", "#ffd9a0"];
// the REAL site's wall convention (three.js): notes store x,y as 0..1 fractions of the wall.
// origin/uDir/vDir/w/h match the live room; `right` = camera-right so imported text isn't mirrored.
const IMPORT_WALLS = {
  back: { origin: new V3(X, 0, ZB), uDir: new V3(-1, 0, 0), vDir: new V3(0, 1, 0), normal: new V3(0, 0, -1), w: W, h: H, voids: [] },
  west: { origin: new V3(-X, 0, ZB), uDir: new V3(0, 0, -1), vDir: new V3(0, 1, 0), normal: new V3(1, 0, 0), w: D, h: H, voids: [{ u0: 2.7, u1: 4.7, v0: 0, v1: 2.2 }] }, // closet doorway
  east: { origin: new V3(X, 0, ZF), uDir: new V3(0, 0, 1), vDir: new V3(0, 1, 0), normal: new V3(-1, 0, 0), w: D, h: H, voids: [{ u0: 5.0, u1: 6.2, v0: 0, v1: 2.2 }] }, // entry door
};
const importPlaced = { back: [], east: [], west: [] };
function inVoid(w, u, v, m) { return (w.voids || []).some(z => u + m > z.u0 && u - m < z.u1 && v + m > z.v0 && v - m < z.v1); }
// spiral from the intended (x,y) until the WHOLE note footprint sits on bare wall: every corner
// ray must hit the wall mesh (no panel/door in front, no hole), clear of voids, de-overlapped.
function bareWallSpot(w, wallId, x, y, sz) {
  const U0 = (x ?? 0.5) * w.w, V0 = (y ?? 0.5) * w.h, half = sz / 2;
  let a = 0, r = 0;
  for (let i = 0; i < 240; i++) {
    const u = U0 + Math.cos(a) * r, v = V0 + Math.sin(a) * r; a += 1.15; r += 0.022;
    if (v < half + 0.08 || v > w.h - half - 0.08) continue;          // off floor/ceiling
    if (inVoid(w, u, v, half + 0.04)) continue;                       // off doorways
    const center = w.origin.add(w.uDir.scale(u)).add(w.vDir.scale(v));
    if (importPlaced[wallId].some(s => B.Vector3.Distance(s, center) < sz + 0.05)) continue; // de-overlap
    let centerHit = null, clear = true;
    for (const [du, dv] of [[0, 0], [half, half], [-half, half], [half, -half], [-half, -half]]) {
      const s = w.origin.add(w.uDir.scale(u + du)).add(w.vDir.scale(v + dv));
      const hit = scene.pickWithRay(new B.Ray(s.add(w.normal.scale(0.4)), w.normal.scale(-1), 0.8), (mm) => mm._wallId === wallId || mm._blocker);
      if (!(hit && hit.hit && hit.pickedMesh && hit.pickedMesh._wallId === wallId)) { clear = false; break; } // corner over a panel/door/hole
      if (du === 0 && dv === 0) centerHit = hit.pickedPoint;
    }
    if (clear && centerHit) { importPlaced[wallId].push(center); return centerHit.add(w.normal.scale(0.045)); }
  }
  return null;
}
// a wall photo as a self-lit print. KEY: loaded-image emissiveTexture does NOT render in the main pass
// here (only DynamicTextures do), so we draw the jpg INTO a DynamicTexture canvas — with a contrast/sat
// boost so it isn't washed out — and use that as emissive. disableLighting = the photo reads at full
// contrast in any room light (no flat gray wash, readable even in the dark).
function photoTexture(url, onReady) {
  const dt = new B.DynamicTexture("photoDT" + Math.round(Math.abs(Math.sin(url.length * 7.7)) * 1e6), { width: 8, height: 8 }, scene, true);
  dt.vScale = -1; dt.vOffset = 1; // match the note-card orientation (same as dyn flip:true)
  const img = new Image(); img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const W = 640, H = Math.max(8, Math.round(640 * img.height / img.width));
      dt.scaleTo(W, H); const ctx = dt.getContext();
      ctx.filter = "contrast(1.22) saturate(1.14) brightness(1.04)";
      ctx.drawImage(img, 0, 0, W, H); dt.update(false);
      if (onReady) onReady(dt, W / H);
    } catch (e) { /* tainted canvas / CORS — leave the fallback below */ if (onReady) onReady(null); }
  };
  img.onerror = () => { if (onReady) onReady(null); };
  img.src = url;
  return dt;
}
function renderImportedNote(n) {
  const w = IMPORT_WALLS[n.wall]; if (!w) return;
  const isPhoto = n.kind === "photo" && n._imageUrl;
  const text = n.kind === "link" ? (n.text || n.url || "link ↗") : (n.text || "");
  if (!isPhoto && !text) return;
  const sz = isPhoto ? 0.3 : 0.2;
  const pos = bareWallSpot(w, n.wall, n.x, n.y, sz); if (!pos) return; // no bare-wall spot → skip
  const mat = new B.StandardMaterial("inote", scene);
  if (isPhoto) {
    mat.disableLighting = true; mat.diffuseColor = new B.Color3(0, 0, 0); mat.emissiveColor = new B.Color3(1, 1, 1);
    // start with a flat-diffuse fallback (renders immediately); swap to the contrasty self-lit DynamicTexture once decoded
    mat.diffuseTexture = new B.Texture(n._imageUrl, scene); mat.disableLighting = false; mat.emissiveColor = new B.Color3(0.4, 0.4, 0.4);
    photoTexture(n._imageUrl, (dt) => { if (dt) { mat.emissiveTexture = dt; mat.diffuseTexture = dt; mat.disableLighting = true; mat.emissiveColor = new B.Color3(1, 1, 1); } });
  } else { const col = (n.color && n.color[0] === "#") ? n.color : "#f4ecc8"; mat.diffuseTexture = noteTexture(text, col); mat.emissiveColor = B.Color3.FromHexString(col).scale(0.15); }
  mat.specularColor = new B.Color3(0.04, 0.04, 0.04); mat.backFaceCulling = false;
  const card = B.MeshBuilder.CreatePlane("note", { size: sz, sideOrientation: B.Mesh.DOUBLESIDE }, scene);
  card.material = mat;
  card.position.set(pos.x, pos.y, pos.z);
  card.rotation = B.Vector3.RotationFromAxis(B.Vector3.Cross(w.vDir, w.normal), w.vDir, w.normal); card.computeWorldMatrix(true);
  if (n.rot) card.rotate(B.Axis.Z, n.rot, B.Space.LOCAL);
  card.receiveShadows = true;
}
async function importWallNotes() {
  const cfg = window.METRO_CONFIG;
  if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;
  try {
    const res = await fetch(`${cfg.SUPABASE_URL}/rest/v1/notes?select=wall,x,y,rot,text,color,kind,url,image_path&wall=in.(back,west,east)&order=created_at.asc&limit=2000`, { headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: "Bearer " + cfg.SUPABASE_ANON_KEY } });
    if (!res.ok) return;
    const rows = await res.json();
    const photoBase = cfg.SUPABASE_URL + "/storage/v1/object/public/photos/";
    rows.forEach(n => { if (n.kind === "photo" && n.image_path) { n._imageUrl = photoBase + n.image_path; slide.urls.push(n._imageUrl); } renderImportedNote(n); });
    if (slide.urls.length) { slide.acc = slide.period; } // kick the monitor slideshow on the next tick
    if (rows.length) flashHint(rows.length + " notes loaded from the wall");
  } catch (e) { console.warn("wall notes fetch failed", e); }
}
const composerEl = document.getElementById("composer"), noteTextEl = document.getElementById("note-text");
function noteTexture(text, color) {
  return dyn("note" + Math.round(Math.abs(Math.sin(text.length * 9.1)) * 1e6), 256, 256, (c, w, h) => {
    c.fillStyle = color; c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(0,0,0,.06)"; c.fillRect(0, h - 16, w, 16);
    c.fillStyle = "#23201a"; c.font = "600 22px ui-monospace, monospace"; c.textBaseline = "top";
    const words = (text || "").split(/\s+/), lines = []; let line = "";
    for (const wd of words) { const t = line ? line + " " + wd : wd; if (c.measureText(t).width > w - 32 && line) { lines.push(line); line = wd; } else line = t; }
    if (line) lines.push(line);
    lines.slice(0, 7).forEach((ln, i) => c.fillText(ln, 18, 22 + i * 30));
  }, { flip: true });
}
function renderNote(note) {
  const wall = NOTE_WALLS[note.wall]; if (!wall) return;
  // diffuse texture (samples reliably) + a tint of the note's own colour as emissive, so it
  // reads as a colour card even on a dark wall and the text shows clearly under light
  const mat = new B.StandardMaterial("noteMat", scene); mat.diffuseTexture = noteTexture(note.text, note.color);
  mat.specularColor = new B.Color3(0.04, 0.04, 0.04); mat.emissiveColor = B.Color3.FromHexString(note.color).scale(0.15); mat.backFaceCulling = false;
  const card = B.MeshBuilder.CreatePlane("note", { size: 0.19, sideOrientation: B.Mesh.DOUBLESIDE }, scene);
  card.material = mat;
  const p = wall.origin.add(wall.uDir.scale(note.u)).add(wall.vDir.scale(note.v)).add(wall.normal.scale(0.09)); // proud of the inner wall face (wall is 0.12 thick)
  card.position.set(p.x, p.y, p.z);
  card.rotation = B.Vector3.RotationFromAxis(B.Vector3.Cross(wall.vDir, wall.normal), wall.vDir, wall.normal); // right-handed: x = up × normal, z faces room
  card.computeWorldMatrix(true);
  if (note.tilt) card.rotate(B.Axis.Z, note.tilt, B.Space.LOCAL); // slight stuck-on tilt
  card.receiveShadows = true; note._mesh = card;
}
function deoverlap(wall, u, v) {
  let a = 0, r = 0;
  for (let i = 0; i < 80; i++) { const tu = u + Math.cos(a) * r, tv = v + Math.sin(a) * r; if (!notes.some(n => n.wall === wall && Math.hypot(n.u - tu, n.v - tv) < 0.21)) return { u: tu, v: tv }; a += 1.1; r += 0.028; }
  return { u, v };
}
function loadNotes() { try { notes = JSON.parse(localStorage.getItem(NOTES_KEY) || "[]"); } catch { notes = []; } notes.forEach(renderNote); }
function saveNotes() { try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes.map(n => ({ id: n.id, wall: n.wall, u: n.u, v: n.v, text: n.text, color: n.color, tilt: n.tilt, created_at: n.created_at })))); } catch { } }
function openComposer(wall, worldPoint) {
  pending = { wallId: Object.keys(NOTE_WALLS).find(k => NOTE_WALLS[k] === wall), u: B.Vector3.Dot(worldPoint.subtract(wall.origin), wall.uDir), v: B.Vector3.Dot(worldPoint.subtract(wall.origin), wall.vDir) };
  composerOpen = true; engine.exitPointerlock?.(); camera.detachControl();
  composerEl.classList.add("show"); noteTextEl.value = ""; setTimeout(() => noteTextEl.focus(), 30);
}
function closeComposer() { composerOpen = false; composerEl.classList.remove("show"); camera.attachControl(canvas, true); engine.enterPointerlock?.(); }
function postNote() {
  const text = noteTextEl.value.trim(); if (!text || !pending) { closeComposer(); pending = null; return; }
  const { u, v } = deoverlap(pending.wallId, pending.u, pending.v);
  const note = { id: "n" + Date.now(), wall: pending.wallId, u, v, text, color: noteColor, tilt: Math.sin(notes.length * 7.3) * 0.1, created_at: Date.now() };
  notes.push(note); renderNote(note); saveNotes(); closeComposer(); pending = null;
}
function setupNotes() {
  const m = (n) => scene.getMeshByName(n);
  if (m("wBack")) { m("wBack")._noteWall = NOTE_WALLS.back; m("wBack")._wallId = "back"; }
  if (m("wEast")) { m("wEast")._noteWall = NOTE_WALLS.east; m("wEast")._wallId = "east"; }
  ["wWest_a", "wWest_b", "wWest_top"].forEach(n => { if (m(n)) { m(n)._noteWall = NOTE_WALLS.west; m(n)._wallId = "west"; } });
  const cc = document.getElementById("note-colors");
  NOTE_COLORS.forEach((col, i) => { const b = document.createElement("button"); b.style.background = col; if (i === 0) b.classList.add("sel"); b.onclick = () => { noteColor = col; [...cc.children].forEach(x => x.classList.remove("sel")); b.classList.add("sel"); }; cc.appendChild(b); });
  document.getElementById("note-post").onclick = postNote;
  document.getElementById("note-cancel").onclick = () => { closeComposer(); pending = null; };
  loadNotes();
  importWallNotes(); // pull the real notes off your live wall (read-only)
}

// =====================================================================
// DESK ARRANGE MODE — drag props on the desk; persists to localStorage and
// exports a layout you paste back so it gets baked in permanently.
// =====================================================================
const LS_KEY = "metro.desk.layout";
// baked-in arrangement (your "copy layout"); localStorage overrides this per-visitor
const DEFAULT_LAYOUT = {
  "monitor": { x: 0, y: 0.749, z: -0.2, ry: -1.571, s: 0.543 },
  "external-monitor": { x: 0.74, y: 0.979, z: -0.18, ry: -0.35, s: 0.004 },
  "keyboard": { x: -0.02, y: 0.751, z: 0.25, ry: 0, s: 0.181 },
  "mouse": { x: 0.31, y: 0.74, z: 0.2, ry: 0, s: 1.104 },
  "midi": { x: -0.03, y: 0.63, z: 0.478, ry: 0, s: 0.004 },
  "mixer": { x: -0.02, y: 0.74, z: 0.01, ry: 0, s: 1 },
  "mug": { x: 0.45, y: 0.779, z: -0.02, ry: 0, s: 0.004 },
  "clock": { x: -0.75, y: 0.775, z: -0.15, ry: 0.35, s: 1 },
  "mac": { x: 0.73, y: 0.787, z: -0.18, ry: 0, s: 1 },
  "pedalboard": { x: 1.46, y: 0, z: -2.38, ry: 2.6, s: 1 },
  "guitar": { x: 1.61, y: 0.21, z: -2.65, ry: -0.6, s: 1 },
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
  // screen photo grade + how far the slideshow plane sits off the glass
  const fxC = document.getElementById("fx-contrast"), fxS = document.getElementById("fx-shadows"), fxD = document.getElementById("fx-depth");
  try { const sv = JSON.parse(localStorage.getItem(SCREEN_FX_KEY) || "{}"); if (sv.contrast != null) photoFx.contrast = sv.contrast; if (sv.shadows != null) photoFx.shadows = sv.shadows; if (sv.depth != null) screenDepth = sv.depth; } catch { }
  if (fxC) fxC.value = photoFx.contrast; if (fxS) fxS.value = photoFx.shadows; if (fxD) fxD.value = screenDepth;
  applyScreenDepth(); regrade();
  const saveFx = () => { try { localStorage.setItem(SCREEN_FX_KEY, JSON.stringify({ contrast: photoFx.contrast, shadows: photoFx.shadows, depth: screenDepth })); } catch { } };
  fxC?.addEventListener("input", () => { photoFx.contrast = +fxC.value; regrade(); saveFx(); });
  fxS?.addEventListener("input", () => { photoFx.shadows = +fxS.value; regrade(); saveFx(); });
  fxD?.addEventListener("input", () => { screenDepth = +fxD.value; applyScreenDepth(); saveFx(); });
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
  if (composerOpen) return;
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
scene.whenReadyAsync().then(async () => { setProg(82, "loading models…"); await loadHeroProps(); setupEditor(); setupNotes(); setupInstruments(); setProg(90, "physics…"); await initPhysics(); setProg(100, "enter ▸"); enterBtn.disabled = false; });

let entered = false;
function enter() {
  if (entered) return; entered = true;
  gate.classList.add("gone"); badge.classList.add("show"); document.getElementById("credits")?.classList.add("show"); editToggle.classList.add("show");
  hint.textContent = "WASD move · click: play the guitar / keys / drums · wall = note · panel by the door = light · G arrange · L lighting";
  hint.classList.add("show"); setTimeout(() => hint.classList.remove("show"), 7000);
  canvas.focus(); engine.enterPointerlock();
  try { ensureAudio(); } catch (e) { /* audio is best-effort */ } // build the audio context on this user gesture
}
enterBtn.addEventListener("click", enter);
// crosshair: visible only while looking around (pointer-locked), hidden in menus/arrange/composer
const crosshairEl = document.getElementById("crosshair");
document.addEventListener("pointerlockchange", () => crosshairEl?.classList.toggle("show", !!document.pointerLockElement));

// press L to cycle the lighting mood (golden hour → midday → studio → night/neon)
function flashHint(t) { hint.textContent = t; hint.classList.add("show"); clearTimeout(flashHint._t); flashHint._t = setTimeout(() => hint.classList.remove("show"), 2400); }
window.addEventListener("keydown", (e) => {
  if (composerOpen || e.code !== "KeyL") return;
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
  get notes() { return notes; }, openComposerAt: (wallId, u, v) => { const w = NOTE_WALLS[wallId]; openComposer(w, w.origin.add(w.uDir.scale(u)).add(w.vDir.scale(v))); },
  postTestNote: (wall, u, v, text, color) => { const n = { id: "t" + Date.now() + Math.round(u * 99), wall, u, v, text, color: color || "#f4ecc8", tilt: 0.05, created_at: Date.now() }; notes.push(n); renderNote(n); saveNotes(); return n; },
  get weather() { return weather; },
  get boombox() { return boombox; },
  get pedalboard() { return pbRef; },
  placeBoombox: (x, y, z, ry, t) => placeBoombox(x, y, z, ry, t),
  fitPedal: (t, x, y, z, ry) => { if (pbRef) fitOn(pbRef, t, x, y, z, ry, 0); },
  get apolloGLB() { return apolloGLB; },
  tuneApollo: (rx, ry, rz, t, x, z) => tuneApollo(rx, ry, rz, t, x, z),
  get deskProps() { return deskProps; },
  deskTune: (key, t, x, z, ry, rx = 0) => { const m = deskProps[key]; if (!m) return; m.scaling.setAll(t / m._naturalMax); m.rotation = new V3(rx, ry, 0); m.position.set(x, 0.74, z); m.computeWorldMatrix(true); const { min } = m.getHierarchyBoundingVectors(); m.position.y += 0.74 - min.y; },
  // light panel debug: read + drive the dimmer the way the pointer-drag does
  get lamp() { return { level: lampLevel, hue: lampHue, intensity: roomLamp.intensity }; },
  setLamp: (lvl, hue) => { if (lvl != null) lampLevel = Math.max(0, Math.min(1, lvl)); if (hue != null) lampHue = ((hue % 360) + 360) % 360; updateLamp(); },
  pickLightCtrl: () => { const lc = scene.pickWithRay(camera.getForwardRay(3.5), (m) => !!m._lightCtrl); return lc && lc.hit ? lc.pickedMesh._lightCtrl : null; },
  get slide() { return { count: slide.urls.length, i: slide.i }; }, nextSlide: () => nextSlide(),
  playKey: (m) => playKey(m), strumGuitar: () => strumGuitar(), drum: (k) => drum(k),
  audioPeak: () => new Promise((res) => { const ac = ensureAudio(); const an = ac.createAnalyser(); an.fftSize = 2048; master.connect(an); const data = new Float32Array(an.fftSize); let peak = 0; const t0 = ac.currentTime; const iv = setInterval(() => { an.getFloatTimeDomainData(data); for (const v of data) peak = Math.max(peak, Math.abs(v)); if (ac.currentTime - t0 > 0.6) { clearInterval(iv); try { master.disconnect(an); } catch {} res(+peak.toFixed(3)); } }, 20); }),
  pickInstr: () => { const r = scene.pickWithRay(camera.getForwardRay(7), (m) => !!m._instr); return r && r.hit ? r.pickedMesh._instr.type + (r.pickedMesh._instr.drum ? ":" + r.pickedMesh._instr.drum : "") : null; },
  // aim the crosshair at an instrument and actually play it (drives the same path a click does)
  aimPlay: () => { const r = scene.pickWithRay(camera.getForwardRay(7), (m) => !!m._instr); if (r && r.hit) { playInstrument(r); return r.pickedMesh._instr.type; } return null; },
  get keyGlow() { return keyGlow; }, guitarNote: (f) => guitarNote(f),
  get synth() { return { scale: scaleIdx, oct: octShift }; },
  keyAt: (u, vBack = 0) => pianoKey(u, vBack), guitarNotes: () => guitarScaleNotes(),
  setScale: (i) => { scaleIdx = ((i % SCALES.length) + SCALES.length) % SCALES.length; drawScaleScreen(); },
  setOct: (n) => { octShift = Math.max(-24, Math.min(24, n)); },
  pressBtn: (action) => { const r = scene.meshes.find(m => m._instr && m._instr.type === "btn" && m._instr.action === action); if (r) playInstrument({ pickedMesh: r, pickedPoint: r.absolutePosition }); return { scale: scaleIdx, oct: octShift }; },
};
