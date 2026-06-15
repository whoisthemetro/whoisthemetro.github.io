/* ============================================================
   THE METRO — the room
   A bedroom home studio, generated entirely in code: cream walls,
   stained carpet, desk against the front wall with an ultrawide
   riding a Dangerous Music D-Box MK1, Apple keyboard + trackball,
   Mac Studio with a portable monitor on top, a MIDI controller
   half-tucked under the desk, Kali monitors on stands either side
   of the desk, a 12U rack on casters with an Apollo Twin, an ergo
   chair, sound panels, and three doors (bathroom, closet, entry —
   with the METRO neon on the entry door).

   The ONLY light is what comes through the window (plus the neon
   and the screens themselves): a shadow-casting beam that follows
   the real sun and moon over Hawthorne, CA, striping the carpet
   through the vertical blinds, and a soft sky fill that breathes
   with the actual time of day. A clock on the desk shows the real
   time there.

   Layout (meters), y up, floor y=0, ceiling y=2.7:
     x: -2.6 (left wall: bathroom door + closet) .. 2.6 (right wall: entry door)
     z: -3.3 (front wall: desk + window) .. 3.3 (back wall)
   ============================================================ */

import * as THREE from "three";
import { rand, IS_TOUCH } from "./util.js";
import { getSunPosition, getMoonPosition, getMoonIllumination, getStarPosition, getPlanetPositions, STARS } from "./astro.js";
import { makeAttractScreen } from "./arcade.js";

export const ROOM = {
  X: 2.6, ZF: -3.3, ZB: 3.3, H: 2.7,
  bounds: { minX: -2.3, maxX: 2.3, minZ: -2.35, maxZ: 3.0 },
};

const LAT = 33.9164, LNG = -118.3526;          // Hawthorne, CA
const TZ = "America/Los_Angeles";

/* ---------------- procedural textures ---------------- */

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// One non-repeating carpet for the whole floor. It starts CLEAN — no
// baked-in stains or worn path anymore; the dirt is the live grime layer
// in buildWorld (traffic + cat), and the vacuum lifts it back out.
function floorTexture() {
  return canvasTex(800, 1024, (g, w, h) => {
    g.fillStyle = "#6e6557";
    g.fillRect(0, 0, w, h);
    // carpet pile: layered speckle, two scales
    for (let i = 0; i < 42000; i++) {
      const v = 84 + Math.random() * 44;
      g.fillStyle = `rgba(${v},${v - 8},${v - 18},${0.2 + Math.random() * 0.3})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4);
    }
    for (let i = 0; i < 5000; i++) {
      const v = 70 + Math.random() * 26;
      g.fillStyle = `rgba(${v},${v - 6},${v - 14},0.35)`;
      g.fillRect(Math.random() * w, Math.random() * h, 2.6, 1.2);
    }
    // a fresh-vacuumed sheen — faint light/dark grooming stripes, no grime
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? "rgba(255,250,240,0.025)" : "rgba(0,0,0,0.03)";
      g.fillRect((i * 140 + 30) % w, 0, 60, h);
    }
  });
}

// Cream wall painted as one canvas: drywall, baseboard, scuffs, and
// acoustic panels drawn flat so notes pin right over them.
function wallTexture(wMeters, hMeters, panels = []) {
  const ppm = 160;
  return canvasTex(Math.round(wMeters * ppm), Math.round(hMeters * ppm), (g, w, h) => {
    g.fillStyle = "#e4dccb";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < w * h / 300; i++) {
      g.fillStyle = `rgba(120,108,88,${Math.random() * 0.03})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    // the wall has lived a little: scuffs low, a faint handprint height smudge
    for (let i = 0; i < wMeters * 2; i++) {
      const x = Math.random() * w;
      g.fillStyle = `rgba(90,78,58,${0.04 + Math.random() * 0.05})`;
      g.beginPath();
      g.ellipse(x, h - (0.14 + Math.random() * 0.3) * ppm, 18 + Math.random() * 26, 6 + Math.random() * 8, Math.random(), 0, 7);
      g.fill();
    }
    for (const [pu, pv, pw, ph] of panels) {
      const x = pu * ppm, y = h - (pv + ph) * ppm;
      g.fillStyle = "#1b1d22";
      g.fillRect(x, y, pw * ppm, ph * ppm);
      g.fillStyle = "#262931";
      g.fillRect(x + 4, y + 4, pw * ppm - 8, ph * ppm - 8);
      g.strokeStyle = "rgba(0,0,0,0.5)";
      g.lineWidth = 3;
      g.strokeRect(x + 2, y + 2, pw * ppm - 4, ph * ppm - 4);
      g.fillStyle = "rgba(255,255,255,0.03)";
      for (let yy = y; yy < y + ph * ppm; yy += 4) g.fillRect(x, yy, pw * ppm, 1);
    }
    g.fillStyle = "#cfc6b2";
    g.fillRect(0, h - 0.1 * ppm, w, 0.1 * ppm);
    g.fillStyle = "rgba(0,0,0,0.18)";
    g.fillRect(0, h - 0.1 * ppm, w, 3);
  });
}

function deskTexture() {
  return canvasTex(950, 390, (g, w, h) => {
    g.fillStyle = "#33291d";
    g.fillRect(0, 0, w, h);
    // walnut grain
    for (let i = 0; i < 70; i++) {
      const y = Math.random() * h;
      g.strokeStyle = `rgba(${14 + Math.random() * 30},${10 + Math.random() * 22},${6 + Math.random() * 14},${0.25 + Math.random() * 0.3})`;
      g.lineWidth = 1 + Math.random() * 2;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= w; x += 40) g.lineTo(x, y + Math.sin(x * 0.012 + i) * 6);
      g.stroke();
    }
    // scratches + a coffee ring where the mug lives (right side)
    g.strokeStyle = "rgba(190,170,140,0.18)";
    for (let i = 0; i < 9; i++) {
      g.lineWidth = 0.8;
      g.beginPath();
      const x = Math.random() * w, y = Math.random() * h;
      g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 90, y + (Math.random() - 0.5) * 24);
      g.stroke();
    }
    g.strokeStyle = "rgba(60,40,20,0.4)";
    g.lineWidth = 4;
    g.beginPath(); g.arc(w * 0.82, h * 0.32, 22, 0, 7); g.stroke();
    g.strokeStyle = "rgba(60,40,20,0.2)";
    g.beginPath(); g.arc(w * 0.84, h * 0.36, 22, 0.6, 5.2); g.stroke();
    // sheen toward the window edge
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(255,240,210,0.07)");
    grad.addColorStop(0.4, "rgba(255,240,210,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

function rackFaceTexture() {
  return canvasTex(256, 360, (g, w, h) => {
    g.fillStyle = "#0e1013";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#1c2025";
    g.fillRect(0, 0, 18, h); g.fillRect(w - 18, 0, 18, h);
    g.fillStyle = "#000";
    for (let y = 10; y < h; y += 22) { g.fillRect(6, y, 7, 7); g.fillRect(w - 13, y, 7, 7); }
    const unit = (y, uh, draw) => {
      g.fillStyle = "#15181d";
      g.fillRect(20, y, w - 40, uh - 4);
      g.strokeStyle = "#000"; g.lineWidth = 2;
      g.strokeRect(20, y, w - 40, uh - 4);
      draw(y, uh);
    };
    unit(8, 52, (y) => {
      g.fillStyle = "#d8dee4"; g.font = "700 13px Archivo"; g.fillText("PWR", 30, y + 30);
      for (let i = 0; i < 8; i++) { g.fillStyle = i < 6 ? "#3be07a" : "#222"; g.fillRect(110 + i * 14, y + 20, 8, 12); }
    });
    unit(64, 52, (y) => {
      for (let i = 0; i < 4; i++) {
        g.fillStyle = "#2a2e35"; g.beginPath(); g.arc(50 + i * 46, y + 24, 13, 0, 7); g.fill();
        g.strokeStyle = "#888"; g.lineWidth = 2;
        g.beginPath(); g.moveTo(50 + i * 46, y + 24); g.lineTo(50 + i * 46 + 8, y + 14); g.stroke();
      }
      g.fillStyle = "#e0653a"; g.fillRect(212, y + 18, 8, 8);
    });
    unit(120, 100, (y) => {
      g.fillStyle = "#0a0c0e";
      for (let yy = y + 12; yy < y + 84; yy += 12) g.fillRect(34, yy, w - 68, 5);
    });
    unit(224, 52, (y) => {
      g.fillStyle = "#000";
      for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(38 + i * 15, y + 18, 5, 0, 7); g.fill(); }
      for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(38 + i * 15, y + 36, 5, 0, 7); g.fill(); }
    });
    // scuffed rails
    g.fillStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < 14; i++) g.fillRect(Math.random() < 0.5 ? 2 : w - 16, Math.random() * h, 12, 2);
  });
}

// Kali studio monitor front baffle
function kaliFaceTexture() {
  return canvasTex(256, 420, (g, w, h) => {
    g.fillStyle = "#17191c";
    g.fillRect(0, 0, w, h);
    // subtle vinyl grain
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.02})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
    // tweeter in waveguide
    let grad = g.createRadialGradient(128, 110, 4, 128, 110, 58);
    grad.addColorStop(0, "#0a0b0d"); grad.addColorStop(0.5, "#22262b"); grad.addColorStop(1, "#101216");
    g.fillStyle = grad;
    g.beginPath(); g.arc(128, 110, 58, 0, 7); g.fill();
    g.fillStyle = "#06070a";
    g.beginPath(); g.arc(128, 110, 22, 0, 7); g.fill();
    g.fillStyle = "rgba(180,200,220,0.25)";
    g.beginPath(); g.arc(120, 102, 8, 0, 7); g.fill();
    // woofer
    grad = g.createRadialGradient(128, 268, 10, 128, 268, 86);
    grad.addColorStop(0, "#1d2024"); grad.addColorStop(0.55, "#0b0c0f");
    grad.addColorStop(0.8, "#23272c"); grad.addColorStop(1, "#0a0b0d");
    g.fillStyle = grad;
    g.beginPath(); g.arc(128, 268, 86, 0, 7); g.fill();
    g.strokeStyle = "#000"; g.lineWidth = 6;
    g.beginPath(); g.arc(128, 268, 78, 0, 7); g.stroke();
    g.fillStyle = "#15181c";
    g.beginPath(); g.arc(128, 268, 26, 0, 7); g.fill();
    g.fillStyle = "rgba(255,255,255,0.07)";
    g.beginPath(); g.arc(112, 252, 12, 0, 7); g.fill();
    // front port slot
    g.fillStyle = "#000";
    g.beginPath();
    g.roundRect(48, 374, 160, 22, 11);
    g.fill();
    // logo + power led
    g.fillStyle = "#9aa3ad"; g.font = "700 17px Archivo";
    g.textAlign = "left";
    g.fillText("KALI", 22, 36);
    g.fillStyle = "#3be07a";
    g.fillRect(222, 392, 6, 6);
  });
}

function doorTexture(double = false) {
  return canvasTex(double ? 512 : 256, 640, (g, w, h) => {
    g.fillStyle = "#d8d0bd";
    g.fillRect(0, 0, w, h);
    const panel = (x, y, pw, ph) => {
      g.strokeStyle = "rgba(90,80,60,0.45)"; g.lineWidth = 5;
      g.strokeRect(x, y, pw, ph);
      g.strokeStyle = "rgba(255,255,255,0.25)"; g.lineWidth = 2;
      g.strokeRect(x + 6, y + 6, pw - 12, ph - 12);
    };
    const leaves = double ? 2 : 1;
    for (let l = 0; l < leaves; l++) {
      const ox = l * (w / leaves);
      panel(ox + 22, 30, w / leaves - 44, 250);
      panel(ox + 22, 320, w / leaves - 44, 280);
      if (double) { g.fillStyle = "#9a907a"; g.fillRect(ox + (l ? 4 : w / 2 - 8), 0, 4, h); }
    }
    if (!double) {
      // hand grime around the knob
      const grad = g.createRadialGradient(w - 36, 322, 4, w - 36, 322, 46);
      grad.addColorStop(0, "rgba(95,80,55,0.22)");
      grad.addColorStop(1, "rgba(95,80,55,0)");
      g.fillStyle = grad;
      g.fillRect(w - 90, 270, 90, 104);
    }
    // toe scuffs at the bottom
    for (let i = 0; i < 5; i++) {
      g.fillStyle = `rgba(70,60,42,${0.08 + Math.random() * 0.08})`;
      g.beginPath();
      g.ellipse(Math.random() * w, h - 14 - Math.random() * 26, 14 + Math.random() * 18, 4 + Math.random() * 5, 0.2, 0, 7);
      g.fill();
    }
  });
}

/* ---------------- animated screens ---------------- */

function makeDawScreen() {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 432;
  const g = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const TRACKS = 11;
  const colors = ["#e0653a", "#3be07a", "#5db8ff", "#ffb347", "#c79bff", "#ff6f91", "#7ef5e0"];
  const clips = [];
  for (let tIdx = 0; tIdx < TRACKS; tIdx++) {
    let x = 130 + Math.random() * 80;
    while (x < 980) {
      const wClip = 40 + Math.random() * 150;
      if (Math.random() < 0.75) clips.push({ t: tIdx, x, w: Math.min(wClip, 980 - x), c: colors[tIdx % colors.length] });
      x += wClip + Math.random() * 90;
    }
  }
  let play = 130;
  const meters = new Array(TRACKS).fill(0.4);

  function draw() {
    g.fillStyle = "#101216";
    g.fillRect(0, 0, 1024, 432);
    g.fillStyle = "#1a1d23"; g.fillRect(0, 0, 1024, 26);
    g.fillStyle = "#3be07a"; g.beginPath(); g.moveTo(12, 6); g.lineTo(22, 13); g.lineTo(12, 20); g.fill();
    g.fillStyle = "#d8dee4"; g.font = "11px Archivo"; g.fillText("the metro session — 96 kHz", 36, 17);
    const rowH = (432 - 60) / TRACKS;
    for (let i = 0; i < TRACKS; i++) {
      const y = 32 + i * rowH;
      g.fillStyle = i % 2 ? "#14161b" : "#16191e";
      g.fillRect(0, y, 1024, rowH - 2);
      g.fillStyle = "#1e2228"; g.fillRect(0, y, 126, rowH - 2);
      meters[i] = Math.max(0.05, Math.min(1, meters[i] + (Math.random() - 0.48) * 0.25));
      g.fillStyle = "#22262c"; g.fillRect(96, y + 4, 8, rowH - 10);
      const mh = (rowH - 10) * meters[i];
      g.fillStyle = meters[i] > 0.85 ? "#e05050" : "#3be07a";
      g.fillRect(96, y + 4 + (rowH - 10) - mh, 8, mh);
      g.fillStyle = "#9aa3ad"; g.font = "10px Archivo"; g.fillText(["kick","snare","hats","808","keys","gtr","vox 1","vox 2","pad","fx","bus"][i] || "trk", 8, y + 14);
    }
    for (const cl of clips) {
      const y = 32 + cl.t * rowH;
      g.fillStyle = cl.c + "33";
      g.fillRect(cl.x, y + 2, cl.w, rowH - 6);
      g.strokeStyle = cl.c; g.lineWidth = 1;
      g.strokeRect(cl.x, y + 2, cl.w, rowH - 6);
      g.beginPath();
      const mid = y + rowH / 2 - 1;
      for (let x = cl.x + 2; x < cl.x + cl.w - 2; x += 3) {
        const a = (rowH / 2 - 5) * (0.3 + 0.7 * Math.abs(Math.sin(x * 0.7 + cl.t)));
        g.moveTo(x, mid - a); g.lineTo(x, mid + a);
      }
      g.stroke();
    }
    g.fillStyle = "#1a1d23"; g.fillRect(126, 26, 898, 8);
    play += 1.6;
    if (play > 990) play = 130;
    g.strokeStyle = "#fff"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(play, 26); g.lineTo(play, 432); g.stroke();
    tex.needsUpdate = true;
  }
  draw();
  return { tex, draw };
}

function makeMeterScreen() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 160;
  const g = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const vals = new Array(14).fill(0.3);
  function draw() {
    g.fillStyle = "#0b0d10"; g.fillRect(0, 0, 256, 160);
    g.fillStyle = "#9aa3ad"; g.font = "10px Archivo"; g.fillText("METERS — LUFS -9.8", 10, 16);
    for (let i = 0; i < 14; i++) {
      vals[i] = Math.max(0.04, Math.min(1, vals[i] + (Math.random() - 0.47) * 0.3));
      const h = 120 * vals[i];
      const x = 12 + i * 17;
      g.fillStyle = "#15181d"; g.fillRect(x, 28, 12, 120);
      g.fillStyle = vals[i] > 0.86 ? "#e05050" : vals[i] > 0.65 ? "#ffb347" : "#3be07a";
      g.fillRect(x, 28 + 120 - h, 12, h);
    }
    tex.needsUpdate = true;
  }
  draw();
  return { tex, draw };
}

// Desk clock — real time in Hawthorne, CA
function makeClockScreen() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 96;
  const g = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true,
  });
  let last = "";
  function draw() {
    const now = fmt.format(new Date());
    if (now === last) return;
    last = now;
    const [time, ampm] = now.split(" ");
    g.fillStyle = "#07090b"; g.fillRect(0, 0, 256, 96);
    g.fillStyle = "#52f0c8";
    g.font = "700 58px Archivo, monospace";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(time, 116, 50);
    g.font = "700 20px Archivo";
    g.fillText(ampm || "", 222, 60);
    tex.needsUpdate = true;
  }
  draw();
  return { tex, draw };
}

/* ---------------- the sky through the window ---------------- */

// Downtown LA, precomputed once so the skyline never flickers between
// redraws. Two layers: a low far ridge and the recognizable DTLA cluster
// (one tower gets the slanted Wilshire-Grand crown + red beacon, the
// tallest flat one gets the US-Bank-style crown ring).
const LA = (() => {
  const r = (i) => (Math.abs(Math.sin(i * 127.1) * 43758.5453) % 1);
  const far = [];
  for (let i = 0; i < 26; i++) far.push({ x: i * 30 - 12, w: 20 + r(i) * 20, h: 12 + r(i + 50) * 16 });
  const heights = [78, 64, 96, 58, 110, 72, 122, 66, 88, 96, 54];
  const dt = [];
  let x = 340;
  heights.forEach((h, i) => {
    const b = { x, w: 24 + r(i + 9) * 16, h, i, win: [] };
    for (let k = 0; k < (b.h * b.w) / 48; k++) {
      b.win.push([r(b.i * 7 + k) * b.w * 0.8 + b.w * 0.1, r(b.i * 13 + k * 3) * b.h * 0.85 + 4, r(k + b.i)]);
    }
    dt.push(b);
    x += b.w + 4 + r(i + 30) * 12;
  });
  return { far, dt, wilshire: dt.find(b => b.h === 122), usbank: dt.find(b => b.h === 110) };
})();

// the kaiju. drawn between the far ridge and downtown, so the towers
// stay in front of him — he's miles out, the city's problem, not ours.
// once in a long while he crosses the glass, stops, and lights it up.
function drawZilla(g, z, night) {
  const s = 0.9;
  const bob = Math.abs(Math.sin(z.step)) * -2.6;     // heavy step
  const sway = Math.sin(z.step * 0.5) * 4;
  const lift = z.roar * 16;                          // rears up to breathe
  // solid fill — the limbs overlap each other, alpha would patchwork
  const body = night ? "#10131d" : "#596575";
  g.save();
  g.translate(z.x, 281 + bob * s);
  g.scale(s, s);
  g.fillStyle = body;

  // legs under everything, striding while he walks
  const sw = Math.sin(z.step) * (1 - z.roar);
  for (const d of [1, -1]) {
    const fx = d * sw * 15 + 5;
    g.beginPath();
    g.moveTo(-4 - d * 6, -84);
    g.quadraticCurveTo(fx - 16 + d * 4, -42, fx - 13, 0);
    g.lineTo(fx + 13, 0);
    g.quadraticCurveTo(20 + d * 4, -56, 16 - d * 6, -86);
    g.closePath(); g.fill();
  }

  // tail, heavy at the hip, swaying out behind him
  g.beginPath();
  g.moveTo(-4, -98);
  g.quadraticCurveTo(-58, -76 + sway, -116, -34 + sway * 2);
  g.quadraticCurveTo(-140, -16 + sway * 2.6, -150, -5 + sway * 3);
  g.quadraticCurveTo(-128, -9 + sway * 2.2, -92, -28 + sway * 1.6);
  g.quadraticCurveTo(-50, -50 + sway * 0.8, -6, -62);
  g.closePath(); g.fill();

  // body, neck, head — the head climbs when he's about to breathe
  g.beginPath();
  g.moveTo(-12, -62);
  g.quadraticCurveTo(-20, -108, -2, -138);
  g.quadraticCurveTo(8, -158 - lift, 24, -166 - lift);
  g.lineTo(38, -164 - lift);
  g.lineTo(56, -150 - lift + z.roar * 5);            // jaw drops a touch
  g.lineTo(40, -144 - lift);
  g.lineTo(32, -130 - lift * 0.5);
  g.quadraticCurveTo(36, -98, 28, -70);
  g.quadraticCurveTo(14, -54, -12, -62);
  g.closePath(); g.fill();

  // those famous little arms
  g.beginPath();
  g.moveTo(24, -116); g.lineTo(38, -102); g.lineTo(32, -96); g.lineTo(20, -106);
  g.closePath(); g.fill();

  // dorsal plates, tail to crown; they charge blue before the fire
  for (const [px, py, pr] of [
    [-104, -28, 7], [-76, -46, 9], [-46, -58, 11], [-18, -70, 12],
    [-22, -100, 13], [-12, -128, 11], [2, -150, 8],
  ]) {
    g.fillStyle = z.charge > 0.02
      ? `rgba(${140 + 80 * z.charge | 0},${200 + 40 * z.charge | 0},255,${0.45 + 0.55 * z.charge})`
      : body;
    g.beginPath();
    g.moveTo(px - pr, py + 3);
    g.lineTo(px - pr * 0.1, py - pr * 1.8);
    g.lineTo(px + pr, py + 3);
    g.closePath(); g.fill();
  }

  if (night) {                                       // one mean little eye
    g.fillStyle = "rgba(255,170,70,0.9)";
    g.fillRect(36, -158 - lift, 3, 3);
  }

  // atomic breath, angled down into downtown
  if (z.flame > 0.02) {
    const jx = 56, jy = -148 - lift;
    const len = 150 * z.flame, drop = 58 * z.flame, fl = z.flick;
    const grad = g.createLinearGradient(jx, jy, jx + len, jy + drop);
    grad.addColorStop(0, "rgba(255,255,235,0.95)");
    grad.addColorStop(0.25, "rgba(190,235,255,0.9)");
    grad.addColorStop(0.65, "rgba(120,190,255,0.6)");
    grad.addColorStop(1, "rgba(80,140,255,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(jx, jy - 3);
    for (let i = 1; i <= 4; i++)
      g.lineTo(jx + (len * i) / 4, jy + (drop * i) / 4 - 6 - i * 4 - fl * 6 * (i % 2));
    g.lineTo(jx + len + 10, jy + drop + 5);
    for (let i = 4; i >= 1; i--)
      g.lineTo(jx + (len * i) / 4, jy + (drop * i) / 4 + 8 + i * 5 + fl * 7 * ((i + 1) % 2));
    g.closePath(); g.fill();
    const glow = g.createRadialGradient(jx + len, jy + drop, 4, jx + len, jy + drop, 80);
    glow.addColorStop(0, `rgba(150,200,255,${0.45 * z.flame})`);
    glow.addColorStop(1, "rgba(150,200,255,0)");
    g.fillStyle = glow;
    g.fillRect(jx + len - 80, jy + drop - 80, 160, 160);
  }
  g.restore();
}

// the bat itself: ears, scalloped wings, drawn at (x, y) scaled by s.
// flap > 0 folds the wings into a downbeat for the gliding one
function drawBatShape(g, x, y, s, flap = 0) {
  const w = 1 - 0.25 * Math.max(0, flap);
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.beginPath();
  g.moveTo(-20 * w, -2 - 4 * flap);
  g.quadraticCurveTo(-13, -7, -5, -6);
  g.lineTo(-3.6, -10);
  g.lineTo(-1.8, -6.4);
  g.lineTo(1.8, -6.4);
  g.lineTo(3.6, -10);
  g.lineTo(5, -6);
  g.quadraticCurveTo(13, -7, 20 * w, -2 - 4 * flap);
  g.quadraticCurveTo(13 * w, 3 - 2 * flap, 9 * w, 1);
  g.quadraticCurveTo(6, 6, 3, 3);
  g.quadraticCurveTo(1.4, 7, 0, 7);
  g.quadraticCurveTo(-1.4, 7, -3, 3);
  g.quadraticCurveTo(-6, 6, -9 * w, 1);
  g.quadraticCurveTo(-13 * w, 3 - 2 * flap, -20 * w, -2 - 4 * flap);
  g.closePath();
  g.fill();
  g.restore();
}

// the bat signal: a beam off the US Bank roof paints the logo on the
// clouds for a while — and near the end, something small actually
// glides off the tower and disappears over the basin. night only;
// whoever downtown is calling, it's not our problem either.
function drawBatSignal(g, b, night) {
  if (!night) return;
  const t = b.t;
  const TOP = { x: LA.usbank.x + LA.usbank.w / 2, y: 280 - LA.usbank.h - 12 };
  const SPOT = { x: 236, y: 64 };
  const on = t < 1.4 ? t / 1.4 : t > 17 ? Math.max(0, 1 - (t - 17) / 1.5) : 1;
  if (on > 0.01) {
    const flick = 0.92 + 0.08 * Math.sin(t * 23);
    const grad = g.createLinearGradient(TOP.x, TOP.y, SPOT.x, SPOT.y);
    grad.addColorStop(0, `rgba(255,244,200,${0.30 * on * flick})`);
    grad.addColorStop(1, `rgba(255,244,200,${0.10 * on})`);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(TOP.x - 3, TOP.y);
    g.lineTo(SPOT.x - 30, SPOT.y + 9);
    g.lineTo(SPOT.x + 30, SPOT.y - 9);
    g.lineTo(TOP.x + 3, TOP.y);
    g.closePath(); g.fill();
    const halo = g.createRadialGradient(SPOT.x, SPOT.y, 4, SPOT.x, SPOT.y, 44);
    halo.addColorStop(0, `rgba(255,248,214,${0.5 * on * flick})`);
    halo.addColorStop(1, "rgba(255,248,214,0)");
    g.fillStyle = halo;
    g.beginPath(); g.ellipse(SPOT.x, SPOT.y, 46, 27, -0.16, 0, 7); g.fill();
    g.fillStyle = `rgba(8,10,16,${0.85 * on})`;
    drawBatShape(g, SPOT.x, SPOT.y, 1.5);
  }
  if (t > 13.5 && t < 19.5) {
    const k = (t - 13.5) / 6;
    const bx = TOP.x - k * 330;
    const by = TOP.y - 26 - Math.sin(k * Math.PI) * 46 + Math.sin(t * 9) * 2.5;
    g.fillStyle = "rgba(10,12,18,0.92)";
    drawBatShape(g, bx, by, 0.45, Math.sin(t * 9));
  }
}

// where the jet sits on the sky canvas at progress t (0..1).
// dir +1 = arrival sinking west toward LAX (left → right),
// dir -1 = departure climbing out east (right → left)
function jetXY(t, dir) {
  return dir < 0
    ? { x: 760 - t * 800, y: 120 - t * 74 }
    : { x: -40 + t * 800, y: 46 + t * 74 };
}

// an airliner in profile — nose along +x, ~28px long. drawn mirrored
// for departures, pitched with the path, tumbling when it's been shot.
function drawJet(g, px, py, dir, night, strobe, tumble = 0) {
  g.save();
  g.translate(px, py);
  g.scale(dir < 0 ? -1 : 1, 1);
  g.rotate((dir < 0 ? -0.1 : 0.1) + tumble);
  g.fillStyle = night ? "#c8ccd4" : "#e8ecf2";
  // fuselage: round nose, long cabin, tapered tail cone
  g.beginPath();
  g.moveTo(13.5, 0);
  g.quadraticCurveTo(13, -1.8, 9, -1.8);
  g.lineTo(-9, -1.8);
  g.lineTo(-13, -0.6);
  g.lineTo(-13, 0.6);
  g.lineTo(-9, 1.8);
  g.lineTo(10, 1.8);
  g.quadraticCurveTo(13, 1.6, 13.5, 0);
  g.closePath();
  g.fill();
  // tail fin, swept back
  g.beginPath();
  g.moveTo(-8.5, -1.2);
  g.lineTo(-12.2, -7.2);
  g.lineTo(-14.3, -7.2);
  g.lineTo(-12.8, -1.2);
  g.closePath();
  g.fill();
  // wing, swept back and hanging below the body
  g.beginPath();
  g.moveTo(3.5, 0.8);
  g.lineTo(-4.5, 5.8);
  g.lineTo(-7.3, 5.8);
  g.lineTo(-0.5, 0.8);
  g.closePath();
  g.fill();
  // engine slung under the wing, dark intake facing forward
  g.fillStyle = night ? "#9aa0ac" : "#c4cad4";
  g.fillRect(0.4, 2.7, 5, 2.3);
  g.fillStyle = "#1c2028";
  g.fillRect(4.6, 2.8, 0.9, 2.1);
  // the cabin: lit windows at night, a tinted strip by day
  g.fillStyle = night ? "rgba(255,228,160,0.85)" : "rgba(70,84,100,0.5)";
  g.fillRect(-7.5, -0.95, 15.5, 0.85);
  // beacon on the fin, strobe at the wing root
  g.fillStyle = "#ff3434";
  g.fillRect(-13.9, -8.4, 1.6, 1.6);
  if (strobe) {
    g.fillStyle = "#fff";
    g.fillRect(-2.4, 1.6, 2.2, 2.2);
  }
  if (night) {
    // landing lights reaching ahead
    g.fillStyle = "rgba(255,240,200,0.75)";
    g.fillRect(13.5, 0.6, 9, 1.3);
  }
  g.restore();
}

function makeSky() {
  const c = document.createElement("canvas");
  c.width = 720; c.height = 280;
  const g = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const stars = Array.from({ length: 90 }, () => [Math.random() * 720, Math.random() * 200, Math.random()]);

  function place(az, alt) {
    const azd = az / (Math.PI / 180), altd = alt / (Math.PI / 180);
    if (Math.abs(azd) > 55 || altd < -2 || altd > 60) return null;
    return { x: 360 + (azd / 55) * 340, y: 250 - (altd / 60) * 235 };
  }

  function draw(sun, moon, moonFrac, wx = { clouds: 0, fog: false, rain: 0 }, fx = {}) {
    const sunAlt = sun.altitude / (Math.PI / 180);
    let top, bot;
    if (sunAlt > 5)        { top = "#7fb2e0"; bot = "#c8dcec"; }
    else if (sunAlt > -6)  { top = "#2a3c5e"; bot = "#d88a52"; }
    else if (sunAlt > -12) { top = "#141d33"; bot = "#3a3550"; }
    else                   { top = "#0a0f1f"; bot = "#1a2030"; }
    const grad = g.createLinearGradient(0, 0, 0, 280);
    grad.addColorStop(0, top); grad.addColorStop(1, bot);
    g.fillStyle = grad;
    g.fillRect(0, 0, 720, 280);

    if (sunAlt < -8 && wx.clouds < 0.55) {
      for (const [x, y, r] of stars) {
        g.fillStyle = `rgba(255,255,255,${(0.25 + r * 0.5) * (1 - wx.clouds)})`;
        g.fillRect(x, y, r > 0.8 ? 2 : 1.4, r > 0.8 ? 2 : 1.4);
      }
    }

    // the real cloud cover over LA right now
    if (wx.clouds > 0.1) {
      const dark = sunAlt > 0 ? 225 : 38;
      for (let i = 0; i < wx.clouds * 16; i++) {
        g.fillStyle = `rgba(${dark},${dark},${dark + 6},${0.10 + wx.clouds * 0.16})`;
        const cx = ((i * 137) % 760) - 20, cy = 20 + ((i * 71) % 140);
        g.beginPath();
        g.ellipse(cx, cy, 90 + (i * 31) % 70, 22 + (i * 13) % 16, 0, 0, 7);
        g.fill();
      }
    }
    if (wx.fog) {
      g.fillStyle = "rgba(150,155,160,0.45)";
      g.fillRect(0, 0, 720, 280);
    }

    // ---- downtown LA ----
    const night = sunAlt < -4;
    if (night) {
      const glow = g.createLinearGradient(0, 280, 0, 160);
      glow.addColorStop(0, "rgba(255,150,70,0.4)");
      glow.addColorStop(1, "rgba(255,150,70,0)");
      g.fillStyle = glow;
      g.fillRect(0, 160, 720, 120);
    }
    g.fillStyle = night ? "#0a0c12" : "rgba(95,105,120,0.75)";
    for (const b of LA.far) g.fillRect(b.x, 280 - b.h, b.w, b.h);
    if (fx.zilla) drawZilla(g, fx.zilla, night);   // behind downtown, always
    for (const b of LA.dt) {
      const top = 280 - b.h;
      g.fillStyle = night ? "#0c0e16" : "rgba(70,80,95,0.92)";
      if (b === LA.wilshire) {
        // slanted crown
        g.beginPath();
        g.moveTo(b.x, 280); g.lineTo(b.x, top + 14);
        g.lineTo(b.x + b.w, top); g.lineTo(b.x + b.w, 280);
        g.closePath(); g.fill();
      } else {
        g.fillRect(b.x, top, b.w, b.h);
        if (b === LA.usbank) {
          g.fillRect(b.x + b.w / 2 - 1.5, top - 12, 3, 12);   // spire
          g.fillRect(b.x + 4, top - 4, b.w - 8, 4);           // crown ring
        }
      }
      if (night) {
        for (const [wxp, wy, wr] of b.win) {
          if (wr < 0.55) {
            g.fillStyle = wr < 0.12 ? "rgba(170,210,255,0.8)" : `rgba(255,${200 + (wr * 40) | 0},130,${0.45 + wr * 0.4})`;
            g.fillRect(b.x + wxp, 280 - wy, 1.8, 2.4);
          }
        }
      }
      // Wilshire Grand beacon
      if (b === LA.wilshire && fx.beacon) {
        g.fillStyle = "#ff2030";
        g.fillRect(b.x + b.w - 3, top - 3, 4, 4);
      }
    }

    // ---- a jet on the LAX approach ----
    if (fx.plane) {
      const { t, dir, shot } = fx.plane;
      if (!shot) {
        const { x: px, y: py } = jetXY(t, dir);
        drawJet(g, px, py, dir, night, Math.floor(t * 30) % 2 === 1);
      } else {
        // someone took the shot. a bloom of fire, then the long fall —
        // smoke breadcrumbs all the way down
        const a = shot.age;
        const fallT = Math.max(0, a - 0.25);
        const jx = shot.x + dir * 30 * fallT;
        const jy = shot.y + 170 * fallT * fallT;
        g.fillStyle = "rgba(90,90,96,0.45)";
        for (let i = 1; i <= 7; i++) {
          const tt = fallT * (i / 7);
          const sx = shot.x + dir * 30 * tt, sy = shot.y + 170 * tt * tt;
          g.beginPath();
          g.arc(sx, sy - 2, 1.5 + (fallT - tt) * 5, 0, 7);
          g.fill();
        }
        if (jy < 292) {
          drawJet(g, jx, jy, dir, night, false, fallT * 2.2);
          // burning as it goes
          g.fillStyle = "rgba(255,120,30,0.8)";
          g.beginPath();
          g.arc(jx, jy, 2.6 + ((a * 40) % 2), 0, 7);
          g.fill();
        }
        if (a < 0.8) {
          const k = 1 - a / 0.8;
          g.fillStyle = `rgba(255,160,40,${0.85 * k})`;
          g.beginPath(); g.arc(shot.x, shot.y, 5 + a * 36, 0, 7); g.fill();
          g.fillStyle = `rgba(255,238,190,${0.9 * k})`;
          g.beginPath(); g.arc(shot.x, shot.y, (5 + a * 36) * 0.45, 0, 7); g.fill();
        }
      }
    }

    if (fx.bat) drawBatSignal(g, fx.bat, night);

    const sp = place(sun.azimuth, sun.altitude);
    if (sp && sunAlt > -1) {
      g.fillStyle = "#fff7e0";
      g.shadowColor = "#ffe9b0"; g.shadowBlur = 40;
      g.beginPath(); g.arc(sp.x, sp.y, 18, 0, 7); g.fill();
      g.shadowBlur = 0;
    }
    const mp = place(moon.azimuth, moon.altitude);
    if (mp && moon.altitude > 0) {
      const bright = 0.55 + 0.45 * moonFrac;
      g.fillStyle = `rgba(235,240,248,${bright})`;
      g.shadowColor = "rgba(220,230,250,0.9)"; g.shadowBlur = 26;
      g.beginPath(); g.arc(mp.x, mp.y, 13, 0, 7); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = "rgba(10,15,31,0.85)";
      g.beginPath();
      g.arc(mp.x + 26 * (1 - moonFrac) * (moonFrac < 0.5 ? 1 : -1) * 0.6, mp.y, 13, 0, 7);
      g.fill();
    }
    tex.needsUpdate = true;
  }
  return { tex, draw };
}

function blindsTexture() {
  const t = canvasTex(720, 280, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const slat = 19, gap = 11;
    for (let x = 0; x < w; x += slat + gap) {
      const grad = g.createLinearGradient(x, 0, x + slat, 0);
      grad.addColorStop(0, "rgba(176,169,152,0.94)");
      grad.addColorStop(0.5, "rgba(140,133,116,0.94)");
      grad.addColorStop(1, "rgba(104,98,84,0.94)");
      g.fillStyle = grad;
      g.fillRect(x, 0, slat, h);
    }
    g.fillStyle = "rgba(120,113,97,1)";
    g.fillRect(0, 0, w, 10);
  });
  return t;
}

/* ---------------- world ---------------- */

export function buildWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080b);
  scene.fog = new THREE.Fog(0x07080b, 9, 40);

  const { X, ZF, ZB, H } = ROOM;
  const W = 2 * X;
  const D = ZB - ZF;

  const add = (m) => { scene.add(m); return m; };
  const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  const plane = (w, h, mat) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const lam = (color) => new THREE.MeshLambertMaterial({ color });
  const caster = (m) => { m.castShadow = true; return m; };

  const blockers = [];

  /* --- the radio: a little cream tuner that streams real broadcast (radio.js).
     built twice — Swedish in Desi's cabin, LA in the bedroom — so it's a
     factory. dialLabel is the strip text; hitFlag is the userData key main.js
     keys clicks off ("radio" vs "laradio"). returns the group plus its click
     meshes and the needle/backlight drivers; the caller places it. visual only
     — the audio is a bare <audio> element. --- */
  function makeRadio(dialLabel, hitFlag) {
    const radio = new THREE.Group();
    const cream = lam(0xcdb892), dark = lam(0x2a2622);
    const rbody = caster(box(0.2, 0.11, 0.12, cream));
    rbody.position.y = 0.055;
    rbody.userData[hitFlag] = true;
    radio.add(rbody);
    // a brown trim band wraps the seam between cabinet and faceplate
    const rtrim = box(0.205, 0.012, 0.125, dark);
    rtrim.position.y = 0.018;
    radio.add(rtrim);
    // the speaker grille — left half of the front (front faces the player)
    const grilleTex = canvasTex(120, 110, (g) => {
      g.fillStyle = "#1c1a17"; g.fillRect(0, 0, 120, 110);
      g.fillStyle = "#3a352d";
      for (let y = 6; y < 108; y += 9) for (let x = 6; x < 118; x += 9) { g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); }
    });
    const grille = plane(0.085, 0.075, new THREE.MeshLambertMaterial({ map: grilleTex }));
    grille.position.set(-0.05, 0.06, 0.0605);
    grille.userData[hitFlag] = true;
    radio.add(grille);
    // the tuning dial — right half. a glowing strip, dark until power-on
    const dialTex = canvasTex(180, 80, (g) => {
      g.fillStyle = "#0b0905"; g.fillRect(0, 0, 180, 80);
      g.strokeStyle = "#6b5a32"; g.lineWidth = 1;
      for (let i = 0; i <= 18; i++) { const x = 8 + i * 9.1; const big = i % 3 === 0; g.beginPath(); g.moveTo(x, 14); g.lineTo(x, big ? 30 : 23); g.stroke(); }
      g.fillStyle = "#9c8550"; g.font = "10px monospace";
      g.fillText("88", 6, 44); g.fillText("96", 78, 44); g.fillText("104", 150, 44);
      g.fillStyle = "#c8a85a"; g.font = "bold 11px monospace"; g.fillText(dialLabel, 16, 66);
    });
    const dialMat = new THREE.MeshBasicMaterial({ map: dialTex, color: 0x2a2010 });  // color rides the backlight
    const dialFace = plane(0.085, 0.04, dialMat);
    dialFace.position.set(0.05, 0.075, 0.0605);
    dialFace.userData[hitFlag] = true;
    radio.add(dialFace);
    // the red needle that sweeps the band as you scan
    const RNDL0 = 0.013, RNDL1 = 0.087;   // x range across the dial face
    const needle = box(0.0035, 0.036, 0.004, new THREE.MeshBasicMaterial({ color: 0xff4030 }));
    needle.position.set((RNDL0 + RNDL1) / 2, 0.075, 0.0625);
    needle.visible = false;
    radio.add(needle);
    // two knobs on the lower front — tuning (right) and volume (left)
    for (const kx of [-0.075, 0.075]) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.012, 16), dark);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(kx, 0.028, 0.061);
      knob.userData[hitFlag] = true;
      radio.add(knob);
    }
    // the on-air eye, between the knobs
    const led = box(0.007, 0.007, 0.004, new THREE.MeshBasicMaterial({ color: 0x3a1010 }));
    led.position.set(0, 0.028, 0.0615);
    radio.add(led);
    // a telescoping antenna off the back corner, tilted up
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0035, 0.2, 6),
      new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.8, roughness: 0.3 }));
    antenna.position.set(0.085, 0.13, -0.045);
    antenna.rotation.z = -0.5;
    antenna.rotation.x = -0.2;
    radio.add(antenna);
    blockers.push(rbody);
    return {
      group: radio,
      hits: [rbody, grille, dialFace],
      // slide the needle (frac 0..1 across the band) and light/dim the dial + eye
      setNeedle: (frac) => { needle.position.x = RNDL0 + (RNDL1 - RNDL0) * Math.min(Math.max(frac, 0), 1); },
      setPower: (on) => {
        needle.visible = on;
        dialMat.color.set(on ? 0xffb347 : 0x2a2010);          // amber backlight on
        led.material.color.set(on ? 0x57e389 : 0x3a1010);     // on-air green
      },
    };
  }

  /* --- shell --- */
  const floor = add(plane(W, D, new THREE.MeshLambertMaterial({ map: floorTexture() })));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;

  const ceil = add(plane(W, D, lam(0xd6cfc0)));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = H;
  ceil.receiveShadow = true;

  const walls = [];
  function postableWall(id, w, mat, setup, origin, uDir, normal, opts = {}) {
    const mesh = add(new THREE.Mesh(opts.geometry || new THREE.PlaneGeometry(w, H), mat));
    setup(mesh);
    mesh.userData.postable = true;
    mesh.receiveShadow = true;
    walls.push({
      id, mesh, w, h: H, origin, uDir,
      vDir: new THREE.Vector3(0, 1, 0), normal,
      voids: opts.voids || [],   // rects (meters) where notes can't live, e.g. doorways
    });
    return mesh;
  }

  postableWall("back", W,
    new THREE.MeshLambertMaterial({
      map: wallTexture(W, H),
    }),
    m => { m.rotation.y = Math.PI; m.position.set(0, H / 2, ZB); },
    new THREE.Vector3(X, 0, ZB), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1));

  // west wall has a REAL hole where the closet is (z -1.15..0.35, h 2.03):
  // local x on this wall runs opposite to world z
  const westShape = new THREE.Shape();
  westShape.moveTo(-D / 2, -H / 2);
  westShape.lineTo(D / 2, -H / 2);
  westShape.lineTo(D / 2, H / 2);
  westShape.lineTo(-D / 2, H / 2);
  westShape.closePath();
  const closetHole = new THREE.Path();
  closetHole.moveTo(-0.35, -H / 2);
  closetHole.lineTo(1.15, -H / 2);
  closetHole.lineTo(1.15, -H / 2 + 2.03);
  closetHole.lineTo(-0.35, -H / 2 + 2.03);
  closetHole.closePath();
  westShape.holes.push(closetHole);
  const westGeo = new THREE.ShapeGeometry(westShape);
  const westMap = wallTexture(D, H);
  westMap.repeat.set(1 / D, 1 / H);     // ShapeGeometry uvs are in shape units
  westMap.offset.set(0.5, 0.5);
  postableWall("west", D,
    new THREE.MeshLambertMaterial({ map: westMap }),
    m => { m.rotation.y = Math.PI / 2; m.position.set(-X, H / 2, 0); },
    new THREE.Vector3(-X, 0, ZB), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0),
    {
      geometry: westGeo,
      voids: [
        { u0: 2.87, u1: 4.53, v0: 0, v1: 2.12 },   // closet doorway
        // the bathroom door is gone (it's all studio now) — that stretch
        // is bare wall again, so notes are welcome back on it
      ],
    });

  postableWall("east", D,
    new THREE.MeshLambertMaterial({
      map: wallTexture(D, H),
    }),
    m => { m.rotation.y = -Math.PI / 2; m.position.set(X, H / 2, 0); },
    new THREE.Vector3(X, 0, ZF), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0),
    {
      voids: [
        { u0: 5.06, u1: 6.14, v0: 0, v1: 2.12 },     // entry door
        { u0: 4.50, u1: 5.08, v0: 1.26, v1: 1.84 },  // the gold record's spot
      ],
    });

  const front = add(plane(W, H, new THREE.MeshLambertMaterial({
    map: wallTexture(W, H),
  })));
  front.position.set(0, H / 2, ZF);
  front.receiveShadow = true;

  /* --- acoustic panels: real 7 cm slabs, not paint --- */
  const panelMat = new THREE.MeshLambertMaterial({
    map: canvasTex(128, 256, (g) => {
      g.fillStyle = "#23262e"; g.fillRect(0, 0, 128, 256);
      g.fillStyle = "rgba(255,255,255,0.05)";
      for (let y = 0; y < 256; y += 5) g.fillRect(0, y, 128, 2);
      g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 6;
      g.strokeRect(2, 2, 124, 252);
    }),
  });
  // [wall, u, v, w, h] in each wall's note coordinates
  const PANEL_DEFS = [
    ["back", 0.56, 1.0, 0.6, 1.2], ["back", 1.72, 1.0, 0.6, 1.2],
    ["back", 2.88, 1.0, 0.6, 1.2], ["back", 4.04, 1.0, 0.6, 1.2],
    ["west", 0.31, 1.0, 0.55, 1.2], ["west", 1.17, 1.0, 0.55, 1.2],
    // the corner slab by desi's door sat on top of three real notes —
    // moved to the bare pier between the closet and her door, slimmed
    // to fit the strip. nothing lives there, nothing gets hidden.
    ["west", 2.03, 1.0, 0.55, 1.2], ["west", 4.565, 1.0, 0.28, 1.2],
    // where the bathroom door used to be — the room is all studio now
    ["west", 5.13, 1.0, 0.55, 1.2],
    ["east", 0.58, 1.0, 0.55, 1.2], ["east", 1.71, 1.0, 0.55, 1.2],
    ["east", 2.85, 1.0, 0.55, 1.2], ["east", 3.98, 1.0, 0.55, 1.2],
  ];
  // soft LED halo behind every slab — thin emissive rails just proud
  // of the wall, peeking around the slab edges
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0.85 });
  function ledRim(slab, pw, ph) {
    for (const [lw, lh, ox, oy] of [
      [pw + 0.07, 0.02, 0, ph / 2 + 0.035], [pw + 0.07, 0.02, 0, -ph / 2 - 0.035],
      [0.02, ph + 0.07, pw / 2 + 0.035, 0], [0.02, ph + 0.07, -pw / 2 - 0.035, 0],
    ]) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(lw, lh, 0.012), ledMat);
      led.position.set(ox, oy, -0.022);     // local: tucked behind the slab face
      slab.add(led);
    }
  }
  for (const [wid, pu, pv, pw, ph] of PANEL_DEFS) {
    const wall = walls.find(w2 => w2.id === wid);
    const center = wall.origin.clone()
      .addScaledVector(wall.uDir, pu + pw / 2)
      .addScaledVector(wall.vDir, pv + ph / 2)
      .addScaledVector(wall.normal, 0.038);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 0.07), panelMat);
    slab.position.copy(center);
    slab.lookAt(center.clone().add(wall.normal));
    slab.castShadow = true;
    slab.receiveShadow = true;
    add(slab);
    blockers.push(slab);
    ledRim(slab, pw, ph);
    // notes keep clear of the slabs
    wall.voids.push({ u0: pu - 0.04, u1: pu + pw + 0.04, v0: pv - 0.04, v1: pv + ph + 0.04 });
  }
  // the front wall's two painted panels become slabs too
  for (const fx4 of [-2.32, 2.2]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.2, 0.07), panelMat);
    slab.position.set(fx4, 1.6, ZF + 0.038);
    slab.castShadow = true;
    add(slab);
    blockers.push(slab);
    ledRim(slab, 0.55, 1.2);
  }

  /* --- the window (faces south over LA) --- */
  const WIN = { w: 3.6, h: 1.4, cx: 0, cy: 1.6 };
  const sky = makeSky();
  // show a window onto a WIDER sky, so walking sideways pans the view —
  // cheap, convincing parallax for a backdrop at infinity
  sky.tex.repeat.x = 0.78;
  sky.tex.offset.x = 0.11;
  const glass = add(plane(WIN.w, WIN.h, new THREE.MeshBasicMaterial({ map: sky.tex })));
  glass.position.set(WIN.cx, WIN.cy, ZF + 0.01);
  glass.userData.glass = true;   // clickable: the plane hunt
  function setParallax(camX) {
    sky.tex.offset.x = Math.max(0, Math.min(0.22, 0.11 - camX * 0.028));
  }

  // rain running down the glass when it's actually raining in Hawthorne
  const rainTex = canvasTex(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * 256, len = 18 + Math.random() * 60;
      const y = Math.random() * 256;
      const grad2 = g.createLinearGradient(0, y, 0, y + len);
      grad2.addColorStop(0, "rgba(200,220,240,0)");
      grad2.addColorStop(0.8, `rgba(200,220,240,${0.25 + Math.random() * 0.3})`);
      grad2.addColorStop(1, "rgba(230,240,250,0.6)");
      g.fillStyle = grad2;
      g.fillRect(x, y, 1.4, len);
      g.fillStyle = "rgba(220,235,250,0.5)";
      g.fillRect(x - 0.6, y + len, 2.6, 2.6);
    }
  });
  rainTex.wrapS = rainTex.wrapT = THREE.RepeatWrapping;
  const rainPane = add(plane(WIN.w, WIN.h, new THREE.MeshBasicMaterial({
    map: rainTex, transparent: true, opacity: 0.55, depthWrite: false,
  })));
  rainPane.position.set(WIN.cx, WIN.cy, ZF + 0.02);
  rainPane.visible = false;

  const blindsMat = new THREE.MeshLambertMaterial({
    map: blindsTexture(), transparent: true, side: THREE.DoubleSide, alphaTest: 0.4,
  });
  const blinds = add(plane(WIN.w - 0.06, WIN.h - 0.04, blindsMat));
  blinds.position.set(WIN.cx, WIN.cy, ZF + 0.045);
  blinds.castShadow = true;   // the slats stripe the room
  blinds.userData.blinds = true;
  // click them and they gather to the left so the city shows clean.
  // anim 0 = drawn across the glass, 1 = bunched at the edge
  const blindsState = { open: false, anim: 0 };
  function toggleBlinds() { blindsState.open = !blindsState.open; return blindsState.open; }
  function setBlinds(open) { blindsState.open = !!open; }
  function tickBlinds(dt) {
    const want = blindsState.open ? 1 : 0;
    if (Math.abs(blindsState.anim - want) < 0.001) return;
    blindsState.anim += (want - blindsState.anim) * Math.min(1, dt * 5);
    const k = 1 - blindsState.anim * 0.82;         // gather to 18% — still a fat click target
    blinds.scale.x = k;
    // the stack parks INSIDE the glass, clear of the open-curtain
    // bundle at the window edge, so it can always be clicked shut
    const openX = WIN.cx - (WIN.w - 0.06) / 2 + 0.42 + (WIN.w - 0.06) * 0.18 / 2;
    blinds.position.x = WIN.cx + (openX - WIN.cx) * blindsState.anim;
  }

  const frameMat = lam(0xcfc6b2);
  for (const [fw, fh, fx, fy] of [
    [WIN.w + 0.12, 0.07, 0, WIN.cy + WIN.h / 2 + 0.035],
    [WIN.w + 0.12, 0.07, 0, WIN.cy - WIN.h / 2 - 0.035],
    [0.07, WIN.h + 0.14, -WIN.w / 2 - 0.035, WIN.cy],
    [0.07, WIN.h + 0.14, WIN.w / 2 + 0.035, WIN.cy],
  ]) {
    const f = caster(box(fw, fh, 0.06, frameMat));
    f.position.set(fx, fy, ZF + 0.03);
    add(f);
  }
  const sill = caster(box(WIN.w + 0.2, 0.04, 0.14, frameMat));
  sill.position.set(WIN.cx, WIN.cy - WIN.h / 2 - 0.09, ZF + 0.07);
  add(sill);

  // blackout curtains — click to draw them. Each side hangs from a pivot
  // at the outer edge and scales inward until they meet in the middle.
  const curtMat = new THREE.MeshLambertMaterial({ color: 0x2b2620 });
  const curtains = { closed: false, anim: 0 };   // anim: 0 open .. 1 closed
  const curtainPivots = [];
  const curtainHits = [];
  for (const side of [-1, 1]) {
    const piv = new THREE.Group();
    piv.position.set(side * (WIN.w / 2 + 0.12), WIN.cy + 0.08, ZF + 0.10);
    const slab = box(1, WIN.h + 0.5, 0.05, curtMat);
    slab.position.x = -side * 0.5;
    slab.castShadow = true;
    piv.add(slab);
    for (let i = 1; i <= 4; i++) {
      const fold = box(0.022, WIN.h + 0.5, 0.064, curtMat);
      fold.position.set(-side * (i / 5), 0, 0.01);
      piv.add(fold);
    }
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1, WIN.h + 0.5, 0.2),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.x = -side * 0.5;
    hit.userData.curtain = true;
    piv.add(hit);
    curtainHits.push(hit);
    add(piv);
    curtainPivots.push(piv);
  }
  function applyCurtainAnim() {
    const wOpen = 0.5, wClosed = WIN.w / 2 + 0.16;
    const w = wOpen + (wClosed - wOpen) * curtains.anim;
    curtainPivots.forEach(p => { p.scale.x = w; });
  }
  applyCurtainAnim();
  function toggleCurtains() {
    curtains.closed = !curtains.closed;
    return curtains.closed;
  }
  function setCurtains(closed) { curtains.closed = !!closed; }
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, WIN.w + 0.7, 8), lam(0x4a443a));
  rod.rotation.z = Math.PI / 2;
  rod.position.set(WIN.cx, WIN.cy + WIN.h / 2 + 0.3, ZF + 0.11);
  add(rod);

  // Shadow mask: invisible casters covering the front wall EXCEPT the
  // window, so the beam can only truly enter through the glass — like
  // real life. Thick, double-sided boxes: they occlude reliably from
  // every sun/moon angle (thin one-sided planes don't).
  const maskMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  maskMat.side = THREE.DoubleSide;
  maskMat.shadowSide = THREE.DoubleSide;
  for (const [mw, mh, mx, my] of [
    [(W - WIN.w) / 2 + 0.4, H + 0.4, -(WIN.w / 2 + (W - WIN.w) / 4) - 0.1, H / 2],  // left of window
    [(W - WIN.w) / 2 + 0.4, H + 0.4, WIN.w / 2 + (W - WIN.w) / 4 + 0.1, H / 2],     // right of window
    [WIN.w, H - (WIN.cy + WIN.h / 2) + 0.4, 0, (H + WIN.cy + WIN.h / 2) / 2 + 0.2], // above
    [WIN.w, WIN.cy - WIN.h / 2, 0, (WIN.cy - WIN.h / 2) / 2],                       // below
  ]) {
    const mask = new THREE.Mesh(new THREE.BoxGeometry(mw, mh, 0.12), maskMat);
    mask.position.set(mx, my, ZF - 0.1);
    mask.castShadow = true;
    add(mask);
  }
  // the arcade room is windowless — keep the beam out of it entirely
  const arcMaskS = new THREE.Mesh(new THREE.BoxGeometry(6.0, H + 0.4, 0.12), maskMat);
  arcMaskS.position.set(-5.6, H / 2, -2.96);
  arcMaskS.castShadow = true;
  add(arcMaskS);
  const arcMaskW = new THREE.Mesh(new THREE.BoxGeometry(0.12, H + 0.4, 5.6), maskMat);
  arcMaskW.position.set(-8.3, H / 2, -0.4);
  arcMaskW.castShadow = true;
  add(arcMaskW);

  /* --- ALL room light comes from outside --- */
  // soft spill just inside the glass — tight radius so it reads as
  // window glow, not a lamp lighting the whole wall
  const windowLight = add(new THREE.PointLight(0x9fb6e8, 0, 5.5, 2));
  windowLight.position.set(WIN.cx, WIN.cy, ZF + 0.6);
  // the beam: parallel rays from where the sun/moon actually is,
  // throwing real shadows (including the blind slats) into the room
  // a SPOTLIGHT, not a directional: its cone covers the bedroom+arcade
  // and physically cannot reach the boat across the void (directionals
  // illuminate the whole scene regardless of light.layers)
  const beam = new THREE.SpotLight(0xfff0d8, 0, 80, 0.85, 0.35, 0);
  beam.castShadow = true;
  beam.shadow.mapSize.set(2048, 2048);
  beam.shadow.camera.near = 2; beam.shadow.camera.far = 50;
  beam.shadow.bias = -0.0004;
  add(beam);
  beam.target.position.set(0, 0.6, 0);
  add(beam.target);
  // sky bounce — the only "ambient", and it follows the sky too
  const skyFill = add(new THREE.HemisphereLight(0x8a96a8, 0x2a241c, 0.3));

  /* --- the astro ceiling: a star projector for the real sky ---
     After dusk the bedroom ceiling carries tonight's actual stars:
     25 bright ones placed by sidereal time, the Big Dipper joined
     up and named, the moon with its true phase, and the naked-eye
     planets from a pocket ephemeris. Fisheye look-up projection —
     zenith mid-ceiling, horizons at the walls. The room faces the
     window south (-z); west is +x, like the sunlight already knows. */
  const astroCanvas = document.createElement("canvas");
  astroCanvas.width = 640; astroCanvas.height = 800;
  const astroTex = new THREE.CanvasTexture(astroCanvas);
  astroTex.colorSpace = THREE.SRGBColorSpace;
  const astroPlane = add(new THREE.Mesh(
    new THREE.PlaneGeometry(W - 0.12, D - 0.12),
    new THREE.MeshBasicMaterial({
      map: astroTex, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })));
  astroPlane.rotation.x = Math.PI / 2;          // face the floor
  astroPlane.position.set(0, H - 0.02, 0);
  astroPlane.visible = false;

  function drawAstro() {
    const g = astroCanvas.getContext("2d");
    const cw = 640, ch = 800, cx = cw / 2, cy = ch / 2;
    const Rx = cx * 0.94, Ry = cy * 0.94;
    g.clearRect(0, 0, cw, ch);
    const now = new Date();

    // alt/az → ceiling spot: zenith center, horizon at the walls.
    // az is from south toward west; canvas top = north, right = west
    const spot = (p) => {
      if (p.altitude < 0.035) return null;
      const f = 1 - p.altitude / (Math.PI / 2);
      return { x: cx + Math.sin(p.azimuth) * f * Rx, y: cy + Math.cos(p.azimuth) * f * Ry };
    };
    const dot = (s, r, tint, soft = 2.6) => {
      const glow = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * soft);
      glow.addColorStop(0, tint);
      glow.addColorStop(0.35, tint.startsWith("rgba") ? tint : tint + "99");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = glow;
      g.beginPath(); g.arc(s.x, s.y, r * soft, 0, 7); g.fill();
    };
    const label = (s, text, dy = 16) => {
      g.fillStyle = "rgba(190,205,235,0.6)";
      g.font = "11px Archivo, sans-serif";
      g.textAlign = "center";
      g.fillText(text, s.x, s.y + dy);
    };

    // cardinal letters around the rim, so you can orient yourself
    g.fillStyle = "rgba(170,185,215,0.5)";
    g.font = "13px Archivo, sans-serif";
    g.textAlign = "center";
    g.fillText("n", cx, 22);
    g.fillText("s", cx, ch - 12);
    g.fillText("w", cw - 14, cy + 4);
    g.fillText("e", 14, cy + 4);

    // the stars — the dipper's seven are the catalog tail
    const spots = STARS.map(([name, ra, dec, mag, tint]) => {
      const s = spot(getStarPosition(now, LAT, LNG, ra, dec));
      if (s) dot(s, Math.max(1.6, 4.6 - mag * 1.1), tint);
      return s;
    });
    for (const [i, name] of [[0, "sirius"], [2, "arcturus"], [3, "vega"], [10, "antares"], [17, "polaris"]]) {
      if (spots[i]) label(spots[i], name);
    }

    // join the dipper: bowl, then the handle's long curve
    const dip = spots.slice(18);
    g.strokeStyle = "rgba(150,170,210,0.30)";
    g.lineWidth = 1.2;
    for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]]) {
      if (dip[a] && dip[b]) {
        g.beginPath(); g.moveTo(dip[a].x, dip[a].y); g.lineTo(dip[b].x, dip[b].y); g.stroke();
      }
    }
    if (dip[3] && dip[4]) {
      label({ x: (dip[3].x + dip[4].x) / 2, y: (dip[3].y + dip[4].y) / 2 }, "the big dipper", 24);
    }

    // wandering stars, named — the part no toy projector gets right
    for (const p of getPlanetPositions(now, LAT, LNG)) {
      const s = spot(p);
      if (!s) continue;
      dot(s, Math.max(2, 4.2 - p.mag * 0.9), p.tint);
      label(s, p.name);
    }

    // the moon, with tonight's actual face
    const mpos = getMoonPosition(now, LAT, LNG);
    const ms = spot(mpos);
    if (ms) {
      const frac = getMoonIllumination(now).fraction;
      dot(ms, 9, "rgba(235,240,250,0.9)", 2.0);
      g.fillStyle = "rgba(232,238,250,0.95)";
      g.beginPath(); g.arc(ms.x, ms.y, 9, 0, 7); g.fill();
      g.fillStyle = "rgba(8,9,14,0.9)";
      g.beginPath();
      g.arc(ms.x + 18 * (1 - frac) * (frac < 0.5 ? 1 : -1) * 0.6, ms.y, 9, 0, 7);
      g.fill();
      label(ms, "moon", 24);
    }
    astroTex.needsUpdate = true;
  }

  // dusk fades it in, dawn takes it back
  function updateAstro(sunAlt) {
    const k = Math.max(0, Math.min(1, (-sunAlt * 57.3 - 4) / 6));
    astroPlane.material.opacity = k * 0.92;
    astroPlane.visible = k > 0.02;
    if (astroPlane.visible) drawAstro();
  }

  let wx = { clouds: 0, rain: 0, fog: false };
  let skyCache = null;
  let plane01 = null;        // 0..1 while a jet crosses the glass
  let planeDir = 1;          // +1 arrival (left → right), -1 departure
  let planeShot = null;      // {x, y, age} once someone takes the shot
  let zilla = null;          // walk state while the kaiju is out there
  let bat = null;            // {t} while the signal burns over downtown

  const planeFx = () =>
    plane01 == null ? null : { t: plane01, dir: planeDir, shot: planeShot };

  function redrawSky(beaconOn) {
    if (!skyCache) return;
    sky.draw(skyCache.sun, skyCache.moon, skyCache.fraction, wx,
      { beacon: beaconOn, plane: planeFx(), zilla, bat });
  }

  function updateSky() {
    const now = new Date();
    const sun = getSunPosition(now, LAT, LNG);
    const moon = getMoonPosition(now, LAT, LNG);
    const { fraction } = getMoonIllumination(now);
    skyCache = { sun, moon, fraction };
    sky.draw(sun, moon, fraction, wx, { beacon: true, plane: planeFx(), zilla, bat });

    // aim the beam from where the body actually hangs over LA.
    // The window faces due south; in room coordinates that makes
    // west = +x, east = -x. SunCalc azimuth is 0 at south, positive
    // toward the west — so a western sun sits at +x, eastern at -x:
    // morning light rakes in from the left of the glass, evening
    // from the right, exactly like the real room.
    const src = sun.altitude > -0.05 ? sun : moon;
    const az = Math.max(-0.9, Math.min(0.9, src.azimuth));   // clamp into window view
    const alt = Math.max(0.06, src.altitude);
    beam.position.set(
      WIN.cx + Math.sin(az) * 10,
      WIN.cy + Math.tan(alt) * 10,
      ZF - 10
    );

    const sunAlt = sun.altitude, moonAlt = moon.altitude;
    if (sunAlt > 0) {                       // day
      windowLight.color.set(0xfff0d8);
      windowLight.intensity = 4 + 12 * Math.sin(Math.min(sunAlt, 1.2));
      beam.color.set(0xfff2da);
      beam.intensity = 0.7 + 1.6 * Math.sin(Math.min(sunAlt, 1.2));
      skyFill.color.set(0xaebbd0); skyFill.groundColor.set(0x6a5e4c);
      skyFill.intensity = 0.85;
    } else if (sunAlt > -0.2) {             // twilight
      const k = 1 + sunAlt / 0.2;           // 1 → 0 as it gets darker
      windowLight.color.set(0xd8915a);
      windowLight.intensity = 1 + 3.5 * k;
      beam.color.set(0xe8a060);
      beam.intensity = 0.45 * k + (moonAlt > 0 ? 0.25 * fraction : 0);
      skyFill.color.set(0x9a8da0); skyFill.groundColor.set(0x4a4034);
      skyFill.intensity = 0.2 + 0.4 * k;
    } else if (moonAlt > 0) {               // moonlight, scaled by phase
      windowLight.color.set(0x9fb6e8);
      windowLight.intensity = 0.7 + 3.5 * Math.sin(moonAlt) * fraction;
      beam.color.set(0xbfd0ee);
      beam.intensity = 0.12 + 0.55 * Math.sin(moonAlt) * fraction;
      skyFill.color.set(0x6a7890); skyFill.groundColor.set(0x2a241c);
      skyFill.intensity = 0.22;
    } else {                                // just the city below
      windowLight.color.set(0x8a7a9a);
      windowLight.intensity = 0.28;
      beam.color.set(0x7a7080);
      beam.intensity = 0.04;
      skyFill.color.set(0x565e6e); skyFill.groundColor.set(0x241f18);
      skyFill.intensity = 0.10;
    }

    // clouds soften everything; rain a touch more
    const dim = Math.max(0.18, 1 - 0.65 * wx.clouds - (wx.rain ? 0.12 : 0));
    beam.intensity *= dim;
    windowLight.intensity *= Math.max(0.3, 1 - 0.45 * wx.clouds);
    skyFill.intensity *= Math.max(0.5, 1 - 0.3 * wx.clouds);

    updateAstro(sunAlt);

    // remember the open-curtain levels; the curtains gate them per-frame
    lightBase.beam = beam.intensity;
    lightBase.win = windowLight.intensity;
    lightBase.fill = skyFill.intensity;
    applyLights();
  }
  const lightBase = { beam: 0, win: 0, fill: 0 };
  function applyLights() {
    // curtains drawn → outside light dies; only the screens, the neon and
    // the clock keep the room visible (plus a whisper so it's navigable)
    const k = 1 - curtains.anim;
    beam.intensity = lightBase.beam * k;
    windowLight.intensity = lightBase.win * k + 0.004;
    skyFill.intensity = lightBase.fill * k + 0.015;
  }
  updateSky();

  function setWeather(w) {
    wx = w || wx;
    rainPane.visible = wx.rain > 0;
    updateSky();
  }

  /* --- doors --- */
  function door(w, h, x, z, rotY, double = false, knobLeft = false) {
    const grp = new THREE.Group();
    // doors sit flush in walls — they receive light but never cast shadows
    const leaf = box(w, h, 0.045, new THREE.MeshLambertMaterial({ map: doorTexture(double) }));
    leaf.position.y = h / 2;
    grp.add(leaf);
    const fm = lam(0xc4bba6);
    for (const side of [-1, 1]) {
      const jamb = box(0.06, h + 0.06, 0.08, fm);
      jamb.position.set(side * (w / 2 + 0.03), (h + 0.06) / 2, 0);
      grp.add(jamb);
      blockers.push(jamb);
    }
    const head = box(w + 0.12, 0.06, 0.08, fm);
    head.position.set(0, h + 0.03, 0);
    grp.add(head);
    blockers.push(head);
    if (!double) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xb8b29a, metalness: 0.85, roughness: 0.3 }));
      knob.position.set((knobLeft ? -1 : 1) * (w / 2 - 0.09), 1.02, 0.05);
      grp.add(knob);
    }
    grp.position.set(x, 0, z);
    grp.rotation.y = rotY;
    add(grp);
    blockers.push(leaf);
    return grp;
  }
  // the bathroom door is gone — METRO OS is the way to her room now.
  // an acoustic slab hangs where it stood (see PANEL_DEFS), and the
  // freed corner holds the e-kit.
  const entryDoor = door(0.86, 2.03, X - 0.035, 2.3, -Math.PI / 2, false, true);  // handle on the left

  /* --- the electronic drum kit, west-front corner ---
     an 80s Simmons: black hexagonal pads on a tubular rack, heads
     tipped up to face whoever walks over, big hex kick front and
     center. the kit sits in the corner angled into the room. --- */
  const edrumHits = [];
  const ekit = new THREE.Group();
  const padMat = () => lam(0x141417);
  const rimMat = new THREE.MeshBasicMaterial({ color: 0x39c2ff });
  const tubeMatE = lam(0x26282e);
  // hex pad leaning back ~30° from vertical, face toward the player (+z)
  function epad(idx, r, x2, y2, lean = 1.06) {
    const grp2 = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.055, 6), padMat());
    grp2.add(pad);
    // rubber striking face, a shade lighter so the hex reads
    const face = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.018, r - 0.018, 0.012, 6), lam(0x202126));
    face.position.y = 0.03;
    grp2.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r - 0.004, 0.011, 6, 6), rimMat.clone());
    rim.rotation.x = Math.PI / 2;
    rim.rotation.z = Math.PI / 6;          // align the hex ring with the pad
    rim.position.y = 0.034;
    grp2.add(rim);
    grp2.position.set(x2, y2, 0.04);
    grp2.rotation.x = lean;                // head up and at you
    pad.userData.edrum = idx;
    face.userData.edrum = idx;
    rim.userData.edrum = idx;
    ekit.add(grp2);
    edrumHits.push(pad, face, rim);
    blockers.push(pad);
    return rim;
  }
  const edrumRims = [];
  // top row across the rack: hat, toms, crash
  edrumRims[2] = epad(2, 0.115, -0.40, 0.92);
  edrumRims[3] = epad(3, 0.115, -0.135, 0.95);
  edrumRims[4] = epad(4, 0.115, 0.135, 0.95);
  edrumRims[5] = epad(5, 0.115, 0.40, 0.92);
  // the snare, bigger, low row middle-left
  edrumRims[1] = epad(1, 0.14, -0.14, 0.64, 1.12);
  // big hex kick standing nearly vertical, front and center
  const kickGrp = new THREE.Group();
  const kick = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.09, 6), padMat());
  kick.userData.edrum = 0;
  kickGrp.add(kick);
  const kickRing = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.012, 6, 6), rimMat.clone());
  kickRing.rotation.x = Math.PI / 2;
  kickRing.rotation.z = Math.PI / 6;
  kickRing.position.y = 0.05;
  kickGrp.add(kickRing);
  kickGrp.position.set(0.10, 0.26, 0.18);
  kickGrp.rotation.x = 1.45;               // face square at the player
  ekit.add(kickGrp);
  edrumHits.push(kick, kickRing);
  blockers.push(kick);
  edrumRims[0] = kickRing;
  // the tubular rack holding it all up
  for (const sd of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.92, 8), tubeMatE);
    leg.position.set(sd * 0.52, 0.46, 0);
    ekit.add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.42, 8), tubeMatE);
    foot.position.set(sd * 0.52, 0.02, 0);
    foot.rotation.x = Math.PI / 2;
    ekit.add(foot);
  }
  for (const by of [0.84, 0.56]) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.08, 8), tubeMatE);
    bar.position.set(0, by, 0.01);
    bar.rotation.z = Math.PI / 2;
    ekit.add(bar);
  }
  ekit.position.set(-1.95, 0, -2.6);
  ekit.rotation.y = 0.85;                 // out of the corner, into the room
  add(ekit);
  // pad flash when anyone hits it
  const edrumFlash = new Array(6).fill(0);
  function pressEdrum(pad) { edrumFlash[Math.max(0, Math.min(5, pad))] = 1; }
  function tickEdrums(dt) {
    for (let i = 0; i < 6; i++) {
      if (edrumFlash[i] <= 0) continue;
      edrumFlash[i] = Math.max(0, edrumFlash[i] - dt * 5);
      const rim = edrumRims[i];
      if (rim) rim.material.color.setHSL(0.55, 1, 0.5 + edrumFlash[i] * 0.45);
    }
  }

  /* --- the telecaster, yellow with a white guard, between desk and rack --- */
  const guitarHits = [];
  const tele = new THREE.Group();
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-0.14, -0.18);
  bodyShape.quadraticCurveTo(-0.21, -0.05, -0.15, 0.07);
  bodyShape.quadraticCurveTo(-0.11, 0.15, -0.045, 0.155);   // upper bout into the cutaway
  bodyShape.quadraticCurveTo(0.02, 0.15, 0.05, 0.1);
  bodyShape.quadraticCurveTo(0.16, 0.13, 0.185, 0.0);
  bodyShape.quadraticCurveTo(0.19, -0.13, 0.07, -0.185);
  bodyShape.quadraticCurveTo(-0.04, -0.22, -0.14, -0.18);
  const teleBody = new THREE.Mesh(
    new THREE.ExtrudeGeometry(bodyShape, { depth: 0.045, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.006 }),
    lam(0xf2c84b));
  // the solid body is silent — only the strings/fretboard/neck sound (it stays
  // a blocker below so the body is still click-solid, just doesn't pluck)
  tele.add(teleBody);
  const guardShape = new THREE.Shape();
  guardShape.moveTo(-0.13, -0.15);
  guardShape.quadraticCurveTo(-0.17, -0.03, -0.12, 0.06);
  guardShape.quadraticCurveTo(-0.08, 0.12, -0.03, 0.12);
  guardShape.lineTo(0.0, -0.04);
  guardShape.quadraticCurveTo(-0.02, -0.16, -0.13, -0.15);
  const guard = new THREE.Mesh(new THREE.ExtrudeGeometry(guardShape, { depth: 0.004, bevelEnabled: false }),
    lam(0xf4f1e8));
  guard.position.z = 0.046;
  tele.add(guard);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.58, 0.022), lam(0xd8b878));
  neck.position.set(0.0, 0.155 + 0.29 - 0.02, 0.022);
  neck.userData.guitar = true;
  tele.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.018), lam(0xe2c685));
  head.position.set(0.012, 0.155 + 0.58 + 0.04, 0.022);
  tele.add(head);
  const fretboard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.58, 0.005), lam(0x4a3526));
  fretboard.position.set(0, neck.position.y, 0.036);
  fretboard.userData.guitar = true;
  tele.add(fretboard);
  // the strings span body→headstock; they (with the fretboard/neck) are the
  // only things that pluck — give each a fatter invisible hit-proxy so the
  // thin visible string is actually clickable, then collect them all
  const strings = [];
  for (const sx of [-0.012, 0, 0.012]) {
    const str = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.74, 0.0022),
      new THREE.MeshBasicMaterial({ color: 0xd9dde2 }));
    str.position.set(sx, 0.26, 0.052);
    tele.add(str);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.74, 0.01),
      new THREE.MeshBasicMaterial({ visible: false }));
    grip.position.set(sx, 0.26, 0.052);
    grip.userData.guitar = true;
    tele.add(grip);
    strings.push(grip);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 0.012),
    new THREE.MeshStandardMaterial({ color: 0xb9bec6, metalness: 0.8, roughness: 0.35 }));
  bridge.position.set(0.02, -0.12, 0.052);
  tele.add(bridge);
  // a chrome control plate with a blade selector — flick it to change the
  // guitar's voice (tele/acoustic/nylon/palm-mute). its own click target so a
  // flick switches tone without sounding a fret. sits on the lower treble bout,
  // clear of the strings (x≈0) and the guard (negative x).
  const ctrlPlate = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.022, 0.006),
    new THREE.MeshStandardMaterial({ color: 0xc6cbd2, metalness: 0.85, roughness: 0.28 }));
  ctrlPlate.position.set(0.115, -0.04, 0.05);
  ctrlPlate.rotation.z = -0.5;
  ctrlPlate.userData.guitarVoice = true;
  tele.add(ctrlPlate);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.024, 0.013), lam(0x16181c));
  blade.position.set(0.115, -0.04, 0.059);
  blade.userData.guitarVoice = true;
  tele.add(blade);
  const guitarVoiceHits = [blade, ctrlPlate];
  // flick the blade across the plate to the voice's slot (0..total-1)
  function setGuitarVoiceSwitch(idx, total) {
    const t = total > 1 ? idx / (total - 1) : 0;
    blade.rotation.z = -0.5 + (t - 0.5) * 0.7;
  }
  setGuitarVoiceSwitch(0, 4);
  // the A-frame stand
  for (const sd of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.46, 8), lam(0x23262b));
    leg.position.set(sd * 0.1, 0.21, -0.06);
    leg.rotation.z = sd * 0.32;
    tele.add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.2, 8), lam(0x23262b));
    foot.position.set(sd * 0.16, 0.02, 0.02);
    foot.rotation.x = Math.PI / 2.4;
    tele.add(foot);
  }
  // parked in the pocket between the right monitor and the rack —
  // forward of the speaker cab so nothing clips through the body
  tele.position.set(1.58, 0.21, ZF + 0.58);
  tele.rotation.x = -0.16;                 // leaning back on the stand
  tele.rotation.y = 0.3;
  add(tele);
  guitarHits.push(neck, fretboard, ...strings);
  blockers.push(teleBody);
  let teleWiggle = 0;
  function strumTele() { teleWiggle = 1; }
  function tickTele(dt) {
    if (teleWiggle <= 0) return;
    teleWiggle = Math.max(0, teleWiggle - dt * 2.4);
    tele.rotation.z = Math.sin(teleWiggle * 22) * 0.02 * teleWiggle;
  }

  /* --- the pedalboard: overdrive + delay + reverb on the floor in front of
     the tele. every guitarist's signal chain ends up here, so the tele's
     cable should too — a tilted board with three stompboxes and a coiled
     patch. (the FX are real now — see ambience.buildGuitarFx.) --- */
  // every stompbox (guitar + keyboard pedals) registers here so a click can
  // toggle its effect on/off and dim or light its LED — wired up in main.js.
  const stompHits = [];
  const stompLEDs = {};
  const registerStomp = (enc, sw, led, ledCol, id) => {
    enc.userData.stomp = id; sw.userData.stomp = id;
    stompHits.push(enc, sw);
    const lit = new THREE.Color(ledCol);
    stompLEDs[id] = { led, on: lit, off: lit.clone().multiplyScalar(0.1) };   // a dim ember when bypassed
  };
  function setStompLED(id, on) {
    const s = stompLEDs[id]; if (!s) return;
    s.led.material.color.copy(on ? s.on : s.off);
  }

  const pedalboard = new THREE.Group();
  // slanted board, back edge lifted so the switches face you
  const pbPlate = box(0.5, 0.018, 0.2, lam(0x18191d));
  pbPlate.position.set(0, 0.055, 0);
  pbPlate.rotation.x = -0.26;              // tilt up toward the player
  pedalboard.add(pbPlate);
  // little rubber feet at the front so the board doesn't float
  for (const fx of [-0.2, 0.2]) {
    const ft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), lam(0x0d0e10));
    ft.position.set(fx, 0.015, 0.085);
    pedalboard.add(ft);
  }
  // a stompbox: enclosure, footswitch, two knobs, status LED. mounted on the
  // tilt. pass an `id` and it becomes click-to-toggle (registerStomp).
  function stompbox(px, bodyCol, ledCol, id) {
    const pg = new THREE.Group();
    const enc = box(0.105, 0.055, 0.125, lam(bodyCol));
    enc.position.y = 0.0275;
    pg.add(enc);
    // the big footswitch up front
    const sw = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.022, 12), lam(0xb9bec6));
    sw.position.set(0, 0.06, 0.04);
    pg.add(sw);
    // two control knobs across the top
    for (const kx of [-0.026, 0.026]) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.016, 10), lam(0x111214));
      knob.position.set(kx, 0.056, -0.034);
      pg.add(knob);
    }
    // the lit-when-on LED, kept emissive so the toon pass leaves it glowing
    const led = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.006, 8),
      new THREE.MeshBasicMaterial({ color: ledCol }));
    led.position.set(0, 0.058, 0.006);
    pg.add(led);
    pg.position.set(px, 0.064, -0.012);
    pg.rotation.x = -0.26;                 // sit flush on the tilted board
    pedalboard.add(pg);
    if (id) registerStomp(enc, sw, led, ledCol, id);
  }
  stompbox(-0.15, 0x8a3b1e, 0xff7a3c, "gtr-od");      // overdrive — burnt orange, amber eye
  stompbox(0, 0x1f7a6e, 0x46f0d6, "gtr-delay");       // delay — teal, green eye
  stompbox(0.15, 0x35307a, 0x8a7bff, "gtr-reverb");   // reverb — indigo, violet eye

  /* --- the filter treadle: a wah-style rocker, FIRST in the chain ---
     sits on the floor left of the board (signal hits it before the
     overdrive). rock it (click opens a vertical slider): toe-down = the
     lowpass wide open / no cut, heel-up = it sweeps down to 100 Hz. --- */
  const wah = new THREE.Group();
  const wahBase = box(0.135, 0.05, 0.215, lam(0x101216));
  wahBase.position.y = 0.025;
  wah.add(wahBase);
  // the rocking foot plate, pivoting about its middle like a real treadle
  const treadle = new THREE.Group();
  const tPlate = box(0.125, 0.02, 0.205, lam(0x7a1f2a));     // cry-baby burgundy
  tPlate.position.y = 0.01;
  treadle.add(tPlate);
  for (const tz of [-0.06, -0.02, 0.02, 0.06]) {            // grip ridges
    const r = box(0.115, 0.006, 0.012, lam(0x0c0d0f));
    r.position.set(0, 0.023, tz);
    treadle.add(r);
  }
  // a lit eye on the toe so you can read it from across the room (basic mat = glows)
  const wahLed = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe04a }));
  wahLed.position.set(0, 0.026, 0.092);
  treadle.add(wahLed);
  treadle.position.set(0, 0.052, 0);
  treadle.userData.gtrFilter = true; tPlate.userData.gtrFilter = true;
  wahBase.userData.gtrFilter = true;
  wah.add(treadle);
  wah.position.set(-0.44, 0, 0.0);
  pedalboard.add(wah);
  const filterPedalHit = [tPlate, treadle, wahBase];
  // rock the treadle to show the cutoff: pct 1 = toe-down (open), 0 = heel-down
  function setGuitarPedalTilt(pct) {
    const p = Math.max(0, Math.min(1, pct));
    treadle.rotation.x = 0.34 - p * 0.6;     // heel-down (nose up) → toe-down
  }
  setGuitarPedalTilt(1);   // arrives wide open
  // the patch cable snaking back toward the guitar's jack
  const patch = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.42, 6), lam(0x0c0d0f));
  patch.position.set(0.25, 0.05, -0.06);
  patch.rotation.set(0.5, 0.0, -0.7);
  pedalboard.add(patch);
  // tucked on the floor just in front of the tele, squared to its stand
  pedalboard.position.set(1.52, 0, ZF + 1.02);
  pedalboard.rotation.y = 0.3;
  add(pedalboard);

  /* --- the closet (z -1.15..0.35 on the west wall) ---
     The left leaf is hinged: click it and it swings AWAY from you,
     into the closet, revealing what's inside. --- */
  const CZ = -0.4, OPEN_W = 1.5, OPEN_H = 2.03, ALCOVE_D = 0.95;
  // frame
  const cfm = lam(0xc4bba6);
  for (const fz of [CZ - OPEN_W / 2 - 0.03, CZ + OPEN_W / 2 + 0.03]) {
    const jamb = box(0.08, OPEN_H + 0.06, 0.06, cfm);
    jamb.position.set(-X + 0.01, (OPEN_H + 0.06) / 2, fz);
    add(jamb);
    blockers.push(jamb);
  }
  const chead = box(0.08, 0.06, OPEN_W + 0.12, cfm);
  chead.position.set(-X + 0.01, OPEN_H + 0.03, CZ);
  add(chead);
  blockers.push(chead);

  // passage shell — a short corridor through the wall into the arcade.
  // it used to poke 15 cm into the bedroom like a bunker mouth; now every
  // piece stops just SHY of the bedroom wall plane, so the white wall
  // hides the shell and the tan door frame is the only border you see.
  // each piece ends at a slightly different x so no faces are coplanar.
  const alcMat = lam(0x4a443c);
  const corrPiece = (i) => {
    // BOTH ends staggered — shared end planes were the original z-fight
    const x0 = -X - ALCOVE_D - 0.03 - i * 0.004;  // arcade-side end
    const x1 = -X - 0.005 - i * 0.004;            // bedroom-side end, behind the wall
    return { len: x1 - x0, cx: (x1 + x0) / 2 };
  };
  const cp0 = corrPiece(0);
  for (const sz of [-1, 1]) {
    const side = box(cp0.len, OPEN_H + 0.1, 0.1, alcMat.clone());
    side.position.set(cp0.cx, OPEN_H / 2, CZ + sz * (OPEN_W / 2 + 0.05));
    add(side);
  }
  const cp1 = corrPiece(1);
  const alcTop = box(cp1.len, 0.12, OPEN_W + 0.2, lam(0x3a352e));
  alcTop.position.set(cp1.cx, OPEN_H + 0.06, CZ);
  add(alcTop);
  const cp2 = corrPiece(2);
  const alcFloor = box(cp2.len, 0.06, OPEN_W + 0.2, lam(0x2e2a24));
  alcFloor.position.set(cp2.cx, -0.02, CZ);
  add(alcFloor);
  // header sealing the gap above the passage — covers the arcade side,
  // invisible from the bedroom
  const cp3 = corrPiece(3);
  const corrHeader = box(cp3.len, H - OPEN_H + 0.2, OPEN_W + 0.16, alcMat.clone());
  corrHeader.position.set(cp3.cx, OPEN_H + (H - OPEN_H) / 2 + 0.06, CZ);
  add(corrHeader);
  // threshold strip where carpet meets arcade carpet
  const threshold = box(0.1, 0.025, OPEN_W, lam(0x8a6a4a));
  threshold.position.set(-X, 0.012, CZ);
  add(threshold);

  // both leaves hinged at their outer edges; click either and the pair
  // swings open into the closet, away from you. Open by default — the
  // arcade is part of the room.
  const closet = { open: true, anim: 1 };
  const leafMat = () => new THREE.MeshLambertMaterial({ map: doorTexture(false) });

  const hinge = new THREE.Group();             // left leaf
  hinge.position.set(-X + 0.035, 0, CZ + OPEN_W / 2);
  const leftLeaf = box(0.045, OPEN_H, OPEN_W / 2, leafMat());
  leftLeaf.position.set(0, OPEN_H / 2, -OPEN_W / 4);
  leftLeaf.userData.closet = true;
  hinge.add(leftLeaf);
  add(hinge);

  const hinge2 = new THREE.Group();            // right leaf, mirrored
  hinge2.position.set(-X + 0.035, 0, CZ - OPEN_W / 2);
  const rightLeaf = box(0.045, OPEN_H, OPEN_W / 2, leafMat());
  rightLeaf.position.set(0, OPEN_H / 2, OPEN_W / 4);
  rightLeaf.userData.closet = true;
  hinge2.add(rightLeaf);
  add(hinge2);
  hinge.rotation.y = 1.5;       // start open
  hinge2.rotation.y = -1.5;

  function toggleCloset() {
    closet.open = !closet.open;
    return closet.open;
  }
  function setCloset(open) { closet.open = !!open; }

  /* --- METRO'S ARCADE: the big room beyond the closet --- */
  // a proper amusement arcade now: ~16 x 11 m. the doorway is on the EAST
  // wall (x1), aligned with the closet opening and dead-centered in z (the
  // room is symmetric about CZ). it grows toward -x — away from the boat at
  // +40 — and stays windowless, so it's lit by downward SPOTLIGHTS only:
  // three.js lights ignore walls, and a directional or long-throw point
  // light would pour straight through the shared wall into the bedroom.
  const AR = { x0: -19.6, x1: -X - ALCOVE_D, z0: -5.9, z1: 5.1 };
  const ARC_H = 4.3;   // a tall hall — high enough to arc a basketball without clipping the roof
  const LIGHT_H = 3.4; // the downlight grid hangs here (pendant-style), not at the raised ceiling,
                       // so the floor stays as lit as it was before the roof went up
  // double-sided: these walls must be solid from BOTH sides, or you can
  // see straight through them from inside the arcade
  const arcMatWall = new THREE.MeshLambertMaterial({ color: 0x191722, side: THREE.DoubleSide });
  const arcW = AR.x1 - AR.x0, arcD = AR.z1 - AR.z0;
  // front (east) wall (two segments + lintel around the doorway)
  for (const [w0, w1] of [[AR.z0, CZ - OPEN_W / 2], [CZ + OPEN_W / 2, AR.z1]]) {
    const seg = plane(w1 - w0, ARC_H, arcMatWall.clone());
    seg.rotation.y = Math.PI / 2;
    seg.position.set(AR.x1, ARC_H / 2, (w0 + w1) / 2);
    add(seg);
  }
  const lintel = plane(OPEN_W, ARC_H - OPEN_H, arcMatWall.clone());
  lintel.rotation.y = Math.PI / 2;
  lintel.position.set(AR.x1, OPEN_H + (ARC_H - OPEN_H) / 2, CZ);
  add(lintel);
  // back (west), sides, ceiling
  const arcBack = plane(arcD, ARC_H, arcMatWall.clone());
  arcBack.rotation.y = -Math.PI / 2;
  arcBack.position.set(AR.x0, ARC_H / 2, (AR.z0 + AR.z1) / 2);
  add(arcBack);
  for (const [zz, ry] of [[AR.z0, 0], [AR.z1, Math.PI]]) {
    const side = plane(arcW, ARC_H, arcMatWall.clone());
    side.rotation.y = ry;
    side.position.set((AR.x0 + AR.x1) / 2, ARC_H / 2, zz);
    add(side);
  }
  const arcCeil = plane(arcW, arcD, lam(0x0e0d14));
  arcCeil.rotation.x = Math.PI / 2;
  arcCeil.position.set((AR.x0 + AR.x1) / 2, ARC_H, (AR.z0 + AR.z1) / 2);
  add(arcCeil);
  // arcade carpet — dark with neon confetti
  const arcFloor = plane(arcW, arcD, new THREE.MeshLambertMaterial({
    map: canvasTex(512, 512, (g) => {
      g.fillStyle = "#14122a"; g.fillRect(0, 0, 512, 512);
      const cols = ["#ff2da0", "#22d4ff", "#ffe93c", "#9d4dff", "#3bff7a"];
      for (let i = 0; i < 260; i++) {
        g.strokeStyle = cols[i % cols.length];
        g.lineWidth = 2.5;
        const x = Math.random() * 512, y = Math.random() * 512, a = Math.random() * 6.3;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * 16, y + Math.sin(a) * 16);
        g.stroke();
      }
    }),
  }));
  arcFloor.rotation.x = -Math.PI / 2;
  arcFloor.position.set((AR.x0 + AR.x1) / 2, 0.002, (AR.z0 + AR.z1) / 2);
  add(arcFloor);
  // tile the confetti so it stays fine-grained across the big floor instead
  // of stretching to dinner-plate scrawls
  const arcMap = arcFloor.material.map;
  arcMap.wrapS = arcMap.wrapT = THREE.RepeatWrapping;
  arcMap.repeat.set(3.4, 2.4);

  // neon cove trim running the length of both long walls, near the ceiling
  for (const [zz, col] of [[AR.z0 + 0.04, 0xff2da0], [AR.z1 - 0.04, 0x22d4ff]]) {
    const strip = box(arcW - 0.3, 0.03, 0.03, new THREE.MeshBasicMaterial({ color: col }));
    strip.position.set((AR.x0 + AR.x1) / 2, ARC_H - 0.14, zz);
    add(strip);
  }

  /* --- lighting: DOWNWARD SPOTLIGHTS ONLY ---
     the arcade shares a wall with the bedroom and three.js lights ignore
     geometry, so a point light's only leash is its `distance` falloff and a
     directional reaches the whole scene. spot CONES aim at the floor and
     physically can't splash sideways through the wall — the one safe way to
     flood a big windowless hall this close to home. a few short-throw colored
     points add arcade glow, but only DEEP in the room where -2.6 (the bedroom
     wall) is well out of their reach. */
  function arcSpot(x, z, color, intensity) {
    const s = new THREE.SpotLight(color, intensity, 8.5, 0.72, 0.55, 1.5);
    s.position.set(x, LIGHT_H - 0.04, z);
    s.target.position.set(x, 0, z);
    add(s); add(s.target);
    // a visible can so each pool of light reads as a fixture, not magic. a thin
    // rod hangs it down from the raised ceiling so it reads as a pendant.
    const rod = box(0.02, ARC_H - (LIGHT_H - 0.04), 0.02, lam(0x0c0e12));
    rod.position.set(x, (ARC_H + LIGHT_H - 0.04) / 2, z); add(rod);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.1, 12), lam(0x0c0e12));
    can.position.set(x, LIGHT_H - 0.05, z);
    add(can);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.1, 14),
      new THREE.MeshBasicMaterial({ color }));
    glow.rotation.x = Math.PI / 2;
    glow.position.set(x, LIGHT_H - 0.108, z);
    add(glow);
  }
  // a warm/cool grid over the whole floor (the door bay near x1 is left to
  // the smoking corner's own warm downlights)
  let arcSi = 0;
  for (const gx of [-6.6, -10.2, -13.8, -17.4]) {
    for (const gz of [-3.6, 0.4, 3.8]) {
      arcSpot(gx, gz, (arcSi++ % 2) ? 0xffe6c4 : 0xccd6ff, 40);
    }
  }
  // deep neon pools — short throw, far from the bedroom wall
  const magenta = add(new THREE.PointLight(0xff2da0, 14, 4.2, 2));
  magenta.position.set(-12, 2.3, -4.7);
  const cyan = add(new THREE.PointLight(0x22d4ff, 14, 4.2, 2));
  cyan.position.set(-15, 2.3, 4.5);
  const violet = add(new THREE.PointLight(0x9d4dff, 12, 4.0, 2));
  violet.position.set(-18.6, 2.2, -0.4);

  /* --- the smoking corner: two stools flanking the arcade door ---
     warm downlights in all that neon, a bong on one side, an ashtray
     and a joint on the other. click → bubbles or crackle, a puff of
     smoke, and ten soft seconds where the edges of the world blur. */
  const smokeHits = [];
  const smokeSpots = {};   // kind -> world position the puffs rise from
  function smokeStool(z) {
    const grp = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.07, 14), lam(0x6a4a86));
    seat.position.y = 0.47;
    seat.castShadow = true;
    grp.add(seat);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 8), lam(0x3c4050));
    pole.position.y = 0.23;
    grp.add(pole);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.03, 12), lam(0x2c3040));
    base.position.y = 0.015;
    grp.add(base);
    grp.position.set(AR.x1 - 0.75, 0, z);
    add(grp);
    blockers.push(seat);
  }
  function smokeTable(z, rimColor) {
    const grp = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 14), lam(0x4a4258));
    top.position.y = 0.52;
    top.castShadow = true;
    grp.add(top);
    // neon edge, so the corner reads from across the room
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.008, 6, 24),
      new THREE.MeshBasicMaterial({ color: rimColor }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.525;
    grp.add(rim);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), lam(0x343848));
    pole.position.y = 0.26;
    grp.add(pole);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 12), lam(0x282c3a));
    base.position.y = 0.015;
    grp.add(base);
    grp.position.set(AR.x1 - 0.38, 0, z);
    add(grp);
    blockers.push(top);
    return grp;
  }
  for (const z of [CZ + 1.7, CZ - 1.7]) {
    smokeStool(z);
    // a warm cone in the neon: fixture on the ceiling + short-throw light
    const fix = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.06, 10), lam(0x0c0e12));
    fix.position.set(AR.x1 - 0.6, ARC_H - 0.03, z);
    add(fix);
    const fixGlow = new THREE.Mesh(new THREE.CircleGeometry(0.04, 10),
      new THREE.MeshBasicMaterial({ color: 0xffc890 }));
    fixGlow.rotation.x = Math.PI / 2;
    fixGlow.position.set(AR.x1 - 0.6, ARC_H - 0.065, z);
    add(fixGlow);
    // hung low enough to actually reach the seats; throw stays shorter
    // than the gap to the bedroom wall, as the house rules demand
    const down = add(new THREE.PointLight(0xffb070, 10, 1.5, 2));
    down.position.set(AR.x1 - 0.6, 1.95, z);
  }
  {
    // the bong, on the north table — green glass, doing its best
    const t1 = smokeTable(CZ + 1.7, 0x22d4ff);
    const glass = new THREE.MeshLambertMaterial({ color: 0x6fae7e, transparent: true, opacity: 0.55 });
    const base = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), glass);
    base.position.y = 0.6;
    base.scale.y = 0.8;
    t1.add(base);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.034, 0.3, 10), glass);
    neck.position.y = 0.76;
    t1.add(neck);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.012, 0.09, 8), lam(0x3c3328));
    bowl.position.set(0.07, 0.63, 0);
    bowl.rotation.z = -0.8;
    t1.add(bowl);
    for (const m of [base, neck, bowl]) { m.userData.smoke = "bong"; smokeHits.push(m); }
    smokeSpots.bong = new THREE.Vector3(AR.x1 - 0.38, 0.93, CZ + 1.7);

    // ashtray + a waiting joint on the south table
    const t2 = smokeTable(CZ - 1.7, 0xff2da0);
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.03, 12), lam(0x4a4f5a));
    tray.position.y = 0.55;
    t2.add(tray);
    const joint = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.075, 6), lam(0xe8e2d2));
    joint.position.set(0.045, 0.575, 0.02);
    joint.rotation.z = 1.25;
    joint.rotation.y = 0.5;
    t2.add(joint);
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xff7a30 }));
    ember.position.set(0.082, 0.59, 0.038);
    t2.add(ember);
    for (const m of [tray, joint]) { m.userData.smoke = "joint"; smokeHits.push(m); }
    smokeSpots.joint = new THREE.Vector3(AR.x1 - 0.32, 0.62, CZ - 1.68);
  }

  // the smoke itself: soft billboarded puffs that rise, swell and thin
  const smokeTex = canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    r.addColorStop(0, "rgba(225,228,235,0.85)");
    r.addColorStop(0.6, "rgba(210,214,224,0.35)");
    r.addColorStop(1, "rgba(200,205,215,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  });
  const puffGeo = new THREE.PlaneGeometry(0.12, 0.12);
  const puffs = [];
  function puffSmoke(kind) {
    const src = smokeSpots[kind] || smokeSpots.bong;
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({
        map: smokeTex, transparent: true, opacity: 0, depthWrite: false,
      }));
      m.position.set(src.x + rand(-0.02, 0.02), src.y, src.z + rand(-0.02, 0.02));
      m.visible = false;
      m.userData.p = {
        t: -i * 0.16, vx: rand(-0.05, 0.05), vy: 0.26 + rand(0, 0.14),
        vz: rand(-0.05, 0.05), r0: 0.5 + rand(0, 0.5), sway: rand(0, 6),
      };
      add(m);
      puffs.push(m);
    }
  }
  function tickPuffs(dt, ppos) {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const m = puffs[i], p = m.userData.p;
      p.t += dt;
      if (p.t < 0) continue;
      if (p.t > 3.4) {
        scene.remove(m);
        m.material.dispose();
        puffs.splice(i, 1);
        continue;
      }
      m.visible = true;
      m.position.x += (p.vx + Math.sin(p.t * 2.4 + p.sway) * 0.02) * dt;
      m.position.y += p.vy * dt;
      m.position.z += p.vz * dt;
      p.vy *= 1 - 0.22 * dt;
      const k = p.t / 3.4;
      m.scale.setScalar(p.r0 + k * 4.2);
      m.material.opacity = 0.34 * (k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88);
      if (ppos) m.lookAt(ppos.x, m.position.y, ppos.z);
    }
  }

  // "METRO'S ARCADE" — neon on the arcade's back wall (the bedroom
  // never advertises it; you find the closet, you find the room)
  const arcSignTex = canvasTex(512, 96, (g) => {
    g.fillStyle = "rgba(0,0,0,0)"; g.clearRect(0, 0, 512, 96);
    g.font = "500 52px 'Six Caps', sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.letterSpacing = "8px";
    g.shadowColor = "#ff2da0"; g.shadowBlur = 14;
    g.strokeStyle = "#ff6ac0"; g.lineWidth = 2.5;
    g.strokeText("METRO'S ARCADE", 256, 50);
    g.shadowBlur = 0;
    g.fillStyle = "#ffe9f6";
    g.fillText("METRO'S ARCADE", 256, 50);
  });
  const arcSign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.36), new THREE.MeshBasicMaterial({
    map: arcSignTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  arcSign.rotation.y = Math.PI / 2;
  arcSign.position.set(AR.x0 + 0.02, 2.65, (AR.z0 + AR.z1) / 2);
  arcSign.scale.setScalar(1.6);   // big wall, big sign
  add(arcSign);

  // the Echo VR poster — step through, no password anymore
  const posterTex = new THREE.TextureLoader().load("assets/img/echo.jpg");
  posterTex.colorSpace = THREE.SRGBColorSpace;
  const echoPoster = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.85),
    new THREE.MeshBasicMaterial({ map: posterTex }));
  // south wall — on your right as you walk in; centered, and floated
  // off the wall so it can't z-fight with the planks up close
  echoPoster.position.set((AR.x0 + AR.x1) / 2, 1.5, AR.z0 + 0.1);
  echoPoster.userData.portalArena = true;
  add(echoPoster);
  const posterFrame = box(1.58, 0.93, 0.03, lam(0x0c0e14));
  posterFrame.position.set((AR.x0 + AR.x1) / 2, 1.5, AR.z0 + 0.07);
  add(posterFrame);

  // cabinet factory — one per game
  const arcadeHits = [];
  const attracts = [];
  function cabinet(game, title, color, x, z, rotY, soon = false) {
    const grp = new THREE.Group();
    const body = box(0.62, 1.7, 0.6, lam(soon ? 0x0c0c10 : 0x14161a));
    body.position.y = 0.85;
    grp.add(body);
    const mTex = canvasTex(256, 64, (g) => {
      g.fillStyle = soon ? "#0a0a0e" : "#120020";
      g.fillRect(0, 0, 256, 64);
      g.font = "900 30px monospace";
      g.textAlign = "center";
      g.fillStyle = soon ? "#3a3a44" : "#ffd23c";
      if (!soon) { g.shadowColor = color; g.shadowBlur = 12; }
      g.fillText(title, 128, 42);
    });
    const mq = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.16), new THREE.MeshBasicMaterial({ map: mTex }));
    mq.position.set(0, 1.6, 0.301);
    grp.add(mq);
    let scr;
    if (soon) {
      scr = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.36), new THREE.MeshBasicMaterial({
        map: canvasTex(128, 96, (g) => {
          g.fillStyle = "#050507"; g.fillRect(0, 0, 128, 96);
          g.font = "10px monospace"; g.textAlign = "center";
          g.fillStyle = "#3a3a44";
          g.fillText("COMING SOON", 64, 48);
        }),
      }));
    } else {
      const at = makeAttractScreen(THREE, title, color);
      attracts.push(at);
      scr = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.36), new THREE.MeshBasicMaterial({ map: at.tex }));
    }
    scr.position.set(0, 1.18, 0.301);
    scr.rotation.x = -0.08;
    grp.add(scr);
    const deck = box(0.56, 0.06, 0.3, lam(0x1d2026));
    deck.rotation.x = 0.18;
    deck.position.set(0, 0.92, 0.36);
    grp.add(deck);
    const stick = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), lam(0xc02030));
    stick.position.set(-0.12, 1.0, 0.4);
    grp.add(stick);
    for (const bx of [0.06, 0.13, 0.2]) {
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 10), lam(0xffd23c));
      btn.rotation.x = 0.18;
      btn.position.set(bx, 0.965, 0.395);
      grp.add(btn);
    }
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.8, 0.75),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.9;
    if (soon) hit.userData.arcadeSoon = title;
    else hit.userData.arcade = game;
    grp.add(hit);
    arcadeHits.push(hit);
    grp.position.set(x, 0, z);
    grp.rotation.y = rotY;
    add(grp);
  }
  // the four classic machines: a row along the back (west) wall, screens
  // facing east down the length of the hall toward whoever walks in
  cabinet("defender", "DEFENDER", "#ff3434", AR.x0 + 0.42, -3.0, Math.PI / 2);
  cabinet("doom", "DOOM", "#ff7320", AR.x0 + 0.42, -1.1, Math.PI / 2);
  cabinet("tron", "TRON", "#22d4ff", AR.x0 + 0.42, 0.8, Math.PI / 2);
  cabinet("pong", "PONG", "#e8e8e8", AR.x0 + 0.42, 2.7, Math.PI / 2);

  // HIGH SCORES board on the north wall — shared, all-time
  const scoreCanvas = document.createElement("canvas");
  scoreCanvas.width = 512; scoreCanvas.height = 384;
  const scoreTex = new THREE.CanvasTexture(scoreCanvas);
  scoreTex.colorSpace = THREE.SRGBColorSpace;
  function updateScores(rows = []) {
    const g = scoreCanvas.getContext("2d");
    g.fillStyle = "#06060c";
    g.fillRect(0, 0, 512, 384);
    g.strokeStyle = "#ff2da0";
    g.lineWidth = 5;
    g.strokeRect(8, 8, 496, 368);
    g.font = "900 34px monospace";
    g.textAlign = "center";
    g.fillStyle = "#ffd23c";
    g.fillText("★ HIGH SCORES ★", 256, 54);
    g.font = "16px monospace";
    g.fillStyle = "#22d4ff";
    g.fillText("DEFENDER — ALL TIME", 256, 84);
    g.font = "700 20px monospace";
    if (!rows.length) {
      g.fillStyle = "#5a5a6a";
      g.fillText("no heroes yet", 256, 180);
    }
    rows.slice(0, 8).forEach((r, i) => {
      const y = 122 + i * 32;
      g.textAlign = "left";
      g.fillStyle = i === 0 ? "#ffd23c" : "#d8dee4";
      g.fillText(`${i + 1}. ${String(r.name || "anon").slice(0, 12)}`, 48, y);
      g.textAlign = "right";
      g.fillText(String(r.score), 464, y);
    });
    scoreTex.needsUpdate = true;
  }
  updateScores();
  const scoreBoard = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.28),
    new THREE.MeshBasicMaterial({ map: scoreTex }));
  scoreBoard.rotation.y = Math.PI;
  scoreBoard.scale.setScalar(1.25);
  scoreBoard.position.set(-16, 1.75, AR.z1 - 0.06);   // north wall, by the cabinets
  add(scoreBoard);

  /* --- floor plan: every game that's coming gets its footprint taped out
     on the carpet now. so the empty hall reads as an arcade mid-build, not a
     bare box — and every later session has an exact, claimed spot to drop its
     table into. subtle: a dashed neon outline + a dim stencil, nothing you'd
     trip on. these are MeshBasic decals (toon pass skips them) just proud of
     the carpet. delete a marker the session its real game lands. */
  function zoneMarker(label, cx, cz, w, d, color) {
    const c = "#" + color.toString(16).padStart(6, "0");
    const ch = Math.max(128, Math.round(320 * d / w));
    const tex = canvasTex(320, ch, (g, cw, chh) => {
      // a dark mat that dims the confetti beneath, so the zone reads as a
      // claimed floor panel and not a thin line lost in the carpet
      g.fillStyle = "rgba(8,9,18,0.62)";
      g.fillRect(0, 0, cw, chh);
      g.strokeStyle = c; g.lineWidth = 7; g.setLineDash([26, 16]);
      g.strokeRect(12, 12, cw - 24, chh - 24);
      g.setLineDash([]);
      g.fillStyle = c;
      g.font = "700 40px monospace";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(label, cw / 2, chh / 2);
      g.globalAlpha = 0.6;
      g.font = "600 18px monospace";
      g.fillText("coming soon", cw / 2, chh / 2 + 36);
    });
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.82, depthWrite: false,
      }));
    decal.rotation.x = -Math.PI / 2;
    decal.rotation.z = Math.PI;   // labels read facing the door, not the back wall
    decal.position.set(cx, 0.006, cz);
    add(decal);
  }
  // staked-out zones (centers + footprints). non-overlapping, with aisles;
  // tuned again when each real table arrives.
  // (POOL marker retired — the real table lands below)
  // air hockey rotated long-axis N-S (table ends face the long walls) and
  // tucked into the south row, in the gap between foosball (west) and the
  // bar (east) — ~2 m clear of each
  zoneMarker("AIR HOCKEY", -10.1, -3.6, 2.2, 3.6, 0x22d4ff);
  zoneMarker("BAR",        -6.0, -3.6, 2.0, 3.6, 0xff7a30);

  /* ============================================================
     POOL / 8-BALL — a real in-world table. world.js builds the
     furniture + the balls + the cue + the aim guide and hands them
     back; pool.js runs the turn-based game (aim, power, 2D physics on
     the cloth plane). Turn-based + a drawn aim line = deliberate and
     controllable, on purpose. Long axis runs E-W. Table-local coords:
     u = x-centre (length), w = z-centre (width).
     ============================================================ */
  const pool = (() => {
    const PT = { x: -9.0, z: 2.9 };
    const surfaceY = 0.78;
    const hl = 1.2, hw = 0.6;             // playfield half-extents (length, width)
    const r = 0.03;                       // ball radius
    const pocketR = 0.072;
    const railTop = 0.05;                 // cushion rises this far above cloth
    const woodH = 0.1;                    // wooden rail cap thickness

    const grp = new THREE.Group();
    grp.position.set(PT.x, 0, PT.z);

    const wood = lam(0x4a2c18), woodDark = lam(0x351d10);
    const clothCol = 0x0c7a39;

    // cabinet body + legs
    const body = box(2 * hl + 0.28, 0.34, 2 * hw + 0.28, lam(0x2a1810));
    body.position.y = surfaceY - 0.22; grp.add(body);
    for (const su of [-1, 1]) for (const sw of [-1, 1]) {
      const lh = surfaceY - 0.39;
      const leg = box(0.13, lh, 0.13, woodDark);
      leg.position.set(su * (hl - 0.02), lh / 2, sw * (hw - 0.02));
      grp.add(leg);
    }

    // cloth bed (lit canvas: felt + spots + head string)
    const clothTex = canvasTex(512, 256, (g, cw, ch) => {
      g.fillStyle = "#0c7a39"; g.fillRect(0, 0, cw, ch);
      g.fillStyle = "rgba(0,0,0,0.10)";
      g.fillRect(0, 0, cw, 10); g.fillRect(0, ch - 10, cw, 10);
      g.strokeStyle = "rgba(255,255,255,0.16)"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cw * 0.25, 14); g.lineTo(cw * 0.25, ch - 14); g.stroke(); // head string
      g.fillStyle = "rgba(255,255,255,0.18)";                                          // head + foot spots
      g.beginPath(); g.arc(cw * 0.25, ch / 2, 4, 0, 7); g.fill();
      g.beginPath(); g.arc(cw * 0.75, ch / 2, 4, 0, 7); g.fill();
    });
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2 * hl, 2 * hw),
      new THREE.MeshLambertMaterial({ map: clothTex, color: clothCol }));
    cloth.rotation.x = -Math.PI / 2; cloth.position.y = surfaceY + 0.001;
    grp.add(cloth);

    // pocket positions (table-local) — 4 corners + 2 sides
    const pockets = [
      { u: -hl, w: -hw }, { u: -hl, w: hw }, { u: hl, w: -hw }, { u: hl, w: hw },
      { u: 0, w: -hw }, { u: 0, w: hw },
    ];
    for (const p of pockets) {
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(pocketR, pocketR * 0.8, 0.05, 18),
        lam(0x05060a));
      hole.position.set(p.u, surfaceY - 0.005, p.w); grp.add(hole);
      const jaw = new THREE.Mesh(new THREE.TorusGeometry(pocketR, 0.018, 8, 18),
        new THREE.MeshLambertMaterial({ color: 0x161616 }));
      jaw.rotation.x = Math.PI / 2; jaw.position.set(p.u, surfaceY + 0.01, p.w); grp.add(jaw);
    }

    // wooden rail cap (frame) — 4 boxes around the outside
    const railW = 0.085;
    for (const sw of [-1, 1]) {
      const rail = box(2 * hl + 2 * railW + 0.05, woodH, railW, wood);
      rail.position.set(0, surfaceY + woodH / 2, sw * (hw + railW / 2 + 0.012)); grp.add(rail);
    }
    for (const su of [-1, 1]) {
      const rail = box(railW, woodH, 2 * hw + 0.024, wood);
      rail.position.set(su * (hl + railW / 2 + 0.012), surfaceY + woodH / 2, 0); grp.add(rail);
    }

    // cushions (green rubber) just inside the playfield, broken at the pockets
    const cushMat = lam(0x0a5c2b);
    const ct = 0.032, chh = railTop, cg = pocketR + 0.028, sg = pocketR + 0.02;
    function cush(u, w, lu, lw) {
      const c = box(lu, chh, lw, cushMat);
      c.position.set(u, surfaceY + chh / 2, w); grp.add(c);
    }
    const segL = hl - cg - sg;                        // long rail, split by the side pocket
    for (const sw of [-1, 1]) {
      const wpos = sw * (hw + ct / 2);
      cush(-(sg + segL / 2), wpos, segL, ct);
      cush(sg + segL / 2, wpos, segL, ct);
    }
    for (const su of [-1, 1]) {                       // short rail (single span)
      cush(su * (hl + ct / 2), 0, ct, 2 * hw - 2 * cg);
    }

    /* ---- balls: cue + 15. solids are flat colours, stripes a banded
       texture, 8 is black, cue is white ---- */
    // brighter, more saturated than reference so they read under the toon ramp
    const COLORS = [0xffcf1f, 0x2f6bff, 0xe8302c, 0x9a40e0, 0xff7a1f, 0x2bb24c, 0xc23340];
    function stripeTex(col) {
      const hex = "#" + col.toString(16).padStart(6, "0");
      return canvasTex(64, 32, (g, cw, ch) => {
        g.fillStyle = "#f4f1e8"; g.fillRect(0, 0, cw, ch);
        // a fat, saturated band so the colour reads even from above (you see
        // the ball's poles looking down) and the toon light can't wash it out
        g.fillStyle = hex;
        g.fillRect(0, ch * 0.2, cw, ch * 0.6);
      });
    }
    const balls = [];
    function mkBall(id) {
      let mat;
      if (id === 0) mat = lam(0xf4f2ea);                         // cue
      else if (id === 8) mat = lam(0x111114);                    // 8
      else if (id <= 7) mat = lam(COLORS[id - 1]);               // solids
      else mat = new THREE.MeshLambertMaterial({ map: stripeTex(COLORS[id - 9]) }); // stripes
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), mat);
      m.position.set(0, surfaceY + r, 0);
      grp.add(m);
      const b = { id, mesh: m, type: id === 0 ? "cue" : id === 8 ? "eight" : id <= 7 ? "solid" : "stripe" };
      balls.push(b); return b;
    }
    for (let i = 0; i <= 15; i++) mkBall(i);

    // cue stick — a tapered shaft the game swings; tip sits near origin,
    // butt extends back along -x by default (game rotates the group)
    const cueGrp = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.014, 1.45, 14),
      new THREE.MeshLambertMaterial({ color: 0xb9892f }));
    shaft.rotation.z = Math.PI / 2;                  // lie along x
    shaft.position.x = -(0.06 + 1.45 / 2);           // tip ~6cm off origin, body to -x
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.03, 10),
      new THREE.MeshLambertMaterial({ color: 0x2a6fb0 }));
    tip.rotation.z = Math.PI / 2; tip.position.x = -0.06 - 0.015;
    cueGrp.add(shaft); cueGrp.add(tip);
    cueGrp.position.y = surfaceY + r;
    cueGrp.visible = false;
    grp.add(cueGrp);

    // aim guide: a bright line from the cue ball, a ghost ring at first
    // contact, and a short line for where the struck ball will go
    function mkLine(col) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
      const ln = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: col, transparent: true, depthTest: false,
      }));
      ln.renderOrder = 999; ln.visible = false; grp.add(ln); return ln;
    }
    const aimLine = mkLine(0xffffff);
    const targetLine = mkLine(0xffd23c);
    const ghost = new THREE.Mesh(new THREE.RingGeometry(r * 0.86, r, 22),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false, opacity: 0.9 }));
    ghost.rotation.x = -Math.PI / 2; ghost.renderOrder = 999; ghost.visible = false; grp.add(ghost);

    // a billiard lamp hung low over the cloth — the fixture AND the light.
    // the bulbs are POINT lights kept short (distance ≤3) so the warm pool
    // glow stays in the arcade and can't crawl into the bedroom (light.layers
    // doesn't scope illumination — only a short throw does).
    const lampY = 1.78;
    const shade = box(1.74, 0.14, 0.4, lam(0x123524));
    shade.position.set(0, lampY, 0); grp.add(shade);
    const shadeLip = box(1.8, 0.045, 0.46, lam(0x6a5028));
    shadeLip.position.set(0, lampY - 0.085, 0); grp.add(shadeLip);
    const glowPanel = new THREE.Mesh(new THREE.PlaneGeometry(1.66, 0.34),
      new THREE.MeshBasicMaterial({ color: 0xffe6b8 }));
    glowPanel.rotation.x = Math.PI / 2;            // face down at the cloth
    glowPanel.position.set(0, lampY - 0.1, 0); grp.add(glowPanel);
    for (const ru of [-0.62, 0.62]) {              // hang rods up to the ceiling
      const rodLen = ARC_H - (lampY + 0.07);
      const rod = box(0.022, rodLen, 0.022, lam(0x2a2a2e));
      rod.position.set(ru, lampY + 0.07 + rodLen / 2, 0); grp.add(rod);
    }
    for (const lu of [-0.66, 0, 0.66]) {           // 3 bulbs down the length
      const bulb = new THREE.PointLight(0xffe2ac, 7.5, 2.9, 2);
      bulb.position.set(lu, lampY - 0.16, 0); grp.add(bulb);
    }

    // wall scoreboard (VRChat-style) on the wall nearest the table — the
    // north wall, a couple metres off the foot. both players' names, the
    // group they're shooting, and how many of their balls are down.
    const sbCanvas = document.createElement("canvas");
    sbCanvas.width = 640; sbCanvas.height = 300;
    const sbTex = new THREE.CanvasTexture(sbCanvas);
    sbTex.colorSpace = THREE.SRGBColorSpace;
    function setBoard(d) {
      const g = sbCanvas.getContext("2d");
      g.fillStyle = "#06080f"; g.fillRect(0, 0, 640, 300);
      g.strokeStyle = "#2a78ff"; g.lineWidth = 8; g.strokeRect(5, 5, 630, 290);
      g.strokeStyle = "rgba(42,120,255,0.4)"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(320, 56); g.lineTo(320, 270); g.stroke();
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = "#ffd23c"; g.font = "700 26px monospace"; g.fillText("8-BALL", 320, 34);
      if (!d) {                                   // attract: nobody seated yet
        g.fillStyle = "#3ce47e"; g.font = "700 36px monospace"; g.fillText("▸ JOIN TO PLAY", 320, 138);
        g.fillStyle = "#7f8a99"; g.font = "700 19px monospace";
        g.fillText("solo vs the CPU — or a 2nd player", 320, 190);
        g.fillText("can grab the open seat", 320, 218);
        sbTex.needsUpdate = true; return;
      }
      const cols = [{ x: 162, p: d && d.you, on: d && d.turn === "you" },
                    { x: 478, p: d && d.opp, on: d && d.turn === "cpu" }];
      for (const c of cols) {
        const p = c.p || {};
        g.fillStyle = c.on ? "#7fffd0" : "#dfe7f0";
        g.font = "700 28px monospace";
        g.fillText((p.name || "—").slice(0, 12), c.x, 92);
        const grp = p.group;
        g.font = "700 20px monospace";
        g.fillStyle = grp === "solid" ? "#ffb01f" : grp === "stripe" ? "#34c6ff" : "#5a6678";
        g.fillText(grp === "solid" ? "● SOLIDS" : grp === "stripe" ? "◍ STRIPES" : (d && d.open ? "OPEN TABLE" : "—"), c.x, 132);
        g.fillStyle = "#ffffff"; g.font = "900 86px monospace";
        g.fillText(String(p.made == null ? 0 : p.made), c.x - 26, 204);
        g.fillStyle = "#6a7686"; g.font = "700 34px monospace"; g.fillText("/7", c.x + 42, 218);
        if (c.on) { g.fillStyle = "#7fffd0"; g.font = "700 20px monospace"; g.fillText("▼ SHOOTING", c.x, 262); }
      }
      sbTex.needsUpdate = true;
    }
    setBoard(null);
    const sbY = 2.5;                              // high enough to clear the lamp
    const sbFrame = box(2.1, 1.05, 0.05, lam(0x05060a));
    sbFrame.position.set(PT.x, sbY, AR.z1 - 0.03); add(sbFrame);
    const sbPanel = new THREE.Mesh(new THREE.PlaneGeometry(1.96, 0.92),
      new THREE.MeshBasicMaterial({ map: sbTex }));
    sbPanel.position.set(PT.x, sbY, AR.z1 - 0.06);
    sbPanel.rotation.y = Math.PI;                 // face into the room (north wall)
    add(sbPanel);

    // control panel on the wall under the scoreboard: JOIN to take a seat
    // (alone you play the CPU; a second person can grab the other seat) and
    // RESET to rack fresh. Up here on the wall, RESET can't be fat-fingered
    // mid-game the way a table-side button could. Sits low enough to clear
    // the lamp on the sightline from where you stand.
    function wallBtn(label, col, dx, key) {
      const gb = new THREE.Group();
      const bw = 0.58, bh = 0.26;
      gb.add(box(bw, bh, 0.07, lam(0x0a0d14)));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.9, bh * 0.74),
        new THREE.MeshBasicMaterial({
          map: canvasTex(256, 104, (g, cw, ch) => {
            g.fillStyle = "#070a10"; g.fillRect(0, 0, cw, ch);
            g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(6, 6, cw - 12, ch - 12);
            g.fillStyle = col; g.font = "700 52px monospace";
            g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(label, cw / 2, ch / 2 + 2);
          }),
        }));
      face.position.z = -0.037; face.rotation.y = Math.PI; gb.add(face);
      const hm = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.26),
        new THREE.MeshBasicMaterial({ visible: false }));
      hm.userData[key] = true; gb.add(hm);
      gb.position.set(PT.x + dx, sbY - 0.88, AR.z1 - 0.06);
      add(gb);
      return hm;
    }
    const joinHit = wallBtn("JOIN", "#3ce47e", -0.36, "poolJoin");
    const resetHit = wallBtn("RESET", "#ff5a5a", 0.36, "poolReset");

    // click target over the whole table
    const hit = new THREE.Mesh(new THREE.BoxGeometry(2 * hl + 0.3, 0.4, 2 * hw + 0.3),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(PT.x, surfaceY + 0.1, PT.z);
    hit.userData.pool = true;
    add(hit);
    add(grp);

    // dock poses: stand at each end of the table, behind the head/foot rail,
    // eyes pitched down the cloth (the game orbits the aim around the cue ball)
    const stand = 0.62, eye = 1.6, pitch = -0.62;
    return {
      center: PT, surfaceY, half: { l: hl, w: hw }, ballR: r, pocketR,
      pockets, balls, cueGrp, cueShaft: cueGrp,
      aimLine, targetLine, ghost, hit, resetHit, joinHit, group: grp, setBoard,
      // -x end looks +x (yaw -π/2... set in game); we expose both standing spots
      dock: {
        west: { x: PT.x - hl - stand, z: PT.z, eye, pitch },
        east: { x: PT.x + hl + stand, z: PT.z, eye, pitch },
      },
    };
  })();

  /* ============================================================
     DARTS / 501 — a real board on the north wall, thrown with a
     3D projectile that GRAVITY arcs down across the ~2.4 m flight,
     so you aim above the bull to beat the drop. world.js owns the
     board art + the dart meshes + the faint guide arc + reticle +
     the scoreboard; darts.js runs the turn-based 501 game. View
     space (vx,vy) = how the thrower sees the face: vx to their
     right (= world -x), vy up. The printed board and scoreAt()
     share that space so they always agree.
     ============================================================ */
  const darts = (() => {
    const BX = -13.2, BY = 1.73;            // board centre (bull height, regulation)
    const BZ = AR.z1 - 0.08;                // board face, proud of the north wall
    const ocheZ = BZ - 2.37;                // throw line, regulation distance south
    const eyeY = 1.62;

    // standard board geometry as fractions of the 170 mm scoring radius
    const RB = 0.34;                        // scoring radius (m) — ~2× real, hittable in-game
    const rings = { boardR: RB, bull50: 0.037 * RB, bull25: 0.094 * RB,
      tripIn: 0.582 * RB, tripOut: 0.629 * RB, dblIn: 0.953 * RB, dblOut: RB };
    const SEG = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

    function scoreAt(vx, vy) {
      const r = Math.hypot(vx, vy);
      if (r > rings.boardR) return { value: 0, mult: 0, label: "MISS", region: "miss", isDouble: false };
      if (r <= rings.bull50) return { value: 50, mult: 1, label: "BULL", region: "bull50", isDouble: true };
      if (r <= rings.bull25) return { value: 25, mult: 1, label: "25", region: "bull25", isDouble: false };
      let deg = Math.atan2(vx, vy) * 180 / Math.PI; if (deg < 0) deg += 360;
      const base = SEG[Math.round(deg / 18) % 20];
      let mult = 1, region = "single";
      if (r >= rings.tripIn && r <= rings.tripOut) { mult = 3; region = "triple"; }
      else if (r >= rings.dblIn && r <= rings.dblOut) { mult = 2; region = "double"; }
      return { value: base * mult, mult, label: (mult === 3 ? "T" : mult === 2 ? "D" : "") + base,
        region, isDouble: region === "double" };
    }

    /* ---- board face: a procedural canvas, drawn in view space so it
       matches scoreAt by construction ---- */
    const CC = 300, MPP = CC / 0.40;        // canvas centre + px-per-metre (visual radius 0.40)
    const px = (r) => r * MPP;
    function wedge(g, degC, rIn, rOut, color) {
      g.beginPath();
      for (let k = 0; k <= 6; k++) { const d = (degC - 9 + 18 * k / 6) * Math.PI / 180;
        const x = CC + Math.sin(d) * px(rOut), y = CC - Math.cos(d) * px(rOut); k ? g.lineTo(x, y) : g.moveTo(x, y); }
      for (let k = 6; k >= 0; k--) { const d = (degC - 9 + 18 * k / 6) * Math.PI / 180;
        g.lineTo(CC + Math.sin(d) * px(rIn), CC - Math.cos(d) * px(rIn)); }
      g.closePath(); g.fillStyle = color; g.fill();
    }
    const boardTex = canvasTex(600, 600, (g) => {
      g.clearRect(0, 0, 600, 600);
      g.fillStyle = "#0a0a0d"; g.beginPath(); g.arc(CC, CC, 296, 0, 7); g.fill();
      for (let i = 0; i < 20; i++) {
        const deg = i * 18, dark = i % 2 === 0;
        const single = dark ? "#1b1b21" : "#e7d6a2", ring = dark ? "#d8392a" : "#2faa4d";
        wedge(g, deg, rings.bull25, rings.tripIn, single);
        wedge(g, deg, rings.tripIn, rings.tripOut, ring);
        wedge(g, deg, rings.tripOut, rings.dblIn, single);
        wedge(g, deg, rings.dblIn, rings.dblOut, ring);
      }
      g.fillStyle = "#2faa4d"; g.beginPath(); g.arc(CC, CC, px(rings.bull25), 0, 7); g.fill();
      g.fillStyle = "#d8392a"; g.beginPath(); g.arc(CC, CC, px(rings.bull50), 0, 7); g.fill();
      g.strokeStyle = "rgba(16,16,20,0.85)"; g.lineWidth = 1.5;       // spider wires
      for (let i = 0; i < 20; i++) { const d = (i * 18 + 9) * Math.PI / 180; g.beginPath();
        g.moveTo(CC + Math.sin(d) * px(rings.bull25), CC - Math.cos(d) * px(rings.bull25));
        g.lineTo(CC + Math.sin(d) * px(rings.dblOut), CC - Math.cos(d) * px(rings.dblOut)); g.stroke(); }
      g.fillStyle = "#f3ead0"; g.font = "bold 30px Arial"; g.textAlign = "center"; g.textBaseline = "middle";
      for (let i = 0; i < 20; i++) { const d = i * 18 * Math.PI / 180, rr = px(rings.dblOut) + 23;
        g.fillText(String(SEG[i]), CC + Math.sin(d) * rr, CC - Math.cos(d) * rr); }
    });

    // cabinet behind, wooden surround, the printed face
    const cab = box(0.94, 0.94, 0.07, lam(0x241712));
    cab.position.set(BX, BY, AR.z1 - 0.035); add(cab);
    const surround = new THREE.Mesh(new THREE.TorusGeometry(0.405, 0.03, 10, 40), lam(0x120c08));
    surround.position.set(BX, BY, BZ); add(surround);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.40, 48),
      new THREE.MeshBasicMaterial({ map: boardTex }));
    face.position.set(BX, BY, BZ); face.rotation.y = Math.PI; add(face);   // face the room (-z)

    // a short-throw spot on the board so the darts read; kept tiny so the
    // glow can't crawl out of the arcade (light.layers doesn't scope light)
    const boardLamp = new THREE.PointLight(0xfff0d6, 5.5, 2.6, 2);
    boardLamp.position.set(BX, BY + 0.55, BZ - 0.5); add(boardLamp);

    // oche line on the floor — where you stand
    const oche = box(1.3, 0.012, 0.05, new THREE.MeshBasicMaterial({ color: 0x9d4dff }));
    oche.position.set(BX, 0.012, ocheZ); add(oche);

    /* ---- darts: 3 that stick on the board + 1 in-flight ---- */
    const ZAX = new THREE.Vector3(0, 0, 1);
    function mkDart() {
      const g = new THREE.Group();
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.05, 10), lam(0xd8dce4));
      tip.rotation.x = Math.PI / 2; tip.position.z = 0.085; g.add(tip);   // tip points +z (into the board)
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.10, 12), lam(0x33373f));
      barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.012; g.add(barrel);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.05, 8), lam(0x9aa0aa));
      shaft.rotation.x = Math.PI / 2; shaft.position.z = -0.062; g.add(shaft);
      const fmat = new THREE.MeshBasicMaterial({ color: 0xff3b6b, side: THREE.DoubleSide });
      const f1 = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.045), fmat);
      f1.rotation.x = Math.PI / 2; f1.position.z = -0.1; g.add(f1);
      const f2 = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.045), fmat);
      f2.rotation.x = Math.PI / 2; f2.rotation.y = Math.PI / 2; f2.position.z = -0.1; g.add(f2);
      g.visible = false; add(g); return g;
    }
    const dartMeshes = [mkDart(), mkDart(), mkDart()];
    const flyMesh = mkDart();
    function orient(m, dir) {
      const d = new THREE.Vector3(dir.x, dir.y, dir.z);
      if (d.lengthSq() < 1e-6) d.set(0, 0, 1); else d.normalize();
      m.quaternion.setFromUnitVectors(ZAX, d); return d;
    }
    function placeDart(idx, w, dir) {
      const m = dartMeshes[idx]; if (!m) return;
      const d = orient(m, dir);
      m.position.set(w.x, w.y, w.z); m.position.addScaledVector(d, -0.07);  // bury tip, body toward you
      m.visible = true;
    }
    function flyDart(x, y, z, dir) { orient(flyMesh, dir); flyMesh.position.set(x, y, z); flyMesh.visible = true; }
    function hideFly() { flyMesh.visible = false; }
    function clearDarts() { for (const m of dartMeshes) m.visible = false; }

    /* ---- aim guide: a short faint arc + a landing reticle ---- */
    const ARC_N = 48;
    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ARC_N * 3), 3));
    const arcLine = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({
      color: 0x9fe8ff, transparent: true, opacity: 0.4, depthTest: false }));
    arcLine.renderOrder = 998; arcLine.visible = false; add(arcLine);
    const reticle = new THREE.Mesh(new THREE.RingGeometry(0.011, 0.019, 24),
      new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthTest: false }));
    reticle.renderOrder = 999; reticle.visible = false; add(reticle);
    function setArc(pts, frac) {
      const n = Math.max(2, Math.min(pts.length, Math.floor(pts.length * frac)));
      const pos = arcGeo.attributes.position;
      for (let i = 0; i < ARC_N; i++) {
        const src = pts[Math.min(n - 1, Math.floor(i / (ARC_N - 1) * (n - 1)))];
        pos.setXYZ(i, src.x, src.y, src.z);
      }
      pos.needsUpdate = true; arcLine.visible = true;
    }
    function setReticle(w) {
      reticle.position.set(w.x, w.y, w.z - 0.012);
      reticle.material.color.setHex(w.onBoard ? 0x9fe8ff : 0xff6b6b);
      reticle.visible = true;
    }
    function hideGuide() { arcLine.visible = false; reticle.visible = false; }

    /* ---- wall scoreboard (501) ---- */
    const sbCanvas = document.createElement("canvas");
    sbCanvas.width = 640; sbCanvas.height = 320;
    const sbCtx = sbCanvas.getContext("2d");
    const sbTex = new THREE.CanvasTexture(sbCanvas);
    sbTex.colorSpace = THREE.SRGBColorSpace;
    function setBoard(d) {
      const g = sbCtx;
      g.fillStyle = "#06080f"; g.fillRect(0, 0, 640, 320);
      g.strokeStyle = "#9d4dff"; g.lineWidth = 8; g.strokeRect(5, 5, 630, 310);
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = "#ffd23c"; g.font = "700 26px monospace"; g.fillText("501 · DARTS", 320, 34);
      if (!d) {
        g.fillStyle = "#3ce47e"; g.font = "700 38px monospace"; g.fillText("▸ JOIN TO PLAY", 320, 150);
        g.fillStyle = "#7f8a99"; g.font = "700 18px monospace";
        g.fillText("solo vs the CPU — or a 2nd player", 320, 202);
        g.fillText("can grab the open seat", 320, 228);
        sbTex.needsUpdate = true; return;
      }
      g.strokeStyle = "rgba(157,77,255,0.4)"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(320, 60); g.lineTo(320, 300); g.stroke();
      const cols = [{ x: 162, p: d.you, on: d.turn === "you" }, { x: 478, p: d.opp, on: d.turn === "cpu" }];
      for (const c of cols) {
        const p = c.p || {};
        g.fillStyle = c.on ? "#caa9ff" : "#dfe7f0"; g.font = "700 26px monospace";
        g.fillText((p.name || "—").slice(0, 12), c.x, 90);
        g.fillStyle = "#ffffff"; g.font = "900 78px monospace";
        g.fillText(String(p.score == null ? 501 : p.score), c.x, 166);
        if (c.on) {
          const labels = p.darts || [];
          g.font = "700 19px monospace";
          for (let i = 0; i < 3; i++) {
            g.fillStyle = labels[i] ? "#7fffd0" : "#2a3550";
            g.fillText(labels[i] || "·", c.x - 64 + i * 64, 230);
          }
          g.fillStyle = "#caa9ff"; g.font = "700 16px monospace";
          g.fillText(`▼ ${d.dartsLeft} DART${d.dartsLeft === 1 ? "" : "S"} LEFT`, c.x, 270);
        }
      }
      if (d.over) { g.fillStyle = "#3ce47e"; g.font = "700 22px monospace"; g.fillText(d.over.slice(0, 30), 320, 300); }
      sbTex.needsUpdate = true;
    }
    setBoard(null);
    const sbY = 2.78;
    const sbFrame = box(2.2, 1.1, 0.05, lam(0x05060a));
    sbFrame.position.set(BX, sbY, AR.z1 - 0.03); add(sbFrame);
    const sbPanel = new THREE.Mesh(new THREE.PlaneGeometry(2.06, 0.96),
      new THREE.MeshBasicMaterial({ map: sbTex }));
    sbPanel.position.set(BX, sbY, AR.z1 - 0.06); sbPanel.rotation.y = Math.PI; add(sbPanel);

    /* ---- JOIN / RESET wall buttons, to the side of the board ---- */
    function wallBtn(label, col, dx, dy, key) {
      const gb = new THREE.Group();
      const bw = 0.58, bh = 0.26;
      gb.add(box(bw, bh, 0.07, lam(0x0a0d14)));
      const fc = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.9, bh * 0.74),
        new THREE.MeshBasicMaterial({
          map: canvasTex(256, 104, (g, cw, ch) => {
            g.fillStyle = "#070a10"; g.fillRect(0, 0, cw, ch);
            g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(6, 6, cw - 12, ch - 12);
            g.fillStyle = col; g.font = "700 52px monospace";
            g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(label, cw / 2, ch / 2 + 2);
          }),
        }));
      fc.position.z = -0.037; fc.rotation.y = Math.PI; gb.add(fc);
      const hm = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.26),
        new THREE.MeshBasicMaterial({ visible: false }));
      hm.userData[key] = true; gb.add(hm);
      gb.position.set(BX + dx, BY + dy, AR.z1 - 0.06); add(gb);
      return hm;
    }
    const joinHit = wallBtn("JOIN", "#3ce47e", 1.08, 0.26, "dartsJoin");
    const resetHit = wallBtn("RESET", "#ff5a5a", 1.08, -0.16, "dartsReset");

    // click target in front of the board (walk up + click to play)
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.86, 0.3),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(BX, BY, BZ - 0.15); hit.userData.darts = true; add(hit);

    return {
      center: { x: BX, y: BY, z: BZ }, oche: { x: BX, z: ocheZ, eyeY }, floorY: 0,
      rings, seg: SEG, scoreAt,
      placeDart, flyDart, hideFly, clearDarts, setArc, setReticle, hideGuide, setBoard,
      hit, joinHit, resetHit,
    };
  })();

  /* ============================================================
     ARCADE BASKETBALL (pop-a-shot) — a hoop on the north wall, a
     60-second clock, rapid-fire arc shooting. world.js owns the
     hoop/rim/net + the ball pool + the guide arc + the shot-clock
     and leaderboard panels; basketball.js runs the game.
     ============================================================ */
  const hoops = (() => {
    // mounted on the SOUTH wall (z = AR.z0), you shoot toward -z. Everything on
    // the wall sits ≥3 cm proud of it and the painted court floats just over the
    // floor — the z-fighting rule the room learned the hard way (notes use 0.03).
    const BX = -14.5;                       // hoop centre x (the old foosball spot)
    const WALLZ = AR.z0;                     // south wall plane
    const BBz = WALLZ + 0.07;                // backboard front face, proud of the wall
    // rim at 2.9 m — near-regulation; the hall ceiling was raised to 4.3 m so
    // there's headroom to arc a ball in
    const rimY = 2.9, rimR = 0.225, ballR = 0.12;
    const rimZ = BBz + 0.42;                 // rim reaches out into the court (+z)

    // --- backboard (white, red shooter's square) facing the court (+z) ---
    const bbTex = canvasTex(280, 200, (g, cw, ch) => {
      g.fillStyle = "#f2f0ea"; g.fillRect(0, 0, cw, ch);
      g.strokeStyle = "#20242a"; g.lineWidth = 8; g.strokeRect(4, 4, cw - 8, ch - 8);
      g.strokeStyle = "#d8392a"; g.lineWidth = 6; g.strokeRect(cw / 2 - 46, ch - 96, 92, 64);
    });
    const bb = box(1.34, 0.96, 0.06, lam(0x20242a));
    bb.position.set(BX, 3.12, WALLZ + 0.035); add(bb);
    const bbFace = new THREE.Mesh(new THREE.PlaneGeometry(1.28, 0.9),
      new THREE.MeshBasicMaterial({ map: bbTex }));
    bbFace.position.set(BX, 3.12, BBz); add(bbFace);     // PlaneGeometry faces +z = into the court

    // --- rim + mount + net ---
    const rimMat = lam(0xff7a1f);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(rimR, 0.018, 10, 28), rimMat);
    rim.rotation.x = Math.PI / 2; rim.position.set(BX, rimY, rimZ); add(rim);
    const mount = box(0.12, 0.05, 0.44, rimMat);
    mount.position.set(BX, rimY, (rimZ + BBz) / 2); add(mount);
    const net = new THREE.Mesh(
      new THREE.CylinderGeometry(rimR * 0.96, rimR * 0.5, 0.36, 16, 3, true),
      new THREE.MeshBasicMaterial({ color: 0xeef2f6, wireframe: true, transparent: true, opacity: 0.55 }));
    net.position.set(BX, rimY - 0.18, rimZ); add(net);
    function pulseNet() {
      let t = 0; const iv = setInterval(() => {
        t += 0.05; const s = Math.sin(Math.min(t, 0.3) / 0.3 * Math.PI) * 0.35;
        net.scale.set(1, 1 + s * 0.6, 1); net.position.y = rimY - 0.18 - s * 0.12;
        if (t >= 0.32) { clearInterval(iv); net.scale.set(1, 1, 1); net.position.y = rimY - 0.18; }
      }, 25);
    }
    const hoopLamp = new THREE.PointLight(0xfff0d6, 5.5, 3.6, 2);
    hoopLamp.position.set(BX, 3.6, rimZ + 0.4); add(hoopLamp);

    // --- the court: a painted hardwood decal floating 2 cm over the floor ---
    const court = { x0: BX - 2.4, x1: BX + 2.4, z0: WALLZ + 0.12, z1: WALLZ + 4.0 };
    const Wc = court.x1 - court.x0, Dc = court.z1 - court.z0;
    const courtTex = canvasTex(512, 512, (g, cw, ch) => {
      // hardwood: warm planks running across, hoop/baseline at the TOP (y=0)
      g.fillStyle = "#c79350"; g.fillRect(0, 0, cw, ch);
      g.strokeStyle = "rgba(120,80,30,0.35)"; g.lineWidth = 2;
      for (let y = 0; y < ch; y += 26) { g.beginPath(); g.moveTo(0, y); g.lineTo(cw, y); g.stroke(); }
      const cx = cw / 2, white = "#f4efe2";
      g.strokeStyle = white; g.lineWidth = 6;
      g.strokeRect(14, 14, cw - 28, ch - 28);                       // boundary
      // the key (lane) hanging from the baseline, with the free-throw circle
      const keyW = cw * 0.32, keyH = ch * 0.42;
      g.lineWidth = 5; g.strokeRect(cx - keyW / 2, 14, keyW, keyH);
      g.beginPath(); g.arc(cx, 14 + keyH, keyW * 0.5, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(cx, 14, cw * 0.07, 0, Math.PI); g.stroke();  // the half-circle under the rim
      // 3-point arc sweeping out from the baseline
      g.lineWidth = 6; g.beginPath(); g.arc(cx, 40, cw * 0.46, 0.18 * Math.PI, 0.82 * Math.PI); g.stroke();
      // center-court mark
      g.fillStyle = "rgba(244,239,226,0.25)"; g.font = "700 46px monospace";
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("METRO", cx, ch * 0.78);
    });
    const courtMesh = new THREE.Mesh(new THREE.PlaneGeometry(Wc, Dc),
      new THREE.MeshLambertMaterial({ map: courtTex }));
    courtMesh.rotation.x = -Math.PI / 2;                            // lie flat
    courtMesh.rotation.z = Math.PI;                                 // baseline toward the wall (-z)
    courtMesh.position.set((court.x0 + court.x1) / 2, 0.02, (court.z0 + court.z1) / 2);
    add(courtMesh);

    // --- a ball rack off to the side, holding a few rocks ---
    const ballTex = canvasTex(64, 64, (g, cw, ch) => {
      g.fillStyle = "#d4631f"; g.fillRect(0, 0, cw, ch);
      g.strokeStyle = "#160d05"; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(cw / 2, 0); g.lineTo(cw / 2, ch);
      g.moveTo(0, ch / 2); g.lineTo(cw, ch / 2); g.stroke();
      g.beginPath(); g.arc(-cw * 0.15, ch / 2, cw * 0.62, -1, 1); g.stroke();
      g.beginPath(); g.arc(cw * 1.15, ch / 2, cw * 0.62, Math.PI - 1, Math.PI + 1); g.stroke();
    });
    const ballMat = new THREE.MeshLambertMaterial({ map: ballTex });
    const rack = new THREE.Group();
    rack.position.set(BX + 1.55, 0, WALLZ + 0.42);   // under the hoop, off to one side, against the wall
    // NB: Group.add() returns the GROUP, not the child — so build each piece,
    // set ITS position, THEN add it (the old chained form moved the whole rack)
    const tray = box(0.78, 0.06, 0.46, lam(0x2a2e36)); tray.position.set(0, 0.5, 0); rack.add(tray);
    for (const sx of [-0.34, 0.34]) for (const sz of [-0.2, 0.2]) {
      const leg = box(0.05, 0.5, 0.05, lam(0x20242a)); leg.position.set(sx, 0.25, sz); rack.add(leg);
    }
    const lip = box(0.78, 0.22, 0.05, lam(0x20242a)); lip.position.set(0, 0.62, -0.2); rack.add(lip);
    for (let i = 0; i < 4; i++) {
      const rb = new THREE.Mesh(new THREE.SphereGeometry(ballR, 16, 12), ballMat);
      rb.position.set(-0.24 + i * 0.16, 0.5 + ballR, 0.02); rack.add(rb);
    }
    add(rack);

    // --- ball pool (10 in flight) + the one in your hands ---
    function mkBall() {
      const m = new THREE.Mesh(new THREE.SphereGeometry(ballR, 18, 14), ballMat.clone());
      m.visible = false; add(m); return m;
    }
    const balls = []; for (let i = 0; i < 14; i++) balls.push(mkBall());  // realistic bounces live longer
    const handBall = mkBall();

    // --- aim guide: a faint parabola while you wind up ---
    const ARC_N = 64;
    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ARC_N * 3), 3));
    const arcLine = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({
      color: 0xffd23c, transparent: true, opacity: 0.4, depthTest: false }));
    arcLine.renderOrder = 998; arcLine.visible = false; add(arcLine);
    function setArc(pts) {
      const pos = arcGeo.attributes.position, n = pts.length;
      for (let i = 0; i < ARC_N; i++) { const src = pts[Math.min(n - 1, Math.floor(i / (ARC_N - 1) * (n - 1)))];
        pos.setXYZ(i, src.x, src.y, src.z); }
      pos.needsUpdate = true; arcLine.visible = true;
    }
    function hideGuide() { arcLine.visible = false; }

    return {
      rim: { x: BX, y: rimY, z: rimZ }, rimR, ballR, faceSign: 1, floorY: 0, ceilY: ARC_H,
      backboard: { z: BBz, x0: BX - 0.64, x1: BX + 0.64, y0: 2.64, y1: 3.60 },
      court, balls, handBall, setArc, hideGuide, swish: pulseNet,
    };
  })();

  /* --- the desk rig --- */
  const deskTopY = 0.74;
  const desk = new THREE.Group();

  const top = caster(box(1.9, 0.04, 0.78, new THREE.MeshLambertMaterial({ map: deskTexture() })));
  top.position.y = deskTopY - 0.02;
  top.receiveShadow = true;
  desk.add(top);
  for (const sx of [-0.88, 0.88]) {
    const leg = caster(box(0.05, deskTopY - 0.04, 0.7, lam(0x16181b)));
    leg.position.set(sx, (deskTopY - 0.04) / 2, 0);
    desk.add(leg);
  }

  // D-Box MK1
  const dbox = caster(box(0.36, 0.105, 0.26, lam(0x111317)));
  dbox.position.set(0, deskTopY + 0.0525, -0.2);
  desk.add(dbox);
  const dboxKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 18),
    new THREE.MeshStandardMaterial({ color: 0x3a3f46, metalness: 0.7, roughness: 0.4 }));
  dboxKnob.rotation.x = Math.PI / 2;
  dboxKnob.position.set(0.09, deskTopY + 0.05, -0.065);
  desk.add(dboxKnob);
  const dboxLed = box(0.008, 0.008, 0.004, new THREE.MeshBasicMaterial({ color: 0x3be07a }));
  dboxLed.position.set(-0.12, deskTopY + 0.07, -0.068);
  desk.add(dboxLed);

  // ultrawide on top of the D-Box
  const daw = makeDawScreen();
  const monW = 0.92, monH = 0.39;
  const monBezel = caster(box(monW + 0.02, monH + 0.02, 0.03, lam(0x0c0d10)));
  monBezel.position.set(0, deskTopY + 0.105 + monH / 2 + 0.01, -0.21);
  desk.add(monBezel);
  const monScreen = plane(monW, monH, new THREE.MeshBasicMaterial({ map: daw.tex }));
  monScreen.position.set(0, monBezel.position.y, -0.21 + 0.016);
  monScreen.userData.dm = true;   // click the computer → METRO OS menu (rooms · messages · music)
  desk.add(monScreen);
  monBezel.userData.dm = true;
  // the screen really does light the desk a little
  const screenGlow = new THREE.PointLight(0x8fb6ff, 3, 2.6, 2);
  screenGlow.position.set(0, deskTopY + 0.45, 0.1);
  desk.add(screenGlow);

  // apple keyboard with numpad + trackball
  const kb = box(0.44, 0.012, 0.115, lam(0xd9dbdd));
  kb.rotation.x = -0.04;
  kb.position.set(-0.04, deskTopY + 0.008, 0.13);
  desk.add(kb);
  const kbKeys = canvasTex(440, 115, (g) => {
    g.fillStyle = "#d9dbdd"; g.fillRect(0, 0, 440, 115);
    g.fillStyle = "#f4f5f6";
    for (let y = 8; y < 104; y += 21)
      for (let x = 6; x < 430; x += 24) g.fillRect(x, y, 20, 17);
    // shine on the most-used keys
    g.fillStyle = "rgba(160,164,170,0.5)";
    g.fillRect(54, 50, 20, 17); g.fillRect(78, 50, 20, 17); g.fillRect(102, 50, 20, 17);
    g.fillRect(126, 92, 120, 15);
  });
  const kbTop = plane(0.44, 0.115, new THREE.MeshLambertMaterial({ map: kbKeys }));
  kbTop.rotation.x = -Math.PI / 2 - 0.04;
  kbTop.position.set(-0.04, deskTopY + 0.0155, 0.13);
  desk.add(kbTop);

  const tbBase = box(0.1, 0.035, 0.12, lam(0x202327));
  tbBase.position.set(0.28, deskTopY + 0.0175, 0.13);
  desk.add(tbBase);
  const tbBall = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0x8a1f2d, metalness: 0.2, roughness: 0.25 }));
  tbBall.position.set(0.28, deskTopY + 0.045, 0.115);
  desk.add(tbBall);

  // mac studio + portable monitor on top
  const mac = caster(box(0.2, 0.095, 0.2, new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 0.6, roughness: 0.45 })));
  mac.position.set(-0.7, deskTopY + 0.0475, -0.12);
  mac.userData.dm = true;
  desk.add(mac);
  const meterScr = makeMeterScreen();
  const pmBezel = caster(box(0.35, 0.225, 0.012, lam(0x0c0d10)));
  pmBezel.rotation.x = -0.12;
  pmBezel.position.set(-0.7, deskTopY + 0.095 + 0.115, -0.14);
  desk.add(pmBezel);
  const pmScreen = plane(0.33, 0.2, new THREE.MeshBasicMaterial({ map: meterScr.tex }));
  pmScreen.rotation.x = -0.12;
  pmScreen.position.set(-0.7, pmBezel.position.y, -0.133);
  desk.add(pmScreen);

  // desk clock — actual Hawthorne time
  const clockScr = makeClockScreen();
  const clockBody = box(0.17, 0.07, 0.05, lam(0x101216));
  clockBody.rotation.x = -0.1;
  clockBody.position.set(0.62, deskTopY + 0.035, -0.1);
  desk.add(clockBody);
  const clockFace = plane(0.155, 0.058, new THREE.MeshBasicMaterial({ map: clockScr.tex }));
  clockFace.rotation.x = -0.1;
  clockFace.position.set(0.62, deskTopY + 0.0355, -0.073);
  desk.add(clockFace);

  // the mug that made the coffee ring
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.032, 0.09, 14), lam(0xd8cdb8));
  mug.position.set(0.49, deskTopY + 0.045, 0.04);
  desk.add(mug);
  const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.029, 0.004, 14), lam(0x2a1c10));
  coffee.position.set(0.49, deskTopY + 0.088, 0.04);
  desk.add(coffee);

  /* --- the channel mixer: a little 3-fader board that rides the instrument
     buses (keys · guitar · drums). client-side + sticky, the twin of the
     stompboxes — clicking it opens the fader overlay in main.js, and the caps
     here mirror wherever each level is left. --- */
  const mixer = new THREE.Group();
  const mixChassis = box(0.3, 0.04, 0.2, lam(0x15171b));
  mixChassis.position.y = 0.02;
  mixChassis.userData.mixer = true;
  mixer.add(mixChassis);
  const mixFace = box(0.29, 0.004, 0.19, lam(0x1d2026));   // brushed faceplate, a hair proud
  mixFace.position.y = 0.041;
  mixFace.userData.mixer = true;
  mixer.add(mixFace);
  const mixHits = [mixChassis, mixFace];
  const mixCaps = {};
  // louder = the cap slid toward the back (away from you); pct 0..150 maps along z
  const MIX_Z0 = 0.058, MIX_Z1 = -0.058;            // front (min) → back (max)
  const mixZ = (pct) => MIX_Z0 + (MIX_Z1 - MIX_Z0) * Math.min(Math.max(pct, 0), 150) / 150;
  function mixChannel(px, capCol, id) {
    const slot = box(0.01, 0.006, 0.135, lam(0x0a0b0d));   // the fader groove
    slot.position.set(px, 0.044, 0);
    mixer.add(slot);
    const cap = box(0.036, 0.02, 0.022, lam(capCol));      // the cap rides the groove
    cap.position.set(px, 0.052, mixZ(100));
    cap.userData.mixer = true;
    mixer.add(cap);
    mixHits.push(cap);
    mixCaps[id] = cap;
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.01, 12), lam(0x0e0f12));
    knob.position.set(px, 0.046, -0.082);                  // a trim knob up at the back
    mixer.add(knob);
    // the channel's lit eye, color-matched to its stompbox family (toon pass leaves basic mats glowing)
    const led = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.005, 8),
      new THREE.MeshBasicMaterial({ color: capCol }));
    led.position.set(px, 0.044, 0.084);
    mixer.add(led);
  }
  mixChannel(-0.09, 0x4fbfe6, "piano");    // keys   — cyan,  the kb-delay eye
  mixChannel(0,     0xff7a3c, "guitar");   // guitar — amber, the gtr-od eye
  mixChannel(0.09,  0x6bff8a, "drum");     // drums  — lime
  mixer.position.set(-0.44, deskTopY, 0.14);
  mixer.rotation.x = -0.12;                // tilt the board up toward the player
  desk.add(mixer);
  // move a cap to show its level (called from main.js when the fader moves)
  function setMixFader(id, pct) {
    const cap = mixCaps[id]; if (cap) cap.position.z = mixZ(pct);
  }

  // cables off the back of the desk
  for (const [cx, tilt] of [[-0.1, 0.18], [0.07, -0.12], [-0.68, 0.1]]) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.7, 6), lam(0x0c0d0f));
    cable.position.set(cx, deskTopY - 0.33, -0.345);
    cable.rotation.z = tilt;
    cable.rotation.x = 0.12;
    desk.add(cable);
  }

  // midi controller tucked under the desk, keys barely sticking out;
  // its body is the piano-voice selector
  const midiBody = caster(box(0.96, 0.065, 0.27, lam(0x191b1f)));
  midiBody.position.set(0, 0.46, 0.27);
  midiBody.userData.pianoVoice = true;
  desk.add(midiBody);
  // two playable C major octaves, low on the left → high on the right
  const keysCanvas = document.createElement("canvas");
  keysCanvas.width = 720; keysCanvas.height = 60;
  const keysTex = new THREE.CanvasTexture(keysCanvas);
  keysTex.colorSpace = THREE.SRGBColorSpace;
  const N_KEYS = 15;   // C..C across two octaves
  function drawKeys(pressed = -1) {
    const g = keysCanvas.getContext("2d");
    const kw = 720 / N_KEYS;
    g.fillStyle = "#f2f2ef";
    g.fillRect(0, 0, 720, 60);
    if (pressed >= 0) {
      g.fillStyle = "#ffb347";
      g.fillRect(pressed * kw, 0, kw, 60);
    }
    g.fillStyle = "#0c0c0e";
    for (let i = 1; i < N_KEYS; i++) g.fillRect(i * kw - 2, 0, 3, 60);
    // black keys: skip E–F and B–C gaps, both octaves
    for (const i of [0, 1, 3, 4, 5, 7, 8, 10, 11, 12]) g.fillRect((i + 1) * kw - 6, 0, 12, 32);
    keysTex.needsUpdate = true;
  }
  drawKeys();
  const midiKeybed = plane(0.9, 0.1, new THREE.MeshLambertMaterial({ map: keysTex }));
  midiKeybed.rotation.x = -Math.PI / 2;
  midiKeybed.position.set(0, 0.494, 0.345);
  midiKeybed.userData.piano = true;
  desk.add(midiKeybed);
  let keyResetTimer = null;
  function pressPianoKey(i) {
    drawKeys(i);
    clearTimeout(keyResetTimer);
    keyResetTimer = setTimeout(() => drawKeys(-1), 180);
  }

  desk.position.set(0.2, 0, ZF + 0.49);
  add(desk);

  /* --- keyboard floor pedals --- */
  // three stompboxes on the floor where you'd stand to play: chorus · delay ·
  // reverb. the physical twin of the keybed's FX bus — every piano note runs
  // through all three at 50% wet (see ambience.pianoNote / buildKeyboardFx).
  // each is click-to-toggle on/off (registerStomp, shared with the guitar).
  const kbPedals = new THREE.Group();
  const kbPlate = box(0.42, 0.018, 0.2, lam(0x18191d));
  kbPlate.position.set(0, 0.055, 0);
  kbPlate.rotation.x = -0.24;                 // tilt the board up toward the player
  kbPedals.add(kbPlate);
  for (const fx of [-0.17, 0.17]) {
    const ft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), lam(0x0d0e10));
    ft.position.set(fx, 0.015, 0.085);
    kbPedals.add(ft);
  }
  // a stompbox: enclosure, footswitch, two knobs, status LED — sits on the tilt
  function kbStomp(px, bodyCol, ledCol, id) {
    const pg = new THREE.Group();
    const enc = box(0.1, 0.05, 0.12, lam(bodyCol));
    enc.position.y = 0.025;
    pg.add(enc);
    const sw = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.02, 12), lam(0xb9bec6));
    sw.position.set(0, 0.055, 0.038);
    pg.add(sw);
    for (const kx of [-0.024, 0.024]) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.015, 10), lam(0x111214));
      knob.position.set(kx, 0.052, -0.032);
      pg.add(knob);
    }
    // the eye, kept emissive so the toon pass leaves it glowing
    const led = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.006, 8),
      new THREE.MeshBasicMaterial({ color: ledCol }));
    led.position.set(0, 0.054, 0.004);
    pg.add(led);
    pg.position.set(px, 0.063, -0.01);
    pg.rotation.x = -0.24;
    kbPedals.add(pg);
    if (id) registerStomp(enc, sw, led, ledCol, id);
  }
  kbStomp(-0.13, 0x6a2f7a, 0xd66bff, "kb-chorus");   // chorus — purple, magenta eye
  kbStomp(0,     0x1f5a7a, 0x4fbfe6, "kb-delay");    // delay  — blue, cyan eye
  kbStomp(0.13,  0x2f6a3a, 0x6bff8a, "kb-reverb");   // reverb — green, lime eye
  kbPedals.position.set(0.2, 0, ZF + 1.0);   // tucked further under the desk
  kbPedals.rotation.y = -0.08;
  add(kbPedals);

  /* --- Kali monitors on stands, flanking the desk --- */
  const kaliTex = kaliFaceTexture();
  function kali(x, toeIn) {
    const grp = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.02, 16), lam(0x1a1c1f));
    base.position.y = 0.01;
    grp.add(base);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.74, 10), lam(0x202327));
    pole.position.y = 0.39;
    grp.add(pole);
    const plate = box(0.2, 0.012, 0.24, lam(0x1a1c1f));
    plate.position.y = 0.766;
    grp.add(plate);
    const cab = caster(box(0.225, 0.37, 0.26, lam(0x131519)));
    cab.position.y = 0.772 + 0.185;
    grp.add(cab);
    const face = plane(0.215, 0.36, new THREE.MeshLambertMaterial({ map: kaliTex }));
    face.position.set(0, cab.position.y, 0.131);
    grp.add(face);
    // speaker wire drooping to the floor
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.75, 6), lam(0x0c0d0f));
    wire.position.set(0.04, 0.4, -0.1);
    wire.rotation.x = -0.14;
    grp.add(wire);
    grp.position.set(x, 0, ZF + 0.33);
    grp.rotation.y = toeIn;
    add(grp);
  }
  // Equilateral triangle: 2.3 m between tweeters, symmetric about the desk
  // centerline (x=0.2), each toed in 30° so the axes cross at the listening
  // position — which is exactly 2.3 m from each speaker.
  const SPK_SPACING = 2.3;
  const SPK_Z = ZF + 0.33;
  const SWEET = { x: 0.2, z: SPK_Z + SPK_SPACING * Math.sqrt(3) / 2 };
  // speaker stands block rays too
  for (const sx2 of [0.2 - SPK_SPACING / 2, 0.2 + SPK_SPACING / 2]) {
    const spkBlock = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3),
      new THREE.MeshBasicMaterial({ visible: false }));
    spkBlock.position.set(sx2, 0.6, ZF + 0.33);
    add(spkBlock);
    blockers.push(spkBlock);
  }
  kali(0.2 - SPK_SPACING / 2, Math.PI / 6);    // left of the desk
  kali(0.2 + SPK_SPACING / 2, -Math.PI / 6);   // right of the desk, against the wall

  /* --- 12U rack on casters, apollo twin on top --- */
  const rack = new THREE.Group();
  const rb = caster(box(0.56, 0.62, 0.6, lam(0x101317)));
  rb.position.y = 0.31 + 0.06;
  rack.add(rb);
  const face = plane(0.52, 0.58, new THREE.MeshLambertMaterial({ map: rackFaceTexture() }));
  face.position.set(0, 0.31 + 0.06, 0.301);
  rack.add(face);
  for (const [cx, cz] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), lam(0x222428));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(cx, 0.035, cz);
    rack.add(wheel);
  }
  const apollo = caster(box(0.16, 0.065, 0.15, new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.65, roughness: 0.4 })));
  apollo.position.set(0, 0.62 + 0.06 + 0.0325, 0.1);
  rack.add(apollo);
  const apKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.018, 18),
    new THREE.MeshStandardMaterial({ color: 0x2c2f34, metalness: 0.7, roughness: 0.35 }));
  apKnob.position.set(0, 0.62 + 0.06 + 0.068, 0.12);
  rack.add(apKnob);
  rack.position.set(2.1, 0, ZF + 0.78);
  rack.rotation.y = -0.25;
  add(rack);

  /* --- the lava lamp, left side of the rack top. it works. --- */
  const lava = new THREE.Group();
  const lampGold = lam(0x8a6a3a);
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.05, 0.07, 14), lampGold);
  lampBase.position.y = 0.035;
  lava.add(lampBase);
  const lampCap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.045, 14), lampGold);
  lampCap.position.y = 0.07 + 0.155 + 0.022;
  lava.add(lampCap);
  // the fluid — warm, dim, see-through
  const lampGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.044, 0.155, 14),
    new THREE.MeshBasicMaterial({ color: 0xb33a14, transparent: true, opacity: 0.34, depthWrite: false }));
  lampGlass.position.y = 0.07 + 0.0775;
  lampGlass.userData.lava = true;
  lava.add(lampGlass);
  // the wax — blobs on their own slow clocks
  const lavaBlobs = [];
  const blobMat = new THREE.MeshBasicMaterial({ color: 0xff8a3c });
  for (let i = 0; i < 5; i++) {
    const r = 0.011 + (i % 3) * 0.004;
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), blobMat);
    b.userData.blob = { speed: 0.16 + i * 0.07, phase: i * 1.7, r };
    lava.add(b);
    lavaBlobs.push(b);
  }
  const lavaLight = new THREE.PointLight(0xff8040, 0.85, 0.95, 2);  // short throw, stays on the rack
  lavaLight.position.y = 0.15;
  lava.add(lavaLight);
  lava.position.set(-0.17, 0.68, -0.12);
  rack.add(lava);
  blockers.push(lampGlass);
  let lavaOn = true;
  function setLava(on) {
    lavaOn = !!on;
    lavaLight.intensity = lavaOn ? 0.85 : 0;
    blobMat.color.set(lavaOn ? 0xff8a3c : 0x5a2c16);
    lampGlass.material.opacity = lavaOn ? 0.34 : 0.18;
  }
  function toggleLava() { setLava(!lavaOn); return lavaOn; }
  function tickLava(elapsed) {
    if (!lavaOn) return;
    for (const b of lavaBlobs) {
      const { speed, phase, r } = b.userData.blob;
      const k = Math.sin(elapsed * speed + phase);
      b.position.y = 0.07 + 0.03 + (k * 0.5 + 0.5) * 0.085;
      b.position.x = Math.sin(elapsed * speed * 0.7 + phase * 2) * 0.012;
      b.position.z = Math.cos(elapsed * speed * 0.6 + phase) * 0.012;
      b.scale.y = 1 + 0.35 * Math.sin(elapsed * speed * 1.9 + phase);  // wax stretch
    }
    lavaLight.intensity = 0.8 + 0.12 * Math.sin(elapsed * 0.9);
  }

  /* --- the radio, on the rack-top right (where the little trophy used to sit),
     behind the Apollo and turned toward the chair. this one's tuned to Los
     Angeles — the popular FM band plus the college stations clustered down at
     the bottom of the dial, just like the real thing (radio.js). --- */
  const laRadio = makeRadio("FM · LOS ANGELES", "laradio");
  laRadio.group.position.set(0.15, 0.68, -0.1);
  laRadio.group.rotation.y = 0.3;      // angled past the Apollo, toward the user
  rack.add(laRadio.group);
  const laRadioHits = laRadio.hits, setLaRadioNeedle = laRadio.setNeedle, setLaRadioPower = laRadio.setPower;
  const laRadioPos = new THREE.Vector3();
  laRadio.group.updateWorldMatrix(true, false);
  laRadio.group.getWorldPosition(laRadioPos);

  /* --- earned accessories: small low-poly things the room grows
     around regulars (progress.js decides when). created on demand,
     after the toon pass — they stay Lambert like the notes and cat --- */
  const accessorySpin = [];
  const accessoriesIn = new Set();
  function addAccessory(id) {
    if (accessoriesIn.has(id)) return;
    accessoriesIn.add(id);
    if (id === "plant") {
      const g = new THREE.Group();
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.038, 0.07, 9), lam(0xb06a42));
      pot.position.y = 0.035;
      g.add(pot);
      for (let i = 0; i < 5; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.16 + (i % 3) * 0.05, 5), lam(0x3f7a4a));
        const a = (i / 5) * Math.PI * 2;
        leaf.position.set(Math.cos(a) * 0.02, 0.13 + (i % 3) * 0.02, Math.sin(a) * 0.02);
        leaf.rotation.set(Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22);
        g.add(leaf);
      }
      g.position.set(1.35, 0.83, ZF + 0.07);
      add(g);
    } else if (id === "yarn") {
      const g = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), lam(0xc23b4e));
      ball.position.y = 0.05;
      g.add(ball);
      for (const rx of [0.5, 1.9]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 5, 14), lam(0xd8556a));
        ring.position.y = 0.05;
        ring.rotation.x = rx;
        g.add(ring);
      }
      g.position.set(-1.85, 0, 2.6);
      add(g);
    } else if (id === "gold") {
      const g = new THREE.Group();
      const frame = box(0.04, 0.5, 0.5, lam(0x1a1c20));
      g.add(frame);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.01, 22),
        new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: 0.8, roughness: 0.3 }));
      disc.rotation.z = Math.PI / 2;
      disc.position.x = -0.03;
      g.add(disc);
      const label = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 14), lam(0x822));
      label.rotation.z = Math.PI / 2;
      label.position.x = -0.032;
      g.add(label);
      g.position.set(X - 0.05, 1.55, 1.49);   // the bare strip by the entry door
      add(g);
      blockers.push(frame);                    // notes keep off it
    } else if (id === "disco") {
      const g = new THREE.Group();
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.18, 5), lam(0x44464c));
      wire.position.y = 0.16;
      g.add(wire);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xc8ccd8, metalness: 0.9, roughness: 0.18, flatShading: true }));
      g.add(ball);
      g.position.set((AR.x0 + AR.x1) / 2, ARC_H - 0.32, (AR.z0 + AR.z1) / 2);
      add(g);
      accessorySpin.push(ball);
    }
    // (the rack "trophy" used to live here — the LA radio took its spot)
  }

  /* --- ergo chair, pushed aside --- */
  const chair = new THREE.Group();
  const seat = caster(box(0.48, 0.07, 0.46, lam(0x1c1e22)));
  seat.position.y = 0.47;
  chair.add(seat);
  const backRest = caster(box(0.46, 0.62, 0.06, lam(0x23262b)));
  backRest.position.set(0, 0.85, -0.24);
  backRest.rotation.x = 0.12;
  chair.add(backRest);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.32, 10), lam(0x33363b));
  column.position.y = 0.28;
  chair.add(column);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = box(0.3, 0.025, 0.05, lam(0x26282c));
    arm.position.set(Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15);
    arm.rotation.y = -a;
    chair.add(arm);
    const cast = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), lam(0x111316));
    cast.position.set(Math.cos(a) * 0.29, 0.03, Math.sin(a) * 0.29);
    chair.add(cast);
  }
  // parked in the sweet spot, facing the monitors
  chair.position.set(SWEET.x, 0, SWEET.z);
  chair.rotation.y = Math.PI;
  add(chair);
  // bump it and it spins — gas-lift chairs obey the room's physics
  let chairSpin = 0, prevPX = null, prevPZ = null;
  function tickChair(dt, ppos) {
    if (ppos) {
      const dx = ppos.x - chair.position.x, dz = ppos.z - chair.position.z;
      const d = Math.hypot(dx, dz);
      if (prevPX !== null && d < 0.62) {
        const vx = (ppos.x - prevPX) / Math.max(dt, 0.001), vz = (ppos.z - prevPZ) / Math.max(dt, 0.001);
        const speed = Math.hypot(vx, vz);
        if (speed > 0.4 && Math.abs(chairSpin) < 1.5) {
          // spin direction follows which side you brushed past
          const side = Math.sign(vx * dz - vz * dx) || 1;
          chairSpin = side * Math.min(8, 2.5 + speed * 1.8);
        }
      }
      prevPX = ppos.x; prevPZ = ppos.z;
    }
    if (Math.abs(chairSpin) > 0.01) {
      chair.rotation.y += chairSpin * dt;
      chairSpin *= Math.pow(0.45, dt);     // bearing friction
    }
  }

  /* --- the cat's corner: litter box, bowls, treat jar --- */
  const careTargets = [];

  // litter box, back-left corner
  const litterGrp = new THREE.Group();
  const trayMat = lam(0x9aa0a4);
  const trayFloor = box(0.52, 0.03, 0.4, trayMat);
  trayFloor.position.y = 0.015;
  litterGrp.add(trayFloor);
  for (const [tw, td, tx, tz] of [
    [0.52, 0.025, 0, -0.19], [0.52, 0.025, 0, 0.19],
    [0.025, 0.4, -0.248, 0], [0.025, 0.4, 0.248, 0],
  ]) {
    const wallp = box(tw, 0.12, td, trayMat);
    wallp.position.set(tx, 0.06, tz);
    litterGrp.add(wallp);
  }
  const sand = plane(0.47, 0.35, new THREE.MeshLambertMaterial({
    map: canvasTex(128, 128, (g) => {
      g.fillStyle = "#cfc3a4"; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 3000; i++) {
        const v = 170 + Math.random() * 60;
        g.fillStyle = `rgba(${v},${v - 12},${v - 40},0.6)`;
        g.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5);
      }
    }),
  }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = 0.045;
  litterGrp.add(sand);
  const clumps = [];
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), lam(0x4a3a26));
    c.scale.y = 0.6;
    c.position.set(-0.16 + (i * 0.083), 0.05, (i % 2 ? 0.09 : -0.07));
    c.visible = false;
    litterGrp.add(c);
    clumps.push(c);
  }
  litterGrp.position.set(-2.28, 0, 2.85);
  add(litterGrp);
  const litterHit = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.5),
    new THREE.MeshBasicMaterial({ visible: false }));
  litterHit.position.set(-2.28, 0.15, 2.85);
  litterHit.userData.care = "litter";
  add(litterHit);
  careTargets.push(litterHit);

  // food + water bowls along the right wall
  function bowl(kind, color, x, z) {
    const grp = new THREE.Group();
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.045, 16), lam(color));
    outer.position.y = 0.0225;
    grp.add(outer);
    const fillMat = kind === "food"
      ? new THREE.MeshLambertMaterial({
          map: canvasTex(64, 64, (g) => {
            g.fillStyle = "#6a4a26"; g.fillRect(0, 0, 64, 64);
            for (let i = 0; i < 240; i++) {
              g.fillStyle = `rgba(${120 + Math.random() * 50},${80 + Math.random() * 40},${40 + Math.random() * 25},0.9)`;
              g.beginPath(); g.arc(Math.random() * 64, Math.random() * 64, 2.6, 0, 7); g.fill();
            }
          }),
        })
      : new THREE.MeshStandardMaterial({ color: 0x3a7ab8, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85 });
    const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.05, 0.03, 16), fillMat);
    fill.position.y = 0.025;
    grp.add(fill);
    grp.position.set(x, 0, z);
    add(grp);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.22),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(x, 0.09, z);
    hit.userData.care = kind;
    add(hit);
    careTargets.push(hit);
    return fill;
  }
  const foodFill = bowl("food", 0x8a3324, 2.32, 0.75);
  const waterFill = bowl("water", 0x46606e, 2.32, 1.08);

  // treat jar on the windowsill
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.09, 12),
    new THREE.MeshStandardMaterial({ color: 0xd8e4ea, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.4 }));
  jar.position.set(1.4, 0.905, ZF + 0.07);
  add(jar);
  const jarKibble = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.029, 0.055, 12), lam(0x7a5530));
  jarKibble.position.set(1.4, 0.888, ZF + 0.07);
  add(jarKibble);
  const jarHit = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.14),
    new THREE.MeshBasicMaterial({ visible: false }));
  jarHit.position.set(1.4, 0.92, ZF + 0.07);
  jarHit.userData.care = "treats";
  add(jarHit);
  careTargets.push(jarHit);

  // live fill levels — same for every visitor, in real time
  function updateCare(state) {
    const food = Math.max(0, Math.min(1, state.food ?? 1));
    const water = Math.max(0, Math.min(1, state.water ?? 1));
    const dirty = Math.max(0, Math.min(1, state.litter ?? 0));
    foodFill.visible = food > 0.04;
    foodFill.scale.set(1, Math.max(0.08, food), 1);
    foodFill.position.y = 0.012 + 0.015 * food;
    waterFill.visible = water > 0.04;
    waterFill.scale.set(1, Math.max(0.08, water), 1);
    waterFill.position.y = 0.012 + 0.015 * water;
    // first clump appears after a single trip; the rest accumulate
    clumps.forEach((c, i) => { c.visible = dirty > 0.06 + i * 0.18; });
    sand.material.color.setScalar(1 - dirty * 0.35);
  }

  /* --- METRO neon, on the bedroom door (the one light that stays) --- */
  const neonCanvas = document.createElement("canvas");
  neonCanvas.width = 512; neonCanvas.height = 128;
  const neonTex = new THREE.CanvasTexture(neonCanvas);
  neonTex.colorSpace = THREE.SRGBColorSpace;
  function drawNeon() {
    const g = neonCanvas.getContext("2d");
    g.clearRect(0, 0, 512, 128);
    g.font = "500 84px 'Six Caps', sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.letterSpacing = "14px";
    g.shadowColor = "#ff4d2e"; g.shadowBlur = 16;
    g.strokeStyle = "#ff6a4a"; g.lineWidth = 3;
    g.strokeText("METRO", 256, 66);
    g.shadowBlur = 0;
    g.fillStyle = "#fff1ec";
    g.fillText("METRO", 256, 66);
    neonTex.needsUpdate = true;
  }
  drawNeon();
  if (document.fonts?.ready) document.fonts.ready.then(drawNeon);
  const plaque = box(0.68, 0.19, 0.012, lam(0x141518));
  plaque.position.set(0, 1.62, 0.062);
  entryDoor.add(plaque);
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.155), new THREE.MeshBasicMaterial({
    map: neonTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  neon.position.set(0, 1.62, 0.075);
  entryDoor.add(neon);
  const neonLight = new THREE.PointLight(0xff4d2e, 1.3, 1.7, 2);
  neonLight.position.set(0, 1.62, 0.4);
  entryDoor.add(neonLight);

  // furniture blocks note-placement rays — walls only, never tables,
  // beds, desks or gear
  blockers.push(top, monBezel, kb, midiBody, rb, seat, backRest);
  /* --- the light dimmer on the wall --- */
  // a wall switch by the entry door; the ceiling lamp it controls is
  // off by default (the room runs on window light), but visitors can
  // bring it up and tint it — and everyone sees the change
  const fixture = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.05, 16), lam(0xd8d2c4));
  fixture.position.set(0, H - 0.03, 0.4);
  add(fixture);
  const fixtureGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.012, 16),
    new THREE.MeshBasicMaterial({ color: 0x222222 }));
  fixtureGlow.position.set(0, H - 0.058, 0.4);
  add(fixtureGlow);
  const roomLamp = add(new THREE.PointLight(0xffe2b8, 0, 9, 2));
  roomLamp.position.set(0, H - 0.35, 0.4);
  const dimmerPlate = box(0.025, 0.14, 0.09, lam(0xe8e2d4));
  dimmerPlate.position.set(X - 0.035, 1.3, 1.78);
  dimmerPlate.userData.dimmer = true;
  add(dimmerPlate);
  const dimmerKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.02, 12), lam(0xb8b2a4));
  dimmerKnob.rotation.z = Math.PI / 2;
  dimmerKnob.position.set(X - 0.055, 1.3, 1.78);
  add(dimmerKnob);
  function setRoomLight(level, colorHex) {
    const l = Math.max(0, Math.min(1, level));
    roomLamp.intensity = l * 26;
    if (colorHex) roomLamp.color.set(colorHex);
    fixtureGlow.material.color.set(l > 0.02 ? (colorHex || 0xffe2b8) : 0x222222);
  }

  /* --- THE DESI: a small boat cabin, far from everything ---
     Password-gated; a tribute. The windows are REAL HOLES in the hull
     wall, looking onto a layered 3D sea — sky backdrop, sun and moon
     placed by real Swedish astronomy (Gotland coast), bands
     of water sliding at different speeds for true parallax, and a
     shadow-casting light that throws window-shaped patches across the
     cabin. Swedish weather dims it all. --- */
  const BOAT = { x: 40, z: 0 };
  const SWEDEN = { lat: 57.64, lng: 18.30 };   // Visby, Gotland
  let swWx = { clouds: 0.3, rain: 0 };
  (function pollSweden() {
    fetch("https://api.open-meteo.com/v1/forecast?latitude=57.64&longitude=18.30&current=weather_code,cloud_cover,precipitation,temperature_2m")
      .then(r => r.json())
      .then(d => {
        const c = d.current || {};
        swWx.clouds = Math.max(0, Math.min(1, (c.cloud_cover ?? 30) / 100));
        swWx.temp = c.temperature_2m;
        swWx.rain = (c.precipitation ?? 0) > 0.1 || (c.weather_code >= 51 && c.weather_code <= 82) ? 1 : 0;
      })
      .catch(() => {});
    setTimeout(pollSweden, 15 * 60 * 1000);
  })();

  // everything boat-side lives on light layer 1: boat lights only touch
  // the boat, bedroom lights never reach across the void (this is what
  // stopped the Swedish sun from gilding the bedroom walls)
  const boatGroup = new THREE.Group();
  scene.add(boatGroup);
  const addB = (m) => { boatGroup.add(m); return m; };

  const BW = 4.6, BD = 3.4, BH = 2.2;
  const plankTex = canvasTex(512, 256, (g) => {
    g.fillStyle = "#7a5c3e";
    g.fillRect(0, 0, 512, 256);
    for (let y = 0; y < 256; y += 32) {
      const v = 0.85 + ((y * 7) % 13) / 40;
      g.fillStyle = `rgb(${122 * v | 0},${92 * v | 0},${62 * v | 0})`;
      g.fillRect(0, y + 1, 512, 30);
      g.strokeStyle = "rgba(40,26,14,0.6)";
      g.strokeRect(0, y, 512, 32);
      for (let i = 0; i < 12; i++) {
        g.strokeStyle = "rgba(60,42,24,0.35)";
        g.beginPath();
        const yy = y + 4 + Math.random() * 24;
        g.moveTo(0, yy); g.lineTo(512, yy + (Math.random() - 0.5) * 6);
        g.stroke();
      }
    }
  });
  const plankMat = new THREE.MeshLambertMaterial({ map: plankTex, side: THREE.DoubleSide });
  const bAdd = (m) => { m.receiveShadow = true; boatGroup.add(m); return m; };

  // ---- hull wall with three REAL window holes (y 1.03..1.67) ----
  const WIN_XS = [-1.5, 0, 1.5], WW = 1.04, WH = 0.64, WCY = 1.35;
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-BW / 2, -BH / 2);
  hullShape.lineTo(BW / 2, -BH / 2);
  hullShape.lineTo(BW / 2, BH / 2);
  hullShape.lineTo(-BW / 2, BH / 2);
  hullShape.closePath();
  for (const wx of WIN_XS) {
    const hole = new THREE.Path();
    hole.moveTo(wx - WW / 2, WCY - BH / 2 - WH / 2);
    hole.lineTo(wx + WW / 2, WCY - BH / 2 - WH / 2);
    hole.lineTo(wx + WW / 2, WCY - BH / 2 + WH / 2);
    hole.lineTo(wx - WW / 2, WCY - BH / 2 + WH / 2);
    hole.closePath();
    hullShape.holes.push(hole);
  }
  const hullGeo = new THREE.ShapeGeometry(hullShape);
  const hullMap = plankTex.clone();
  hullMap.needsUpdate = true;
  hullMap.repeat.set(1 / BW, 1 / BH);
  hullMap.offset.set(0.5, 0.5);
  hullMap.wrapS = hullMap.wrapT = THREE.RepeatWrapping;
  const hullWall = new THREE.Mesh(hullGeo, new THREE.MeshLambertMaterial({ map: hullMap, side: THREE.DoubleSide }));
  hullWall.position.set(BOAT.x, BH / 2, BOAT.z - BD / 2);
  hullWall.castShadow = true;          // ← this is what makes window-shaped light
  hullWall.receiveShadow = true;
  addB(hullWall);
  // window frames
  for (const wx of WIN_XS) {
    for (const [fw, fh, fx, fy] of [
      [WW + 0.1, 0.05, wx, WCY + WH / 2 + 0.025], [WW + 0.1, 0.05, wx, WCY - WH / 2 - 0.025],
      [0.05, WH + 0.1, wx - WW / 2 - 0.025, WCY], [0.05, WH + 0.1, wx + WW / 2 + 0.025, WCY],
    ]) {
      const f = bAdd(box(fw, fh, 0.07, lam(0x4a3826)));
      f.position.set(BOAT.x + fx, fy, BOAT.z - BD / 2);
      f.castShadow = true;
    }
  }

  // ---- the other walls, floor, ceiling ----
  const doorWall = bAdd(new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), plankMat));
  doorWall.rotation.y = Math.PI;
  doorWall.position.set(BOAT.x, BH / 2, BOAT.z + BD / 2);
  const portWall = bAdd(new THREE.Mesh(new THREE.PlaneGeometry(BD, BH), plankMat.clone()));
  portWall.rotation.y = Math.PI / 2;
  portWall.position.set(BOAT.x - BW / 2, BH / 2, BOAT.z);
  const stbWall = bAdd(new THREE.Mesh(new THREE.PlaneGeometry(BD, BH), plankMat.clone()));
  stbWall.rotation.y = -Math.PI / 2;
  stbWall.position.set(BOAT.x + BW / 2, BH / 2, BOAT.z);
  const boatFloor = bAdd(new THREE.Mesh(new THREE.PlaneGeometry(BW, BD), plankMat.clone()));
  boatFloor.rotation.x = -Math.PI / 2;
  boatFloor.position.set(BOAT.x, 0.001, BOAT.z);
  const boatCeil = bAdd(new THREE.Mesh(new THREE.PlaneGeometry(BW, BD),
    new THREE.MeshLambertMaterial({ color: 0x4a3826, side: THREE.DoubleSide })));
  boatCeil.rotation.x = Math.PI / 2;
  boatCeil.position.set(BOAT.x, BH, BOAT.z);

  // ---- the sea outside: layered, alive, astronomically honest ----
  // sky backdrop
  const swSkyCanvas = document.createElement("canvas");
  swSkyCanvas.width = 512; swSkyCanvas.height = 256;
  const swSkyTex = new THREE.CanvasTexture(swSkyCanvas);
  swSkyTex.colorSpace = THREE.SRGBColorSpace;
  const swStars = Array.from({ length: 70 }, () => [Math.random() * 512, Math.random() * 170, Math.random()]);
  function drawSwSky(altD) {
    const g = swSkyCanvas.getContext("2d");
    let top, bot;
    if (altD > 8)       { top = "#6fb0e4"; bot = "#c2dcee"; }
    else if (altD > 0)  { top = "#7898c2"; bot = "#f2b380"; }
    else if (altD > -8) { top = "#2c3c60"; bot = "#d97a6a"; }
    else                { top = "#0a1222"; bot = "#1a2840"; }
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, top); grad.addColorStop(1, bot);
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 256);
    if (altD < -7 && swWx.clouds < 0.6) {
      for (const [x, y, r] of swStars) {
        g.fillStyle = `rgba(255,255,255,${(0.3 + r * 0.5) * (1 - swWx.clouds)})`;
        g.fillRect(x, y, r > 0.8 ? 2 : 1.3, r > 0.8 ? 2 : 1.3);
      }
    }
    if (swWx.clouds > 0.12) {
      const cc = altD > 0 ? 215 : 36;
      for (let i = 0; i < swWx.clouds * 12; i++) {
        g.fillStyle = `rgba(${cc},${cc},${cc + 6},${0.12 + swWx.clouds * 0.2})`;
        g.beginPath();
        g.ellipse(((i * 167) % 560) - 24, 16 + (i * 53) % 130, 80 + (i * 31) % 50, 14 + (i * 13) % 12, 0, 0, 7);
        g.fill();
      }
    }
    swSkyTex.needsUpdate = true;
  }
  drawSwSky(10);
  const seaBackdrop = new THREE.Mesh(new THREE.PlaneGeometry(60, 12),
    new THREE.MeshBasicMaterial({ map: swSkyTex }));
  seaBackdrop.position.set(BOAT.x, 4.0, BOAT.z - BD / 2 - 8.0);
  addB(seaBackdrop);
  // sun + moon, where Sweden actually has them
  const swSun = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff2cc, transparent: true }));
  swSun.position.set(BOAT.x, 2, BOAT.z - BD / 2 - 6.3);
  addB(swSun);
  const swMoon = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24),
    new THREE.MeshBasicMaterial({ color: 0xe8eef8, transparent: true }));
  swMoon.position.set(BOAT.x, 2, BOAT.z - BD / 2 - 6.25);
  addB(swMoon);
  // skerries on the horizon
  for (const [sx, sw2] of [[-3.4, 2.4], [3.8, 1.6]]) {
    const sk = new THREE.Mesh(new THREE.SphereGeometry(sw2 / 2, 12, 8), new THREE.MeshBasicMaterial({ color: 0x141c22 }));
    sk.scale.y = 0.12;
    sk.position.set(BOAT.x + sx, 1.06, BOAT.z - BD / 2 - 5.6);
    addB(sk);
  }
  // bands of water as HUGE stacked sheets (40 m wide, 3 m tall):
  // only their bobbing toplines are ever visible, stacked toward the
  // horizon — no edges to catch from any angle inside the cabin
  const waveTexes = [];
  const waveBands = [];
  const bandSpecs = [
    { z: 1.0, top: 1.10, base: "#39597a", speed: 0.045, bobA: 0.020, bobF: 0.9 },
    { z: 2.4, top: 1.17, base: "#2e4a68", speed: 0.030, bobA: 0.015, bobF: 0.7 },
    { z: 4.0, top: 1.24, base: "#243c56", speed: 0.018, bobA: 0.010, bobF: 0.55 },
    { z: 6.0, top: 1.30, base: "#1b2e44", speed: 0.009, bobA: 0.006, bobF: 0.4 },
  ];
  for (const spec of bandSpecs) {
    const tx = canvasTex(256, 256, (g) => {
      g.fillStyle = spec.base;
      g.fillRect(0, 0, 256, 256);
      // wave lines hug the top edge; plain water below
      g.strokeStyle = "rgba(225,240,255,0.30)";
      g.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        for (let x = 0; x <= 256; x += 6) {
          const y = 6 + i * 11 + Math.sin(x * 0.07 + i * 2.1) * 3.2;
          x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        g.stroke();
      }
      g.fillStyle = "rgba(255,255,255,0.10)";
      for (let i = 0; i < 22; i++) g.fillRect((i * 37) % 256, (i * 17) % 34, 4, 1.6);
      const deep = g.createLinearGradient(0, 36, 0, 256);
      deep.addColorStop(0, "rgba(0,0,0,0)");
      deep.addColorStop(1, "rgba(0,0,0,0.35)");
      g.fillStyle = deep;
      g.fillRect(0, 36, 256, 220);
    });
    tx.wrapS = THREE.RepeatWrapping;
    tx.repeat.set(14, 1);
    waveTexes.push({ tx, speed: spec.speed });
    const band = new THREE.Mesh(new THREE.PlaneGeometry(56, 3),
      new THREE.MeshBasicMaterial({ map: tx }));
    band.position.set(BOAT.x, spec.top - 1.5, BOAT.z - BD / 2 - spec.z);
    addB(band);
    waveBands.push({ mesh: band, y: spec.top - 1.5, bobA: spec.bobA, bobF: spec.bobF });
  }

  // the shore: a wide strip of land with a falu-red cottage, pines,
  // bushes, rocks — behind the farthest water
  const shoreZ = 7.0;
  const land = new THREE.Mesh(new THREE.BoxGeometry(56, 0.5, 2.0),
    new THREE.MeshBasicMaterial({ color: 0x2e3c2c }));
  land.position.set(BOAT.x, 1.18, BOAT.z - BD / 2 - shoreZ);
  addB(land);
  const house = new THREE.Group();
  const hbody = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.55),
    new THREE.MeshBasicMaterial({ color: 0x8a2a1e }));
  hbody.position.y = 0.27;
  house.add(hbody);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.4, 4),
    new THREE.MeshBasicMaterial({ color: 0x2a2226 }));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 0.74;
  house.add(roof);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x55505a }));
  chimney.position.set(0.2, 0.85, 0);
  house.add(chimney);
  for (const cx of [-0.46, 0.46]) {
    const corner = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 0.57),
      new THREE.MeshBasicMaterial({ color: 0xe8e2d4 }));
    corner.position.set(cx, 0.27, 0);
    house.add(corner);
  }
  const houseWin = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.14),
    new THREE.MeshBasicMaterial({ color: 0xffd27a }));
  houseWin.position.set(-0.18, 0.3, 0.281);
  house.add(houseWin);
  // smoke from the chimney when Gotland is cold
  const smokePuffs = [];
  for (let i = 0; i < 3; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.06 + i * 0.025, 7, 5),
      new THREE.MeshBasicMaterial({ color: 0x9aa0a8, transparent: true, opacity: 0.5 }));
    puff.position.set(0.2, 1.0 + i * 0.18, 0);
    puff.visible = false;
    house.add(puff);
    smokePuffs.push(puff);
  }
  house.position.set(BOAT.x - 1.7, 1.43, BOAT.z - BD / 2 - shoreZ + 0.2);
  addB(house);
  for (const [tx2, th] of [[-13.5, 1.0], [-9.8, 0.85], [-4.6, 0.9], [-3.6, 1.15], [0.4, 1.0], [1.5, 0.8], [2.6, 1.05], [5.2, 0.95], [9.4, 1.1], [12.8, 0.9], [-16.5, 0.95], [16.2, 1.0]]) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, th * 0.35, 6),
      new THREE.MeshBasicMaterial({ color: 0x4a3826 }));
    trunk.position.set(BOAT.x + tx2, 1.43 + th * 0.17, BOAT.z - BD / 2 - shoreZ - 0.3);
    addB(trunk);
    for (let l = 0; l < 3; l++) {
      const tier = new THREE.Mesh(new THREE.ConeGeometry(0.26 - l * 0.06, th * 0.42, 7),
        new THREE.MeshBasicMaterial({ color: l % 2 ? 0x1e3424 : 0x24402a }));
      tier.position.set(BOAT.x + tx2, 1.43 + th * 0.35 + l * th * 0.22, BOAT.z - BD / 2 - shoreZ - 0.3);
      addB(tier);
    }
  }
  for (const [bx, bs] of [[-0.9, 0.16], [3.4, 0.13], [-3.0, 0.11]]) {
    const bush = new THREE.Mesh(new THREE.SphereGeometry(bs, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x2e4a30 }));
    bush.scale.y = 0.7;
    bush.position.set(BOAT.x + bx, 1.46, BOAT.z - BD / 2 - shoreZ + 0.7);
    addB(bush);
  }
  for (const [rx, rs] of [[-1.6, 0.14], [0.9, 0.1], [4.2, 0.17], [-4.1, 0.09], [-8.2, 0.15], [7.6, 0.12], [-12.4, 0.1], [11.2, 0.16]]) {
    const rock = new THREE.Mesh(new THREE.SphereGeometry(rs, 7, 5),
      new THREE.MeshBasicMaterial({ color: 0x6a6a70 }));
    rock.scale.set(1.3, 0.55, 1);
    rock.position.set(BOAT.x + rx, 1.3, BOAT.z - BD / 2 - shoreZ + 0.85);
    addB(rock);
  }
  // lighthouse on the far skerry, blinking all night
  const skerryFar = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0x141c22 }));
  skerryFar.scale.y = 0.14;
  skerryFar.position.set(BOAT.x + 6.5, 1.3, BOAT.z - BD / 2 - 6.6);
  addB(skerryFar);
  const lhTower = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.55, 8),
    new THREE.MeshBasicMaterial({ color: 0xc8c2b4 }));
  lhTower.position.set(BOAT.x + 6.5, 1.6, BOAT.z - BD / 2 - 6.6);
  addB(lhTower);
  const lhLamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff4444 }));
  lhLamp.position.set(BOAT.x + 6.5, 1.92, BOAT.z - BD / 2 - 6.6);
  addB(lhLamp);
  // northern lights — only on truly dark, clear Gotland nights
  const auroraTex = canvasTex(256, 128, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, "rgba(60,255,150,0)");
    grad.addColorStop(0.45, "rgba(60,255,150,0.30)");
    grad.addColorStop(0.75, "rgba(110,255,190,0.14)");
    grad.addColorStop(1, "rgba(60,255,150,0)");
    g.fillStyle = grad;
    for (let x = 0; x < 256; x += 7) {
      const h2 = 70 + Math.sin(x * 0.05) * 28;
      g.fillRect(x, 64 - h2 / 2 + Math.sin(x * 0.02) * 12, 6, h2);
    }
  });
  const aurora = new THREE.Mesh(new THREE.PlaneGeometry(56, 4.6),
    new THREE.MeshBasicMaterial({ map: auroraTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  aurora.position.set(BOAT.x, 4.4, BOAT.z - BD / 2 - 6.4);
  addB(aurora);

  // ---- the boat's own light: the Swedish sun/moon through the holes ----
  const boatSun = new THREE.SpotLight(0xfff0d8, 0, 60, 0.45, 0.35, 0);
  boatSun.castShadow = true;
  boatSun.shadow.mapSize.set(1024, 1024);
  boatSun.shadow.camera.near = 2; boatSun.shadow.camera.far = 35;
  boatSun.shadow.bias = -0.0005;
  addB(boatSun);
  boatSun.target.position.set(BOAT.x, 0.8, BOAT.z);
  addB(boatSun.target);
  const boatFill = add(new THREE.PointLight(0xbac8d8, 2.2, 5.5, 2));
  boatFill.position.set(BOAT.x, BH - 0.3, BOAT.z + 0.4);

  function updateBoatSky() {
    const now = new Date();
    const sun = getSunPosition(now, SWEDEN.lat, SWEDEN.lng);
    const moon = getMoonPosition(now, SWEDEN.lat, SWEDEN.lng);
    const { fraction } = getMoonIllumination(now);
    const altD = sun.altitude / (Math.PI / 180);
    drawSwSky(altD);
    const place = (mesh, body, big) => {
      const az = Math.max(-1.0, Math.min(1.0, body.azimuth));
      mesh.position.x = BOAT.x + Math.sin(az) * 10;
      mesh.position.y = 1.1 + Math.max(-0.4, Math.min(4.6, Math.tan(Math.max(0.02, body.altitude)) * 6));
      mesh.visible = body.altitude > -0.03 && Math.abs(body.azimuth) < 1.15;
      return mesh.visible;
    };
    house.children[5].material.color.set(altD < -2 ? 0xffd27a : 0x1a222e);  // their lights come on at dusk
    // nightlife: the nightstand lamp, cottage smoke, aurora, lighthouse
    nightLamp.intensity = altD < -4 ? 3.2 : 0;
    nlShade.material.color.set(altD < -4 ? 0xffd9a0 : 0x2a2620);
    const cold = (swWx.temp ?? 12) < 8;
    smokePuffs.forEach(p => { p.visible = cold; });
    aurora.material.opacity = (altD < -10 && swWx.clouds < 0.4) ? 0.55 : 0;
    lhLamp.userData.night = altD < -2;
    const sunUp = place(swSun, sun);
    swSun.material.opacity = Math.max(0.25, 1 - swWx.clouds * 0.8);
    const moonUp = place(swMoon, moon);
    swMoon.material.opacity = (0.35 + 0.6 * fraction) * (1 - swWx.clouds * 0.7);
    // the beam through the windows
    const src = sun.altitude > -0.05 ? sun : moon;
    const useMoon = !(sun.altitude > -0.05);
    const az = Math.max(-0.9, Math.min(0.9, src.azimuth));
    boatSun.position.set(
      BOAT.x + Math.sin(az) * 9,
      WCY + Math.tan(Math.max(0.06, src.altitude)) * 9,
      BOAT.z - BD / 2 - 9);
    const dim = Math.max(0.2, 1 - 0.7 * swWx.clouds);
    if (!useMoon && sun.altitude > 0) {
      boatSun.color.set(0xfff0d8);
      boatSun.intensity = (0.6 + 1.7 * Math.sin(Math.min(sun.altitude, 1.2))) * dim;
      boatFill.intensity = 1.6 + 2.2 * Math.sin(Math.min(sun.altitude, 1.2)) * dim;
      boatFill.color.set(0xc8d4e0);
    } else if (useMoon && moon.altitude > 0) {
      boatSun.color.set(0xbfd0ee);
      boatSun.intensity = (0.1 + 0.5 * Math.sin(moon.altitude) * fraction) * dim;
      boatFill.intensity = 0.8;
      boatFill.color.set(0x8a9ab8);
    } else {
      boatSun.intensity = 0.06;
      boatFill.intensity = 0.6;
      boatFill.color.set(0x6a7890);
    }
  }
  // first run happens on the first tick, after the whole cabin exists

  // ---- interior: galley, bed, table + volca, clock, lantern, sign ----
  // the galley, cuter and busier: cabinet-door counter, stove rings,
  // open shelf with plates and mugs, and tonight's veggies
  const counter = bAdd(box(0.55, 0.9, 1.6, new THREE.MeshLambertMaterial({
    map: canvasTex(256, 256, (g) => {
      g.fillStyle = "#8a6a4a"; g.fillRect(0, 0, 256, 256);
      for (const dx of [18, 134]) {
        g.strokeStyle = "rgba(40,26,14,0.7)"; g.lineWidth = 5;
        g.strokeRect(dx, 60, 104, 168);
        g.fillStyle = "#3a2c1c";
        g.fillRect(dx + 84, 132, 8, 26);
      }
    }),
  })));
  counter.position.set(BOAT.x + BW / 2 - 0.3, 0.45, BOAT.z + 0.55);
  counter.castShadow = true;
  const counterTop = bAdd(box(0.58, 0.04, 1.64, lam(0xd8d2c4)));
  counterTop.position.set(BOAT.x + BW / 2 - 0.3, 0.92, BOAT.z + 0.55);
  const sink = bAdd(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.06, 14), lam(0x9aa0a8)));
  sink.position.set(BOAT.x + BW / 2 - 0.3, 0.93, BOAT.z + 0.2);
  const faucet = bAdd(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8), lam(0xb8bec8)));
  faucet.position.set(BOAT.x + BW / 2 - 0.18, 1.03, BOAT.z + 0.2);
  const faucetHit = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.22), new THREE.MeshBasicMaterial({ visible: false }));
  faucetHit.position.set(BOAT.x + BW / 2 - 0.26, 1.0, BOAT.z + 0.2);
  faucetHit.userData.faucet = true;
  addB(faucetHit);
  for (const sz of [0.62, 0.92]) {
    const ring = bAdd(new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 8, 18), lam(0x1a1a1e)));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(BOAT.x + BW / 2 - 0.3, 0.945, BOAT.z + sz);
  }
  const kettle = bAdd(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.13, 10), lam(0xc04030)));
  kettle.position.set(BOAT.x + BW / 2 - 0.3, 1.01, BOAT.z + 0.62);
  kettle.castShadow = true;
  const kettleHit = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), new THREE.MeshBasicMaterial({ visible: false }));
  kettleHit.position.set(BOAT.x + BW / 2 - 0.3, 1.05, BOAT.z + 0.62);
  kettleHit.userData.kettle = true;
  addB(kettleHit);
  const gShelf = bAdd(box(0.26, 0.035, 1.2, lam(0x4a3826)));
  gShelf.position.set(BOAT.x + BW / 2 - 0.15, 1.55, BOAT.z + 0.55);
  for (let i = 0; i < 3; i++) {
    const plate = bAdd(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.012, 16), lam(0xece4d2)));
    plate.position.set(BOAT.x + BW / 2 - 0.15, 1.585 + i * 0.018, BOAT.z + 0.18);
  }
  for (const mz of [0.62, 0.86]) {
    const mug = bAdd(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.032, 0.08, 10),
      lam(mz > 0.7 ? 0x5a8aa8 : 0xc04030)));
    mug.position.set(BOAT.x + BW / 2 - 0.15, 1.61, BOAT.z + mz);
  }
  // tonight's veggies on a cutting board
  const board = bAdd(box(0.26, 0.018, 0.18, lam(0xb89a6a)));
  board.position.set(BOAT.x + BW / 2 - 0.3, 0.95, BOAT.z + 1.22);
  for (const [vx, vz] of [[-0.05, -0.03], [0.02, 0.04], [0.07, -0.04]]) {
    const tom = bAdd(new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), lam(0xd03028)));
    tom.position.set(BOAT.x + BW / 2 - 0.3 + vx, 0.99, BOAT.z + 1.22 + vz);
  }
  for (const cx2 of [-0.09, 0.11]) {
    const carrot = bAdd(new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.11, 7), lam(0xe07820)));
    carrot.rotation.z = Math.PI / 2.2;
    carrot.position.set(BOAT.x + BW / 2 - 0.3 + cx2, 0.975, BOAT.z + 1.3);
  }
  const greens = bAdd(new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), lam(0x3a7a3a)));
  greens.scale.y = 0.6;
  greens.position.set(BOAT.x + BW / 2 - 0.36, 0.975, BOAT.z + 1.12);

  // Desi's radio, on the galley counter, dial turned to face the cabin. it
  // streams the real Swedish channels (radio.js) — and P4 Gotland, the local
  // station, is literally the sky outside these windows.
  const desiRadio = makeRadio("FM · SVERIGES RADIO", "radio");
  desiRadio.group.position.set(BOAT.x + BW / 2 - 0.34, 0.94, BOAT.z - 0.08);
  desiRadio.group.rotation.y = -Math.PI / 2 + 0.12;
  addB(desiRadio.group);
  const radioHits = desiRadio.hits, setRadioNeedle = desiRadio.setNeedle, setRadioPower = desiRadio.setPower;
  // where the sound "comes from" — main.js fades the stream by distance to here
  const radioPos = new THREE.Vector3();
  desiRadio.group.updateWorldMatrix(true, false);
  desiRadio.group.getWorldPosition(radioPos);

  // the bed, done right: headboard against the port wall, frame,
  // mattress, duvet with a fold, two pillows — and a nightstand whose
  // lamp only glows when Gotland is dark
  const bedX = BOAT.x - BW / 2, bedZ = BOAT.z - 0.1;
  const headboard = bAdd(box(0.06, 1.0, 1.05, lam(0x5a4026)));
  headboard.position.set(bedX + 0.05, 0.5, bedZ);
  const bedFrame = bAdd(box(2.0, 0.18, 1.05, lam(0x5a4026)));
  bedFrame.position.set(bedX + 1.05, 0.21, bedZ);
  bedFrame.castShadow = true;
  const mattress = bAdd(box(1.9, 0.16, 0.95, lam(0xece4d2)));
  mattress.position.set(bedX + 1.05, 0.38, bedZ);
  const duvet = bAdd(box(1.25, 0.1, 0.99, lam(0x6a8aa8)));
  duvet.position.set(bedX + 1.38, 0.43, bedZ);
  const duvetFold = bAdd(box(0.18, 0.115, 0.99, lam(0x8aa8c2)));
  duvetFold.position.set(bedX + 0.82, 0.435, bedZ);
  for (const pz of [-0.24, 0.24]) {
    const pillow = bAdd(box(0.32, 0.11, 0.4, lam(0xf2ece0)));
    pillow.rotation.z = -0.18;
    pillow.position.set(bedX + 0.28, 0.52, bedZ + pz);
  }
  const nightstand = bAdd(box(0.34, 0.45, 0.34, lam(0x6a4e34)));
  nightstand.position.set(bedX + 0.22, 0.225, bedZ + 0.85);
  nightstand.castShadow = true;
  const nlBase = bAdd(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 0.14, 8), lam(0x3a342a)));
  nlBase.position.set(bedX + 0.22, 0.52, bedZ + 0.85);
  const nlShade = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.09, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x2a2620, side: THREE.DoubleSide }));
  nlShade.position.set(bedX + 0.22, 0.63, bedZ + 0.85);
  addB(nlShade);
  const nightLamp = new THREE.PointLight(0xffc88a, 0, 2.2, 2);
  nightLamp.position.set(bedX + 0.22, 0.62, bedZ + 0.85);
  addB(nightLamp);

  // table + stools + volca
  const btable = bAdd(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 16), lam(0xd8d2c4)));
  btable.position.set(BOAT.x + 0.55, 0.74, BOAT.z + 0.95);
  btable.castShadow = true;
  const tleg = bAdd(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.2, 0.72, 10), lam(0x4a3826)));
  tleg.position.set(BOAT.x + 0.55, 0.37, BOAT.z + 0.95);
  for (const [sx, sz] of [[-0.62, 0.12], [0.42, 0.62]]) {
    const stool = bAdd(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.45, 10), lam(0x6a4e34)));
    stool.position.set(BOAT.x + 0.55 + sx, 0.22, BOAT.z + 0.95 + sz);
    stool.castShadow = true;
  }
  const volcaCanvas = document.createElement("canvas");
  volcaCanvas.width = 256; volcaCanvas.height = 160;
  const volcaTex = new THREE.CanvasTexture(volcaCanvas);
  volcaTex.colorSpace = THREE.SRGBColorSpace;
  function drawVolca(pressed = -1) {
    const g = volcaCanvas.getContext("2d");
    g.fillStyle = "#2a2a30";
    g.fillRect(0, 0, 256, 160);
    g.fillStyle = "#c8c2b4";
    g.font = "700 14px monospace";
    g.fillText("DESI-SAMPLE", 12, 22);
    for (let i = 0; i < 3; i++) {
      g.fillStyle = "#1a1a1e";
      g.beginPath(); g.arc(180 + i * 26, 18, 9, 0, 7); g.fill();
    }
    const names = ["KIK", "SNR", "HAT", "OHH", "CLP", "TOM", "RIM", "COW"];
    for (let i = 0; i < 8; i++) {
      const x = 10 + (i % 4) * 60, y = 44 + Math.floor(i / 4) * 56;
      g.fillStyle = i === pressed ? "#ffd23c" : "#3a3a44";
      g.fillRect(x, y, 52, 46);
      g.strokeStyle = "#15151a";
      g.strokeRect(x, y, 52, 46);
      g.fillStyle = i === pressed ? "#14110a" : "#9aa0a8";
      g.font = "700 13px monospace";
      g.fillText(names[i], x + 10, y + 28);
    }
    volcaTex.needsUpdate = true;
  }
  drawVolca();
  const volcaBody = bAdd(box(0.3, 0.035, 0.2, lam(0x2a2a30)));
  volcaBody.position.set(BOAT.x + 0.55, 0.785, BOAT.z + 0.95);
  volcaBody.rotation.y = 0.4;
  volcaBody.castShadow = true;
  const volcaFace = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.19),
    new THREE.MeshBasicMaterial({ map: volcaTex }));
  volcaFace.rotation.x = -Math.PI / 2;
  volcaFace.rotation.z = -0.4;
  volcaFace.position.set(BOAT.x + 0.55, 0.804, BOAT.z + 0.95);
  volcaFace.userData.volca = true;
  addB(volcaFace);
  let volcaResetT = null;
  function pressVolcaPad(i) {
    drawVolca(i);
    clearTimeout(volcaResetT);
    volcaResetT = setTimeout(() => drawVolca(-1), 150);
  }

  // swedish wall clock — Stockholm time, on the starboard wall
  const clockCanvas = document.createElement("canvas");
  clockCanvas.width = 256; clockCanvas.height = 256;
  const swClockTex = new THREE.CanvasTexture(clockCanvas);
  swClockTex.colorSpace = THREE.SRGBColorSpace;
  function drawSwClock() {
    const g = clockCanvas.getContext("2d");
    g.clearRect(0, 0, 256, 256);
    // digital, military time — Gotland
    g.fillStyle = "#10130f";
    g.fillRect(8, 70, 240, 116);
    g.strokeStyle = "#4a3826";
    g.lineWidth = 10;
    g.strokeRect(8, 70, 240, 116);
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date());
    g.fillStyle = "#7dff9a";
    g.shadowColor = "#7dff9a"; g.shadowBlur = 10;
    g.font = "700 64px 'SF Mono', Menlo, monospace";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(parts, 128, 122);
    g.shadowBlur = 0;
    g.font = "700 17px monospace";
    g.fillStyle = "#9aa89a";
    g.fillText("GOTLAND · SWE", 128, 164);
    swClockTex.needsUpdate = true;
  }
  drawSwClock();
  const swClock = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.52),
    new THREE.MeshBasicMaterial({ map: swClockTex, transparent: true }));
  swClock.rotation.y = -Math.PI / 2;
  swClock.position.set(BOAT.x + BW / 2 - 0.04, 1.6, BOAT.z - 0.6);
  addB(swClock);

  // swinging lantern with a real warm light
  const lantern = new THREE.Group();
  const lbody = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.16, 10), lam(0x3a342a));
  const lglass = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.09, 10),
    new THREE.MeshBasicMaterial({ color: 0xffd27a }));
  lbody.position.y = -0.1; lglass.position.y = -0.1;
  const lanternLight = new THREE.PointLight(0xffc88a, 4.5, 4.5, 2);
  lanternLight.position.y = -0.1;
  lantern.add(lbody, lglass, lanternLight);
  lantern.position.set(BOAT.x + 0.55, BH - 0.04, BOAT.z + 0.95);
  addB(lantern);

  // the name, and the way home
  const boatSign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.22), new THREE.MeshBasicMaterial({
    map: canvasTex(512, 112, (g) => {
      g.fillStyle = "#2a1c10"; g.fillRect(0, 0, 512, 112);
      g.strokeStyle = "#a8853c"; g.lineWidth = 6; g.strokeRect(8, 8, 496, 96);
      g.font = "500 64px 'Six Caps', serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = "#e8c87a"; g.letterSpacing = "10px";
      g.fillText("THE DESI", 256, 58);
    }),
  }));
  boatSign.rotation.y = Math.PI;
  boatSign.position.set(BOAT.x, 1.85, BOAT.z + BD / 2 - 0.06);
  addB(boatSign);
  const boatDoor = bAdd(box(0.7, 1.7, 0.04, lam(0x4a3520)));
  boatDoor.rotation.y = Math.PI;
  boatDoor.position.set(BOAT.x + 1.4, 0.85, BOAT.z + BD / 2 - 0.03);
  boatDoor.userData.boatExit = true;

  // Desi's walls take notes too — three postable surfaces
  for (const [id, mesh, w, origin, uDir, normal, voids] of [
    ["boat_port", portWall, BD,
      new THREE.Vector3(BOAT.x - BW / 2, 0, BOAT.z + BD / 2), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0),
      [{ u0: 0.55, u1: 2.85, v0: 0, v1: 1.15 }]],                       // the bed's headboard zone
    ["boat_stb", stbWall, BD,
      new THREE.Vector3(BOAT.x + BW / 2, 0, BOAT.z - BD / 2), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0),
      [{ u0: 0.8, u1: 1.45, v0: 1.25, v1: 1.95 },                     // the clock
       { u0: 1.35, u1: 3.2, v0: 0, v1: 2.1 }]],                       // galley + shelf
    ["boat_door", doorWall, BW,
      new THREE.Vector3(BOAT.x - BW / 2, 0, BOAT.z + BD / 2), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1),
      [{ u0: 3.2, u1: 4.2, v0: 0, v1: 1.85 },                         // exit door
       { u0: 1.75, u1: 2.85, v0: 1.6, v1: 2.05 }]],                   // the name sign
  ]) {
    mesh.userData.postable = true;
    walls.push({ id, mesh, w, h: BH, origin, uDir, vDir: new THREE.Vector3(0, 1, 0), normal, voids });
  }

  // a message in a bottle, washed against the hull
  const bottle = new THREE.Group();
  const bglass = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.16, 10),
    new THREE.MeshLambertMaterial({ color: 0x4a7a5a, transparent: true, opacity: 0.7 }));
  const bneck = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.07, 8),
    new THREE.MeshLambertMaterial({ color: 0x4a7a5a, transparent: true, opacity: 0.7 }));
  bneck.position.y = 0.11;
  const bcork = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.025, 8), lam(0xb89a6a));
  bcork.position.y = 0.155;
  const bpaper = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 6), lam(0xece4d2));
  bottle.add(bglass, bneck, bcork, bpaper);
  bottle.rotation.z = 1.25;
  bottle.position.set(BOAT.x - 1.2, 0.06, BOAT.z - 1.35);
  addB(bottle);
  const bottleHit = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4),
    new THREE.MeshBasicMaterial({ visible: false }));
  bottleHit.position.set(BOAT.x - 1.2, 0.12, BOAT.z - 1.35);
  bottleHit.userData.bottle = true;
  addB(bottleHit);

  // boat furniture is click-solid too
  blockers.push(counter, counterTop, bedFrame, mattress, duvet, nightstand, btable);

  // dust hanging in the cabin air — life
  const BDUST = 110;
  const bDustPos = new Float32Array(BDUST * 3);
  const bDustVel = [];
  for (let i = 0; i < BDUST; i++) {
    bDustPos[i * 3] = BOAT.x + rand(-2.1, 2.1);
    bDustPos[i * 3 + 1] = rand(0.1, BH - 0.1);
    bDustPos[i * 3 + 2] = BOAT.z + rand(-1.5, 1.5);
    bDustVel.push({ x: rand(-0.01, 0.01), y: rand(0.003, 0.016), z: rand(-0.01, 0.01) });
  }
  const bDustGeo = new THREE.BufferGeometry();
  bDustGeo.setAttribute("position", new THREE.BufferAttribute(bDustPos, 3));
  addB(new THREE.Points(bDustGeo, new THREE.PointsMaterial({
    color: 0xd8c09a, size: 0.011, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })));

  // stamp the whole boat (meshes AND lights) onto layer 1
  boatGroup.traverse((o) => { o.layers.set(1); });

  /* --- THE CREW: the Echo Arena, far above everything ---
     Behind the Echo poster in the arcade (or one click in METRO OS).
     Laid out from the real top-down: a long hall split into orange and
     blue zones around MID, goal domes with backboards and 3-point
     bubbles at each end, floating island cubes to bank off, mid-wing
     tunnels, and beyond each dome a set of numbered launch tubes with
     yellow catapult handles feeding back to a team locker room with a
     ready-up kiosk. Movement out there is pure momentum. --- */
  const ARENA = { x: 0, y: 80, z: 0, hx: 30, hy: 11, hz: 14 };
  const A = ARENA;
  const DOME_R = 8;            // the goal domes capping each end
  const GOAL_X = 34;           // ring planes, inside the domes
  const BUBBLE_R = 14;         // outside this sphere a goal pays three
  const TUBE_Z = [-3.6, 0, 3.6];   // spread so the fat tubes don't touch
  const TUBE_R = 1.7;              // big enough to fly through without kissing the wall
  const TUBE_Y = -4.2;         // tubes run under the goal, clean sightline
  const TUBE_X0 = 38.5, TUBE_X1 = 49;
  const LOCKER = { cx: 54.5, hx: 5.5, hy: 6, hz: 6 };

  const panelTex = canvasTex(512, 512, (g) => {
    g.fillStyle = "#3d4658";
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = "rgba(170,195,230,0.55)";
    g.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 512); g.stroke();
      g.beginPath(); g.moveTo(0, i * 64); g.lineTo(512, i * 64); g.stroke();
    }
    for (let i = 0; i < 10; i++) {
      g.fillStyle = "rgba(90,105,130,0.6)";
      g.fillRect((i * 197) % 448, (i * 131) % 448, 56, 22);
    }
  });
  panelTex.wrapS = panelTex.wrapT = THREE.RepeatWrapping;
  const arenaMat = new THREE.MeshStandardMaterial({
    map: panelTex, color: 0xd8dee8, metalness: 0.45, roughness: 0.6, side: THREE.DoubleSide,
  });
  const bevelMat = new THREE.MeshStandardMaterial({ color: 0x2a3142, metalness: 0.7, roughness: 0.4 });
  const arenaGroup = new THREE.Group();
  scene.add(arenaGroup);
  const addA = (m) => { arenaGroup.add(m); return m; };

  /* ---- where you're allowed to fly: a union of simple volumes.
     boxes and spheres in arena-local coordinates; the clamp walks
     them all, and the islands inside the hall push you OUT. ---- */
  const VOLS = [
    { t: "b", x0: -A.hx, x1: A.hx, y0: -A.hy, y1: A.hy, z0: -A.hz, z1: A.hz },  // main hall
    // goal pockets: open drums from the end-wall mouth to the back plate.
    // connected volumes must OVERLAP by more than the body radius, or
    // the margin math builds an invisible wall at the seam
    { t: "b", x0: -38.5, x1: -A.hx + 1.5, y0: -5.5, y1: 5.5, z0: -5.5, z1: 5.5 },
    { t: "b", x0: A.hx - 1.5, x1: 38.5, y0: -5.5, y1: 5.5, z0: -5.5, z1: 5.5 },
    { t: "b", x0: -7, x1: 7, y0: -2.2, y1: 2.2, z0: A.hz - 1.5, z1: A.hz + 2.6 },   // mid-wing tunnels
    { t: "b", x0: -7, x1: 7, y0: -2.2, y1: 2.2, z0: -A.hz - 2.6, z1: -A.hz + 1.5 },
  ];
  for (const s of [-1, 1]) {
    for (const tz of TUBE_Z) {
      // noDisc: the disc plays in the arena — it never rides the tubes
      VOLS.push({ t: "b", noDisc: true, x0: Math.min(s * (TUBE_X0 - 2), s * (TUBE_X1 + 1.5)), x1: Math.max(s * (TUBE_X0 - 2), s * (TUBE_X1 + 1.5)),
                  y0: TUBE_Y - 1.6, y1: TUBE_Y + 1.6, z0: tz - 1.6, z1: tz + 1.6 });
    }
    VOLS.push({ t: "b", noDisc: true, x0: s * LOCKER.cx - LOCKER.hx, x1: s * LOCKER.cx + LOCKER.hx,
                y0: -LOCKER.hy, y1: LOCKER.hy, z0: -LOCKER.hz, z1: LOCKER.hz });
  }
  // floating islands — the cube clusters from the top-down, mirrored
  const ISLES = [];
  for (const s of [-1, 1]) {
    for (const [ix, iy, iz, h] of [
      [14, 2.6, -6.5, 1.3], [12.2, 0.6, -8.2, 0.9],
      [11, -3.2, 7, 1.5], [20, 3.8, 5.5, 1.1], [22, -4.0, -4.5, 1.2],
    ]) ISLES.push({ x: s * ix, y: iy, z: iz, h });
  }
  function volClamp(v, p, r) {
    if (v.t === "b") {
      const x = Math.max(v.x0 + r, Math.min(v.x1 - r, p.x));
      const y = Math.max(v.y0 + r, Math.min(v.y1 - r, p.y));
      const z = Math.max(v.z0 + r, Math.min(v.z1 - r, p.z));
      return { x, y, z, in: x === p.x && y === p.y && z === p.z };
    }
    const dx = p.x - v.cx, d = Math.hypot(dx, p.y, p.z);
    const rr = v.r - r;
    if (d <= rr) return { x: p.x, y: p.y, z: p.z, in: true };
    const k = rr / (d || 1);
    return { x: v.cx + dx * k, y: p.y * k, z: p.z * k, in: false };
  }
  // keep (pos, vel) inside the union and outside the islands.
  // pos is absolute world coords, mutated in place. r = body radius.
  function arenaClamp(pos, vel, r = 0.55, isDisc = false) {
    const p = { x: pos.x - A.x, y: pos.y - A.y, z: pos.z - A.z };
    let inside = false, best = null, bestD = Infinity;
    for (const v of VOLS) {
      if (isDisc && v.noDisc) continue;   // the disc stays out of the tunnels
      const c = volClamp(v, p, r);
      if (c.in) { inside = true; break; }
      const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2 + (c.z - p.z) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    }
    if (!inside && best) {
      const nx = p.x - best.x, ny = p.y - best.y, nz = p.z - best.z;
      const ln = Math.hypot(nx, ny, nz) || 1;
      const ux = nx / ln, uy = ny / ln, uz = nz / ln;
      const vd = vel.x * ux + vel.y * uy + vel.z * uz;
      if (vd > 0) { vel.x -= 1.72 * vd * ux; vel.y -= 1.72 * vd * uy; vel.z -= 1.72 * vd * uz; }
      p.x = best.x; p.y = best.y; p.z = best.z;
    }
    for (const o of ISLES) {
      const ex = o.h + r - Math.abs(p.x - o.x);
      const ey = o.h + r - Math.abs(p.y - o.y);
      const ez = o.h + r - Math.abs(p.z - o.z);
      if (ex > 0 && ey > 0 && ez > 0) {     // inside an island — push out
        if (ex <= ey && ex <= ez) { p.x += Math.sign(p.x - o.x) * ex; vel.x = Math.sign(p.x - o.x) * Math.abs(vel.x) * 0.72; }
        else if (ey <= ez)        { p.y += Math.sign(p.y - o.y) * ey; vel.y = Math.sign(p.y - o.y) * Math.abs(vel.y) * 0.72; }
        else                      { p.z += Math.sign(p.z - o.z) * ez; vel.z = Math.sign(p.z - o.z) * Math.abs(vel.z) * 0.72; }
      }
    }
    pos.x = p.x + A.x; pos.y = p.y + A.y; pos.z = p.z + A.z;
  }
  // is there anything within arm's reach to grab? true clearance is
  // the most breathing room any one volume gives you — less than an
  // arm away from every boundary means you can hold something
  function arenaNearWall(x, y, z, reach = 1.1) {
    const p = { x: x - A.x, y: y - A.y, z: z - A.z };
    for (const o of ISLES) {
      if (Math.abs(p.x - o.x) < o.h + reach && Math.abs(p.y - o.y) < o.h + reach && Math.abs(p.z - o.z) < o.h + reach) return true;
    }
    let clear = -1;
    for (const v of VOLS) {
      let c;
      if (v.t === "b") {
        c = Math.min(p.x - v.x0, v.x1 - p.x, p.y - v.y0, v.y1 - p.y, p.z - v.z0, v.z1 - p.z);
      } else {
        c = v.r - Math.hypot(p.x - v.cx, p.y, p.z);
      }
      if (c > clear) clear = c;
    }
    return clear < reach;
  }

  /* ---- the main hall ---- */
  for (const [w, h, px2, py2, pz2, rx, ry] of [
    [2 * A.hx, 2 * A.hz, A.x, A.y - A.hy, A.z, -Math.PI / 2, 0],   // floor
    [2 * A.hx, 2 * A.hz, A.x, A.y + A.hy, A.z, Math.PI / 2, 0],    // ceiling
    [2 * A.hx, 2 * A.hy, A.x, A.y, A.z - A.hz, 0, 0],
    [2 * A.hx, 2 * A.hy, A.x, A.y, A.z + A.hz, 0, Math.PI],
  ]) {
    const wallA = new THREE.Mesh(new THREE.PlaneGeometry(w, h), arenaMat.clone());
    wallA.material.map = panelTex.clone();
    wallA.material.map.repeat.set(w / 6, h / 6);
    wallA.position.set(px2, py2, pz2);
    wallA.rotation.x = rx; wallA.rotation.y = ry;
    addA(wallA);
  }
  // end walls wear a round hole where each goal dome opens
  const endMat = new THREE.MeshStandardMaterial({ color: 0x39414f, metalness: 0.55, roughness: 0.55, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const shp = new THREE.Shape();
    shp.moveTo(-A.hz, -A.hy); shp.lineTo(A.hz, -A.hy);
    shp.lineTo(A.hz, A.hy); shp.lineTo(-A.hz, A.hy); shp.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, DOME_R, 0, Math.PI * 2, true);
    shp.holes.push(hole);
    const wallE = new THREE.Mesh(new THREE.ShapeGeometry(shp, 24), endMat);
    wallE.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    wallE.position.set(A.x + s * A.hx, A.y, A.z);
    addA(wallE);
    // the goal pocket: an open drum from the end-wall mouth back to a
    // flat plate. the plate wears three real holes where the launch
    // tubes come through — you can see the hall from your locker.
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(DOME_R, DOME_R, 8.5, 26, 1, true), endMat);
    drum.rotation.z = Math.PI / 2;
    drum.position.set(A.x + s * (A.hx + 4.25), A.y, A.z);
    addA(drum);
    const plateShape = new THREE.Shape();
    plateShape.absarc(0, 0, DOME_R, 0, Math.PI * 2, false);
    for (const tz of TUBE_Z) {
      const th = new THREE.Path();
      th.absarc(tz, TUBE_Y, TUBE_R + 0.05, 0, Math.PI * 2, true);
      plateShape.holes.push(th);
    }
    const plate = new THREE.Mesh(new THREE.ShapeGeometry(plateShape, 24), endMat);
    plate.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    plate.position.set(A.x + s * 38.5, A.y, A.z);
    addA(plate);
    // the Echo look: glowing circles ringing each tube mouth on the
    // back plate, a bright one tight to the hole and a soft echo of it
    for (const tz of TUBE_Z) {
      for (const [rr, tube2, op] of [[TUBE_R + 0.22, 0.05, 0.95], [TUBE_R + 0.55, 0.03, 0.4]]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, tube2, 8, 36),
          new THREE.MeshBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: op, depthWrite: false }));
        ring.rotation.y = Math.PI / 2;
        ring.position.set(A.x + s * 38.42, A.y + TUBE_Y, A.z + tz);
        addA(ring);
      }
    }
  }
  // banking bevels along the four long edges
  for (const [by, bz] of [[A.hy, A.hz], [A.hy, -A.hz], [-A.hy, A.hz], [-A.hy, -A.hz]]) {
    const bevel = new THREE.Mesh(new THREE.BoxGeometry(2 * A.hx, 3.4, 3.4), bevelMat);
    bevel.position.set(A.x, A.y + by, A.z + bz);
    bevel.rotation.x = Math.PI / 4;
    addA(bevel);
  }
  // neon trim: team colors at each end, white ribs across the ceiling
  const trim = (x1, y1, z1, x2, y2, z2, color) => {
    const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
    const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, len),
      new THREE.MeshBasicMaterial({ color }));
    t2.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    t2.lookAt(x2, y2, z2);
    addA(t2);
  };
  for (const sy of [-A.hy + 1.6, A.hy - 1.6]) {
    trim(A.x - A.hx + 0.05, A.y + sy, A.z - A.hz, A.x - A.hx + 0.05, A.y + sy, A.z + A.hz, 0xff7320);
    trim(A.x + A.hx - 0.05, A.y + sy, A.z - A.hz, A.x + A.hx - 0.05, A.y + sy, A.z + A.hz, 0x22a4ff);
  }
  for (let i = -4; i <= 4; i++) {
    trim(A.x + i * 6.5, A.y + A.hy - 0.1, A.z - A.hz, A.x + i * 6.5, A.y + A.hy - 0.04, A.z + A.hz, 0x8ab8ff);
  }
  // MID: the striped band where the disc starts
  for (const [mx, mc] of [[-1.3, 0xe8f0ff], [-0.45, 0x55e0d8], [0.45, 0x55e0d8], [1.3, 0xe8f0ff]]) {
    for (const [sy, sz, w, h] of [
      [-A.hy + 0.05, 0, 0.18, 2 * A.hz - 0.4], [A.hy - 0.05, 0, 0.18, 2 * A.hz - 0.4],
    ]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, h),
        new THREE.MeshBasicMaterial({ color: mc, transparent: true, opacity: 0.7 }));
      band.position.set(A.x + mx, A.y + sy, A.z + sz);
      addA(band);
    }
  }
  const centerRing = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.07, 8, 48),
    new THREE.MeshBasicMaterial({ color: 0x9adfff, transparent: true, opacity: 0.6 }));
  centerRing.rotation.y = Math.PI / 2;
  centerRing.position.set(A.x, A.y, A.z);
  addA(centerRing);
  // mid-wing tunnels: open troughs in both side walls, ringed in teal
  for (const s of [-1, 1]) {
    for (const [w, h, px3, py3, pz3, rx3, ry3] of [
      [14, 4.4, A.x, A.y, A.z + s * (A.hz + 2.6), 0, s > 0 ? Math.PI : 0],            // back wall
      [14, 2.6, A.x, A.y + 2.2, A.z + s * (A.hz + 1.3), Math.PI / 2, 0],              // top
      [14, 2.6, A.x, A.y - 2.2, A.z + s * (A.hz + 1.3), -Math.PI / 2, 0],             // bottom
    ]) {
      const t3 = new THREE.Mesh(new THREE.PlaneGeometry(w, h), endMat);
      t3.position.set(px3, py3, pz3);
      t3.rotation.x = rx3; t3.rotation.y = ry3;
      addA(t3);
    }
    const lip = new THREE.Mesh(new THREE.BoxGeometry(14.2, 0.1, 0.1),
      new THREE.MeshBasicMaterial({ color: 0x55e0d8 }));
    lip.position.set(A.x, A.y + 2.25, A.z + s * (A.hz - 0.02)); addA(lip);
    const lip2 = lip.clone(); lip2.position.y = A.y - 2.25; addA(lip2);
  }

  /* ---- goals: ring, backboard, 3-point bubble (per the POV shot) ---- */
  const goalLights = [];
  for (const [s, col] of [[-1, 0xff7320], [1, 0x22a4ff]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.16, 10, 40),
      new THREE.MeshBasicMaterial({ color: col }));
    ring.rotation.y = Math.PI / 2;
    ring.position.set(A.x + s * GOAL_X, A.y, A.z);
    addA(ring);
    // backboard: dark rounded panel behind the ring, framed in team neon
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 5), bevelMat);
    board.position.set(A.x + s * (GOAL_X + 2.2), A.y, A.z);
    addA(board);
    for (const [ey, ez, w2, h2] of [[2.45, 0, 0.12, 5.0], [-2.45, 0, 0.12, 5.0], [0, 2.45, 4.9, 0.12], [0, -2.45, 4.9, 0.12]]) {
      const fr = new THREE.Mesh(new THREE.BoxGeometry(0.34, w2 === 0.12 ? h2 : 0.12, w2 === 0.12 ? 0.12 : w2),
        new THREE.MeshBasicMaterial({ color: col }));
      fr.position.set(A.x + s * (GOAL_X + 2.2), A.y + ey, A.z + ez);
      addA(fr);
    }
    // the 3-point bubble, faint and huge
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(BUBBLE_R, 26, 16),
      new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.045,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
    bubble.position.set(A.x + s * GOAL_X, A.y, A.z);
    addA(bubble);
    const gl = new THREE.PointLight(col, 30, 16, 2);
    gl.position.set(A.x + s * (GOAL_X - 2), A.y, A.z);
    addA(gl);
    goalLights.push(gl);
    // end-zone glow disk on the dome mouth
    const glowDisk = new THREE.Mesh(new THREE.CircleGeometry(DOME_R - 0.5, 32),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    glowDisk.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2;
    glowDisk.position.set(A.x + s * (A.hx + 0.3), A.y, A.z);
    addA(glowDisk);
  }

  /* ---- islands + wall glyphs ---- */
  for (const o of ISLES) {
    const cube = new THREE.Mesh(new THREE.BoxGeometry(o.h * 2, o.h * 2, o.h * 2), bevelMat);
    cube.position.set(A.x + o.x, A.y + o.y, A.z + o.z);
    addA(cube);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(o.h * 2 + 0.05, 0.06, 0.06),
      new THREE.MeshBasicMaterial({ color: o.x < 0 ? 0xff9a50 : 0x6ac4ff }));
    edge.position.set(A.x + o.x, A.y + o.y + o.h, A.z + o.z);
    addA(edge);
  }
  const glyphTex = (col) => canvasTex(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.strokeStyle = col; g.lineWidth = 7;
    g.save(); g.translate(128, 128); g.rotate(Math.PI / 4);
    g.strokeRect(-62, -62, 124, 124);
    g.strokeRect(-30, -30, 60, 60);
    g.restore();
  });
  for (const [s, col] of [[-1, "#ff9a50"], [1, "#6ac4ff"]]) {
    const gt = glyphTex(col);
    for (const [gx2, gy2, gz2] of [[10, 4, A.hz - 0.05], [22, -4, A.hz - 0.05], [10, -4, -A.hz + 0.05], [22, 4, -A.hz + 0.05]]) {
      const gp = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4),
        new THREE.MeshBasicMaterial({ map: gt, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      gp.position.set(A.x + s * gx2, A.y + gy2, A.z + gz2);
      gp.rotation.y = gz2 > 0 ? Math.PI : 0;
      addA(gp);
    }
  }

  /* ---- launch tubes + catapults, under the goals ----
     grab the yellow handholds behind the launch ring; when the round
     starts the tunnel current carries you at 10 m/s — push (punch)
     near the end to stack your own speed on top. drift into the wall
     and you smear. main.js runs the current; we provide the shapes. ---- */
  const grabHandles = [];
  const tubeBarriers = [];
  const tubeMat = new THREE.MeshBasicMaterial({ color: 0x2c3550, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const teamCol = s < 0 ? 0xff7320 : 0x22a4ff;
    TUBE_Z.forEach((tz, ti) => {
      const len = TUBE_X1 - TUBE_X0;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(TUBE_R, TUBE_R, len, 14, 1, true), tubeMat);
      tube.rotation.z = Math.PI / 2;
      tube.position.set(A.x + s * (TUBE_X0 + len / 2), A.y + TUBE_Y, A.z + tz);
      addA(tube);
      for (const mx of [TUBE_X0, TUBE_X1]) {
        const mouth = new THREE.Mesh(new THREE.TorusGeometry(TUBE_R, 0.09, 8, 28),
          new THREE.MeshBasicMaterial({ color: teamCol }));
        mouth.rotation.y = Math.PI / 2;
        mouth.position.set(A.x + s * mx, A.y + TUBE_Y, A.z + tz);
        addA(mouth);
      }
      // the launch ring — push past this one
      const lring = new THREE.Mesh(new THREE.TorusGeometry(TUBE_R - 0.25, 0.06, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0x55e0d8, transparent: true, opacity: 0.85 }));
      lring.rotation.y = Math.PI / 2;
      lring.position.set(A.x + s * (TUBE_X1 - 3.4), A.y + TUBE_Y, A.z + tz);
      addA(lring);
      // yellow handholds BEHIND the ring (locker side)
      const hx2 = s * (TUBE_X1 - 1.8);
      for (const hz2 of [-0.95, 0.95]) {
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.14),
          new THREE.MeshBasicMaterial({ color: 0xffd23c }));
        handle.position.set(A.x + hx2, A.y + TUBE_Y, A.z + tz + hz2);
        handle.userData.launchHandle = { dir: -s, x: A.x + hx2, y: A.y + TUBE_Y, z: A.z + tz, tube: ti + 1 };
        addA(handle);
        grabHandles.push(handle);
      }
      // the barrier that drops when the round starts
      const barrier = new THREE.Mesh(new THREE.CircleGeometry(TUBE_R - 0.05, 22),
        new THREE.MeshBasicMaterial({ color: teamCol, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
      barrier.rotation.y = Math.PI / 2;
      barrier.position.set(A.x + s * (TUBE_X0 + 0.4), A.y + TUBE_Y, A.z + tz);
      barrier.visible = false;
      addA(barrier);
      tubeBarriers.push(barrier);
    });
  }
  function setTubeBarriers(on) { for (const b of tubeBarriers) b.visible = !!on; }
  // which tube (if any) is this point inside? main.js runs the current
  function inTube(x, y, z) {
    const lx = x - A.x, ly = y - A.y - TUBE_Y, lz0 = z - A.z;
    if (Math.abs(lx) < TUBE_X0 - 1 || Math.abs(lx) > TUBE_X1 + 0.5 || Math.abs(ly) > 1.7) return null;
    for (const tz of TUBE_Z) {
      const off = Math.hypot(ly, lz0 - tz);
      if (off < 1.55) return { dir: -Math.sign(lx), off, exitX: A.x - Math.sign(lx) * (TUBE_X0 - 1) };
    }
    return null;
  }

  /* ---- locker rooms: spawn, kiosk, activation pods ---- */
  const kiosks = [];
  const arenaExits = [];
  const lockerSpawns = {};
  for (const [s, team, col, colHex] of [[-1, "o", 0xff7320, "#ff7320"], [1, "b", 0x22a4ff, "#22a4ff"]]) {
    const lkMat = new THREE.MeshBasicMaterial({ color: 0x222b3c, side: THREE.DoubleSide });
    for (const [w2, h2, px4, py4, pz4, rx4, ry4] of [
      [LOCKER.hx * 2, LOCKER.hz * 2, A.x + s * LOCKER.cx, A.y - LOCKER.hy, A.z, -Math.PI / 2, 0],
      [LOCKER.hx * 2, LOCKER.hz * 2, A.x + s * LOCKER.cx, A.y + LOCKER.hy, A.z, Math.PI / 2, 0],
      [LOCKER.hx * 2, LOCKER.hy * 2, A.x + s * LOCKER.cx, A.y, A.z - LOCKER.hz, 0, 0],
      [LOCKER.hx * 2, LOCKER.hy * 2, A.x + s * LOCKER.cx, A.y, A.z + LOCKER.hz, 0, Math.PI],
      [LOCKER.hz * 2, LOCKER.hy * 2, A.x + s * (LOCKER.cx + LOCKER.hx), A.y, A.z, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2],
    ]) {
      const lw = new THREE.Mesh(new THREE.PlaneGeometry(w2, h2), lkMat);
      lw.position.set(px4, py4, pz4);
      lw.rotation.x = rx4; lw.rotation.y = ry4;
      addA(lw);
    }
    // tube-side wall: three round holes — look straight down the
    // tunnels, through the goal pocket, into the hall
    const lkShape = new THREE.Shape();
    lkShape.moveTo(-LOCKER.hz, -LOCKER.hy); lkShape.lineTo(LOCKER.hz, -LOCKER.hy);
    lkShape.lineTo(LOCKER.hz, LOCKER.hy); lkShape.lineTo(-LOCKER.hz, LOCKER.hy);
    lkShape.closePath();
    for (const tz of TUBE_Z) {
      const lh = new THREE.Path();
      lh.absarc(tz, TUBE_Y, TUBE_R + 0.05, 0, Math.PI * 2, true);
      lkShape.holes.push(lh);
    }
    const lkWall = new THREE.Mesh(new THREE.ShapeGeometry(lkShape, 24), lkMat);
    lkWall.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    lkWall.position.set(A.x + s * (LOCKER.cx - LOCKER.hx), A.y, A.z);
    addA(lkWall);
    // team glow strip around the room
    for (const gy3 of [-1.8, 1.8]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(LOCKER.hx * 2 - 0.3, 0.08, 0.08),
        new THREE.MeshBasicMaterial({ color: col }));
      strip.position.set(A.x + s * LOCKER.cx, A.y + gy3, A.z + LOCKER.hz - 0.1);
      addA(strip);
      const strip2 = strip.clone(); strip2.position.z = A.z - LOCKER.hz + 0.1; addA(strip2);
    }
    const lamp = new THREE.PointLight(col, 90, 14, 2);
    lamp.color.lerp(new THREE.Color(0xffffff), 0.45);   // team-tinted, not team-soaked
    lamp.position.set(A.x + s * LOCKER.cx, A.y + 2.5, A.z);
    addA(lamp);
    // activation pods: five lit rings on the rear wall
    for (let pi = 0; pi < 5; pi++) {
      const pod = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 8, 20),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7 }));
      pod.rotation.y = Math.PI / 2;
      pod.position.set(A.x + s * (LOCKER.cx + LOCKER.hx - 0.15), A.y + 0.6, A.z - 4 + pi * 2);
      addA(pod);
    }
    // the ready-up kiosk
    const kioskTex = canvasTex(256, 320, (g) => {
      g.fillStyle = "#0a1018"; g.fillRect(0, 0, 256, 320);
      g.strokeStyle = colHex; g.lineWidth = 8;
      g.strokeRect(10, 10, 236, 300);
      g.font = "900 44px monospace"; g.textAlign = "center";
      g.fillStyle = colHex;
      g.fillText("READY", 128, 130);
      g.fillText("UP", 128, 185);
      g.font = "16px monospace"; g.fillStyle = "#cfd8e4";
      g.fillText("tap to start the match", 128, 250);
    });
    const kiosk = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.9),
      new THREE.MeshBasicMaterial({ map: kioskTex }));
    kiosk.position.set(A.x + s * (LOCKER.cx - 1), A.y, A.z + LOCKER.hz - 0.08);
    kiosk.rotation.y = Math.PI;
    kiosk.userData.kiosk = team;
    addA(kiosk);
    kiosks.push(kiosk);
    // airlock home, one per locker
    const lkExit = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.9), new THREE.MeshBasicMaterial({
      map: canvasTex(128, 192, (g) => {
        g.fillStyle = "#0a1018"; g.fillRect(0, 0, 128, 192);
        g.strokeStyle = "#54e08a"; g.lineWidth = 6;
        g.strokeRect(8, 8, 112, 176);
        g.font = "900 22px monospace"; g.textAlign = "center";
        g.fillStyle = "#54e08a";
        g.fillText("AIRLOCK", 64, 90);
        g.font = "13px monospace";
        g.fillText("» ARCADE", 64, 116);
      }),
    }));
    lkExit.position.set(A.x + s * (LOCKER.cx - 1), A.y, A.z - LOCKER.hz + 0.08);
    lkExit.userData.arenaExit = true;
    addA(lkExit);
    arenaExits.push(lkExit);
    lockerSpawns[team] = { x: A.x + s * LOCKER.cx, y: A.y, z: A.z, yaw: s < 0 ? -Math.PI / 2 : Math.PI / 2 };
  }
  const arenaSpawnFor = (team) => lockerSpawns[team] || lockerSpawns.o;

  /* ---- light + air ---- */
  for (const fx3 of [-24, -12, 0, 12, 24]) {
    const af = new THREE.PointLight(0xc8d4e8, 220, 44, 2);
    af.position.set(A.x + fx3, A.y + A.hy - 1.8, A.z);
    addA(af);
    const tube = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 0.28),
      new THREE.MeshBasicMaterial({ color: 0xe8f0ff }));
    tube.position.set(A.x + fx3, A.y + A.hy - 0.4, A.z);
    addA(tube);
  }
  const ADUST = 700;
  const aDustPos = new Float32Array(ADUST * 3);
  for (let i = 0; i < ADUST; i++) {
    aDustPos[i * 3] = A.x + rand(-A.hx, A.hx);
    aDustPos[i * 3 + 1] = A.y + rand(-A.hy, A.hy);
    aDustPos[i * 3 + 2] = A.z + rand(-A.hz, A.hz);
  }
  const aDustGeo = new THREE.BufferGeometry();
  aDustGeo.setAttribute("position", new THREE.BufferAttribute(aDustPos, 3));
  addA(new THREE.Points(aDustGeo, new THREE.PointsMaterial({
    color: 0x9ab8d8, size: 0.03, transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })));

  // scoreboards over MID, one facing each wing
  const aScoreCanvas = document.createElement("canvas");
  aScoreCanvas.width = 512; aScoreCanvas.height = 128;
  const aScoreTex = new THREE.CanvasTexture(aScoreCanvas);
  aScoreTex.colorSpace = THREE.SRGBColorSpace;
  function setArenaScore(o, b2) {
    const g = aScoreCanvas.getContext("2d");
    g.fillStyle = "#060810";
    g.fillRect(0, 0, 512, 128);
    g.font = "900 84px monospace";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "#ff7320";
    g.fillText(String(o), 140, 70);
    g.fillStyle = "#9aa3ad";
    g.fillText("–", 256, 64);
    g.fillStyle = "#22a4ff";
    g.fillText(String(b2), 372, 70);
    aScoreTex.needsUpdate = true;
  }
  setArenaScore(0, 0);
  for (const sz of [-1, 1]) {
    const aBoard = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5),
      new THREE.MeshBasicMaterial({ map: aScoreTex }));
    aBoard.position.set(A.x, A.y + A.hy - 2.2, A.z + sz * (A.hz - 0.12));
    aBoard.rotation.y = sz > 0 ? Math.PI : 0;
    addA(aBoard);
  }

  // THE DISC — glowing, gradient ring, the whole point
  const discGroup = new THREE.Group();
  const discBody = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 24), bevelMat);
  const discRing = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.045, 10, 30),
    new THREE.MeshBasicMaterial({ color: 0xffb030 }));
  discRing.rotation.x = Math.PI / 2;
  const discCore = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff2cc }));
  const discGlow = new THREE.PointLight(0xffb030, 6, 5, 2);
  discGroup.add(discBody, discRing, discCore, discGlow);
  discGroup.position.set(A.x, A.y, A.z);
  addA(discGroup);
  const discHit = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 8),
    new THREE.MeshBasicMaterial({ visible: false }));
  discHit.userData.disc = true;
  addA(discHit);

  // main-hall airlock too, on the +z wall at mid height
  const exitPanel = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.2), new THREE.MeshBasicMaterial({
    map: canvasTex(128, 192, (g) => {
      g.fillStyle = "#0a1018"; g.fillRect(0, 0, 128, 192);
      g.strokeStyle = "#54e08a"; g.lineWidth = 6;
      g.strokeRect(8, 8, 112, 176);
      g.font = "900 22px monospace"; g.textAlign = "center";
      g.fillStyle = "#54e08a";
      g.fillText("AIRLOCK", 64, 90);
      g.font = "13px monospace";
      g.fillText("» ARCADE", 64, 116);
    }),
  }));
  exitPanel.position.set(A.x + 9.5, A.y - 4, A.z + A.hz - 0.06);
  exitPanel.rotation.y = Math.PI;
  exitPanel.userData.arenaExit = true;
  addA(exitPanel);
  arenaExits.push(exitPanel);
  arenaGroup.traverse((o) => { o.layers.set(2); });

  /* --- dust --- */
  const DUST = 240;
  const dustPos = new Float32Array(DUST * 3);
  const dustVel = [];
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = rand(-X, X);
    dustPos[i * 3 + 1] = rand(0.1, H);
    dustPos[i * 3 + 2] = rand(ZF, ZB);
    dustVel.push({ x: rand(-0.012, 0.012), y: rand(0.004, 0.02), z: rand(-0.012, 0.012) });
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  add(new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0x9a948c, size: 0.012, transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })));

  /* --- groups for dynamic content --- */
  const noteGroup = new THREE.Group();  add(noteGroup);
  const ghostGroup = new THREE.Group(); add(ghostGroup);

  /* --- per-frame life --- */
  let elapsed = 0;
  let dawAt = 0, meterAt = 0, clockAt = 0, skyAt = 0, skyDrawAt = 0;
  let nextCityAt = 40 + rand(0, 60);
  let onCity = null;
  let planeT = -1, nextPlaneAt = 30 + rand(0, 90);
  let livePlanes = false;   // true = real LAX data drives the flyovers
  const PLANE_DUR = 15;
  // the kaiju: rare, unhurried, never on a schedule you can predict
  let zillaT = -1, nextZillaAt = 480 + rand(0, 900), zillaStep = 0, zillaRoared = false;
  const ZWALK = 14, ZPAUSE = 9;   // seconds: walk in, stop and breathe, walk out
  const startZilla = () => { zillaT = 0; zillaStep = 0; zillaRoared = false; };
  // the signal: rarer still, and only when LA is properly dark
  let batT = -1, nextBatAt = 600 + rand(0, 1200);
  const BAT_DUR = 20;

  /* --- the carpet remembers ---
     a transparent grime layer over the bedroom floor that darkens where
     feet keep landing (you + the cat), plus a stick vacuum you grab to
     sweep it clean. the baked stains in floorTexture() are the carpet's
     permanent past; this layer is the dirt that piles up while you hang
     out, and lifts where the nozzle passes. MeshBasic so the toon pass
     leaves its alpha alone. --- */
  const GRW = 160, GRH = 200;            // grime canvas, room aspect ~0.79
  const grimeCanvas = document.createElement("canvas");
  grimeCanvas.width = GRW; grimeCanvas.height = GRH;
  const grimeCtx = grimeCanvas.getContext("2d");
  const grimeTex = new THREE.CanvasTexture(grimeCanvas);
  grimeTex.colorSpace = THREE.SRGBColorSpace;
  const grimeMesh = add(plane(W, D, new THREE.MeshBasicMaterial({
    map: grimeTex, transparent: true, depthWrite: false,
  })));
  grimeMesh.rotation.x = -Math.PI / 2;
  grimeMesh.position.y = 0.006;          // a hair over the carpet, under furniture
  grimeMesh.renderOrder = 1;
  // room (x,z) → grime pixel, the same mapping floorTexture() uses
  const grimePX = (x) => ((x + X) / (2 * X)) * GRW;
  const grimePZ = (z) => ((z - ZF) / (ZB - ZF)) * GRH;
  let grimeDirty = false, grimeUpAt = 0;
  let grimeSaveDirty = false;            // changed since we last persisted it?

  // a step grinds a little dirt in where it lands; standing still
  // concentrates it (your chair spot, the cat's perches)
  function floorTraffic(x, z, dt, mult = 1) {
    const cx = grimePX(x), cy = grimePZ(z);
    if (cx < -12 || cx > GRW + 12 || cy < -12 || cy > GRH + 12) return;
    const r = 9 * mult;
    const a = Math.min(0.09, dt * 0.15 * mult);   // a middle pace — dirties, not instantly
    const grd = grimeCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grd.addColorStop(0, `rgba(24,19,11,${a})`);
    grd.addColorStop(1, "rgba(24,19,11,0)");
    grimeCtx.fillStyle = grd;
    grimeCtx.beginPath();
    grimeCtx.arc(cx, cy, r, 0, 7);
    grimeCtx.fill();
    grimeDirty = true; grimeSaveDirty = true;
  }

  // the vacuum lifts the alpha back out in a soft radius
  function cleanFloor(x, z, rMeters) {
    const cx = grimePX(x), cy = grimePZ(z);
    const r = (rMeters / (2 * X)) * GRW;
    const grd = grimeCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grd.addColorStop(0, "rgba(0,0,0,1)");
    grd.addColorStop(0.55, "rgba(0,0,0,1)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    grimeCtx.globalCompositeOperation = "destination-out";
    grimeCtx.fillStyle = grd;
    grimeCtx.beginPath();
    grimeCtx.arc(cx, cy, r, 0, 7);
    grimeCtx.fill();
    grimeCtx.globalCompositeOperation = "source-over";
    grimeDirty = true; grimeSaveDirty = true;
  }

  /* --- the carpet REMEMBERS for everyone --- the grime is session-local
     until we snapshot it: downsample the 160x200 alpha canvas to a 32x40 grid
     and quantize each cell's mean alpha to one hex digit (0..15). that's a
     ~1.3KB string — small enough to ride the room_state flags jsonb + realtime,
     so accumulated dirt AND the lanes you vacuumed clean survive reload and sync
     across visitors (vacuuming is a shared chore). soft dirt doesn't need fine
     resolution; the texture's linear filter smooths the grid back out over the
     5.2m floor. --- */
  const GGW = 32, GGH = 40;              // snapshot grid
  const GBX = GRW / GGW, GBZ = GRH / GGH;   // 5x5 source px per cell
  function grimeSnapshot() {
    grimeSaveDirty = false;
    const img = grimeCtx.getImageData(0, 0, GRW, GRH).data;
    let out = "";
    for (let gy = 0; gy < GGH; gy++) {
      for (let gx = 0; gx < GGW; gx++) {
        let sum = 0;
        for (let py = 0; py < GBZ; py++)
          for (let px = 0; px < GBX; px++)
            sum += img[((gy * GBZ + py) * GRW + (gx * GBX + px)) * 4 + 3];  // alpha byte
        const a = sum / (GBX * GBZ) / 255;        // 0..1 mean alpha for the cell
        out += Math.min(15, Math.round(a * 15)).toString(16);
      }
    }
    return out;
  }
  function grimeRestore(str) {
    if (typeof str !== "string" || str.length !== GGW * GGH) return;
    grimeCtx.clearRect(0, 0, GRW, GRH);
    for (let gy = 0; gy < GGH; gy++) {
      for (let gx = 0; gx < GGW; gx++) {
        const q = parseInt(str[gy * GGW + gx], 16);
        if (!q) continue;
        grimeCtx.fillStyle = `rgba(24,19,11,${(q / 15).toFixed(3)})`;
        grimeCtx.fillRect(gx * GBX, gy * GBZ, GBX, GBZ);
      }
    }
    grimeTex.needsUpdate = true;
    grimeSaveDirty = false;   // we just adopted the shared truth — nothing new to push back
  }

  /* --- the vacuum: an upright stick that lives in the back corner.
     click it to pick it up; while held, the nozzle rides the floor just
     ahead of you and the carpet cleans where it passes. click again (or
     pause) to stand it back in its corner. --- */
  const VAC_DOCK = { x: 2.16, z: 2.84, ry: -0.5 };
  const vacuum = new THREE.Group();
  vacuum.rotation.order = "YXZ";          // yaw first, then a clean forward lean
  const vacRed = lam(0xb23a44), vacDark = lam(0x2a2d33), vacSilver = lam(0x9aa0a8);
  const vNozzle = caster(box(0.34, 0.05, 0.17, vacDark)); vNozzle.position.y = 0.03;
  const vBody = caster(box(0.16, 0.27, 0.13, vacRed)); vBody.position.y = 0.21;
  const vCan = box(0.105, 0.13, 0.09, new THREE.MeshLambertMaterial({
    color: 0x7a8a3e, transparent: true, opacity: 0.66 }));
  vCan.position.set(0, 0.41, 0.025);
  const vPole = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.92, 10), vacSilver);
  vPole.position.y = 0.7;
  const vGrip = box(0.045, 0.17, 0.045, vacDark); vGrip.position.set(0, 1.12, 0.015);
  const vGripTop = box(0.045, 0.045, 0.15, vacDark); vGripTop.position.set(0, 1.19, 0.06);
  for (const m of [vNozzle, vBody, vCan, vPole, vGrip, vGripTop]) {
    m.userData.vacuum = true;            // any part of it is grabbable
    vacuum.add(m);
  }
  add(vacuum);
  let vacHeld = false;
  function dockVacuum() {
    vacuum.position.set(VAC_DOCK.x, 0, VAC_DOCK.z);
    vacuum.rotation.set(0.13, VAC_DOCK.ry, -0.17);   // leaning into the corner
  }
  function grabVacuum(on) {
    vacHeld = !!on;
    if (!on) dockVacuum();
  }
  // every frame while held: the head lands on the floor out ahead, and the
  // pole leans BACK toward you so the handle sits in your hands — that's
  // what makes it read as held-and-pushed, not planted facing you. rotates
  // with your heading. it sweeps the carpet where the head sits.
  function vacuumStep(px, pz, yaw) {
    if (!vacHeld) return;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);  // player forward
    const nx = px + fx * 0.72, nz = pz + fz * 0.72;   // head out ahead of you
    vacuum.position.set(nx, 0, nz);
    vacuum.rotation.set(0.6, yaw, 0);   // YXZ: face your way, then lean back to you
    cleanFloor(nx, nz, 0.42);
  }
  dockVacuum();

  function tick(dt, ppos) {
    elapsed += dt;
    if (grimeDirty && elapsed - grimeUpAt > 0.1) {
      grimeUpAt = elapsed; grimeDirty = false; grimeTex.needsUpdate = true;
    }
    tickEdrums(dt);
    tickTele(dt);
    tickChair(dt, ppos);
    tickPuffs(dt, ppos);
    tickClub(dt);

    if (elapsed - dawAt > 0.09) { dawAt = elapsed; daw.draw(); }
    if (elapsed - meterAt > 0.15) { meterAt = elapsed; meterScr.draw(); }
    if (elapsed - clockAt > 1) { clockAt = elapsed; clockScr.draw(); }
    if (elapsed - skyAt > 60) { skyAt = elapsed; updateSky(); }

    // beacon blink + jets on the LAX approach
    if (planeT >= 0) {
      if (planeShot) {
        // the long fall — done when it drops below the skyline
        planeShot.age += dt;
        const fallT = Math.max(0, planeShot.age - 0.25);
        if (planeShot.y + 170 * fallT * fallT > 300 || planeShot.age > 6) {
          planeT = -1; plane01 = null; planeShot = null;
        }
      } else {
        planeT += dt;
        plane01 = planeT / PLANE_DUR;
        if (plane01 >= 1) { planeT = -1; plane01 = null; }
      }
    } else if (!livePlanes) {      // ambient fallback when no real data
      nextPlaneAt -= dt;
      if (nextPlaneAt <= 0) {
        nextPlaneAt = rand(180, 480);
        planeT = 0;
        planeDir = Math.random() < 0.5 ? 1 : -1;
        if (onCity) { try { onCity("plane"); } catch (e) {} }
      }
    }

    // the kaiju, once in a long while: in from the east, a pause to
    // remind downtown who's bigger, out to the west
    if (zillaT >= 0) {
      zillaT += dt;
      const t = zillaT;
      if (t >= ZWALK * 2 + ZPAUSE) { zillaT = -1; zilla = null; }
      else {
        const walking = t < ZWALK || t >= ZWALK + ZPAUSE;
        if (walking) zillaStep += dt * 4.6;
        if (t >= ZWALK && !zillaRoared) {
          zillaRoared = true;
          if (onCity) { try { onCity("zilla"); } catch (e) {} }
        }
        const p = t - ZWALK;       // seconds into the pause
        const env = (a, b, atk, rel) => (p < a || p > b) ? 0 : Math.min(1, (p - a) / atk, (b - p) / rel);
        zilla = {
          x: t < ZWALK ? -130 + (480 / ZWALK) * t
            : t < ZWALK + ZPAUSE ? 350
            : 350 + (530 / ZWALK) * (t - ZWALK - ZPAUSE),
          step: zillaStep,
          roar: env(1.2, ZPAUSE - 0.4, 0.9, 0.9),
          charge: env(1.0, ZPAUSE - 1.0, 1.5, 1.0),
          flame: env(2.6, ZPAUSE - 0.8, 0.5, 0.9),
          flick: 0.5 + 0.5 * Math.sin(elapsed * 31) * Math.sin(elapsed * 17),
        };
      }
    } else {
      nextZillaAt -= dt;
      if (nextZillaAt <= 0) { nextZillaAt = 480 + rand(0, 900); startZilla(); }
    }

    // the bat signal — downtown's call for help, not ours to answer
    if (batT >= 0) {
      batT += dt;
      if (batT > BAT_DUR) { batT = -1; bat = null; }
      else bat = { t: batT };
    } else {
      nextBatAt -= dt;
      if (nextBatAt <= 0) {
        nextBatAt = 600 + rand(0, 1200);
        // only fire once the sun is well down; otherwise wait for a darker hour
        if ((skyCache?.sun.altitude ?? 0) < -0.14) batT = 0;
      }
    }

    if (elapsed - skyDrawAt > (planeT >= 0 || zillaT >= 0 || batT >= 0 ? 0.12 : 0.55)) {
      skyDrawAt = elapsed;
      redrawSky(Math.floor(elapsed * 1.2) % 2 === 0);
    }

    screenGlow.intensity = 2.6 + Math.sin(elapsed * 2.3) * 0.45 + Math.sin(elapsed * 7.1) * 0.25;
    tickLava(elapsed);
    tickBlinds(dt);
    for (const m of accessorySpin) m.rotation.y = elapsed * 0.6;

    if (Math.random() < 0.004) neonLight.intensity = 0.3;
    else neonLight.intensity = 1.3 * (0.88 + 0.12 * Math.sin(elapsed * 1.9));

    const p = dustGeo.attributes.position.array;
    for (let i = 0; i < DUST; i++) {
      const v = dustVel[i];
      p[i * 3] += v.x * dt; p[i * 3 + 1] += v.y * dt; p[i * 3 + 2] += v.z * dt;
      if (p[i * 3 + 1] > H) p[i * 3 + 1] = 0.05;
      if (p[i * 3] > X) p[i * 3] = -X; else if (p[i * 3] < -X) p[i * 3] = X;
      if (p[i * 3 + 2] > ZB) p[i * 3 + 2] = ZF; else if (p[i * 3 + 2] < ZF) p[i * 3 + 2] = ZB;
    }
    dustGeo.attributes.position.needsUpdate = true;
    const bp = bDustGeo.attributes.position.array;
    for (let i = 0; i < BDUST; i++) {
      const v = bDustVel[i];
      bp[i * 3] += v.x * dt; bp[i * 3 + 1] += v.y * dt; bp[i * 3 + 2] += v.z * dt;
      if (bp[i * 3 + 1] > BH - 0.05) bp[i * 3 + 1] = 0.08;
      if (bp[i * 3] > BOAT.x + 2.1) bp[i * 3] = BOAT.x - 2.1;
      else if (bp[i * 3] < BOAT.x - 2.1) bp[i * 3] = BOAT.x + 2.1;
      if (bp[i * 3 + 2] > BOAT.z + 1.5) bp[i * 3 + 2] = BOAT.z - 1.5;
      else if (bp[i * 3 + 2] < BOAT.z - 1.5) bp[i * 3 + 2] = BOAT.z + 1.5;
    }
    bDustGeo.attributes.position.needsUpdate = true;

    // rain runs down the glass
    if (rainPane.visible) {
      rainTex.offset.y -= dt * (wx.rain === 2 ? 0.5 : 0.25);
    }

    // curtains sliding
    const want = curtains.closed ? 1 : 0;
    if (Math.abs(curtains.anim - want) > 0.001) {
      curtains.anim += Math.sign(want - curtains.anim) * Math.min(dt * 1.1, Math.abs(want - curtains.anim));
      applyCurtainAnim();
      applyLights();
    }

    // closet doors swinging (open = away from the room, into the closet)
    const cWant = closet.open ? 1 : 0;
    if (Math.abs(closet.anim - cWant) > 0.001) {
      closet.anim += Math.sign(cWant - closet.anim) * Math.min(dt * 1.6, Math.abs(cWant - closet.anim));
      hinge.rotation.y = closet.anim * 1.5;
      hinge2.rotation.y = -closet.anim * 1.5;
    }

    // attract modes flicker away in the arcade
    if (elapsed - (tick._arcAt || 0) > 0.13) {
      tick._arcAt = elapsed;
      for (const at of attracts) at.draw();
    }

    // the sea outside the windows never stops — bands slide and bob at
    // their own rates, the lantern swings, its light breathes
    for (let i = 0; i < waveBands.length; i++) {
      const b = waveBands[i];
      waveTexes[i].tx.offset.x += waveTexes[i].speed * dt;
      b.mesh.position.y = b.y + Math.sin(elapsed * b.bobF + i * 1.7) * b.bobA;
    }
    if (elapsed - (tick._swSkyAt ?? -999) > 60) {
      tick._swSkyAt = elapsed;
      updateBoatSky();
    }
    if (elapsed - (tick._swClockAt || 0) > 1) {
      tick._swClockAt = elapsed;
      drawSwClock();
    }
    // shore life: smoke drifts, the lighthouse blinks, aurora shimmers
    smokePuffs.forEach((p, i) => {
      if (!p.visible) return;
      const ph = (elapsed * 0.25 + i * 0.33) % 1;
      p.position.y = 1.0 + ph * 0.6;
      p.material.opacity = 0.45 * (1 - ph);
      p.position.x = 0.2 + Math.sin(elapsed * 0.6 + i) * 0.05 + ph * 0.15;
    });
    lhLamp.material.color.set(
      lhLamp.userData.night && Math.floor(elapsed * 0.5) % 2 === 0 ? 0xff5555 : 0x441414);
    if (aurora.material.opacity > 0) {
      aurora.position.x = BOAT.x + Math.sin(elapsed * 0.05) * 2.5;
      aurora.material.opacity = 0.4 + Math.sin(elapsed * 0.3) * 0.15;
    }
    lantern.rotation.z = Math.sin(elapsed * 0.7) * 0.09;
    lantern.rotation.x = Math.sin(elapsed * 0.53 + 1) * 0.05;
    lantern.children[2].intensity = 4.5 * (0.9 + 0.1 * Math.sin(elapsed * 5.3) * Math.sin(elapsed * 1.3));

    nextCityAt -= dt;
    if (nextCityAt <= 0) {
      nextCityAt = rand(70, 180);
      if (onCity) { try { onCity(Math.random() < 0.5 ? "siren" : "car"); } catch (e) {} }
    }
  }


  /* --- THE CLUB: the dj bar, far past everything ---
     (working name THE VENUE — the real name and the password land
     closer to the event.) windowless on purpose: a dark box where
     everything that matters glows on its own. every point light in
     here throws shorter than the void to the next room. --- */
  const CLUB = { x: -40, z: 0 };
  const CLW = 12, CLD = 9, CLH = 5.6;   // a loft: soaring ceiling, glass all around
  const RIGY = 3.25;                     // the light rig + disco hang here, well below the roof
  const SILL = 0.55;                     // knee-wall height under the glass
  const SOLIDH = 2.4;                    // solid backing behind the booth + bar; glass clerestory above
  const clubGroup = new THREE.Group();
  scene.add(clubGroup);
  const addC = (m) => { clubGroup.add(m); return m; };

  // shell — dark concrete floor, darker everything else
  const clubFloorTex = canvasTex(256, 256, (g) => {
    g.fillStyle = "#17151c"; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(255,255,255,${(Math.random() * 0.05).toFixed(3)})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
    }
  });
  const clubWallMat = new THREE.MeshLambertMaterial({ color: 0x1a1722, side: THREE.DoubleSide });
  const clubFloor = addC(new THREE.Mesh(new THREE.PlaneGeometry(CLW, CLD),
    new THREE.MeshLambertMaterial({ map: clubFloorTex })));
  clubFloor.rotation.x = -Math.PI / 2;
  clubFloor.position.set(CLUB.x, 0.001, CLUB.z);
  const clubCeil = addC(new THREE.Mesh(new THREE.PlaneGeometry(CLW, CLD),
    new THREE.MeshLambertMaterial({ color: 0x0d0b12, side: THREE.DoubleSide })));
  clubCeil.rotation.x = Math.PI / 2;
  clubCeil.position.set(CLUB.x, CLH, CLUB.z);
  /* --- the loft shell: a knee-wall ring under the glass, solid backing only
     behind the booth (north) and the bar (east), and everything above open to
     the city outside. corner columns + mullions read the openings as giant
     industrial windows; the wraparound backdrop (built lower down) fills them. --- */
  const wallSpec = [
    { len: CLW, ry: 0,            px: CLUB.x,            pz: CLUB.z - CLD / 2, solid: true,  ax: "x" },  // north: booth
    { len: CLW, ry: Math.PI,      px: CLUB.x,            pz: CLUB.z + CLD / 2, solid: false, ax: "x" },  // south: door
    { len: CLD, ry: Math.PI / 2,  px: CLUB.x - CLW / 2,  pz: CLUB.z,           solid: false, ax: "z" },  // west
    { len: CLD, ry: -Math.PI / 2, px: CLUB.x + CLW / 2,  pz: CLUB.z,           solid: true,  ax: "z" },  // east: bar
  ];
  for (const s of wallSpec) {
    // a knee-wall under every window hides the city's ground seam
    const knee = addC(new THREE.Mesh(new THREE.PlaneGeometry(s.len, SILL), clubWallMat));
    knee.rotation.y = s.ry; knee.position.set(s.px, SILL / 2, s.pz);
    // solid backing behind the booth + bar so the gear isn't floating in the city
    if (s.solid) {
      const back = addC(new THREE.Mesh(new THREE.PlaneGeometry(s.len, SOLIDH - SILL), clubWallMat));
      back.rotation.y = s.ry; back.position.set(s.px, (SOLIDH + SILL) / 2, s.pz);
    }
  }

  // corner columns — the loft's dark steel; the V3 neon tubes light their edges
  const colMat = lam(0x0a0910);
  for (const [cx, cz] of [
    [CLUB.x - CLW / 2, CLUB.z - CLD / 2], [CLUB.x + CLW / 2, CLUB.z - CLD / 2],
    [CLUB.x - CLW / 2, CLUB.z + CLD / 2], [CLUB.x + CLW / 2, CLUB.z + CLD / 2],
  ]) {
    const col = addC(box(0.22, CLH, 0.22, colMat));
    col.position.set(cx, CLH / 2, cz);
  }

  // mullions: a grid of dark bars across each opening so the glass reads as
  // big windows. thin boxes sitting on the wall line.
  const mulMat = lam(0x07060c);
  for (const s of wallSpec) {
    const y0 = s.solid ? SOLIDH : SILL, gh = CLH - y0;
    const ty = y0 + gh * 0.55;                 // a transom across the glass
    const n = Math.max(2, Math.round(s.len / 2.0));
    if (s.ax === "x") {
      addC(box(s.len, 0.06, 0.05, mulMat)).position.set(s.px, ty, s.pz);
      for (let i = 1; i < n; i++) {
        const x = s.px - s.len / 2 + (s.len * i / n);
        addC(box(0.06, gh, 0.05, mulMat)).position.set(x, y0 + gh / 2, s.pz);
      }
    } else {
      addC(box(0.05, 0.06, s.len, mulMat)).position.set(s.px, ty, s.pz);
      for (let i = 1; i < n; i++) {
        const z = s.pz - s.len / 2 + (s.len * i / n);
        addC(box(0.05, gh, 0.06, mulMat)).position.set(s.px, y0 + gh / 2, z);
      }
    }
  }

  // the dance floor: a 6x4 grid of lit tiles running a slow idle
  // cycle until a dj gives them a reason to move
  const clubTiles = [];
  const TILE = 0.85, TGX = 6, TGZ = 4;
  for (let i = 0; i < TGX; i++) {
    for (let j = 0; j < TGZ; j++) {
      const t = addC(new THREE.Mesh(
        new THREE.BoxGeometry(TILE - 0.07, 0.02, TILE - 0.07),
        new THREE.MeshBasicMaterial({ color: 0x221a33 })));
      t.position.set(
        CLUB.x + (i - (TGX - 1) / 2) * TILE,
        0.012,
        CLUB.z + 0.4 + (j - (TGZ - 1) / 2) * TILE);
      clubTiles.push(t);
    }
  }

  // the booth: floor-level so a dj can actually stand behind it.
  // desk front to the floor like a real club coffin.
  const BOOTHZ = CLUB.z - CLD / 2;                 // north wall
  const deskTop = addC(box(2.8, 0.05, 0.6, lam(0x14121a)));
  deskTop.position.set(CLUB.x, 0.95, BOOTHZ + 1.25);
  const deskFront = addC(box(2.8, 0.95, 0.05, lam(0x191622)));
  deskFront.position.set(CLUB.x, 0.475, BOOTHZ + 1.575);
  for (const px of [-1.4, 1.4]) {
    const side = addC(box(0.05, 0.95, 0.6, lam(0x191622)));
    side.position.set(CLUB.x + px, 0.475, BOOTHZ + 1.25);
  }
  // a thin lit lip across the coffin front
  const deskLip = addC(box(2.8, 0.025, 0.02, new THREE.MeshBasicMaterial({ color: 0x8a5cff })));
  deskLip.position.set(CLUB.x, 0.96, BOOTHZ + 1.59);

  // two players and a mixer — the reason the room exists
  const deckY = 0.975;
  const deckHits = [];
  for (const dx of [-0.62, 0.62]) {
    const body = addC(box(0.36, 0.045, 0.40, lam(0x262230)));
    body.position.set(CLUB.x + dx, deckY + 0.022, BOOTHZ + 1.25);
    body.userData.decks = true;
    deckHits.push(body);
    const jog = addC(new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.02, 22), lam(0x322d3e)));
    jog.position.set(CLUB.x + dx, deckY + 0.055, BOOTHZ + 1.29);
    jog.userData.decks = true;
    deckHits.push(jog);
    const scr = addC(new THREE.Mesh(new THREE.PlaneGeometry(0.20, 0.075),
      new THREE.MeshBasicMaterial({ color: 0x153340 })));
    scr.rotation.y = Math.PI;
    scr.rotation.x = 0.5;
    scr.position.set(CLUB.x + dx, deckY + 0.095, BOOTHZ + 1.08);
  }
  const clubMixer = addC(box(0.26, 0.05, 0.38, lam(0x1d1a26)));
  clubMixer.position.set(CLUB.x, deckY + 0.025, BOOTHZ + 1.25);
  clubMixer.userData.decks = true;
  deckHits.push(clubMixer);
  for (let k = -1; k <= 1; k++) {
    const fad = addC(box(0.015, 0.012, 0.05, new THREE.MeshBasicMaterial({ color: 0xd8d4e6 })));
    fad.position.set(CLUB.x + k * 0.055, deckY + 0.056, BOOTHZ + 1.38);
  }

  // ON AIR — dark until category C gives it a reason
  const onAirCanvas = document.createElement("canvas");
  onAirCanvas.width = 256; onAirCanvas.height = 96;
  const onAirTex = new THREE.CanvasTexture(onAirCanvas);
  onAirTex.colorSpace = THREE.SRGBColorSpace;
  function drawOnAir(live) {
    const g = onAirCanvas.getContext("2d");
    g.fillStyle = "#0b0a10"; g.fillRect(0, 0, 256, 96);
    g.strokeStyle = live ? "#ff4455" : "#552e36";
    g.lineWidth = 5; g.strokeRect(6, 6, 244, 84);
    g.font = "500 52px 'Six Caps', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = live ? "#ff5566" : "#5a3038";
    g.letterSpacing = "8px";
    g.fillText("ON AIR", 128, 52);
    onAirTex.needsUpdate = true;
  }
  drawOnAir(false);
  const onAirSign = addC(new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.34),
    new THREE.MeshBasicMaterial({ map: onAirTex })));
  onAirSign.position.set(CLUB.x, 2.45, BOOTHZ + 0.04);
  let onAirLive = false;
  const onAirLight = new THREE.PointLight(0xff3344, 0, 3.5, 2);
  onAirLight.position.set(CLUB.x, 2.3, BOOTHZ + 0.7);
  addC(onAirLight);
  const boothLamp = new THREE.PointLight(0xbfb8ff, 7, 3.6, 2);
  boothLamp.position.set(CLUB.x, 2.0, BOOTHZ + 0.9);
  addC(boothLamp);
  function setOnAir(on) {
    if (onAirLive === !!on) return;      // called on an interval — skip redundant redraws
    onAirLive = !!on;
    drawOnAir(onAirLive);
    onAirLight.intensity = onAirLive ? 4 : 0;
  }

  // a little headcount plate beside ON AIR — how many ears are in the room
  const headCanvas = document.createElement("canvas");
  headCanvas.width = 200; headCanvas.height = 80;
  const headTex = new THREE.CanvasTexture(headCanvas);
  headTex.colorSpace = THREE.SRGBColorSpace;
  let headShown = -1;
  function drawHead(n) {
    const g = headCanvas.getContext("2d");
    g.clearRect(0, 0, 200, 80);
    g.fillStyle = "#0b0a10"; g.fillRect(0, 0, 200, 80);
    g.font = "600 44px 'Six Caps', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "#8a5cff";
    g.fillText(`♪ ${n}`, 100, 42);
    headTex.needsUpdate = true;
  }
  drawHead(0);
  const headSign = addC(new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.17),
    new THREE.MeshBasicMaterial({ map: headTex, transparent: true })));
  headSign.position.set(CLUB.x + 0.78, 2.45, BOOTHZ + 0.04);
  function setBoothHeadcount(n) {
    n = Math.max(0, n | 0);
    if (n === headShown) return;
    headShown = n;
    drawHead(n);
  }

  // speaker stacks flanking the booth, toed in a touch
  for (const sx of [-1, 1]) {
    const stack = new THREE.Group();
    const lo = box(0.62, 0.78, 0.55, lam(0x1f1b28));
    lo.position.y = 0.39;
    const hi = box(0.55, 0.5, 0.48, lam(0x252031));
    hi.position.y = 1.03;
    stack.add(lo, hi);
    for (const [r, y, z] of [[0.20, 0.39, 0.282], [0.14, 1.0, 0.246], [0.05, 1.2, 0.246]]) {
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.45, 0.05, 18), lam(0x07060a));
      cone.rotation.x = Math.PI / 2;
      cone.position.set(0, y, z);
      stack.add(cone);
    }
    stack.position.set(CLUB.x + sx * 2.6, 0, BOOTHZ + 0.65);
    stack.rotation.y = -sx * 0.25;
    addC(stack);
  }

  // the bar along the east wall — somewhere to lean when your song
  // isn't on. bottles against the wall, warm strips so they glow.
  const BARX = CLUB.x + CLW / 2 - 0.85;
  const barBase = addC(box(0.55, 1.0, 3.6, lam(0x241d2c)));
  barBase.position.set(BARX, 0.5, CLUB.z + 0.4);
  const barTop = addC(box(0.72, 0.05, 3.8, lam(0x0f0d14)));
  barTop.position.set(BARX, 1.03, CLUB.z + 0.4);
  for (const sz of [-0.9, 0.1, 1.1]) {
    const seat = addC(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 14), lam(0x3a2430)));
    seat.position.set(BARX - 0.62, 0.62, CLUB.z + 0.4 + sz);
    const pole = addC(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), lam(0x4a4550)));
    pole.position.set(BARX - 0.62, 0.31, CLUB.z + 0.4 + sz);
    const foot = addC(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 12), lam(0x4a4550)));
    foot.position.set(BARX - 0.62, 0.012, CLUB.z + 0.4 + sz);
  }
  const bottleCols = [0x4a7a5a, 0x7a4a5a, 0x4a5a7a, 0xa8853c, 0x5a7a4a, 0x7a5a4a, 0x4a6a7a, 0x8a4a6a];
  let clubBi = 0;
  for (const sy of [1.45, 1.85]) {
    const shelf = addC(box(0.22, 0.03, 3.4, lam(0x191522)));
    shelf.position.set(CLUB.x + CLW / 2 - 0.13, sy, CLUB.z + 0.4);
    for (let k = 0; k < 7; k++) {
      const col = bottleCols[clubBi++ % bottleCols.length];
      const hgt = 0.20 + (clubBi % 3) * 0.03;
      const b = addC(new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.034, hgt, 8),
        new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.78 })));
      b.position.set(CLUB.x + CLW / 2 - 0.13, sy + 0.015 + hgt / 2, CLUB.z - 1.0 + k * 0.47);
    }
    const strip = addC(box(0.04, 0.02, 3.4, new THREE.MeshBasicMaterial({ color: 0xffc88a })));
    strip.position.set(CLUB.x + CLW / 2 - 0.1, sy - 0.05, CLUB.z + 0.4);
  }
  const barLight = new THREE.PointLight(0xffb070, 11, 5.5, 2);
  barLight.position.set(BARX - 0.7, 1.6, CLUB.z + 0.4);
  addC(barLight);

  // the mirror ball — non-indexed sphere so the facets survive the
  // toon swap (flatShading wouldn't)
  // the rig hangs at RIGY, low over the floor — a long drop-rod up to the roof
  const ballRod = addC(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, CLH - RIGY, 6), lam(0x222228)));
  ballRod.position.set(CLUB.x, (CLH + RIGY) / 2, CLUB.z + 0.4);
  const ballGeo = new THREE.SphereGeometry(0.32, 12, 9).toNonIndexed();
  ballGeo.computeVertexNormals();
  const discoBall = addC(new THREE.Mesh(ballGeo, lam(0x70768a)));
  discoBall.position.set(CLUB.x, RIGY - 0.49, CLUB.z + 0.4);
  // two colored lights orbiting the ball — the room's whole mood
  const swirl = new THREE.Group();
  swirl.position.set(CLUB.x, RIGY - 0.49, CLUB.z + 0.4);
  const swirlA = new THREE.PointLight(0xff3fae, 48, 9, 2);
  swirlA.position.set(1.7, -0.95, 0);
  swirl.add(swirlA);
  // phones get one mover, not two — the room runs 20+ point lights and the
  // toon shader loops every one per fragment, so this is the cheap cut
  const swirlB = IS_TOUCH ? null : new THREE.PointLight(0x3fd2ff, 48, 9, 2);
  if (swirlB) { swirlB.position.set(-1.7, -0.95, 0); swirl.add(swirlB); }
  addC(swirl);

  // light rig over the floor: a truss and four par cans, hung at rig height
  const truss = addC(box(5.4, 0.07, 0.07, lam(0x2a2733)));
  truss.position.set(CLUB.x, RIGY, CLUB.z + 0.4);
  [0xff3fae, 0x3fd2ff, 0xffe24a, 0x8a5cff].forEach((c, i) => {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.095, 0.16, 10), lam(0x1d1a26));
    can.position.set(CLUB.x - 2.0 + i * 1.33, RIGY - 0.13, CLUB.z + 0.4);
    can.rotation.x = 0.35 * (i % 2 ? 1 : -1);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.075, 10), new THREE.MeshBasicMaterial({ color: c }));
    face.rotation.x = Math.PI / 2;
    face.position.y = -0.085;
    can.add(face);
    addC(can);
  });

  // the name over the door — placeholder until the room earns its own
  const clubSign = addC(new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), new THREE.MeshBasicMaterial({
    map: canvasTex(512, 128, (g) => {
      g.fillStyle = "#0b0a10"; g.fillRect(0, 0, 512, 128);
      g.font = "500 86px 'Six Caps', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.shadowColor = "#ff3fae"; g.shadowBlur = 26;
      g.fillStyle = "#ffd2ec"; g.letterSpacing = "14px";
      g.fillText("THE VENUE", 256, 70);
    }),
    transparent: true,
  })));
  clubSign.rotation.y = Math.PI;
  clubSign.position.set(CLUB.x, 2.55, CLUB.z + CLD / 2 - 0.05);

  // the way home
  const clubDoor = addC(box(0.78, 1.85, 0.05, lam(0x241f2e)));
  clubDoor.rotation.y = Math.PI;
  clubDoor.position.set(CLUB.x + 3.4, 0.93, CLUB.z + CLD / 2 - 0.04);
  clubDoor.userData.clubExit = true;
  const clubExitSign = addC(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16), new THREE.MeshBasicMaterial({
    map: canvasTex(256, 80, (g) => {
      g.fillStyle = "#06140a"; g.fillRect(0, 0, 256, 80);
      g.font = "700 44px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = "#7dffa0";
      g.fillText("EXIT", 128, 44);
    }),
  })));
  clubExitSign.rotation.y = Math.PI;
  clubExitSign.position.set(CLUB.x + 3.4, 2.05, CLUB.z + CLD / 2 - 0.05);
  const clubExitLamp = new THREE.PointLight(0x88ff9a, 1.6, 2.5, 2);
  clubExitLamp.position.set(CLUB.x + 3.4, 2.1, CLUB.z + CLD / 2 - 0.3);
  addC(clubExitLamp);

  const clubWash = new THREE.PointLight(0x7a6aa8, 9, 12, 2);
  clubWash.position.set(CLUB.x, 2.9, CLUB.z + 0.6);
  addC(clubWash);

  /* --- V3 glow-up: the edges read as black, so we trim them in light.
     nothing below is a LIGHT (every lamp in this room throws short, by
     design, so it can't reach the bedroom) — it's all self-lit emissive
     geometry and additive washes. MeshBasic skips the toon swap and emits
     zero photons into the scene, so it pops on the dark walls and can't
     bleed a thing toward the next room. --- */
  const HALFW = CLW / 2, HALFD = CLD / 2;
  const coveXW = CLUB.x - HALFW + 0.06, coveXE = CLUB.x + HALFW - 0.06;
  const coveZN = CLUB.z - HALFD + 0.06, coveZS = CLUB.z + HALFD - 0.06;

  // a cove band of light just under the ceiling, all the way around — these
  // recolor with the active theme (white default; applyClubPalette tints them)
  const coveY = CLH - 0.16;
  const coveMeshes = [];
  const mkBand = (w, d, x, z) => {
    const b = addC(box(w, 0.05, d, new THREE.MeshBasicMaterial({ color: 0xffffff })));
    b.position.set(x, coveY, z); coveMeshes.push(b);
  };
  mkBand(CLW - 0.1, 0.04, CLUB.x, coveZN);   // booth wall (north)
  mkBand(CLW - 0.1, 0.04, CLUB.x, coveZS);   // door wall (south)
  mkBand(0.04, CLD - 0.1, coveXW, CLUB.z);   // west
  mkBand(0.04, CLD - 0.1, coveXE, CLUB.z);   // east

  // vertical neon up each corner column — full loft height, theme-tinted
  const tubeMeshes = [];
  const tubeH = CLH - 0.3;
  [[coveXW, coveZN], [coveXE, coveZN], [coveXW, coveZS], [coveXE, coveZS]]
    .forEach(([cx, cz]) => {
      const tube = addC(new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, tubeH, 10),
        new THREE.MeshBasicMaterial({ color: 0xffffff })));
      tube.position.set(cx, tubeH / 2 + 0.1, cz); tubeMeshes.push(tube);
    });

  // a VU strip across the coffin front — green→red segments the crowd reads
  // when a set is live. emissive (skips the toon swap), so it stays bright.
  const vuSegs = [];
  const VN = 9;
  for (let i = 0; i < VN; i++) {
    const seg = addC(box(0.24, 0.04, 0.02, new THREE.MeshBasicMaterial({ color: 0x16131e })));
    seg.position.set(CLUB.x + (i - (VN - 1) / 2) * 0.29, 0.58, BOOTHZ + 1.605);
    vuSegs.push(seg);
  }
  const vuOff = new THREE.Color(0x16131e);
  const vuOn = new THREE.Color();

  /* ============================================================
     THE LOFT'S VIEW — a wraparound backdrop + a swappable theme.
     a tall cylinder of self-lit canvas surrounds the whole club (the boat-
     seabox trick): MeshBasic so it emits no scene light and can't bleed a
     photon toward the bedroom, far enough out that no window angle catches
     its wrap seam (which sits behind the solid booth wall anyway). an admin
     re-skins the entire venue — backdrop + interior neon — by switching
     themes; it's local + instant, no reload, no db. --- */
  // the cylinder plunges far below the loft (a high-rise) so the ground is lost
  // to haze AND climbs high above it so the sky never hits a hard black cap.
  const BACK_R = 15, BACK_H = 52, BACK_CY = -4;
  const PW = 4096, PH = 1536;
  const SKY_Y = 8;                      // altitude the blimp / ufo cruise at
  const toCY = (y) => (BACK_CY + BACK_H / 2 - y) / BACK_H * PH;   // world-y → canvas row
  const dotTex = canvasTex(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.4, "rgba(255,255,255,0.5)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  });

  const panoCanvas = document.createElement("canvas");
  panoCanvas.width = PW; panoCanvas.height = PH;
  const panoTex = new THREE.CanvasTexture(panoCanvas);
  panoTex.colorSpace = THREE.SRGBColorSpace;
  panoTex.wrapS = THREE.RepeatWrapping;
  const backdrop = addC(new THREE.Mesh(
    new THREE.CylinderGeometry(BACK_R, BACK_R, BACK_H, 96, 1, true),
    new THREE.MeshBasicMaterial({ map: panoTex, side: THREE.BackSide, fog: false })));
  backdrop.position.set(CLUB.x, BACK_CY, CLUB.z);
  // caps so the steepest up/down angle never catches the void past the cylinder
  const capMat = new THREE.MeshBasicMaterial({ color: 0x04050c, side: THREE.DoubleSide });
  const capTop = addC(new THREE.Mesh(new THREE.CircleGeometry(BACK_R, 48), capMat));
  capTop.rotation.x = Math.PI / 2; capTop.position.set(CLUB.x, BACK_CY + BACK_H / 2, CLUB.z);
  const capBot = addC(new THREE.Mesh(new THREE.CircleGeometry(BACK_R, 48), capMat));
  capBot.rotation.x = -Math.PI / 2; capBot.position.set(CLUB.x, BACK_CY - BACK_H / 2, CLUB.z);

  // drifting motes OUTSIDE the glass (fireflies / plankton / stars) — recolored
  // per theme; cheap life across the whole surround
  const MOTE_N = 240;
  const motePos = new Float32Array(MOTE_N * 3);
  for (let i = 0; i < MOTE_N; i++) {
    const a = Math.random() * Math.PI * 2, r = 8.5 + Math.random() * (BACK_R - 10);
    motePos[i * 3] = Math.cos(a) * r;
    motePos[i * 3 + 1] = Math.random() * BACK_H - BACK_H / 2;
    motePos[i * 3 + 2] = Math.sin(a) * r;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
  const moteMat = new THREE.PointsMaterial({ color: 0x7dffc0, size: 0.22, map: dotTex,
    transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.position.set(CLUB.x, BACK_CY, CLUB.z); addC(motes);

  // rain (cyberpunk only): a faint inner cylinder of streaks, scrolled downward
  const clubRainTex = canvasTex(128, 256, (g) => {
    g.clearRect(0, 0, 128, 256);
    g.strokeStyle = "rgba(180,220,255,0.55)"; g.lineWidth = 1;
    for (let i = 0; i < 44; i++) {
      const x = Math.random() * 128, y = Math.random() * 256, l = 14 + Math.random() * 22;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2, y + l); g.stroke();
    }
  });
  clubRainTex.wrapS = clubRainTex.wrapT = THREE.RepeatWrapping;
  clubRainTex.repeat.set(26, 3);
  const clubRain = addC(new THREE.Mesh(
    new THREE.CylinderGeometry(BACK_R - 2, BACK_R - 2, BACK_H, 48, 1, true),
    new THREE.MeshBasicMaterial({ map: clubRainTex, side: THREE.BackSide, transparent: true,
      opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
  clubRain.position.set(CLUB.x, BACK_CY, CLUB.z);

  // a blimp (cyberpunk): drifts the skyline with a glowing flank
  const blimp = new THREE.Group();
  const blimpBody = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10),
    new THREE.MeshBasicMaterial({ color: 0x140e22 }));
  blimpBody.scale.set(2.8, 1, 1);
  const blimpSign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.9),
    new THREE.MeshBasicMaterial({ color: 0xff3fae, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false }));
  blimpSign.position.set(0, -0.05, 1.02);
  blimp.add(blimpBody, blimpSign);
  blimp.position.set(CLUB.x + 9, SKY_Y, CLUB.z);
  addC(blimp);

  // a feature flyer (space UFO): a disc that crosses now and then
  const flyer = new THREE.Group();
  const flyerBody = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 10),
    new THREE.MeshBasicMaterial({ color: 0x202a3a }));
  flyerBody.scale.set(1, 0.32, 1);
  const flyerGlow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 18),
    new THREE.MeshBasicMaterial({ color: 0x9dff6a, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false }));
  flyerGlow.rotation.x = -Math.PI / 2; flyerGlow.position.y = -0.16;
  flyer.add(flyerBody, flyerGlow);
  flyer.position.set(CLUB.x, SKY_Y, CLUB.z - 12);
  flyer.visible = false;
  addC(flyer);
  let flyerT = -1, flyerFrom = 1, flyerNext = 8;

  // ---- traffic: rivers of car-light far below, veiled by haze. two additive
  // rings of dashes scrolling opposite ways so the street looks alive without
  // ever showing a clean ground. toggled per theme. ----
  const trafficGroup = new THREE.Group(); trafficGroup.position.set(CLUB.x, 0, CLUB.z);
  const trafficTex = (warm) => canvasTex(512, 32, (g) => {
    g.clearRect(0, 0, 512, 32);
    for (let i = 0; i < 150; i++) {
      const x = Math.random() * 512, y = 2 + Math.random() * 28, len = 8 + Math.random() * 22;
      g.fillStyle = warm
        ? `rgba(255,${160 + (Math.random() * 80 | 0)},${90 + (Math.random() * 60 | 0)},${(0.65 + Math.random() * 0.35).toFixed(2)})`
        : `rgba(255,${60 + (Math.random() * 60 | 0)},${55 + (Math.random() * 45 | 0)},${(0.65 + Math.random() * 0.35).toFixed(2)})`;
      g.fillRect(x, y, len, 2.5);
    }
  });
  const trafficRings = [];
  [[-6.5, 12.5, true, 1], [-9, 11, false, -1]].forEach(([y, r, warm, dir]) => {
    const tex = trafficTex(warm); tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(10, 1);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 3.2, 48, 1, true),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true,
        opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    ring.position.y = y; ring.userData.dir = dir; ring.userData.tex = tex;
    trafficGroup.add(ring); trafficRings.push(ring);
  });
  addC(trafficGroup);

  // ---- the jungle GROWS INSIDE the loft (theme = jungle): trunks from the
  // floor, canopies up in the volume, hanging vines + glowing fruit. perimeter
  // only, so the booth + dance floor stay clear. toggled per theme. ----
  const jungleGroup = new THREE.Group(); jungleGroup.position.set(CLUB.x, 0, CLUB.z);
  const mkTree = (x, z, s) => {
    const tr = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.17 * s, 2.7 * s, 7), lam(0x241a12));
    trunk.position.y = 1.35 * s; tr.add(trunk);
    const leafPos = [];
    for (let k = 0; k < 5; k++) {
      const cr = (0.55 + Math.random() * 0.45) * s;
      const cx = (Math.random() - 0.5) * 1.0 * s, cy = (2.5 + Math.random() * 1.6) * s, cz = (Math.random() - 0.5) * 1.0 * s;
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(cr, 0), new THREE.MeshBasicMaterial({ color: 0x10331c }));
      blob.position.set(cx, cy, cz); blob.scale.y = 0.78; tr.add(blob);
      for (let m = 0; m < 8; m++) { const a = Math.random() * 7, rr = Math.random() * cr; leafPos.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8, cz + Math.sin(a) * rr); }
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(leafPos), 3));
    tr.add(new THREE.Points(lg, new THREE.PointsMaterial({ color: 0x7dffae, size: 0.12 * s, map: dotTex, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })));
    for (let v = 0; v < 4; v++) {
      const vh = (0.8 + Math.random() * 1.1) * s;
      const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, vh, 4), new THREE.MeshBasicMaterial({ color: 0x2f7a45 }));
      vine.position.set((Math.random() - 0.5) * 1.4 * s, (2.4 * s) - vh / 2, (Math.random() - 0.5) * 1.4 * s); tr.add(vine);
    }
    // a couple of glowing fruit/lanterns
    for (let f = 0; f < 2; f++) {
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.07 * s, 8, 6),
        new THREE.MeshBasicMaterial({ color: f ? 0xff5fae : 0xffc24a }));
      fruit.position.set((Math.random() - 0.5) * 1.3 * s, (1.8 + Math.random() * 0.9) * s, (Math.random() - 0.5) * 1.3 * s); tr.add(fruit);
    }
    tr.position.set(x, 0, z); tr.rotation.y = Math.random() * 7; return tr;
  };
  [[-5.0, 3.4, 1.25], [5.0, 3.3, 1.15], [-5.1, -1.0, 1.3], [4.6, -3.4, 1.0], [-2.4, 3.9, 0.95], [2.0, -3.9, 0.9]]
    .forEach(([x, z, s]) => jungleGroup.add(mkTree(x, z, s)));
  // string lights swagged overhead between the trees
  const lanternCols = [0xffc24a, 0xff5fae, 0x7dffae, 0x4cc9f0];
  const swag = (ax, az, bx, bz, y, sag) => {
    for (let i = 0; i <= 9; i++) {
      const t = i / 9;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5),
        new THREE.MeshBasicMaterial({ color: lanternCols[i % lanternCols.length] }));
      bulb.position.set(ax + (bx - ax) * t, y - Math.sin(t * Math.PI) * sag, az + (bz - az) * t);
      jungleGroup.add(bulb);
    }
  };
  swag(-5.0, 3.4, 2.0, -3.9, 4.2, 0.7);
  swag(5.0, 3.3, -5.1, -1.0, 4.4, 0.8);
  // a couple of neon signs hung in the foliage
  const jungleSignTex = (a, b, glyph) => canvasTex(128, 256, (g) => {
    g.fillStyle = "#0a0610"; g.fillRect(0, 0, 128, 256);
    g.strokeStyle = a; g.lineWidth = 6; g.strokeRect(9, 9, 110, 238);
    g.fillStyle = b; g.font = "700 84px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.shadowColor = b; g.shadowBlur = 22; g.fillText(glyph, 64, 84); g.fillText("夜", 64, 176);
  });
  [["#ff3fae", "#ffd2ec", "電", -4.7, 2.6, 1.9, Math.PI / 2], ["#3fd2ff", "#d2f4ff", "森", 4.7, -2.9, 1.8, -Math.PI / 2]]
    .forEach(([a, b, gl, x, z, y, ry]) => {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.0), new THREE.MeshBasicMaterial({ map: jungleSignTex(a, b, gl), transparent: true }));
      s.position.set(x, y, z); s.rotation.y = ry; jungleGroup.add(s);
    });
  // ground ferns clustered at the tree bases
  [[-5.0, 3.4], [5.0, 3.3], [-5.1, -1.0], [4.6, -3.4], [-2.4, 3.9], [2.0, -3.9]].forEach(([bx, bz]) => {
    for (let f = 0; f < 7; f++) {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4 + Math.random() * 0.3, 4),
        new THREE.MeshBasicMaterial({ color: 0x1d5a2e }));
      const a = Math.random() * 7, r = 0.2 + Math.random() * 0.5;
      blade.position.set(bx + Math.cos(a) * r, 0.2, bz + Math.sin(a) * r);
      blade.rotation.z = (Math.random() - 0.5) * 0.6; jungleGroup.add(blade);
    }
  });
  // a wet sheen on the floor — the jungle drips, the neon reflects
  const wetFloor = new THREE.Mesh(new THREE.PlaneGeometry(CLW - 1, CLD - 1),
    new THREE.MeshBasicMaterial({ color: 0x1a2c46, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
  wetFloor.rotation.x = -Math.PI / 2; wetFloor.position.set(0, 0.02, 0.4); jungleGroup.add(wetFloor);
  addC(jungleGroup);

  // ---- TRON storm (cyber): the sky stutters with electric-blue lightning ----
  const stormGroup = new THREE.Group(); stormGroup.position.set(CLUB.x, BACK_CY, CLUB.z);
  const stormFlash = new THREE.Mesh(new THREE.CylinderGeometry(BACK_R - 0.4, BACK_R - 0.4, BACK_H, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x9fe8ff, side: THREE.BackSide, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  stormGroup.add(stormFlash);
  const boltTex = canvasTex(128, 512, (g) => {
    g.clearRect(0, 0, 128, 512);
    g.strokeStyle = "#dff4ff"; g.lineWidth = 5; g.shadowColor = "#5cc8ff"; g.shadowBlur = 18;
    g.beginPath(); let bx = 64; g.moveTo(bx, 0);
    for (let y = 0; y <= 512; y += 30) { bx = 64 + (Math.random() - 0.5) * 80; g.lineTo(bx, y); }
    g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(64, 200); g.lineTo(110, 250); g.lineTo(96, 300); g.stroke();
  });
  const stormBolt = new THREE.Mesh(new THREE.PlaneGeometry(3.2, BACK_H * 0.7),
    new THREE.MeshBasicMaterial({ map: boltTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  stormGroup.add(stormBolt);
  addC(stormGroup);
  let stormT = 0, stormNext = 4;

  // ---- aquarium: a school of fish actually SWIMMING + bubbles rising ----
  const fishTex = (col) => canvasTex(64, 32, (g) => {
    g.clearRect(0, 0, 64, 32);
    g.fillStyle = col; g.beginPath(); g.ellipse(36, 16, 20, 11, 0, 0, 7); g.fill();
    g.beginPath(); g.moveTo(16, 16); g.lineTo(2, 5); g.lineTo(2, 27); g.closePath(); g.fill();
    g.fillStyle = "rgba(0,0,0,0.55)"; g.beginPath(); g.arc(48, 13, 2.4, 0, 7); g.fill();
  });
  const fishCols = ["#ffd166", "#ef476f", "#06d6a0", "#ff9e6d", "#b5f5ff", "#f7c948"];
  const fishGroup = new THREE.Group(); fishGroup.position.set(CLUB.x, 0, CLUB.z);
  const fishes = [];
  for (let i = 0; i < 16; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: fishTex(fishCols[i % fishCols.length]), transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const sc = 0.7 + Math.random() * 0.9;
    const fish = new THREE.Mesh(new THREE.PlaneGeometry(0.9 * sc, 0.45 * sc), mat);
    fishGroup.add(fish);
    fishes.push({ mesh: fish, r: 8.5 + Math.random() * 4.5, y: -2 + Math.random() * 9, sp: (0.1 + Math.random() * 0.16) * (Math.random() < 0.5 ? 1 : -1), ph: Math.random() * 7, bob: Math.random() * 7 });
  }
  addC(fishGroup);
  const BUB_N = 90;
  const bubPos = new Float32Array(BUB_N * 3);
  for (let i = 0; i < BUB_N; i++) {
    const a = Math.random() * 7, r = 8 + Math.random() * 5;
    bubPos[i * 3] = Math.cos(a) * r; bubPos[i * 3 + 1] = Math.random() * 14 - 4; bubPos[i * 3 + 2] = Math.sin(a) * r;
  }
  const bubGeo = new THREE.BufferGeometry(); bubGeo.setAttribute("position", new THREE.BufferAttribute(bubPos, 3));
  const bubbles = new THREE.Points(bubGeo, new THREE.PointsMaterial({ color: 0xcfefff, size: 0.13, map: dotTex, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  bubbles.position.set(CLUB.x, 0, CLUB.z); addC(bubbles);

  // ---- interior life: slow motes drifting INSIDE the loft, caught in the neon.
  // always on, recolored per theme — gives the air in the room some movement. ----
  const DUST_N = 150;
  const clubDustPos = new Float32Array(DUST_N * 3);
  const clubDustVel = new Float32Array(DUST_N);
  for (let i = 0; i < DUST_N; i++) {
    clubDustPos[i * 3] = (Math.random() - 0.5) * (CLW - 1);
    clubDustPos[i * 3 + 1] = 0.3 + Math.random() * 4.9;
    clubDustPos[i * 3 + 2] = (Math.random() - 0.5) * (CLD - 1) + 0.4;
    clubDustVel[i] = 0.04 + Math.random() * 0.12;
  }
  const clubDustGeo = new THREE.BufferGeometry(); clubDustGeo.setAttribute("position", new THREE.BufferAttribute(clubDustPos, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0x9fb0ff, size: 0.055, map: dotTex, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  const dust = new THREE.Points(clubDustGeo, dustMat); dust.position.set(CLUB.x, 0, CLUB.z); addC(dust);

  // ---- the FOG MACHINE: a soft persistent haze low on the floor + jets that
  // blow fog DOWN from the ceiling on a dj's cue. additive puffs tinted to the
  // active theme so the fog glows with the neon. ----
  const puffTex = canvasTex(128, 128, (g) => {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,255,255,0.5)"); grd.addColorStop(0.45, "rgba(255,255,255,0.16)");
    grd.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  });
  const fogColor = new THREE.Color(0xbfc8ff), WHITE = new THREE.Color(0xffffff);
  const fogGroup = new THREE.Group(); fogGroup.position.set(CLUB.x, 0, CLUB.z); addC(fogGroup);
  const hazePuffs = [];
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xbfc8ff, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false }));
    const sc = 4 + Math.random() * 2.5; sp.scale.set(sc, sc * 0.55, 1);
    sp.position.set((Math.random() - 0.5) * (CLW - 2), 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * (CLD - 2) + 0.4);
    fogGroup.add(sp); hazePuffs.push({ sp, ph: Math.random() * 7 });
  }
  // fog cannons hang from the ceiling at these x positions; a burst pours a
  // dense column of overlapping puffs down from each.
  const fogJets = [-3.4, -1.1, 1.1, 3.4];
  const FOG_N = 48, fogPuffs = [];
  for (let i = 0; i < FOG_N; i++) {
    // NORMAL blend (not additive): the burst VEILS the room like real fog
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xc8d0e8, transparent: true, opacity: 0, depthWrite: false }));
    sp.visible = false; fogGroup.add(sp); fogPuffs.push({ sp, life: 0, vy: 0, grow: 0 });
  }
  function clubFog(seed) {
    seed = (seed | 0) || 1; let placed = 0; const batch = 18 + (seed % 8);
    for (const p of fogPuffs) {
      if (p.life > 0) continue;
      const jet = fogJets[placed % fogJets.length];
      p.life = 1; p.vy = -(0.28 + Math.random() * 0.4); p.grow = 1.4 + Math.random() * 1.6;
      const sc = 1.3 + Math.random() * 1.3; p.sp.scale.set(sc, sc, 1);
      p.sp.position.set(jet + (Math.random() - 0.5) * 1.4, CLH - 0.25 - Math.random() * 0.6, (Math.random() - 0.5) * (CLD - 2) + 0.4);
      p.sp.material.color.copy(fogColor); p.sp.material.opacity = 0; p.sp.visible = true;
      if (++placed >= batch) break;
    }
  }
  function tickFog(dt) {
    for (const h of hazePuffs) { h.sp.position.x += Math.sin(elapsed * 0.2 + h.ph) * 0.002; h.sp.material.color.lerp(fogColor, 0.02); }
    for (const p of fogPuffs) {
      if (p.life <= 0) continue;
      p.life -= dt * 0.16;                         // lingers a few seconds
      if (p.life <= 0) { p.sp.visible = false; continue; }
      p.sp.position.y += p.vy * dt;
      const s = p.sp.scale.x + p.grow * dt; p.sp.scale.set(s, s, 1);
      p.sp.material.opacity = 0.32 * Math.sin((1 - p.life) * Math.PI);   // veils, then thins out
    }
  }

  // ---- interior palette (the cove / corners / lip / motes / floor tiles) ----
  const clubPal = { tileHue: 0.42, tileRange: 0.5, tileSat: 0.85 };
  function applyClubPalette(p) {
    p.cove.forEach((c, i) => { if (coveMeshes[i]) coveMeshes[i].material.color.set(c); });
    p.corners.forEach((c, i) => { if (tubeMeshes[i]) tubeMeshes[i].material.color.set(c); });
    deskLip.material.color.set(p.lip);
    moteMat.color.set(p.mote); dustMat.color.set(p.mote);
    fogColor.set(p.mote).lerp(WHITE, 0.55);   // a whitened tint reads as haze, not a glowing blob
    clubPal.tileHue = p.tileHue; clubPal.tileRange = p.tileRange; clubPal.tileSat = p.tileSat;
  }

  // ---- backdrop painters: each fills the wide panorama strip. they share a
  // high-rise layout — content rises above and PLUNGES below the loft, then a
  // haze gradient swallows the bottom so there's never a hard ground edge. ----
  const skyGrad = (g, stops) => {
    const grd = g.createLinearGradient(0, 0, 0, PH);
    stops.forEach(([o, c]) => grd.addColorStop(o, c));
    g.fillStyle = grd; g.fillRect(0, 0, PW, PH);
  };
  // veil the bottom: from clear at world-y `yTop` to opaque smog by the floor
  const hazeFloor = (g, yTop, smog) => {
    const t = toCY(yTop), hz = g.createLinearGradient(0, t, 0, PH);
    hz.addColorStop(0, smog + "00"); hz.addColorStop(0.5, smog + "99");
    hz.addColorStop(0.82, smog + "f2"); hz.addColorStop(1, "#02030699");
    g.fillStyle = hz; g.fillRect(0, t, PW, PH - t);
  };

  const paintCyber = (g) => {
    skyGrad(g, [[0, "#2a1c50"], [0.1, "#241548"], [0.2, "#2c1648"], [0.34, "#190f2a"], [1, "#070512"]]);
    // a hazy magenta moon high over the skyline
    g.fillStyle = "rgba(255,180,220,0.8)"; g.beginPath(); g.arc(2950, toCY(11), 72, 0, 7); g.fill();
    g.fillStyle = "rgba(255,120,200,0.10)"; g.beginPath(); g.arc(2950, toCY(11), 150, 0, 7); g.fill();
    const neon = ["#ff3fae", "#3fd2ff", "#9dff5a", "#ffd23f", "#b15bff", "#ff8a3f"];
    const tower = (x, w, topY, near) => {
      const topCY = toCY(topY), botCY = toCY(-20);
      g.fillStyle = near ? "#0b0913" : "#19233f"; g.globalAlpha = near ? 1 : 0.55;
      g.fillRect(x, topCY, w, botCY - topCY); g.globalAlpha = 1;
      const col = neon[Math.random() * neon.length | 0];
      for (let wy = topCY + 14; wy < botCY - 8; wy += 17) {
        const mood = Math.random();                 // each floor has its own life
        for (let wx = x + 8; wx < x + w - 8; wx += 14)
          if (Math.random() < 0.18 + mood * 0.6) {
            g.fillStyle = Math.random() < 0.82 ? col : neon[Math.random() * neon.length | 0];
            g.globalAlpha = (near ? 0.5 : 0.28) + Math.random() * 0.45;
            g.fillRect(wx, wy, near ? 5 : 3, near ? 8 : 4);
          }
      }
      g.globalAlpha = 1;
      if (near && Math.random() < 0.7) { g.fillStyle = neon[Math.random() * neon.length | 0]; g.fillRect(x + (Math.random() < 0.5 ? 6 : w - 10), topCY + 24, 5, (botCY - topCY) * 0.4); }
      if (near && Math.random() < 0.5) {
        const bh = 80 + Math.random() * 100, c = neon[Math.random() * neon.length | 0];
        g.fillStyle = c; g.globalAlpha = 0.22; g.fillRect(x + w * 0.12, topCY - bh, w * 0.76, bh); g.globalAlpha = 1;
        g.fillStyle = c; g.fillRect(x + w * 0.12, topCY - bh, w * 0.76, 3); g.fillRect(x + w * 0.12, topCY - 3, w * 0.76, 3);
      }
    };
    // far skyline (hazy, behind), then the near towers that frame the street
    let x = -30; while (x < PW + 30) { const w = 90 + Math.random() * 150; tower(x, w, 6 + Math.random() * 3, false); x += w + 8 + Math.random() * 30; }
    x = -40; while (x < PW + 40) { const w = 80 + Math.random() * 160; tower(x, w, 6.5 + Math.random() * 6.5, true); x += w + 30 + Math.random() * 90; }
    hazeFloor(g, 1.5, "#3a1840");        // magenta smog swallows the deep street
  };

  const paintAquarium = (g) => {
    skyGrad(g, [[0, "#1497ab"], [0.16, "#0a7188"], [0.4, "#045158"], [1, "#021c26"]]);
    // god-rays slanting down from the surface
    g.save(); g.globalAlpha = 0.06; g.fillStyle = "#aef6ff";
    for (let i = 0; i < 22; i++) { const rx = i / 22 * PW; g.beginPath(); g.moveTo(rx, 0); g.lineTo(rx + 110, 0); g.lineTo(rx + 420, PH); g.lineTo(rx + 300, PH); g.closePath(); g.fill(); }
    g.restore();
    // kelp rising from the deep, fading down
    g.strokeStyle = "rgba(40,170,100,0.5)"; g.lineWidth = 9;
    for (let i = 0; i < 30; i++) { const kx = Math.random() * PW, top = toCY(-2 - Math.random() * 6); g.beginPath(); g.moveTo(kx, PH); for (let y = PH; y > top; y -= 44) g.lineTo(kx + Math.sin(y * 0.03 + kx) * 26, y); g.stroke(); }
    const fishCol = ["#ffd166", "#ef476f", "#06d6a0", "#118ab2", "#ff9e6d", "#f7f7ff", "#b5f5ff"];
    for (let i = 0; i < 110; i++) {
      const fx = Math.random() * PW, fy = toCY(9) + Math.random() * (toCY(-8) - toCY(9)), s = 9 + Math.random() * 18, c = fishCol[Math.random() * fishCol.length | 0];
      g.fillStyle = c; g.globalAlpha = 0.85;
      g.beginPath(); g.ellipse(fx, fy, s, s * 0.55, 0, 0, 7); g.fill();
      g.beginPath(); g.moveTo(fx - s, fy); g.lineTo(fx - s - s * 0.7, fy - s * 0.5); g.lineTo(fx - s - s * 0.7, fy + s * 0.5); g.fill();
    }
    g.globalAlpha = 1;
    // a whale-shark silhouette cruising the mid-water
    g.fillStyle = "rgba(8,42,58,0.85)"; g.beginPath(); g.ellipse(2600, toCY(7), 300, 90, 0.08, 0, 7); g.fill();
    hazeFloor(g, -1, "#022026");          // the seabed is lost in murk
  };

  const paintSpace = (g) => {
    skyGrad(g, [[0, "#0c0a2c"], [0.4, "#070620"], [0.7, "#05061a"], [1, "#070314"]]);
    for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(255,255,255,${(0.3 + Math.random() * 0.7).toFixed(2)})`; const s = Math.random() < 0.1 ? 2 : 1; g.fillRect(Math.random() * PW, Math.random() * PH, s, s); }
    const neb = ["#5b2a86", "#1f6f8b", "#86276a", "#2a4a86"];
    g.save(); g.globalAlpha = 0.12;
    for (let i = 0; i < 26; i++) { const c = neb[Math.random() * neb.length | 0], cx = Math.random() * PW, cy = Math.random() * PH, r = 140 + Math.random() * 300; const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r); grd.addColorStop(0, c); grd.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); }
    g.restore();
    const planet = (px, py, r, c1, c2, ring) => {
      const grd = g.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.1, px, py, r);
      grd.addColorStop(0, c1); grd.addColorStop(1, c2); g.fillStyle = grd; g.beginPath(); g.arc(px, py, r, 0, 7); g.fill();
      if (ring) { g.strokeStyle = "rgba(255,220,180,0.5)"; g.lineWidth = 9; g.save(); g.translate(px, py); g.scale(1, 0.32); g.beginPath(); g.arc(0, 0, r * 1.6, 0, 7); g.stroke(); g.restore(); }
    };
    planet(900, toCY(8), 150, "#e8a06a", "#7a3b1e", true);
    planet(3100, toCY(5), 240, "#6ad1e8", "#1a3a6a", false);
    planet(2100, toCY(11), 70, "#c0c8d8", "#4a4f60", false);
    hazeFloor(g, -6, "#06031a");           // deep space fades to black below
  };

  const CLUB_THEMES = [
    { name: "Bangkok-Bali 2077", paint: paintCyber, sky: 0x2a1c50, rain: true, blimp: true, flyer: false, traffic: true, jungle: true, storm: true, fish: false,
      palette: { cove: [0xff3fae, 0x39ff9d, 0x3fd2ff, 0xff3fae], corners: [0x39ff9d, 0xff3fae, 0x3fd2ff, 0xb15bff], lip: 0xff3fae, mote: 0x7dffc0, tileHue: 0.42, tileRange: 0.5, tileSat: 0.85 } },
    { name: "Deep Aquarium", paint: paintAquarium, sky: 0x1497ab, rain: false, blimp: false, flyer: false, traffic: false, jungle: false, storm: false, fish: true,
      palette: { cove: [0x06d6a0, 0x4cc9f0, 0x4cc9f0, 0x06d6a0], corners: [0x4cc9f0, 0x06d6a0, 0x4cc9f0, 0x118ab2], lip: 0x4cc9f0, mote: 0xaef6ff, tileHue: 0.5, tileRange: 0.18, tileSat: 0.7 } },
    { name: "Deep Space", paint: paintSpace, sky: 0x0c0a2c, rain: false, blimp: false, flyer: true, traffic: false, jungle: false, storm: false, fish: false,
      palette: { cove: [0x8a5cff, 0x3fd2ff, 0x8a5cff, 0xff5fae], corners: [0x3fd2ff, 0x8a5cff, 0xff5fae, 0x3fd2ff], lip: 0x8a5cff, mote: 0xffffff, tileHue: 0.72, tileRange: 0.28, tileSat: 0.7 } },
  ];
  let themeIx = 0;
  function applyClubTheme(ix) {
    themeIx = ((ix % CLUB_THEMES.length) + CLUB_THEMES.length) % CLUB_THEMES.length;
    const t = CLUB_THEMES[themeIx];
    t.paint(panoCanvas.getContext("2d"));
    panoTex.needsUpdate = true;
    capMat.color.set(t.sky);             // the cap matches the sky so the zenith blends
    applyClubPalette(t.palette);
    clubRain.visible = !!t.rain; blimp.visible = !!t.blimp;
    trafficGroup.visible = !!t.traffic; jungleGroup.visible = !!t.jungle;
    fishGroup.visible = !!t.fish; bubbles.visible = !!t.fish;
    stormGroup.visible = !!t.storm;
    if (!t.storm) { stormFlash.material.opacity = 0; stormBolt.material.opacity = 0; stormT = 0; }
    return t.name;
  }
  function cycleClubTheme() { return applyClubTheme(themeIx + 1); }
  function clubThemeName() { return CLUB_THEMES[themeIx].name; }

  function tickBackdrop(dt) {
    motes.rotation.y += dt * 0.015;
    motes.position.y = BACK_CY + Math.sin(elapsed * 0.18) * 0.4;
    // interior dust drifts slowly up and sways, then recycles at the floor
    const dp2 = dust.geometry.attributes.position;
    for (let i = 0; i < DUST_N; i++) {
      let y = dp2.getY(i) + clubDustVel[i] * dt;
      if (y > 5.2) y = 0.3;
      dp2.setY(i, y);
      dp2.setX(i, dp2.getX(i) + Math.sin(elapsed * 0.4 + i) * 0.0012);
    }
    dp2.needsUpdate = true;
    if (clubRain.visible) clubRainTex.offset.y = (clubRainTex.offset.y + dt * 1.4) % 1;   // streaks fall DOWN
    // TRON storm: random strikes that stutter electric-blue, then fade
    if (stormGroup.visible) {
      if (stormT <= 0) {
        stormNext -= dt;
        if (stormNext <= 0) {
          stormT = 0.5 + Math.random() * 0.35; stormNext = 5 + Math.random() * 9;
          const a = Math.random() * 7;
          stormBolt.position.set(Math.sin(a) * (BACK_R - 1), 5, Math.cos(a) * (BACK_R - 1));
          stormBolt.rotation.y = -a;
        }
      } else {
        stormT -= dt;
        const fade = Math.min(1, stormT * 4);
        const flick = (Math.sin(elapsed * 55) > -0.2 ? 1 : 0.25) * (0.5 + 0.5 * Math.random());
        stormFlash.material.opacity = 0.45 * fade * flick;
        stormBolt.material.opacity = fade * flick;
        if (stormT <= 0) { stormFlash.material.opacity = 0; stormBolt.material.opacity = 0; }
      }
    }
    // aquarium: the school swims gentle loops, bubbles drift up
    if (fishGroup.visible) {
      for (const f of fishes) {
        const ang = f.ph + elapsed * f.sp;
        const x = Math.cos(ang) * f.r, z = Math.sin(ang) * f.r;
        f.mesh.position.set(x, f.y + Math.sin(elapsed * 0.6 + f.bob) * 0.4, z);
        f.mesh.rotation.y = -ang + (f.sp > 0 ? Math.PI : 0);
      }
      const bp = bubbles.geometry.attributes.position;
      for (let i = 0; i < BUB_N; i++) {
        let y = bp.getY(i) + dt * 0.6;
        if (y > 11) y = -4;
        bp.setY(i, y);
      }
      bp.needsUpdate = true;
    }
    if (trafficGroup.visible)
      trafficRings.forEach(r => { r.userData.tex.offset.x = (r.userData.tex.offset.x + dt * 0.06 * r.userData.dir) % 1; });
    if (blimp.visible) {
      const a = elapsed * 0.035;
      blimp.position.set(CLUB.x + Math.cos(a) * 11, SKY_Y + Math.sin(a * 0.7) * 0.8, CLUB.z + Math.sin(a) * 11);
      blimp.rotation.y = -a + Math.PI / 2;
    }
    if (CLUB_THEMES[themeIx].flyer) {
      if (flyerT < 0) {
        flyerNext -= dt;
        if (flyerNext <= 0) { flyerT = 0; flyerFrom = Math.random() < 0.5 ? 1 : -1; flyerNext = 14 + Math.random() * 12; }
      } else {
        flyerT += dt * 0.1;
        if (flyerT >= 1) { flyerT = -1; flyer.visible = false; }
        else { flyer.visible = true; const fx = flyerFrom * (1 - flyerT * 2) * 12; flyer.position.set(CLUB.x + fx, SKY_Y + Math.sin(flyerT * Math.PI) * 1.2, CLUB.z - 12); }
      }
    } else if (flyer.visible) flyer.visible = false;
  }

  applyClubTheme(0);   // open on Bangkok-Bali 2077

  /* DJ fireworks over the city — an additive canvas just inside the south
     (door-wall) glass, invisible until a dj sets one off; it broadcasts so the
     whole room sees the same sky. drawn in 2-D so the bursts pin to the glass
     with no 3-D clipping and no light bleed. */
  const FWZ = CLUB.z + CLD / 2 - 0.12;
  const fwCanvas = document.createElement("canvas");
  fwCanvas.width = 512; fwCanvas.height = 256;
  const fwTex = new THREE.CanvasTexture(fwCanvas);
  const fwPane = addC(new THREE.Mesh(new THREE.PlaneGeometry(CLW - 0.5, 4.4),
    new THREE.MeshBasicMaterial({ map: fwTex, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false })));
  fwPane.rotation.y = Math.PI;
  fwPane.position.set(CLUB.x, 2.7, FWZ);
  fwPane.visible = false;

  // a faint glass sheen on the door-wall opening — doubles as the dj's
  // click target to launch fireworks over the city
  const glassClick = addC(new THREE.Mesh(new THREE.PlaneGeometry(CLW - 0.5, CLH - SILL),
    new THREE.MeshBasicMaterial({ color: 0x8fd9ff, transparent: true, opacity: 0.04,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
  glassClick.rotation.y = Math.PI;
  glassClick.position.set(CLUB.x, SILL + (CLH - SILL) / 2, CLUB.z + CLD / 2 - 0.06);
  glassClick.userData.clubWindow = true;
  const fwShells = [], fwSparks = [];
  const FW_COL = [[255,90,140],[120,200,255],[255,220,90],[170,120,255],[120,255,170],[255,150,80]];
  function clubFireworks(seed) {
    // a couple of shells per trigger, fired up from along the rooftops
    seed = (seed | 0) || 1;
    const n = 2 + (seed % 3);
    for (let i = 0; i < n; i++) {
      fwShells.push({
        x: 60 + ((seed * 53 + i * 167) % 380),
        y: 256, vy: -2.2 - ((seed + i) % 5) * 0.18,
        burstY: 50 + ((seed * 31 + i * 71) % 90),
        col: FW_COL[(seed + i) % FW_COL.length],
      });
    }
    fwPane.visible = true;
  }
  function tickFireworks(dt) {
    if (!fwPane.visible) return;
    const g = fwCanvas.getContext("2d");
    // fade last frame toward black for trails (black adds nothing additively)
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(0,0,0,0.28)"; g.fillRect(0, 0, 512, 256);
    g.globalCompositeOperation = "lighter";
    const step = Math.min(2, dt * 60);
    for (let i = fwShells.length - 1; i >= 0; i--) {
      const s = fwShells[i];
      s.y += s.vy * step; s.vy += 0.012 * step;
      g.fillStyle = `rgb(${s.col[0]},${s.col[1]},${s.col[2]})`;
      g.fillRect(s.x - 1, s.y - 2, 2, 4);
      if (s.y <= s.burstY || s.vy >= 0) {
        const m = 46 + (s.burstY % 24);
        for (let k = 0; k < m; k++) {
          const a = (k / m) * Math.PI * 2 + (s.x % 6) * 0.1;
          const sp = 0.7 + (k % 5) * 0.32;
          fwSparks.push({ x: s.x, y: s.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, col: s.col });
        }
        fwShells.splice(i, 1);
      }
    }
    for (let i = fwSparks.length - 1; i >= 0; i--) {
      const p = fwSparks[i];
      p.x += p.vx * step; p.y += p.vy * step;
      p.vy += 0.02 * step; p.vx *= 0.99; p.life -= 0.013 * step;
      if (p.life <= 0) { fwSparks.splice(i, 1); continue; }
      g.fillStyle = `rgba(${p.col[0]},${p.col[1]},${p.col[2]},${Math.max(0, p.life).toFixed(2)})`;
      g.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    fwTex.needsUpdate = true;
    if (!fwShells.length && !fwSparks.length) {
      g.globalCompositeOperation = "source-over";
      g.clearRect(0, 0, 512, 256); fwTex.needsUpdate = true;
      fwPane.visible = false;          // sleep until the next launch
    }
  }

  // music energy (0..1), fed from the dj analyser in main.js and lerped here
  // so the room breathes with the beat instead of snapping. zero = idle.
  let clubEnergy = 0, clubEnergyTarget = 0;
  function setClubEnergy(v) { clubEnergyTarget = Math.max(0, Math.min(1, v || 0)); }

  function tickClub(dt) {
    clubEnergy += (clubEnergyTarget - clubEnergy) * Math.min(1, dt * 9);
    const e = clubEnergy;
    discoBall.rotation.y = elapsed * (0.5 + e * 1.2);
    swirl.rotation.y = elapsed * (0.9 + e * 0.9);
    swirl.rotation.z = Math.sin(elapsed * 0.31) * 0.35;
    // the movers pump with the music — modest so the walls stay readable
    const pump = 48 * (1 + e * 0.55);
    swirlA.intensity = pump;
    if (swirlB) swirlB.intensity = pump;
    clubTiles.forEach((t, i) => {
      // the floor hue sweeps within the active theme's palette band
      const sweep = (elapsed * (0.03 + e * 0.1) + (i % TGZ) * 0.06 + Math.floor(i / TGZ) * 0.04);
      const hue = (clubPal.tileHue + (sweep % 1) * clubPal.tileRange) % 1;
      const beat = 0.13 + 0.05 * Math.sin(elapsed * 1.7 + i)
        + e * 0.4 * (0.6 + 0.4 * Math.sin(elapsed * 6.5 + i));
      t.material.color.setHSL(hue, clubPal.tileSat, beat);
    });
    // the VU: how many segments lit tracks energy, color ramps to red
    const lit = Math.round(e * VN);
    vuSegs.forEach((s, i) => {
      if (i < lit) { vuOn.setHSL(0.34 - (i / VN) * 0.34, 0.85, 0.5); s.material.color.copy(vuOn); }
      else s.material.color.copy(vuOff);
    });
    if (onAirLive) onAirLight.intensity = 3.4 + Math.sin(elapsed * 2.2) * 0.8 + e * 2.2;
    tickFireworks(dt);
    tickBackdrop(dt);
    tickFog(dt);
  }

  // where feet may go: bedroom + closet passage + arcade room
  // (cabinet walls get ~1.1 m clearance so you can stand at any machine)
  const WALK_RECTS = [
    { x0: -2.3, x1: 2.3, z0: -2.35, z1: 3.0 },
    // passage reaches well into the arcade rect — overlapping rects,
    // so there's no dead strip at the threshold
    { x0: AR.x1 - 0.6, x1: -2.2, z0: CZ - OPEN_W / 2 + 0.15, z1: CZ + OPEN_W / 2 - 0.15 },
    { x0: AR.x0 + 1.15, x1: AR.x1 - 0.15, z0: AR.z0 + 0.45, z1: AR.z1 - 0.45 },
    // the boat room exists far away; you can only get there by knowing
    { x0: BOAT.x - 1.75, x1: BOAT.x + 1.75, z0: BOAT.z - 1.15, z1: BOAT.z + 1.15 },
    // the club: the open floor, a full-width strip behind the dj coffin,
    // and a gap on BOTH sides of the booth that reaches it — so a dj (or
    // a curious guest) can round the decks from either hand, not just one.
    // the desk edges sit at CLUB.x ± 1.4; the side gaps stop right at them.
    { x0: CLUB.x - 5.45, x1: CLUB.x + 4.3, z0: CLUB.z - 2.8, z1: CLUB.z + 4.1 },
    { x0: CLUB.x - 2.05, x1: CLUB.x + 2.05, z0: CLUB.z - 4.2, z1: CLUB.z - 3.5 },
    { x0: CLUB.x + 1.4, x1: CLUB.x + 2.05, z0: CLUB.z - 3.6, z1: CLUB.z - 2.5 },
    { x0: CLUB.x - 2.05, x1: CLUB.x - 1.4, z0: CLUB.z - 3.6, z1: CLUB.z - 2.5 },
  ];
  const isWalkable = (x, z) => WALK_RECTS.some(r => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);

  /* --- stylized cel shading: every lit material gets a stepped toon
     ramp. Bright emissive things (screens, neon, signs) stay as-is. --- */
  const toonRampCanvas = document.createElement("canvas");
  toonRampCanvas.width = 4; toonRampCanvas.height = 1;
  {
    const g = toonRampCanvas.getContext("2d");
    ["#4a4a52", "#8a8a92", "#c9c9cf", "#ffffff"].forEach((col, i) => {
      g.fillStyle = col; g.fillRect(i, 0, 1, 1);
    });
  }
  const toonRamp = new THREE.CanvasTexture(toonRampCanvas);
  toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (!m || !(m.isMeshLambertMaterial || m.isMeshStandardMaterial)) return;
    const tm = new THREE.MeshToonMaterial({
      map: m.map || null,
      color: m.color.clone(),
      gradientMap: toonRamp,
      transparent: m.transparent,
      opacity: m.opacity,
      side: m.side,
      emissive: m.emissive ? m.emissive.clone() : 0x000000,
      emissiveMap: m.emissiveMap || null,
      emissiveIntensity: m.emissiveIntensity ?? 1,
    });
    o.material = tm;
  });

  return {
    scene, walls, blockers, noteGroup, ghostGroup, tick,
    bounds: ROOM.bounds, isWalkable,
    spawn: { x: 1.7, z: 2.35, yaw: 0.28 },
    setCityListener: fn => { onCity = fn; },
    setWeather,
    getWeather: () => wx,
    careTargets, updateCare,
    curtainHits, toggleCurtains, setCurtains,
    curtainsClosed: () => curtains.closed,
    pianoMesh: midiKeybed, pressPianoKey,
    pianoVoiceMesh: midiBody,
    stompHits, setStompLED, stompIds: Object.keys(stompLEDs),
    // the guitar filter treadle (wah-style lowpass) — see main.js openFilter
    filterPedalHit, setGuitarPedalTilt,
    // the desk channel mixer (keys · guitar · drums) — see main.js openMixer
    mixerHits: mixHits, setMixFader,
    // the two scan-through radios — prop hooks; audio lives in radio.js.
    // Swedish in Desi's cabin, LA on the bedroom rack behind the Apollo.
    radioHits, setRadioNeedle, setRadioPower, radioPos,
    laRadioHits, setLaRadioNeedle, setLaRadioPower, laRadioPos,
    // the dirty-carpet + vacuum system (bedroom only)
    floorTraffic, vacuumHits: [vNozzle, vBody, vCan, vPole, vGrip, vGripTop],
    grabVacuum, vacuumStep, vacuumHeld: () => vacHeld,
    // persist + share the carpet's dirt (rides room_state.flags.grime)
    grimeSnapshot, grimeRestore, grimeNeedsSave: () => grimeSaveDirty,
    closetHits: [leftLeaf, rightLeaf], toggleCloset, setCloset,
    closetOpen: () => closet.open,
    arcadeHits,
    smokeHits, puffSmoke,
    // real-LAX hooks
    triggerPlane: (dir) => {
      if (planeT < 0) {
        planeDir = dir < 0 ? -1 : 1;
        planeT = 0;
        if (onCity) { try { onCity("plane"); } catch (e) {} }
      }
    },
    setLivePlanes: (v) => { livePlanes = !!v; },
    // the plane hunt: the window is a shooting gallery if your aim is true
    glassHit: glass,
    planeUp: () => planeT >= 0 && !planeShot,
    // (u, v) is the raycast uv on the glass → sky-canvas pixels, with
    // the parallax offset baked in. returns "hit" | "miss" | null
    shootAtGlass: (u, v) => {
      if (planeT < 0 || plane01 == null || planeShot) return null;
      const cx = (u * sky.tex.repeat.x + sky.tex.offset.x) * 720;
      const cy = (1 - v) * 280;
      const p = jetXY(plane01, planeDir);
      if (Math.hypot(cx - p.x, cy - p.y) > 26) return "miss";
      planeShot = { x: p.x, y: p.y, age: 0 };
      return "hit";
    },
    // a remote hunter got one — bring ours down too if it's still up
    downPlane: () => {
      if (planeT < 0 || plane01 == null || planeShot) return false;
      const p = jetXY(plane01, planeDir);
      planeShot = { x: p.x, y: p.y, age: 0 };
      return true;
    },
    triggerZilla: () => { if (zillaT < 0) startZilla(); },
    triggerBat: () => { if (batT < 0) batT = 0; },
    // force the star projector on (smoke tests, impatient daylight hours)
    forceAstro: () => { astroPlane.visible = true; astroPlane.material.opacity = 0.92; drawAstro(); },
    lavaHit: lampGlass, toggleLava, setLava, lavaOn: () => lavaOn,
    blindsHit: blinds, toggleBlinds, setBlinds, blindsOpen: () => blindsState.open,
    edrumHits, pressEdrum, guitarHits, strumTele, guitarVoiceHits, setGuitarVoiceSwitch,
    addAccessory,
    // how much arcade you should hear from (x, z): 1 inside, a leak
    // through the open closet doorway, near-nothing across the bedroom
    arcadeZoneLevel: (x, z) => {
      if (x < -X - ALCOVE_D && x > AR.x0 && z > AR.z0 && z < AR.z1) return 1;
      if (x <= -X + 0.12 && x >= -X - ALCOVE_D && Math.abs(z - CZ) < OPEN_W) return 0.72;
      const leak = closet.open ? 1 : 0.22;   // doors do their job
      const d = Math.hypot(x + X, z - CZ);
      return Math.max(0, 0.4 - d * 0.085) * leak;
    },
    // the dimmer + the boat
    setRoomLight,
    dimmerHit: dimmerPlate,
    boatExitHit: boatDoor,
    volcaHit: volcaFace, pressVolcaPad,
    bottleHit,
    // THE CREW arena
    arenaInfo: ARENA,
    arenaSpawnFor, arenaClamp, arenaNearWall,
    grabHandles, kiosks, arenaExits,
    arenaGoalX: GOAL_X, arenaBubbleR: BUBBLE_R,
    setTubeBarriers, inTube,
    arcadeReturn: { x: -4.8, z: -0.4, yaw: Math.PI },
    pool, darts, hoops,
    discGroup, discHit, setArenaScore,
    echoPoster,
    updateScores,
    setParallax,
    boatSpawn: { x: BOAT.x, z: BOAT.z + 0.4, yaw: 0 },
    bathroomSpawn: { x: -1.85, z: -2.1, yaw: -Math.PI / 2 },
    inBoat: (x) => x > 30,
    // THE CLUB (the dj bar — name pending)
    clubInfo: CLUB,
    clubSpawn: { x: CLUB.x + 2.6, z: CLUB.z + 3.6, yaw: 0.35 },
    clubExitHit: clubDoor,
    deckHits, setOnAir, setBoothHeadcount, setClubEnergy,
    clubWindowHit: glassClick, clubFireworks, clubFog,
    cycleClubTheme, clubThemeName,
    setClubTheme: (ix) => applyClubTheme(ix), clubThemeIndex: () => themeIx,
    inClub: (x) => x < -30,
    dmTargets: [monScreen, monBezel, mac],
    // where the cat likes to be
    catSpots: {
      chair: { x: SWEET.x, z: SWEET.z, y: 0.51 },
      keys: { x1: -0.24, x2: 0.62, z: -2.45, y: 0.53 },
      windowFloor: { x: -1.7, z: -2.7 },
      foodBowl: { x: 2.12, z: 0.75 },
      waterBowl: { x: 2.12, z: 1.08 },
      litter: { x: -2.1, z: 2.8 },
      bounds: ROOM.bounds,
    },
  };
}
