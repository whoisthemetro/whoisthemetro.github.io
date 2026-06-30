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

import { createRadio, LA_STATIONS } from "./radio.js";
import { getStarPosition, getPlanetPositions, getMoonPosition, getMoonIllumination, STARS } from "./astro.js";
import { startPlanes } from "./planes.js";
// the cat's needs/care brain — same data model + persistence as the live site.
// we DON'T call store.init(): mode stays "local", so it uses the metro.catstate
// localStorage path (+ BroadcastChannel) exactly like this room's notes do for now.
// (if the room later goes online for notes, the cat upgrades to the shared one for free.)
import { store } from "./store.js";

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
// "(pointer: coarse)" = the PRIMARY pointer is touch → a phone/tablet (weaker GPU). we render lighter
// there (no supersample, trimmed post FX, wider FOV) and it also gates the touch controls further down.
const IS_TOUCH = matchMedia("(pointer: coarse)").matches;
const engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: !IS_TOUCH, powerPreference: "high-performance" });
// desktop supersamples (dpr up to 2×); mobile renders ~1:1 so a phone GPU isn't pushing 4× the pixels.
engine.setHardwareScalingLevel(IS_TOUCH ? 1.2 : 1 / Math.min(window.devicePixelRatio || 1, 2));
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
scene.environmentIntensity = 0.5; // soft, even IBL fill so the room isn't carved into lit/dark walls

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
// THE PLANE HUNT — a jet on the LAX approach crosses the glass; the window is a shooting
// gallery. Real airplanes.live traffic drives the flyovers (planes.js); ambient fallback
// when the API's down. State lives here; drawSky paints the jet, the render loop ticks it.
const PLANE_DUR = 15;                 // seconds to cross the glass
let planeT = -1, plane01 = null, planeDir = 1, planeShot = null; // -1 = no jet; plane01 0..1; shot = {x,y,age}
let livePlanes = false, nextPlaneAt = 30 + Math.random() * 90, skyAcc = 0;
let lastSky = null;                   // cached drawSky args so the render loop can repaint with the jet moving
const TOWERS = [78, 64, 96, 58, 110, 72, 122, 66, 88, 96, 54];
// sunAz/sunAlt/moonAlt in radians, frac = moon illumination, clouds 0..1
function drawSky(sunAz, sunAlt, moonAlt, frac, clouds) {
  lastSky = [sunAz, sunAlt, moonAlt, frac, clouds]; // so the render loop can repaint as the jet flies
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
  // (sun + moon orbs removed from the backdrop — they read as odd floating dots through the window)
  // skyline removed — the city is now real 3D geometry outside the window (see loadCity). this
  // canvas is just the far sky now (gradient + sun + moon + stars + clouds), pushed way back.
  const night = aD < -4;
  // clouds
  if (clouds > 0.1) { const dk = aD > 0 ? 225 : 38; for (let i = 0; i < clouds * 16; i++) { c.fillStyle = `rgba(${dk},${dk},${dk + 6},${0.1 + clouds * 0.16})`; c.beginPath(); c.ellipse(((i * 137) % 760) - 20, 20 + ((i * 71) % 140), 90 + (i * 31) % 70, 22 + (i * 13) % 16, 0, 0, 7); c.fill(); } }
  // (moon removed too — see above)
  // (the LAX jet is being rebuilt as a real 3D plane outside — no longer painted on this backdrop)
  skyTex.update(false);
}

// jet path across the 720×280 sky canvas: arrivals sink left→right, departures climb right→left
function jetXY(t, dir) {
  return dir < 0 ? { x: 760 - t * 800, y: 120 - t * 74 } : { x: -40 + t * 800, y: 46 + t * 74 };
}
// an airliner in profile — nose along +x, ~28px long; mirrored for departures, tumbling when shot
function drawJet(g, px, py, dir, night, strobe, tumble = 0) {
  g.save();
  g.translate(px, py); g.scale(dir < 0 ? -1 : 1, 1); g.rotate((dir < 0 ? -0.1 : 0.1) + tumble);
  g.fillStyle = night ? "#c8ccd4" : "#e8ecf2";
  g.beginPath(); g.moveTo(13.5, 0); g.quadraticCurveTo(13, -1.8, 9, -1.8); g.lineTo(-9, -1.8); g.lineTo(-13, -0.6); g.lineTo(-13, 0.6); g.lineTo(-9, 1.8); g.lineTo(10, 1.8); g.quadraticCurveTo(13, 1.6, 13.5, 0); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(-8.5, -1.2); g.lineTo(-12.2, -7.2); g.lineTo(-14.3, -7.2); g.lineTo(-12.8, -1.2); g.closePath(); g.fill(); // tail fin
  g.beginPath(); g.moveTo(3.5, 0.8); g.lineTo(-4.5, 5.8); g.lineTo(-7.3, 5.8); g.lineTo(-0.5, 0.8); g.closePath(); g.fill(); // wing
  g.fillStyle = night ? "#9aa0ac" : "#c4cad4"; g.fillRect(0.4, 2.7, 5, 2.3); g.fillStyle = "#1c2028"; g.fillRect(4.6, 2.8, 0.9, 2.1); // engine
  g.fillStyle = night ? "rgba(255,228,160,0.85)" : "rgba(70,84,100,0.5)"; g.fillRect(-7.5, -0.95, 15.5, 0.85); // cabin
  g.fillStyle = "#ff3434"; g.fillRect(-13.9, -8.4, 1.6, 1.6); // beacon
  if (strobe) { g.fillStyle = "#fff"; g.fillRect(-2.4, 1.6, 2.2, 2.2); }
  if (night) { g.fillStyle = "rgba(255,240,200,0.75)"; g.fillRect(13.5, 0.6, 9, 1.3); } // landing lights
  g.restore();
}
function triggerPlane(dir) { if (planeT < 0) { planeDir = dir < 0 ? -1 : 1; planeT = 0; } }
function planeUp() { return planeT >= 0 && !planeShot; }
// THE 3D JET — a real plane.glb flies the LAX approach across the sky outside the window, driven by the same
// plane01 (0..1) timing. Arrivals sink left→right; departures climb right→left. Click it to shoot it down.
let plane3d = null, jetYaw = Math.PI / 2, jetParked = false; // jetYaw = the nose-along-travel heading you set in arrange mode
const JET = { x: 26, y: 6, dy: 1.5, z: -22 }; // cross ±26 on x, base alt 6, ±1.5 climb/descent, 22 out (further back than before, still readable)
function shootJet() { if (planeUp()) planeShot = { age: 0, t: plane01 }; } // freeze progress, then it falls
function updatePlane3D() {
  if (!plane3d || jetParked) return; // arrange mode is hand-posing it
  if (planeT < 0 || plane01 == null) { if (plane3d.isEnabled()) plane3d.setEnabled(false); return; }
  plane3d.setEnabled(true);
  const t = planeShot ? planeShot.t : plane01;
  let x = (2 * t - 1) * JET.x * planeDir;
  let y = JET.y + (planeDir > 0 ? (1 - t) : t) * JET.dy; // arrivals descend, departures climb
  let pitch = planeDir > 0 ? 0.06 : -0.06, roll = 0;
  if (planeShot) { const a = planeShot.age; x += planeDir * 6 * a; y -= 9 * a * a; pitch = -1.0 - a * 0.6; roll = a * 2.2; } // tumble + fall
  plane3d.position.set(x, y, JET.z);
  plane3d.rotation.set(pitch, planeDir > 0 ? jetYaw : jetYaw + Math.PI, roll); // jetYaw set in arrange mode; departures face the opposite way
}
// when the live feed is quiet or down, conjure a plausible LAX movement AND its flight strip
// (the real-feed path shows a strip; ambient used not to — so the window read as "no flights")
const AMBIENT_FLIGHTS = [["AAL", "B738"], ["UAL", "A320"], ["DAL", "A321"], ["SWA", "B737"], ["SKW", "E75L"], ["ASA", "B739"], ["JBU", "A320"], ["FFT", "A20N"], ["NKS", "A21N"], ["HAL", "A332"]];
function ambientFlyover() {
  const dir = Math.random() < 0.55 ? 1 : -1; // 1 = arrival (sinks L→R), -1 = departure (climbs R→L)
  const [code, type] = AMBIENT_FLIGHTS[Math.floor(Math.random() * AMBIENT_FLIGHTS.length)];
  triggerPlane(dir);
  showFlightStrip({
    flight: code + (100 + Math.floor(Math.random() * 899)),
    type,
    alt: dir > 0 ? 1800 + Math.floor(Math.random() * 28) * 100 : 3500 + Math.floor(Math.random() * 45) * 100,
    label: dir > 0 ? "ARRIVING LAX" : "DEPARTED LAX",
    dir,
  });
}
// (wx,wy) on the glass in WORLD space → sky-canvas pixels. The glass spans WIN.w×WIN.h
// centred at (0, WIN.cy); canvas x grows the way the player sees right, y grows downward.
function glassToCanvas(wx, wy) {
  return { cx: (wx + WIN.w / 2) / WIN.w * 720, cy: (WIN.cy + WIN.h / 2 - wy) / WIN.h * 280 };
}
function shootAtGlass(wx, wy) {
  if (planeT < 0 || plane01 == null || planeShot) return null;
  const { cx, cy } = glassToCanvas(wx, wy), p = jetXY(plane01, planeDir);
  if (Math.hypot(cx - p.x, cy - p.y) > 34) return "miss";   // generous aim window
  planeShot = { x: p.x, y: p.y, age: 0 };
  return "hit";
}
// the flight strip: who's up there, what they are, where they're going, how high
const flightStripEl = document.getElementById("flight-strip");
let flightStripTimer = null;
function showFlightStrip(info) {
  if (!flightStripEl || !info) return;
  const esc = (s) => String(s).replace(/[<>&]/g, "");
  flightStripEl.innerHTML =
    `<span class="fs-plane">✈</span> <span class="fs-flight">${esc(info.flight || "")}</span>` +
    (info.type ? ` <span class="fs-type">${esc(info.type)}</span>` : "") +
    ` <span class="fs-label">${esc(info.label || "")}</span>` +
    (info.alt ? ` <span class="fs-alt">${info.alt.toLocaleString()} ft</span>` : "");
  flightStripEl.classList.add("show");
  clearTimeout(flightStripTimer); flightStripTimer = setTimeout(() => flightStripEl.classList.remove("show"), 15000);
}
// real LAX traffic drives the flyovers; ambient planes fill in when the API is down
startPlanes(
  (info) => { triggerPlane(info && info.dir); showFlightStrip(info); nextPlaneAt = 180 + Math.random() * 300; }, // a real jet just crossed — push ambient out so they don't double up
  (isLive) => { livePlanes = !!isLive; }
);

const rainTex = dyn("rain", 256, 256, (c, w, h) => {
  for (let i = 0; i < 46; i++) { const x = Math.random() * w, y = Math.random() * h, len = 18 + Math.random() * 60; const g = c.createLinearGradient(x, y, x, y + len); g.addColorStop(0, "rgba(200,220,240,0)"); g.addColorStop(.8, `rgba(200,220,240,${0.25 + Math.random() * 0.3})`); g.addColorStop(1, "rgba(230,240,250,.6)"); c.fillStyle = g; c.fillRect(x, y, 1.4, len); c.fillStyle = "rgba(220,235,250,.5)"; c.fillRect(x - 0.6, y + len, 2.6, 2.6); }
});

// =====================================================================
// SHELL — floor, ceiling, four walls (window + closet openings framed)
// =====================================================================
const floor = B.MeshBuilder.CreateGround("floor", { width: W, height: D }, scene);
const floorMat = new B.StandardMaterial("floorMat", scene); floorMat.diffuseTexture = carpetTex; floorMat.specularColor = new B.Color3(0.02, 0.02, 0.02); floor.material = floorMat; floor.receiveShadows = true; floor.checkCollisions = false; // eye height is pinned; colliding with the floor only dragged movement

const ceil = B.MeshBuilder.CreateGround("ceil", { width: W, height: D }, scene);
ceil.material = matte("ceilMat", 0xd6cfc0); ceil.position.y = H; ceil.rotation.x = Math.PI; ceil.receiveShadows = true; // smooth

function wallMatFor(name, wm, hm) { const m = new B.StandardMaterial(name, scene); m.diffuseTexture = wallTex(name + "T", wm, hm); m.specularColor = new B.Color3(0.02, 0.02, 0.02); m.backFaceCulling = false; return m; }
function wallSeg(name, w, h, x, y, z, ry, m, collide = true) { const me = box(name, w, h, 0.12, x, y, z, m); me.rotation.y = ry; if (collide) { me.checkCollisions = true; } return me; }

const backMat = wallMatFor("back", W, H), eastMat = wallMatFor("east", D, H), westMat = wallMatFor("west", D, H), frontMat = wallMatFor("front", W, H);
// back (z=+3.3), east (x=+2.6) solid
wallSeg("wBack", W, H, 0, H / 2, ZB, 0, backMat);
// east wall — cut with a DOORWAY HOLE for the bedroom door + the cell behind it (z 2.12..3.12, up to y 2.06)
const EDZ0 = 2.12, EDZ1 = 3.12, EDTOP = 2.06;
wallSeg("wEast_a", EDZ0 - ZF, H, X, H / 2, (ZF + EDZ0) / 2, Math.PI / 2, eastMat);                 // south of the door
wallSeg("wEast_b", ZB - EDZ1, H, X, H / 2, (EDZ1 + ZB) / 2, Math.PI / 2, eastMat);                 // north of the door
wallSeg("wEast_top", EDZ1 - EDZ0, H - EDTOP, X, (EDTOP + H) / 2, (EDZ0 + EDZ1) / 2, Math.PI / 2, eastMat, false); // header above the door
// west (x=-2.6) with closet hole z∈[-1.15,0.35], y∈[0,2.03]
wallSeg("wWest_a", 3.3 - 1.15, H, X * -1, H / 2, (ZF + -1.15) / 2, Math.PI / 2, westMat); // z -3.3..-1.15
wallSeg("wWest_b", 3.3 - 0.35, H, X * -1, H / 2, (0.35 + ZB) / 2, Math.PI / 2, westMat);   // z 0.35..3.3
wallSeg("wWest_top", 1.5, H - 2.03, X * -1, (2.03 + H) / 2, -0.4, Math.PI / 2, westMat, false); // above closet
// front (z=-3.3) with window hole x∈[-1.8,1.8], y∈[0.9,2.3]
wallSeg("wFront_l", X - 1.8, H, -(1.8 + X) / 2, H / 2, ZF, 0, frontMat);
wallSeg("wFront_r", X - 1.8, H, (1.8 + X) / 2, H / 2, ZF, 0, frontMat);
wallSeg("wFront_b", 3.6, 0.9, 0, 0.45, ZF, 0, frontMat, false);
wallSeg("wFront_t", 3.6, H - 2.3, 0, (2.3 + H) / 2, ZF, 0, frontMat, false);

// BASEBOARD / TRIM — molding where the walls meet the floor (skips the closet + entry-door openings)
const trimMat = matte("trim", 0xe7e0cf); const TH = 0.09, TD = 0.022, TY = TH / 2 + 0.004, TI = 0.06 + TD / 2;
box("trimBack", X * 2 - 0.05, TH, TD, 0, TY, ZB - TI, trimMat, null, false);
box("trimFront", X * 2 - 0.05, TH, TD, 0, TY, ZF + TI, trimMat, null, false);
box("trimEastA", TD, TH, EDZ0 - ZF, X - TI, TY, (ZF + EDZ0) / 2, trimMat, null, false);   // east, runs right up to the door
box("trimEastB", TD, TH, ZB - EDZ1, X - TI, TY, (EDZ1 + ZB) / 2, trimMat, null, false);    // east, from the far side of the door to the corner
box("trimWestA", TD, TH, -1.15 - ZF, -X + TI, TY, (ZF - 1.15) / 2, trimMat, null, false);  // west up to the closet
box("trimWestB", TD, TH, ZB - 0.35, -X + TI, TY, (0.35 + ZB) / 2, trimMat, null, false);   // west past the closet

// THE CELL — a small grimy room behind the bedroom door; peer into it through the bars. lit by its OWN
// contained light (includedOnlyMeshes), so nothing spills into the bedroom.
const cellWallMat = matte("cellWall", 0x44403a), cellFloorMat = matte("cellFloorM", 0x3e3930);
const CX0 = X + 0.06, CX1 = X + 1.3, CZ0 = EDZ0 - 0.25, CZ1 = ZB, CCH = 2.25, ccx = (CX0 + CX1) / 2, ccz = (CZ0 + CZ1) / 2;
box("cellFloor", CX1 - X, 0.06, CZ1 - CZ0, (X + CX1) / 2, -0.03, ccz, cellFloorMat, null, false); // runs from the room-floor edge (no threshold gap), top flush at y=0
box("cellCeil", CX1 - CX0, 0.06, CZ1 - CZ0, ccx, CCH, ccz, cellWallMat, null, false);
box("cellBack", 0.1, CCH, CZ1 - CZ0, CX1, CCH / 2, ccz, cellWallMat, null, false);
box("cellSideA", CX1 - CX0, CCH, 0.1, ccx, CCH / 2, CZ0, cellWallMat, null, false);
box("cellSideB", CX1 - CX0, CCH, 0.1, ccx, CCH / 2, CZ1, cellWallMat, null, false);
box("cellCot", 0.55, 0.32, 1.1, CX1 - 0.4, 0.18, ccz, matte("cellCot", 0x39424f), null, false); // a metal cot
sph("cellBulb", 0.07, ccx, CCH - 0.16, ccz - 0.25, emis("cellBulbMat", 0xffe6ad, { glow: false }), null, false); // bare bulb
const cellLight = new B.PointLight("cellLight", new V3(ccx, CCH - 0.22, ccz - 0.25), scene);
cellLight.diffuse = C(0xd2d9e0); cellLight.intensity = 1.4; cellLight.range = 4.5;
cellLight.includedOnlyMeshes = ["cellFloor", "cellCeil", "cellBack", "cellSideA", "cellSideB", "cellCot"].map((n) => scene.getMeshByName(n)).filter(Boolean); // ONLY lights the cell

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
solid("colEastDoor", 0.12, EDTOP, EDZ1 - EDZ0, X, EDTOP / 2, (EDZ0 + EDZ1) / 2); // the bars are see-through but solid — peer in, don't walk in
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
// THE SKY — a real gradient sky DOME (follows the camera) that tracks the day/night cycle: blue by day,
// orange at the horizon toward the sun at dawn/dusk, dark with twinkling stars at night. The sun direction
// + altitude come from the same SunCalc data that drives the room light (set each cycle in updateEnv).
B.Effect.ShadersStore["skydomeVertexShader"] = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDir;
void main(){ vDir = position; gl_Position = worldViewProjection * vec4(position, 1.0); }`;
B.Effect.ShadersStore["skydomeFragmentShader"] = `
precision highp float;
varying vec3 vDir;
uniform vec3 sunDir; uniform float sunAlt; uniform vec3 moonDir; uniform float moonBright; uniform float cloudAmt; uniform float time;
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); float a = h2(i), b = h2(i+vec2(1,0)), c = h2(i+vec2(0,1)), d = h2(i+vec2(1,1)); vec2 u = f*f*(3.0-2.0*f); return mix(mix(a,b,u.x), mix(c,d,u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a*vn(p); p *= 2.02; a *= 0.5; } return s; }
void main(){
  vec3 dir = normalize(vDir);
  float h = clamp(dir.y, -1.0, 1.0);
  float dayF = smoothstep(-0.12, 0.12, sunAlt);                 // 0 night .. 1 day
  vec3 zen = mix(vec3(0.01,0.02,0.06), vec3(0.17,0.40,0.75), dayF);
  vec3 hor = mix(vec3(0.03,0.04,0.09), vec3(0.58,0.72,0.86), dayF);
  vec3 col = mix(hor, zen, smoothstep(0.0, 0.45, h));
  float sun = max(dot(dir, sunDir), 0.0);
  float low = exp(-abs(sunAlt) * 6.0);                          // peaks at sunrise/sunset
  col += vec3(1.0,0.45,0.15) * pow(sun, 2.0) * low * exp(-max(h,0.0) * 4.0) * 0.9; // warm horizon band toward the sun
  float vis = smoothstep(-0.06, 0.02, sunAlt);
  col += vec3(1.0,0.92,0.78) * pow(sun, 220.0) * vis;           // soft sun disc
  col += vec3(1.0,0.85,0.6) * pow(sun, 8.0) * 0.22 * vis;       // halo
  float md = max(dot(dir, moonDir), 0.0);                       // the moon, at the real lunar direction
  col += vec3(0.86,0.89,0.96) * smoothstep(0.9990, 0.9994, md) * moonBright;
  col += vec3(0.55,0.62,0.80) * pow(md, 40.0) * 0.12 * moonBright;
  float night = 1.0 - dayF;
  if (h > 0.02) { float s = h3(floor(dir * 220.0)); col += vec3(0.9,0.95,1.0) * step(0.992, s) * night * (0.6 + 0.4 * sin(time * 3.0 + s * 100.0)); } // stars
  gl_FragColor = vec4(col, 1.0);
}`;
const skyDomeMat = new B.ShaderMaterial("skyDome", scene, { vertex: "skydome", fragment: "skydome" },
  { attributes: ["position"], uniforms: ["worldViewProjection", "sunDir", "sunAlt", "moonDir", "moonBright", "cloudAmt", "time"] });
skyDomeMat.backFaceCulling = false; skyDomeMat.disableDepthWrite = true; skyDomeMat.disableLighting = true;
skyDomeMat.setVector3("sunDir", new B.Vector3(0, 0.4, -1).normalize()); skyDomeMat.setFloat("sunAlt", 0.4); skyDomeMat.setFloat("time", 0);
skyDomeMat.setVector3("moonDir", new B.Vector3(0.3, 0.5, -0.8).normalize()); skyDomeMat.setFloat("moonBright", 0.8); skyDomeMat.setFloat("cloudAmt", 0.4);
const skyDome = B.MeshBuilder.CreateSphere("skyDome", { diameter: 500, segments: 24 }, scene);
skyDome.material = skyDomeMat; skyDome.infiniteDistance = true; skyDome.isPickable = false; skyDome.applyFog = false;
// atmospheric fog — exponential, so the room (a few metres) stays crisp but the distant city fades into a
// moody haze. fogColor is matched to the sky horizon each cycle (updateEnv) so the city melts into the sky.
scene.fogMode = B.Scene.FOGMODE_EXP2; scene.fogDensity = 0.13; scene.fogColor = new B.Color3(0.07, 0.08, 0.12); // heavy in-room haze so the lamp + its shadows read; the exterior is applyFog=false so the city survives it
// (no outdoor ground — so the city can be dragged down below the sightline and read as skyscrapers seen from up high)
// the window pane (reflections) stays at the opening — and stays solid/clickable so notes/balls don't fall through
const glassFront = plane("glassPane", WIN.w, WIN.h, glassMat("glassPane", 0x9fc0e0, 0.12, 0.04)); glassFront.position.set(0, 1.6, ZF + 0.015); glassFront._glass = true; glassFront.isPickable = true;

const rainMat = emis("rainMat", 0xffffff, { glow: false, alpha: 0.0 }); rainMat.emissiveTexture = rainTex; rainMat.emissiveColor = new B.Color3(0.6, 0.7, 0.8); rainMat.alpha = 0; rainMat.useAlphaFromDiffuseTexture = false;
const rainPane = plane("rain", WIN.w, WIN.h, rainMat); rainPane.position.set(0, 1.6, ZF + 0.02); rainPane.isVisible = false;

// blinds — drawn closed across the window; the city peeks through the slat gaps (sells the window illusion)
const blindsMat = new B.StandardMaterial("blindsMat", scene); blindsMat.diffuseTexture = blindsTex; blindsMat.diffuseTexture.hasAlpha = true; blindsMat.useAlphaFromDiffuseTexture = true; blindsMat.backFaceCulling = false; blindsMat.specularColor = new B.Color3(0, 0, 0);
// ALPHA-TEST (not blend): the volumetric god-ray pass only respects alpha *testing*, so this is
// what lets the sun show through the slat gaps and chop into shafts (blend = solid black occluder).
blindsMat.transparencyMode = B.Material.MATERIAL_ALPHATEST; blindsMat.alphaCutOff = 0.45;
// SINGLE-SIDED (not the double-sided plane() helper): alpha-test writes depth, and a double-sided
// plane's two coplanar faces z-fight each other at grazing angles. one face + backFaceCulling=false
// (set on the material) keeps it visible from both sides without the fight.
const blinds = B.MeshBuilder.CreatePlane("blinds", { width: WIN.w - 0.06, height: WIN.h - 0.04 }, scene); blinds.material = blindsMat; blinds.receiveShadows = true; blinds.position.set(WIN.cx, 1.6, ZF + 0.045); blinds.scaling.x = 1;

// blackout curtains — tied to the sides
const curtMat = matte("curtain", 0x2b2620);
const curtPivots = [];
[-1, 1].forEach((side) => {
  const piv = node("curtPivot" + side, side * (WIN.w / 2 + 0.12), WIN.cy + 0.08, ZF + 0.10);
  box("curtain" + side, 1, WIN.h + 0.5, 0.05, -side * 0.5, 0, 0, curtMat, piv);
  for (let i = 1; i <= 4; i++) box("curtFold" + side + i, 0.022, WIN.h + 0.5, 0.064, -side * (i / 5), 0, 0.01, curtMat, piv, false);
  piv.scaling.x = 0.5; // open
  piv.getChildMeshes().forEach((m) => { m._curtain = true; m.isPickable = true; }); // click to draw/open
  curtPivots.push(piv);
});
// curtains gate the window light: open = full daylight; drawn = blackout, room falls dark (only interior glows remain)
let curtainOpen = true, curtX = 0.5, curtMul = 1, sunBase = 1, winBase = 2.2, hemiBase = 0.45;

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
// the main bedroom door is now a real model (prison_door.glb) — loaded + fitted to this opening in loadDoor()
const neonTex = dyn("neon", 512, 128, (c, w, h) => {
  c.fillStyle = "#000"; c.fillRect(0, 0, w, h);
  c.textAlign = "center"; c.textBaseline = "middle"; c.font = "700 78px Archivo, sans-serif";
  c.shadowColor = "#ff4d2e"; c.shadowBlur = 26; c.strokeStyle = "#ff6a4a"; c.lineWidth = 3; c.strokeText("METRO", w / 2, h / 2 + 4);
  c.shadowBlur = 8; c.fillStyle = "#fff1ec"; c.fillText("METRO", w / 2, h / 2 + 4);
}, { flip: true });
box("neonPlaque", 0.68, 0.19, 0.012, 0, 1.62, 0.062, matte("plaque", 0x141518), entry, false).setEnabled(false); // METRO sign hidden for now (in the way of placing the door)
const neonMat = emis("neonMat", 0xffffff, { add: true }); neonMat.emissiveTexture = neonTex; neonMat.emissiveColor = new B.Color3(2.2, 0.55, 0.35);
const neon = plane("neon", 0.62, 0.155, neonMat); neon.parent = entry; neon.position.set(0, 1.62, 0.075); neon.setEnabled(false);
// light panel on the east wall — a vertical dimmer + a horizontal hue slider you point at & drag (no menu).
// dim runs y 1.20→1.40 (off→full); hue handle slides in z 1.73→1.85 across the rainbow track.
box("lp_back", 0.02, 0.36, 0.17, 2.53, 1.30, 1.60, matte("lp_back", 0x15151b), null, false); // shifted left, clear of the door
box("lp_bezel", 0.024, 0.34, 0.15, 2.527, 1.30, 1.60, matte("lp_bezel", 0x222230), null, false);
box("lp_dimtrack", 0.014, 0.22, 0.022, 2.516, 1.31, 1.565, matte("lp_dimtrk", 0x07070a), null, false);
const dimHandle = box("lp_dimh", 0.032, 0.03, 0.07, 2.508, 1.20, 1.565, emis("lp_dimh", 0x666666, { glow: false }), null, false);
box("lp_huetrack", 0.014, 0.03, 0.14, 2.516, 1.155, 1.61, emis("lp_huetrk", 0x888888, { glow: false }), null, false);
const hueHandle = box("lp_hueh", 0.032, 0.05, 0.018, 2.508, 1.155, 1.61, emis("lp_hueh", 0xff8040, { glow: false }), null, false);
// invisible, forgiving pick pads in front of the handles so the crosshair doesn't need to be pixel-perfect
// big, forgiving grab volumes (a slab proud of the wall, wider/taller than the visible track)
const dimPad = box("lp_dimpad", 0.06, 0.28, 0.30, 2.47, 1.33, 1.60, matte("lp_pad", 0x000000), null, false); dimPad.visibility = 0; dimPad._lightCtrl = "dim";
const huePad = box("lp_huepad", 0.06, 0.12, 0.30, 2.47, 1.15, 1.60, matte("lp_pad2", 0x000000), null, false); huePad.visibility = 0; huePad._lightCtrl = "hue";
// CEILING FAN — replaces the flush fixture. it spins (click any blade to toggle), and its warm
// bulbs ARE the room light (driven by the dimmer in updateLamp). blades don't cast shadows (no strobing).
const FANZ = 0.4;
const fanMetalMat = matte("fanMetal", 0x55504a), fanWoodMat = matte("fanWood", 0x7a5736);
cyl("fanMount", 0.1, 0.16, 0.05, 0, H - 0.03, FANZ, fanMetalMat, null, 14, false); // ceiling canopy
cyl("fanRod", 0.02, 0.02, 0.2, 0, H - 0.155, FANZ, fanMetalMat, null, 10, false);   // downrod
const fanSpin = node("fanSpin", 0, H - 0.27, FANZ);                                  // the hub — everything below rotates
cyl("fanMotor", 0.18, 0.14, 0.1, 0, 0, 0, fanMetalMat, fanSpin, 18, false);
for (let i = 0; i < 5; i++) {
  const arm = node("fanArm" + i, 0, 0, 0, fanSpin); arm.rotation.y = (i / 5) * Math.PI * 2;
  box("fanIron" + i, 0.12, 0.016, 0.05, 0.14, 0.005, 0, fanMetalMat, arm, false);
  const bl = box("fanBlade" + i, 0.52, 0.012, 0.15, 0.46, -0.01, 0, fanWoodMat, arm, false); bl.rotation.z = 0.14; // pitched, for "airflow"
}
fanSpin.getChildMeshes().forEach((m) => { m._fan = true; m.isPickable = true; }); // click the fan to toggle the spin
let fanOn = true, fanAngle = 0;
cyl("fanKit", 0.06, 0.11, 0.07, 0, H - 0.34, FANZ, fanMetalMat, null, 14, false);    // the light kit under the motor
const fanBulbMat = emis("fanBulbMat", 0x1a1610, { glow: false });                    // emissive set each frame by updateLamp
const fanBulbs = node("fanBulbs", 0, H - 0.41, FANZ);
[[0.065, 0], [-0.065, 0], [0, 0.065], [0, -0.065]].forEach(([bx, bz], i) => sph("fanBulbG" + i, 0.052, bx, 0, bz, fanBulbMat, fanBulbs, false));
const roomLamp = new B.PointLight("roomLamp", new V3(0, H - 0.43, 0.4), scene); roomLamp.diffuse = C(0xffe2b8); roomLamp.intensity = 0; roomLamp.range = 9; // at the fan's bulbs
// the room light the panel controls (level 0..1, hue 0..360). manual — survives the day/night ticks.
let lampLevel = 0, lampHue = 38, lampSat = 0.35;
function lampColor() { return B.Color3.FromHSV(lampHue, lampSat, 1); }
function updateLamp() {
  const col = lampColor();
  // gentle: full-up is a soft room light, not a floodlight. ease-in curve so the low end isn't twitchy.
  // the point lamp is now a soft FILL; the downward spotlight is the KEY that actually casts the shadows.
  const lit = Math.pow(lampLevel, 1.5);
  roomLamp.diffuse = col; roomLamp.intensity = lit * 2.4; roomLamp.range = 9;
  lampSpot.diffuse = col; lampSpot.intensity = lit * 3.8; lampSpot.shadowEnabled = lampLevel > 0.02; // skip the shadow pass when it's off
  fanBulbMat.emissiveColor = lampLevel > 0.02 ? col.scale(1.3) : C(0x1a1610); // the fan's bulbs glow with the dimmer
  dimHandle.position.y = 1.20 + lampLevel * 0.20; dimHandle.material.emissiveColor = lampLevel > 0.02 ? col : C(0x3a3a3a);
  hueHandle.position.z = 1.55 + (lampHue / 360) * 0.12; hueHandle.material.emissiveColor = col;
}

// =====================================================================
// PROJECTOR SCREEN — a ceiling roller above the desk; click it to motor the screen down/up.
// (video comes later; for now it's a blank screen with the roll mechanics working.)
// =====================================================================
const PROJ = { x: 0.2, z: -2.45, w: 2.13, h: 1.2, top: H - 0.06 };
box("projHousing", PROJ.w + 0.14, 0.11, 0.16, PROJ.x, PROJ.top, PROJ.z, matte("projHousingM", 0x26262b), null, false); // the roller case on the ceiling
const projAnchor = node("projAnchor", PROJ.x, PROJ.top - 0.05, PROJ.z); // the screen hangs from here (its TOP stays put as it unrolls)
const projScreenMat = new B.StandardMaterial("projScreenMat", scene);
projScreenMat.diffuseColor = C(0xeceae4); projScreenMat.emissiveColor = C(0x1c1c1e); projScreenMat.specularColor = new B.Color3(0.02, 0.02, 0.02); projScreenMat.backFaceCulling = false; // matte screen; emissive bumped when a video plays later
const projScreen = plane("projScreen", PROJ.w, PROJ.h, projScreenMat); projScreen.parent = projAnchor; projScreen.position.set(0, -PROJ.h / 2, 0);
const projBar = box("projBar", PROJ.w + 0.05, 0.045, 0.05, 0, -PROJ.h, 0, matte("projBarM", 0x26262b), projAnchor, false); // weighted bottom bar
[scene.getMeshByName("projHousing"), projScreen, projBar].forEach((m) => { if (m) { m._projector = true; m.isPickable = true; } }); // click any of it to toggle
let projDown = false, projT = 0, prevCurtains = true; // projT 0 = rolled up, 1 = fully down
// toggling the screen also works the curtains: down → close them (remembering their state); up → restore it
function setProjector(down) {
  if (down === projDown) return;
  projDown = down;
  if (down) { prevCurtains = curtainOpen; if (curtainOpen) { curtainOpen = false; sunRays(); } }
  else if (curtainOpen !== prevCurtains) { curtainOpen = prevCurtains; sunRays(); }
  flashHint(down ? "📽 screen down" : "screen up");
}
function updateProjector(dt) {
  const target = projDown ? 1 : 0;
  if (projT === target) { projScreen.setEnabled(projT > 0.01); projBar.setEnabled(projT > 0.01); return; }
  projT = Math.max(0, Math.min(1, projT + Math.sign(target - projT) * dt * 1.1)); // ~0.9s travel
  projScreen.scaling.y = Math.max(0.001, projT); projScreen.position.y = -(PROJ.h * projT) / 2; // top stays at the anchor; it unrolls downward
  projBar.position.y = -PROJ.h * projT;
  projScreen.setEnabled(projT > 0.01); projBar.setEnabled(projT > 0.01);
}
updateProjector(0); // start rolled up (hidden)

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
slideTex.uScale = 1; slideTex.uOffset = 0; slideTex.vScale = -1; slideTex.vOffset = 1; // painted onto the monitor asset's screen mesh (0–1 UVs); flip V for GL
const slideMat = emis("slideMat", 0xffffff, { glow: false }); slideMat.emissiveTexture = slideTex; slideMat.emissiveColor = new B.Color3(0.42, 0.42, 0.42); // dimmer — was 0.62, the screen was washing out the desk
const monScreen = plane("monScreen", 0.92, 0.39, slideMat); monScreen.parent = desk; monScreen.position.set(0, 1.04, -0.194); monScreen.rotation.y = Math.PI;
const screenOffMat = emis("screenOff", 0x05070c, { glow: false }); screenOffMat.emissiveColor = new B.Color3(0.02, 0.025, 0.045); // the monitor's dark backdrop behind the YouTube overlay
let monitorScreenMesh = null; // the asset's screen mesh — the YouTube iframe is matrix3d-glued onto it each frame
// transport strip — one grabbable group (move/rotate/scale it in arrange mode); buttons are crosshair-clicked in play
const ytCtl = node("ytCtl", 0.74, 0.98, -0.12, desk); ytCtl.rotation.x = -0.28;
// clear, bold icons drawn as shapes (text glyphs were too faint): prev/next = triangle + bar, play = triangle, pause = two bars
function drawIcon(c, w, h, type) {
  c.fillStyle = "#000000"; c.fillRect(0, 0, w, h);                         // black button face
  c.strokeStyle = "#ffffff"; c.lineWidth = 3; c.strokeRect(2, 2, w - 4, h - 4); // white outline so the square reads
  c.fillStyle = "#ffffff";                                                 // white icon
  if (type === "prev") { c.fillRect(13, 16, 7, 32); c.beginPath(); c.moveTo(52, 12); c.lineTo(24, 32); c.lineTo(52, 52); c.closePath(); c.fill(); }
  else if (type === "next") { c.beginPath(); c.moveTo(12, 12); c.lineTo(40, 32); c.lineTo(12, 52); c.closePath(); c.fill(); c.fillRect(44, 16, 7, 32); }
  else if (type === "play") { c.beginPath(); c.moveTo(20, 12); c.lineTo(54, 32); c.lineTo(20, 52); c.closePath(); c.fill(); }
  else { c.fillRect(19, 14, 10, 36); c.fillRect(35, 14, 10, 36); }         // pause
}
let ytToggleTex = null;
function ytBtn(type, x, action) {
  const tex = dyn("ytbt_" + action, 64, 64, (c, w, h) => drawIcon(c, w, h, type));
  if (action === "toggle") ytToggleTex = tex;
  const mat = new B.StandardMaterial("ytbm_" + action, scene); // lit (not emissive) so the white doesn't bloom/wash out
  mat.diffuseTexture = tex; mat.specularColor = new B.Color3(0, 0, 0); mat.emissiveColor = new B.Color3(0, 0, 0); // pure black face, white icon — lit by the room, no glow
  const b = plane("ytbtn_" + action, 0.07, 0.07, mat, ytCtl); b.position.set(x, 0, 0); b._ytctl = action; b.isPickable = true;
  return b;
}
ytBtn("prev", -0.08, "prev"); ytBtn("pause", 0, "toggle"); ytBtn("next", 0.08, "next");
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

// --- radio power LED + tune knob + a soft glow, all on the rack top by the boombox ---
// the LED reads the live tuner state: dark when off, amber while it locks, green when on-air.
const radioLedMat = emis("radioLedMat", 0x111111, { glow: true }); radioLedMat.emissiveColor = new B.Color3(0, 0, 0);
const radioLed = cyl("radioLed", 0.009, 0.009, 0.004, 0.205, 0.705, 0.235, radioLedMat, rack, 14, false); radioLed.rotation.x = Math.PI / 2;
const radioTuneMat = metal("radioTuneM", 0x2a2622, 0.5, 0.4);
const radioTune = cyl("radioTune", 0.018, 0.02, 0.016, 0.205, 0.705, 0.17, radioTuneMat, rack, 18, false); radioTune.rotation.x = Math.PI / 2;
radioTune._radioScan = true; // click it to scan the dial
const radioGlow = new B.PointLight("radioGlow", new V3(0.205, 0.72, 0.22), scene); radioGlow.parent = rack;
radioGlow.diffuse = new B.Color3(0.35, 1, 0.5); radioGlow.range = 0.9; radioGlow.intensity = 0; // off until power-on
let radioState = "off";
// the boombox model carries its own baked emissive (the blue display glow); we gate it to power so a
// powered-off radio goes dark. filled in once the GLB loads (see loadHeroProps).
const boomboxEmis = [];
function setBoomboxGlow(on) { for (const e of boomboxEmis) e.mat.emissiveColor = on ? e.onCol : new B.Color3(0, 0, 0); }
// the LA tuner — streams a real station over a bare <audio> element (see radio.js). its status
// callback is the single source of truth for the LED + glow, so the light is always honest.
const laRadio = createRadio({
  stations: LA_STATIONS, storeKey: "metro.radio.la",
  onStatus: (info) => { radioState = info.on ? info.state : "off"; paintRadioLed(); },
});
function paintRadioLed() {
  const C3 = B.Color3;
  setBoomboxGlow(radioState !== "off"); // the model's blue display follows power
  if (radioState === "off") { radioLedMat.emissiveColor = new C3(0, 0, 0); radioGlow.intensity = 0; }
  else if (radioState === "live") { radioLedMat.emissiveColor = new C3(0.2, 1, 0.4); radioGlow.diffuse = new C3(0.35, 1, 0.5); radioGlow.intensity = 0.6; }
  else if (radioState === "error") { radioLedMat.emissiveColor = new C3(1, 0.18, 0.12); radioGlow.diffuse = new C3(1, 0.25, 0.2); radioGlow.intensity = 0.4; }
  else { radioLedMat.emissiveColor = new C3(1, 0.62, 0.12); radioGlow.diffuse = new C3(1, 0.65, 0.2); radioGlow.intensity = 0.45; } // tuning
}
const radioLabel = (i = laRadio.info()) => `📻 ${i.station.hz} ${i.station.name} · ${i.station.tag}`;
// a quick FM-hiss burst as the dial scans (radio.js's own radioStatic feeds the three.js audio graph,
// which this page doesn't build — so we run our own off the bedroom's WebAudio master)
function radioScanStatic() {
  if (!AC) return;
  const t = AC.currentTime, src = noiseBuf(0.3), hp = AC.createBiquadFilter();
  hp.type = "highpass"; hp.frequency.value = 1600;
  const g = AC.createGain(); src.connect(hp); hp.connect(g); g.connect(master);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.04, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  src.start(t); src.stop(t + 0.24);
}

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
let pbRef = null, apolloGLB = null, pedalDS = null, pedalMT = null, pedalFZ = null;
// load a single stompbox onto its own floor pivot (each pedal is independently movable/resizable in arrange)
async function loadPedal(file, x, z, ry, target) {
  try {
    const p = await importGLB(file);
    const piv = node("pedPiv_" + file.replace(/\W/g, "").slice(0, 8), x, 0, z); piv.rotation.y = ry;
    p.parent = piv;
    p.scaling.setAll(target / p._naturalMax);
    p.rotation = new V3(0, 0, 0); p.position.set(0, 0, 0);
    p.computeWorldMatrix(true);
    const { min } = p.getHierarchyBoundingVectors();
    p.position.y -= min.y; // rest it flat on the floor (pivot y0)
    return piv;
  } catch (e) { console.warn("pedal " + file + " failed", e); return null; }
}
// the Gibson Les Paul replaces the procedural Telecaster — parented to the `tele` node so it keeps the
// editable slot AND the click-along-the-neck → pitch mapping (head=low … bridge=high in tele-local Y)
async function loadGuitar() {
  try {
    const g = await importGLB("guitar_gibson_les_paul_standard.glb");
    tele.getChildMeshes().forEach((m) => m.setEnabled(false)); // hide the procedural Tele (keep the node)
    g.parent = tele;
    g.scaling.setAll(0.98 / g._naturalMax);   // ~1 m guitar (its long axis is Z)
    g.rotation = new V3(Math.PI / 2, 0, 0);   // stand it upright, body DOWN / headstock UP (long axis Z → vertical)
    g.position.set(0, 0, 0);
    g.computeWorldMatrix(true);
    const { min } = g.getHierarchyBoundingVectors();
    g.position.y -= min.y; // rest the lowest point on the floor (min.y is world; tele's small tilt is negligible)
    g.getChildMeshes().forEach((m) => { m._guitar = true; m.isPickable = true; });
  } catch (e) { console.warn("guitar GLB load failed — keeping procedural", e); }
}
async function importGLB(file) {
  const res = await B.SceneLoader.ImportMeshAsync("", "/assets/models/", file, scene);
  const root = res.meshes[0];
  const { min, max } = root.getHierarchyBoundingVectors();
  root._naturalMax = Math.max(max.x - min.x, max.y - min.y, max.z - min.z) / root.scaling.x;
  for (const m of res.meshes) if (m.getTotalVertices && m.getTotalVertices() > 0) { m.receiveShadows = true; try { shadow.addShadowCaster(m); lampShadow.addShadowCaster(m); } catch {} } // cast from both the sun AND the ceiling light
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
    boombox.getChildMeshes().forEach(m => {
      m._radioToggle = true; // click the boombox to power on/off
      const mat = m.material, ec = mat && mat.emissiveColor;
      const glows = mat && (mat.emissiveTexture || (ec && (ec.r > 0.001 || ec.g > 0.001 || ec.b > 0.001)));
      if (glows && !boomboxEmis.some(e => e.mat === mat)) {
        let onCol = ec ? ec.clone() : new B.Color3(1, 1, 1);
        if (mat.emissiveTexture && onCol.r < 0.01 && onCol.g < 0.01 && onCol.b < 0.01) onCol = new B.Color3(1, 1, 1); // texture carries it
        boomboxEmis.push({ mat, onCol });
      }
    });
    setBoomboxGlow(false); // radio boots off → display dark
  } catch (e) {
    console.warn("boombox load failed — keeping procedural radio", e);
    radio.getChildMeshes().forEach(m => { m._radioToggle = true; }); // fall back to the box radio as the toggle
  }
  // three real stompboxes (DS-2, Metal Zone, fuzz) replace the procedural pedalboard — each on its own
  // pivot so you can move/resize them individually in arrange mode
  pedalboard.setEnabled(false);
  pedalDS = await loadPedal("boss_turbo_distortion_ds-2.glb", 1.28, ZF + 1.08, 0.3, 0.13);
  pedalMT = await loadPedal("boss_metal_zone_mt2_-_guitar_pedal.glb", 1.5, ZF + 1.0, 0.3, 0.13);
  pedalFZ = await loadPedal("guitar_fuzz_pedal.glb", 1.72, ZF + 1.06, 0.3, 0.15);
  await loadGuitar();
  // the radio (boombox) now sits where the Apollo was — drop the rackmount EQ, hide the procedural Apollo
  scene.getMeshByName("apollo")?.setEnabled(false);
  scene.getMeshByName("apKnob")?.setEnabled(false);
  await loadDeskProps();
  await loadDumbek();
  await loadMPC();
  // await loadCat(); // (the bicolor_cat.glb is kept in /assets/models for later, but the
  // procedural ginger tabby is the room's cat — cuter, and it actually trots/wags. To bring
  // the model back, un-comment this; loadCat() hides the procedural one and rides the same rig.)
  initCatNeeds();
  await loadVacuum();
  await loadDoor();
  await loadCity();
  await loadPlane();
  await loadGodzilla();
}

// THE CITY — low-poly buildings outside the window (real 3D, original materials, replaces the painted skyline)
let cityGLB = null, cityLight = null, cityShadow = null;
async function loadCity() {
  try {
    const res = await B.SceneLoader.ImportMeshAsync("", "/assets/models/", "city.glb", scene);
    const city = res.meshes[0];
    const bb0 = city.getHierarchyBoundingVectors();
    const nat = Math.max(bb0.max.x - bb0.min.x, bb0.max.y - bb0.min.y, bb0.max.z - bb0.min.z) / (city.scaling.x || 1);
    city.scaling.setAll(46 / nat);          // span ~46 units across the window view
    city.rotation = new V3(0, 0, 0);         // (flip to rotation.x = -PI/2 if the buildings import lying down)
    city.position.set(0, 0, ZF - 22);        // out beyond the window
    city.computeWorldMatrix(true);
    const { min } = city.getHierarchyBoundingVectors();
    city.position.y -= min.y;                // rest the city on the street (y 0)
    city.position.y -= 8;                    // …then drop it well below the sightline so you look DOWN over the skyline (the intended look; nudge with −/= in arrange, it saves)
    const cityMeshes = res.meshes.filter((m) => m.getTotalVertices && m.getTotalVertices() > 0);
    res.meshes.forEach((m) => { m.isPickable = false; m.applyFog = false; }); // keep the model's materials; immune to the room's heavy fog so the city stays visible through the glass
    // sun/moon light on the city — scoped to ONLY the city meshes so it never leaks into the room (directional
    // lights aren't contained by walls), with a shadow map so the buildings cast soft shadows on each other.
    cityLight = new B.DirectionalLight("cityLight", new V3(0.2, -0.8, 0.3).normalize(), scene);
    cityLight.intensity = 0; cityLight.includedOnlyMeshes = cityMeshes; cityLight.position = new V3(0, 70, ZF - 22);
    cityShadow = new B.ShadowGenerator(1024, cityLight);
    cityShadow.usePercentageCloserFiltering = true; cityShadow.filteringQuality = B.ShadowGenerator.QUALITY_MEDIUM; cityShadow.bias = 0.0015; cityShadow.normalBias = 0.02;
    cityMeshes.forEach((m) => { m.receiveShadows = true; cityShadow.addShadowCaster(m); });
    cityGLB = city;
  } catch (e) { console.warn("city load failed", e); }
}

// load the LAX jet (hidden until a flyover triggers); meshes tagged _jet so clicking the window can shoot it down
async function loadPlane() {
  try {
    const res = await B.SceneLoader.ImportMeshAsync("", "/assets/models/", "plane.glb", scene);
    const root = res.meshes[0], jetMeshes = root.getChildMeshes();
    let bb = root.getHierarchyBoundingVectors();
    const nat = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) / (root.scaling.x || 1);
    root.scaling.setAll(9 / nat); // ~9-unit airliner
    root.computeWorldMatrix(true);
    bb = root.getHierarchyBoundingVectors();
    // this GLB has a big baked FBX offset, so wrap it in a pivot and shift the geometry onto the pivot's origin —
    // then moving/rotating the pivot drives the jet predictably.
    const ctr = bb.min.add(bb.max).scale(0.5);
    const pivot = new B.TransformNode("jetPivot", scene);
    root.position.copyFrom(ctr.scale(-1)); root.parent = pivot;
    pivot.setEnabled(false);
    res.meshes.forEach((m) => { m.isPickable = false; m.applyFog = false; });
    jetMeshes.forEach((m) => { m._jet = true; m.isPickable = true; });
    if (cityLight && cityLight.includedOnlyMeshes) cityLight.includedOnlyMeshes = cityLight.includedOnlyMeshes.concat(jetMeshes); // lit by the sun/moon like the city
    plane3d = pivot; // updatePlane3D drives the pivot
  } catch (e) { console.warn("plane load failed", e); }
}

// GODZILLA — towers among the city buildings outside the window. Same FBX-offset fix as the plane (pivot with
// the geometry centered horizontally and feet on the ground). Lit by the sun/moon; arrange-able; slow idle sway.
let godzilla = null, godzillaInner = null, gzMeshes = [], gzT = -1, nextGzAt = 25 + Math.random() * 35; // gzT: -1 idle; else seconds into the appearance
async function loadGodzilla() {
  try {
    const res = await B.SceneLoader.ImportMeshAsync("", "/assets/models/", "godzilla.glb", scene);
    const root = res.meshes[0], gz = root.getChildMeshes();
    let bb = root.getHierarchyBoundingVectors();
    const nat = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) / (root.scaling.x || 1);
    root.scaling.setAll(20 / nat); // ~20 units tall — towers over the skyline
    root.computeWorldMatrix(true);
    bb = root.getHierarchyBoundingVectors();
    const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
    root.position.set(root.position.x - cx, root.position.y - bb.min.y, root.position.z - cz); // center horiz, feet at y0
    const pivot = new B.TransformNode("gzPivot", scene);
    root.parent = pivot;
    pivot.position.set(-4, 0, -18); pivot.rotation.y = Math.PI; // looming in front of the skyline, facing the window (tune in arrange)
    res.meshes.forEach((m) => { m.isPickable = false; m.applyFog = false; }); // immune to the room's heavy fog (he's outside the glass)
    gz.forEach((m) => { m.isPickable = true; });
    if (cityLight && cityLight.includedOnlyMeshes) cityLight.includedOnlyMeshes = cityLight.includedOnlyMeshes.concat(gz); // lit like the city
    sun.excludedMeshes = cityLight.includedOnlyMeshes.slice(); // exterior is lit by cityLight only — keep the room's directional sun off it (no double-lighting)
    godzilla = pivot; godzillaInner = root; gzMeshes = gz;
    pivot.setEnabled(false); // hidden until the timer brings it in
  } catch (e) { console.warn("godzilla load failed", e); }
}
// Godzilla is a timed cameo: every so often it fades in, looms/sways for ~6s, then fades out.
function updateGodzilla(dt) {
  if (!godzilla) return;
  if (editMode) { if (!godzilla.isEnabled()) godzilla.setEnabled(true); gzMeshes.forEach((m) => { m.visibility = 1; }); return; } // arrange: keep visible to edit
  if (gzT < 0) { nextGzAt -= dt; if (nextGzAt <= 0) { gzT = 0; nextGzAt = 70 + Math.random() * 90; } else { if (godzilla.isEnabled()) godzilla.setEnabled(false); return; } }
  gzT += dt;
  const FADE = 4.5, HOLD = 6, TOTAL = FADE + HOLD + FADE; // slow 4.5s fade in/out around a 6s hold
  let a = 1;
  if (gzT < FADE) a = gzT / FADE;                       // fade in
  else if (gzT < FADE + HOLD) a = 1;                    // do its thing for 6s
  else if (gzT < TOTAL) a = 1 - (gzT - FADE - HOLD) / FADE; // fade out
  else { gzT = -1; a = 0; }
  const on = a > 0.002;
  if (godzilla.isEnabled() !== on) godzilla.setEnabled(on);
  if (on) { gzMeshes.forEach((m) => { m.visibility = a; }); godzillaInner.rotation.y = Math.sin(T * 0.5) * 0.06; } // fade + slow sway
}

// THE CAT, for real — a rigged PS1 low-poly cat (Sketchfab) rides the existing wander rig.
// The procedural ginger tabby is hidden; the GLB is parented under catRig so updateCat's
// glide/turn/dwell + the pet-for-hearts action all still drive it (it just doesn't trot/wag,
// since this model ships no animation clips — it stands in bind pose).
async function loadCat() {
  try {
    const cat = await importGLB("bicolor_cat.glb");
    cat.parent = catRig;
    cat.scaling.setAll(0.5 / cat._naturalMax);   // a house cat
    cat.rotation = new V3(0, Math.PI / 2, 0);    // nose along catRig +x (the movement-forward axis)
    cat.position.set(0, 0, 0);
    cat.computeWorldMatrix(true);
    const { min } = cat.getHierarchyBoundingVectors();
    cat.position.y -= min.y;                      // rest paws on the floor (catRig local y0)
    cat.getChildMeshes().forEach((m) => { m._cat = true; m.isPickable = true; }); // so the pet-for-hearts ray still finds it
    catModel = cat; catBaseY = cat.position.y;    // updateCat adds a walk bob/waddle on top of this rest height
    // this model ships ONE skinned clip ("Animation") — use it as the IDLE; the WALK is authored from the leg bones
    catAnimIdle = scene.animationGroups.find((g) => g.name === "Animation");
    if (catAnimIdle) { catAnimIdle.stop(); catAnimIdle.start(true, 0.5); } // loop at half speed = a calm idle
    const skel = scene.skeletons.find((s) => s.bones.some((b) => b.name === "Wolf_l_FrontLeg_HipSHJnt_4"));
    if (skel) { const by = (n) => skel.bones.find((b) => b.name === n); catWalkBones = { fl: by("Wolf_l_FrontLeg_HipSHJnt_4"), fr: by("Wolf_r_FrontLeg_HipSHJnt_10"), hl: by("Wolf_l_HindLeg_HipSHJnt_27"), hr: by("Wolf_r_HindLeg_HipSHJnt_33") }; }
    // hide the procedural cat — same rig still drives position/rotation
    catBody.setEnabled(false);
    catHead.setEnabled(false);
    scene.getMeshByName("catChest")?.setEnabled(false);
    catLegs.forEach((l) => l.setEnabled(false));
    tailSegs[0].setEnabled(false);               // disabling the root tail node hides the chained segments
  } catch (e) { console.warn("cat GLB load failed — keeping procedural cat", e); }
}

// THE DUMBEK — a real hand drum (Poly Pizza "Bongos", Poly by Google, CC-BY) you can
// walk up to and strike. It lives inside a pivot node (scale 1) so the hit-bounce can
// squash it toward the floor without fighting the GLB's own fit scale.
let bongos = null, bongoPivot = null, bongoSquash = null;
const BONGO = { x: -1.95, y: 0, z: -1.5, ry: 0.55, target: 0.75 }; // conga stands ~0.75 m tall
async function loadDumbek() {
  try {
    bongos = await importGLB("conga.glb");
    // bongoPivot is the EDITABLE node (drag/rotate/resize in arrange mode); bongoSquash sits
    // under it and is the ONLY thing the hit-bounce touches (its .scaling.y, baseline 1), so
    // the bounce never fights a player-applied resize on the pivot.
    bongoPivot = node("bongoPivot", BONGO.x, BONGO.y, BONGO.z); bongoPivot.rotation.y = BONGO.ry;
    bongoSquash = node("bongoSquash", 0, 0, 0, bongoPivot);
    bongos.parent = bongoSquash;
    bongos.scaling.setAll(BONGO.target / bongos._naturalMax);
    bongos.rotation = new V3(0, 0, 0); bongos.position.set(0, 0, 0); // this conga.glb is already Y-up — leave it upright (the old -90°X tipped it onto its side)
    bongos.computeWorldMatrix(true);
    const { min } = bongos.getHierarchyBoundingVectors();
    bongos.position.y -= min.y - BONGO.y; // rest the drum's bottom on the floor (squash compresses toward it)
  } catch (e) { console.warn("bongos (dumbek) load failed", e); }
}

// MPC TOUCH — a 16-pad drum machine (Sketchfab) you can place anywhere; the 4×4 pads are real meshes
// (identified geometrically — generic names), each wired to an MPC-style synth voice and lit on strike.
let mpc = null, mpcPivot = null; const mpcPads = []; const mpcFx = [];
const MPC = { x: -1.08, z: -0.2, ry: 0.5, target: 0.55 }; // on the floor near the desk-left; move/tilt it in arrange
// the 16 pad meshes, row-major back→front, left→right within each row (1.2-unit-scaled grid: cx[-0.50,-0.16], cz[-0.13,0.21])
const MPC_PADS = [
  "polySurface273_aiStandardSurface1_0", "polySurface274_aiStandardSurface1_0", "polySurface275_aiStandardSurface1_0", "polySurface276_aiStandardSurface1_0",
  "polySurface272_aiStandardSurface1_0", "polySurface271_aiStandardSurface1_0", "polySurface270_aiStandardSurface1_0", "polySurface269_aiStandardSurface1_0",
  "polySurface265_aiStandardSurface1_0", "polySurface266_aiStandardSurface1_0", "polySurface267_aiStandardSurface1_0", "polySurface268_aiStandardSurface1_0",
  "polySurface264_aiStandardSurface1_0", "polySurface263_aiStandardSurface1_0", "polySurface262_aiStandardSurface1_0", "polySurface261_aiStandardSurface1_0",
];
const MPC_SOUNDS = [ // classic kit; the front row (last 4) holds the essentials kick/snare/hat/clap
  "crash", "cowbell", "clave", "perc",
  "tomL", "tomM", "tomH", "shaker",
  "sub", "rim", "snare2", "hatO",
  "kick", "snare", "hatC", "clap",
];
async function loadMPC() {
  try {
    mpc = await importGLB("mpc_touch.glb");
    mpcPivot = node("mpcPivot", MPC.x, 0, MPC.z); mpcPivot.rotation.y = MPC.ry; // editable wrapper (drag/rotate/scale as one)
    mpc.parent = mpcPivot;
    mpc.scaling.setAll(MPC.target / mpc._naturalMax);
    mpc.rotation = new V3(0, 0, 0); mpc.position.set(0, 0, 0);
    mpc.computeWorldMatrix(true);
    const { min } = mpc.getHierarchyBoundingVectors();
    mpc.position.y -= min.y; // rest it flat on the floor
    MPC_PADS.forEach((name, i) => {
      const m = scene.getMeshByName(name); if (!m) return;
      if (m.material) m.material = m.material.clone(name + "_m"); // independent material so each pad lights solo
      const col = C([0xffae3b, 0x3bd6ff, 0xff5bb0, 0x6bff7a][Math.floor(i / 4)]); // a colour per row
      m._mpcIdle = col.scale(0.05); m._mpcGlow = col;                 // faint backlight → bright flash on hit
      if (m.material) m.material.emissiveColor = m._mpcIdle.clone();
      m._instr = { type: "mpc", sound: MPC_SOUNDS[i], pad: m }; m.isPickable = true;
      mpcPads.push(m);
    });
  } catch (e) { console.warn("mpc load failed", e); }
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
  await place("kbmagic.glb", "kb", 0.40, 0.12, 0.14, 0, ["kb", "kbTop"], 0); // Apple Magic Keyboard (already white) — no tint, typing area
  await place("mouse2.glb", "mouse", 0.11, 0.44, 0.16, 0, ["tbBase", "tbBall"], -Math.PI / 2); // A4Tech Bloody V7 — original mouse size (0.11), laid flat; replaces trackball
  await place("mug3.glb", "mug", 0.1, -0.42, 0.28, 0, ["mug", "coffee"]); // Blender mug, front-left corner
  await place("midi.glb", "midi", 0.5, 0.0, 0.33, 0, ["midiBody", "midiKeys"]); // MIDI controller at the front edge
  await place("macstudio.glb", "mac", 0.22, 0.66, -0.18, 0, ["mac"]); // real Mac Studio replaces the silver box (the portable display rests on its top — see loadMonitors)
  deskProps.mac?.getChildMeshes().forEach((m) => { m._pc = true; m.isPickable = true; }); // click the Mac Studio = boot the computer terminal
  await place("clock.glb", "clock", 0.12, -0.58, -0.15, 0, ["clockBody", "clockFace"]); // alarm clock replaces the procedural digital clock
  setupLiveClock(deskProps.clock); // hide its baked "04:32" and float the live Hawthorne/LA time over the display
  await loadMonitors();
}
// the clock.glb ships a BAKED "04:32 AM" on its display; hide those digits and float a live-time quad
// (drawClock → clockTex, refreshed each second, America/Los_Angeles = Hawthorne's timezone) over the screen.
// NOTE: access the clock's meshes via getChildMeshes(), never scene.getMeshByName — the GLB's generic
// "Object_N" names collide with the pedals/guitar GLBs.
let clockLive = null; // the live-time quad — a STATIC, arrange-adjustable editable
function setupLiveClock(clk) {
  if (!clk) return;
  const kids = clk.getChildMeshes();
  const disp = kids.find((m) => m.material && m.material.name === "material");     // the baked digit display quad ("04:32")
  const amSign = kids.find((m) => m.material && m.material.name === "alarm_sign"); // the bell + static AM/PM graphic
  [disp, amSign].forEach((m) => { if (m) m.setEnabled(false); }); // remove the original baked numbers entirely
  if (!disp) return;
  disp.computeWorldMatrix(true);
  const bb = disp.getBoundingInfo().boundingBox, wc = bb.centerWorld;
  const wW = Math.max(bb.maximumWorld.x - bb.minimumWorld.x, 0.05), wH = Math.max(bb.maximumWorld.y - bb.minimumWorld.y, 0.02);
  clockTex.uScale = -1; clockTex.uOffset = 1; clockTex.vScale = -1; clockTex.vOffset = 1; // flip U+V so the readout sits upright and un-mirrored on the +z-facing plane (plane stays uniform-scaled = arrange-safe)
  const sm = emis("clkLive", 0x000000, { glow: false }); sm.diffuseTexture = clockTex; sm.emissiveTexture = clockTex; sm.emissiveColor = new B.Color3(1, 1, 1); sm.disableLighting = true; sm.backFaceCulling = false;
  // STANDALONE quad — not parented/billboarded, so it stays put; geometry carries the aspect so uniform arrange-scaling is fine
  const ov = B.MeshBuilder.CreatePlane("clockLiveFace", { width: wW, height: wH }, scene);
  ov.material = sm; ov.isPickable = true;
  ov.position.set(wc.x, wc.y, wc.z + 0.01);
  ov.rotation.set(0, Math.PI, 0); // face the player (clock front = +z); nudge in arrange if needed
  clockLive = ov;
}

// real monitor bodies (Poly Pizza, CC-BY) — keep the live screens by mapping the animated DAW/meter textures onto the models
async function loadMonitors() {
  try { // ultrawide: widescreen monitor with desk mount; overlay the live DAW/slideshow plane on its panel
    const tv = await importGLB("ultrawide2.glb");
    tv.parent = desk;
    tv.scaling.setAll(0.98 / tv._naturalMax); // already ~1.8:1 widescreen
    tv.rotation = new V3(0, -Math.PI / 2, 0); // turn the screen to face the player
    tv.position.set(0, 0.74, -0.2);
    tv.computeWorldMatrix(true);
    const bb = tv.getHierarchyBoundingVectors();
    tv.position.y += 0.74 - bb.min.y; // rest the stand on the desk
    // this asset's emissive screen quad ("Monitor Glow") has clean 0–1 UVs, so paint the live slideshow
    // straight onto it — it fills the real screen exactly, no separate floating plane to align.
    const screenMesh = tv.getChildMeshes().find(m => /glow/i.test(m.name)) || tv.getChildMeshes().find(m => /monitor/i.test(m.name));
    if (screenMesh) { screenMesh.material = screenOffMat; screenMesh._ytscreen = true; screenMesh.isPickable = true; monitorScreenMesh = screenMesh; } // the YouTube overlay is glued onto this; click it to pause/play
    monScreen.setEnabled(false); // retire the old floating plane
    scene.getMeshByName("monBezel")?.setEnabled(false);
    deskProps.ultrawide = tv;
  } catch (e) { console.warn("ultrawide failed — keeping procedural", e); }
  try { // small portable display, propped on top of the Mac Studio, angled toward the player
    const tab = await importGLB("tablet.glb");
    tab.parent = desk;
    tab.scaling.setAll(0.30 / tab._naturalMax);
    tab.rotation = new V3(Math.PI / 2 - 0.28, -0.35, 0); // stand it up + angle toward the person
    // rest on the actual Mac Studio GLB top (its height differs from the old 0.835 box); fall back if the model didn't load
    const macTop = deskProps.mac ? deskProps.mac.getHierarchyBoundingVectors().max.y : 0.835;
    tab.position.set(0.66, macTop, -0.18); // sit it on the Mac Studio (right side)
    tab.computeWorldMatrix(true);
    const { min } = tab.getHierarchyBoundingVectors();
    tab.position.y += macTop - min.y; // rest on the Mac top
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
const careBowls = {};              // { food, water, litter } → { pivot, fill, ... }; the cat draws these down on its timers and you refill them
const litter = node("litter", -2.28, 0, 2.85);
const trayMat = matte("tray", 0x9aa0a4);
box("litFloor", 0.52, 0.03, 0.4, 0, 0.015, 0, trayMat, litter, false);
[[0.52, 0.025, 0, -0.19], [0.52, 0.025, 0, 0.19]].forEach(([w, d, x, z], i) => box("litW" + i, w, 0.12, d, x, 0.06, z, trayMat, litter, false));
[[0.025, 0.4, -0.248, 0], [0.025, 0.4, 0.248, 0]].forEach(([w, d, x, z], i) => box("litS" + i, w, 0.12, d, x, 0.06, z, trayMat, litter, false));
const sandTex = dyn("sand", 128, 128, (c, w, h) => { c.fillStyle = "#cfc3a4"; c.fillRect(0, 0, w, h); for (let i = 0; i < 3000; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); } });
const sandMat = new B.StandardMaterial("sandMat", scene); sandMat.diffuseTexture = sandTex; sandMat.emissiveColor = C(0x6b6048).scale(0.3); sandMat.specularColor = new B.Color3(0, 0, 0);
const sand = B.MeshBuilder.CreateGround("sand", { width: 0.47, height: 0.35 }, scene); sand.material = sandMat; sand.parent = litter; sand.position.y = 0.045;
// soiled clumps that surface as the box gets used (the sand darkens too) — see updateBowls()
const litClumpMat = matte("litClump", 0x5a4f3a);
const litClumps = [[0.13, 0.08], [-0.1, -0.06], [0.0, 0.13]].map(([x, z], i) => { const c = sph("litClump" + i, 0.05 + i * 0.006, x, 0.055, z, litClumpMat, litter, false); c.setEnabled(false); return c; });
litter.getChildMeshes(false).forEach((m) => { m._careBowl = "litter"; m.isPickable = true; }); // click the box to clean it; the cat targets the `litter` node
careBowls.litter = { pivot: litter, fill: sand, clumps: litClumps, kind: "litter" };
function bowl(name, x, z, dishCol, fillMat, kind) {
  const g = node(name, x, 0, z);
  const dm = matte(name + "dish", dishCol); dm.emissiveColor = C(dishCol).scale(0.35);
  const dish = cyl(name + "dish", 0.075, 0.06, 0.045, 0, 0.0225, 0, dm, g, 16, false);
  const fill = cyl(name + "fill", 0.058, 0.05, 0.03, 0, 0.025, 0, fillMat, g, 16, false);
  fill._botY = 0.01; fill._h = 0.03;                                            // anchor the fill to the dish floor as it drains
  [dish, fill].forEach((m) => { m._careBowl = kind; m.isPickable = true; });     // click to refill; the cat targets node g
  careBowls[kind] = { pivot: g, fill, kind };
  return g;
}
const foodFillTex = dyn("food", 64, 64, (c, w, h) => { c.fillStyle = "#6a4a26"; c.fillRect(0, 0, w, h); for (let i = 0; i < 240; i++) { c.fillStyle = "#8a6438"; c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 2, 0, 7); c.fill(); } });
const foodMat = new B.StandardMaterial("foodMat", scene); foodMat.diffuseTexture = foodFillTex; foodMat.emissiveColor = C(0x6a4a26).scale(0.3); foodMat.specularColor = new B.Color3(0, 0, 0);
const waterMat = new B.PBRMetallicRoughnessMaterial("waterMat", scene); waterMat.baseColor = C(0x3a7ab8); waterMat.roughness = 0.1; waterMat.metallic = 0.1; waterMat.alpha = 0.85; waterMat.emissiveColor = C(0x2f6f9c).scale(0.3);
bowl("foodBowl", 2.32, 0.75, 0x8a3324, foodMat, "food"); bowl("waterBowl", 2.32, 1.08, 0x46606e, waterMat, "water");
// treat jar on the sill — click it (or press T) to toss the cat a treat
const treatJar = cyl("treatJar", 0.035, 0.035, 0.09, 1.4, 0.905, ZF + 0.07, glassMat("treatJar", 0xd8e4ea, 0.4, 0.05), null, 12, false);
const treatKibble = cyl("treatKibble", 0.029, 0.029, 0.055, 1.4, 0.888, ZF + 0.07, matte("treatKibble", 0x7a5530), null, 12, false);
[treatJar, treatKibble].forEach((m) => { m._careBowl = "treat"; m.isPickable = true; });

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
// the cat's toy — a ball of red yarn (a core sphere wound with two crossed loops). click it
// and it skitters across the floor; the cat drops what it's doing and chases it down (see pokeYarn/updateYarn).
const yarn = node("yarn", 0.8, 0, 1.2); // out in the open floor — not jammed in the back-left corner by the litter box
const yarnBall = sph("yarnBall", 0.08, 0, 0.04, 0, matte("yarn", 0xc23b4e), yarn);
[0.5, 1.9].forEach((rx, i) => { const ring = B.MeshBuilder.CreateTorus("yarnRing" + i, { diameter: 0.092, thickness: 0.012, tessellation: 14 }, scene); ring.material = matte("yarnRing" + i, 0xd8556a); ring.parent = yarn; ring.position.y = 0.04; ring.rotation.x = rx; });
yarn.getChildMeshes().forEach((m) => { m._toy = true; m.isPickable = true; }); // the crosshair can poke it to send the cat chasing

// the litter box is a no-go for toys — a skittering ball used to roll into it and get stuck
// (you can't fish it out). treat it as a solid box: rolling/flying toys bounce off the nearest wall.
const LITTER_BOX = { minX: -2.56, maxX: -2.0, minZ: 2.62, maxZ: 3.08 };
function keepOutOfLitter(pos, vel) {
  const b = LITTER_BOX;
  if (pos.x <= b.minX || pos.x >= b.maxX || pos.z <= b.minZ || pos.z >= b.maxZ) return;
  const dl = pos.x - b.minX, dr = b.maxX - pos.x, dn = pos.z - b.minZ, df = b.maxZ - pos.z, m = Math.min(dl, dr, dn, df);
  if (m === dl) { pos.x = b.minX; if (vel) vel.x = -Math.abs(vel.x) * 0.5; }
  else if (m === dr) { pos.x = b.maxX; if (vel) vel.x = Math.abs(vel.x) * 0.5; }
  else if (m === dn) { pos.z = b.minZ; if (vel) vel.z = -Math.abs(vel.z) * 0.5; }
  else { pos.z = b.maxZ; if (vel) vel.z = Math.abs(vel.z) * 0.5; }
}

// THE FETCH TOY — a felt mouse. click it to pick it up; click again to toss it in an arc.
// the cat scampers after where it lands, carries it back in its mouth, and drops it at your
// feet so you can throw again. (ported from the three.js room's fetch mechanic.)
const TOY_REST_Y = 0.04;
const toyNode = node("mouseToy", 0.6, TOY_REST_Y, 1.6);
const toyGrey = matte("toyGrey", 0x9aa0a8); toyGrey.emissiveColor = C(0x33373d); // a soft self-glow so it's spottable on a dark floor
const toyPink = matte("toyPink", 0xe79bab); toyPink.emissiveColor = C(0x4e2530);
const toyBody = sph("toyBody", 0.08, 0, 0, 0, toyGrey, toyNode); toyBody.scaling.set(1.6, 0.9, 0.95);
[-1, 1].forEach((s) => { const ear = sph("toyEar" + s, 0.04, 0.028, 0.03, s * 0.026, toyPink, toyNode, false); ear.scaling.set(0.4, 1, 1); });
sph("toyNose", 0.018, 0.066, -0.002, 0, toyPink, toyNode, false);
const toyTail = cyl("toyTail", 0.008, 0.002, 0.13, -0.085, 0.004, 0, toyPink, toyNode, 5, false); toyTail.rotation.z = Math.PI / 2 - 0.3;
toyNode.getChildMeshes().forEach((m) => { m._fetchToy = true; m.isPickable = true; });
const toy = { phase: "rest", x: 0.6, z: 1.6, y: TOY_REST_Y, vx: 0, vy: 0, vz: 0, spin: 0, faceYaw: 0 };
const TOYBB = { minX: -2.3, maxX: 2.3, minZ: -2.9, maxZ: 3.0 }; // keep throws inside the bedroom

function grabToy() { toy.phase = "held"; flashHint("you scooped up the mouse — click to throw it 🐭"); }
function throwToy() {
  const d = camera.getForwardRay().direction; // true forward (scene is right-handed; getDirection(Z) points backward)
  toy.vx = d.x * 3.0; toy.vz = d.z * 3.0; toy.vy = 2.7;        // a gentle underarm arc
  toy.phase = "fly"; toy.spin = 0; toy.faceYaw = Math.atan2(d.x, d.z);
}
function dropToy(dx, dz) {                                      // cat sets it down — at your feet, or at a given spot (patience timeout)
  if (dx != null) { toy.x = dx; toy.z = dz; }
  else { const d = camera.getForwardRay().direction; toy.x = camera.position.x + d.x * 0.6; toy.z = camera.position.z + d.z * 0.6; }
  toy.x = Math.max(TOYBB.minX, Math.min(TOYBB.maxX, toy.x)); toy.z = Math.max(TOYBB.minZ, Math.min(TOYBB.maxZ, toy.z));
  toy.y = TOY_REST_Y; toy.phase = "rest"; toy.vx = toy.vy = toy.vz = 0;
  keepOutOfLitter(toy, null);
  flashHint("the cat dropped the mouse — throw it again 🐭"); catVoice("chirp");
}
function startFetch() {                                         // toy just landed — send the cat (unless it's mid-need)
  if (catState.chore && catState.chore !== "play") return;     // busy eating/drinking/digging — leave it as a grabbable rest
  yarnActive = false;                                           // a thrown mouse trumps the yarn
  toy.phase = "claimed"; catState.chore = "fetch_go"; catState.tx = toy.x; catState.tz = toy.z; catState.ty = 0; catState.walking = true; catState.dwell = 0;
}
// the cat's mouth in world space (head forward + up a little); forward = (sin yaw, cos yaw)
function catMouth() { const f = catState.yaw; return { x: catGrp.position.x + Math.sin(f) * 0.18, y: catGrp.position.y + 0.18, z: catGrp.position.z + Math.cos(f) * 0.18 }; }
function updateFetchToy(dt) {
  if (toy.phase === "held") {
    const d = camera.getForwardRay().direction; // true forward (scene is right-handed; getDirection(Z) points backward)
    toy.x = camera.position.x + d.x * 0.5; toy.z = camera.position.z + d.z * 0.5; toy.y = 1.02 + Math.sin(T * 3) * 0.02; toy.faceYaw = Math.atan2(d.x, d.z);
  } else if (toy.phase === "fly") {
    toy.vy -= 9.0 * dt; toy.x += toy.vx * dt; toy.y += toy.vy * dt; toy.z += toy.vz * dt; toy.spin += dt * 12;
    if (toy.x < TOYBB.minX) { toy.x = TOYBB.minX; toy.vx = 0; } if (toy.x > TOYBB.maxX) { toy.x = TOYBB.maxX; toy.vx = 0; }
    if (toy.z < TOYBB.minZ) { toy.z = TOYBB.minZ; toy.vz = 0; } if (toy.z > TOYBB.maxZ) { toy.z = TOYBB.maxZ; toy.vz = 0; }
    keepOutOfLitter(toy, toy._vproxy || (toy._vproxy = { get x() { return toy.vx; }, set x(v) { toy.vx = v; }, get z() { return toy.vz; }, set z(v) { toy.vz = v; } }));
    if (toy.y <= TOY_REST_Y) { toy.y = TOY_REST_Y; toy.phase = "rest"; toy.vx = toy.vy = toy.vz = 0; startFetch(); } // landed → cat fetches
  } else if (toy.phase === "carry") {
    const mp = catMouth(); toy.x = mp.x; toy.y = mp.y; toy.z = mp.z; toy.faceYaw = catState.yaw;
  }
  toyNode.position.set(toy.x, toy.y, toy.z);
  toyNode.rotation.set(toy.phase === "fly" ? toy.spin : 0, toy.faceYaw + Math.PI / 2, 0);
}

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
let catState = { tx: 0.2, tz: SWEET.z + 0.3, ty: 0, yaw: Math.PI, baseY: 0, walking: false, dwell: 3, chore: null };
let catModel = null, catBaseY = 0; // the GLB cat + its rested height, animated in updateCat
// yarn-toy state: when active the cat abandons its wander/chores to chase the rolling ball
let yarnActive = false, yarnBats = 0; const yarnVel = { x: 0, z: 0 };
let catMeowTimer = 45 + Math.random() * 105; // the cat meows to itself now and then (same cadence as the three.js room)
let catAnimIdle = null, catWalkBones = null, catWalking = false; // the model's idle clip + the four hip bones the authored walk drives
function swingBone(bn, tgt) { if (!bn) return; const prev = bn._sw || 0; bn.rotate(B.Axis.X, tgt - prev, B.Space.LOCAL); bn._sw = tgt; } // absolute swing via delta-rotation

// hearts pool
const heartTex = dyn("heart", 64, 64, (c, w, h) => { c.fillStyle = "#ff7a9a"; c.font = "44px serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("♥", 32, 36); }, { flip: true });
const heartMat = emis("heartMat", 0xffffff, { glow: false }); heartMat.emissiveTexture = heartTex; heartMat.emissiveTexture.hasAlpha = true; heartMat.useAlphaFromEmissiveTexture = true; heartMat.opacityTexture = heartTex; heartMat.alpha = 1;
const hearts = [];
function popHearts() { const p = catGrp.getAbsolutePosition(); for (let i = 0; i < 3; i++) { const h = B.MeshBuilder.CreatePlane("heart", { size: 0.1 }, scene); h.material = heartMat; h.billboardMode = B.Mesh.BILLBOARDMODE_ALL; h.position.set(p.x + (Math.random() - 0.5) * 0.2, catState.baseY + 0.3, p.z + (Math.random() - 0.5) * 0.2); h._life = 1.6; h._vx = (Math.random() - 0.5) * 0.1; hearts.push(h); } }

// =====================================================================
// THE CAT'S NEEDS — bowls it draws down on its own timers + a feeding
// station you keep filled. The brain (timers, decay, persistence) is
// store.js, identical to the live site; this is just the room-side body:
// in-world bowls, a small HUD, and the cat walking over to act on them.
// =====================================================================
let catRaw = null;                 // last raw state from store (food/water/litter/timers)
let catNeeds = store.decayCat(null); // derived: fed/hydrated/hungry/thirsty/bathroom/levels
// the bowls + litter box are the existing CAT CORNER meshes (registered into `careBowls` up there);
// here we just animate their levels from the cat's needs.

// push the current need levels into the existing bowl/litter visuals (called on every state change)
const SAND_CLEAN = new B.Color3(1, 1, 1), SAND_DIRTY = new B.Color3(0.52, 0.46, 0.34);
function updateBowls() {
  const drain = (b, lv) => { if (!b) return; const sy = 0.12 + Math.min(1, lv) * 0.88; b.fill.scaling.y = sy; b.fill.position.y = b.fill._botY + b.fill._h * sy / 2; b.fill.setEnabled(lv > 0.03); };
  drain(careBowls.food, catNeeds.food); drain(careBowls.water, catNeeds.water);
  const l = careBowls.litter;
  if (l) { const lv = Math.min(1, catNeeds.litter); B.Color3.LerpToRef(SAND_CLEAN, SAND_DIRTY, lv, l.fill.material.diffuseColor); l.clumps.forEach((c, i) => c.setEnabled(lv > 0.35 + i * 0.22)); }
}

// HUD: fed / hydrated / (litter) / bowl-empty warnings — same read as main.js
const catHud = document.getElementById("cat-hud");
function updateCatHUD() {
  if (!catHud) return;
  const d = catNeeds, pct = (v) => `${Math.round(v * 100)}%`;
  const well = (v) => v < 0.4 ? "crit" : v < 0.75 ? "low" : "";
  const dirty = (v) => v > 0.85 ? "crit" : v > 0.6 ? "low" : "";
  catHud.innerHTML =
    `🐾 fed <span class="${well(d.fed)}">${pct(d.fed)}</span>` +
    ` · hydrated <span class="${well(d.hydrated)}">${pct(d.hydrated)}</span>` +
    (d.litter > 0.5 ? ` · litter <span class="${dirty(d.litter)}">${pct(d.litter)}</span>` : "") +
    ((d.hungry && d.food <= 0.05) ? ` · <span class="crit">food bowl empty!</span>` : "") +
    ((d.thirsty && d.water <= 0.05) ? ` · <span class="crit">water bowl empty!</span>` : "");
}

// fold a fresh raw state into the derived needs + refresh everything it drives
function applyCatNeeds(s) {
  if (!s) return; catRaw = s; catNeeds = store.decayCat(s); updateCatHUD(); updateBowls();
}

// human care: feed / water / clean / treat — thresholds match the three.js room
async function handleCare(kind) {
  const d = catNeeds;
  try {
    if (kind === "food") { if (d.food >= 0.6) return flashHint("the food bowl is still pretty full"); applyCatNeeds(await store.catCare("feed")); flashHint("you filled the food bowl 🐾"); }
    else if (kind === "water") { if (d.water >= 0.7) return flashHint("the water's fine"); applyCatNeeds(await store.catCare("water")); flashHint("fresh water, poured"); }
    else if (kind === "litter") { if (d.litter <= 0.15) return flashHint("the litter box is clean"); applyCatNeeds(await store.catCare("clean")); flashHint("litter box: spotless — you're a good person 🐾"); }
    else if (kind === "treat") { const res = await store.catCare("treat"); if (res && res.ok === false) return flashHint("the cat is full of treats right now"); applyCatNeeds(res); lureCat(); flashHint("the cat is sprinting over 😻"); }
  } catch (e) { flashHint("couldn't reach the cat's things — try again"); }
}

// drop a treat in front of the player and send the cat to it
function lureCat() {
  const dir = camera.getForwardRay().direction; // true forward (scene is right-handed; getDirection(Z) points backward)
  catState.tx = Math.max(-2.3, Math.min(2.3, camera.position.x + dir.x * 0.8));
  catState.tz = Math.max(-3.0, Math.min(3.0, camera.position.z + dir.z * 0.8));
  catState.ty = 0; catState.chore = null; catState.walking = true; catState.dwell = 0;
}

// =====================================================================
// THE DIRTY FLOOR + THE VACUUM (task 9) — a transparent grime layer over
// the carpet that darkens where you and the cat keep treading; grab the
// stick vacuum from its corner and walk to lift it back out. ported from
// world.js. persists per-visitor in localStorage (shared-canonical = a
// follow-up, like the wall photos).
// =====================================================================
const GRW = 160, GRH = 200;                       // grime canvas, room aspect ~0.79
const grimeTex = new B.DynamicTexture("grimeTex", { width: GRW, height: GRH }, scene, false);
grimeTex.hasAlpha = true;
const grimeCtx = grimeTex.getContext();
grimeCtx.clearRect(0, 0, GRW, GRH);
// MeshBasic-equivalent: unlit, the texture's brown shows where dirty, its alpha blends it
// over the carpet. wired to BOTH diffuse + emissive (emissive-only samples flat white here).
const grimeMat = new B.StandardMaterial("grimeMat", scene);
grimeMat.diffuseTexture = grimeTex; grimeMat.emissiveTexture = grimeTex;
grimeMat.emissiveColor = new B.Color3(1, 1, 1); grimeMat.diffuseColor = new B.Color3(0, 0, 0);
grimeMat.specularColor = new B.Color3(0, 0, 0); grimeMat.disableLighting = true;
grimeMat.useAlphaFromDiffuseTexture = true; grimeMat.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
const grimeMesh = B.MeshBuilder.CreateGround("grimeMesh", { width: W, height: D }, scene);
grimeMesh.material = grimeMat; grimeMesh.position.y = 0.006; grimeMesh.isPickable = false; grimeMesh.receiveShadows = false;
// room (x,z) → grime pixel (same mapping the carpet uses)
const grimePX = (x) => ((x + X) / (2 * X)) * GRW;
// NOTE: the DynamicTexture has invertY=true, so canvas row maps to (1-v) on the ground —
// flip Z here so the grime (and the vacuum's clean) lands where you actually stand.
const grimePZ = (z) => ((ZB - z) / (ZB - ZF)) * GRH;
let grimeDirty = false, grimeUpAt = 0, grimeSaveDirty = false, grimeSaveAt = 0;
// a step grinds a little dirt in where it lands; standing still concentrates it
function floorTraffic(x, z, dt, mult = 1) {
  const cx = grimePX(x), cy = grimePZ(z);
  if (cx < -12 || cx > GRW + 12 || cy < -12 || cy > GRH + 12) return;
  const r = 9 * mult, a = Math.min(0.09, dt * 0.15 * mult);
  const grd = grimeCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grd.addColorStop(0, `rgba(24,19,11,${a})`); grd.addColorStop(1, "rgba(24,19,11,0)");
  grimeCtx.fillStyle = grd; grimeCtx.beginPath(); grimeCtx.arc(cx, cy, r, 0, 7); grimeCtx.fill();
  grimeDirty = true; grimeSaveDirty = true;
}
// the vacuum lifts the alpha back out in a soft radius
function cleanFloor(x, z, rMeters) {
  const cx = grimePX(x), cy = grimePZ(z), r = (rMeters / (2 * X)) * GRW;
  const grd = grimeCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grd.addColorStop(0, "rgba(0,0,0,1)"); grd.addColorStop(0.55, "rgba(0,0,0,1)"); grd.addColorStop(1, "rgba(0,0,0,0)");
  grimeCtx.globalCompositeOperation = "destination-out"; grimeCtx.fillStyle = grd;
  grimeCtx.beginPath(); grimeCtx.arc(cx, cy, r, 0, 7); grimeCtx.fill();
  grimeCtx.globalCompositeOperation = "source-over";
  grimeDirty = true; grimeSaveDirty = true;
}
// downsample the alpha to a 32x40 grid, one hex digit per cell (~1.3KB) — survives reload
const GGW = 32, GGH = 40, GBX = GRW / GGW, GBZ = GRH / GGH;
function grimeSnapshot() {
  grimeSaveDirty = false;
  const img = grimeCtx.getImageData(0, 0, GRW, GRH).data; let out = "";
  for (let gy = 0; gy < GGH; gy++) for (let gx = 0; gx < GGW; gx++) {
    let sum = 0;
    for (let py = 0; py < GBZ; py++) for (let px = 0; px < GBX; px++) sum += img[((gy * GBZ + py) * GRW + (gx * GBX + px)) * 4 + 3];
    out += Math.min(15, Math.round(sum / (GBX * GBZ) / 255 * 15)).toString(16);
  }
  return out;
}
function grimeRestore(str) {
  if (typeof str !== "string" || str.length !== GGW * GGH) return false;
  grimeCtx.clearRect(0, 0, GRW, GRH);
  for (let gy = 0; gy < GGH; gy++) for (let gx = 0; gx < GGW; gx++) {
    const q = parseInt(str[gy * GGW + gx], 16); if (!q) continue;
    grimeCtx.fillStyle = `rgba(24,19,11,${(q / 15).toFixed(3)})`; grimeCtx.fillRect(gx * GBX, gy * GBZ, GBX, GBZ);
  }
  grimeTex.update(); grimeSaveDirty = false; return true;
}
// a lived-in floor to start: heavier where feet/paws dwell, plus scattered dust
function seedGrime() {
  const blob = (x, z, rM, a) => { const cx = grimePX(x), cy = grimePZ(z), r = (rM / (2 * X)) * GRW; const grd = grimeCtx.createRadialGradient(cx, cy, 0, cx, cy, r); grd.addColorStop(0, `rgba(24,19,11,${a})`); grd.addColorStop(1, "rgba(24,19,11,0)"); grimeCtx.fillStyle = grd; grimeCtx.beginPath(); grimeCtx.arc(cx, cy, r, 0, 7); grimeCtx.fill(); };
  blob(0.2, -1.4, 0.7, 0.5); blob(0.2, 1.6, 0.7, 0.42); blob(0, 0.5, 0.9, 0.3); // chair, sweet spot, walkway
  blob(2.0, 2.7, 0.6, 0.45); blob(-2.0, 2.7, 0.6, 0.42); blob(-1.4, 0.4, 0.55, 0.3); // cat corner, litter, perch
  for (let i = 0; i < 14; i++) blob((Math.random() * 2 - 1) * 2.3, ZF + 0.5 + Math.random() * (D - 1), 0.4 + Math.random() * 0.4, 0.1 + Math.random() * 0.13);
  grimeTex.update(); grimeSaveDirty = true;
}
function saveGrime() { try { localStorage.setItem("metro.grime.v2", grimeSnapshot()); } catch (e) { /* private mode */ } }
// adopt the saved carpet, or start it lived-in
(() => { let s = null; try { s = localStorage.getItem("metro.grime.v2"); } catch (e) {} if (!grimeRestore(s)) seedGrime(); })();

// the vacuum: an upright stick that lives in the back corner by the cat bowls.
// yaw aims the model's built-in lean (handle tips toward node -Z) into the +x/+z corner, so it
// reads as propped against the two walls rather than tipping into the room.
const VAC_DOCK = { x: 2.16, z: 2.84, ry: -3 * Math.PI / 4 };
const vacRed = matte("vacRed", 0xb23a44), vacDark = matte("vacDark", 0x2a2d33), vacSilver = matte("vacSilver", 0x9aa0a8);
const vacCanMat = matte("vacCan", 0x7a8a3e); vacCanMat.alpha = 0.66; vacCanMat.transparencyMode = B.Material.MATERIAL_ALPHABLEND; // see-through dust canister
const vacuum = node("vacuum", VAC_DOCK.x, 0, VAC_DOCK.z);
box("vNozzle", 0.34, 0.05, 0.17, 0, 0.03, 0, vacDark, vacuum);
box("vBody", 0.16, 0.27, 0.13, 0, 0.21, 0, vacRed, vacuum);
box("vCan", 0.105, 0.13, 0.09, 0, 0.41, 0.025, vacCanMat, vacuum);
cyl("vPole", 0.034, 0.034, 0.92, 0, 0.7, 0, vacSilver, vacuum, 10);
box("vGrip", 0.045, 0.17, 0.045, 0, 1.12, 0.015, vacDark, vacuum);
box("vGripTop", 0.045, 0.045, 0.15, 0, 1.19, 0.06, vacDark, vacuum);
vacuum.getChildMeshes().forEach((m) => { m._vacuum = true; m.isPickable = true; }); // any part of it is grabbable
let vacHeld = false, vacModel = null; // vacModel = the GLB once it loads (null = procedural stick still showing)
function dockVacuum() { vacuum.position.set(VAC_DOCK.x, 0, VAC_DOCK.z); vacuum.rotation.set(vacModel ? 0 : 0.13, VAC_DOCK.ry, vacModel ? 0 : -0.17); } // the GLB leans itself; the procedural stick needs a manual tilt
// while held: the head rides the floor out ahead of you and the pole leans back into your hands
function vacuumStep(px, pz) {
  if (!vacHeld) return;
  const f = camera.getForwardRay().direction;        // true forward (right-handed scene)
  const nx = px + f.x * 0.72, nz = pz + f.z * 0.72;   // head out ahead of you
  vacuum.position.set(nx, 0, nz);
  vacuum.rotation.set(vacModel ? 0 : 0.6, Math.atan2(f.x, f.z), 0);  // face your heading (GLB leans itself; procedural needs a pitch)
  cleanFloor(nx, nz, 0.42);
}
function setVacuuming(on) {
  if (on === vacHeld) return;
  vacHeld = on;
  if (on) { ensureAudio(); startVacuumSound(); flashHint("vacuuming — walk to clean the carpet · click to put it away"); }
  else { stopVacuumSound(); dockVacuum(); saveGrime(); flashHint("vacuum back in the corner"); }
}
dockVacuum();
// the motor: brown-ish noise air-rush + a tonal whine, faded in/out. lives on the room's AC.
let vacNodes = null;
function startVacuumSound() {
  if (!AC || vacNodes) return; const t = AC.currentTime;
  const src = noiseBuf(2); src.loop = true;
  const hp = AC.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 130;
  const lp = AC.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 950; lp.Q.value = 0.6;
  const g = AC.createGain(); g.gain.value = 0.0001;
  const whine = AC.createOscillator(); whine.type = "sawtooth"; whine.frequency.value = 220;
  const wlp = AC.createBiquadFilter(); wlp.type = "lowpass"; wlp.frequency.value = 1500;
  const wg = AC.createGain(); wg.gain.value = 0.0001;
  src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(master);
  whine.connect(wlp); wlp.connect(wg); wg.connect(master);
  g.gain.linearRampToValueAtTime(0.15, t + 0.18); wg.gain.linearRampToValueAtTime(0.045, t + 0.22);
  src.start(); whine.start();
  vacNodes = { src, whine, g, wg };
}
function stopVacuumSound() {
  if (!vacNodes || !AC) return; const n = vacNodes; vacNodes = null; const t = AC.currentTime;
  n.g.gain.cancelScheduledValues(t); n.g.gain.setValueAtTime(n.g.gain.value, t); n.g.gain.linearRampToValueAtTime(0, t + 0.22);
  n.wg.gain.cancelScheduledValues(t); n.wg.gain.setValueAtTime(n.wg.gain.value, t); n.wg.gain.linearRampToValueAtTime(0, t + 0.22);
  n.src.stop(t + 0.26); n.whine.stop(t + 0.26);
}
// swap the procedural stick for the real GLB (Sketchfab). the model is Y-up, thin in Z, with
// its nozzle along X — VAC_FIX_RY turns the nozzle into the push direction (+z = the vacuum
// node's forward); +π from there because the user found it facing backwards when held.
// the GLB is modelled LEANING in its own XY plane (head out along -X, handle up along +X).
// rotate +90° about Y so its head points to the vacuum node's forward (+z) and its built-in
// lean falls back toward you — so we DON'T add any pitch of our own (that flattened it).
const VAC_FIX_RY = Math.PI / 2;
const VAC_H = 1.15;                        // longest dimension in metres (it's a diagonal model)
async function loadVacuum() {
  try {
    vacuum.position.set(0, 0, 0); vacuum.rotation.set(0, 0, 0); vacuum.computeWorldMatrix(true); // fit in an upright, un-rotated frame
    const proc = vacuum.getChildMeshes();  // the procedural parts (captured before the GLB is parented)
    const m = await importGLB("vacuum_cleaner.glb");
    vacModel = node("vacModel", 0, 0, 0, vacuum);
    m.parent = vacModel;
    m.scaling.setAll(VAC_H / m._naturalMax);
    m.rotation = new V3(0, VAC_FIX_RY, 0); m.position.set(0, 0, 0); m.computeWorldMatrix(true);
    let bb = m.getHierarchyBoundingVectors();              // center horizontally over the pivot…
    m.position.x -= (bb.min.x + bb.max.x) / 2; m.position.z -= (bb.min.z + bb.max.z) / 2;
    m.computeWorldMatrix(true); bb = m.getHierarchyBoundingVectors();
    m.position.y -= bb.min.y;                              // …and stand its base on the floor
    m.getChildMeshes().forEach((mesh) => { mesh._vacuum = true; mesh.isPickable = true; }); // grabbable
    // one big invisible collider around the whole model, so you can grab it from anywhere on
    // the vacuum (the thin pole/head are fiddly to aim at). padded a little for forgiveness.
    m.computeWorldMatrix(true); bb = m.getHierarchyBoundingVectors();
    const hit = box("vacHit", bb.max.x - bb.min.x + 0.22, bb.max.y - bb.min.y + 0.1, bb.max.z - bb.min.z + 0.22,
      (bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2, matte("vacHitM", 0x000000), vacModel, false);
    hit.visibility = 0; hit._vacuum = true; hit.isPickable = true;
    proc.forEach((p) => { p.setEnabled(false); p.isPickable = false; }); // retire the procedural stick
    dockVacuum();
  } catch (e) { console.warn("vacuum GLB load failed — keeping the procedural stick", e); dockVacuum(); }
}

// the main bedroom door — prison_door.glb fitted into the east-wall opening. all hand-tunable
// (scale / yaw / x / z) via METRO_BJS.fitDoor({...}); the deep model sits with its front at the wall.
let bedDoor = null;
// the door starts STANDING IN THE OPEN so you can see it and drag it where you want (arrange mode, G);
// it's an editable, so once you place it the layout remembers it and we refine from there.
const DOOR = { scale: 0.74, ry: 0, x: 2.5, z: 2.62, yLift: 0 }; // seated in the east-wall doorway (where you placed it)
function fitDoor() {
  if (!bedDoor) return;
  bedDoor.scaling.setAll(DOOR.scale);
  bedDoor.rotation = new V3(0, DOOR.ry, 0);
  bedDoor.position.set(DOOR.x, 0, DOOR.z); bedDoor.computeWorldMatrix(true);
  const bb = bedDoor.getHierarchyBoundingVectors();
  bedDoor.position.y += DOOR.yLift - bb.min.y; // base on the floor
}
let doorNearMeshes = [], doorFarMeshes = [];
async function loadDoor() {
  try {
    bedDoor = await importGLB("prison_door.glb");
    bedDoor.getChildMeshes().forEach((m) => { m.isPickable = false; m.applyFog = false; });
    // the GLB ships TWO door units (a closed one + an open/swung one). split by the model's own z
    // and KEEP the closed one (it sits at the wall); hide the open "2nd door" that's furthest out.
    const dms = bedDoor.getChildMeshes().filter((m) => m.getTotalVertices && m.getTotalVertices() > 0);
    const inv = B.Matrix.Invert(bedDoor.getWorldMatrix());
    const zs = dms.map((m) => { m.computeWorldMatrix(true); return B.Vector3.TransformCoordinates(m.getBoundingInfo().boundingBox.centerWorld, inv).z; });
    const mid = (Math.min(...zs) + Math.max(...zs)) / 2;
    doorNearMeshes = dms.filter((m, i) => zs[i] >= mid); doorFarMeshes = dms.filter((m, i) => zs[i] < mid);
    doorFarMeshes.forEach((m) => m.setEnabled(false)); // drop the open/2nd door by default
    fitDoor();
  } catch (e) { console.warn("door glb", e); }
}

// =====================================================================
// LIGHTS — outside sun raking through the glass, low fill, emissive points
// =====================================================================
const hemi = new B.HemisphericLight("hemi", new V3(0, 1, 0), scene);
hemi.intensity = 0.32; hemi.diffuse = C(0x8a96a8); hemi.groundColor = C(0x2a241c);
// golden-hour sun: az ~0.3 west, alt ~0.26 — position per world.js beam aiming
const az = 0.3, alt = 0.26;
// a DIRECTIONAL sun (parallel rays) so shadows run true like real sunlight — not fanned out from a spotlight
const sun = new B.DirectionalLight("sun", new V3(-Math.sin(az) * Math.cos(alt), -Math.sin(alt), Math.cos(az) * Math.cos(alt)).normalize(), scene);
sun.intensity = 3.4; sun.diffuse = C(0xfff0d8); sun.position = new V3(5, 8, -8); sun.autoUpdateExtends = true;
const shadow = new B.ShadowGenerator(2048, sun);
shadow.usePercentageCloserFiltering = true; shadow.filteringQuality = B.ShadowGenerator.QUALITY_HIGH; shadow.bias = 0.0016; shadow.normalBias = 0.035; shadow.darkness = 0.6; // soft, light shadows — the blinds diffuse the sun so nothing is harshly cast
// the CEILING LIGHT casts real shadows now — a downward SpotLight at the fixture (a spot, not the
// point lamp, because spots cast a clean single shadow map). intensity rides the dimmer (updateLamp).
const lampSpot = new B.SpotLight("lampSpot", new V3(0, H - 0.45, 0.4), new V3(0, -1, 0), 2.5, 1.2, scene); // from just under the fan's bulbs, shining down
lampSpot.diffuse = C(0xffe2b8); lampSpot.intensity = 0; lampSpot.range = 7; lampSpot.shadowMinZ = 0.2; lampSpot.shadowMaxZ = 6;
const lampShadow = new B.ShadowGenerator(1024, lampSpot);
lampShadow.usePercentageCloserFiltering = true; lampShadow.filteringQuality = B.ShadowGenerator.QUALITY_MEDIUM; lampShadow.bias = 0.002; lampShadow.normalBias = 0.03; lampShadow.darkness = 0.45;
const windowLight = new B.PointLight("winLight", new V3(0, 1.6, ZF + 0.6), scene); windowLight.diffuse = C(0xffe9c0); windowLight.intensity = 2.2; windowLight.range = 6.5; // reaches across the room so the spill fills it, not just the front
windowLight.excludedMeshes = [ceil]; // don't blast a bright sun-spot onto the ceiling right above the desk
const lavaLight = new B.PointLight("lavaLight", new V3(0, 0, 0), scene); lavaLight.parent = lava; lavaLight.position.set(0, 0.15, 0); lavaLight.diffuse = C(0xff8040); lavaLight.intensity = 0.85; lavaLight.range = 0.95;
const neonLight = new B.PointLight("neonLight", new V3(0, 1.62, 0.4), scene); neonLight.parent = entry; neonLight.diffuse = C(0xff4d2e); neonLight.intensity = 0; neonLight.range = 1.7; // off — the METRO sign is hidden (re-enable with the sign)
const screenGlow = new B.PointLight("screenGlow", new V3(0, 1.19, 0.1), scene); screenGlow.parent = desk; screenGlow.position.set(0, 0.45, 0.1); screenGlow.diffuse = C(0x8fb6ff); screenGlow.intensity = 1.7; screenGlow.range = 1.7;
// live monitor glow — the YouTube frame is a cross-origin iframe so its pixels can't be read;
// these drive a believable TV-flicker stand-in (brightness swells, scene cuts, slow hue drift)
const SG_BASE = screenGlow.intensity, SG_WARM = C(0xffb86c), SG_COOL = C(0x8cb6ff); // warm↔cool ends of the hue drift
let sgLevel = 1, sgCut = 0, sgFlash = 0, sgHue = 0.7, sgHueT = 0.7; // smoothed level, cut timer, decaying flash, drifting hue

// the bright sun disc outside, for the god-rays
// a round, soft sun glow (was a hard square that read as an obvious light panel through the window)
const sunGlowTex = dyn("sunGlow", 128, 128, (c, w, h) => { const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, "#ffffff"); g.addColorStop(0.4, "#cfcfcf"); g.addColorStop(1, "#000000"); c.fillStyle = g; c.fillRect(0, 0, w, h); });
const clampSun = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// keep the god-ray sun pinned INSIDE the window opening (so it's only ever seen through the glass, never bleeding over the wall).
// z = ZF - 0.14 puts it OUTSIDE, BEHIND the blinds + glass, so the blinds occlude it into shafts (the volumetric pass below).
const placeSun = (az2, alt2) => sunDisc.position.set(clampSun(Math.sin(az2) * 1.4, -1.1, 1.1), clampSun(1.0 + Math.tan(alt2) * 0.7, 1.05, 2.15), ZF - 0.14);
const sunDisc = B.MeshBuilder.CreateDisc("sunDisc", { radius: 0.3, tessellation: 40 }, scene); placeSun(az, alt);
const sunDiscMat = emis("sunDiscMat", 0xffffff, { glow: false }); sunDiscMat.emissiveTexture = sunGlowTex; sunDiscMat.emissiveColor = new B.Color3(1.35, 1.05, 0.72); sunDiscMat.alphaMode = B.Engine.ALPHA_ADD; sunDisc.material = sunDiscMat;
sunDisc.setEnabled(false); // retired — a small bright disc stood out against the 3D city; the window-wide emitter below replaces it

// THE VLS EMITTER — a window-WIDE plane behind the blinds, not a disc. low opacity so you still see
// the city / godzilla / plane through it, but the volumetric pass renders it bright white regardless,
// so the shafts stay strong. all four knobs are slider-controlled (arrange panel → GOD-RAYS).
let raysOpacity = 0.1, raysExposure = 0.42, raysDensity = 0.95, raysDecay = 0.965;
const rayEmitterMat = new B.StandardMaterial("rayEmitterMat", scene);
rayEmitterMat.disableLighting = true; rayEmitterMat.diffuseColor = new B.Color3(0, 0, 0); rayEmitterMat.emissiveColor = new B.Color3(1.2, 1.0, 0.72);
rayEmitterMat.alpha = raysOpacity; rayEmitterMat.transparencyMode = B.Material.MATERIAL_ALPHABLEND; rayEmitterMat.backFaceCulling = false; rayEmitterMat.applyFog = false;
const rayEmitter = plane("rayEmitter", WIN.w, WIN.h, rayEmitterMat); rayEmitter.position.set(WIN.cx, WIN.cy, ZF - 0.14); rayEmitter.isPickable = false; rayEmitter.applyFog = false;
let godrays = null; // the VolumetricLightScattering post-process (created after the camera); updateEnv rides its exposure on day/night
// the shafts follow the sun's brightness: full by day, gone at night / when the curtains are drawn. opacity is the
// visible wash over the window (low = see the city through it); exposure/density/decay shape the shafts (sliders).
function sunRays() {
  const e = sunDiscMat.emissiveColor, lum = (e.r + e.g + e.b) / 3;
  const df = Math.max(0, Math.min(1, (lum - 0.5) / 0.5)); // 0 at night AND under moonlight .. 1 full day (no moon shafts)
  rayEmitter.setEnabled(df > 0.03 && curtainOpen && !IS_TOUCH); // mobile has no god-ray pass → hide the emitter's window wash too
  rayEmitterMat.emissiveColor.copyFrom(e); rayEmitterMat.alpha = raysOpacity;
  if (godrays) { godrays.exposure = raysExposure * df; godrays.density = raysDensity; godrays.decay = raysDecay; }
}

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
  sunDiscMat.emissiveColor.set(m.disc[0], m.disc[1], m.disc[2]); sunRays();
  ip.exposure = m.exp;
  roomLamp.intensity = m.lamp;
  fixtureGlow.material.emissiveColor = m.lamp > 0.5 ? C(0xffe2b8) : C(0x222222);
}
// =====================================================================
// LIVE ENVIRONMENT — real day/night from your location, dynamic sky, astro, weather
// =====================================================================
const LAT = 33.9036, LNG = -118.3517;   // 11908 Truro Ave, Hawthorne CA 90250 — sun, moon & stars are computed for exactly here
const weather = { clouds: 0, rain: 0 };
let envAcc = 0;

// astro ceiling — tonight's REAL sky as glowing geometry. A flat painted texture reads
// as a dim smear on a ceiling at this distance; emissive beads bloom through the glow
// layer and read from across the room. Everything is placed by a fisheye look-up
// projection (zenith mid-ceiling, horizon at the walls) for THIS address. The window
// faces SOUTH (-z); facing it, west is +x — so a star due-south sits over the window,
// a star due-north over the back wall. Dusk fades it in, dawn takes it back.
const ASTRO_Y = H - 0.05, RX = (W - 0.5) / 2, RZ = (D - 0.5) / 2;
const astroGrp = node("astroGrp", 0, ASTRO_Y, 0);
astroGrp.setEnabled(false);

// az (from south, toward west) + alt → a local spot on the ceiling, null below horizon
function skyXZ(p) {
  if (p.altitude < 0.05) return null;
  const f = 1 - p.altitude / (Math.PI / 2);     // 0 at zenith, 1 at the horizon
  return { x: Math.sin(p.azimuth) * f * RX, z: -Math.cos(p.azimuth) * f * RZ };
}
function beadMat(name, hex, boost = 3) {
  const m = new B.StandardMaterial(name, scene);
  m.diffuseColor = new B.Color3(0, 0, 0); m.disableLighting = true;
  // emissive deliberately runs HOT (>1). ACES tone-mapping + the glow layer + pipeline
  // bloom (threshold 0.92) turn that into a bright, blooming point instead of a grey
  // speck — clamping to 1 was exactly why the stars vanished into the ceiling.
  const c = C(hex); m.emissiveColor = new B.Color3(c.r * boost, c.g * boost, c.b * boost);
  m._base = m.emissiveColor.clone();
  return m;
}
// little name tags that always face the camera (billboards), so the sky reads itself
function makeTag(text, size = 26) {
  const t = new B.DynamicTexture("tag_" + text, { width: 256, height: 64 }, scene, true);
  const g = t.getContext(); g.clearRect(0, 0, 256, 64);
  g.fillStyle = "rgba(206,218,242,0.95)"; g.font = "600 " + size + "px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, 128, 36); t.update(false); t.hasAlpha = true; t.vScale = -1; t.vOffset = 1; // un-flip (canvas y-down) so the text reads upright
  const m = new B.StandardMaterial("tagM_" + text, scene);
  m.diffuseColor = new B.Color3(0, 0, 0); m.disableLighting = true;
  m.diffuseTexture = t; m.emissiveTexture = t; m.useAlphaFromDiffuseTexture = true;
  m.transparencyMode = B.Material.MATERIAL_ALPHABLEND; m.backFaceCulling = false;
  const aspect = 256 / 64, hgt = 0.075;
  const p = B.MeshBuilder.CreatePlane("tag", { width: hgt * aspect, height: hgt }, scene);
  p.material = m; p.parent = astroGrp; p.isPickable = false; p.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
  return p;
}

// the 25 catalogue stars — a glowing bead each, sized by magnitude
const starBeads = STARS.map(([name, ra, dec, mag, tint], i) => {
  const dia = Math.max(0.011, 0.036 - mag * 0.005);        // small, slim points — like the stars in the original room
  const mult = Math.max(2.4, Math.min(5.5, 5.2 - mag * 0.5)); // hot, so the tiny core still reads + tints
  const s = B.MeshBuilder.CreateSphere("astar" + i, { diameter: dia, segments: 8 }, scene);
  s.material = beadMat("astarM" + i, parseInt(tint.slice(1), 16), mult); s.parent = astroGrp; s.isPickable = false;
  return { mesh: s, ra, dec };
});
// the five named stars get a tag
const NAMED = [[0, "sirius"], [2, "arcturus"], [3, "vega"], [10, "antares"], [17, "polaris"]];
const starTags = NAMED.map(([i, nm]) => ({ i, tag: makeTag(nm, 22) }));

// the naked-eye planets — fatter, hotter beads (recomputed each tick), each named
const PLANET_NAMES = ["mercury", "venus", "mars", "jupiter", "saturn"];
const planetBeads = PLANET_NAMES.map((nm, i) => {
  const s = B.MeshBuilder.CreateSphere("aplanet" + i, { diameter: 0.03, segments: 10 }, scene);
  s.material = beadMat("aplanetM" + i, 0xffffff, 4); s.parent = astroGrp; s.isPickable = false;
  return { mesh: s, tag: makeTag(nm, 24) };
});

// the moon — a glowing disc, dimmed by tonight's illuminated fraction
const moonBead = B.MeshBuilder.CreateSphere("amoon", { diameter: 0.09, segments: 16 }, scene);
moonBead.material = beadMat("amoonM", 0xeef2fa, 1.1); moonBead.parent = astroGrp; moonBead.isPickable = false;
const moonTag = makeTag("moon", 22);

// the Big Dipper, joined with thin glowing tubes (bowl, then the handle's curve)
const DIP_LINKS = [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]];
const dipTubes = DIP_LINKS.map((_, i) => {
  const t = B.MeshBuilder.CreateCylinder("adip" + i, { height: 1, diameter: 0.004, tessellation: 6 }, scene);
  t.material = beadMat("adipM" + i, 0x9fb6e8, 4); t.parent = astroGrp; t.isPickable = false; t.rotationQuaternion = B.Quaternion.Identity();
  return t;
});
const dipperTag = makeTag("the big dipper", 22);

// cardinal tags pinned at the horizon ring — n over the back wall, s over the window
const cardN = makeTag("n", 28); cardN.position.set(0, 0.02, RZ * 0.96);
const cardS = makeTag("s", 28); cardS.position.set(0, 0.02, -RZ * 0.96);
const cardW = makeTag("w", 28); cardW.position.set(RX * 0.96, 0.02, 0);
const cardE = makeTag("e", 28); cardE.position.set(-RX * 0.96, 0.02, 0);

// align a unit-tall cylinder to span from a to b (both local, y≈0)
const _ay = B.Axis.Y;
function aimTube(tube, a, b) {
  const dir = b.subtract(a), len = dir.length();
  if (len < 1e-4) { tube.setEnabled(false); return; }
  tube.setEnabled(true);
  tube.position.copyFrom(a.add(b).scale(0.5));
  tube.scaling.set(1, len, 1);
  const d = dir.scale(1 / len), axis = B.Vector3.Cross(_ay, d), al = axis.length();
  if (al < 1e-5) tube.rotationQuaternion = B.Quaternion.Identity();
  else tube.rotationQuaternion = B.Quaternion.RotationAxis(axis.scale(1 / al), Math.acos(Math.max(-1, Math.min(1, B.Vector3.Dot(_ay, d)))));
}
const _tmpA = new V3(), _tmpB = new V3();
function placeTag(tag, x, y, z, on) { tag.setEnabled(on); if (on) tag.position.set(x, y, z); }

// dusk fades it in, dawn takes it back; everything is re-placed for the live sky
function updateAstro(sunAlt) {
  const k = Math.max(0, Math.min(1, (-sunAlt * 57.3 - 4) / 6));
  astroGrp.setEnabled(k > 0.02);
  if (k <= 0.02) return;
  const now = new Date();
  const dipPos = [];   // the dipper's seven, in local coords (or null if down)

  starBeads.forEach((b, i) => {
    const p = skyXZ(getStarPosition(now, LAT, LNG, b.ra, b.dec));
    b.mesh.setEnabled(!!p);
    if (p) { b.mesh.position.set(p.x, 0, p.z); const e = b.mesh.material._base; b.mesh.material.emissiveColor.set(e.r * k, e.g * k, e.b * k); }
    if (i >= 18) dipPos[i - 18] = p ? new V3(p.x, 0, p.z) : null;
  });
  starTags.forEach(({ i, tag }) => { const e = starBeads[i].mesh; placeTag(tag, e.position.x, -0.07, e.position.z, e.isEnabled()); });

  DIP_LINKS.forEach(([a, c], i) => {
    if (dipPos[a] && dipPos[c]) aimTube(dipTubes[i], dipPos[a], dipPos[c]);
    else dipTubes[i].setEnabled(false);
  });
  if (dipPos[3] && dipPos[4]) placeTag(dipperTag, (dipPos[3].x + dipPos[4].x) / 2, -0.05, (dipPos[3].z + dipPos[4].z) / 2, true);
  else dipperTag.setEnabled(false);

  const planets = getPlanetPositions(now, LAT, LNG);
  planetBeads.forEach((pb, i) => {
    const p = skyXZ(planets[i]);
    pb.mesh.setEnabled(!!p);
    if (p) { pb.mesh.position.set(p.x, 0, p.z); const c = C(parseInt(planets[i].tint.slice(1), 16)), pm = 4.5 * k; pb.mesh.material.emissiveColor.set(c.r * pm, c.g * pm, c.b * pm); }
    placeTag(pb.tag, p ? p.x : 0, -0.07, p ? p.z : 0, !!p);
  });

  const mpos = skyXZ(getMoonPosition(now, LAT, LNG));
  moonBead.setEnabled(!!mpos);
  if (mpos) {
    moonBead.position.set(mpos.x, 0, mpos.z);
    const frac = getMoonIllumination(now).fraction, g = (2.6 + 2.4 * frac) * k;
    moonBead.material.emissiveColor.set(0.93 * g, 0.95 * g, 0.98 * g);
  }
  placeTag(moonTag, mpos ? mpos.x : 0, -0.12, mpos ? mpos.z : 0, !!mpos);
}

// the daylight driver — aims the sun/moon through the window and recolors everything
let autoMode = true;
function updateEnv(date) {
  if (!window.SunCalc) { applyMood(MOODS[0]); return; }
  const sp = SunCalc.getPosition(date, LAT, LNG), mp = SunCalc.getMoonPosition(date, LAT, LNG), mi = SunCalc.getMoonIllumination(date);
  const sunAlt = sp.altitude, moonAlt = mp.altitude, frac = mi.fraction;
  const useSun = sunAlt > -0.05;
  const az = Math.max(-0.9, Math.min(0.9, useSun ? sp.azimuth : mp.azimuth));
  const alt = Math.max(useSun ? sunAlt : moonAlt, 0.06);
  const skAlt = Math.max(sunAlt, 0.12), skd = Math.cos(skAlt); // keep the key light above the horizon so shadows stay sane at night
  sun.direction.set(-Math.sin(sp.azimuth) * skd, -Math.sin(skAlt), Math.cos(sp.azimuth) * skd);
  sun.position.copyFrom(sun.direction).scaleInPlace(-18); sun.position.y += 1; // shadow frustum sits up-sun of the room
  placeSun(az, alt); // clamped inside the window opening
  // phase → colors + (deliberately low-ambient) intensities, keeping light only from the window
  let beamC, beamI, winC, winI, hS, hG, hI, skyS, disc, lamp;
  if (sunAlt > 0) { const k = Math.sin(Math.min(sunAlt, 1.2)); beamC = 0xfff2da; beamI = 2.6 + 4.2 * k; winC = 0xfff0d8; winI = 1.4 + 1.6 * k; hS = 0xaebbd0; hG = 0x6a5e4c; hI = 0.12 + 0.08 * k; skyS = 0.85 + 0.15 * k; disc = [0.5 + 1.2 * k, 0.45 + 1.1 * k, 0.4 + 0.95 * k]; lamp = 0; }
  else if (sunAlt > -0.2) { const k = 1 + sunAlt / 0.2; beamC = 0xe8a060; beamI = 1.4 + 3.0 * k; winC = 0xd8915a; winI = 1.0 + 1.4 * k; hS = 0x9a8da0; hG = 0x4a4034; hI = 0.1 + 0.05 * k; skyS = 0.45 + 0.35 * k; disc = [0.4 + 1.0 * k, 0.28 + 0.7 * k, 0.2 + 0.5 * k]; lamp = 1.5 * (1 - k); }
  else if (moonAlt > 0) { const k = Math.sin(moonAlt) * frac; beamC = 0xbfd0ee; beamI = 0.4 + 1.4 * k; winC = 0x9fb6e8; winI = 0.3 + 1.0 * k; hS = 0x6a7890; hG = 0x2a241c; hI = 0.08; skyS = 0.16 + 0.12 * k; disc = [0.08 + 0.25 * k, 0.1 + 0.3 * k, 0.16 + 0.45 * k]; lamp = 4; }
  else { beamC = 0x7a7080; beamI = 0.08; winC = 0x8a7a9a; winI = 0.3; hS = 0x565e6e; hG = 0x241f18; hI = 0.07; skyS = 0.12; disc = [0.06, 0.07, 0.13]; lamp = 5; }
  const dim = Math.max(0.2, 1 - 0.6 * weather.clouds - (weather.rain ? 0.1 : 0));
  beamI *= dim; winI *= Math.max(0.4, 1 - 0.4 * weather.clouds);
  sun.diffuse = C(beamC); sunBase = beamI * 0.35; // blinds absorb most of the direct sun → just a soft key
  windowLight.diffuse = C(winC); winBase = winI * 1.3; // the soft daylight spilling in the window
  hemi.diffuse = C(hS); hemi.groundColor = C(hG); hemiBase = hI * 2.2 + 0.2; // strong even ambient (intensities applied per-frame ×curtain factor)
  sunDiscMat.emissiveColor.set(disc[0], disc[1], disc[2]); sunRays();
  skyMat.emissiveColor.set(0.6 * skyS, 0.59 * skyS, 0.58 * skyS);
  updateLamp(); // the room lamp is driven by the manual dimmer, not the day/night cycle
  ip.exposure = sunAlt > 0 ? 0.92 : sunAlt > -0.2 ? 0.95 : 1.04;
  const cd = Math.cos(sunAlt), mcd = Math.cos(moonAlt); // aim the dome's sun + moon where they really are (your LA coords)
  const sunV = new V3(Math.sin(sp.azimuth) * cd, Math.sin(sunAlt), -Math.cos(sp.azimuth) * cd).normalize();
  const moonV = new V3(Math.sin(mp.azimuth) * mcd, Math.sin(moonAlt), -Math.cos(mp.azimuth) * mcd).normalize();
  skyDomeMat.setVector3("sunDir", sunV); skyDomeMat.setFloat("sunAlt", sunAlt);
  skyDomeMat.setVector3("moonDir", moonV); skyDomeMat.setFloat("moonBright", (moonAlt > 0 ? 1 : 0) * (0.4 + 0.6 * frac));
  const fogDay = Math.max(0, Math.min(1, (sunAlt + 0.12) / 0.24)); // fog tracks the sky horizon so the city melts into it
  scene.fogColor.set(0.07 + 0.51 * fogDay, 0.08 + 0.64 * fogDay, 0.12 + 0.74 * fogDay); // night = a visible blue-grey haze (city glow)
  if (cityLight) { // light the city from whichever body is up; a bright-enough moon at night to cast soft shadows
    const moonUp = sunAlt <= -0.05 && moonAlt > 0;
    const bodyV = sunAlt > -0.05 ? sunV : (moonUp ? moonV : sunV);
    cityLight.direction = bodyV.scale(-1); cityLight.position = bodyV.scale(80).add(new V3(0, 0, ZF - 22));
    if (sunAlt > 0) { cityLight.diffuse = C(0xfff2da); cityLight.intensity = 1.4 + 1.6 * Math.sin(Math.min(sunAlt, 1.2)); }
    else if (moonUp) { cityLight.diffuse = C(0xaec6ee); cityLight.intensity = 0.6 + 1.1 * frac; } // moonlight + shadows
    else { cityLight.diffuse = C(0x8090a8); cityLight.intensity = 0.12; }
  }
  drawSky(sp.azimuth, sunAlt, moonAlt, frac, weather.clouds);
  rainPane.isVisible = weather.rain > 0; rainMat.alpha = weather.rain > 0 ? 0.55 : 0;
  updateAstro(sunAlt);
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
for (const m of casters) { try { if (m.material && m.material.disableLighting) continue; shadow.addShadowCaster(m, true); lampShadow.addShadowCaster(m, true); } catch {} } // both the sun and the ceiling light cast from the room's furniture

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
// =====================================================================
// MOBILE CONTROLS — left joystick to walk, drag to look, tap to interact (matches the three.js room).
// =====================================================================
// IS_TOUCH (primary pointer = touch) is computed at the top with the engine setup.
const joy = { x: 0, y: 0 };
let tapPick = null; // {x,y} while a tap is being resolved (touch); else null → use the crosshair/forward ray
function castRay(reach) { if (tapPick) { const r = scene.createPickingRay(tapPick.x, tapPick.y, B.Matrix.Identity(), camera); r.length = reach; return r; } return camera.getForwardRay(reach); }
if (IS_TOUCH) {
  // Babylon's built-in touch input only yaws + drives forward on drag — NO pitch. drop it and
  // roll our own drag-look (yaw + pitch), exactly like the three.js controls.js. pointer-lock /
  // mouse-look stay untouched for any desktop-with-touch hybrid.
  try { camera.inputs.removeByType("FreeCameraTouchInput"); } catch { }
  const joyEl = document.getElementById("joystick"), nub = document.getElementById("joystick-nub");
  if (joyEl) {
    joyEl.classList.add("show");
    let jp = null;
    joyEl.addEventListener("pointerdown", (e) => { jp = e.pointerId; joyEl.setPointerCapture(e.pointerId); e.preventDefault(); });
    joyEl.addEventListener("pointermove", (e) => { if (e.pointerId !== jp) return; const r = joyEl.getBoundingClientRect(); const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2); const len = Math.hypot(dx, dy) || 1, s = len > 1 ? 1 / len : 1; joy.x = dx * s; joy.y = dy * s; if (nub) nub.style.transform = `translate(calc(-50% + ${joy.x * 33}px), calc(-50% + ${joy.y * 33}px))`; });
    const jend = (e) => { if (e.pointerId !== jp) return; jp = null; joy.x = joy.y = 0; if (nub) nub.style.transform = "translate(-50%,-50%)"; };
    joyEl.addEventListener("pointerup", jend); joyEl.addEventListener("pointercancel", jend);
  }
  // drag anywhere on the canvas = look (yaw + pitch). a quick, near-still touch = interact at that point.
  const LOOK_K = 0.005, PITCH_MAX = 1.3;
  let look = null;
  canvas.addEventListener("pointerdown", (e) => { look = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; });
  canvas.addEventListener("pointermove", (e) => {
    if (!look || e.pointerId !== look.id) return;
    const dx = e.clientX - look.x, dy = e.clientY - look.y; look.x = e.clientX; look.y = e.clientY; look.moved += Math.abs(dx) + Math.abs(dy);
    camera.rotation.y -= dx * LOOK_K; // drag right → look right (RH: +y yaws left, so subtract)
    camera.rotation.x = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, camera.rotation.x - dy * LOOK_K)); // drag down → look down
  });
  const lookEnd = (e) => {
    if (!look || e.pointerId !== look.id) return;
    // a finger "tap" jitters more than a mouse click — be forgiving (≤22px of drift, ≤400ms) so taps on
    // the instruments/cat/notes actually register instead of being mistaken for a look-drag.
    if (entered && !editMode && !composerOpen && !pcOpen && performance.now() - look.t < 400 && look.moved < 22) { ensureAudio(); tapPick = { x: e.clientX, y: e.clientY }; try { doScenePick(); } catch (err) { } tapPick = null; }
    look = null;
  };
  canvas.addEventListener("pointerup", lookEnd); canvas.addEventListener("pointercancel", lookEnd);
}
// FIXED eye height — no gravity. the flat floor doesn't need it, and gravity+ellipsoid
// was making the camera CLIMB while walking (1.50 → 1.79). collisions stay on for walls/furniture.
camera.checkCollisions = true; camera.applyGravity = false;
// slimmer 0.3 bubble so you can step right up to the desk instead of being held back.
camera.ellipsoid = new V3(0.3, 0.9, 0.3); camera.ellipsoidOffset = new V3(0, -0.72, 0);
// FOV fit: Babylon's default vertical-fixed FOV squeezes the HORIZONTAL view to a zoomed-in sliver on a
// tall portrait phone — that's why everything (monitor, transport buttons, the city) reads "too big /
// stretched" on mobile. on portrait we widen it so the horizontal framing (~64°) looks like the desktop;
// landscape/desktop keep the tuned 1.18. recomputed on every resize/orientation change.
function fitFov() {
  const a = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight());
  if (a >= 1) { camera.fov = 1.18; return; }
  const HFOV = 1.12; // target horizontal field of view in portrait
  camera.fov = Math.min(1.95, 2 * Math.atan(Math.tan(HFOV / 2) / a));
}
fitFov();
// post pipeline, now that the camera exists
pipeline = new B.DefaultRenderingPipeline("pipeline", true, scene, [camera]);
pipeline.fxaaEnabled = true; pipeline.samples = 4; pipeline.bloomEnabled = true; pipeline.bloomThreshold = 0.85; pipeline.bloomWeight = 0.4; pipeline.bloomKernel = 64; pipeline.bloomScale = 0.6;
pipeline.bloomThreshold = 0.92; pipeline.bloomWeight = 0.15;
pipeline.imageProcessingEnabled = true; pipeline.imageProcessing.vignetteEnabled = true; pipeline.imageProcessing.vignetteWeight = 2.4; pipeline.imageProcessing.vignetteColor = new B.Color4(0, 0, 0, 0);
pipeline.grainEnabled = true; pipeline.grain.intensity = 6; pipeline.grain.animated = true; pipeline.sharpenEnabled = true; pipeline.sharpen.edgeAmount = 0.16;
try { if (!IS_TOUCH && B.SSAO2RenderingPipeline.IsSupported) { const ssao = new B.SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.75, blurRatio: 1 }, [camera]); ssao.radius = 0.4; ssao.totalStrength = 0.65; ssao.base = 0.2; ssao.samples = 16; ssao.expensiveBlur = true; } } catch (e) { console.warn("ssao", e); } // softer AO so corners aren't blotchy (skipped on mobile — too costly)
// GOD-RAYS — VolumetricLightScattering off the window sun disc. it renders the disc bright and
// everything else black, then radial-blurs outward from the disc → real light shafts. the BLINDS
// stay as occluders (they chop it into slats); the GLASS + rain are excluded so light passes
// through them. exposure rides the day/night cycle in updateEnv (0 at night). one extra pass.
// skipped on mobile entirely — the 80-sample volumetric pass is the single most expensive thing in the
// scene, and on a phone GPU it tanks the framerate. (rayEmitter wash is also hidden on mobile in sunRays.)
if (!IS_TOUCH) try {
  godrays = new B.VolumetricLightScatteringPostProcess("godrays", 1.0, camera, rayEmitter, 80, B.Texture.BILINEAR_SAMPLINGMODE, engine, false, scene);
  godrays.exposure = raysExposure; godrays.decay = raysDecay; godrays.weight = 0.5; godrays.density = raysDensity;
  godrays.excludedMeshes = [glassFront, rainPane]; // light passes through the glass; blinds/frame/walls stay as occluders
} catch (e) { console.warn("godrays", e); }

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
let persistFx = () => {}; // set in setupEditor; lets the dimmer drag + METRO_BJS.saveSettings() persist too
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
  // jets on the LAX approach: advance the crossing (or the long fall), repaint the sky as it moves
  if (planeT >= 0) {
    if (planeShot) { planeShot.age += dt; if (planeShot.age > 4.5) { planeT = -1; plane01 = null; planeShot = null; } } // it fell out of the sky
    else { planeT += dt; plane01 = planeT / PLANE_DUR; if (plane01 >= 1) { planeT = -1; plane01 = null; } }
  } else {                                  // between flyovers — keep ambient traffic (with a flight strip) filling any gap, even when the feed is "live" but quiet
    nextPlaneAt -= dt;
    if (nextPlaneAt <= 0) { nextPlaneAt = 180 + Math.random() * 300; ambientFlyover(); }
  }
  updatePlane3D(); // position/hide the 3D jet
  updateGodzilla(dt); // timed cameo: fade in, loom ~6s, fade out
  // curtains: glide open/closed and gate the window light (drawn = blackout → room goes dark)
  const ctX = curtainOpen ? 0.5 : 2.3, ctM = curtainOpen ? 1 : 0.12;
  curtX += (ctX - curtX) * Math.min(1, dt * 3); curtMul += (ctM - curtMul) * Math.min(1, dt * 3);
  curtPivots.forEach((p) => { p.scaling.x = curtX; });
  sun.intensity = sunBase * curtMul; windowLight.intensity = winBase * curtMul;
  hemi.intensity = hemiBase * (0.2 + 0.8 * curtMul); scene.environmentIntensity = 0.5 * (0.2 + 0.8 * curtMul);
  // lava blobs
  for (const b of blobs) { const k = Math.sin(T * b._speed + b._phase); b.position.y = 0.10 + (k * 0.5 + 0.5) * 0.085; b.position.x = Math.sin(T * b._speed * 0.7 + b._phase * 2) * 0.012; b.position.z = Math.cos(T * b._speed * 0.6 + b._phase) * 0.012; b.scaling.y = 1 + 0.35 * Math.sin(T * b._speed * 1.9 + b._phase); }
  lavaLight.intensity = 0.8 + 0.12 * Math.sin(T * 0.9);
  // neon breathe + rare flicker
  const nb = 2.0 + Math.sin(T * 3) * 0.2 + (Math.random() < 0.008 ? -1.4 : 0); neonMat.emissiveColor.set(nb * 1.1, nb * 0.28, nb * 0.18);
  // radio LED breathes while it's locking onto a station
  if (radioState === "tuning") { const k = 0.6 + 0.4 * Math.sin(T * 9); radioLedMat.emissiveColor.set(k, k * 0.62, k * 0.12); radioGlow.intensity = 0.25 + 0.25 * k; }
  // instrument feedback: strummed strings shiver, hit pads bob down then spring back
  if (strumFx > 0) { strumFx = Math.max(0, strumFx - dt); for (let i = 0; i < 3; i++) { const s = scene.getMeshByName("teleStr" + i); if (s) s.rotation.z = Math.sin(T * 90 + i) * strumFx * 0.12; } }
  if (keyFx > 0) { keyFx = Math.max(0, keyFx - dt); if (keyGlow) keyGlow.visibility = keyFx / 0.16; }
  for (let i = btnFx.length - 1; i >= 0; i--) { const b = btnFx[i]; b.t -= dt; const k = Math.max(0, b.t / 0.22); const base = b.cap ? (b.cap._baseSY ?? 1) : 1; if (b.cap) { b.cap.scaling.y = base * (1 + k); b.cap.material.emissiveColor = C(b.hue).scale(0.4 + 0.6 * k); } if (b.t <= 0) { if (b.cap) b.cap.scaling.y = base; btnFx.splice(i, 1); } } // base = local scale after the cap is parented under the (scaled) controller
  for (let i = drumFx.length - 1; i >= 0; i--) { const f = drumFx[i]; f.t -= dt; const k = Math.max(0, f.t / 0.12); if (f.node) f.node.scaling.y = 1 - k * (f.amt ?? 0.4); if (f.t <= 0) { if (f.node) f.node.scaling.y = 1; drumFx.splice(i, 1); } }
  // MPC pads: flash bright on strike, fade back to the faint backlight
  for (let i = mpcFx.length - 1; i >= 0; i--) { const f = mpcFx[i]; f.t -= dt; const k = Math.max(0, f.t / 0.18); const m = f.mesh; if (m && m.material && m._mpcGlow) B.Color3.LerpToRef(m._mpcIdle, m._mpcGlow, k, m.material.emissiveColor); if (f.t <= 0) { if (m && m.material && m._mpcIdle) m.material.emissiveColor.copyFrom(m._mpcIdle); mpcFx.splice(i, 1); } }
  if (fanOn) { fanAngle += dt * 3.6; fanSpin.rotation.y = fanAngle; } // the ceiling fan turns
  updateProjector(dt); // roll the projector screen down/up
  // cat update
  updateCat(dt);
  updateFetchToy(dt); // the felt mouse: held / thrown / carried back by the cat
  // dirty floor + vacuum: you and the cat grind dirt in; the nozzle lifts it
  if (entered) {
    if (!vacHeld) floorTraffic(camera.position.x, camera.position.z, dt, 1);
    floorTraffic(catGrp.position.x, catGrp.position.z, dt, 0.6);
    if (vacHeld) vacuumStep(camera.position.x, camera.position.z);
    if (grimeDirty && T - grimeUpAt > 0.1) { grimeUpAt = T; grimeDirty = false; grimeTex.update(); }
    if (grimeSaveDirty && T - grimeSaveAt > 8) { grimeSaveAt = T; saveGrime(); } // debounced persist
  }
  skyDomeMat.setFloat("time", T); // twinkle the stars
  updateYTScreen(); // keep the YouTube overlay glued to the monitor
  updateProjScreen(); // and the projector's video glued to the screen when it's down
  updateVideoAudio(dt); // playlist is the default audio; radio takes over when on
  // live monitor glow: react like real TV light (can't sample the cross-origin video → simulate)
  if (entered && !ytPaused) { // a paused screen holds a steady frame; a playing one flickers
    let target = 1.0 + 0.30 * Math.sin(T * 0.5) + 0.16 * Math.sin(T * 1.7 + 1.3) + 0.07 * Math.sin(T * 6.0); // slow loudness + motion + fine flicker
    sgCut -= dt;
    if (sgCut <= 0) { sgCut = 0.7 + Math.random() * 3.5; sgFlash = Math.random() < 0.4 ? 0.5 + Math.random() * 0.8 : -Math.random() * 0.4; } // occasional cut/flash (scene change, explosion, fade-to-dark)
    sgFlash *= Math.max(0, 1 - dt * 4); // flash decays fast
    target = Math.min(1.9, Math.max(0.25, target + sgFlash));
    sgLevel += (target - sgLevel) * Math.min(1, dt * 9);
    sgHueT += (Math.random() - 0.5) * dt * 0.5; sgHueT = Math.min(0.95, Math.max(0.05, sgHueT)); // slow drift across TV palettes
    sgHue += (sgHueT - sgHue) * Math.min(1, dt * 0.6);
  } else {
    sgLevel += (0.7 - sgLevel) * Math.min(1, dt * 3); // settle to a calm steady glow when paused
  }
  screenGlow.intensity = SG_BASE * sgLevel;
  B.Color3.LerpToRef(SG_WARM, SG_COOL, sgHue, screenGlow.diffuse); // warm scenes ↔ cool night scenes
  // hearts
  for (let i = hearts.length - 1; i >= 0; i--) { const h = hearts[i]; h._life -= dt; if (h._life <= 0) { h.dispose(); hearts.splice(i, 1); continue; } h.position.y += dt * 0.35; h.position.x += h._vx * dt; h.material.alpha = Math.min(1, h._life / 0.8); }
  // mobile joystick walk: feed the camera's OWN move pipeline (cameraDirection) so we inherit
  // its wall collisions + inertia exactly like WASD. getForwardRay is the true forward in this
  // right-handed scene (camera.getDirection(Z) / view-local +Z both point BACKWARD here).
  if (IS_TOUCH && (joy.x || joy.y)) {
    const sp = (camera._computeLocalCameraSpeed ? camera._computeLocalCameraSpeed() : camera.speed);
    const fwd = camera.getForwardRay().direction; fwd.y = 0;
    if (fwd.lengthSquared() > 1e-4) {
      fwd.normalize();
      const right = B.Vector3.Cross(fwd, B.Axis.Y); right.normalize(); // screen-right
      const disp = fwd.scale(-joy.y * sp).add(right.scale(joy.x * sp)); // stick up (joy.y<0) → forward
      camera.cameraDirection.addInPlace(disp);
    }
  }
  // pin the eye height — collisions can only push horizontally, never lift you
  if (scene.activeCamera) scene.activeCamera.position.y = EYE_H;
});

function updateCat(dt) {
  const cs = catState;
  updateYarn(dt);                                                    // roll the toy; if play is on, glue the cat's target to it
  catMeowTimer -= dt; if (catMeowTimer <= 0) { catMeowTimer = 45 + Math.random() * 105; catVoice("chirp"); } // the occasional idle meow
  if (cs.chore === "fetch_back") { // carry the mouse back to wherever you've wandered — but don't chase forever
    cs.tx = camera.position.x; cs.tz = camera.position.z;
    cs.carryT = (cs.carryT || 0) + dt;
    if (cs.carryT > 5) { dropToy(catGrp.position.x, catGrp.position.z); cs.chore = null; cs.walking = false; cs.dwell = 2 + Math.random() * 3; } // gave up chasing you — sets it down where it stands
  }
  const brisk = cs.chore === "play" || cs.chore === "fetch_go" || cs.chore === "fetch_back"; // scamper, don't stroll
  if (cs.walking) {
    const dx = cs.tx - catGrp.position.x, dz = cs.tz - catGrp.position.z; const dist = Math.hypot(dx, dz);
    const reach = cs.chore === "fetch_back" ? 0.7 : (brisk ? 0.16 : 0.06); // drop the mouse a step away from you, not on your shoes
    if (dist < reach) {
      cs.walking = false;
      if (cs.chore === "play") { batYarn(); }                        // swat the ball — it skitters off and the chase resets
      else if (cs.chore === "fetch_go") { toy.phase = "carry"; cs.chore = "fetch_back"; cs.carryT = 0; cs.walking = true; cs.dwell = 0; catVoice("chirp"); } // grab it in the mouth, trot back
      else if (cs.chore === "fetch_back") { dropToy(); cs.chore = null; cs.dwell = 2 + Math.random() * 3; } // set it down for another throw
      else if (cs.chore) { doChore(cs.chore); cs.chore = null; cs.dwell = 2.5 + Math.random() * 2; } // pause to eat / drink / dig
      else cs.dwell = 4 + Math.random() * 10;
    }
    else { const want = Math.atan2(dx, dz); let dy = want - cs.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; cs.yaw += dy * Math.min(1, dt * 6); const spd = brisk ? 0.85 : 0.5; catGrp.position.x += (dx / dist) * spd * dt; catGrp.position.z += (dz / dist) * spd * dt; } // a pounce/scamper is faster than a stroll
  } else {
    cs.dwell -= dt;
    if (cs.dwell <= 0) {
      const chore = pickChore(); // a due need wins over an idle wander — the cat goes to take care of itself
      if (chore) { const t = choreTarget(chore.kind); cs.chore = chore.action; cs.tx = t.x; cs.tz = t.z; cs.ty = 0; cs.walking = true; }
      else { cs.chore = null; const spot = catSpots[Math.floor(Math.random() * catSpots.length)]; cs.tx = spot.x; cs.tz = spot.z; cs.ty = spot.y; cs.walking = true; }
    }
  }
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
  // the model's idle clip plays at rest; an authored leg gait drives the bones while moving
  if (catModel) {
    catModel.position.y = catBaseY + (cs.walking ? Math.abs(Math.sin(T * 10)) * 0.02 : 0); // a little trot-bob while walking; the idle clip handles the resting motion
    catModel.rotation.z = cs.walking ? Math.sin(T * 10) * 0.05 : 0;                        // gentle waddle (rotation.y holds the facing)
  }
  if (catWalkBones) {
    if (cs.walking && !catWalking) { catWalking = true; if (catAnimIdle) catAnimIdle.stop(); for (const k in catWalkBones) if (catWalkBones[k]) catWalkBones[k]._sw = 0; } // hand the legs to the gait
    else if (!cs.walking && catWalking) { catWalking = false; if (catAnimIdle) catAnimIdle.start(true, 0.5); }                                                            // hand them back to the idle clip
    if (catWalking) { const amp = 0.5, sp = 11, a = Math.sin(T * sp) * amp, c = Math.sin(T * sp + Math.PI) * amp; swingBone(catWalkBones.fl, a); swingBone(catWalkBones.hr, a); swingBone(catWalkBones.fr, c); swingBone(catWalkBones.hl, c); } // diagonal trot: FL+HR ↔ FR+HL
  }
}

// poke the yarn (player clicked it): give it a skitter in a random-ish direction and send
// the cat after it. needs are paused while playing — the player asked for play.
function pokeYarn(awayFrom) {
  if (toy.phase === "carry") dropToy(catGrp.position.x, catGrp.position.z); // drop the mouse first — can't carry it AND chase the yarn
  else if (toy.phase === "claimed") toy.phase = "rest";                    // abandon an un-fetched mouse cleanly (stays grabbable)
  const a = awayFrom ? Math.atan2(yarn.position.x - awayFrom.x, yarn.position.z - awayFrom.z) + (Math.random() - 0.5) * 1.2 : Math.random() * Math.PI * 2;
  const spd = 1.3 + Math.random() * 0.7;
  yarnVel.x = Math.sin(a) * spd; yarnVel.z = Math.cos(a) * spd; aimYarnInward();
  yarnActive = true; yarnBats = 4 + Math.floor(Math.random() * 3);   // how many swats before the cat gets bored
  catState.chore = "play"; catState.tx = yarn.position.x; catState.tz = yarn.position.z; catState.ty = 0; catState.walking = true; catState.dwell = 0;
  catVoice("chirp");
}
// keep a skitter pointed into the open room when the ball is near a wall, so it can't keep wedging into a corner
function aimYarnInward() {
  const m = 0.7;
  if (yarn.position.x < -2.3 + m && yarnVel.x < 0) yarnVel.x = Math.abs(yarnVel.x);
  if (yarn.position.x > 2.3 - m && yarnVel.x > 0) yarnVel.x = -Math.abs(yarnVel.x);
  if (yarn.position.z < -2.9 + m && yarnVel.z < 0) yarnVel.z = Math.abs(yarnVel.z);
  if (yarn.position.z > 3.0 - m && yarnVel.z > 0) yarnVel.z = -Math.abs(yarnVel.z);
}
// the cat caught up and swatted it: a heart, a chirp, and the ball rolls off again (until it's bored)
function batYarn() {
  popHearts(); catVoice("chirp"); yarnBats--;
  if (yarnBats > 0) { const a = Math.atan2(yarn.position.x - catGrp.position.x, yarn.position.z - catGrp.position.z) + (Math.random() - 0.5); const spd = 1.0 + Math.random() * 0.9; yarnVel.x = Math.sin(a) * spd; yarnVel.z = Math.cos(a) * spd; aimYarnInward(); catState.chore = "play"; catState.walking = true; catState.dwell = 0; }
  else { yarnActive = false; catState.chore = null; catState.dwell = 2 + Math.random() * 3; } // done playing — back to wandering
}
// roll the yarn under its own momentum (linear friction, bounces off the room bounds) and keep
// the chasing cat's target glued to it
function updateYarn(dt) {
  if (yarnVel.x || yarnVel.z) {
    yarn.position.x += yarnVel.x * dt; yarn.position.z += yarnVel.z * dt;
    if (yarn.position.x < -2.3) { yarn.position.x = -2.3; yarnVel.x = Math.abs(yarnVel.x) * 0.5; }
    if (yarn.position.x > 2.3) { yarn.position.x = 2.3; yarnVel.x = -Math.abs(yarnVel.x) * 0.5; }
    if (yarn.position.z < -2.9) { yarn.position.z = -2.9; yarnVel.z = Math.abs(yarnVel.z) * 0.5; }
    if (yarn.position.z > 3.0) { yarn.position.z = 3.0; yarnVel.z = -Math.abs(yarnVel.z) * 0.5; }
    keepOutOfLitter(yarn.position, yarnVel); // never let it roll into the litter box
    yarnBall.rotation.x += yarnVel.z * dt * 9; yarnBall.rotation.z -= yarnVel.x * dt * 9; // looks like it's rolling
    const fr = Math.max(0, 1 - dt * 3.2); yarnVel.x *= fr; yarnVel.z *= fr;
    if (Math.hypot(yarnVel.x, yarnVel.z) < 0.04) { yarnVel.x = 0; yarnVel.z = 0; }
  }
  if (yarnActive && catState.chore === "play") { catState.tx = yarn.position.x; catState.tz = yarn.position.z; catState.walking = true; }
}
// the cat's voice — the SAME meow/purr the three.js room uses: the real recorded clips
// (assets/audio/cat-meow.mp3 / cat-purr.mp3) reshaped per-play so no two are identical.
// loaded into the room's own AC; a synth covers until they decode (and forever if fetch fails).
let catMeowBuf = null, catPurrBuf = null, catSamplesLoading = false;
async function loadCatSamples() {
  if (catSamplesLoading || !AC) return; catSamplesLoading = true;
  const decode = (arr) => new Promise((ok, no) => AC.decodeAudioData(arr, ok, no)); // callback form for Safari
  try { catMeowBuf = await decode(await fetch("/assets/audio/cat-meow.mp3").then(r => r.arrayBuffer())); } catch (e) { /* synth covers */ }
  try { catPurrBuf = await decode(await fetch("/assets/audio/cat-purr.mp3").then(r => r.arrayBuffer())); } catch (e) { /* synth covers */ }
}
// play a reshaped clip (rate = pitch+length together), dry to master + a touch of room reverb. ported from ambience.playSample.
function playCatSample(buf, { rate = 1, gain = 0.5, attack = 0.01, release = 0.08, dur = null, offset = 0 } = {}) {
  if (!AC || !buf) return; const t = AC.currentTime;
  const src = AC.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
  const g = AC.createGain(); src.connect(g); g.connect(master);
  if (verbSend) { const sg = AC.createGain(); sg.gain.value = 0.12; g.connect(sg); sg.connect(verbSend); }
  const play = dur != null ? dur : buf.duration / rate - offset, rel = Math.min(release, play * 0.5);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.setValueAtTime(gain, t + Math.max(attack, play - rel)); g.gain.exponentialRampToValueAtTime(0.0001, t + play);
  src.start(t, offset); src.stop(t + play + 0.05);
}
function catVoice(kind) {
  if (!AC || !master) return; const t = AC.currentTime;
  if (kind === "purr") {
    if (catPurrBuf) { const offset = 0.6 + Math.random() * 1.2, rate = 0.9 + Math.random() * 0.18; const dur = Math.min(2.0, (catPurrBuf.duration - offset - 0.1) / rate); return playCatSample(catPurrBuf, { rate, gain: 0.5 + Math.random() * 0.12, attack: 0.14, release: 0.3, dur, offset }); }
    const o = AC.createOscillator(); o.type = "sawtooth"; o.frequency.value = 55; // synth fallback
    const lp = AC.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 320;
    const g = AC.createGain(); g.gain.value = 0.0001;
    const trem = AC.createOscillator(); trem.type = "sine"; trem.frequency.value = 26; const tg = AC.createGain(); tg.gain.value = 0.05; trem.connect(tg); tg.connect(g.gain);
    o.connect(lp); lp.connect(g); g.connect(master);
    g.gain.linearRampToValueAtTime(0.07, t + 0.18); g.gain.setValueAtTime(0.07, t + 0.95); g.gain.linearRampToValueAtTime(0, t + 1.35);
    o.start(t); trem.start(t); o.stop(t + 1.4); trem.stop(t + 1.4);
  } else { // chirp / meow — the everyday-meow shapes from ambience.meow() (no dur cap → the whole clip plays, never cut short)
    if (catMeowBuf) { const rates = [0.85, 0.95, 1.0, 1.08, 1.2]; const r = rates[Math.floor(Math.random() * rates.length)]; return playCatSample(catMeowBuf, { rate: r * (0.96 + Math.random() * 0.08), gain: 0.4 + Math.random() * 0.1, attack: 0.008, release: 0.12 }); }
    const o = AC.createOscillator(); o.type = "triangle"; const g = AC.createGain(); g.gain.value = 0.0001; o.connect(g); g.connect(master); // synth fallback
    o.frequency.setValueAtTime(720, t); o.frequency.exponentialRampToValueAtTime(1120, t + 0.07); o.frequency.exponentialRampToValueAtTime(540, t + 0.22);
    g.gain.linearRampToValueAtTime(0.11, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.start(t); o.stop(t + 0.3);
  }
}

// which need (if any) is due AND serviceable right now — eat/drink only when the bowl
// has something in it (an empty bowl is left alone; fed/hydrated drain — "the room let it down")
function pickChore() {
  const d = catNeeds;
  if (d.hungry && d.food > 0.05) return { action: "eat", kind: "food" };
  if (d.thirsty && d.water > 0.05) return { action: "drink", kind: "water" };
  if (d.bathroom) return { action: "bathroom", kind: "litter" };
  return null;
}
// stand ~0.4 m off the bowl toward room-center so the cat faces it instead of standing in it
function choreTarget(kind) {
  const b = careBowls[kind]; const p = b ? b.pivot.position : { x: 0.2, z: 0 };
  const dx = 0.2 - p.x, len = Math.abs(dx) || 1;
  return { x: p.x + (dx / len) * 0.4, z: p.z };
}
// the cat acts on its bowl — store.catCare draws the level down + reschedules the timer,
// which flows back through onCatState → applyCatNeeds → the bowl visual drops
function doChore(action) {
  store.catCare(action).then((res) => {
    if (!res) return;
    applyCatNeeds(res);
    if (res.ok === false && (action === "eat" || action === "drink")) flashHint("the cat sniffs an empty bowl…");
  }).catch(() => {});
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
  const dir = camera.getForwardRay().direction; // true forward (scene is right-handed; getDirection(Z) points backward)
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
let AC = null, master = null, verbSend = null, chorusIn = null, cityVolGain = null;
let videoVol = 0.85, radioVol = 0.9, cityVol = 0.6; // per-source volume sliders (0..1), persisted
function ensureAudio() {
  if (AC) { if (AC.state === "suspended") AC.resume(); return AC; }
  AC = new (window.AudioContext || window.webkitAudioContext)();
  master = AC.createGain(); master.gain.value = 0.7;
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
  loadDumbekSamples(); // start pulling the dumbek samples in the background on this first gesture
  loadCatSamples();    // and the cat's real meow + purr
  startCityAmbience();  // the city outside, heard muffled through the glass
  return AC;
}
// a synthesized "sound of the city" bed — distant traffic rumble, lowpassed so it reads as through-the-window,
// with a slow swell so it ebbs and flows. no audio files (matches the scene's all-synth audio).
function startCityAmbience() {
  const src = noiseBuf(3); src.loop = true;
  const hp = AC.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 70;
  const lp = AC.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 360; lp.Q.value = 0.4; // muffled, distant
  const swell = AC.createGain(); swell.gain.value = 0.1;           // base bed (the LFO swells this)
  cityVolGain = AC.createGain(); cityVolGain.gain.value = cityVol;  // the city volume slider
  src.connect(hp); hp.connect(lp); lp.connect(swell); swell.connect(cityVolGain); cityVolGain.connect(master);
  const lfo = AC.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.05; // ~20s traffic swell
  const lg = AC.createGain(); lg.gain.value = 0.04; lfo.connect(lg); lg.connect(swell.gain); lfo.start();
  src.start();
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
// MPC-style drum-machine voices (punchy 808/909-ish, all synth) — one per pad
function mpcVoice(sound, vel = 1) {
  const ac = ensureAudio(), t = ac.currentTime, V = vel;
  const tone = (type, f0, f1, dur, g0, wet) => { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur * 0.6); const g = ac.createGain(); g.gain.setValueAtTime(g0 * V, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); out(g, wet); o.start(t); o.stop(t + dur + 0.02); };
  const nz = (dur, type, freq, Q, g0, wet) => { const s = noiseBuf(dur), f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (Q) f.Q.value = Q; const g = ac.createGain(); g.gain.setValueAtTime(g0 * V, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f); f.connect(g); out(g, wet); s.start(t); };
  switch (sound) {
    case "kick": tone("sine", 160, 45, 0.26, 1.0, 0.05); break;
    case "sub": tone("sine", 110, 38, 0.44, 1.0, 0.04); break;
    case "snare": nz(0.18, "highpass", 1500, 0.7, 0.7, 0.2); tone("triangle", 185, null, 0.12, 0.45, 0.1); break;
    case "snare2": nz(0.12, "highpass", 2200, 0.7, 0.6, 0.18); tone("triangle", 240, null, 0.09, 0.35, 0.08); break;
    case "rim": tone("square", 440, null, 0.03, 0.5, 0.12); nz(0.03, "bandpass", 1700, 6, 0.3, 0.1); break;
    case "clap": [0, 0.012, 0.024, 0.05].forEach(d => { const s = noiseBuf(0.12), f = ac.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1100; f.Q.value = 1.5; const g = ac.createGain(); g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.5 * V, t + d + 0.001); g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.1); s.connect(f); f.connect(g); out(g, 0.22); s.start(t + d); }); break;
    case "hatC": nz(0.045, "highpass", 8500, 0, 0.32, 0.04); break;
    case "hatO": nz(0.28, "highpass", 8000, 0, 0.26, 0.06); break;
    case "tomL": tone("sine", 150, 95, 0.3, 0.8, 0.16); break;
    case "tomM": tone("sine", 210, 135, 0.26, 0.8, 0.16); break;
    case "tomH": tone("sine", 290, 190, 0.22, 0.8, 0.14); break;
    case "cowbell": tone("square", 540, null, 0.18, 0.3, 0.1); tone("square", 800, null, 0.18, 0.25, 0.1); break;
    case "clave": tone("sine", 1180, null, 0.05, 0.6, 0.12); break;
    case "shaker": nz(0.06, "highpass", 6000, 0, 0.25, 0.05); break;
    case "crash": nz(0.7, "highpass", 6000, 0, 0.4, 0.3); nz(0.7, "bandpass", 9000, 0.5, 0.25, 0.3); break;
    case "perc": tone("triangle", 520, 300, 0.14, 0.45, 0.14); break;
    default: tone("sine", 160, 45, 0.26, 1.0, 0.05);
  }
}
// THE DUMBEK — a goblet/hand drum voiced by the user's OWN 77 sample hits (recorded
// Aug 2015). 48k mono one-shots, lazy-loaded into AudioBuffers; a random one per strike,
// dry + the room reverb. Files: assets/audio/dumbek/dumbek-01.wav … -77.wav.
const DUMBEK_N = 77;
const dumbekBufs = []; let dumbekLoading = false;
async function loadDumbekSamples() {
  if (dumbekLoading || !AC) return; dumbekLoading = true;
  const decode = (arr) => new Promise((ok, no) => AC.decodeAudioData(arr, ok, no)); // callback form for Safari
  const url = (i) => `/assets/audio/dumbek/dumbek-${String(i + 1).padStart(2, "0")}.wav`; // absolute — the page lives at /babylon/
  let next = 0;
  const worker = async () => {
    while (next < DUMBEK_N) {
      const i = next++;
      try { dumbekBufs[i] = await decode(await fetch(url(i)).then(r => r.arrayBuffer())); }
      catch (e) { /* skip a sample that won't fetch/decode */ }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker)); // 6 in flight; ~2.7MB total, tiny files
}
function hitDumbek() {
  const ac = ensureAudio();
  const loaded = dumbekBufs.filter(Boolean);
  if (!loaded.length) { loadDumbekSamples(); return; }     // still warming up — let this tap pass
  const src = ac.createBufferSource(); src.buffer = loaded[(Math.random() * loaded.length) | 0];
  const g = ac.createGain(); g.gain.value = 0.72 + Math.random() * 0.28; // a little hit-to-hit dynamics
  src.connect(g); out(g, 0.24); src.start(ac.currentTime);  // dry + the drum reverb
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
function flashBtn(cap, hue) { if (!cap) return; if (cap._baseSY == null) cap._baseSY = cap.scaling.y; cap.material.emissiveColor = C(hue); cap.scaling.y = cap._baseSY * 2.0; btnFx.push({ cap, hue, t: 0.22 }); }
function setupInstruments() {
  const tag = (mesh, info) => { if (mesh) mesh._instr = info; };
  // guitar: click anywhere along the Tele — position picks the note (carry the node for the math)
  const teleNode = scene.getTransformNodeByName("tele"); if (teleNode) teleNode.getChildMeshes().forEach(m => tag(m, { type: "guitar", tele: teleNode }));
  // KEYS: an invisible forgiving pad over the GLB controller's FRONT key strip only (not the
  // pads/knobs on the top panel). pitch by where you click left→right; the pressed key lights up.
  const midiRoot = deskProps.midi;
  if (midiRoot) {
    const midiExtras = []; // the procedural overlays (screen, buttons, key pad) — parented to the controller below so arrange-mode moves the whole unit
    // the overlay coords below are hand-calibrated for the controller's DEFAULT placement; if a saved layout
    // already moved it, measure/place/parent at default first, then restore — otherwise the buttons bake in
    // at the old default spot and end up detached from the moved controller.
    const midiSaved = nodeXform(midiRoot);
    if (DEFAULT_LAYOUT.midi) { applyXform(midiRoot, DEFAULT_LAYOUT.midi); midiRoot.computeWorldMatrix(true); midiRoot.getChildMeshes(false).forEach((m) => m.computeWorldMatrix(true)); }
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
    midiExtras.push(pad, keyGlow);
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
      sQuad.position.set(sxc, sb.maximumWorld.y + 0.0008, sz); sQuad.isPickable = false; midiExtras.push(sQuad);
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
      midiExtras.push(cap, ppad);
    };
    const amber = 0xffae3b, cyan = 0x3bd6ff, lx = sxc - 0.018, rx = sxc + 0.018; // a pair straddling the screen centre
    mkBtn("scDn", lx, -2.352, amber, "scaleDown"); mkBtn("scUp", rx, -2.352, amber, "scaleUp");
    mkBtn("ocDn", lx, -2.322, cyan, "octDown");  mkBtn("ocUp", rx, -2.322, cyan, "octUp");
    // parent every overlay to the controller so arrange-mode grabs/moves the WHOLE unit (screen + buttons + keys).
    // setParent preserves world transform; _baseSY caches each cap's post-parent local scale for the press-bounce.
    const midiEd = editables.find((e) => e.name === "midi");
    midiExtras.forEach((m) => { if (!m) return; m.setParent(midiRoot); m._baseSY = m.scaling.y; if (midiEd && m !== keyGlow) { m._editable = midiEd; m.isPickable = true; } }); // keyGlow stays unpickable so it never blocks a key/button click in play mode
    applyXform(midiRoot, midiSaved); midiRoot.computeWorldMatrix(true); // back to the player's saved spot — the now-parented overlays follow it as one unit
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
  // the dumbek (bongos GLB): strike anywhere on it → a random one of your own 77 hits
  if (bongos) bongos.getChildMeshes().forEach(m => tag(m, { type: "dumbek", pad: bongoSquash }));
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
  else if (info.type === "dumbek") { hitDumbek(); if (info.pad) drumFx.push({ node: info.pad, t: 0.12, amt: 0.05 }); } // subtle 5% squash — a full drum compressing 40% looked rubbery
  else if (info.type === "mpc") { mpcVoice(info.sound); if (info.pad) mpcFx.push({ mesh: info.pad, t: 0.18 }); } // play the voice + flash the pad
}

let lightDrag = null;
scene.onPointerObservable.add((p) => {
  if (editMode || composerOpen || pcOpen) return;
  // dragging the light panel (point-and-drag dimmer / hue, no menu)
  if (lightDrag) {
    if (p.type === B.PointerEventTypes.POINTERMOVE) {
      const e = p.event;
      if (lightDrag === "dim") lampLevel = Math.max(0, Math.min(1, lampLevel - (e.movementY || 0) * 0.0022));
      else lampHue = ((lampHue + (e.movementX || 0) * 0.5) % 360 + 360) % 360;
      updateLamp(); return;
    }
    if (p.type === B.PointerEventTypes.POINTERUP) { lightDrag = null; camera.attachControl(canvas, true); persistFx(); return; } // remember the room light you dialed
  }
  if (p.type !== B.PointerEventTypes.POINTERDOWN) return;
  if (IS_TOUCH) return; // touch: picks fire on a TAP (custom handler), look via drag, move via the joystick
  if (!engine.isPointerLock) { engine.enterPointerlock(); return; }
  doScenePick();
});
// the whole click→interact sequence, shared by the desktop crosshair AND the mobile tap (castRay picks the ray)
function doScenePick() {
  if (vacHeld) { setVacuuming(false); return; } // a click while vacuuming stands it back in the corner
  if (toy.phase === "held") { throwToy(); return; } // holding the mouse → any click throws it
  if (!IS_TOUCH) { const lc = scene.pickWithRay(castRay(4.2), (m) => !!m._lightCtrl); if (lc && lc.hit) { lightDrag = lc.pickedMesh._lightCtrl; camera.detachControl(); return; } } // grab the dimmer/hue (desktop drag)
  const ray = castRay(7);
  const instr = scene.pickWithRay(ray, (m) => !!m._instr);
  if (instr && instr.hit) { playInstrument(instr); return; } // play the guitar / keys / drums
  const radTog = scene.pickWithRay(ray, (m) => !!m._radioToggle);
  if (radTog && radTog.hit) { const on = laRadio.toggle(); flashHint(on ? radioLabel() : "📻 radio off"); return; } // power on/off
  const radScn = scene.pickWithRay(ray, (m) => !!m._radioScan);
  if (radScn && radScn.hit) { if (!laRadio.info().on) laRadio.power(true); else laRadio.scan(1); radioScanStatic(); flashHint(radioLabel()); return; } // scan the dial
  const cu = scene.pickWithRay(ray, (m) => !!m._curtain);
  if (cu && cu.hit) { curtainOpen = !curtainOpen; sunRays(); flashHint(curtainOpen ? "🪟 curtains open" : "🌑 curtains drawn"); return; }
  const glassHit = scene.pickWithRay(ray, (m) => !!m._glass);
  if (glassHit && glassHit.hit) { // the window is solid — but if a jet's up, a shot through the glass can down it
    if (planeUp()) { const jr = scene.pickWithRay(castRay(220), (m) => !!m._jet); if (jr && jr.hit) { shootJet(); flashHint("🎯 splash — one down"); } else flashHint("missed — lead the target"); }
    return;
  }
  const lk = scene.pickWithRay(ray, (m) => !!m._link);
  if (lk && lk.hit) { window.open(lk.pickedMesh._link, "_blank", "noopener"); flashHint("opening link ↗"); return; } // a link note → open the URL
  const pv = scene.pickWithRay(ray, (m) => !!m._preview);
  if (pv && pv.hit) { openPreview(pv.pickedMesh._preview); return; } // click an existing note/photo → enlarge it
  const pcHit = scene.pickWithRay(ray, (m) => !!m._pc);
  if (pcHit && pcHit.hit) { openPC(); return; } // click the Mac Studio = boot the computer terminal (messages / links / video)
  const yc = scene.pickWithRay(ray, (m) => !!m._ytctl);
  if (yc && yc.hit) { ytControl(yc.pickedMesh._ytctl); return; } // transport buttons under the monitor
  const ytHit = scene.pickWithRay(ray, (m) => !!m._ytscreen);
  if (ytHit && ytHit.hit) { ytToggle(); return; } // click the monitor to pause/resume the playlist
  const fanHit = scene.pickWithRay(ray, (m) => !!m._fan);
  if (fanHit && fanHit.hit) { fanOn = !fanOn; flashHint(fanOn ? "🌀 fan on" : "fan off"); return; } // click the ceiling fan to start/stop it
  const projHit = scene.pickWithRay(ray, (m) => !!m._projector);
  if (projHit && projHit.hit) { setProjector(!projDown); return; } // roll the projector screen (also closes/restores the curtains)
  const bowl = scene.pickWithRay(ray, (m) => !!m._careBowl);
  if (bowl && bowl.hit) { handleCare(bowl.pickedMesh._careBowl); return; } // click food/water/litter to take care of it
  const cat = scene.pickWithRay(ray, (m) => m.name.startsWith("cat") || m._cat);
  if (cat && cat.hit) { petCat(); return; }
  const vac = scene.pickWithRay(ray, (m) => !!m._vacuum);
  if (vac && vac.hit) { if (vac.distance < 3.4) setVacuuming(true); else flashHint("step closer to grab the vacuum"); return; } // always swallow the click so it never falls through to a wall note
  const ft = scene.pickWithRay(ray, (m) => !!m._fetchToy);
  if (ft && ft.hit && toy.phase === "rest") { grabToy(); return; } // pick up the felt mouse
  const ytoy = scene.pickWithRay(ray, (m) => !!m._toy);
  if (ytoy && ytoy.hit) { pokeYarn(camera.position); flashHint("you flicked the yarn — here it goes 🧶"); return; } // skitter it; the cat gives chase
  // post a note — LAST, and only on BARE wall: blocked if any solid prop stands in front (no clicking through furniture)
  const wallHit = scene.pickWithRay(ray, (m) => !!m._noteWall);
  if (wallHit && wallHit.hit) {
    const block = scene.pickWithRay(ray, (m) => m.isPickable && !m._noteWall && m !== floor && m !== ceil && !m._preview && !m._link && !m._wallPhoto);
    if (block && block.hit && block.distance < wallHit.distance - 0.03) return; // a prop is in the way — don't post through it
    openComposer(wallHit.pickedMesh._noteWall, wallHit.pickedPoint); return;
  }
  throwBall();
}

// petting bumps the shared pets count + pops hearts (the achievement at 15 still lives in store)
function petCat() {
  popHearts(); catVoice("purr"); if (Math.random() < 0.35) setTimeout(() => catVoice("chirp"), 250); // a purr, sometimes a happy meow too
  store.catCare("pet").then((res) => { if (res) { applyCatNeeds(res); flashHint(`purrrr — petted ${res.pets || catNeeds.pets} times`); } }).catch(() => flashHint("purrrr"));
}

// pull the cat's current state, keep it live, and re-derive the timers every minute
// (no passive decay — this just re-checks whether a meal/litter timer has come due)
async function initCatNeeds() {
  try { applyCatNeeds(await store.getCatState()); }
  catch (e) { applyCatNeeds({ food: 1, water: 1, litter: 0, pets: 0, updated_at: new Date().toISOString() }); }
  store.onCatState(applyCatNeeds);
  setInterval(() => { if (catRaw) applyCatNeeds(catRaw); }, 60000);
}

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
const CORNER_M = 0.4; // keep notes/pics this far clear of the wall corners (room edges)
// per-visitor manual repositions of imported wall photos/notes (id → {wall,u,v} in metres). read-only
// import means this lives in localStorage, not Supabase — you rearrange your own view of the wall.
const WALLPOS_KEY = "metro.wallpos";
let wallPos = {}; try { wallPos = JSON.parse(localStorage.getItem(WALLPOS_KEY) || "{}"); } catch { }
const wallPhotoCards = [];
function saveWallPos() { try { localStorage.setItem(WALLPOS_KEY, JSON.stringify(wallPos)); } catch { } }
// world position of a point (u,v) on a wall, raycast onto the real face so the depth matches bareWallSpot
function wallFaceAt(w, wallId, u, v) {
  const s = w.origin.add(w.uDir.scale(u)).add(w.vDir.scale(v));
  const hit = scene.pickWithRay(new B.Ray(s.add(w.normal.scale(0.4)), w.normal.scale(-1), 0.8), mm => mm._wallId === wallId);
  return (hit && hit.hit && hit.pickedPoint ? hit.pickedPoint : s).add(w.normal.scale(0.045));
}
function inVoid(w, u, v, m) { return (w.voids || []).some(z => u + m > z.u0 && u - m < z.u1 && v + m > z.v0 && v - m < z.v1); }
// spiral from the intended (x,y) until the WHOLE note footprint sits on bare wall: every corner
// ray must hit the wall mesh (no panel/door in front, no hole), clear of voids, de-overlapped.
function bareWallSpot(w, wallId, x, y, sz) {
  const U0 = (x ?? 0.5) * w.w, V0 = (y ?? 0.5) * w.h, half = sz / 2;
  let a = 0, r = 0;
  for (let i = 0; i < 240; i++) {
    const u = U0 + Math.cos(a) * r, v = V0 + Math.sin(a) * r; a += 1.15; r += 0.022;
    if (v < half + 0.08 || v > w.h - half - 0.08) continue;          // off floor/ceiling
    if (u < half + CORNER_M || u > w.w - half - CORNER_M) continue;   // off the wall corners
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
  const saved = n.id != null ? wallPos[n.id] : null;
  let pos;
  if (saved && saved.wall === n.wall) { pos = wallFaceAt(w, n.wall, saved.u, saved.v); importPlaced[n.wall].push(pos); }
  else pos = bareWallSpot(w, n.wall, n.x, n.y, sz);
  if (!pos) return; // no bare-wall spot → skip
  const mat = new B.StandardMaterial("inote", scene);
  if (isPhoto) {
    mat.diffuseTexture = new B.Texture(n._imageUrl, scene); mat.emissiveTexture = mat.diffuseTexture; mat.emissiveColor = new B.Color3(0.18, 0.18, 0.18); // faint self-light: readable at night, no full glow
    photoTexture(n._imageUrl, (dt) => { if (dt) { mat.diffuseTexture = dt; mat.emissiveTexture = dt; } });
  } else { const col = (n.color && n.color[0] === "#") ? n.color : "#f4ecc8"; mat.diffuseTexture = noteTexture(text, col); mat.emissiveColor = B.Color3.FromHexString(col).scale(0.12); }
  mat.specularColor = new B.Color3(0.04, 0.04, 0.04); mat.backFaceCulling = false;
  const card = B.MeshBuilder.CreatePlane("note", { size: sz, sideOrientation: B.Mesh.DOUBLESIDE }, scene);
  card.material = mat;
  card.position.set(pos.x, pos.y, pos.z);
  card.rotation = B.Vector3.RotationFromAxis(B.Vector3.Cross(w.vDir, w.normal), w.vDir, w.normal); card.computeWorldMatrix(true);
  if (n.rot) card.rotate(B.Axis.Z, n.rot, B.Space.LOCAL);
  card.receiveShadows = true;
  // tag it so arrange mode (G) can grab and slide it along its wall
  card._wallPhoto = { id: n.id, wallId: n.wall, w, sz }; wallPhotoCards.push(card);
  card._preview = isPhoto ? { type: "photo", url: n._imageUrl } : { type: "note", text: n.text, color: (n.color && n.color[0] === "#") ? n.color : "#f4ecc8" }; // click to enlarge
}
async function importWallNotes() {
  const cfg = window.METRO_CONFIG;
  if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;
  try {
    const res = await fetch(`${cfg.SUPABASE_URL}/rest/v1/notes?select=id,wall,x,y,rot,text,color,kind,url,image_path&wall=in.(back,west,east)&order=created_at.asc&limit=2000`, { headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: "Bearer " + cfg.SUPABASE_ANON_KEY } });
    if (!res.ok) return;
    const rows = await res.json();
    const photoBase = cfg.SUPABASE_URL + "/storage/v1/object/public/photos/";
    rows.forEach(n => { if (n.kind === "photo" && n.image_path) { n._imageUrl = photoBase + n.image_path; slide.urls.push(n._imageUrl); } renderImportedNote(n); });
    if (slide.urls.length) { slide.acc = slide.period; } // kick the monitor slideshow on the next tick
    if (rows.length) flashHint(rows.length + " notes loaded from the wall");
  } catch (e) { console.warn("wall notes fetch failed", e); }
}
const composerEl = document.getElementById("composer"), noteTextEl = document.getElementById("note-text");
// click an existing note/photo to preview it enlarged
const previewEl = document.getElementById("preview"), previewBody = document.getElementById("preview-body");
function openPreview(p) {
  if (!previewEl || !p) return;
  if (p.type === "photo") previewBody.innerHTML = `<img src="${p.url}" alt="">`;
  else previewBody.innerHTML = `<div class="note-card" style="background:${p.color || "#f4ecc8"}">${String(p.text || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</div>`;
  previewEl.classList.add("show"); engine.exitPointerlock?.(); camera.detachControl();
}
function closePreview() { if (previewEl && previewEl.classList.contains("show")) { previewEl.classList.remove("show"); camera.attachControl(canvas, true); } }
previewEl?.addEventListener("click", closePreview);
window.addEventListener("keydown", (e) => { if (e.code === "Escape") closePreview(); });
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
  const isLink = note.kind === "link";
  const text = isLink ? ("↗ " + (note.text || note.url || "link")) : note.text;
  const col = isLink ? "#bfe3ff" : note.color;
  // diffuse texture (samples reliably) + a tint of the note's own colour as emissive, so it
  // reads as a colour card even on a dark wall and the text shows clearly under light
  const mat = new B.StandardMaterial("noteMat", scene); mat.diffuseTexture = noteTexture(text, col);
  mat.specularColor = new B.Color3(0.04, 0.04, 0.04); mat.emissiveColor = B.Color3.FromHexString(col).scale(isLink ? 0.2 : 0.12); mat.backFaceCulling = false; // links glow a touch more
  const card = B.MeshBuilder.CreatePlane("note", { size: 0.19, sideOrientation: B.Mesh.DOUBLESIDE }, scene);
  card.material = mat;
  if (isLink && note.url) card._link = note.url; // click opens it in a new tab
  const p = wall.origin.add(wall.uDir.scale(note.u)).add(wall.vDir.scale(note.v)).add(wall.normal.scale(0.09)); // proud of the inner wall face (wall is 0.12 thick)
  card.position.set(p.x, p.y, p.z);
  card.rotation = B.Vector3.RotationFromAxis(B.Vector3.Cross(wall.vDir, wall.normal), wall.vDir, wall.normal); // right-handed: x = up × normal, z faces room
  card.computeWorldMatrix(true);
  if (note.tilt) card.rotate(B.Axis.Z, note.tilt, B.Space.LOCAL); // slight stuck-on tilt
  card.receiveShadows = true; note._mesh = card;
  card._preview = { type: "note", text: note.text, color: note.color }; // click to enlarge
}
function deoverlap(wall, u, v) {
  let a = 0, r = 0;
  for (let i = 0; i < 80; i++) { const tu = u + Math.cos(a) * r, tv = v + Math.sin(a) * r; if (!notes.some(n => n.wall === wall && Math.hypot(n.u - tu, n.v - tv) < 0.21)) return { u: tu, v: tv }; a += 1.1; r += 0.028; }
  return { u, v };
}
function loadNotes() { try { notes = JSON.parse(localStorage.getItem(NOTES_KEY) || "[]"); } catch { notes = []; } notes.forEach(renderNote); }
function saveNotes() { try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes.map(n => ({ id: n.id, wall: n.wall, u: n.u, v: n.v, text: n.text, color: n.color, tilt: n.tilt, created_at: n.created_at, kind: n.kind, url: n.url })))); } catch { } }
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
  ["wEast_a", "wEast_b", "wEast_top"].forEach(n => { if (m(n)) { m(n)._noteWall = NOTE_WALLS.east; m(n)._wallId = "east"; } }); // east wall is now segmented around the door
  ["wWest_a", "wWest_b", "wWest_top"].forEach(n => { if (m(n)) { m(n)._noteWall = NOTE_WALLS.west; m(n)._wallId = "west"; } });
  const cc = document.getElementById("note-colors");
  NOTE_COLORS.forEach((col, i) => { const b = document.createElement("button"); b.style.background = col; if (i === 0) b.classList.add("sel"); b.onclick = () => { noteColor = col; [...cc.children].forEach(x => x.classList.remove("sel")); b.classList.add("sel"); }; cc.appendChild(b); });
  document.getElementById("note-post").onclick = postNote;
  document.getElementById("note-cancel").onclick = () => { closeComposer(); pending = null; };
  loadNotes();
  importWallNotes(); // pull the real notes off your live wall (read-only)
}

// =====================================================================
// THE COMPUTER — a matrix-style terminal on the monitor for leaving
// messages + transmitting links. they post to the wall (local, like the
// composer; auto-placed on the back wall). digital rain + scanlines + boot.
// =====================================================================
let pcOpen = false, pcRainRAF = null;
const pcEl = document.getElementById("pc");
function safeUrl(s) { try { const u = new URL((s || "").trim()); return (u.protocol === "http:" || u.protocol === "https:") ? u.href : null; } catch { return null; } }
function pcStatus(t) { const s = document.getElementById("pc-status"); if (s) s.textContent = t; }
function showPCView(name) { ["menu", "msg", "link"].forEach((v) => document.getElementById("pc-" + v)?.classList.toggle("hidden", v !== name)); pcStatus(""); }
function pcBoot() {
  const el = document.getElementById("pc-boot"); if (!el) return; el.textContent = "";
  const lines = ["> establishing secure uplink ...", "> handshake [OK]", "> METRO mainframe online"];
  let i = 0; (function nx() { if (i >= lines.length || !pcOpen) return; el.textContent += lines[i++] + "\n"; setTimeout(nx, 220); })();
}
function startPCRain() {
  const cv = document.getElementById("pc-rain"); if (!cv) return; const ctx = cv.getContext("2d");
  cv.width = window.innerWidth; cv.height = window.innerHeight;
  const cols = Math.floor(cv.width / 14), drops = Array(cols).fill(0).map(() => Math.random() * cv.height / 14);
  const chars = "アイウエオカキクケサシスセソタチツテﾅﾆ0123456789ABCDEF<>=/*+-";
  (function draw() {
    if (!pcOpen) return;
    ctx.fillStyle = "rgba(0,8,0,0.10)"; ctx.fillRect(0, 0, cv.width, cv.height); ctx.font = "14px monospace";
    for (let i = 0; i < cols; i++) {
      const ch = chars[(Math.random() * chars.length) | 0], x = i * 14, y = drops[i] * 14;
      ctx.fillStyle = Math.random() < 0.015 ? "#d6ffd6" : "#00cc33"; ctx.fillText(ch, x, y);
      if (y > cv.height && Math.random() > 0.975) drops[i] = 0; else drops[i]++;
    }
    pcRainRAF = requestAnimationFrame(draw);
  })();
}
function openPC() {
  if (pcOpen || !pcEl) return; pcOpen = true;
  engine.exitPointerlock?.(); camera.detachControl();
  pcEl.classList.add("show"); showPCView("menu"); pcBoot(); startPCRain();
}
function closePC() {
  pcOpen = false; if (pcEl) pcEl.classList.remove("show");
  if (pcRainRAF) { cancelAnimationFrame(pcRainRAF); pcRainRAF = null; }
  camera.attachControl(canvas, true); if (entered) engine.enterPointerlock?.();
}
// post a message / link to the back wall (local-only, same store as the composer)
function pcPost(kind, text, url) {
  const startU = Math.max(0.6, Math.min(W - 0.6, W / 2 + (Math.random() - 0.5) * 2.2));
  const startV = Math.max(0.9, Math.min(H - 0.5, 1.45 + (Math.random() - 0.5) * 0.5));
  const { u, v } = deoverlap("back", startU, startV);
  const note = { id: "n" + Date.now(), wall: "back", u, v, text, color: kind === "link" ? "#bfe3ff" : noteColor, tilt: Math.sin(notes.length * 7.3) * 0.1, created_at: Date.now() };
  if (kind === "link") { note.kind = "link"; note.url = url; }
  notes.push(note); renderNote(note); saveNotes();
}
function setupPC() {
  if (!pcEl) return;
  document.getElementById("pc-x")?.addEventListener("click", closePC);
  pcEl.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => { const g = b.dataset.go; if (g === "video") { ytToggle(); pcStatus("> broadcast toggled"); } else showPCView(g); }));
  pcEl.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", () => showPCView("menu")));
  document.getElementById("pc-msg-send")?.addEventListener("click", () => {
    const t = document.getElementById("pc-msg-text").value.trim(); if (!t) return pcStatus("> empty buffer — type a message");
    pcPost("note", t); document.getElementById("pc-msg-text").value = ""; pcStatus("> message posted to the wall ✓");
  });
  document.getElementById("pc-link-send")?.addEventListener("click", () => {
    const url = safeUrl(document.getElementById("pc-link-url").value); if (!url) return pcStatus("> rejected — http(s) links only");
    const title = document.getElementById("pc-link-title").value.trim().slice(0, 60) || url.replace(/^https?:\/\//, "").slice(0, 40);
    pcPost("link", title, url); document.getElementById("pc-link-url").value = ""; document.getElementById("pc-link-title").value = ""; pcStatus("> link transmitted to the wall ✓");
  });
  window.addEventListener("keydown", (e) => { if (pcOpen && e.code === "Escape") { e.preventDefault(); closePC(); } });
}

// =====================================================================
// DESK ARRANGE MODE — drag props on the desk; persists to localStorage and
// exports a layout you paste back so it gets baked in permanently.
// =====================================================================
const LS_KEY = "metro.desk.layout.v3"; // bumped 06-29: a stale v2 save on a device (esp. mobile) was overriding the
// freshly-baked DEFAULT_LAYOUT, so the MPC/Godzilla/etc. showed in their old spots. v3 starts clean → everyone gets
// the baked desktop layout until they arrange their own. (desktop's old v2 is abandoned but DEFAULT now == that layout.)
// baked-in arrangement (your "copy layout"); localStorage overrides this per-visitor
// the user's own "copy layout" from desktop, baked in 06-29 so EVERY device (mobile included) matches —
// previously these lived only in the desktop browser's localStorage, so phones fell back to stale spots
// (MIDI in the wrong place, oversized transport strip, Godzilla/city in their un-arranged positions).
// localStorage still overrides this per-visitor; re-paste a fresh "copy layout" here to update the floor.
const DEFAULT_LAYOUT = {
  "monitor": { x: -0.008, y: 1.019, z: -0.29, rx: 0, ry: -1.571, rz: 0, s: 1.267 },
  "external-monitor": { x: 0.71, y: 0.989, z: -0.222, rx: 1.55, ry: -0.35, rz: -0.05, s: 0.004 },
  "keyboard": { x: -0.03, y: 0.751, z: 0.25, rx: 0, ry: 0, rz: 0, s: 0.076 },
  "mouse": { x: 0.26, y: 0.74, z: 0.241, rx: 0, ry: -2.9, rz: 0, s: 0.013 },
  "midi": { x: -0.03, y: 0.74, z: -0.012, rx: 0, ry: 0, rz: 0, s: 0.004 },
  "mixer": { x: -0.57, y: 0.74, z: 0.07, rx: 0, ry: 0.35, rz: 0, s: 1 },
  "mug": { x: 0.45, y: 0.779, z: -0.02, rx: 0, ry: 0, rz: 0, s: 0.004 },
  "clock": { x: -0.73, y: 0.732, z: -0.15, rx: 0, ry: 0.4, rz: 0, s: 0.057 },
  "clock-display": { x: -0.526, y: 0.787, z: -2.953, rx: 0, ry: 3.542, rz: 0, s: 1.419 },
  "mac": { x: 0.71, y: 0.797, z: -0.26, rx: 0, ry: 0, rz: 0, s: 0.112 },
  "transport": { x: 0.708, y: 0.98, z: -0.21, rx: 0, ry: -0.3, rz: 0, s: 0.665 },
  "pedal-ds2": { x: 1.29, y: 0, z: -2.349, rx: 0, ry: 0, rz: 0, s: 1 },
  "pedal-mt2": { x: 1.434, y: -0.02, z: -2.256, rx: -1.05, ry: 0.3, rz: 0, s: 1 },
  "pedal-fuzz": { x: 1.57, y: 0, z: -2.27, rx: 0, ry: -0.2, rz: 0, s: 0.84 },
  "guitar": { x: 1.71, y: 0.17, z: -2.51, rx: 0.05, ry: -3.05, rz: 0.3, s: 1 },
  "dumbek": { x: -2.257, y: 0, z: -1.56, rx: 0, ry: 0.55, rz: 0, s: 1 },
  "mpc": { x: 0.798, y: 0.75, z: -2.693, rx: 0, ry: -0.35, rz: 0, s: 1 },
  "door": { x: 2.5, y: 0, z: 2.62, rx: 0, ry: 0, rz: 0, s: 0.74 },
  "city": { x: 0, y: -9, z: -18.8, rx: 0, ry: 0, rz: 0, s: 8.014 },
  "plane": { x: -6, y: 3, z: -9, rx: 0.06, ry: 21.921, rz: 0, s: 1 },
  "godzilla": { x: -25, y: -29, z: -73.5, rx: 0, ry: 0.442, rz: 0, s: 3.604 },
};
let editMode = false, selected = null, dragging = false, grabOff = { x: 0, z: 0 }, editables = [], editHL = null;
let selWall = null, wallDragging = false; // wall photos slide along their wall, separate from the X/Z desk drag
const editToggle = document.getElementById("edit-toggle"), editPanel = document.getElementById("editpanel");
const editSel = document.getElementById("edit-sel"), editXform = document.getElementById("edit-xform");
function meshesOf(node) { const cm = node.getChildMeshes ? node.getChildMeshes(false) : []; return cm.length ? cm : [node]; }
function nodeXform(n) { return { x: +n.position.x.toFixed(3), y: +n.position.y.toFixed(3), z: +n.position.z.toFixed(3), rx: +n.rotation.x.toFixed(3), ry: +n.rotation.y.toFixed(3), rz: +n.rotation.z.toFixed(3), s: +n.scaling.x.toFixed(3) }; }
function applyXform(n, t) { n.position.set(t.x, t.y, t.z); n.rotation.y = t.ry; if (t.rx != null) n.rotation.x = t.rx; if (t.rz != null) n.rotation.z = t.rz; if (t.s) n.scaling.setAll(t.s); } // only touch rx/rz when the layout actually has them, so older ry-only saves keep each item's baked load-time tilt (e.g. the city)
function layoutObj() { const o = {}; editables.forEach(e => o[e.name] = nodeXform(e.node)); return o; }
function saveLayout() { try { localStorage.setItem(LS_KEY, JSON.stringify(layoutObj())); } catch { } }
function setupEditor() {
  const uwScreen = scene.getMeshByName("uwScreenPlane"); if (uwScreen && deskProps.ultrawide) uwScreen.setParent(deskProps.ultrawide);
  const clockBody = scene.getMeshByName("clockBody"), clockFace = scene.getMeshByName("clockFace"); if (clockBody && clockFace) clockFace.setParent(clockBody);
  editables = [
    { name: "monitor", node: deskProps.ultrawide }, { name: "external-monitor", node: deskProps.portable },
    { name: "keyboard", node: deskProps.kb }, { name: "mouse", node: deskProps.mouse }, { name: "midi", node: deskProps.midi },
    { name: "mixer", node: mixer }, { name: "mug", node: deskProps.mug }, { name: "clock", node: deskProps.clock || clockBody }, { name: "clock-display", node: clockLive }, { name: "mac", node: deskProps.mac || scene.getMeshByName("mac") },
    { name: "transport", node: ytCtl }, // the ◀◀ ❚❚ ▶▶ strip — grab/rotate/scale it wherever you want
    { name: "pedal-ds2", node: pedalDS }, { name: "pedal-mt2", node: pedalMT }, { name: "pedal-fuzz", node: pedalFZ }, // three stompboxes, each resizable on its own
    { name: "guitar", node: tele }, // floor items (world space)
    { name: "dumbek", node: bongoPivot }, // the hand drum — drags on the floor like the pedalboard
    { name: "mpc", node: mpcPivot }, // the MPC drum machine — drag/rotate/scale; pads stay playable
    { name: "door", node: bedDoor }, // the bedroom door — drag it where you can see it, rotate [ ], resize , .
    { name: "city", node: cityGLB, outdoor: true }, // the whole city, draggable outside the room (no room-clamp)
    { name: "plane", node: plane3d, outdoor: true, jet: true }, // park + rotate the jet to set its flight heading
    { name: "godzilla", node: godzilla, outdoor: true }, // move/rotate/scale the king of the monsters
  ].filter(e => e.node);
  editables.forEach(e => meshesOf(e.node).forEach(m => { m._editable = e; m.isPickable = true; }));
  editHL = new B.HighlightLayer("editHL", scene);
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { }
  editables.forEach(e => { if (DEFAULT_LAYOUT[e.name]) applyXform(e.node, DEFAULT_LAYOUT[e.name]); }); // factory defaults first…
  editables.forEach(e => { e.home = nodeXform(e.node); });                                             // …captured as each item's reset target (R)
  editables.forEach(e => { if (saved[e.name]) applyXform(e.node, saved[e.name]); });                   // …then your saved layout wins
  const planeEd = editables.find(e => e.jet); if (planeEd) jetYaw = planeEd.node.rotation.y;            // restore the saved jet heading for flights
  editToggle.addEventListener("click", () => toggleEdit(!editMode));
  document.getElementById("edit-copy").addEventListener("click", () => { const t = JSON.stringify(layoutObj(), null, 2); navigator.clipboard?.writeText(t).then(() => flashHint("layout copied — paste it to me to bake in")); console.log("DESK LAYOUT:\n" + t); });
  document.getElementById("edit-reset").addEventListener("click", () => { try { localStorage.removeItem(LS_KEY); } catch { } location.reload(); });
  document.getElementById("edit-done").addEventListener("click", () => toggleEdit(false));
  // screen photo grade + how far the slideshow plane sits off the glass
  const fxC = document.getElementById("fx-contrast"), fxS = document.getElementById("fx-shadows"), fxD = document.getElementById("fx-depth"), fxF = document.getElementById("fx-fog");
  const fxVV = document.getElementById("fx-vvol"), fxRV = document.getElementById("fx-rvol"), fxCV = document.getElementById("fx-cvol");
  const fxRO = document.getElementById("fx-ropac"), fxRE = document.getElementById("fx-rexp"), fxRD = document.getElementById("fx-rdens"), fxRDk = document.getElementById("fx-rdecay");
  try { const sv = JSON.parse(localStorage.getItem(SCREEN_FX_KEY) || "{}"); if (sv.contrast != null) photoFx.contrast = sv.contrast; if (sv.shadows != null) photoFx.shadows = sv.shadows; if (sv.depth != null) screenDepth = sv.depth; if (sv.fog != null) scene.fogDensity = sv.fog; if (sv.vvol != null) videoVol = sv.vvol; if (sv.rvol != null) radioVol = sv.rvol; if (sv.cvol != null) cityVol = sv.cvol; if (sv.rOpac != null) raysOpacity = sv.rOpac; if (sv.rExp != null) raysExposure = sv.rExp; if (sv.rDens != null) raysDensity = sv.rDens; if (sv.rDecay != null) raysDecay = sv.rDecay; if (sv.lampLevel != null) lampLevel = sv.lampLevel; if (sv.lampHue != null) lampHue = sv.lampHue; } catch { }
  if (fxF) fxF.value = scene.fogDensity; updateLamp(); // apply restored fog + room light
  if (fxC) fxC.value = photoFx.contrast; if (fxS) fxS.value = photoFx.shadows; if (fxD) fxD.value = screenDepth; if (fxF) fxF.value = scene.fogDensity;
  if (fxVV) fxVV.value = videoVol; if (fxRV) fxRV.value = radioVol; if (fxCV) fxCV.value = cityVol;
  if (fxRO) fxRO.value = raysOpacity; if (fxRE) fxRE.value = raysExposure; if (fxRD) fxRD.value = raysDensity; if (fxRDk) fxRDk.value = raysDecay;
  applyScreenDepth(); regrade(); sunRays(); // apply restored god-ray settings
  const saveFx = () => { try { localStorage.setItem(SCREEN_FX_KEY, JSON.stringify({ contrast: photoFx.contrast, shadows: photoFx.shadows, depth: screenDepth, fog: scene.fogDensity, vvol: videoVol, rvol: radioVol, cvol: cityVol, rOpac: raysOpacity, rExp: raysExposure, rDens: raysDensity, rDecay: raysDecay, lampLevel, lampHue })); } catch { } };
  persistFx = saveFx; // expose it to the dimmer drag + METRO_BJS.saveSettings()
  fxC?.addEventListener("input", () => { photoFx.contrast = +fxC.value; regrade(); saveFx(); });
  fxS?.addEventListener("input", () => { photoFx.shadows = +fxS.value; regrade(); saveFx(); });
  fxD?.addEventListener("input", () => { screenDepth = +fxD.value; applyScreenDepth(); saveFx(); });
  fxF?.addEventListener("input", () => { scene.fogDensity = +fxF.value; saveFx(); });
  fxRO?.addEventListener("input", () => { raysOpacity = +fxRO.value; sunRays(); saveFx(); });   // window emitter opacity (see-through the city)
  fxRE?.addEventListener("input", () => { raysExposure = +fxRE.value; sunRays(); saveFx(); });   // shaft brightness (peak, day-scaled)
  fxRD?.addEventListener("input", () => { raysDensity = +fxRD.value; sunRays(); saveFx(); });    // shaft length / spread
  fxRDk?.addEventListener("input", () => { raysDecay = +fxRDk.value; sunRays(); saveFx(); });    // how fast the shafts fade out
  fxVV?.addEventListener("input", () => { videoVol = +fxVV.value; saveFx(); });                                   // video: picked up by updateVideoAudio
  fxRV?.addEventListener("input", () => { radioVol = +fxRV.value; laRadio.volume(radioVol); saveFx(); });          // radio stream volume (the actual volume knob, not the distance gain)
  fxCV?.addEventListener("input", () => { cityVol = +fxCV.value; if (cityVolGain) cityVolGain.gain.value = cityVol; saveFx(); }); // city ambience
  window.addEventListener("keydown", onEditKey);
  scene.onPointerObservable.add(onEditPointer);
}
function selectEd(e) {
  if (selected) meshesOf(selected.node).forEach(m => editHL.removeMesh(m));
  selected = e;
  if (e) { meshesOf(e.node).forEach(m => editHL.addMesh(m, B.Color3.FromHexString("#2dd4bf"))); editSel.textContent = "▸ " + e.name; updXformHud(); }
  else { editSel.textContent = "click an item to select"; editXform.textContent = ""; }
}
function updXformHud() { if (!selected) return; const t = nodeXform(selected.node); editXform.textContent = `x ${t.x}  y ${t.y}  z ${t.z}\nrot  x ${t.rx}  y ${t.ry}  z ${t.rz}\nsize ${t.s}`; }
// --- wall photos: pick one, drag it along its wall, persist per-visitor ---
function selectWall(mesh) {
  if (selWall) editHL.removeMesh(selWall.card);
  if (mesh) {
    selectEd(null); // wall + desk selection are mutually exclusive
    selWall = Object.assign({ card: mesh }, mesh._wallPhoto);
    editHL.addMesh(mesh, B.Color3.FromHexString("#f5a623"));
    editSel.textContent = "▸ wall photo"; updWallHud();
  } else selWall = null;
}
function updWallHud() { if (!selWall) return; const w = selWall.w, rel = selWall.card.position.subtract(w.origin); editXform.textContent = `wall ${selWall.wallId}\nu ${B.Vector3.Dot(rel, w.uDir).toFixed(2)}  v ${B.Vector3.Dot(rel, w.vDir).toFixed(2)}`; }
function dragWall() {
  const w = selWall.w, half = selWall.sz / 2;
  const pick = scene.pick(scene.pointerX, scene.pointerY, m => m._wallId === selWall.wallId); // only the wall — holes/blockers don't catch
  if (!pick.hit || !pick.pickedPoint) return;
  const rel = pick.pickedPoint.subtract(w.origin);
  const u0 = B.Vector3.Dot(rel, w.uDir), v0 = B.Vector3.Dot(rel, w.vDir);
  const u = Math.min(Math.max(u0, half + CORNER_M), w.w - half - CORNER_M);
  const v = Math.min(Math.max(v0, half + 0.1), w.h - half - 0.1);
  const pos = pick.pickedPoint.add(w.uDir.scale(u - u0)).add(w.vDir.scale(v - v0)).add(w.normal.scale(0.045));
  selWall.card.position.set(pos.x, pos.y, pos.z); selWall._u = u; selWall._v = v; updWallHud();
}
function commitWallPos() {
  if (!selWall || selWall.id == null || selWall._u == null) return;
  wallPos[selWall.id] = { wall: selWall.wallId, u: +selWall._u.toFixed(3), v: +selWall._v.toFixed(3) }; saveWallPos(); flashHint("photo moved");
}
function planeHit(h) { const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, B.Matrix.Identity(), camera); const t = (h - ray.origin.y) / ray.direction.y; if (t <= 0) return null; const p = ray.origin.add(ray.direction.scale(t)); return { x: p.x, z: p.z }; } // world x/z
function setWorldXZ(n, wx, wz) { const y = n.position.y; if (n.parent && n.parent.getWorldMatrix) { const loc = B.Vector3.TransformCoordinates(new V3(wx, n.getAbsolutePosition().y, wz), B.Matrix.Invert(n.parent.computeWorldMatrix(true))); n.position.x = loc.x; n.position.z = loc.z; } else { n.position.x = wx; n.position.z = wz; } n.position.y = y; }
function toggleEdit(on) {
  editMode = on; editToggle.classList.toggle("on", on); editPanel.classList.toggle("show", on);
  editToggle.textContent = on ? "✦ exit arrange" : "✦ arrange desk";
  if (on) {
    engine.exitPointerlock?.(); camera.detachControl();
    jetParked = true; if (plane3d) { plane3d.setEnabled(true); plane3d.position.set(-6, 3, -9); } // park the jet in view so you can orient it
    blinds.setEnabled(false); // open the blinds so you can see what you're arranging
    flashHint("arrange — drag to move · [ ] yaw · ; ' pitch · K L roll · − = height · , . size · R reset");
  } else {
    selectEd(null); selectWall(null); camera.attachControl(canvas, true);
    jetParked = false; blinds.setEnabled(true); // restore the closed blinds
  }
}
function onEditPointer(pi) {
  if (!editMode) return;
  if (pi.type === B.PointerEventTypes.POINTERDOWN) {
    const pick = scene.pick(scene.pointerX, scene.pointerY, m => !!m._editable || !!m._wallPhoto);
    if (pick.hit && pick.pickedMesh && pick.pickedMesh._wallPhoto) {
      selectWall(pick.pickedMesh); wallDragging = true;
    } else if (pick.hit && pick.pickedMesh && pick.pickedMesh._editable) {
      selectWall(null); selectEd(pick.pickedMesh._editable);
      const abs = selected.node.getAbsolutePosition(), hit = planeHit(abs.y);
      grabOff = hit ? { x: abs.x - hit.x, z: abs.z - hit.z } : { x: 0, z: 0 };
      dragging = true;
    } else { selectEd(null); selectWall(null); }
  } else if (pi.type === B.PointerEventTypes.POINTERUP) {
    dragging = false;
    if (wallDragging) { wallDragging = false; commitWallPos(); }
    if (selected) saveLayout();
  } else if (pi.type === B.PointerEventTypes.POINTERMOVE) {
    if (wallDragging && selWall) dragWall();
    else if (dragging && selected) {
      const hit = planeHit(selected.node.getAbsolutePosition().y);
      if (hit) {
        let wx = hit.x + grabOff.x, wz = hit.z + grabOff.z;
        if (!selected.outdoor) { wx = Math.max(-2.3, Math.min(2.3, wx)); wz = Math.max(-3.0, Math.min(3.0, wz)); } // clamp indoor props in reach; outdoor scenery (city) roams free
        setWorldXZ(selected.node, wx, wz); updXformHud();
      }
    }
  }
}
function onEditKey(ev) {
  if (composerOpen || pcOpen) return;
  if (ev.code === "KeyG") { toggleEdit(!editMode); ev.preventDefault(); return; }
  if (!editMode || !selected) return;
  const n = selected.node, f = ev.shiftKey ? 0.2 : 1, st = (selected.outdoor ? 0.5 : 0.01) * f, rt = 0.05 * f, scf = ev.shiftKey ? 1.01 : 1.06; let ok = true; // outdoor scenery (city) moves in coarse steps
  switch (ev.code) {
    case "ArrowUp": n.position.z -= st; break; case "ArrowDown": n.position.z += st; break;
    case "ArrowLeft": n.position.x -= st; break; case "ArrowRight": n.position.x += st; break;
    case "BracketLeft": n.rotation.y -= rt; break; case "BracketRight": n.rotation.y += rt; break; // yaw (Y)
    case "Semicolon": n.rotation.x -= rt; break; case "Quote": n.rotation.x += rt; break;         // pitch (X) — tip forward/back
    case "KeyK": n.rotation.z -= rt; break; case "KeyL": n.rotation.z += rt; break;               // roll (Z) — stand it up off its side
    case "Minus": n.position.y -= st; break; case "Equal": n.position.y += st; break;
    // resize is MULTIPLICATIVE — works regardless of a GLB's tiny/huge fit-scale (the old fixed ±0.02 step broke this)
    case "Comma": n.scaling.scaleInPlace(1 / scf); break; case "Period": n.scaling.scaleInPlace(scf); break;
    case "KeyR": applyXform(n, selected.home); break; // reset the selected item to its default position/rotation/size
    default: ok = false;
  }
  if (ok) { if (selected.jet) jetYaw = n.rotation.y; ev.preventDefault(); updXformHud(); saveLayout(); } // remember the jet's heading for flights
}

// resize the engine AND re-fit the FOV. iOS Safari fires these as the address bar shows/hides and on
// rotation — without it the drawing buffer goes stale and the whole scene looks stretched.
const onViewportResize = () => { engine.resize(); fitFov(); };
window.addEventListener("resize", onViewportResize);
window.addEventListener("orientationchange", onViewportResize);
if (window.visualViewport) window.visualViewport.addEventListener("resize", onViewportResize);
engine.runRenderLoop(() => scene.render());
setProg(72, "almost…");
scene.whenReadyAsync().then(async () => { setProg(82, "loading models…"); await loadHeroProps(); setupEditor(); setupNotes(); setupPC(); setupInstruments(); laRadio.init(); laRadio.volume(radioVol); setProg(90, "physics…"); await initPhysics(); setProg(100, "enter ▸"); enterBtn.disabled = false; });

let entered = false;
function enter() {
  if (entered) return; entered = true;
  gate.classList.add("gone"); badge.classList.add("show"); editToggle.classList.add("show"); catHud?.classList.add("show"); // credits stay on the intro only
  hint.textContent = (IS_TOUCH ? "left stick to walk · drag to look · tap things to use them" : "WASD move · click") + " · guitar / keys / drums · pet the cat, flick the yarn to chase, grab+throw the mouse to fetch, the bowls to feed/water/clean · grab the vacuum to clean the floor · T treat · boombox = radio · Mac Studio = computer (messages/links) · monitor = play/pause video · wall = note · G arrange · L lighting";
  hint.classList.add("show"); setTimeout(() => hint.classList.remove("show"), 7000);
  canvas.focus(); engine.enterPointerlock();
  try { ensureAudio(); } catch (e) { /* audio is best-effort */ } // build the audio context on this user gesture
}
enterBtn.addEventListener("click", enter);
// crosshair: visible only while looking around (pointer-locked), hidden in menus/arrange/composer
const crosshairEl = document.getElementById("crosshair");
document.addEventListener("pointerlockchange", () => crosshairEl?.classList.toggle("show", !!document.pointerLockElement));

// =====================================================================
// THE COMPUTER SCREEN — a YouTube playlist as a live overlay glued onto
// the monitor's screen mesh. YouTube embeds are sandboxed iframes WebGL
// can't sample, so we can't texture it; instead we CSS-matrix3d an iframe
// onto the screen quad each frame. Click the screen to pause/resume. The
// boombox radio gates the audio: on -> sound, off -> muted (always playing).
// =====================================================================
// the rotation: a mix of playlists + a single video. one is picked at random on load, and it swaps to
// another random one whenever the current source ends — plus a slow periodic swap so it keeps rotating.
const YT_SOURCES = [
  { list: "PLJ7Ne8dn6p-0FeE4MY8sJifEqbUTxLeXm" },
];
const ytEl = document.getElementById("ytscreen");
let ytPlayer = null, ytReady = false, ytPaused = true, ytCurrent = null; // starts PAUSED — walk up to the monitor and press play
const ytPick = () => { let s; do { s = YT_SOURCES[Math.floor(Math.random() * YT_SOURCES.length)]; } while (YT_SOURCES.length > 1 && s === ytCurrent); return s; };
function ytLoadSource(s) { ytCurrent = s; if (s.list) ytPlayer.loadPlaylist({ listType: "playlist", list: s.list }); else ytPlayer.loadVideoById(s.video); } // playing resumes muted/volume per updateVideoAudio
function ytSwap() { if (ytReady && !ytPaused) ytLoadSource(ytPick()); }
function makeYT() {
  if (!window.YT || !window.YT.Player || !document.getElementById("ytplayer")) return;
  ytCurrent = ytPick();
  const vars = { autoplay: 0, mute: 1, controls: 0, modestbranding: 1, rel: 0, playsinline: 1, fs: 0, disablekb: 1 }; // autoplay OFF — cued, waiting for the user to press play
  if (ytCurrent.list) { vars.listType = "playlist"; vars.list = ytCurrent.list; }
  const cfg = { width: "640", height: "360", playerVars: vars, events: {
    onReady: (e) => { ytReady = true; e.target.mute(); if (ytToggleTex) { drawIcon(ytToggleTex.getContext(), 64, 64, "play"); ytToggleTex.update(false); } setInterval(ytSwap, (6 + Math.random() * 4) * 60000); }, // cued + paused; the transport button shows ▶. periodic swap only kicks in once you've pressed play (ytSwap guards on !ytPaused)
    onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED) ytSwap(); }, // source ended → next random one
    onError: (e) => { if (ytCurrent && ytCurrent.list) { try { ytPlayer.nextVideo(); } catch { ytSwap(); } } else ytSwap(); }, // age-gated / embedding-disabled / unavailable → skip it
  } };
  if (!ytCurrent.list) cfg.videoId = ytCurrent.video;
  ytPlayer = new YT.Player("ytplayer", cfg);
}
if (window.YT && window.YT.Player) makeYT();
else { const prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { try { prev && prev(); } catch {} makeYT(); }; }
function ytControl(a) {
  if (!ytReady) return;
  if (a === "toggle") return ytToggle();
  const list = ytCurrent && ytCurrent.list;
  if (a === "next") { if (list) { try { ytPlayer.nextVideo(); } catch { ytSwap(); } } else ytSwap(); flashHint("⏭ next"); }
  else if (a === "prev") { if (list) { try { ytPlayer.previousVideo(); } catch { ytSwap(); } } else ytSwap(); flashHint("⏮ previous"); }
}
function ytToggle() {
  if (!ytReady) return;
  ytPaused = !ytPaused;
  if (ytPaused) { ytPlayer.pauseVideo(); flashHint("⏸ screen paused"); } else { ytPlayer.playVideo(); flashHint("▶ playing"); }
  if (ytToggleTex) { drawIcon(ytToggleTex.getContext(), 64, 64, ytPaused ? "play" : "pause"); ytToggleTex.update(false); } // swap the play/pause icon
}
// --- planar homography (unit rect -> screen quad) as a CSS matrix3d ---
function ytAdj(m) { return [m[4]*m[8]-m[5]*m[7], m[2]*m[7]-m[1]*m[8], m[1]*m[5]-m[2]*m[4], m[5]*m[6]-m[3]*m[8], m[0]*m[8]-m[2]*m[6], m[2]*m[3]-m[0]*m[5], m[3]*m[7]-m[4]*m[6], m[1]*m[6]-m[0]*m[7], m[0]*m[4]-m[1]*m[3]]; }
function ytMM(a, b) { const r = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s += a[3*i+k]*b[3*k+j]; r[3*i+j] = s; } return r; }
function ytMV(m, v) { return [m[0]*v[0]+m[1]*v[1]+m[2]*v[2], m[3]*v[0]+m[4]*v[1]+m[5]*v[2], m[6]*v[0]+m[7]*v[1]+m[8]*v[2]]; }
function ytBasis(x1, y1, x2, y2, x3, y3, x4, y4) { const m = [x1, x2, x3, y1, y2, y3, 1, 1, 1]; const v = ytMV(ytAdj(m), [x4, y4, 1]); return ytMM(m, [v[0],0,0, 0,v[1],0, 0,0,v[2]]); }
function ytQuad(w, h, p) { // p = [TLx,TLy, TRx,TRy, BLx,BLy, BRx,BRy]
  const s = ytBasis(0,0, w,0, 0,h, w,h), d = ytBasis(p[0],p[1], p[2],p[3], p[4],p[5], p[6],p[7]);
  const t = ytMM(d, ytAdj(s)); for (let i = 0; i < 9; i++) t[i] /= t[8];
  return "matrix3d(" + [t[0],t[3],0,t[6], t[1],t[4],0,t[7], 0,0,1,0, t[2],t[5],0,t[8]].join(",") + ")";
}
const YT_W = 640, YT_H = 360;
function ytCornersLocal(mesh) { // 4 corners of the thin screen face, in mesh-local space
  const bb = mesh.getBoundingInfo().boundingBox, mn = bb.minimum, mx = bb.maximum;
  const lo = [mn.x, mn.y, mn.z], hi = [mx.x, mx.y, mx.z], mid = [(mn.x+mx.x)/2, (mn.y+mx.y)/2, (mn.z+mx.z)/2];
  const ex = [hi[0]-lo[0], hi[1]-lo[1], hi[2]-lo[2]], t = ex.indexOf(Math.min(ex[0], ex[1], ex[2])), a = [0,1,2].filter(i => i !== t);
  return [[0,0],[1,0],[0,1],[1,1]].map(([u, v]) => { const p = mid.slice(); p[a[0]] = u ? hi[a[0]] : lo[a[0]]; p[a[1]] = v ? hi[a[1]] : lo[a[1]]; return new V3(p[0], p[1], p[2]); });
}
function updateYTScreen() {
  if (!ytEl) return;
  if (!entered || editMode || composerOpen || !monitorScreenMesh) { ytEl.style.display = "none"; return; }
  // the monitor's video is a DOM overlay (sits above the canvas, ignores 3D depth), so it can't be
  // partially occluded. when the projector is deployed, hide it entirely — you're watching the projector,
  // and this guarantees nothing from the monitor shows over/through the projector screen at any angle.
  if (projT > 0.05) { ytEl.style.display = "none"; return; }
  const wm = monitorScreenMesh.getWorldMatrix(), vm = camera.getViewMatrix(), tm = scene.getTransformMatrix();
  const vp = new B.Viewport(0, 0, engine.getRenderWidth(), engine.getRenderHeight());
  const pts = [];
  for (const c of ytCornersLocal(monitorScreenMesh)) {
    const w = B.Vector3.TransformCoordinates(c, wm);
    if (B.Vector3.TransformCoordinates(w, vm).z >= -0.05) { ytEl.style.display = "none"; return; } // a corner is behind the camera (right-handed scene: in front = negative view-space z)
    const sp = B.Vector3.Project(w, B.Matrix.Identity(), tm, vp); pts.push({ x: sp.x, y: sp.y });
  }
  pts.sort((a, b) => a.y - b.y);
  const top = pts.slice(0, 2).sort((a, b) => a.x - b.x), bot = pts.slice(2).sort((a, b) => a.x - b.x);
  const sx = (canvas.clientWidth || 1) / (engine.getRenderWidth() || 1), sy = (canvas.clientHeight || 1) / (engine.getRenderHeight() || 1);
  const P = [top[0].x*sx, top[0].y*sy, top[1].x*sx, top[1].y*sy, bot[0].x*sx, bot[0].y*sy, bot[1].x*sx, bot[1].y*sy];
  ytEl.style.display = "block";
  ytEl.style.transform = ytQuad(YT_W, YT_H, P);
}
// the playlist is the room's default audio; the boombox radio takes over when it's on, and the playlist
// fades back when the radio's off. runs every frame (not gated by whether the overlay is on-screen).
let ytVol = 0; // current youtube volume 0..100, eased toward the target
function updateVideoAudio(dt) {
  if (!entered) return;
  const projOn = projReady && projT > 0.5; // the projector screen is deployed
  // PROJECTOR audio — plays when the screen is down (the radio still wins if it's on)
  if (projReady) {
    if (projOn && !laRadio.info().on) { if (projPlayer.isMuted()) projPlayer.unMute(); projPlayer.setVolume(Math.round(videoVol * 100)); }
    else if (!projPlayer.isMuted()) projPlayer.mute();
  }
  // MONITOR audio — muted while the projector is on (or paused / radio on)
  if (!ytReady || ytPaused || projOn) { if (ytReady && !ytPlayer.isMuted()) ytPlayer.mute(); return; }
  const target = laRadio.info().on ? 0 : videoVol * 100; // radio on → silence the video; radio off → play it at the video-volume setting
  ytVol += (target - ytVol) * Math.min(1, dt * 1.6); // ~1s fade
  if (ytVol <= 1) { if (!ytPlayer.isMuted()) ytPlayer.mute(); }
  else { if (ytPlayer.isMuted()) ytPlayer.unMute(); ytPlayer.setVolume(Math.round(ytVol)); }
}

// PROJECTOR VIDEO — a separate YouTube player glued onto the projector screen (same matrix3d trick
// as the monitor). it plays when the screen is down and pauses when it rolls up.
const PROJ_VIDEO = "kX-A_iEj7kI";
const projEl = document.getElementById("projscreen");
let projPlayer = null, projReady = false, projPlaying = false;
function makeProjYT() {
  if (!window.YT || !window.YT.Player || !document.getElementById("projplayer")) return;
  projPlayer = new YT.Player("projplayer", {
    width: "640", height: "360", videoId: PROJ_VIDEO,
    playerVars: { autoplay: 0, mute: 1, controls: 0, modestbranding: 1, rel: 0, playsinline: 1, fs: 0, disablekb: 1, loop: 1, playlist: PROJ_VIDEO },
    events: { onReady: (e) => { projReady = true; e.target.mute(); } },
  });
}
if (window.YT && window.YT.Player) makeProjYT();
else { const prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { try { prev && prev(); } catch {} makeProjYT(); }; }
function updateProjScreen() {
  if (!projEl) return;
  const show = entered && !editMode && !composerOpen && projT > 0.5;
  if (!show) { projEl.style.display = "none"; if (projReady && projPlaying) { projPlayer.pauseVideo(); projPlaying = false; } return; }
  if (projReady && !projPlaying) { projPlayer.playVideo(); projPlaying = true; }
  const wm = projScreen.getWorldMatrix(), vm = camera.getViewMatrix(), tm = scene.getTransformMatrix();
  const vp = new B.Viewport(0, 0, engine.getRenderWidth(), engine.getRenderHeight());
  const pts = [];
  for (const c of ytCornersLocal(projScreen)) {
    const w = B.Vector3.TransformCoordinates(c, wm);
    if (B.Vector3.TransformCoordinates(w, vm).z >= -0.05) { projEl.style.display = "none"; return; }
    const sp = B.Vector3.Project(w, B.Matrix.Identity(), tm, vp); pts.push({ x: sp.x, y: sp.y });
  }
  pts.sort((a, b) => a.y - b.y);
  const top = pts.slice(0, 2).sort((a, b) => a.x - b.x), bot = pts.slice(2).sort((a, b) => a.x - b.x);
  const sx = (canvas.clientWidth || 1) / (engine.getRenderWidth() || 1), sy = (canvas.clientHeight || 1) / (engine.getRenderHeight() || 1);
  const P = [top[0].x * sx, top[0].y * sy, top[1].x * sx, top[1].y * sy, bot[0].x * sx, bot[0].y * sy, bot[1].x * sx, bot[1].y * sy];
  projEl.style.display = "block";
  projEl.style.transform = ytQuad(YT_W, YT_H, P);
}

// press L to cycle the lighting mood (golden hour → midday → studio → night/neon)
function flashHint(t) { hint.textContent = t; hint.classList.add("show"); clearTimeout(flashHint._t); flashHint._t = setTimeout(() => hint.classList.remove("show"), 2400); }
window.addEventListener("keydown", (e) => {
  if (composerOpen || pcOpen || editMode || e.code !== "KeyT") return;
  handleCare("treat"); // toss the cat a treat (store caps it at 6 per 6h)
});
window.addEventListener("keydown", (e) => {
  if (composerOpen || pcOpen || e.code !== "KeyL") return;
  moodIdx = moodIdx + 1 >= MOODS.length ? -1 : moodIdx + 1;
  if (moodIdx < 0) { autoMode = true; updateEnv(new Date()); flashHint("lighting: auto — real time at your location"); }
  else { autoMode = false; applyMood(MOODS[moodIdx]); flashHint("lighting: " + MOODS[moodIdx].label + " (frozen)"); }
});

window.METRO_BJS = {
  engine, scene, camera, throwBall, popHearts, B, applyMood, MOODS,
  setMood: (i) => { autoMode = false; moodIdx = i % MOODS.length; applyMood(MOODS[moodIdx]); },
  // preview a time of day (hours 0-23) without waiting for the real clock
  previewTime: (h, m = 30) => { autoMode = false; const d = new Date(); d.setHours(h, m, 0, 0); updateEnv(d); },
  // freeze the room at night so the ceiling sky shows regardless of the real time of day
  forceAstro: () => { autoMode = false; const d = new Date(); d.setHours(23, 30, 0, 0); updateEnv(d); },
  forceDay: () => { autoMode = false; const d = new Date(); d.setHours(13, 0, 0, 0); updateEnv(d); }, // noon — sun high, god-rays full
  godrays: () => godrays, rayEmitter: () => rayEmitter, // the VLS pass + its window-wide emitter (alpha = see-through-the-city opacity)
  setRays: (o) => { if (o.opacity != null) raysOpacity = o.opacity; if (o.exposure != null) raysExposure = o.exposure; if (o.density != null) raysDensity = o.density; if (o.decay != null) raysDecay = o.decay; sunRays(); }, // tune all four live
  saveSettings: () => { persistFx(); return "saved — fog, god-rays, screen grade, audio + room light will survive reload"; }, // snapshot the CURRENT state (incl. console-tuned values)
  door: () => bedDoor, fitDoor: (o) => { Object.assign(DOOR, o || {}); fitDoor(); return JSON.stringify(DOOR); }, // place/tune the bedroom door
  doorInfo: () => { // paste this back so I can align the trim + cut the wall/cell to where you placed it
    if (!bedDoor || !doorNearMeshes.length) return "no door";
    let mn = new B.Vector3(1e9, 1e9, 1e9), mx = new B.Vector3(-1e9, -1e9, -1e9);
    doorNearMeshes.forEach((m) => { m.computeWorldMatrix(true); const bi = m.getBoundingInfo().boundingBox; mn = B.Vector3.Minimize(mn, bi.minimumWorld); mx = B.Vector3.Maximize(mx, bi.maximumWorld); });
    const p = bedDoor.position, r = bedDoor.rotation, s = bedDoor.scaling;
    return JSON.stringify({ pos: [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)], rot: [+r.x.toFixed(3), +r.y.toFixed(3), +r.z.toFixed(3)], scale: +s.x.toFixed(3), worldBB: { x: [+mn.x.toFixed(2), +mx.x.toFixed(2)], y: [+mn.y.toFixed(2), +mx.y.toFixed(2)], z: [+mn.z.toFixed(2), +mx.z.toFixed(2)] } });
  },
  delDoor: (which) => { // "far" (default, drops the open door) · "near" (drops the closed one instead) · "both" (show both)
    const show = (a, on) => a.forEach((m) => m.setEnabled(on));
    if (which === "both") { show(doorNearMeshes, true); show(doorFarMeshes, true); return "showing both doors"; }
    if (which === "near") { show(doorNearMeshes, false); show(doorFarMeshes, true); return "kept the FAR (open) door"; }
    show(doorFarMeshes, false); show(doorNearMeshes, true); return "kept the NEAR (closed) door";
  },
  doorBB: () => { if (!bedDoor) return null; bedDoor.computeWorldMatrix(true); const b = bedDoor.getHierarchyBoundingVectors(); return JSON.stringify({ x: [+b.min.x.toFixed(2), +b.max.x.toFixed(2)], y: [+b.min.y.toFixed(2), +b.max.y.toFixed(2)], z: [+b.min.z.toFixed(2), +b.max.z.toFixed(2)] }); },
  get astroGrp() { return astroGrp; },
  get catState() { return catState; }, // debug: poke .walking / .tx / .tz to test the cat's idle↔walk
  get catModel() { return catModel; },
  get catNeeds() { return catNeeds; }, get catRaw() { return catRaw; },
  care: (kind) => handleCare(kind), pet: () => petCat(), // drive care from the console
  poke: () => pokeYarn(camera.position), catVoice, // toss the yarn / test the cat's voice
  grabToy, throwToy, toy, // pick up / throw the felt mouse (cat fetches it back)
  vacuum: (on = true) => setVacuuming(on), seedGrime, cleanFloor, floorTraffic, grimeTex, grimeSnapshot, // grab the vacuum / dirty + clean the floor
  projector: (down) => { setProjector(down === undefined ? !projDown : !!down); return projDown ? "screen down" : "screen up"; }, // roll the projector screen (+ curtains)
  vacuumNode: () => vacuum, vacuumStep, // the vacuum transform + drive its held pose (testing facing)
  // force a need due NOW (kind: hungry|thirsty|bathroom) so you can watch the cat go act on it.
  // persists to the same localStorage key store.js reads, so the cat's own catCare("eat"/…) succeeds.
  forceNeed: (kind) => {
    const k = kind === "hungry" ? "hungry_at" : kind === "thirsty" ? "thirsty_at" : "bathroom_at";
    let s = {}; try { s = JSON.parse(localStorage.getItem("metro.catstate") || "{}"); } catch (e) {}
    s = { food: 1, water: 1, litter: 0, pets: 0, treats: [], ...s, [k]: new Date(Date.now() - 60000).toISOString() };
    try { localStorage.setItem("metro.catstate", JSON.stringify(s)); } catch (e) {}
    applyCatNeeds(s); catState.dwell = 0; return catNeeds;
  },
  goAuto: () => { autoMode = true; updateEnv(new Date()); },
  toggleEdit: (on) => toggleEdit(on), get editLayout() { return layoutObj(); },
  openPC, closePC, pcPost, // the matrix computer terminal (messages + links)
  get notes() { return notes; }, openComposerAt: (wallId, u, v) => { const w = NOTE_WALLS[wallId]; openComposer(w, w.origin.add(w.uDir.scale(u)).add(w.vDir.scale(v))); },
  postTestNote: (wall, u, v, text, color) => { const n = { id: "t" + Date.now() + Math.round(u * 99), wall, u, v, text, color: color || "#f4ecc8", tilt: 0.05, created_at: Date.now() }; notes.push(n); renderNote(n); saveNotes(); return n; },
  get weather() { return weather; },
  radio: laRadio, radioPower: (on) => laRadio.power(on), radioScan: () => { laRadio.scan(1); radioScanStatic(); return laRadio.info(); },
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
  pickLightCtrl: () => { const lc = scene.pickWithRay(camera.getForwardRay(4.2), (m) => !!m._lightCtrl); return lc && lc.hit ? lc.pickedMesh._lightCtrl : null; },
  get slide() { return { count: slide.urls.length, i: slide.i }; }, nextSlide: () => nextSlide(),
  playKey: (m) => playKey(m), strumGuitar: () => strumGuitar(), drum: (k) => drum(k),
  hitDumbek: () => hitDumbek(), get dumbekLoaded() { return dumbekBufs.filter(Boolean).length; }, get bongos() { return bongos; },
  triggerPlane: (dir = 1) => triggerPlane(dir), get planeUp() { return planeUp(); }, get planeT() { return planeT; }, get plane3d() { return plane3d; },
  godzillaNow: () => { gzT = 0; }, // bring Godzilla in now
  setCurtains: (o) => { curtainOpen = !!o; }, // open/draw the curtains
  shootPlane: () => { if (!planeUp()) return null; shootJet(); return "hit"; },
  showFlightStrip: (info) => showFlightStrip(info), get livePlanes() { return livePlanes; },
  placeBongos: (x, z, ry, t) => { if (!bongoPivot) return; bongoPivot.position.set(x, BONGO.y, z); bongoPivot.rotation.y = ry; bongos.scaling.setAll(t / bongos._naturalMax); bongos.position.set(0, 0, 0); bongos.computeWorldMatrix(true); const { min } = bongos.getHierarchyBoundingVectors(); bongos.position.y -= min.y - BONGO.y; },
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
