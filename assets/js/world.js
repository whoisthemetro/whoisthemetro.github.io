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
import { rand } from "./util.js";
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

// One non-repeating carpet for the whole floor, so stains and the worn
// walk path land in real places instead of tiling.
function floorTexture() {
  return canvasTex(800, 1024, (g, w, h) => {
    // (canvas x → room x, canvas y → room z, top = front wall)
    const px = (rx) => ((rx + 2.6) / 5.2) * w;
    const pz = (rz) => ((rz + 3.3) / 6.6) * h;

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
    // vacuum tracks
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? "rgba(255,250,240,0.025)" : "rgba(0,0,0,0.03)";
      g.fillRect((i * 140 + 30) % w, 0, 60, h);
    }

    const blotch = (cx, cy, r, color, alpha, n = 7) => {
      for (let i = 0; i < n; i++) {
        g.fillStyle = `rgba(${color},${alpha * (0.5 + Math.random() * 0.5)})`;
        g.beginPath();
        g.ellipse(cx + (Math.random() - 0.5) * r, cy + (Math.random() - 0.5) * r,
          r * (0.4 + Math.random() * 0.5), r * (0.3 + Math.random() * 0.45),
          Math.random() * 3, 0, 7);
        g.fill();
      }
    };
    // worn traffic path: entry door → middle of the room → desk
    for (let t = 0; t <= 1; t += 0.04) {
      const x = px(1.9 - t * 1.6);
      const y = pz(2.2 - t * 4.2);
      blotch(x, y, 36, "40,34,26", 0.04, 3);
    }
    // coffee by the chair, something spilled near the rack, an old big one
    blotch(px(0.95), pz(-1.9), 22, "62,42,22", 0.16);
    blotch(px(1.05), pz(-1.75), 9, "52,32,16", 0.22, 4);
    blotch(px(1.7), pz(-2.3), 26, "48,40,30", 0.12);
    blotch(px(-0.9), pz(0.6), 55, "55,48,38", 0.07);
    blotch(px(-1.9), pz(-1.5), 18, "60,50,34", 0.1);   // by the closet
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
  teleBody.userData.guitar = true;
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
  guard.userData.guitar = true;
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
  tele.add(fretboard);
  for (const sx of [-0.012, 0, 0.012]) {
    const str = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.74, 0.0022),
      new THREE.MeshBasicMaterial({ color: 0xd9dde2 }));
    str.position.set(sx, 0.26, 0.052);
    tele.add(str);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 0.012),
    new THREE.MeshStandardMaterial({ color: 0xb9bec6, metalness: 0.8, roughness: 0.35 }));
  bridge.position.set(0.02, -0.12, 0.052);
  tele.add(bridge);
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
  guitarHits.push(teleBody, guard, neck);
  blockers.push(teleBody);
  let teleWiggle = 0;
  function strumTele() { teleWiggle = 1; }
  function tickTele(dt) {
    if (teleWiggle <= 0) return;
    teleWiggle = Math.max(0, teleWiggle - dt * 2.4);
    tele.rotation.z = Math.sin(teleWiggle * 22) * 0.02 * teleWiggle;
  }

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

  /* --- METRO'S ARCADE: the room beyond the closet --- */
  // a proper room: ~4.7 x 5.0 m, doorway aligned with the closet opening
  const AR = { x0: -8.2, x1: -X - ALCOVE_D, z0: -2.9, z1: 2.1 };
  // double-sided: these walls must be solid from BOTH sides, or you can
  // see straight through them from inside the arcade
  const arcMatWall = new THREE.MeshLambertMaterial({ color: 0x191722, side: THREE.DoubleSide });
  const arcW = AR.x1 - AR.x0, arcD = AR.z1 - AR.z0;
  // front wall (two segments + lintel around the doorway)
  for (const [w0, w1] of [[AR.z0, CZ - OPEN_W / 2], [CZ + OPEN_W / 2, AR.z1]]) {
    const seg = plane(w1 - w0, H, arcMatWall.clone());
    seg.rotation.y = Math.PI / 2;
    seg.position.set(AR.x1, H / 2, (w0 + w1) / 2);
    add(seg);
  }
  const lintel = plane(OPEN_W, H - OPEN_H, arcMatWall.clone());
  lintel.rotation.y = Math.PI / 2;
  lintel.position.set(AR.x1, OPEN_H + (H - OPEN_H) / 2, CZ);
  add(lintel);
  // back, sides, ceiling
  const arcBack = plane(arcD, H, arcMatWall.clone());
  arcBack.rotation.y = -Math.PI / 2;
  arcBack.position.set(AR.x0, H / 2, (AR.z0 + AR.z1) / 2);
  add(arcBack);
  for (const [zz, ry] of [[AR.z0, 0], [AR.z1, Math.PI]]) {
    const side = plane(arcW, H, arcMatWall.clone());
    side.rotation.y = ry;
    side.position.set((AR.x0 + AR.x1) / 2, H / 2, zz);
    add(side);
  }
  const arcCeil = plane(arcW, arcD, lam(0x0e0d14));
  arcCeil.rotation.x = Math.PI / 2;
  arcCeil.position.set((AR.x0 + AR.x1) / 2, H, (AR.z0 + AR.z1) / 2);
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
  // neon trim + mood lights
  for (const [zz, col] of [[AR.z0 + 0.02, 0xff2da0], [AR.z1 - 0.02, 0x22d4ff]]) {
    const strip = box(arcW - 0.2, 0.02, 0.02, new THREE.MeshBasicMaterial({ color: col }));
    strip.position.set((AR.x0 + AR.x1) / 2, 2.3, zz);
    add(strip);
  }
  const magenta = add(new THREE.PointLight(0xff2da0, 11, 3.4, 2));
  magenta.position.set(-6.2, 2.2, -2.3);
  const cyan = add(new THREE.PointLight(0x22d4ff, 11, 3.4, 2));
  cyan.position.set(-6.2, 2.2, 1.6);
  // cool ceiling wash so the room reads — throws too short to leak out
  for (const [fx2, fd] of [[-7.3, 2.8], [-5.8, 2.6], [-4.7, 2.0]]) {
    const fill2 = add(new THREE.PointLight(0x9aa4c8, 16, fd, 2));
    fill2.position.set(fx2, 2.4, -0.4);
  }

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
    fix.position.set(AR.x1 - 0.6, H - 0.03, z);
    add(fix);
    const fixGlow = new THREE.Mesh(new THREE.CircleGeometry(0.04, 10),
      new THREE.MeshBasicMaterial({ color: 0xffc890 }));
    fixGlow.rotation.x = Math.PI / 2;
    fixGlow.position.set(AR.x1 - 0.6, H - 0.065, z);
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

  // "METRO'S ARCADE" — neon on the arcade's back wall, and a small
  // sign over the closet in the bedroom
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
  arcSign.position.set(AR.x0 + 0.02, 2.25, (AR.z0 + AR.z1) / 2);
  add(arcSign);
  const arcSign2 = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.18), new THREE.MeshBasicMaterial({
    map: arcSignTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  arcSign2.rotation.y = Math.PI / 2;
  arcSign2.position.set(-X + 0.04, 2.32, CZ);
  add(arcSign2);

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
  // the four machines along the back wall, facing the door
  cabinet("defender", "DEFENDER", "#ff3434", AR.x0 + 0.42, -2.0, Math.PI / 2);
  cabinet("doom", "DOOM", "#ff7320", AR.x0 + 0.42, -0.85, Math.PI / 2);
  cabinet("tron", "TRON", "#22d4ff", AR.x0 + 0.42, 0.3, Math.PI / 2);
  cabinet("pong", "PONG", "#e8e8e8", AR.x0 + 0.42, 1.45, Math.PI / 2);

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
  scoreBoard.position.set(-5.6, 1.55, AR.z1 - 0.05);
  add(scoreBoard);

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
  function toggleLava() {
    lavaOn = !lavaOn;
    lavaLight.intensity = lavaOn ? 0.85 : 0;
    blobMat.color.set(lavaOn ? 0xff8a3c : 0x5a2c16);
    lampGlass.material.opacity = lavaOn ? 0.34 : 0.18;
    return lavaOn;
  }
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
      g.position.set((AR.x0 + AR.x1) / 2, H - 0.32, (AR.z0 + AR.z1) / 2);
      add(g);
      accessorySpin.push(ball);
    } else if (id === "trophy") {
      const g = new THREE.Group();
      const gold = new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: 0.75, roughness: 0.35 });
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.05, 9), gold);
      cup.position.y = 0.085;
      g.add(cup);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.04, 7), gold);
      stem.position.y = 0.04;
      g.add(stem);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.018, 9), lam(0x2a2118));
      foot.position.y = 0.01;
      g.add(foot);
      for (const s of [-1, 1]) {
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 5, 10), gold);
        handle.position.set(s * 0.038, 0.09, 0);
        g.add(handle);
      }
      g.position.set(0.18, 0.68, -0.1);
      rack.add(g);
    }
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

  function tick(dt, ppos) {
    elapsed += dt;
    tickEdrums(dt);
    tickTele(dt);
    tickChair(dt, ppos);
    tickPuffs(dt, ppos);

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
    lavaHit: lampGlass, toggleLava,
    blindsHit: blinds, toggleBlinds, setBlinds,
    edrumHits, pressEdrum, guitarHits, strumTele,
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
    arcadeReturn: { x: -4.6, z: 0.6, yaw: Math.PI },
    discGroup, discHit, setArenaScore,
    echoPoster,
    updateScores,
    setParallax,
    boatSpawn: { x: BOAT.x, z: BOAT.z + 0.4, yaw: 0 },
    bathroomSpawn: { x: -1.85, z: -2.1, yaw: -Math.PI / 2 },
    inBoat: (x) => x > 30,
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
