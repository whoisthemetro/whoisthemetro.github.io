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
import { SHADER_ART, KUKO_A, KUKO_B, KUKO_IMAGE } from "./shaderart.js";
import { createGraffiti } from "./graffiti.js";
import { buildRoom as buildStudioRoom } from "./studio/room.js";

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
  for (let i = 0; i < 26; i++) far.push({ x: i * 30 - 12, w: 20 + r(i) * 20, h: 12 + r(i + 50) * 16, s: r(i + 80) });
  const heights = [78, 64, 96, 58, 110, 72, 122, 66, 88, 96, 54];
  const dt = [];
  let x = 340;
  heights.forEach((h, i) => {
    const b = { x, w: 24 + r(i + 9) * 16, h, i, win: [] };
    for (let k = 0; k < (b.h * b.w) / 48; k++) {
      b.win.push([r(b.i * 7 + k) * b.w * 0.8 + b.w * 0.1, r(b.i * 13 + k * 3) * b.h * 0.85 + 4, r(k + b.i)]);
    }
    // how much of the west wall shows (perspective), plus rooftop
    // mechanicals — the stuff that makes a silhouette read as a box
    b.d = 0.05 + r(i + 70) * 0.04;
    b.mech = r(i + 90) > 0.35 ? { x: r(i + 91) * 0.6 + 0.1, w: 5 + r(i + 92) * 7, h: 3 + r(i + 93) * 4 } : null;
    dt.push(b);
    x += b.w + 4 + r(i + 30) * 12;
  });
  // the san gabriels — two ridgelines from the same seeded noise so they
  // never flicker between redraws. one proud peak sits east of downtown.
  const ridge = (seed, amp, bump) => {
    const pts = [];
    for (let i = 0; i <= 36; i++) {
      const t = i / 36;
      const n = Math.abs(Math.sin(t * 7.3 + seed)) * 0.55
        + Math.abs(Math.sin(t * 17.7 + seed * 3.1)) * 0.3
        + r(i + seed * 40) * 0.15;
      const baldy = bump * Math.exp(-((t - 0.62) ** 2) / 0.012);
      pts.push([t * 720, (n + baldy) * amp]);
    }
    return pts;
  };
  // wide variants for the layered sky: the same seeded shapes continued
  // across double the width, so no seam and no flicker between redraws
  const ridgeW = (seed, amp, bump) => {
    const pts = [];
    for (let i = 0; i <= 72; i++) {
      const t = i / 72;
      const n = Math.abs(Math.sin(t * 14.6 + seed)) * 0.55
        + Math.abs(Math.sin(t * 35.4 + seed * 3.1)) * 0.3
        + r(i + seed * 40) * 0.15;
      const baldy = bump * Math.exp(-((t - 0.56) ** 2) / 0.003);
      pts.push([t * 1440, (n + baldy) * amp]);
    }
    return pts;
  };
  const farW = [];
  for (let i = 0; i < 52; i++) farW.push({ x: i * 30 - 12, w: 20 + r(i) * 20, h: 12 + r(i + 50) * 16, s: r(i + 80) });
  return {
    far, farW, dt, mtsFar: ridge(3, 52, 0), mts: ridge(7, 88, 0.5),
    mtsFarW: ridgeW(3, 52, 0), mtsW: ridgeW(7, 88, 0.5),
    wilshire: dt.find(b => b.h === 122), usbank: dt.find(b => b.h === 110),
  };
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

/* ---------------- the world outside the window ----------------
   Not a backdrop: a place. Everything out there is a CYLINDER centred
   on the room — and a cylinder has no left edge and no right edge, so
   walking to the side of the window can never run out of world. That
   was the whole problem with flat sheets: press your face to the glass,
   look hard left, and you found the end of Los Angeles.

   Depth comes from real distance. Sky at 112 m, mountains at 103, a
   drifting haze band at 96, the painted city at 88 — and in front of
   all of it, actual geometry: a street 14 m below with traffic on it,
   and blocks of real buildings from 18 to 70 m out. The near stuff is
   what your eyes read as depth when you move; the rings are what make
   the horizon endless.

   Everything is unlit MeshBasic with fog off: the room's fog dies at
   40 m and the toon pass only rewrites Lambert/Standard, so the city
   keeps its own painted light.                                       */

const OUT_ARC = 210;                 // degrees of horizon we paint (view can only reach ±90)
const OUT_EYE = 1.6;                 // the height everything is composed for
const OUT_GROUND = -9;               // street level: three storeys down, so the
                                     // traffic clears the window sill

// azimuth: 0 = due south (out the window), positive = west (+x)
const azToU = (az) => 0.5 + az / OUT_ARC;
const altY = (r, deg) => OUT_EYE + r * Math.tan(deg * Math.PI / 180);

function makeOutside() {
  const group = new THREE.Group();
  group.userData.outside = true;   // so room-culling and tests can tell it apart
  const rnd = (i) => (Math.abs(Math.sin(i * 127.1) * 43758.5453) % 1);

  /* ---- a ring you stand inside ---- */
  function mkRing(r, cw, ch, altTop, altBot, order, opts = {}) {
    const arcDeg = opts.arc || OUT_ARC;
    const c = document.createElement("canvas");
    c.width = cw; c.height = ch;
    const g = c.getContext("2d");
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    // the arc is built west-to-east, the canvas reads east-to-west, so the
    // texture is mirrored once here instead of everywhere else
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.x = -1;
    tex.offset.x = 1;
    const yTop = altY(r, altTop), yBot = altY(r, altBot);
    const arc = arcDeg * Math.PI / 180;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, yTop - yBot, 72, 1, true, Math.PI - arc / 2, arc),
      new THREE.MeshBasicMaterial({
        map: tex, side: THREE.BackSide, fog: false,
        transparent: !opts.opaque, depthWrite: !!opts.opaque,
      }));
    mesh.position.y = (yTop + yBot) / 2;
    mesh.renderOrder = order;
    group.add(mesh);
    // world-y <-> canvas-row, so a ring can be painted in METRES
    const rowOf = (y) => (yTop - y) / (yTop - yBot) * ch;
    return { g, tex, mesh, cw, ch, r, arcDeg, rowOf,
             xOf: (az) => (0.5 + az / arcDeg) * cw };
  }

  const Rsky = mkRing(112, 2048, 512, 44, -14, -20, { opaque: true });
  const Rmts = mkRing(103, 2048, 640, 36, -20, -18);   // tall: a real range clears the rooftops
  const Rhaze = mkRing(96, 1024, 256, 10, -10, -16);
  const Rcity = mkRing(88, 3072, 640, 20, -26, -14);
  // the two fx rings keep the ORIGINAL 720×280 art coordinates — so every
  // easter egg (jet, kaiju, bat-signal) draws exactly as it always did —
  // which means their arc has to match what that art assumed, not the wide
  // arc the scenery rings use, or a beacon comes out an ellipse
  const FX_AZ = 46;
  const Rzilla = mkRing(90, 720, 280, 16, -16, -15, { arc: FX_AZ * 2 });   // behind the towers
  const Rfx = mkRing(86, 720, 280, 16, -16, -12, { arc: FX_AZ * 2 });      // jet, bat, sun, moon

  // a scratch pad for the moon: the crescent is cut out of a disc here so
  // the erase can't touch the jet or the bat signal on the fx layer
  const moonCv = document.createElement("canvas");
  moonCv.width = moonCv.height = 64;

  /* ---- stars, spread over the whole painted arc ---- */
  const stars = Array.from({ length: 260 }, () => [
    Math.random() * 2048, Math.random() * 300, Math.random(),
    0.8 + Math.random() * 2.4, Math.random() * Math.PI * 2,
  ]);

  function place(az, alt) {
    const azd = az / (Math.PI / 180), altd = alt / (Math.PI / 180);
    if (Math.abs(azd) > 55 || altd < -2 || altd > 60) return null;
    return { x: 360 + (azd / 55) * 340, y: 250 - (altd / 60) * 235 };
  }

  function palette(sunAlt) {
    let top, mid, bot, mtn;
    if (sunAlt > 5)        { top = "#7fb2e0"; mid = "#a2c6e4"; bot = "#c8dcec"; mtn = "96,112,138"; }
    else if (sunAlt > -6)  { top = "#2a3c5e"; mid = "#6b5670"; bot = "#d88a52"; mtn = "56,52,76"; }
    else if (sunAlt > -12) { top = "#141d33"; mid = "#232744"; bot = "#3a3550"; mtn = "22,26,46"; }
    // night leans teal, not warm — after dark the city goes tron, and the
    // haze/marine-layer colour everything shares comes from `bot`, so one
    // value here tints the whole grid
    else                   { top = "#050b18"; mid = "#0a1424"; bot = "#0f2a35"; mtn = "4,9,18"; }
    const botRGB = [parseInt(bot.slice(1, 3), 16), parseInt(bot.slice(3, 5), 16), parseInt(bot.slice(5, 7), 16)];
    return { top, mid, bot, mtn, botRGB, night: sunAlt < -4, sunAlt };
  }

  /* ================= the sky ================= */
  function paintSky(pal, wx) {
    const { g, cw, ch } = Rsky;
    const horizon = Rsky.rowOf(altY(Rsky.r, 0));
    const grad = g.createLinearGradient(0, 0, 0, horizon);
    grad.addColorStop(0, pal.top); grad.addColorStop(0.55, pal.mid); grad.addColorStop(1, pal.bot);
    g.fillStyle = grad;
    g.fillRect(0, 0, cw, ch);
    if (pal.sunAlt < -8 && wx.clouds < 0.55) {
      const tw = Date.now() / 1000;
      for (const [x, y, r, sp, ph] of stars) {
        const s = 0.5 + 0.5 * Math.sin(tw * sp + ph);
        const wink = 0.35 + 0.8 * s * s;
        const a = Math.min(1, (0.3 + r * 0.55) * wink) * (1 - wx.clouds);
        g.fillStyle = r > 0.92 ? `rgba(205,222,255,${a})`
          : r < 0.08 ? `rgba(255,235,205,${a})` : `rgba(255,255,255,${a})`;
        g.fillRect(x, y, r > 0.8 ? 2.4 : 1.6, r > 0.8 ? 2.4 : 1.6);
      }
    }
    if (wx.clouds > 0.1) {
      const dark = pal.sunAlt > 0 ? 225 : 38;
      for (let i = 0; i < wx.clouds * 30; i++) {
        g.fillStyle = `rgba(${dark},${dark},${dark + 6},${0.10 + wx.clouds * 0.16})`;
        g.beginPath();
        g.ellipse((i * 271) % cw, 40 + ((i * 91) % 240), 130 + (i * 37) % 90, 26 + (i * 13) % 18, 0, 0, 7);
        g.fill();
      }
    }
    if (wx.fog) { g.fillStyle = "rgba(150,155,160,0.45)"; g.fillRect(0, 0, cw, ch); }
    // the last hand's width above the horizon always belongs to the haze
    const [br, bg2, bb] = pal.botRGB;
    const hz = g.createLinearGradient(0, horizon - 60, 0, horizon + 10);
    hz.addColorStop(0, `rgba(${br},${bg2},${bb},0)`);
    hz.addColorStop(1, `rgba(${br},${bg2},${bb},0.85)`);
    g.fillStyle = hz;
    g.fillRect(0, horizon - 60, cw, 74);
    g.fillStyle = `rgb(${br},${bg2},${bb})`;
    g.fillRect(0, horizon + 8, cw, ch - horizon);
    Rsky.tex.needsUpdate = true;
  }

  /* ================= mountains, with a sign on them ================= */
  function ridgeAt(seed, amp, t) {
    return (Math.abs(Math.sin(t * 9.1 + seed)) * 0.55
      + Math.abs(Math.sin(t * 23.3 + seed * 3.1)) * 0.3
      + Math.abs(Math.sin(t * 51.7 + seed * 7.7)) * 0.15) * amp;
  }
  function paintMountains(pal) {
    const { g, cw, ch } = Rmts;
    g.clearRect(0, 0, cw, ch);
    const base = Rmts.rowOf(OUT_GROUND);
    const drawRidge = (seed, amp, a) => {
      g.fillStyle = `rgba(${pal.mtn},${a})`;
      g.beginPath();
      g.moveTo(-4, ch);
      for (let x = 0; x <= cw; x += 8) {
        const t = x / cw;
        g.lineTo(x, base - ridgeAt(seed, amp, t) - amp * 0.15);
      }
      g.lineTo(cw + 4, ch);
      g.closePath(); g.fill();
    };
    drawRidge(3, Rmts.rowOf(OUT_GROUND) - Rmts.rowOf(OUT_GROUND + 46), 0.45);
    drawRidge(7, Rmts.rowOf(OUT_GROUND) - Rmts.rowOf(OUT_GROUND + 74), 0.7);

    /* --- METROWORLD, up on the slope in neon. by day the tubes are off,
       pale glass on a dark board; after dark the sign is LIT — painted
       bloom, a wide soft halo under a hot core, magenta so it belongs to
       neither of the grid's two currents. each letter still leans its own
       way, because it's a sign on a hillside, not a logo on a screen. --- */
    {
      const az = 34;                                  // west of downtown
      const cx = Rmts.xOf(az);
      const yTopM = OUT_GROUND + 44;                  // high on the slope, clear of every roof
      const y = Rmts.rowOf(yTopM);
      const letterH = Rmts.rowOf(OUT_GROUND) - Rmts.rowOf(OUT_GROUND + 4.5);
      const letters = "METROWORLD";
      const step = letterH * 0.82;
      g.save();
      g.translate(cx - (letters.length * step) / 2, y);
      // the dark board the tubes are mounted on
      g.fillStyle = `rgba(${pal.mtn},0.35)`;
      g.beginPath();
      g.moveTo(-step, letterH * 1.5);
      g.lineTo(letters.length * step + step, letterH * 0.7);
      g.lineTo(letters.length * step + step, letterH * 3);
      g.lineTo(-step, letterH * 3);
      g.closePath(); g.fill();
      g.font = `700 ${letterH}px Archivo, sans-serif`;
      g.textAlign = "center"; g.textBaseline = "middle";
      for (let i = 0; i < letters.length; i++) {
        const lx = i * step + step * 0.5;
        const ly = letterH * 0.55 + (i / letters.length) * letterH * 0.55;   // the slope
        g.save();
        g.translate(lx, ly);
        g.rotate((rnd(i * 3 + 1) - 0.5) * 0.14);      // each letter its own lean
        if (pal.night) {
          g.shadowColor = "#ff3db0";
          g.shadowBlur = letterH * 0.9;
          g.fillStyle = "rgba(255,61,176,0.85)";
          g.fillText(letters[i], 0, 0);
          g.fillText(letters[i], 0, 0);               // twice: the halo builds up
          g.shadowBlur = 0;
          g.fillStyle = "#ffd9ef";                    // the tube itself, near-white hot
          g.fillText(letters[i], 0, 0);
        } else {
          g.fillStyle = "rgba(216,176,200,0.8)";      // tubes off: pale pink glass
          g.fillText(letters[i], 0, 0);
        }
        g.restore();
      }
      g.restore();
    }

    // feet in the marine layer
    const [br, bg2, bb] = pal.botRGB;
    const mfog = g.createLinearGradient(0, base - 120, 0, base + 30);
    mfog.addColorStop(0, `rgba(${br},${bg2},${bb},0)`);
    mfog.addColorStop(1, `rgba(${br},${bg2},${bb},0.9)`);
    g.fillStyle = mfog;
    g.fillRect(0, base - 120, cw, 155);
    g.fillStyle = `rgb(${br},${bg2},${bb})`;
    g.fillRect(0, base + 25, cw, ch - base);
    Rmts.tex.needsUpdate = true;
  }

  /* ================= the drifting haze band ================= */
  function paintHaze(pal) {
    const { g, cw, ch } = Rhaze;
    const [br, bg2, bb] = pal.botRGB;
    g.clearRect(0, 0, cw, ch);
    const band = g.createLinearGradient(0, ch * 0.30, 0, ch * 0.86);
    band.addColorStop(0, `rgba(${br},${bg2},${bb},0)`);
    band.addColorStop(0.45, `rgba(${br},${bg2},${bb},0.34)`);
    band.addColorStop(1, `rgba(${br},${bg2},${bb},0)`);
    g.fillStyle = band;
    g.fillRect(0, ch * 0.30, cw, ch * 0.56);
    for (let i = 0; i < 16; i++) {
      g.fillStyle = `rgba(${br},${bg2},${bb},0.09)`;
      g.beginPath();
      g.ellipse((i * 67.3) % cw, ch * 0.5 + ((i * 29) % 40) - 20, 90 + (i * 23) % 70, 16 + (i * 7) % 12, 0, 0, 7);
      g.fill();
    }
    Rhaze.tex.needsUpdate = true;
  }

  /* ================= the painted city, out past the real blocks =========
     built in METRES: every building stands on the street at OUT_GROUND
     and rises, so the ring agrees with the real geometry in front of it. */
  let WILSHIRE = null;
  const SKYLINE = (() => {
    const b = [];
    // the ordinary city, all the way round the arc
    for (let i = 0; i < 210; i++) {
      const az = -OUT_ARC / 2 + (i + rnd(i) * 0.6) * (OUT_ARC / 210);
      b.push({ az, w: 0.55 + rnd(i + 7) * 1.3, h: 4 + rnd(i + 21) * 9, s: rnd(i + 40), far: true });
    }
    // downtown: a cluster with two of them you can name
    const dt = [16, 13, 21, 12, 26, 15, 31, 13, 19, 22, 11];
    let az = -13;
    dt.forEach((h, i) => {
      const w = 1.5 + rnd(i + 9) * 1.1;
      const rec = { az: az + w / 2, w, h, s: rnd(i + 60), i,
                    wilshire: h === 31, usbank: h === 26,
                    mech: rnd(i + 90) > 0.4 };
      if (rec.wilshire) WILSHIRE = rec;
      b.push(rec);
      az += w + 0.5 + rnd(i + 30) * 1.1;
    });
    return b;
  })();

  function paintCity(pal) {
    const { g, cw, ch } = Rcity;
    g.clearRect(0, 0, cw, ch);
    const base = Rcity.rowOf(OUT_GROUND);
    const night = pal.night;
    if (night) {
      // the towers stand in teal light; the streets under them stay warm.
      // that split is the whole reference image: cyan city, amber ground.
      const glow = g.createLinearGradient(0, base - 260, 0, base);
      glow.addColorStop(0, "rgba(40,180,235,0)");
      glow.addColorStop(1, "rgba(40,180,235,0.34)");
      g.fillStyle = glow;
      g.fillRect(0, base - 260, cw, 260);
      const warm = g.createLinearGradient(0, base - 70, 0, base);
      warm.addColorStop(0, "rgba(255,140,60,0)");
      warm.addColorStop(1, "rgba(255,140,60,0.3)");
      g.fillStyle = warm;
      g.fillRect(0, base - 70, cw, 70);
    }
    const degPx = cw / OUT_ARC;
    for (const b of SKYLINE) {
      const x = Rcity.xOf(b.az) - (b.w * degPx) / 2;
      const w = b.w * degPx;
      const top = Rcity.rowOf(OUT_GROUND + b.h);
      if (b.far) {
        g.fillStyle = night
          ? `rgb(${9 + b.s * 9 | 0},${11 + b.s * 9 | 0},${17 + b.s * 11 | 0})`
          : `rgba(95,105,120,${0.5 + b.s * 0.32})`;
        g.fillRect(x, top, w, base - top);
        if (night && b.s > 0.45) {
          for (let k = 0; k < b.h * 0.7; k++) {
            const wr = rnd(k + b.s * 90);
            if (wr < 0.4) continue;
            g.fillStyle = wr > 0.72 ? "rgba(90,210,255,0.55)" : "rgba(255,190,120,0.4)";
            g.fillRect(x + 2 + (rnd(k) * (w - 6)), top + 6 + k * 7, 2, 3);
          }
          // a lit rim on the taller stock, so the whole horizon carries the grid
          if (b.s > 0.72) {
            g.fillStyle = "rgba(53,215,255,0.18)"; g.fillRect(x - 1, top - 2, w + 2, 4);
            g.fillStyle = "rgba(150,235,255,0.8)"; g.fillRect(x, top, w, 1.2);
          }
        }
        continue;
      }
      // downtown gets corners: a lit face and a wall receding out of frame
      const side = Math.min(w * 0.28, 16);
      g.fillStyle = night ? "#141828" : "rgba(50,58,72,0.94)";
      g.fillRect(x - side, top + 8, side, base - top - 8);
      g.fillStyle = night ? "#0c0e16" : "rgba(70,80,95,0.94)";
      if (b.wilshire) {
        g.beginPath();
        g.moveTo(x, base); g.lineTo(x, top + 22);
        g.lineTo(x + w, top); g.lineTo(x + w, base);
        g.closePath(); g.fill();
      } else {
        g.fillRect(x, top, w, base - top);
        if (b.usbank) {
          g.fillRect(x + w / 2 - 3, top - 26, 6, 26);
          g.fillRect(x + 7, top - 8, w - 14, 8);
        } else if (b.mech) {
          g.fillRect(x + w * 0.22, top - 14, w * 0.4, 14);
        }
      }
      g.fillStyle = night ? "rgba(80,220,255,0.45)" : "rgba(235,242,250,0.38)";
      g.fillRect(x, top + (b.wilshire ? 22 : 0), 2, base - top);
      if (night) {
        // downtown wears the neon: every crown gets a painted-bloom edge —
        // a wide soft band with a thin hot core inside it, the same
        // two-coat trick the room's additive glows use — cyan for most,
        // amber for a few so the skyline isn't one flat colour
        const amber = rnd(b.i * 7 + 2) < 0.25;
        const rim = amber ? "255,150,60" : "53,215,255";
        const ty = top + (b.wilshire ? 11 : 0);
        g.fillStyle = `rgba(${rim},0.18)`; g.fillRect(x - 2, ty - 4, w + 4, 8);
        g.fillStyle = `rgba(${rim},0.95)`; g.fillRect(x - 1, ty - 0.8, w + 2, 1.6);
        for (let row = 0; row < (base - top) / 9; row++) {
          for (let col = 0; col < w / 8; col++) {
            const rr = rnd(row * 31 + col * 7 + b.i * 13);
            if (rr > 0.52) continue;
            g.fillStyle = rr < 0.3 ? `rgba(90,210,255,${0.45 + rr})`
              : `rgba(255,${170 + (rr * 60) | 0},110,${0.35 + rr * 0.4})`;
            g.fillRect(x + 3 + col * 8, top + 7 + row * 9, 3.5, 4.5);
          }
        }
      } else {
        g.fillStyle = "rgba(30,38,52,0.15)";
        for (let mx = x + 4; mx < x + w - 3; mx += 8) g.fillRect(mx, top + 6, 3, base - top - 10);
      }
    }
    // the ground the painted city stands on
    g.fillStyle = night ? "#080a10" : "rgba(96,104,116,0.95)";
    g.fillRect(0, base, cw, ch - base);
    if (night) {
      g.fillStyle = "rgba(255,150,70,0.12)";
      g.fillRect(0, base, cw, 16);
    }
    // and its own smog, so the bases go soft
    const [br, bg2, bb] = pal.botRGB;
    if (pal.sunAlt > -6) {
      const haze = g.createLinearGradient(0, base - 90, 0, base);
      haze.addColorStop(0, `rgba(${br},${bg2},${bb},0)`);
      haze.addColorStop(1, `rgba(${br},${bg2},${bb},0.4)`);
      g.fillStyle = haze;
      g.fillRect(0, base - 90, cw, 90);
    }
    Rcity.tex.needsUpdate = true;
  }

  /* ================= the city plan =================
     One grid, three tenants. The buildings, the painted streets and the
     traffic used to be three separate guesses — boxes scattered at random
     angles, a tiling texture whose roads matched nothing, lanes at offsets
     related to neither — and that disagreement is exactly what read as
     amateur. Everything below is derived from THIS plan, so the streets on
     the ground run between the buildings, and the cars drive on the streets.

     Avenues run north-south (out the window), streets east-west. The x=0
     avenue is a boulevard twice the width of everything else: it starts
     under the window and runs dead straight at the painted downtown, which
     hands the view its vanishing point — the reference image's shot. */
  const CITY = (() => {
    const AV = [-104, -78, -52, -26, 0, 26, 52, 78, 104];  // avenue centre-lines (x)
    const ST = [-16, -42, -68, -94];                       // street centre-lines (z)
    const half = (x) => (x === 0 ? 7 : 4);                 // road half-widths
    const FWZ = -68;                                       // the freeway rides this street
    const blocks = [];
    for (let i = 0; i < AV.length - 1; i++) {
      for (let j = 0; j < ST.length - 1; j++) {
        const x0 = AV[i] + half(AV[i]) + 1.5;              // sidewalks are the 1.5s
        const x1 = AV[i + 1] - half(AV[i + 1]) - 1.5;
        const zN = ST[j] - 5.5, zS = ST[j + 1] + 5.5;      // zN is the window side
        const cx = (x0 + x1) / 2, cz = (zN + zS) / 2;
        if (Math.hypot(cx, cz) > 98) continue;             // off the edge of the world
        blocks.push({ x0, x1, zN, zS, cx, cz, i, j,
                      park: AV[i] === 26 && ST[j] === -42 });
      }
    }
    return { AV, ST, half, FWZ, blocks };
  })();

  /* ================= the street, five storeys down ================= */
  /* One canvas over the whole disc — NOT a repeating tile. A tile can't
     agree with the geometry standing on it; this maps 1:1 onto the plan, so
     a road in the paint is a road between real buildings. 2048px over 220 m
     is ~9 px a metre: enough for a lane line, repainted twice a day. */
  const groundTex = (() => {
    const c = document.createElement("canvas");
    c.width = 2048; c.height = 2048;
    const g = c.getContext("2d");
    return { c, g, tex: new THREE.CanvasTexture(c) };
  })();
  groundTex.tex.colorSpace = THREE.SRGBColorSpace;
  const GROUND_R = 110;
  function paintGround(pal) {
    const { g } = groundTex;
    const night = pal.night;
    const S = 2048 / (GROUND_R * 2);               // px per metre
    const cx = (x) => (x + GROUND_R) * S;          // world x -> canvas col
    const rz = (z) => (z + GROUND_R) * S;          // world z -> canvas row

    // the ground everything else is cut into
    g.fillStyle = night ? "#0a0d13" : "#565b63";
    g.fillRect(0, 0, 2048, 2048);

    // blocks, each a shade its own, so the plan reads even from above
    for (const b of CITY.blocks) {
      const bs = rnd(b.i * 13 + b.j * 7);
      const X = cx(b.x0 - 1.5), Z = rz(b.zS - 1.5);
      const W = (b.x1 - b.x0 + 3) * S, H = (b.zN - b.zS + 3) * S;
      if (b.park) {
        g.fillStyle = night ? "#0b1610" : "#3f5c39";
        g.fillRect(X, Z, W, H);
        g.fillStyle = night ? "#101f15" : "#4d6f44";
        for (let t = 0; t < 22; t++) {
          g.beginPath();
          g.arc(X + 8 + rnd(t) * (W - 16), Z + 8 + rnd(t + 50) * (H - 16), 4 + rnd(t + 9) * 5, 0, 7);
          g.fill();
        }
        continue;
      }
      g.fillStyle = night
        ? `rgb(${13 + bs * 8 | 0},${15 + bs * 8 | 0},${20 + bs * 10 | 0})`
        : `rgb(${86 + bs * 24 | 0},${84 + bs * 22 | 0},${82 + bs * 20 | 0})`;
      g.fillRect(X, Z, W, H);
    }

    // the roads, exactly where the plan says they are
    g.fillStyle = night ? "#04060a" : "#3c4046";
    for (const x of CITY.AV) {
      const h = CITY.half(x);
      g.fillRect(cx(x - h), 0, 2 * h * S, 2048);
    }
    for (const z of CITY.ST) g.fillRect(0, rz(z - 4), 2048, 8 * S);
    // the boulevard keeps a planted median
    g.fillStyle = night ? "#0c1410" : "#46523f";
    g.fillRect(cx(-1.1), 0, 2.2 * S, rz(-10));

    if (!night) {
      // honest daytime markings: a dashed crown line per road, stop bars
      // and crosswalks where the boulevard meets a street
      g.strokeStyle = "rgba(250,246,225,0.5)";
      g.lineWidth = 2;
      g.setLineDash([12, 14]);
      for (const x of CITY.AV) {
        if (x === 0) continue;                    // the median owns that line
        g.beginPath(); g.moveTo(cx(x), 0); g.lineTo(cx(x), 2048); g.stroke();
      }
      for (const z of CITY.ST) {
        g.beginPath(); g.moveTo(0, rz(z)); g.lineTo(2048, rz(z)); g.stroke();
      }
      g.setLineDash([]);
      g.fillStyle = "rgba(250,246,225,0.55)";
      for (const z of CITY.ST) {
        for (let k = 0; k < 7; k++) {
          g.fillRect(cx(-6.4) + k * 2 * S, rz(z - 3.4), 1.2 * S, 0.7 * S);
          g.fillRect(cx(-6.4) + k * 2 * S, rz(z + 2.7), 1.2 * S, 0.7 * S);
        }
      }
    } else {
      /* After dark the plan itself is the circuit: avenue traces run cyan,
         street traces amber — two currents crossing at lit nodes — and the
         boulevard wears continuous edge light up both kerbs, which is what
         drags the eye down its length to the towers. Painted bloom
         throughout: a wide soft pass under a thin hot core. */
      const trace = (vert, m, rim, core, coreW = 2.4) => {
        g.strokeStyle = rim; g.lineWidth = 10;
        g.beginPath();
        if (vert) { g.moveTo(cx(m), 0); g.lineTo(cx(m), 2048); } else { g.moveTo(0, rz(m)); g.lineTo(2048, rz(m)); }
        g.stroke();
        g.strokeStyle = core; g.lineWidth = coreW;
        g.beginPath();
        if (vert) { g.moveTo(cx(m), 0); g.lineTo(cx(m), 2048); } else { g.moveTo(0, rz(m)); g.lineTo(2048, rz(m)); }
        g.stroke();
      };
      for (const x of CITY.AV) {
        if (x === 0) continue;
        trace(true, x, "rgba(48,190,255,0.10)", "rgba(120,225,255,0.5)");
      }
      for (const z of CITY.ST) trace(false, z, "rgba(255,140,50,0.10)", "rgba(255,190,110,0.45)");
      // the boulevard: kerb light both sides, amber dashes down the median
      for (const e of [-6.6, 6.6]) trace(true, e, "rgba(60,200,255,0.16)", "rgba(160,235,255,0.75)", 3);
      g.fillStyle = "rgba(255,170,80,0.6)";
      for (let z = -102; z < -12; z += 5) g.fillRect(cx(-0.35), rz(z), 0.7 * S, 2 * S);
      // nodes where the currents cross
      for (const x of CITY.AV) {
        for (const z of CITY.ST) {
          const warm = ((x + z) / 26 | 0) % 2 === 0;
          g.fillStyle = warm ? "rgba(255,160,70,0.15)" : "rgba(60,200,255,0.15)";
          g.fillRect(cx(x) - 6, rz(z) - 6, 12, 12);
          g.fillStyle = warm ? "rgba(255,214,150,0.8)" : "rgba(170,238,255,0.8)";
          g.fillRect(cx(x) - 1.6, rz(z) - 1.6, 3.2, 3.2);
        }
      }
      // faint service traces wandering into the blocks — seeded, so the
      // city doesn't rewire itself at every repaint
      g.lineWidth = 1.5;
      for (const b of CITY.blocks) {
        if (b.park) continue;
        for (let t = 0; t < 2; t++) {
          const bs = rnd(b.i * 17 + b.j * 5 + t * 3);
          const x0 = cx(b.x0 + 2 + bs * (b.x1 - b.x0 - 8));
          const y0 = rz(b.zS + 2 + rnd(bs * 90) * (b.zN - b.zS - 8));
          const L = (10 + rnd(bs * 7) * 18) * S / 9.3;
          g.strokeStyle = bs < 0.5 ? "rgba(60,200,255,0.12)" : "rgba(255,150,60,0.10)";
          g.beginPath();
          g.moveTo(x0, y0);
          if (bs < 0.5) { g.lineTo(x0 + L, y0); g.lineTo(x0 + L, y0 + L * 0.7); }
          else { g.lineTo(x0, y0 + L); g.lineTo(x0 + L * 0.7, y0); }
          g.stroke();
        }
      }
    }
    groundTex.tex.needsUpdate = true;
  }
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(GROUND_R, 64),
    new THREE.MeshBasicMaterial({ map: groundTex.tex, fog: false }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = OUT_GROUND;
  ground.renderOrder = -10;
  group.add(ground);

  /* ================= real blocks: the near buildings =================
     these are what your eyes actually read when you move — geometry at
     18-70 m, close enough that a step slides them against the ring. */
  // one tile of this texture means TEN METRES of wall, so the windows come
  // out about the size of windows
  const TILE_M = 7;
  const facadeTex = (night) => {
    const c = document.createElement("canvas");
    c.width = 96; c.height = 160;
    const g = c.getContext("2d");
    g.fillStyle = night ? "#0d1017" : "#6a7079";
    g.fillRect(0, 0, 96, 160);
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 6; col++) {
        const rr = (Math.abs(Math.sin((row * 31 + col * 7) * 12.9898) * 43758.5453) % 1);
        if (night) {
          if (rr > 0.42) continue;
          // the near facades sell the grid most, being nearest: cool-heavy
          // windows with a warm minority, matching the painted ring behind
          g.fillStyle = rr < 0.26 ? `rgba(110,220,255,${0.55 + rr})`
            : `rgba(255,${186 + (rr * 70) | 0},${110 + (rr * 60) | 0},${0.45 + rr * 0.5})`;
        } else {
          g.fillStyle = `rgba(${30 + rr * 24 | 0},${38 + rr * 26 | 0},${52 + rr * 30 | 0},0.6)`;
        }
        g.fillRect(col * 16 + 4, row * 16 + 4, 9, 9);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const facadeDay = facadeTex(false), facadeNight = facadeTex(true);
  const nearMat = new THREE.MeshBasicMaterial({ map: facadeDay, fog: false });
  const roofMat = new THREE.MeshBasicMaterial({ color: 0x2c313a, fog: false });
  const nearBlocks = new THREE.Group();
  group.add(nearBlocks);
  /* Baked into ONE mesh, and built from the CITY plan — every box sits in a
     block the plan drew, square to the grid, with the streets running
     between. No random rotations: a real city is aligned, and the aligned
     version is also the cheap version (~240 draw calls of scattered Meshes
     became two: walls + roofs, undersides never baked at all).

     Three block habits, seeded per block so the skyline is varied but
     deliberate: a full-block slab, a split pair with an alley, or a podium
     wearing a slimmer tower — the tiered silhouette real blocks have.
     Heights climb with distance from the glass, so the geometry stairs up
     toward the painted downtown at the boulevard's vanishing point instead
     of fighting it.

     Each building's outline goes into a second buffer as it's baked: four
     verticals and the roofline, cyan with the odd amber. One additive
     LineSegments, one draw call, night only. The elevated freeway threads
     the far street on stilts and gets amber running light up both edges. */
  let neonEdges = null;
  {
    const wallPos = [], wallUv = [], roofPos = [], edgePos = [], edgeCol = [];
    const cyan = new THREE.Color(0x35d7ff), amber = new THREE.Color(0xff8a30);
    const pushSeg = (ax, ay, az, bx, by, bz, c) => {
      edgePos.push(ax, ay, az, bx, by, bz);
      edgeCol.push(c.r, c.g, c.b, c.r, c.g, c.b);
    };
    // an axis-aligned box straight into the bake. flat boxes (the freeway)
    // put every face in the untextured group — a 0.7 m concrete deck in a
    // window-grid shirt would be a strange thing to drive on.
    const pushBox = (bx, bz, w, h, d, baseY, opts = {}) => {
      const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
      geo.translate(bx, baseY + h / 2, bz);
      const pos = geo.attributes.position, uv = geo.attributes.uv;
      for (const f of [0, 1, 4, 5]) {
        const wide = (f === 0 || f === 1) ? d : w;
        for (let k = 0; k < 6; k++) {
          const vi = f * 6 + k;
          if (opts.flat) { roofPos.push(pos.getX(vi), pos.getY(vi), pos.getZ(vi)); continue; }
          wallPos.push(pos.getX(vi), pos.getY(vi), pos.getZ(vi));
          wallUv.push(uv.getX(vi) * (wide / TILE_M), uv.getY(vi) * (h / TILE_M));
        }
      }
      for (const f of opts.under ? [2, 3] : [2]) {
        for (let k = 0; k < 6; k++) {
          const vi = f * 6 + k;
          roofPos.push(pos.getX(vi), pos.getY(vi), pos.getZ(vi));
        }
      }
      geo.dispose();
      if (opts.edges) {
        const col = opts.col, hw = w / 2 + 0.05, hd = d / 2 + 0.05;
        const y0 = baseY, y1 = baseY + h + 0.05;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          pushSeg(bx + sx * hw, y0, bz + sz * hd, bx + sx * hw, y1, bz + sz * hd, col);
        }
        pushSeg(bx - hw, y1, bz - hd, bx + hw, y1, bz - hd, col);
        pushSeg(bx + hw, y1, bz - hd, bx + hw, y1, bz + hd, col);
        pushSeg(bx + hw, y1, bz + hd, bx - hw, y1, bz + hd, col);
        pushSeg(bx - hw, y1, bz + hd, bx - hw, y1, bz - hd, col);
      }
    };
    // a building = a box in a block, with its lit outline
    const put = (x0, x1, zN, zS, h) => {
      const col = rnd((x0 * 7 + zS) | 0) < 0.2 ? amber : cyan;
      pushBox((x0 + x1) / 2, (zN + zS) / 2, x1 - x0, h, zN - zS, OUT_GROUND,
        { edges: true, col });
    };
    // heights per street band: low at the glass, climbing toward downtown,
    // capped so the painted towers behind still crown the view
    const bandH = [[5, 6], [8, 10], [12, 9]];
    for (const B of CITY.blocks) {
      if (B.park) continue;
      const s = rnd(B.i * 29 + B.j * 11);
      const bw = B.x1 - B.x0, bd = B.zN - B.zS;
      const central = B.j === 2 && Math.abs(B.cx) < 40 ? 3 + rnd(B.i) * 4 : 0;
      const [hb, hs] = bandH[B.j];
      const h1 = hb + rnd(B.i * 7 + B.j * 3) * hs + central;
      if (s < 0.38) {
        put(B.x0, B.x1, B.zN, B.zS, h1);
      } else if (s < 0.72) {
        const h2 = hb + rnd(B.i * 5 + B.j * 9) * hs + central * 0.6;
        if (bw > bd) {
          const mid = B.x0 + bw * (0.4 + s * 0.2);
          put(B.x0, mid - 1.5, B.zN, B.zS, h1);
          put(mid + 1.5, B.x1, B.zN, B.zS, h2);
        } else {
          const mid = B.zS + bd * (0.4 + s * 0.2);
          put(B.x0, B.x1, B.zN, mid + 1.5, h1);
          put(B.x0, B.x1, mid - 1.5, B.zS, h2);
        }
      } else {
        put(B.x0, B.x1, B.zN, B.zS, Math.max(3, h1 * 0.45));
        const inx = 2.5 + s * 2, inz = 2.5 + rnd(s * 40) * 2;
        put(B.x0 + inx, B.x1 - inx, B.zN - inz, B.zS + inz, h1 + 3);
      }
    }
    // the freeway: a concrete deck over the far street, pillars in its
    // median, running light along both parapets. its underside IS seen —
    // from the street beneath — so that face stays in the bake.
    const DECK_Y = OUT_GROUND + 7;
    pushBox(0, CITY.FWZ, 209, 0.7, 11, DECK_Y, { flat: true, under: true });
    for (const ax of CITY.AV) {
      pushBox(ax, CITY.FWZ, 1.4, 7, 1.4, OUT_GROUND, { flat: true });
      if (ax < 104) pushBox(ax + 13, CITY.FWZ, 1.4, 7, 1.4, OUT_GROUND, { flat: true });
    }
    const dt = DECK_Y + 0.74;
    pushSeg(-104.5, dt, CITY.FWZ - 5.5, 104.5, dt, CITY.FWZ - 5.5, amber);
    pushSeg(-104.5, dt, CITY.FWZ + 5.5, 104.5, dt, CITY.FWZ + 5.5, amber);

    const wallCount = wallPos.length / 3, roofCount = roofPos.length / 3;
    const P = new Float32Array(wallPos.length + roofPos.length);
    P.set(wallPos, 0); P.set(roofPos, wallPos.length);
    const U = new Float32Array((wallCount + roofCount) * 2);   // roof uvs stay zero
    U.set(wallUv, 0);
    const merged = new THREE.BufferGeometry();
    merged.setAttribute("position", new THREE.BufferAttribute(P, 3));
    merged.setAttribute("uv", new THREE.BufferAttribute(U, 2));
    merged.addGroup(0, wallCount, 0);
    merged.addGroup(wallCount, roofCount, 1);
    nearBlocks.add(new THREE.Mesh(merged, [nearMat, roofMat]));

    const eg = new THREE.BufferGeometry();
    eg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(edgePos), 3));
    eg.setAttribute("color", new THREE.BufferAttribute(new Float32Array(edgeCol), 3));
    neonEdges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    neonEdges.visible = false;                 // draw() turns her on after dark
    nearBlocks.add(neonEdges);
  }

  /* ================= traffic ================= */
  /* Every lane is derived from a road in the CITY plan — right of the crown
     going one way, left of it coming back — so the cars drive on the
     streets the ground shows and the buildings line. The boulevard carries
     two lanes a side; the freeway rides its elevated deck, faster, which
     is what gives the night its long unbroken streaks. */
  const LANES = [];
  const Y = OUT_GROUND + 0.9;
  for (const z of [-16, -42]) for (const sgn of [-1, 1])
    LANES.push({ along: true, off: z + sgn * 1.9, dir: sgn, y: Y, min: -104, max: 104 });
  for (const [ox, d] of [[-4.7, -1], [-2.1, -1], [2.1, 1], [4.7, 1]])
    LANES.push({ along: false, off: ox, dir: d, y: Y, min: -104, max: -12 });
  for (const x of [-52, 52]) for (const sgn of [-1, 1])
    LANES.push({ along: false, off: x + sgn * 1.9, dir: sgn, y: Y, min: -104, max: -12 });
  for (const [oz, d] of [[-4.1, -1], [-1.6, -1], [1.6, 1], [4.1, 1]])
    LANES.push({ along: true, off: -68 + oz, dir: d, y: OUT_GROUND + 8.65, min: -104, max: 104, fast: true });
  const CARS = 44;

  /* --- a car, built out of boxes and baked into one geometry so the whole
     street still costs two draw calls. faces are shaded by which way they
     point (roof bright, flanks mid, ends dark) because nothing out here is
     lit — that fake light is what stops a box from reading as a box. --- */
  const FACE_SHADE = [0.86, 0.86, 1.16, 0.6, 0.72, 0.72];   // +x -x +y -y +z -z
  function bakeParts(parts) {
    const geos = parts.map((p) => {
      const g = new THREE.BoxGeometry(p.w, p.h, p.d).toNonIndexed();
      g.translate(p.x || 0, p.y || 0, p.z || 0);
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      const c = new THREE.Color(p.color);
      for (let i = 0; i < n; i++) {
        const k = p.flat ? 1 : FACE_SHADE[Math.floor(i / 6)];
        col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      return g;
    });
    let total = 0;
    for (const g of geos) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    let o = 0;
    for (const g of geos) {
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      col.set(g.attributes.color.array, o * 3);
      o += g.attributes.position.count;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    out.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return out;
  }

  // the body wears white so the per-car paint shows through it; glass and
  // tyres are painted dark here and stay dark whatever colour the car is
  const carGeo = bakeParts([
    { w: 1.86, h: 0.62, d: 4.30, y: 0.46, color: 0xffffff },              // body
    { w: 1.70, h: 0.30, d: 2.90, y: 0.90, z: -0.10, color: 0xffffff },    // shoulders
    { w: 1.54, h: 0.52, d: 1.95, y: 1.22, z: -0.22, color: 0x2b3038 },    // greenhouse
    { w: 0.26, h: 0.52, d: 0.52, x: 0.86, y: 0.28, z: 1.36, color: 0x0c0d10 },
    { w: 0.26, h: 0.52, d: 0.52, x: -0.86, y: 0.28, z: 1.36, color: 0x0c0d10 },
    { w: 0.26, h: 0.52, d: 0.52, x: 0.86, y: 0.28, z: -1.42, color: 0x0c0d10 },
    { w: 0.26, h: 0.52, d: 0.52, x: -0.86, y: 0.28, z: -1.42, color: 0x0c0d10 },
  ]);
  // lamps ride their own mesh so a black car still has white headlights
  const lampGeo = bakeParts([
    { w: 0.46, h: 0.20, d: 0.10, x: 0.62, y: 0.62, z: 2.16, color: 0xfff4d6, flat: true },
    { w: 0.46, h: 0.20, d: 0.10, x: -0.62, y: 0.62, z: 2.16, color: 0xfff4d6, flat: true },
    { w: 0.40, h: 0.16, d: 0.10, x: 0.66, y: 0.68, z: -2.16, color: 0xff2a18, flat: true },
    { w: 0.40, h: 0.16, d: 0.10, x: -0.66, y: 0.68, z: -2.16, color: 0xff2a18, flat: true },
  ]);
  const carMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const cars = new THREE.InstancedMesh(carGeo, carMat, CARS);
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, CARS);
  cars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  lamps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(cars, lamps);

  /* --- the tron trail: the streak a car drags up the road after dark.
     One flat additive quad lying just above the tarmac, fading to black
     down its length — under additive blending black IS transparent, so
     the gradient needs no texture and no alpha. It rides the same
     instance matrix as the car it belongs to: one more InstancedMesh,
     one more draw call, night only. --- */
  const trailGeo = (() => {
    const LEN = 7.5;
    const g = new THREE.PlaneGeometry(1.35, LEN, 1, 3)
      .rotateX(-Math.PI / 2)
      .translate(0, -0.8, -(LEN / 2) - 1.9)      // wheels sit ~0.9 over the road; the streak hugs it
      .toNonIndexed();
    const pos = g.attributes.position, n = pos.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // 1 at the bumper, 0 at the tail, eased so the streak dies like light
      const k = Math.max(0, Math.min(1, (pos.getZ(i) + LEN + 1.9) / LEN));
      const kk = k * k;
      col[i * 3] = kk; col[i * 3 + 1] = kk; col[i * 3 + 2] = kk;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  })();
  const trails = new THREE.InstancedMesh(trailGeo, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false }), CARS);
  trails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  trails.visible = false;                        // draw() turns them on after dark
  group.add(trails);
  {
    // the grid look is two currents: most streaks burn amber, a few cyan
    const c = new THREE.Color();
    for (let i = 0; i < CARS; i++) {
      trails.setColorAt(i, c.setHex(rnd(i * 31) < 0.3 ? 0x2bd2ff : 0xff5a22));
    }
    trails.instanceColor.needsUpdate = true;
  }

  // a car park's worth of paint: mostly the greys and whites real traffic
  // is made of, with the occasional red or blue to catch the eye
  const PAINT = [0x1c1f25, 0x2e3238, 0x8d939c, 0xc9ced6, 0xe8ebee, 0x1c1f25,
                 0x7d2a24, 0x24406e, 0x2b4a35, 0x9a7b2e];
  const carState = Array.from({ length: CARS }, (_, i) => {
    const lane = LANES[i % LANES.length];
    return {
      lane,
      t: lane.min + rnd(i * 9) * (lane.max - lane.min),
      sp: (9 + rnd(i * 4) * 9) * (lane.fast ? 1.7 : 1),
    };
  });
  {
    const c = new THREE.Color();
    for (let i = 0; i < CARS; i++) cars.setColorAt(i, c.setHex(PAINT[(rnd(i * 21) * PAINT.length) | 0]));
    cars.instanceColor.needsUpdate = true;
  }

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  const _up = new THREE.Vector3(0, 1, 0);
  function tickCars(dt) {
    for (let i = 0; i < CARS; i++) {
      const c = carState[i];
      c.t += c.sp * c.lane.dir * dt;
      if (c.t > c.lane.max) c.t = c.lane.min;
      if (c.t < c.lane.min) c.t = c.lane.max;
      const x = c.lane.along ? c.t : c.lane.off;
      const z = c.lane.along ? c.lane.off : c.t;
      // a car points where it's going — the old boxes never turned round,
      // which nobody could see until they grew headlights
      _q.setFromAxisAngle(_up, (c.lane.along ? Math.PI / 2 : 0) + (c.lane.dir < 0 ? Math.PI : 0));
      _v.set(x, c.lane.y, z);
      _m.compose(_v, _q, _s);
      cars.setMatrixAt(i, _m);
      lamps.setMatrixAt(i, _m);
      trails.setMatrixAt(i, _m);
    }
    cars.instanceMatrix.needsUpdate = true;
    lamps.instanceMatrix.needsUpdate = true;
    if (trails.visible) trails.instanceMatrix.needsUpdate = true;
  }

  /* ================= the fast-changing layer ================= */
  function paintFx(pal, fx, sun, moon, moonFrac, moonPhase) {
    const { g, cw, ch } = Rfx;
    g.clearRect(0, 0, cw, ch);
    const night = pal.night;
    if (fx.plane) {
      const { t, dir, shot } = fx.plane;
      if (!shot) {
        const { x: px, y: py } = jetXY(t, dir);
        drawJet(g, px, py, dir, night, Math.floor(t * 30) % 2 === 1);
      } else {
        const a = shot.age;
        const fallT = Math.max(0, a - 0.25);
        const jx = shot.x + dir * 30 * fallT;
        const jy = shot.y + 170 * fallT * fallT;
        g.fillStyle = "rgba(90,90,96,0.45)";
        for (let i = 1; i <= 7; i++) {
          const tt = fallT * (i / 7);
          g.beginPath();
          g.arc(shot.x + dir * 30 * tt, shot.y + 170 * tt * tt - 2, 1.5 + (fallT - tt) * 5, 0, 7);
          g.fill();
        }
        if (jy < 292) {
          drawJet(g, jx, jy, dir, night, false, fallT * 2.2);
          g.fillStyle = "rgba(255,120,30,0.8)";
          g.beginPath(); g.arc(jx, jy, 2.6 + ((a * 40) % 2), 0, 7); g.fill();
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
    // the Wilshire beacon, sitting on the painted crown out at the city ring
    if (fx.beacon && night && WILSHIRE) {
      const bx = Rfx.xOf(WILSHIRE.az);
      const by = (Rfx.ch / 2) * (1 - (Math.atan2(OUT_GROUND + WILSHIRE.h - OUT_EYE, Rcity.r) * 180 / Math.PI) / 16);
      g.fillStyle = "#ff2030";
      g.beginPath(); g.arc(bx, by, 3, 0, 7); g.fill();
    }
    const sp = place(sun.azimuth, sun.altitude);
    if (sp && pal.sunAlt > -1) {
      g.fillStyle = "#fff7e0";
      g.shadowColor = "#ffe9b0"; g.shadowBlur = 40;
      g.beginPath(); g.arc(sp.x, sp.y, 18, 0, 7); g.fill();
      g.shadowBlur = 0;
    }
    /* The moon is a crescent CUT OUT of a disc, not a pale disc with a dark
       one parked next to it. The old way painted the shadow in a fixed dark
       navy, which only disappears against a night sky — in daylight it
       stopped hiding and became a black ball floating beside a white one
       over the city. The cut happens on a scratch canvas so the real sky
       shows through at any hour, and so the erase can't take a chunk out of
       the jet or the bat signal already sitting on this layer.

       The offset was also inverted: it shrank as the moon filled, so a FULL
       moon put the shadow dead centre and blacked the moon out entirely,
       while a new moon shone brightest. It's 2R*fraction now — 0 at new
       (fully cut away), a clear 2R at full (the cut misses) — and the side
       comes from the phase, because a waxing and a waning crescent are the
       same fraction and opposite pictures. */
    const mp = place(moon.azimuth, moon.altitude);
    if (mp && moon.altitude > 0) {
      const R = 13, waxing = (moonPhase ?? 0.25) < 0.5;
      const mg = moonCv.getContext("2d");
      mg.clearRect(0, 0, 64, 64);
      // a moon in a blue sky is a pale ghost, not a lamp
      const day = Math.max(0, Math.min(1, (pal.sunAlt + 6) / 12));
      mg.fillStyle = `rgba(235,240,248,${(0.55 + 0.45 * moonFrac) * (1 - day * 0.6)})`;
      mg.beginPath(); mg.arc(32, 32, R, 0, 7); mg.fill();
      mg.globalCompositeOperation = "destination-out";
      // destination-out removes in proportion to the SOURCE alpha, and the
      // disc above is deliberately faint — reusing its fill would rub out
      // a quarter of the moon and leave the rest of the shadow showing
      mg.fillStyle = "#000";
      mg.beginPath();
      mg.arc(32 + 2 * R * moonFrac * (waxing ? -1 : 1), 32, R, 0, 7); mg.fill();
      mg.globalCompositeOperation = "source-over";
      g.shadowColor = "rgba(220,230,250,0.9)";
      g.shadowBlur = 26 * (1 - day);        // and it carries no halo by day
      g.drawImage(moonCv, mp.x - 32, mp.y - 32);
      g.shadowBlur = 0;
    }
    Rfx.tex.needsUpdate = true;
  }

  function paintZilla(pal, fx) {
    const { g, cw, ch } = Rzilla;
    g.clearRect(0, 0, cw, ch);
    if (fx.zilla) drawZilla(g, fx.zilla, pal.night);
    Rzilla.tex.needsUpdate = true;
  }

  /* ---- what actually gets called ---- */
  let slowHash = "", skyHash = "", zHash = "";
  function draw(sun, moon, moonFrac, wx = { clouds: 0, fog: false, rain: 0 }, fx = {}, moonPhase = 0.25) {
    const pal = palette(sun.altitude / (Math.PI / 180));
    /* Two clocks now, where there used to be one. The star twinkle used to
       ride the same hash as everything else, so a clear night repainted the
       mountains, the haze, the city and the whole ground texture every
       900 ms just to wink the stars — four big canvases redone for a
       change only the sky contains. The heavy rings now turn over only
       when the light of the day (or the weather) actually does; the sky
       keeps its own faster clock. */
    const base = pal.top + (wx.clouds * 20 | 0) + (wx.fog ? "f" : "");
    if (base !== slowHash) {
      const first = !slowHash;
      slowHash = base;
      const wantNight = pal.night ? facadeNight : facadeDay;
      if (first || nearMat.map !== wantNight) {
        nearMat.map = wantNight;
        nearMat.needsUpdate = true;
        roofMat.color.setHex(pal.night ? 0x0e1116 : 0x2c313a);
        // these multiply the paint and the lamp colours, so they're a
        // dimmer, not a tint: cars go dark at night, lamps come up
        carMat.color.setHex(pal.night ? 0x6c727a : 0xffffff);
        lampMat.color.setHex(pal.night ? 0xffffff : 0x8b9099);
        // the tron layer: building edges light, streaks pour off the cars
        neonEdges.visible = pal.night;
        trails.visible = pal.night;
      }
      paintMountains(pal);
      paintHaze(pal);
      paintCity(pal);
      paintGround(pal);
    }
    const twinkle = pal.sunAlt < -8 && wx.clouds < 0.55 ? (Date.now() / 900 | 0) : "";
    if (base + twinkle !== skyHash) {
      skyHash = base + twinkle;
      paintSky(pal, wx);
    }
    const zh = fx.zilla ? `${fx.zilla.x | 0},${fx.zilla.y | 0},${fx.zilla.f | 0}` : "";
    if (zh !== zHash) { zHash = zh; paintZilla(pal, fx); }
    paintFx(pal, fx, sun, moon, moonFrac, moonPhase);
  }

  function tick(elapsed, dt, ppos) {
    Rhaze.tex.offset.x = -1 - (elapsed * 0.004) % 1;    // repeat.x is -1, so drift is negative
    tickCars(dt);
    // (which room you're in is main.js's business — see setRoomCull)
  }

  // the plane hunt: a click on the glass becomes a look-direction, and a
  // look-direction becomes a spot on the fx ring's old 720×280 art
  function glassToFx(u, v) {
    const px = (u - 0.5) * 3.6, py = 1.6 + (v - 0.5) * 1.4;
    const dz = 3.3;                                   // eye to glass, near enough
    const az = Math.atan2(px, dz) * 180 / Math.PI;
    const tanAlt = (py - OUT_EYE) / Math.hypot(px, dz);
    const T = Math.tan(16 * Math.PI / 180);
    return { x: (az / (2 * FX_AZ) + 0.5) * 720, y: (0.5 - tanAlt / (2 * T)) * 280 };
  }

  return { draw, tick, group, glassToFx };
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

export function buildWorld(renderer) {
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
  // solid furniture: rects subtracted from the walkable floor (see isWalkable).
  // pushed by whatever builds the piece, so a table that moves takes its
  // collision with it instead of leaving a ghost behind.
  const NO_WALK = [];

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
  // shell surfaces are DoubleSide so they can NEVER read as a see-through hole:
  // even if the camera grazes a corner or a low-precision mobile depth buffer
  // flickers, you see solid floor/wall from the back instead of the void.
  const floor = add(plane(W, D, new THREE.MeshLambertMaterial({ map: floorTexture(), side: THREE.DoubleSide })));
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
      map: wallTexture(W, H), side: THREE.DoubleSide,
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
    new THREE.MeshLambertMaterial({ map: westMap, side: THREE.DoubleSide }),
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
      map: wallTexture(D, H), side: THREE.DoubleSide,
    }),
    m => { m.rotation.y = -Math.PI / 2; m.position.set(X, H / 2, 0); },
    new THREE.Vector3(X, 0, ZF), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0),
    {
      voids: [
        { u0: 5.06, u1: 6.14, v0: 0, v1: 2.12 },     // entry door
        { u0: 4.50, u1: 5.08, v0: 1.26, v1: 1.84 },  // the gold record's spot
      ],
    });

  // the front wall wears a REAL hole where the window is — the view behind
  // it is stacked geometry now, and a solid wall would simply hide LA.
  // (WIN is declared below; these are its literals, kept in step with it.)
  const WINW0 = 3.6, WINH0 = 1.4, WINCY0 = 1.6;
  const frontShape = new THREE.Shape();
  frontShape.moveTo(-W / 2, -H / 2);
  frontShape.lineTo(W / 2, -H / 2);
  frontShape.lineTo(W / 2, H / 2);
  frontShape.lineTo(-W / 2, H / 2);
  frontShape.closePath();
  const winHole = new THREE.Path();
  winHole.moveTo(-WINW0 / 2, WINCY0 - H / 2 - WINH0 / 2);
  winHole.lineTo(WINW0 / 2, WINCY0 - H / 2 - WINH0 / 2);
  winHole.lineTo(WINW0 / 2, WINCY0 - H / 2 + WINH0 / 2);
  winHole.lineTo(-WINW0 / 2, WINCY0 - H / 2 + WINH0 / 2);
  winHole.closePath();
  frontShape.holes.push(winHole);
  const frontMap = wallTexture(W, H);
  frontMap.wrapS = frontMap.wrapT = THREE.RepeatWrapping;
  frontMap.repeat.set(1 / W, 1 / H);            // ShapeGeometry uvs are shape units
  frontMap.offset.set(0.5, 0.5);
  const front = add(new THREE.Mesh(new THREE.ShapeGeometry(frontShape),
    new THREE.MeshLambertMaterial({ map: frontMap })));
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
  /* --- TEST: "Neuro Noise" animated shader on one acoustic slab ---
     adapted from Paper Shaders (https://shaders.paper.design/neuro-noise),
     Apache-2.0 (https://github.com/paper-design/shaders). the original is a
     fullscreen gl_FragCoord shader; here the panel's UVs stand in for the
     screen so the pattern maps 1:1 onto the slab face with the panel's own
     aspect (u_resolution mirrors the slab's w:h) — no stretch, no warp. --- */
  const NEURO_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec3 u_colors[8];
uniform vec4 u_scene;      // resolution.xy, time, colour count
uniform vec4 u_shape;      // scale, intensity, paramA, warp
uniform vec4 u_surface;    // detail, contrast, brightness, saturation
uniform vec4 u_finish;     // hue, vignette, blur, grain
uniform vec4 u_transform;  // seed, rotation, drift, OKLab toggle
uniform vec4 u_space;      // offset.xy, pointer.xy
uniform vec4 u_cursor;

#define u_resolution u_scene.xy
#define u_time u_scene.z
#define u_colorCount u_scene.w
#define u_scale u_shape.x
#define u_intensity u_shape.y
#define u_paramA u_shape.z
#define u_warp u_shape.w
#define u_detail u_surface.x
#define u_contrast u_surface.y
#define u_brightness u_surface.z
#define u_saturation u_surface.w
#define u_hue u_finish.x
#define u_vignette u_finish.y
#define u_blur u_finish.z
#define u_grain u_finish.w
#ifdef GL_FRAGMENT_PRECISION_HIGH
#define u_seed u_transform.x
#else
#define u_seed mod(u_transform.x, 31.0)
#endif
#define u_rotate u_transform.y
#define u_drift u_transform.z
#define u_oklab u_transform.w
#define u_offset u_space.xy
#define u_mouse u_space.zw
#define u_cursorPresence u_cursor.x
#define u_cursorEffect u_cursor.y
#define u_cursorStrength u_cursor.z
#define u_cursorRadius u_cursor.w

float hash21(vec2 p) {
#ifndef GL_FRAGMENT_PRECISION_HIGH
  p = mod(p, 31.0);
#endif
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float grainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.0, 9.2);
    a *= 0.5;
  }
  return v;
}

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)),
    step(0.04045, c));
}
vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
    step(0.0031308, c));
}
vec3 linToOklab(vec3 c) {
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  l = pow(max(l, 0.0), 1.0 / 3.0);
  m = pow(max(m, 0.0), 1.0 / 3.0);
  s = pow(max(s, 0.0), 1.0 / 3.0);
  return vec3(
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}
vec3 oklabToLin(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}
vec3 mixColour(vec3 a, vec3 b, float t) {
  if (u_oklab > 0.5) {
    vec3 la = linToOklab(srgbToLinear(a));
    vec3 lb = linToOklab(srgbToLinear(b));
    return clamp(linearToSrgb(oklabToLin(mix(la, lb, t))), 0.0, 1.0);
  }
  return mix(a, b, t);
}

vec3 palette(float x) {
  float n = max(u_colorCount - 1.0, 1.0);
  float f = clamp(x, 0.0, 1.0) * n;
  vec3 col = u_colors[0];
  for (int i = 0; i < 7; i++) {
    if (float(i) < n)
      col = mixColour(col, u_colors[i + 1],
        smoothstep(0.0, 1.0, clamp(f - float(i), 0.0, 1.0)));
  }
  return col;
}

vec3 hueRotate(vec3 col, float a) {
  const mat3 toYIQ = mat3(0.299, 0.596, 0.211,
                          0.587, -0.274, -0.523,
                          0.114, -0.322, 0.312);
  const mat3 toRGB = mat3(1.0, 1.0, 1.0,
                          0.956, -0.272, -1.106,
                          0.621, -0.647, 1.703);
  vec3 yiq = toYIQ * col;
  float ca = cos(a), sa = sin(a);
  yiq = vec3(yiq.x, yiq.y * ca - yiq.z * sa, yiq.y * sa + yiq.z * ca);
  return toRGB * yiq;
}

vec3 shade(vec2 uv, vec2 p, float t) {
  vec2 q = p * (1.6 + u_intensity * 2.4);
  float field = 0.0;
  float weight = 0.55;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    q += vec2(
      sin(q.y * (1.7 + fi * 0.09) + t * (0.35 + fi * 0.04) + u_seed),
      cos(q.x * (1.5 + fi * 0.11) - t * (0.28 + fi * 0.03))
    ) * (0.22 + u_intensity * 0.14);
    float filaments = abs(sin(q.x + q.y + fi * 0.72));
    field += weight / (0.08 + filaments);
    weight *= 0.62;
    q = q.yx * vec2(-1.08, 1.04);
  }
  float glow = 1.0 - exp(-field * (0.018 + u_paramA * 0.04));
  return palette(clamp(glow, 0.0, 1.0));
}

void main() {
  // the panel's UV grid stands in for gl_FragCoord — same math, mapped to
  // the slab face so the pattern carries the panel's true aspect
  vec2 fragXY = vUv * u_resolution.xy;
  vec2 uv = fragXY / u_resolution.xy;
  vec2 screenUv = uv;
  vec2 p = (fragXY - 0.5 * u_resolution.xy)
    / min(u_resolution.x, u_resolution.y);
  float cursorMask = 0.0;

  if (u_cursorPresence > 0.001) {
    vec2 cursor = (0.5 * u_mouse * u_resolution.xy)
      / min(u_resolution.x, u_resolution.y);
    vec2 cursorDelta = p - cursor;
    if (u_cursorEffect < 0.5) {
      p += cursor * u_cursorPresence * u_cursorStrength * 0.55;
    } else {
      float cursorDistance = length(cursorDelta);
      vec2 cursorDirection = cursorDelta / max(cursorDistance, 0.0001);
      cursorMask = u_cursorPresence
        * (1.0 - smoothstep(0.0, u_cursorRadius, cursorDistance));
      if (u_cursorEffect < 1.5) {
        p -= cursorDirection * cursorMask * u_cursorStrength * 0.24;
      } else if (u_cursorEffect < 2.5) {
        float cursorAngle = cursorMask * u_cursorStrength * 2.2;
        float cc = cos(cursorAngle), cs = sin(cursorAngle);
        p = cursor + mat2(cc, -cs, cs, cc) * cursorDelta;
      } else if (u_cursorEffect < 3.5) {
        float ripple = sin(
          cursorDistance / max(u_cursorRadius, 0.001) * 18.0 - u_time * 5.0);
        p -= cursorDirection * ripple * cursorMask * u_cursorStrength * 0.07;
      }
    }
  }

  uv = p * min(u_resolution.x, u_resolution.y) / u_resolution.xy + 0.5;
  p *= u_scale;
  if (abs(u_rotate) > 0.0001) {
    float cr = cos(u_rotate), sr = sin(u_rotate);
    p = mat2(cr, -sr, sr, cr) * p;
  }
  p += u_offset;
  if (u_drift > 0.0001)
    p += u_drift * vec2(sin(u_time * 0.31), cos(u_time * 0.23));
  if (u_warp > 0.0) {
    p += u_warp * (vec2(
      fbm(p * u_detail + u_seed),
      fbm(p * u_detail + vec2(5.2, 1.3))) - 0.5);
  }
  vec3 col;
  if (u_blur > 0.0) {
    float e = u_blur;
    float pe = e * u_scale;
    vec2 uvE = vec2(e) * min(u_resolution.x, u_resolution.y) / u_resolution.xy;
    col  = shade(uv, p, u_time) * 0.36;
    col += shade(uv + vec2(uvE.x, 0.0), p + vec2(pe, 0.0), u_time) * 0.16;
    col += shade(uv - vec2(uvE.x, 0.0), p - vec2(pe, 0.0), u_time) * 0.16;
    col += shade(uv + vec2(0.0, uvE.y), p + vec2(0.0, pe), u_time) * 0.16;
    col += shade(uv - vec2(0.0, uvE.y), p - vec2(0.0, pe), u_time) * 0.16;
  } else {
    col = shade(uv, p, u_time);
  }
  if (abs(u_contrast - 1.0) > 0.0001)
    col = (col - 0.5) * u_contrast + 0.5;
  if (abs(u_saturation - 1.0) > 0.0001) {
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(luma), col, u_saturation);
  }
  if (abs(u_hue) > 0.0001)
    col = hueRotate(col, u_hue);
  if (abs(u_brightness) > 0.0001)
    col += u_brightness;
  if (u_vignette > 0.0001) {
    float vd = length(screenUv - 0.5) * 1.41421356;
    col *= 1.0 - u_vignette * smoothstep(0.35, 1.0, vd);
  }
  if (u_cursorPresence > 0.001 && u_cursorEffect > 3.5)
    col += (vec3(0.18) + col * 0.12) * cursorMask * u_cursorStrength;
  if (u_grain > 0.0001)
    col += (grainHash(
      fragXY + vec2(u_seed * 17.0, u_seed * 31.0)) - 0.5) * u_grain;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
  const SHADER_VERT = "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
  // one neuro instance per panel: same fragment source, its own uniforms
  const makeNeuro = ({ colors, speed, shape, surface, finish, transform }) => {
    const uniforms = {
      u_colors: { value: colors.concat(Array.from({ length: 8 - colors.length }, () => new THREE.Vector3())) },
      u_scene: { value: new THREE.Vector4(550, 1200, 0, colors.length) },
      u_shape: { value: shape },
      u_surface: { value: surface },
      u_finish: { value: finish },
      u_transform: { value: transform },
      u_space: { value: new THREE.Vector4(0, 0, 0, 0) },
      u_cursor: { value: new THREE.Vector4(0, 2.0, 0.65, 0.46) },   // presence 0 = cursor off
    };
    return {
      uniforms, speed,
      mat: new THREE.ShaderMaterial({ uniforms, vertexShader: SHADER_VERT, fragmentShader: NEURO_FRAG }),
    };
  };
  // gold: the first recipe — dark → gold → pink → purple, slow and calm
  const neuroGold = makeNeuro({
    colors: [
      new THREE.Vector3(0.027, 0.012, 0.051),   // #07030D
      new THREE.Vector3(1.000, 0.855, 0.475),   // #FFDA79
      new THREE.Vector3(0.839, 0.161, 0.463),   // #D62976
      new THREE.Vector3(0.165, 0.039, 0.282),   // #2A0A48
    ],
    speed: 0.82,
    shape: new THREE.Vector4(1.48, 0.52, 0.51, 0.19),
    surface: new THREE.Vector4(2.75, 1.00, 0.00, 1.00),
    finish: new THREE.Vector4(0.00, 0.00, 0.000, 0.03),
    transform: new THREE.Vector4(1.0, 0.65, 0.00, 0.0),
  });
  // pink: the palette inverted (pink lows, void highs), hotter and faster
  const neuroPink = makeNeuro({
    colors: [
      new THREE.Vector3(0.839, 0.161, 0.463),   // #D62976
      new THREE.Vector3(1.000, 0.855, 0.475),   // #FFDA79
      new THREE.Vector3(0.027, 0.012, 0.051),   // #07030D
      new THREE.Vector3(0.165, 0.039, 0.282),   // #2A0A48
    ],
    speed: 1.07,
    shape: new THREE.Vector4(1.70, 0.69, 0.74, 0.30),
    surface: new THREE.Vector4(3.68, 1.00, 0.00, 1.00),
    finish: new THREE.Vector4(0.00, 0.00, 0.000, 0.06),
    transform: new THREE.Vector4(1.0, 1.29, 0.00, 0.0),
  });

  /* --- "sun & grid" synthwave slab (Shader License: CC BY 3.0,
     Author: Jan Mróz / jaszunio15). composed for landscape screens, so on
     a portrait slab we normalize by WIDTH instead of height — the sun and
     fuji stay in frame with extra sky above and grid below. --- */
  const SUNGRID_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec2 iResolution;
uniform float iTime;

float sun(vec2 uv, float battery)
{
  float val = smoothstep(0.3, 0.29, length(uv));
  float bloom = smoothstep(0.7, 0.0, length(uv));
  float cut = 3.0 * sin((uv.y + iTime * 0.2 * (battery + 0.02)) * 100.0)
    + clamp(uv.y * 14.0 + 1.0, -6.0, 6.0);
  cut = clamp(cut, 0.0, 1.0);
  return clamp(val * cut, 0.0, 1.0) + bloom * 0.6;
}

float grid(vec2 uv, float battery)
{
  vec2 size = vec2(uv.y, uv.y * uv.y * 0.2) * 0.01;
  uv += vec2(0.0, iTime * 4.0 * (battery + 0.05));
  uv = abs(fract(uv) - 0.5);
  vec2 lines = smoothstep(size, vec2(0.0), uv);
  lines += smoothstep(size * 5.0, vec2(0.0), uv) * 0.4 * battery;
  return clamp(lines.x + lines.y, 0.0, 3.0);
}

float dot2(in vec2 v) { return dot(v, v); }

float sdTrapezoid(in vec2 p, in float r1, float r2, float he)
{
  vec2 k1 = vec2(r2, he);
  vec2 k2 = vec2(r2 - r1, 2.0 * he);
  p.x = abs(p.x);
  vec2 ca = vec2(p.x - min(p.x, (p.y < 0.0) ? r1 : r2), abs(p.y) - he);
  vec2 cb = p - k1 + k2 * clamp(dot(k1 - p, k2) / dot2(k2), 0.0, 1.0);
  float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
  return s * sqrt(min(dot2(ca), dot2(cb)));
}

float sdLine(in vec2 p, in vec2 a, in vec2 b)
{
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float sdBox(in vec2 p, in vec2 b)
{
  vec2 d = abs(p) - b;
  return length(max(d, vec2(0))) + min(max(d.x, d.y), 0.0);
}

float opSmoothUnion(float d1, float d2, float k) {
  float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}

float sdCloud(in vec2 p, in vec2 a1, in vec2 b1, in vec2 a2, in vec2 b2, float w)
{
  float lineVal1 = sdLine(p, a1, b1);
  float lineVal2 = sdLine(p, a2, b2);
  vec2 ww = vec2(w * 1.5, 0.0);
  vec2 left = max(a1 + ww, a2 + ww);
  vec2 right = min(b1 - ww, b2 - ww);
  vec2 boxCenter = (left + right) * 0.5;
  float boxH = abs(a2.y - a1.y) * 0.5;
  float boxVal = sdBox(p - boxCenter, vec2(0.04, boxH)) + w;
  float uniVal1 = opSmoothUnion(lineVal1, boxVal, 0.05);
  float uniVal2 = opSmoothUnion(lineVal2, boxVal, 0.05);
  return min(uniVal1, uniVal2);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
  // portrait slab: normalize by width so the landscape scene fits across
  vec2 uv = (2.0 * fragCoord.xy - iResolution.xy) / iResolution.x;
  float battery = 1.0;
  float fog = smoothstep(0.1, -0.02, abs(uv.y + 0.2));
  vec3 col = vec3(0.0, 0.1, 0.2);
  if (uv.y < -0.2)
  {
    uv.y = 3.0 / (abs(uv.y + 0.2) + 0.05);
    uv.x *= uv.y * 1.0;
    float gridVal = grid(uv, battery);
    col = mix(col, vec3(1.0, 0.5, 1.0), gridVal);
  }
  else
  {
    float fujiD = min(uv.y * 4.5 - 0.5, 1.0);
    uv.y -= battery * 1.1 - 0.51;
    vec2 sunUV = uv;
    sunUV += vec2(0.75, 0.2);
    col = vec3(1.0, 0.2, 1.0);
    float sunVal = sun(sunUV, battery);
    col = mix(col, vec3(1.0, 0.4, 0.1), sunUV.y * 2.0 + 0.2);
    col = mix(vec3(0.0, 0.0, 0.0), col, sunVal);
    float fujiVal = sdTrapezoid(uv + vec2(-0.75 + sunUV.y * 0.0, 0.5), 1.75 + pow(uv.y * uv.y, 2.1), 0.2, 0.5);
    float waveVal = uv.y + sin(uv.x * 20.0 + iTime * 2.0) * 0.05 + 0.2;
    float wave_width = smoothstep(0.0, 0.01, (waveVal));
    col = mix(col, mix(vec3(0.0, 0.0, 0.25), vec3(1.0, 0.0, 0.5), fujiD), step(fujiVal, 0.0));
    col = mix(col, vec3(1.0, 0.5, 1.0), wave_width * step(fujiVal, 0.0));
    col = mix(col, vec3(1.0, 0.5, 1.0), 1.0 - smoothstep(0.0, 0.01, abs(fujiVal)));
    col += mix(col, mix(vec3(1.0, 0.12, 0.8), vec3(0.0, 0.0, 0.2), clamp(uv.y * 3.5 + 3.0, 0.0, 1.0)), step(0.0, fujiVal));
    vec2 cloudUV = uv;
    cloudUV.x = mod(cloudUV.x + iTime * 0.1, 4.0) - 2.0;
    float cloudTime = iTime * 0.5;
    float cloudY = -0.5;
    float cloudVal1 = sdCloud(cloudUV,
      vec2(0.1 + sin(cloudTime + 140.5) * 0.1, cloudY),
      vec2(1.05 + cos(cloudTime * 0.9 - 36.56) * 0.1, cloudY),
      vec2(0.2 + cos(cloudTime * 0.867 + 387.165) * 0.1, 0.25 + cloudY),
      vec2(0.5 + cos(cloudTime * 0.9675 - 15.162) * 0.09, 0.25 + cloudY), 0.075);
    cloudY = -0.6;
    float cloudVal2 = sdCloud(cloudUV,
      vec2(-0.9 + cos(cloudTime * 1.02 + 541.75) * 0.1, cloudY),
      vec2(-0.5 + sin(cloudTime * 0.9 - 316.56) * 0.1, cloudY),
      vec2(-1.5 + cos(cloudTime * 0.867 + 37.165) * 0.1, 0.25 + cloudY),
      vec2(-0.6 + sin(cloudTime * 0.9675 + 665.162) * 0.09, 0.25 + cloudY), 0.075);
    float cloudVal = min(cloudVal1, cloudVal2);
    col = mix(col, vec3(0.0, 0.0, 0.2), 1.0 - smoothstep(0.075 - 0.0001, 0.075, cloudVal));
    col += vec3(1.0, 1.0, 1.0) * (1.0 - smoothstep(0.0, 0.01, abs(cloudVal - 0.075)));
  }
  col += fog * fog * fog;
  col = mix(vec3(col.r, col.r, col.r) * 0.5, col, battery * 0.7);
  fragColor = vec4(col, 1.0);
}

void main() { mainImage(gl_FragColor, vUv * iResolution.xy); }
`;
  const sunGridUniforms = {
    iResolution: { value: new THREE.Vector2(530, 1180) },
    iTime: { value: 0 },
  };
  const sunGridMat = new THREE.ShaderMaterial({
    uniforms: sunGridUniforms,
    vertexShader: SHADER_VERT,
    fragmentShader: SUNGRID_FRAG,
  });

  /* --- "another synthwave sunset thing" (Shadertoy) — raymarched
     pseudo-tessellated terrain rolling under a low sun, on the OTHER
     window-wall slab. adapted: round() polyfilled (GLSL ES 1.00 has
     none), audio-texture path compile-time disabled as authored, AA off.
     the portrait slab keeps the original height-normalized framing —
     a tall crop with the sun on the horizon reads like a poster. --- */
  const SUNSET_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec2 iResolution;
uniform float iTime;
uniform float iTimeDelta;

#define speed 10.
#define wave_thing
#define disable_sound_texture_sampling
#define audio_vibration_amplitude .125

float jTime;

#define textureMirror(a, b) vec4(0)

// GLSL ES 1.00 has no round() — nearest-integer the long way
vec3 roundv(vec3 v) { return floor(v + 0.5); }

float amp(vec2 p){
    return smoothstep(1.,8.,abs(p.x));
}

float pow512(float a){
    a*=a;a*=a;a*=a;a*=a;a*=a;a*=a;a*=a;a*=a;
    return a*a;
}
float pow1d5(float a){
    return a*sqrt(a);
}
float hash21(vec2 co){
    return fract(sin(dot(co.xy,vec2(1.9898,7.233)))*45758.5433);
}
float hash(vec2 uv){
    float a = amp(uv);
    #ifdef wave_thing
    float w = a>0.?(1.-.4*pow512(.51+.49*sin((.02*(uv.y+.5*uv.x)-jTime)*2.))):0.;
    #else
    float w=1.;
    #endif
    return (a>0.?
        a*pow1d5(hash21(uv))*w
        :0.)-(textureMirror(iChannel0,vec2((uv.x*29.+uv.y)*.03125,1.)).x)*audio_vibration_amplitude;
}

float edgeMin(float dx,vec2 da, vec2 db,vec2 uv){
    uv.x+=5.;
    vec3 c = fract((roundv(vec3(uv,uv.x+uv.y)))*(vec3(0,1,2)+0.61803398875));
    float a1 = textureMirror(iChannel0,vec2(c.y,0.)).x>.6?.15:1.;
    float a2 = textureMirror(iChannel0,vec2(c.x,0.)).x>.6?.15:1.;
    float a3 = textureMirror(iChannel0,vec2(c.z,0.)).x>.6?.15:1.;
    return min(min((1.-dx)*db.y*a3,da.x*a2),da.y*a1);
}

vec2 trinoise(vec2 uv){
    const float sq = sqrt(3./2.);
    uv.x *= sq;
    uv.y -= .5*uv.x;
    vec2 d = fract(uv);
    uv -= d;
    bool c = dot(d,vec2(1))>1.;
    vec2 dd = 1.-d;
    vec2 da = c?dd:d,db = c?d:dd;
    float nn = hash(uv+float(c));
    float n2 = hash(uv+vec2(1,0));
    float n3 = hash(uv+vec2(0,1));
    float nmid = mix(n2,n3,d.y);
    float ns = mix(nn,c?n2:n3,da.y);
    float dx = da.x/db.y;
    return vec2(mix(ns,nmid,dx),edgeMin(dx,da, db,uv+d));
}

vec2 map(vec3 p){
    vec2 n = trinoise(p.xz);
    return vec2(p.y-2.*n.x,n.y);
}

vec3 grad(vec3 p){
    const vec2 e = vec2(.005,0);
    float a =map(p).x;
    return vec3(map(p+e.xyy).x-a
                ,map(p+e.yxy).x-a
                ,map(p+e.yyx).x-a)/e.x;
}

vec2 intersect(vec3 ro,vec3 rd){
    float d =0.,h=0.;
    for(int i = 0;i<500;i++){ //look nice with 50 iterations
        vec3 p = ro+d*rd;
        vec2 s = map(p);
        h = s.x;
        d+= h*.5;
        if(abs(h)<.003*d)
            return vec2(d,s.y);
        if(d>150.|| p.y>2.) break;
    }
    return vec2(-1);
}

void addsun(vec3 rd,vec3 ld,inout vec3 col){
    float sun = smoothstep(.21,.2,distance(rd,ld));
    if(sun>0.){
        float yd = (rd.y-ld.y);
        float a =sin(3.1*exp(-(yd)*14.));
        sun*=smoothstep(-.8,0.,a);
        col = mix(col,vec3(1.,.8,.4)*.75,sun);
    }
}

float starnoise(vec3 rd){
    float c = 0.;
    vec3 p = normalize(rd)*300.;
    for (float i=0.;i<4.;i++)
    {
        vec3 q = fract(p)-.5;
        vec3 id = floor(p);
        float c2 = smoothstep(.5,0.,length(q));
        c2 *= step(hash21(id.xz/id.y),.06-i*i*0.005);
        c += c2;
        p = p*.6+.5*p*mat3(3./5.,0,4./5.,0,1,0,-4./5.,0,3./5.);
    }
    c*=c;
    float g = dot(sin(rd*10.512),cos(rd.yzx*10.512));
    c*=smoothstep(-3.14,-.9,g)*.5+.5*smoothstep(-.3,1.,g);
    return c*c;
}

vec3 gsky(vec3 rd,vec3 ld,bool mask){
    float haze = exp2(-5.*(abs(rd.y)-.2*dot(rd,ld)));
    float st = mask?(starnoise(rd))*(1.-min(haze,1.)):0.;
    vec3 back = vec3(.4,.1,.7)*(1.-.5*textureMirror(iChannel0,vec2(.5+.05*rd.x/rd.y,0.)).x
    *exp2(-.1*abs(length(rd.xz)/rd.y))
    *max(sign(rd.y),0.));
    vec3 col=clamp(mix(back,vec3(.7,.1,.4),haze)+st,0.,1.);
    if(mask)addsun(rd,ld,col);
    return col;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    fragColor=vec4(0);
    const float AA=1.,x=0.,y=0.;
    vec2 uv = (2.*(fragCoord+vec2(x,y))-iResolution.xy)/iResolution.y;

    const float shutter_speed = .25; // for motion blur
    float dt = fract(hash21(AA*(fragCoord+vec2(x,y)))+iTime)*shutter_speed;
    jTime = mod(iTime-dt*iTimeDelta,4000.);
    vec3 ro = vec3(0.,1,(-20000.+jTime*speed));

    vec3 rd = normalize(vec3(uv,4./3.));

    vec2 i = intersect(ro,rd);
    float d = i.x;

    vec3 ld = normalize(vec3(0,.125+.05*sin(.1*jTime),1));

    vec3 fog = d>0.?exp2(-d*vec3(.14,.1,.28)):vec3(0.);
    vec3 sky = gsky(rd,ld,d<0.);

    vec3 p = ro+d*rd;
    vec3 n = normalize(grad(p));

    float diff = dot(n,ld)+.1*n.y;
    vec3 col = vec3(.1,.11,.18)*diff;

    vec3 rfd = reflect(rd,n);
    vec3 rfcol = gsky(rfd,ld,true);

    col = mix(col,rfcol,.05+.95*pow(max(1.+dot(rd,n),0.),5.));
    col = mix(col,vec3(.8,.1,.92),smoothstep(.05,.0,i.y));
    col = mix(sky,col,fog);
    //no gamma for that old cg look
    if(d<0.)
        d=1e6;
    d=min(d,10.);
    fragColor += vec4(clamp(col,0.,1.),d<0.?0.:.1+exp2(-d));
}

/** SHADERDATA
{
  "title": "another synthwave sunset thing",
  "description": "I was thinking of a way to make pseudo tesselation noise and i made this to illustrate it, i might not be the first one to come up with this solution.",
  "model": "car"
}
*/

void main() { mainImage(gl_FragColor, vUv * iResolution.xy); }
`;
  const sunsetUniforms = {
    iResolution: { value: new THREE.Vector2(530, 1180) },
    iTime: { value: 0 },
    iTimeDelta: { value: 1 / 60 },
  };
  const sunsetMat = new THREE.ShaderMaterial({
    uniforms: sunsetUniforms,
    vertexShader: SHADER_VERT,
    fragmentShader: SUNSET_FRAG,
  });

  function tickNeuro(elapsed2, dt2) {
    neuroGold.uniforms.u_scene.value.z = elapsed2 * neuroGold.speed;
    neuroPink.uniforms.u_scene.value.z = elapsed2 * neuroPink.speed;
    sunGridUniforms.iTime.value = elapsed2;
    sunsetUniforms.iTime.value = elapsed2;
    sunsetUniforms.iTimeDelta.value = dt2 || 1 / 60;
    for (const toy of TOYS) {
      toy.uniforms.iTime.value = elapsed2;
      toy.uniforms.iTimeDelta.value = dt2 || 1 / 60;
    }
  }

  /* --- the rest of the gallery: Shadertoy-style pieces from
     shaderart.js, one material per slab. the prelude makes vUv stand in
     for gl_FragCoord and pins iMouse, so every piece renders in the
     slab's own aspect. --- */
  const TOYS = [];
  const makeToy = ({ frag, glsl3 }) => {
    const uniforms = {
      iResolution: { value: new THREE.Vector3(550, 1200, 1) },
      iTime: { value: 0 },
      iTimeDelta: { value: 1 / 60 },
    };
    // ES 3.0 mode has no gl_FragColor — those shaders get an explicit out
    const mainWrap = glsl3
      ? "layout(location = 0) out highp vec4 metroFragColor;\nvoid main() { mainImage(metroFragColor, vUv * iResolution.xy); }\n"
      : "void main() { mainImage(gl_FragColor, vUv * iResolution.xy); }\n";
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: SHADER_VERT,
      fragmentShader:
        "varying vec2 vUv;\nuniform vec3 iResolution;\nuniform float iTime;\nuniform float iTimeDelta;\nconst vec4 iMouse = vec4(0.0);\n"
        + frag + "\n" + mainWrap,
      glslVersion: glsl3 ? THREE.GLSL3 : null,
    });
    const toy = { uniforms, mat };
    TOYS.push(toy);
    return toy;
  };
  const toyOf = (name) => makeToy(SHADER_ART[name]);

  // which slab wears which shader face, by PANEL_DEFS index.
  // back wall: 0-3 · west: 4-8 (7 is the skinny strip) · east: 9-12
  // east 9/10 were the neuro pair — the first two shader panels the room
  // ever had; they're retired in favour of the newer drop (the neuro
  // materials still build above if they're ever rehung)
  const PANEL_SHADERS = {
    0: toyOf("tunnelOrb"),
    1: toyOf("phantom"),
    2: toyOf("marble"),
    3: toyOf("balatro"),
    4: toyOf("blueRects"),
    5: toyOf("sineLattice"),
    6: toyOf("proteanClouds"),
    7: toyOf("universeWithin"),
    8: toyOf("starTunnel"),
    9: toyOf("sphereWarp"),
    10: toyOf("golfShort"),
    11: toyOf("neonCity"),
    12: toyOf("acidPlasma"),
  };
  /* --- the KuKo floor: the room's first multi-pass piece.
     Buffer A (a light-cycle cellular automaton) ping-pongs against its
     own previous frame in half-float render targets, Buffer B stacks
     zoomed layers of it, and the floor material radial-blurs B. runs
     only when a renderer was handed in (headless calls skip it). --- */
  let tickKuko = () => {};
  let kukoRug = null;
  if (renderer) {
    const KSIZE = 512;
    const mkRT = () => new THREE.WebGLRenderTarget(KSIZE, KSIZE, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
      depthBuffer: false, stencilBuffer: false,
    });
    let kA = mkRT(), kA2 = mkRT();
    const kB = mkRT();
    const passCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const passScene = new THREE.Scene();
    const passQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    passScene.add(passQuad);
    const mkPass = (frag) => {
      const m = new THREE.ShaderMaterial({
        uniforms: {
          iResolution: { value: new THREE.Vector3(KSIZE, KSIZE, 1) },
          iTime: { value: 0 },
          iFrame: { value: 0 },
          iChannel0: { value: null },
        },
        vertexShader: "void main() { gl_Position = vec4(position, 1.0); }",
        fragmentShader:
          "uniform vec3 iResolution;\nuniform float iTime;\nuniform int iFrame;\nuniform sampler2D iChannel0;\n"
          + frag
          + "\nlayout(location = 0) out highp vec4 kukoOut;\nvoid main() { mainImage(kukoOut, gl_FragCoord.xy); }\n",
        glslVersion: THREE.GLSL3,
        blending: THREE.NoBlending,   // passes REPLACE the target, never blend with it
        depthTest: false, depthWrite: false,
      });
      return m;
    };
    const matA = mkPass(KUKO_A);
    const matB = mkPass(KUKO_B);
    // a THROW RUG runs the Image pass over Buffer B — mid-room, slightly
    // askew like it was actually thrown there. its group is registered as
    // a movable so the layout editor can slide and spin it.
    const floorUniforms = {
      iResolution: { value: new THREE.Vector3(240, 170, 1) },   // rug aspect
      iTime: { value: 0 },
      iFrame: { value: 0 },
      iChannel0: { value: kB.texture },
    };
    const rugFace = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.7),
      new THREE.ShaderMaterial({
        uniforms: floorUniforms,
        vertexShader: "out vec2 vUv2; void main() { vUv2 = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader:
          "in vec2 vUv2;\nuniform vec3 iResolution;\nuniform float iTime;\nuniform int iFrame;\nuniform sampler2D iChannel0;\n"
          + KUKO_IMAGE
          + "\nlayout(location = 0) out highp vec4 kukoOut;\nvoid main() { mainImage(kukoOut, vUv2 * iResolution.xy); }\n",
        glslVersion: THREE.GLSL3,
      }));
    rugFace.rotation.x = -Math.PI / 2;
    kukoRug = new THREE.Group();
    kukoRug.add(rugFace);
    kukoRug.position.set(0.15, 0.004, 0.85);   // open carpet mid-room, over the pile, under the grime
    kukoRug.rotation.y = 0.14;                 // a little askew, like it landed there
    add(kukoRug);
    /* This is two 512x512 half-float passes, and it used to run EVERY frame
       whether or not the rug was on screen, in the room, or even in the same
       half of the world. At an uncapped 120Hz on a phone that is 63 million
       fragment invocations a second for a decorative rug, and it was the
       single largest continuous cost in here.

       Two gates. It does not run when you are nowhere near it (the arcade is
       the same cull scope, so "visible" was never the test), and it steps at
       its own rate rather than the display's. A cellular automaton at 12Hz
       looks exactly as alive as one at 120: nobody is counting its
       generations, they are looking at a rug. */
    const KUKO_HZ = IS_TOUCH ? 12 : 30;
    const KUKO_NEAR = 9;              // metres; the rug sits in the bedroom
    let kFrame = 0, kAcc = 0;
    tickKuko = (elapsed2, dt2, ppos) => {
      if (ppos) {
        const dx = ppos.x - kukoRug.position.x, dz = ppos.z - kukoRug.position.z;
        if (dx * dx + dz * dz > KUKO_NEAR * KUKO_NEAR) return;
      }
      kAcc += dt2 || 0;
      if (kAcc < 1 / KUKO_HZ) return;
      kAcc = 0;
      // save whatever's bound and put it back when we're done. inside a
      // WebXR session that's the HEADSET's framebuffer, and clearing it to
      // null would send the whole room to the canvas instead of the eyes
      // (a black headset). the mirror does the same dance.
      const prevRT = renderer.getRenderTarget();
      // Buffer A: read last frame, write the next
      matA.uniforms.iChannel0.value = kA.texture;
      matA.uniforms.iFrame.value = kFrame;
      matA.uniforms.iTime.value = elapsed2;
      passQuad.material = matA;
      renderer.setRenderTarget(kA2);
      renderer.render(passScene, passCam);
      // Buffer B: layer the fresh A
      matB.uniforms.iChannel0.value = kA2.texture;
      matB.uniforms.iTime.value = elapsed2;
      passQuad.material = matB;
      renderer.setRenderTarget(kB);
      renderer.render(passScene, passCam);
      renderer.setRenderTarget(prevRT);
      /* The rug's OWN pass never got its clock. matA and matB were being
         advanced every frame while floorUniforms sat at iTime 0, iFrame 0
         forever, so the two expensive buffer passes fed a surface frozen at
         the moment of creation. It rendered black and cost full price. */
      floorUniforms.iTime.value = elapsed2;
      floorUniforms.iFrame.value = kFrame;
      [kA, kA2] = [kA2, kA];
      kFrame++;
    };
  }

  let panelIdx = 0;
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
    // chosen slabs wear a shader face, a hair proud of the box
    const ps = PANEL_SHADERS[panelIdx];
    if (ps) {
      if (ps.uniforms.u_scene) {         // the neuro pieces pack res into u_scene
        ps.uniforms.u_scene.value.x = pw * 1000;
        ps.uniforms.u_scene.value.y = ph * 1000;
      } else {
        ps.uniforms.iResolution.value.set(pw * 1000, ph * 1000, 1);
      }
      const face = new THREE.Mesh(new THREE.PlaneGeometry(pw - 0.02, ph - 0.02), ps.mat);
      face.position.copy(center).addScaledVector(wall.normal, 0.041);
      face.lookAt(face.position.clone().add(wall.normal));
      add(face);
    }
    panelIdx++;
    // notes keep clear of the slabs
    wall.voids.push({ u0: pu - 0.04, u1: pu + pw + 0.04, v0: pv - 0.04, v1: pv + ph + 0.04 });
  }
  // the front wall's two painted panels become slabs too; the one by the
  // tele wears the synthwave sunset
  for (const fx4 of [-2.32, 2.2]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.2, 0.07), panelMat);
    slab.position.set(fx4, 1.6, ZF + 0.038);
    slab.castShadow = true;
    add(slab);
    blockers.push(slab);
    ledRim(slab, 0.55, 1.2);
    if (fx4 === 2.2) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.53, 1.18), sunGridMat);
      face.position.set(fx4, 1.6, ZF + 0.079);
      add(face);
    }
    if (fx4 === -2.32) {   // the raymarched sunset rides the other window-wall slab
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.53, 1.18), sunsetMat);
      face.position.set(fx4, 1.6, ZF + 0.079);
      add(face);
    }
  }

  /* --- the window (faces south over LA) --- */
  const WIN = { w: 3.6, h: 1.4, cx: 0, cy: 1.6 };
  const sky = makeOutside();
  const outsideGroupRef = sky.group;   // LA belongs to the bedroom; it culls itself
  // a whole place out there now — rings for the horizon, real streets and
  // blocks for the near depth. the glass is just glass: a whisper of tint,
  // still clickable for the plane hunt
  add(sky.group);
  const glass = add(plane(WIN.w, WIN.h, new THREE.MeshBasicMaterial({
    color: 0xbcd2e8, transparent: true, opacity: 0.05, depthWrite: false,
  })));
  glass.position.set(WIN.cx, WIN.cy, ZF + 0.01);
  glass.userData.glass = true;   // clickable: the plane hunt
  function setParallax() {}      // parallax is geometry now, not a texture slide

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
  // the sun moves: at noon beam.y climbs past 40 (the arena's y-band), so a
  // position test would mis-file it. tag it home so per-room light culling
  // (main.js) keeps the bedroom sun lit instead of treating it as arena.
  beam.userData.cullRoom = "home";
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
      { beacon: beaconOn, plane: planeFx(), zilla, bat }, skyCache.phase);
  }

  function updateSky() {
    const now = new Date();
    const sun = getSunPosition(now, LAT, LNG);
    const moon = getMoonPosition(now, LAT, LNG);
    const { fraction, phase } = getMoonIllumination(now);
    skyCache = { sun, moon, fraction, phase };
    sky.draw(sun, moon, fraction, wx, { beacon: true, plane: planeFx(), zilla, bat }, phase);

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
  // the bedroom door goes somewhere now — whoisthemetro.com/mixandmaster.
  // tag every part (leaf, jambs, knob) so a click anywhere on it counts;
  // main.js catches userData.mixDoor and walks you through.
  entryDoor.traverse((o) => { o.userData.mixDoor = true; });

  /* --- the electronic drum kit, west-front corner ---
     an 80s Simmons: black hexagonal pads on a tubular rack, heads
     tipped up to face whoever walks over, big hex kick front and
     center. the kit sits in the corner angled into the room. --- */
  const edrumHits = [];
  const ekit = new THREE.Group();
  const padMat = () => lam(0x141417);
  const rimMat = new THREE.MeshBasicMaterial({ color: 0x39c2ff });
  const tubeMatE = lam(0x26282e);
  // every pad wears a glowing roman numeral — the order of the secret fill,
  // hiding in plain sight. indexed by pad: kick I, snare II, hat V,
  // hi tom III, lo tom IV, crash VI.
  const EDRUM_NUM = ["I", "II", "V", "III", "IV", "VI"];
  const edrumNumMats = [];
  function numeralTex(s) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = "#fff";
    g.font = "800 76px Archivo, Georgia, serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(s, 64, 68);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  // a numeral lying flat on a striking face, proud of it, glowing cyan at
  // rest (MeshBasic so the toon pass and the dim room can't dull it)
  function numeral(idx, size, y) {
    const m = new THREE.MeshBasicMaterial({
      map: numeralTex(EDRUM_NUM[idx]), transparent: true, opacity: 0.9,
    });
    m.color.setHSL(0.55, 1, 0.6);
    const n = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
    n.rotation.x = -Math.PI / 2;      // lie on the face; the group's lean aims it
    n.position.y = y;
    n.userData.edrum = idx;           // a click on the numeral is a hit too
    edrumNumMats[idx] = m;
    edrumHits.push(n);
    return n;
  }
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
    grp2.add(numeral(idx, r * 1.05, 0.048));
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
  kickGrp.add(numeral(0, 0.2, 0.062));
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
  // pad flash when anyone hits it. the hue is a tell: cyan is just a hit,
  // gold means the hit landed inside the secret fill (main.js decides which)
  const edrumFlash = new Array(6).fill(0);
  const edrumHue = new Array(6).fill(0.55);
  function pressEdrum(pad, hue = 0.55) {
    const i = Math.max(0, Math.min(5, pad));
    edrumFlash[i] = 1;
    edrumHue[i] = hue;
  }
  function tickEdrums(dt) {
    for (let i = 0; i < 6; i++) {
      if (edrumFlash[i] <= 0) continue;
      edrumFlash[i] = Math.max(0, edrumFlash[i] - dt * 5);
      const rim = edrumRims[i];
      // once the flash dies, settle back to the resting cyan no matter
      // what color the flash burned
      const h = edrumFlash[i] > 0 ? edrumHue[i] : 0.55;
      if (rim) rim.material.color.setHSL(h, 1, 0.5 + edrumFlash[i] * 0.45);
      // the numeral burns brighter with the hit, in the same color
      const nm = edrumNumMats[i];
      if (nm) nm.color.setHSL(h, 1, 0.6 + edrumFlash[i] * 0.35);
    }
  }

  /* --- the telecaster, butterscotch blackguard, between desk and rack ---
     a proper '52 silhouette this time: soft bass waist, single cutaway
     horn on the treble side, ashtray bridge with brass saddles, slanted
     bridge pickup, chrome neck pickup, and the scooped headstock. --- */
  const guitarHits = [];
  const tele = new THREE.Group();
  const chromeMat = () => new THREE.MeshStandardMaterial({ color: 0xc6cbd2, metalness: 0.85, roughness: 0.28 });
  // longer than it is wide (32×40 in real life) — get this backwards and
  // the whole guitar reads as a banjo
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-0.02, -0.235);
  bodyShape.quadraticCurveTo(-0.145, -0.23, -0.163, -0.09);
  bodyShape.quadraticCurveTo(-0.168, 0.03, -0.115, 0.083);   // bass waist → shoulder
  bodyShape.quadraticCurveTo(-0.065, 0.13, -0.028, 0.142);   // shoulder rolls into the neck
  bodyShape.lineTo(0.028, 0.142);                            // across the neck heel
  bodyShape.quadraticCurveTo(0.036, 0.06, 0.085, 0.05);      // the cutaway scoop
  bodyShape.quadraticCurveTo(0.145, 0.065, 0.152, -0.015);   // treble horn → waist
  bodyShape.quadraticCurveTo(0.16, -0.15, 0.08, -0.215);
  bodyShape.quadraticCurveTo(0.028, -0.245, -0.02, -0.235);
  const teleBody = new THREE.Mesh(
    new THREE.ExtrudeGeometry(bodyShape, { depth: 0.045, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.008, bevelSegments: 2 }),
    lam(0xe9b452));
  // the solid body is silent — only the strings/fretboard/neck sound (it stays
  // a blocker below so the body is still click-solid, just doesn't pluck)
  tele.add(teleBody);
  // the blackguard — what makes a butterscotch tele read from across a room
  const guardShape = new THREE.Shape();
  guardShape.moveTo(-0.1, -0.14);
  guardShape.quadraticCurveTo(-0.148, -0.03, -0.104, 0.055);
  guardShape.quadraticCurveTo(-0.065, 0.115, -0.028, 0.12);
  guardShape.lineTo(0.026, 0.12);
  guardShape.lineTo(0.03, 0.03);
  guardShape.quadraticCurveTo(0.024, -0.075, -0.035, -0.115);
  guardShape.quadraticCurveTo(-0.08, -0.15, -0.1, -0.14);
  const guard = new THREE.Mesh(new THREE.ExtrudeGeometry(guardShape, { depth: 0.004, bevelEnabled: false }),
    lam(0x17181c));
  guard.position.z = 0.055;   // proud of the beveled body face (z≈0.053)
  tele.add(guard);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.58, 0.022), lam(0xd8b878));
  neck.position.set(0.0, 0.155 + 0.29 - 0.02, 0.022);
  neck.userData.guitar = true;
  tele.add(neck);
  const fretboard = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.58, 0.005), lam(0x4a3526));
  fretboard.position.set(0, neck.position.y, 0.036);
  fretboard.userData.guitar = true;
  tele.add(fretboard);
  // frets crowd together as they climb, like the real fingerboard does
  for (let i = 0; i < 10; i++) {
    const fy = fretboard.position.y - 0.26 + Math.pow(i / 9, 0.85) * 0.5;
    const fret = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.0035, 0.0015),
      new THREE.MeshBasicMaterial({ color: 0xb9bec6 }));
    fret.position.set(0, fy, 0.039);
    tele.add(fret);
  }
  for (const dy of [-0.13, 0, 0.13]) {                       // dot inlays
    const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.002, 8), lam(0xe8e2d2));
    dot.rotation.x = Math.PI / 2;
    dot.position.set(0, fretboard.position.y + dy, 0.0395);
    tele.add(dot);
  }
  // the scooped headstock, tuners marching down the bass edge
  const headShape = new THREE.Shape();
  headShape.moveTo(-0.0275, 0);
  headShape.lineTo(0.0275, 0);
  headShape.quadraticCurveTo(0.038, 0.045, 0.034, 0.08);
  headShape.quadraticCurveTo(0.03, 0.115, -0.004, 0.122);
  headShape.quadraticCurveTo(-0.036, 0.124, -0.046, 0.108);
  headShape.quadraticCurveTo(-0.052, 0.096, -0.038, 0.085);  // the scoop
  headShape.quadraticCurveTo(-0.0275, 0.06, -0.0275, 0);
  const head = new THREE.Mesh(new THREE.ExtrudeGeometry(headShape, { depth: 0.014, bevelEnabled: false }),
    lam(0xe2c685));
  head.position.set(0, 0.155 + 0.575, 0.016);
  tele.add(head);
  for (let i = 0; i < 6; i++) {
    const tuner = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.012, 8), chromeMat());
    tuner.rotation.z = Math.PI / 2;                          // barrels out the bass side
    tuner.position.set(-0.042, 0.155 + 0.588 + i * 0.0155, 0.023);
    tele.add(tuner);
  }
  const nut = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.006, 0.007), lam(0xe8e2d2));
  nut.position.set(0, 0.155 + 0.572, 0.058);
  tele.add(nut);
  // six strings, gauged — wound bass strings visibly fatter than the plain
  // trebles. they + fretboard + neck are what pluck; three fat invisible
  // grips keep the thin strings actually clickable.
  const strings = [];
  for (let i = 0; i < 6; i++) {
    const str = new THREE.Mesh(
      new THREE.BoxGeometry(0.0016 + (5 - i) * 0.0002, 0.855, 0.0018),
      new THREE.MeshBasicMaterial({ color: 0xd9dde2 }));
    str.position.set(-0.0125 + i * 0.005, 0.3, 0.061);       // bridge → nut, the full run
    tele.add(str);
  }
  for (const sx of [-0.012, 0, 0.012]) {
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.855, 0.012),
      new THREE.MeshBasicMaterial({ visible: false }));
    grip.position.set(sx, 0.3, 0.061);
    grip.userData.guitar = true;
    tele.add(grip);
    strings.push(grip);
  }
  // ashtray bridge plate, three brass barrel saddles, slanted bridge pickup
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.075, 0.008), chromeMat());
  bridge.position.set(0, -0.13, 0.057);
  tele.add(bridge);
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd8b25e, metalness: 0.7, roughness: 0.35 });
  for (const sx of [-0.011, 0, 0.011]) {
    const saddle = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.011, 8), brassMat);
    saddle.rotation.z = Math.PI / 2;
    saddle.position.set(sx, -0.143, 0.066);
    tele.add(saddle);
  }
  const bpu = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.014, 0.006), lam(0x101114));
  bpu.position.set(0, -0.1, 0.062);
  bpu.rotation.z = -0.14;                                    // the tele slant
  tele.add(bpu);
  const npu = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.007), chromeMat());
  npu.position.set(0, 0.115, 0.062);
  tele.add(npu);
  // chrome control plate along the treble edge: blade selector (the voice
  // switch — its own click target so a flick doesn't sound a fret) + two
  // knurled knobs for looks
  const ctrl = new THREE.Group();
  ctrl.position.set(0.088, -0.1, 0);
  ctrl.rotation.z = -0.7;
  tele.add(ctrl);
  const ctrlPlate = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.028, 0.006), chromeMat());
  ctrlPlate.position.z = 0.06;
  ctrlPlate.userData.guitarVoice = true;
  ctrl.add(ctrlPlate);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.022, 0.014), lam(0x16181c));
  blade.position.set(-0.03, 0, 0.068);
  blade.userData.guitarVoice = true;
  ctrl.add(blade);
  for (const off of [0.008, 0.032]) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.014, 12), chromeMat());
    knob.rotation.x = Math.PI / 2;
    knob.position.set(off, 0, 0.064);
    knob.userData.guitarVoice = true;
    ctrl.add(knob);
  }
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
  // north (long) wall only — the SOUTH wall is built down in the elevator
  // section, where it gets a doorway cut into it for the lift
  {
    const side = plane(arcW, ARC_H, arcMatWall.clone());
    side.rotation.y = Math.PI;
    side.position.set((AR.x0 + AR.x1) / 2, ARC_H / 2, AR.z1);
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
    side: THREE.DoubleSide,
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
  // deep neon pools — short throw, far from the bedroom wall. the SOUTH wall
  // is a second boundary now that the bathroom lives behind it: this one used
  // to sit 1.2 m off that wall throwing 4.2 m, which painted the bathroom's
  // white tile pink straight through the brick. pulled north and reined in so
  // its throw dies with 10 cm to spare.
  const magenta = add(new THREE.PointLight(0xff2da0, 11, 2.3, 2));
  magenta.position.set(-12, 2.3, -3.5);
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
    // hung low enough to actually reach the TABLE TOP, not just the seats:
    // the scanned props are PBR (they load after the toon pass, so they keep
    // their own materials) and a metre and a half of falloff left them black.
    // the throw is unchanged, so it still can't reach past the bedroom wall —
    // dropping the light only moves it closer to what it's meant to light.
    const down = add(new THREE.PointLight(0xffb070, 13, 1.5, 2));
    down.position.set(AR.x1 - 0.6, 1.5, z);
  }
  // each prop lives in its own little group sitting ON the table's top face,
  // so a scanned model can take the stand-in's place without anyone having to
  // re-derive where a table is
  const TABLE_TOP = 0.535;
  const smokeProps = {};
  {
    // the bong, on the north table — green glass, doing its best
    const t1 = smokeTable(CZ + 1.7, 0x22d4ff);
    const bongHost = new THREE.Group(); bongHost.position.y = TABLE_TOP; t1.add(bongHost);
    const glass = new THREE.MeshLambertMaterial({ color: 0x6fae7e, transparent: true, opacity: 0.55 });
    const base = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), glass);
    base.position.y = 0.065;
    base.scale.y = 0.8;
    bongHost.add(base);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.034, 0.3, 10), glass);
    neck.position.y = 0.225;
    bongHost.add(neck);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.012, 0.09, 8), lam(0x3c3328));
    bowl.position.set(0.07, 0.095, 0);
    bowl.rotation.z = -0.8;
    bongHost.add(bowl);
    for (const m of [base, neck, bowl]) { m.userData.smoke = "bong"; smokeHits.push(m); }
    smokeSpots.bong = new THREE.Vector3(AR.x1 - 0.38, 0.93, CZ + 1.7);
    smokeProps.bong = bongHost;

    // ashtray + a waiting joint on the south table
    const t2 = smokeTable(CZ - 1.7, 0xff2da0);
    const ashHost = new THREE.Group(); ashHost.position.y = TABLE_TOP; t2.add(ashHost);
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.03, 12), lam(0x4a4f5a));
    tray.position.y = 0.015;
    ashHost.add(tray);
    // the joint rests ACROSS the tray's rim, not down in the bowl — the real
    // ashtray is a deep footed thing and a joint dropped inside it vanishes
    const jointHost = new THREE.Group();
    jointHost.position.set(0.052, TABLE_TOP + 0.072, 0.012);
    jointHost.rotation.set(0, 0.5, 1.4);
    t2.add(jointHost);
    const joint = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.075, 6), lam(0xe8e2d2));
    jointHost.add(joint);
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xff7a30 }));
    ember.position.set(0.082, 0.055, 0.038);
    ashHost.add(ember);
    for (const m of [tray, joint]) { m.userData.smoke = "joint"; smokeHits.push(m); }
    smokeSpots.joint = new THREE.Vector3(AR.x1 - 0.32, 0.62, CZ - 1.68);
    smokeProps.ashtray = ashHost;
    smokeProps.joint = jointHost;
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

  /* --- THE PODIUM: where you build the person everyone else sees ---------
     The mirror shows you a PICTURE of yourself, 40 cm wide, in a frame. This
     is you at full size, standing in the room, and it's the corner nearest
     the smoking tables — the one bit of this hall nobody had a use for.
     It sits on the 45° out of that corner and faces the room, so there's no
     angle you can come at it from where you're looking at its back.
     world.js only builds the FURNITURE. main.js hangs the figure in `mount`
     (built from your outfit spec, or your .glb if you're wearing one) —
     avatars are Lambert on purpose and the toon pass at the end of
     buildWorld would eat any figure that existed by then. --- */
  const POD = { x: -4.75, z: 4.02, ry: -Math.PI * 0.75, top: 0.26 };
  const POD_R = 0.9, POD_ARC = 1.05;   // backdrop radius + half-angle. CHECK THE ENDS,
  // not the back: at ±1.05 rad they sit nearly at the podium's sides, and the
  // two walls are only 70 cm away on the diagonal.
  const podGroup = new THREE.Group();
  podGroup.position.set(POD.x, 0, POD.z);
  podGroup.rotation.y = POD.ry;                 // +z is its front; this aims it into the hall
  add(podGroup);
  const podHits = [];
  {
    const padd = (m) => { podGroup.add(m); return m; };
    // the backdrop: an arc of wall behind the figure so it reads against
    // something instead of against a dark corner. its own faint emissive does
    // the lifting — a light here would be 70 cm from two walls.
    const back = new THREE.Mesh(
      new THREE.CylinderGeometry(POD_R, POD_R, 2.62, 20, 1, true, Math.PI - POD_ARC, POD_ARC * 2),
      new THREE.MeshLambertMaterial({ color: 0x1b1728, emissive: 0x2a2348, side: THREE.DoubleSide }));
    back.position.y = 1.31; padd(back);
    // neon down both open edges of the arc — the same trick the lift and the
    // restrooms door use: in a hall this dark a lit edge carries a long way
    const podNeon = new THREE.MeshBasicMaterial({ color: 0xff2da0 });
    for (const s of [-1, 1]) {
      const a = Math.PI + s * POD_ARC;
      const e = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 2.62, 6), podNeon);
      e.position.set(Math.sin(a) * POD_R, 1.31, Math.cos(a) * POD_R); padd(e);
    }
    // the plinth: two steps, with a neon rim on the tread you stand on
    const step0 = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.7, 0.1, 24), lam(0x232232));
    step0.position.y = 0.05; padd(step0);
    const step1 = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.62, 0.16, 24), lam(0x2c2a3e));
    step1.position.y = 0.18; padd(step1);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.012, 6, 32), podNeon);
    rim.rotation.x = Math.PI / 2; rim.position.y = POD.top; padd(rim);
    blockers.push(step0, step1);
    NO_WALK.push({ x0: POD.x - 0.82, x1: POD.x + 0.82, z0: POD.z - 0.82, z1: POD.z + 0.82 });

    // the sign, hung off the top of the backdrop
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 0.26),
      new THREE.MeshBasicMaterial({
        map: canvasTex(408, 104, (g) => {
          g.fillStyle = "#0a0610"; g.fillRect(0, 0, 408, 104);
          g.font = "900 46px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
          g.fillStyle = "#ff2da0"; g.shadowColor = "#ff2da0"; g.shadowBlur = 14;
          g.fillText("YOUR LOOK", 204, 56);
        }), transparent: true,
      }));
    sign.position.set(0, 2.5, 0.12); padd(sign);

    // one grab volume for the whole figure: click it to open the creator,
    // hold and drag it to turn yourself around
    const grab = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 2.06, 12, 1, true),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    grab.position.y = 1.06;
    grab.userData.podium = true; padd(grab); podHits.push(grab);

    /* light. two walls sit 70 cm away, so this is a SPOT pointing almost
       straight down: every direction inside a 20° cone from 3.3 m still lands
       on the plinth, and the nearest thing on the far side of either wall is
       2 m out horizontally — outside the cone by a mile, whatever `distance`
       says. Aimed away beats leashed; see the rules in CLAUDE.md. */
    const podSpot = new THREE.SpotLight(0xffe4c4, 48, 4.4, 0.38, 0.5, 2);
    podSpot.position.set(POD.x, 3.3, POD.z);
    podSpot.target.position.set(POD.x, 0.2, POD.z);
    add(podSpot); add(podSpot.target);
    const podFix = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.07, 10), lam(0x0c0e12));
    podFix.position.set(POD.x, 3.34, POD.z); add(podFix);
  }
  // main.js owns what STANDS here; world.js owns the furniture it stands on
  const podMount = new THREE.Group();
  podMount.position.y = POD.top;
  podGroup.add(podMount);

  /* --- the MARQUEE: high scores where the sign used to be -----------------
     The old neon "METRO'S ARCADE" said the room's name to a room you were
     already standing in. This says something you'd actually stop and read:
     who holds each machine. It cycles the four cabinets, and it's built
     like a real marquee — a bulb chase around the border, a scanned CRT
     face, rows that clatter in one at a time like a departure board. --- */
  const MQ = { w: 1024, h: 512 };
  const mqCanvas = document.createElement("canvas");
  mqCanvas.width = MQ.w; mqCanvas.height = MQ.h;
  const mqCtx = mqCanvas.getContext("2d");
  const mqTex = new THREE.CanvasTexture(mqCanvas);
  mqTex.colorSpace = THREE.SRGBColorSpace;

  // one entry per cabinet, in the order they stand along the wall
  const MQ_GAMES = [
    { id: "defender", label: "DEFENDER", hue: "#ff3434", dim: "#5e1512" },
    { id: "pac",      label: "PAC-MAN",  hue: "#ffe737", dim: "#5e5410" },
    { id: "tron",     label: "TRON",     hue: "#22d4ff", dim: "#0d4a5e" },
    { id: "pong",     label: "PONG",     hue: "#e8e8e8", dim: "#4a4a4a" },
  ];
  const mqScores = {};                 // id -> [{name, score}]
  let mqIdx = 0, mqT = 0, mqFlash = 0;
  const MQ_HOLD = 6.0, MQ_WIPE = 0.85;

  const mqRound = (g, x, y, w, h, r) => {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  };

  function drawMarquee(t) {
    const g = mqCtx;
    const cur = MQ_GAMES[mqIdx];
    const nxt = MQ_GAMES[(mqIdx + 1) % MQ_GAMES.length];
    // 0 while holding, 0..1 across the wipe
    const wipe = mqT > MQ_HOLD ? Math.min(1, (mqT - MQ_HOLD) / MQ_WIPE) : 0;
    const ease = wipe < 0.5 ? 2 * wipe * wipe : 1 - Math.pow(-2 * wipe + 2, 2) / 2;
    const show = wipe > 0.5 ? nxt : cur;          // the face swaps at the midpoint
    const rows = (mqScores[show.id] || []).slice(0, 5);

    g.fillStyle = "#05060a";
    g.fillRect(0, 0, MQ.w, MQ.h);

    // --- the cabinet's own glow behind the glass ---
    const glow = g.createRadialGradient(MQ.w / 2, MQ.h * 0.55, 40, MQ.w / 2, MQ.h * 0.55, MQ.w * 0.62);
    glow.addColorStop(0, show.dim);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    g.globalAlpha = 0.55 + 0.12 * Math.sin(t * 2.2);
    g.fillStyle = glow;
    g.fillRect(0, 0, MQ.w, MQ.h);
    g.globalAlpha = 1;

    // --- header: the room's name stays, small, above the game ---
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "500 40px 'Six Caps', sans-serif";
    g.letterSpacing = "10px";
    g.fillStyle = "rgba(255,150,215,0.75)";
    g.fillText("METRO'S ARCADE", MQ.w / 2, 58);
    g.letterSpacing = "0px";

    // --- the game name, sliding through on the wipe ---
    const slide = (1 - Math.cos(Math.min(1, wipe) * Math.PI * 2)) * 0.5;   // out and back
    const nameX = MQ.w / 2 + (wipe > 0.5 ? (1 - ease) : -ease) * 420;
    g.save();
    g.globalAlpha = 1 - slide * 0.85;
    g.font = "900 78px monospace";
    g.shadowColor = show.hue; g.shadowBlur = 26;
    g.fillStyle = show.hue;
    g.fillText(show.label, nameX, 132);
    g.shadowBlur = 0;
    g.restore();

    // --- HIGH SCORES rule ---
    g.font = "700 20px monospace";
    g.letterSpacing = "6px";
    g.fillStyle = "rgba(220,232,244,0.5)";
    g.fillText("H I G H   S C O R E S", MQ.w / 2, 186);
    g.letterSpacing = "0px";
    g.fillStyle = show.hue;
    g.globalAlpha = 0.35;
    g.fillRect(150, 202, MQ.w - 300, 2);
    g.globalAlpha = 1;

    // --- the rows: each clatters in on its own beat ---
    if (!rows.length) {
      g.font = "900 40px monospace";
      g.fillStyle = Math.floor(t * 1.6) % 2 ? show.hue : "rgba(120,130,150,0.6)";
      g.fillText("BE THE FIRST", MQ.w / 2, 320);
    }
    rows.forEach((r, i) => {
      // stagger: row i lands a beat after row i-1 once the wipe is done
      const local = Math.max(0, Math.min(1, (wipe > 0.5 ? (wipe - 0.5) / 0.5 : 1) * 1.6 - i * 0.18));
      const e = 1 - Math.pow(1 - local, 3);
      const y = 250 + i * 50;
      const x0 = 140 + (1 - e) * 260;
      g.globalAlpha = e;

      const gold = i === 0;
      if (gold) {
        // the leader gets a plate that catches a moving highlight
        const sweep = ((t * 0.35) % 1) * (MQ.w - 200);
        const plate = g.createLinearGradient(100, 0, MQ.w - 100, 0);
        plate.addColorStop(0, "rgba(255,210,60,0.06)");
        plate.addColorStop(Math.max(0, Math.min(1, sweep / (MQ.w - 200))), "rgba(255,210,60,0.22)");
        plate.addColorStop(1, "rgba(255,210,60,0.06)");
        g.fillStyle = plate;
        mqRound(g, 110, y - 24, MQ.w - 220, 44, 8);
        g.fill();
      }

      g.textAlign = "left";
      g.font = "900 34px monospace";
      g.fillStyle = gold ? "#ffd23c" : "rgba(150,164,184,0.9)";
      g.fillText(String(i + 1), x0 - 44, y);
      g.fillStyle = gold ? "#fff4cf" : "#d3dae4";
      g.fillText(String(r.name || "anon").slice(0, 12).toUpperCase(), x0, y);
      g.textAlign = "right";
      g.font = "900 34px monospace";
      g.fillStyle = gold ? "#ffd23c" : show.hue;
      g.fillText(String(r.score), MQ.w - 140 - (1 - e) * 260, y);
      g.globalAlpha = 1;
    });

    // --- a new score just landed: the whole face flashes ---
    if (mqFlash > 0) {
      g.fillStyle = `rgba(255,255,255,${0.5 * mqFlash * mqFlash})`;
      g.fillRect(0, 0, MQ.w, MQ.h);
    }

    // --- CRT: scanlines, a rolling bright band, and soft vignette corners ---
    g.globalAlpha = 0.16;
    g.fillStyle = "#000";
    for (let y = 0; y < MQ.h; y += 4) g.fillRect(0, y, MQ.w, 2);
    g.globalAlpha = 1;
    const roll = ((t * 0.16) % 1.4 - 0.2) * MQ.h;
    const band = g.createLinearGradient(0, roll, 0, roll + 90);
    band.addColorStop(0, "rgba(255,255,255,0)");
    band.addColorStop(0.5, "rgba(255,255,255,0.045)");
    band.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = band;
    g.fillRect(0, roll, MQ.w, 90);

    // --- the bulb chase around the border: what makes it a marquee ---
    const bulbs = [];
    const M = 26, SP = 46;
    for (let x = M; x <= MQ.w - M; x += SP) { bulbs.push([x, M]); bulbs.push([x, MQ.h - M]); }
    for (let y = M + SP; y <= MQ.h - M - SP; y += SP) { bulbs.push([M, y]); bulbs.push([MQ.w - M, y]); }
    bulbs.forEach(([bx, by], i) => {
      // three lamps chasing round the ring, plus a slow overall shimmer
      const phase = (i / bulbs.length + t * 0.11) % 1;
      const chase = Math.pow(Math.max(0, Math.cos(phase * Math.PI * 2 * 3)), 6);
      const lit = 0.28 + 0.72 * chase;
      g.fillStyle = `rgba(255,236,190,${0.10 + lit * 0.55})`;
      g.beginPath(); g.arc(bx, by, 5 + lit * 3.5, 0, 7); g.fill();
      if (lit > 0.6) {
        g.fillStyle = `rgba(255,246,220,${(lit - 0.6) * 0.7})`;
        g.beginPath(); g.arc(bx, by, 13, 0, 7); g.fill();
      }
    });
    // the frame the bulbs are screwed to
    g.strokeStyle = show.hue;
    g.globalAlpha = 0.5 + 0.18 * Math.sin(t * 2.6);
    g.lineWidth = 3;
    mqRound(g, 12, 12, MQ.w - 24, MQ.h - 24, 16);
    g.stroke();
    g.globalAlpha = 1;

    mqTex.needsUpdate = true;
  }

  const marquee = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2),
    new THREE.MeshBasicMaterial({ map: mqTex, transparent: true }));
  marquee.rotation.y = Math.PI / 2;
  // hung high: the cabinets stand 1.78 and the ceiling is 4.3, so the whole
  // board has to live in between or the last name is behind a machine
  marquee.position.set(AR.x0 + 0.03, 3.03, (AR.z0 + AR.z1) / 2);
  add(marquee);
  // a wash of the current game's colour bleeding onto the wall behind it
  const mqWash = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.6),
    new THREE.MeshBasicMaterial({
      color: 0xff3434, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false,
      map: canvasTex(64, 64, (g) => {
        const rg = g.createRadialGradient(32, 32, 2, 32, 32, 32);
        rg.addColorStop(0, "rgba(255,255,255,1)");
        rg.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
      }),
    }));
  mqWash.rotation.y = Math.PI / 2;
  mqWash.position.set(AR.x0 + 0.02, 3.03, (AR.z0 + AR.z1) / 2);
  mqWash.renderOrder = -1;
  add(mqWash);

  const _mqCol = new THREE.Color();
  let mqAcc = 0;
  function tickMarquee(dt, t, ppos) {
    // the clock runs whether or not anyone's in the room — walk in and the
    // board is already mid-cycle, like it never stopped
    mqT += dt;
    if (mqT > MQ_HOLD + MQ_WIPE) { mqT = 0; mqIdx = (mqIdx + 1) % MQ_GAMES.length; }
    mqFlash = Math.max(0, mqFlash - dt * 1.6);
    const wipe = mqT > MQ_HOLD ? Math.min(1, (mqT - MQ_HOLD) / MQ_WIPE) : 0;
    const show = MQ_GAMES[wipe > 0.5 ? (mqIdx + 1) % MQ_GAMES.length : mqIdx];
    mqWash.material.color.lerp(_mqCol.set(show.hue), Math.min(1, dt * 3));
    mqWash.material.opacity = 0.13 + 0.05 * Math.sin(t * 2.2) + mqFlash * 0.5;
    // repainting a megapixel and shipping it to the GPU is the expensive part,
    // so it only happens where the board can be seen — inside the arcade —
    // and at 30 Hz, which is plenty for a bulb chase
    if (!ppos || ppos.x < AR.x0 - 2 || ppos.x > AR.x1 + 3 ||
        ppos.z < AR.z0 - 2 || ppos.z > AR.z1 + 2) return;
    mqAcc += dt;
    if (mqAcc < 1 / 30) return;
    mqAcc = 0;
    drawMarquee(t);
  }
  // main.js hands us every board at once: { defender: [...], pac: [...], ... }
  function setScores(map, flash = false) {
    for (const k in map) mqScores[k] = map[k] || [];
    if (flash) mqFlash = 1;
  }
  drawMarquee(0);

  /* --- arcade elevator: a real car you step INTO, recessed into the south
     wall like a building lift — only the doors are flush; the cab is carved
     in behind. it replaces the echo poster AND the computer's room menu.
     walk up, hit CALL, the doors part with a chime; step in; the floor
     buttons on the back wall are the rooms. pick one and the doors shut, the
     car hums, the world fades. it sits left of the hoop. body/frame are
     Lambert (cel-shaded with the room); every lit sign/button is MeshBasic
     so it glows. --- */
  const ELC = { x: -18.05, w: 1.80, d: 1.45, h: 2.25, dh: 2.05 }; // cab: center-x, width, depth INTO wall, ceiling, door-height
  const zWall = AR.z0;                       // the south wall plane — doors sit flush here
  const zBack = zWall - ELC.d;               // the cab's back wall, recessed behind the wall
  const zMid = (zWall + zBack) / 2;
  const xW = ELC.x - ELC.w / 2, xE = ELC.x + ELC.w / 2;      // cab side walls (-18.95 / -17.15)
  const OW = 1.14, xOL = ELC.x - OW / 2, xOR = ELC.x + OW / 2; // doorway opening + its edges
  const elBody = lam(0x23272e);             // brushed-graphite cab shell
  const elDoorMat = lam(0x33424e);          // doors a touch bluer than the shell
  const elTrim = lam(0x4a515c);
  // the BATHROOM is cut from this same wall (the room itself is built in its
  // own section below) — its door edges are declared up here so the one wall
  // loop can leave both holes in a single pass.
  // 8.4 x 4.2 and centred on its own door, which is what the floor plan wants.
  // The door sits at -10.5 because that's the one stretch of this wall that
  // isn't behind something: further west it opens into the middle of the
  // basketball court. Holding it here pushes the room's east end out over the
  // bar, so the bar's pendants had to become a low lamp with a short throw —
  // see the note there. The lift's cab bounds the west end at -14.7.
  const BATH = { x: -10.5, w: 8.4, d: 4.2, h: 2.7, dw: 1.15, dh: 2.05 };
  const bxL = BATH.x - BATH.dw / 2, bxR = BATH.x + BATH.dw / 2;
  const BPX1 = BATH.x - 0.95, BPX2 = BATH.x + 0.95;   // the two bay partitions
  // CUT THE SOUTH WALL around both doorways: segments between the holes + a
  // lintel above each. (the rest of the arcade's south wall is built here,
  // not in the wall loop, because the lift and the bathroom need holes in it.)
  for (const [sx0, sx1] of [[AR.x0, xOL], [xOR, bxL], [bxR, AR.x1]]) {
    const seg = plane(sx1 - sx0, ARC_H, arcMatWall.clone());
    seg.position.set((sx0 + sx1) / 2, ARC_H / 2, zWall); add(seg);
  }
  const elLintel = plane(OW, ARC_H - ELC.dh, arcMatWall.clone());
  elLintel.position.set(ELC.x, (ARC_H + ELC.dh) / 2, zWall); add(elLintel);
  const bathLintel = plane(BATH.dw, ARC_H - BATH.dh, arcMatWall.clone());
  bathLintel.position.set(BATH.x, (ARC_H + BATH.dh) / 2, zWall); add(bathLintel);
  // the cab shell, recessed behind the wall: back + two sides + ceiling + floor
  const elBack = box(ELC.w, ELC.h, 0.07, elBody);
  elBack.position.set(ELC.x, ELC.h / 2, zBack - 0.035); add(elBack);
  for (const wx of [xW, xE]) {
    const sw = box(0.07, ELC.h, ELC.d, elBody);
    sw.position.set(wx, ELC.h / 2, zMid); add(sw);
  }
  const elCeil = box(ELC.w, 0.07, ELC.d, elBody);
  elCeil.position.set(ELC.x, ELC.h, zMid); add(elCeil);
  // floor pad runs from the back to just past the threshold (no gap underfoot)
  const elPad = box(ELC.w - 0.12, 0.04, ELC.d + 0.08, lam(0x1a1d22));
  elPad.position.set(ELC.x, 0.02, zMid + 0.04); add(elPad);
  const elPadLine = box(ELC.w - 0.4, 0.045, 0.04, new THREE.MeshBasicMaterial({ color: 0x2b3340 }));
  elPadLine.position.set(ELC.x, 0.022, zMid); add(elPadLine);
  // a steel frame lining the opening (jambs + sill + head), set in the reveal
  for (const jx of [xOL + 0.04, xOR - 0.04]) {
    const jamb = box(0.08, ELC.dh, 0.12, elTrim);
    jamb.position.set(jx, ELC.dh / 2, zWall - 0.04); add(jamb);
  }
  const elSill = box(OW, 0.04, 0.16, elTrim);
  elSill.position.set(ELC.x, 0.022, zWall - 0.03); add(elSill);
  const elHeadTrim = box(OW + 0.06, 0.1, 0.12, elTrim);
  elHeadTrim.position.set(ELC.x, ELC.dh + 0.03, zWall - 0.04); add(elHeadTrim);
  // neon outline of the doorway, proud on the arcade side (emissive)
  const elNeon = new THREE.MeshBasicMaterial({ color: 0x57d9ff });
  for (const nx of [xOL - 0.03, xOR + 0.03]) {
    const v = box(0.03, ELC.dh + 0.06, 0.03, elNeon);
    v.position.set(nx, (ELC.dh + 0.06) / 2, zWall + 0.04); add(v);
  }
  const elNeonTop = box(OW + 0.12, 0.03, 0.03, elNeon);
  elNeonTop.position.set(ELC.x, ELC.dh + 0.06, zWall + 0.04); add(elNeonTop);
  // the two sliding leaves — flush-ish, just behind the wall face, so when they
  // part they slide behind the wall (out of sight) and reveal the cab
  const elLeafW = 0.60, elLeafH = ELC.dh - 0.04;
  const elLeafLx = ELC.x - OW / 4, elLeafRx = ELC.x + OW / 4;   // closed centers
  const zLeaf = zWall - 0.06;
  const elevDoorL = box(elLeafW, elLeafH, 0.05, elDoorMat);
  const elevDoorR = box(elLeafW, elLeafH, 0.05, elDoorMat);
  elevDoorL.position.set(elLeafLx, elLeafH / 2 + 0.02, zLeaf);
  elevDoorR.position.set(elLeafRx, elLeafH / 2 + 0.02, zLeaf);
  add(elevDoorL); add(elevDoorR);
  elevDoorL.userData.elevCall = true; elevDoorR.userData.elevCall = true;   // tap the doors to call, too
  // a hairline of light down the seam (fades as the leaves part)
  const elSeam = box(0.014, elLeafH - 0.1, 0.014,
    new THREE.MeshBasicMaterial({ color: 0x7fe9ff, transparent: true }));
  elSeam.position.set(ELC.x, elLeafH / 2 + 0.02, zLeaf + 0.03); add(elSeam);
  // a lit floor-display above the doors, on the arcade side
  const elSign = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.13),
    new THREE.MeshBasicMaterial({
      map: canvasTex(256, 40, (g) => {
        g.fillStyle = "#05070c"; g.fillRect(0, 0, 256, 40);
        g.font = "900 22px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillStyle = "#ffd23c"; g.shadowColor = "#ffd23c"; g.shadowBlur = 8;
        g.fillText("▲ METRO LIFT ▼", 128, 21);
      }), transparent: true,
    }));
  elSign.position.set(ELC.x, ELC.dh + 0.28, zWall + 0.05); add(elSign);
  // the CALL button on the wall to the right of the doors, on the arcade side
  const elCallTex = canvasTex(96, 128, (g) => {
    g.fillStyle = "#0a0c12"; g.fillRect(0, 0, 96, 128);
    g.strokeStyle = "#3bff9d"; g.lineWidth = 4; g.strokeRect(6, 6, 84, 116);
    g.fillStyle = "#3bff9d"; g.shadowColor = "#3bff9d"; g.shadowBlur = 12;
    g.font = "900 30px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("▲", 48, 34); g.fillText("▼", 48, 70);
    g.font = "900 18px monospace"; g.fillText("CALL", 48, 102);
  });
  const elCall = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.22),
    new THREE.MeshBasicMaterial({ map: elCallTex, transparent: true }));
  elCall.position.set(xOR + 0.18, 1.25, zWall + 0.05);
  elCall.userData.elevCall = true;
  add(elCall);
  // INSIDE: the floor buttons, a 2×2 grid on the back wall facing whoever enters
  const elevHits = [];
  const FLOORS = [
    ["home",  "HOME",      "🛏️", "#ffb454", -1, 1],
    ["desi",  "THE DESI",  "🌊",        "#29c5ff",  1, 1],
    ["crew",  "THE CREW",  "🥏",        "#ff8a3c", -1, 0],
    ["venue", "THE VENUE", "🪩",        "#ff3da0",  1, 0],
  ];
  const zPanel = zBack + 0.10;             // the lit buttons stand proud of the backlit plate, toward the door
  const elBtnPanel = box(1.5, 1.06, 0.05, lam(0x0d0f15));
  elBtnPanel.position.set(ELC.x, 1.18, zBack + 0.04); add(elBtnPanel);
  const elInSign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.12),
    new THREE.MeshBasicMaterial({
      map: canvasTex(320, 38, (g) => {
        g.fillStyle = "#05070c"; g.fillRect(0, 0, 320, 38);
        g.font = "900 20px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillStyle = "#57d9ff"; g.shadowColor = "#57d9ff"; g.shadowBlur = 8;
        g.fillText("◇ SELECT A FLOOR ◇", 160, 20);
      }), transparent: true,
    }));
  elInSign.position.set(ELC.x, 1.78, zPanel); add(elInSign);
  FLOORS.forEach(([floor, label, emoji, accent, col, row]) => {
    const x = ELC.x + col * 0.36;
    const y = 1.0 + row * 0.42;
    const tex = canvasTex(256, 150, (g) => {
      g.fillStyle = "#0a0c12"; g.fillRect(0, 0, 256, 150);
      g.fillStyle = accent; g.fillRect(0, 0, 256, 12);       // accent cap
      g.font = "62px serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(emoji, 128, 64);
      g.font = "900 30px monospace";
      g.fillStyle = "#eaf2ff"; g.shadowColor = accent; g.shadowBlur = 10;
      g.fillText(label, 128, 118);
    });
    const ring = box(0.6, 0.36, 0.012, new THREE.MeshBasicMaterial({ color: accent }));
    ring.position.set(x, y, zPanel - 0.012); add(ring);   // seated behind the plate's face
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.57, 0.33),
      new THREE.MeshBasicMaterial({ map: tex }));
    plate.position.set(x, y, zPanel);
    plate.userData.elevFloor = floor;
    plate.userData.elevLabel = label;
    add(plate);
    elevHits.push(plate);
  });
  const elevCallHits = [elCall, elevDoorL, elevDoorR];
  // a warm light + a glowing ceiling panel so the cab interior isn't a cave.
  // the light is OFF when shut (so it can't leak through the wall into the
  // arcade) and ramps up as the doors open.
  const elCeilGlow = box(ELC.w - 0.3, 0.02, ELC.d - 0.3, new THREE.MeshBasicMaterial({ color: 0xffeccb }));
  elCeilGlow.position.set(ELC.x, ELC.h - 0.05, zMid); add(elCeilGlow);
  const elLight = new THREE.PointLight(0xffe6bf, 0, 2.8, 2);
  elLight.position.set(ELC.x, ELC.h - 0.25, zMid); add(elLight);
  // door glide state — eased every frame in tick (0 shut, 1 open)
  let elevDoorPos = 0, elevDoorTarget = 0;
  const setElevatorDoors = (open) => { elevDoorTarget = open ? 1 : 0; };
  const elevatorOpen = () => elevDoorPos > 0.55;
  // the cab sits behind the south wall, outside the arcade floor — so it (and
  // its threshold) only become walkable once the doors are open
  const ELWALK = { x0: ELC.x - 0.5, x1: ELC.x + 0.5, z0: zBack + 0.1, z1: zWall + 0.5 };
  // (used by the safety net in main.js) — true when you're standing in the cab
  const inElevatorCab = (x, z) => x >= xW && x <= xE && z >= zBack - 0.1 && z <= zWall + 0.05;

  // filled in by the bathroom block: the body only its mirrors can see
  let bathSelf = null;
  /* --- THE BATHROOM: a tiled box carved back through the south wall, west of
     the bar and across the aisle from where the air hockey lands. It's the
     one wall with a long empty run left on it, and a door in the middle of
     that run is findable from the arcade door.
     Ceiling at 2.7 against the hall's 4.3 — the drop is the whole trick, it
     reads as somewhere ELSE the moment you step through instead of more hall.
     Lit by DOWNWARD SPOTLIGHTS for the same reason the arcade is: three.js
     lights ignore walls, so the cones are pulled deep enough into the room
     that their edges hit the floor before they reach the wall plane and wash
     the hall through solid brick. Empty on purpose — fittings come next. --- */
  {
    // everything this block adds to the scene gets tagged onto REFL_LAYER at
    // the end, and the reflection camera renders ONLY that layer. A clipping
    // plane hides the arcade but still SUBMITS it — 534 draw calls standing at
    // a basin. Culling by layer is what makes the pass cost what this room
    // costs instead of what the whole hall costs.
    const REFL_LAYER = 5;                    // 1 and 2 are the XR eyes; 3 boat, 4 arena
    const sceneMark = scene.children.length;
    // hidden for the duration of the reflection pass: the handful of pieces
    // that stand BETWEEN the virtual camera and the room. Layer culling has
    // already removed the whole hall, so this is only ever the room's own
    // entry wall and the doorway dressing on it.
    const reflHide = [];
    const bathHits = [];        // click targets in here (the toilets, so far)
    /* what you can write on: tiled walls and stall panels. NOT the mirrors,
       the floor or the ceiling — the mirrors aren't registered at all, so a
       ray that lands on one is simply not a surface and the stroke is
       refused. Nothing to special-case. */
    const tags = createGraffiti(THREE, scene);
    const BZ0 = AR.z0;                              // shared wall — the bathroom's north face
    const BZ1 = AR.z0 - BATH.d;                     // its back wall, deep behind the arcade (-9.5)
    const bx0 = BATH.x - BATH.w / 2, bx1 = BATH.x + BATH.w / 2;
    const bzMid = (BZ0 + BZ1) / 2;
    // square wall tile with grout, a few tiles run darker so the wall isn't a
    // flat sheet. the toon pass cel-shades this like any other Lambert.
    // 20 cm tiles, not mosaic — small tiles at this scale read as graph paper
    // once the toon ramp quantizes them. Bright, too: the only light in here
    // points at the FLOOR, so an upper wall only ever gets the spill, and a
    // dark albedo up there lands on the ramp's bottom step and goes black.
    const wallTile = canvasTex(256, 256, (g) => {
      g.fillStyle = "#aeb6bc"; g.fillRect(0, 0, 256, 256);      // grout
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const n = (r * 5 + c * 3) % 7;
        g.fillStyle = n === 0 ? "#dfe7e4" : n === 4 ? "#eef3ef" : "#f4f7f3";
        g.fillRect(c * 64 + 3, r * 64 + 3, 58, 58);
      }
    });
    const floorTile = canvasTex(256, 256, (g) => {
      g.fillStyle = "#5e666e"; g.fillRect(0, 0, 256, 256);      // darker grout underfoot
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        g.fillStyle = (r + c) % 2 ? "#9aa2aa" : "#b3bac1";
        g.fillRect(c * 32 + 2, r * 32 + 2, 28, 28);
      }
    });
    // one texture object per surface — they need their own repeats.
    // the EMISSIVE is doing a specific job: this room is 20 cm from the hall,
    // so the corners nearest the door can't be lit by anything without that
    // light also crossing the wall. A material that lifts its own floor can't
    // leak — it isn't a light — and the toon pass carries emissive through to
    // MeshToonMaterial, so it survives the cel-shading. It's what stands in
    // for the bounce a real tiled box would have.
    const tiled = (tex, rx, ry) => {
      const t = tex.clone(); t.needsUpdate = true;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
      return new THREE.MeshLambertMaterial({
        map: t, side: THREE.DoubleSide, emissive: 0x1c2026,
      });
    };
    const TS = 0.8;    // one texture square = 4 tiles = 80 cm of wall

    const bFloor = plane(BATH.w, BATH.d, tiled(floorTile, BATH.w / TS, BATH.d / TS));
    bFloor.rotation.x = -Math.PI / 2;
    bFloor.position.set(BATH.x, 0.003, bzMid); add(bFloor);
    // MeshBasic, not Lambert: a Lambert ceiling above downlights is lit by
    // nothing but the fill's falloff, which reads as a bright blob ringed by
    // black corners, and the toon pass leaves Basic alone. Dark violet rather
    // than the pale grey it used to be — once the room went neon a light grey
    // ceiling was the one surface still reading as a hospital, and a lid this
    // big sets the mood of everything under it.
    // ...and mid-grey rather than pale: Basic ignores falloff, so a bright
    // ceiling stays bright right out to the corners, and the wedge of it you
    // glimpse through the door head from the arcade reads as a hard white
    // sliver next to walls that have fallen off to nothing.
    const bCeil = plane(BATH.w, BATH.d, new THREE.MeshBasicMaterial({ color: 0x241f33 }));
    bCeil.rotation.x = Math.PI / 2;
    bCeil.position.set(BATH.x, BATH.h, bzMid); add(bCeil);
    // back wall, then the two sides — each faces INTO the room
    const bBack = plane(BATH.w, BATH.h, tiled(wallTile, BATH.w / TS, BATH.h / TS));
    bBack.position.set(BATH.x, BATH.h / 2, BZ1); add(bBack); tags.addSurface(bBack, null, "back");
    for (const [wx, ry, sname] of [[bx0, Math.PI / 2, "side-w"], [bx1, -Math.PI / 2, "side-e"]]) {
      const sw = plane(BATH.d, BATH.h, tiled(wallTile, BATH.d / TS, BATH.h / TS));
      sw.rotation.y = ry;
      sw.position.set(wx, BATH.h / 2, bzMid); add(sw); tags.addSurface(sw, null, sname);
    }
    // the inside face of the shared wall: tiled like the rest, in two segments
    // around the doorway plus a piece over it. it's set back by the full depth
    // of the reveal below — the two planes used to sit 3 cm apart, so a casing
    // built to "line the wall thickness" had nowhere to live and squirted out
    // both sides of it.
    const REV = 0.22;                        // how deep the doorway reads
    const bnZ = BZ0 - REV;
    for (const [ni, [nx0, nx1]] of [[bx0, bxL], [bxR, bx1]].entries()) {
      const seg = plane(nx1 - nx0, BATH.h, tiled(wallTile, (nx1 - nx0) / TS, BATH.h / TS));
      seg.rotation.y = Math.PI;
      seg.position.set((nx0 + nx1) / 2, BATH.h / 2, bnZ); add(seg); reflHide.push(seg); tags.addSurface(seg, null, "north-" + ni);
    }
    const bnHead = plane(BATH.dw, BATH.h - BATH.dh, tiled(wallTile, BATH.dw / TS, (BATH.h - BATH.dh) / TS));
    bnHead.rotation.y = Math.PI;
    bnHead.position.set(BATH.x, (BATH.h + BATH.dh) / 2, bnZ); add(bnHead); reflHide.push(bnHead);

    /* the reveal — the casing that lines the opening. ONE rule keeps this
       corner clean, and it's worth stating because breaking it is invisible in
       code and obvious on screen: every piece either tucks BEHIND the tiled
       face or stands PROUD of the arcade wall, and nothing is flush with
       either plane. The casing spans the gap and steps 5 cm into the opening;
       the neon then sits clear in FRONT of the casing's front face. It used to
       be buried inside it, which is what made the green edge strobe. */
    const revZ0 = bnZ - 0.05;                // tucked behind the tile
    const revZ1 = BZ0 + 0.015;               // a hair proud of the arcade wall
    const revD = revZ1 - revZ0, revC = (revZ0 + revZ1) / 2;
    const bTrim = lam(0x2a2f36);
    const RJ = 0.05;                         // how far the casing steps in
    // head and sill span only BETWEEN the jambs rather than running past them.
    // Butt joints: the faces that meet are facing each OTHER, so they're both
    // hidden. Overlapping the pieces instead leaves two coplanar faces sharing
    // an area, which is the same speckle as any other z-fight even when both
    // are the same colour.
    const hx0 = bxL + RJ, hx1 = bxR - RJ;
    for (const jx of [bxL + RJ / 2, bxR - RJ / 2]) {
      const jamb = box(RJ, BATH.dh, revD, bTrim);
      jamb.position.set(jx, BATH.dh / 2, revC); add(jamb); reflHide.push(jamb);
    }
    const bHeadTrim = box(hx1 - hx0, RJ, revD, bTrim);
    bHeadTrim.position.set(BATH.x, BATH.dh - RJ / 2, revC); add(bHeadTrim); reflHide.push(bHeadTrim);
    // threshold: sunk so the floor tile passes THROUGH it rather than meeting
    // it face-to-face, and stopped short of the arcade plane so no lip juts
    // out onto the carpet
    const bSill = box(hx1 - hx0, 0.032, revD - 0.03, lam(0x6e767e));
    bSill.position.set(BATH.x, 0.008, revC - 0.015); add(bSill); reflHide.push(bSill);

    // arcade side: a neon jamb outline + a lit sign, the same language the
    // lift speaks, so the door reads as a door from across the hall. NOTE the
    // z — everything here lives in front of revZ1, clear of the casing.
    const bNeon = new THREE.MeshBasicMaterial({ color: 0x3bff7a });
    const neonZ = BZ0 + 0.05;
    for (const nx of [bxL - 0.03, bxR + 0.03]) {
      const v = box(0.03, BATH.dh + 0.06, 0.03, bNeon);
      v.position.set(nx, (BATH.dh + 0.06) / 2, neonZ); add(v); reflHide.push(v);
    }
    const bNeonTop = box(BATH.dw + 0.12, 0.03, 0.03, bNeon);
    bNeonTop.position.set(BATH.x, BATH.dh + 0.06, neonZ); add(bNeonTop); reflHide.push(bNeonTop);
    const bSign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.2),
      new THREE.MeshBasicMaterial({
        map: canvasTex(288, 64, (g) => {
          g.fillStyle = "#050a07"; g.fillRect(0, 0, 288, 64);
          g.font = "900 30px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
          g.fillStyle = "#3bff7a"; g.shadowColor = "#3bff7a"; g.shadowBlur = 10;
          g.fillText("RESTROOMS", 144, 34);
        }), transparent: true,
      }));
    bSign.position.set(BATH.x, BATH.dh + 0.26, neonZ); add(bSign); reflHide.push(bSign);

    /* light. the hall is 20 cm the other side of that wall and three.js lights
       ignore geometry, so every fixture in here has to be aimed or leashed to
       stay home. There are two safe shapes and this room uses both:
         DOWNLIGHTS sit deep enough that the cone's edge lands on the floor
         short of the wall plane — a `distance`-and-angle argument, and it has
         to be recomputed if either the light or the wall ever moves.
         WALL-WASHERS sit right AT the door and point away from it, which is
         the stronger guarantee: if the beam axis tilts away from the arcade by
         more than the cone's half-angle, then EVERY direction inside the cone
         still carries a negative z, and no part of it can travel back through
         the wall however far it throws. Distance stops mattering.
       Downlights alone gave a bright floor under black walls — which, glimpsed
       from the hall through the door, read as a void with a lit sliver of
       ceiling floating in it. The washers are what make it a room. */
    const bSpot = (px, py, pz, tx, ty, tz, angle, dist, inten, col = 0xdfe9ff) => {
      const s = new THREE.SpotLight(col, inten, dist, angle, 0.65, 1.5);
      s.position.set(px, py, pz);
      s.target.position.set(tx, ty, tz);
      add(s); add(s.target);
      return s;
    };
    // the ceiling grid runs MAGENTA / CYAN, the arcade's own two colours, and
    // the panels are lit to match so the source of each pool is obvious. White
    // downlights made this read as a hospital; the hall outside is neon and
    // this is a room in it.
    const NEON_M = 0xff2da0, NEON_C = 0x22d4ff;
    for (let i = 0; i < 4; i++) {
      const lx = bx0 + 1.05 + i * 2.1;
      const col = i % 2 ? NEON_C : NEON_M;
      bSpot(lx, BATH.h - 0.06, bzMid - 0.35, lx, 0, bzMid - 0.35, 0.68, 4.6, 26, col);
      const pan = box(0.52, 0.03, 0.52, new THREE.MeshBasicMaterial({ color: col }));
      pan.position.set(lx, BATH.h - 0.05, bzMid - 0.35); add(pan);
    }
    // toed IN rather than straight at the far corners: aimed wide, the cones
    // miss each other and leave a dark V down the middle of the back wall.
    // 0.45 rad of axis tilt + 0.72 of cone is well under the 1.571 that would
    // let a ray turn back toward the arcade.
    for (const sd of [-1, 1]) {
      bSpot(BATH.x + sd * 2.6, BATH.h - 0.12, BZ0 - 0.4,
            BATH.x + sd * 3.8, 0.9, BZ1 + 0.7, 0.72, 6.4, 22,
            sd < 0 ? 0x9d4dff : 0x2de0ff);          // violet one end, ice the other
    }

    /* --- the neon itself. Lights make POOLS; what sells a room like this is
       the lit EDGES, and those are MeshBasic strips that cost no light and
       can't leak anywhere. A cove line along the top of each long wall, a
       hard line under every basin run, and a strip down the outer edge of
       each bay partition so the walls have a drawn edge in the dark. --- */
    const neonStrip = (w, h, d, col, x, y, z) => {
      const m = box(w, h, d, new THREE.MeshBasicMaterial({ color: col }));
      m.position.set(x, y, z); add(m); return m;
    };
    for (const [zz, col] of [[BZ1 + 0.05, NEON_M], [bnZ - 0.05, NEON_C]])
      neonStrip(BATH.w - 0.3, 0.025, 0.025, col, BATH.x, BATH.h - 0.13, zz);
    // (there WAS a neon upright on each partition here. Its x was the
    // partition's, but its z was -7.25 — which is the middle of the
    // walk-through, not a piece of wall. It stood as a bar across the gap you
    // walk through, pink one side and blue the other. There is no stretch of
    // that partition to put one on: the opening takes the middle and the
    // stalls take the rest.)

    /* ===== the fittings ==================================================
       Three bays: stalls along the back of each, four basins along the entry
       wall of each, and the accessible one in the middle with the vestibule
       under it. The two side bays are MIRRORS of each other about the door —
       the plan they came from splits them (urinals on one side only), but the
       only partition face those could mount on is the one you walk through.
       Keep both bays identical and the room stays usable from either hand.
       ===================================================================== */
    // every fitting carries the same small emissive the tile does, for the
    // same reason: a stall panel's back face is lit by nothing in here, and
    // without a floor it lands on the toon ramp's bottom step and goes black.
    const porc = new THREE.MeshLambertMaterial({ color: 0xeef2f0, emissive: 0x242c33 });
    const steel = new THREE.MeshLambertMaterial({ color: 0xbcc4cc, emissive: 0x1d2329 });
    const panelMat = new THREE.MeshLambertMaterial({ color: 0x2e5a63, emissive: 0x102429 });
    const SF = BZ1 + 1.45;                                       // stall fronts
    const AF = BZ1 + 1.90;                                       // the accessible one is deeper

    // --- bay partitions: full height, with a walk-through in the vestibule
    // stretch. boxes, so both faces are tiled without a second plane.
    // every end runs PAST what it meets — into the floor, the ceiling, the end
    // walls, and into each other over the opening. A partition sized exactly
    // to the room leaves its top face in the ceiling's plane and its ends in
    // the wall planes, which is four coplanar seams the length of the room.
    const partition = (px, pname) => {
      for (const [pi, [z0, z1]] of [[BZ1 - 0.06, -7.86], [-6.64, BZ0 - 0.06]].entries()) {
        const seg = box(0.12, BATH.h + 0.08, z1 - z0, tiled(wallTile, (z1 - z0) / TS, BATH.h / TS));
        seg.position.set(px, BATH.h / 2, (z0 + z1) / 2); add(seg); tags.addSurface(seg, "x", `${pname}-${pi}`);
      }
      // the head is deliberately THINNER and shorter than the segments it
      // laps into: same thickness would put its side faces and its top in the
      // segments' planes, and coplanar-with-overlap is the whole failure mode.
      const head = box(0.10, 0.67, 1.38, tiled(wallTile, 1.38 / TS, 0.67 / TS));
      head.position.set(px, 2.385, -7.25); add(head);
    };
    partition(BPX1, "part-w"); partition(BPX2, "part-e");

    // --- a toilet. simple forms: the toon ramp does more for the read here
    // than polygons would.
    const toilet = (px, pz) => {
      const g = new THREE.Group();
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.20, 12), porc);
      foot.position.y = 0.10; g.add(foot);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.15, 0.21, 14), porc);
      bowl.position.y = 0.305; bowl.scale.z = 1.15; g.add(bowl);
      const seat = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.035, 8, 18), porc);
      seat.rotation.x = Math.PI / 2; seat.position.y = 0.425; seat.scale.z = 1.15; g.add(seat);
      const tank = box(0.40, 0.40, 0.16, porc);
      tank.position.set(0, 0.60, -0.27); g.add(tank);
      const lid = box(0.44, 0.045, 0.20, porc);
      lid.position.set(0, 0.82, -0.27); g.add(lid);
      const flush = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 8), steel);
      flush.rotation.z = Math.PI / 2; flush.position.set(0.21, 0.74, -0.25); g.add(flush);
      // a fat invisible volume around the whole thing: the bowl is a stack of
      // small cylinders and clicking one of those at a walking pace is a game
      // of darts. `visible:false` on the MATERIAL keeps it out of the render
      // while the Object3D stays raycastable, same trick the guitar strings use.
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.95, 0.78),
        new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(0, 0.47, -0.10);
      hit.userData.toilet = true;
      g.add(hit); bathHits.push(hit);
      g.position.set(px, 0, pz); add(g); return g;
    };

    // --- a wall-hung basin. local -z is its back, so rotY aims it at a wall.
    const basin = (px, pz, rotY) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.16, 0.17, 16), porc);
      body.position.y = 0.80; body.scale.z = 0.82; g.add(body);
      const inset = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.02, 16), lam(0xd2d9d6));
      inset.position.y = 0.856; inset.scale.z = 0.82; g.add(inset);
      const splash = box(0.50, 0.17, 0.05, porc);
      splash.position.set(0, 0.855, -0.19); g.add(splash);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.13, 8), steel);
      post.position.set(0, 0.955, -0.15); g.add(post);
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.13, 8), steel);
      spout.rotation.x = Math.PI / 2; spout.position.set(0, 1.01, -0.10); g.add(spout);
      g.position.set(px, 0, pz); g.rotation.y = rotY; add(g); return g;
    };

    // --- a row of stalls between x=a and x=b. interior dividers only: the bay
    // walls are the outer sides, and a panel laid flat on tile is just a
    // coplanar face waiting to speckle. doors hang ajar at varied angles so
    // the row reads as depth instead of a flat wall of doors.
    const stallRow = (a, b, n, bay) => {
      const w = (b - a) / n;
      for (let i = 1; i < n; i++) {
        const px = a + i * w;
        const d = box(0.045, 1.90, SF - BZ1 + 0.06, panelMat);
        d.position.set(px, 1.10, (BZ1 - 0.06 + SF) / 2); add(d); tags.addSurface(d, "x", `${bay}-div-${i}`);
        NO_WALK.push({ x0: px - 0.10, x1: px + 0.10, z0: BZ1, z1: SF });
      }
      for (let i = 0; i < n; i++) {
        const cx = a + (i + 0.5) * w;
        toilet(cx, BZ1 + 0.44);
        NO_WALK.push({ x0: cx - 0.28, x1: cx + 0.28, z0: BZ1, z1: BZ1 + 0.80 });
        const hinge = new THREE.Group();
        hinge.position.set(a + i * w + 0.055, 0, SF);
        const leaf = box(w - 0.15, 1.80, 0.035, panelMat);
        leaf.position.set((w - 0.15) / 2, 1.12, 0); hinge.add(leaf); tags.addSurface(leaf, "z", `${bay}-door-${i}`);
        const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.10, 8), steel);
        knob.rotation.x = Math.PI / 2;
        knob.position.set(w - 0.24, 1.12, 0.055); hinge.add(knob);
        hinge.rotation.y = -0.42 - (i % 3) * 0.30;      // swings out into the bay
        add(hinge);
      }
    };
    stallRow(bx0, BPX1 - 0.06, 3, "w");   // west bay
    stallRow(BPX2 + 0.06, bx1, 3, "e");   // east bay

    // --- the accessible stall, filling the centre bay behind the vestibule:
    // wider, deeper, toilet pushed to one side to leave the transfer space,
    // and two grab bars.
    {
      const cx = BATH.x;
      toilet(BPX1 + 0.60, BZ1 + 0.44);
      NO_WALK.push({ x0: BPX1 + 0.32, x1: BPX1 + 0.88, z0: BZ1, z1: BZ1 + 0.80 });
      // a fixed leaf across the west third, then a wide door on the rest.
      // it hangs open toward the EAST half of the vestibule so the walk in
      // from the entry stays clear — swung the other way it lay straight
      // across the doorway you just came through.
      const HG = BPX1 + 0.85;                                    // where the two meet
      const front = box(HG - BPX1 - 0.06, 1.90, 0.05, panelMat); // the fixed leaf
      front.position.set((BPX1 + HG) / 2, 1.10, AF); add(front); tags.addSurface(front, "z", "acc-front");
      NO_WALK.push({ x0: BPX1, x1: HG, z0: AF - 0.09, z1: AF + 0.09 });
      const hinge = new THREE.Group();
      hinge.position.set(HG, 0, AF);
      const leaf = box(0.95, 1.80, 0.04, panelMat);
      leaf.position.set(0.475, 1.12, 0); hinge.add(leaf); tags.addSurface(leaf, "z", "acc-door");
      const aknob = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.10, 8), steel);
      aknob.rotation.x = Math.PI / 2; aknob.position.set(0.80, 1.12, 0.055); hinge.add(aknob);
      hinge.rotation.y = -0.75; add(hinge);
      // two grab bars: one across the back wall, one down the side wall
      const barBack = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.78, 10), steel);
      barBack.rotation.z = Math.PI / 2;                          // lies along x
      barBack.position.set(cx - 0.02, 0.95, BZ1 + 0.07); add(barBack);
      const barSide = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.98, 10), steel);
      barSide.rotation.x = Math.PI / 2;                          // lies along z
      barSide.position.set(BPX1 + 0.11, 0.83, BZ1 + 0.72); add(barSide);
    }

    /* --- the mirrors REFLECT, on ONE render pass for both -----------------
       Both hang on the same wall facing the same way, so the mirrored camera
       and the texture it produces are identical — the two only differ in
       which part of that texture they sample. The trick that lets them share
       is in the vertex shader: it projects WORLD position instead of baking
       each mirror's own model matrix into the texture matrix, the way
       three.js's Reflector does. One pass, two mirrors.

       Three things keep it cheap enough to be worth having:
        - the target is 256x144. A mirror reads as soft glass anyway, and this
          is a cel-shaded room — there's no fine detail to lose.
        - the virtual camera's FAR is 12 m. The mirror faces INTO a sealed
          4.2 m room, so there is nothing beyond the back wall it could ever
          show — and that one number frustum-culls the entire city, the whole
          arcade and every other room out of the pass for free.
        - it's driven from onBeforeRender, so it runs only when a mirror is
          actually on screen. Walk out of the room and it costs nothing at
          all, with no position test to keep in sync. The time guard both caps
          the rate and makes the second mirror reuse what the first rendered.

       Render-target discipline (see CLAUDE.md): save and RESTORE the previous
       target rather than setting null, and turn xr off across the pass — in a
       session three.js has the headset's framebuffer bound and clearing to
       null sends the room to the canvas instead of the eyes. --- */
    const REFL = { w: 320, h: 180, hz: 30, far: 12 };
    const reflRT = new THREE.WebGLRenderTarget(REFL.w, REFL.h, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, stencilBuffer: false,
    });
    const reflTexMat = new THREE.Matrix4();
    const reflCam = new THREE.PerspectiveCamera();
    const mirrorMeshes = [];
    let reflAt = -1e9;
    const rN = new THREE.Vector3(), rView = new THREE.Vector3(), rTgt = new THREE.Vector3();
    const rLook = new THREE.Vector3(), rRot = new THREE.Matrix4();
    const rMirror = new THREE.Vector3(), rCam = new THREE.Vector3();

    function drawReflection(renderer, scene, camera, mesh) {
      const now = performance.now();
      if (now - reflAt < 1000 / REFL.hz) return;   // also: mirror #2 reuses #1
      reflAt = now;

      rMirror.setFromMatrixPosition(mesh.matrixWorld);
      rCam.setFromMatrixPosition(camera.matrixWorld);
      rRot.extractRotation(mesh.matrixWorld);
      rN.set(0, 0, 1).applyMatrix4(rRot);
      rView.subVectors(rMirror, rCam);
      if (rView.dot(rN) > 0) return;               // we're behind the glass
      rView.reflect(rN).negate().add(rMirror);

      rRot.extractRotation(camera.matrixWorld);
      rLook.set(0, 0, -1).applyMatrix4(rRot).add(rCam);
      rTgt.subVectors(rMirror, rLook).reflect(rN).negate().add(rMirror);

      reflCam.position.copy(rView);
      reflCam.up.set(0, 1, 0).applyMatrix4(rRot).reflect(rN);
      reflCam.lookAt(rTgt);
      if (Number.isFinite(camera.fov) && Number.isFinite(camera.aspect)) {
        reflCam.fov = camera.fov; reflCam.aspect = camera.aspect;
        reflCam.near = camera.near; reflCam.far = REFL.far;
        reflCam.updateProjectionMatrix();
      } else {
        reflCam.projectionMatrix.copy(camera.projectionMatrix);   // XR: take what we're given
      }
      reflCam.updateMatrixWorld();
      reflCam.layers.set(REFL_LAYER);

      reflTexMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      reflTexMat.multiply(reflCam.projectionMatrix);
      reflTexMat.multiply(reflCam.matrixWorldInverse);
      // deliberately NOT multiplied by mesh.matrixWorld — that omission is
      // the whole reason one matrix can serve both mirrors


      const prevTarget = renderer.getRenderTarget();
      const prevXr = renderer.xr.enabled, prevShadow = renderer.shadowMap.autoUpdate;
      /* Everything between the virtual camera and the glass has to go, or the
         pass renders the back of the entry wall. Reflector shears the
         projection into an oblique near plane for this; that degenerates when
         you stand square to a mirror — which is most of the time at a row of
         basins — and blanks the target. renderer.clippingPlanes works from
         every angle but is GLOBAL renderer state, and toggling it inside
         onBeforeRender re-clips everything drawn after the mirror in the same
         frame: the room loses its own walls. Plain visibility is neither. */
      for (const m of mirrorMeshes) m.visible = false;   // and no recursion
      for (const m of reflHide) m.visible = false;
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(reflRT);
      renderer.state.buffers.depth.setMask(true);
      if (renderer.autoClear === false) renderer.clear();
      renderer.render(scene, reflCam);
      for (const m of mirrorMeshes) m.visible = true;
      for (const m of reflHide) m.visible = true;
      renderer.xr.enabled = prevXr;
      renderer.shadowMap.autoUpdate = prevShadow;
      renderer.setRenderTarget(prevTarget);
      if (camera.viewport !== undefined) renderer.state.viewport(camera.viewport);
    }

    const reflUniforms = {
      tDiffuse: { value: reflRT.texture },
      textureMatrix: { value: reflTexMat },
      tint: { value: new THREE.Color(0xdae4ec) },
    };
    const mirror = (w, h, px, py, pz, ry) => {
      const frame = box(w + 0.06, h + 0.06, 0.02, steel);
      frame.position.set(px, py, pz); frame.rotation.y = ry; add(frame);
      reflHide.push(frame); blockers.push(frame);
                                     // it sits BEHIND the glass — from the
                                     // virtual camera it's a slab across the view
      const m = plane(w, h, new THREE.ShaderMaterial({
        uniforms: reflUniforms,
        vertexShader: `
          uniform mat4 textureMatrix;
          varying vec4 vProj;
          varying vec2 vLocal;
          void main() {
            vLocal = uv;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vProj = textureMatrix * wp;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          uniform vec3 tint;
          varying vec4 vProj;
          varying vec2 vLocal;
          void main() {
            // The virtual camera sits OUTSIDE the room, so the edges of its
            // frustum graze past the walls into space the room doesn't fill,
            // and that comes back as the scene's near-black clear. Floored
            // here rather than by swapping scene.background for the pass —
            // that's global state, and changing it mid-frame corrupts the
            // frame the mirror is being drawn into.
            vec3 refl = max(texture2DProj(tDiffuse, vProj).rgb, vec3(0.055, 0.062, 0.072)) * tint;
            // grime toward the edges, so it reads as glass and not a hole cut
            // in the wall
            float e = smoothstep(0.0, 0.11, vLocal.x) * smoothstep(1.0, 0.89, vLocal.x)
                    * smoothstep(0.0, 0.09, vLocal.y) * smoothstep(1.0, 0.91, vLocal.y);
            gl_FragColor = vec4(mix(refl * 0.80, refl, e), 1.0);
          }`,
      }));
      m.position.set(px + Math.sin(ry) * 0.02, py, pz + Math.cos(ry) * 0.02);
      m.rotation.y = ry;
      /* a vanity light over the glass, aimed down INTO the room. This wall
         couldn't carry a light before — it's 24 cm off the hall and a leash
         short enough to stay home wouldn't reach the floor — but AIMED works
         where leashed doesn't: 0.68 rad of tilt away from the hall plus a
         0.55 cone is well under the 1.571 that would let a ray turn back
         through the wall. It lights the basins, which were the dimmest corner
         of the room, and it lights YOU: without it the figure in the mirror
         is a silhouette against the lit room behind it. */
      // the emitter sits BELOW its own housing — level with it and the spot
      // lights the fixture at point-blank range, which blows a white hole in
      // the middle of it
      bSpot(px, py + 0.52, pz - 0.30, px, 0.95, pz - 1.85, 0.62, 4.2, 11);
      const vfix = box(w * 0.55, 0.05, 0.14, steel);
      vfix.position.set(px, py + 0.58, pz - 0.28); add(vfix); reflHide.push(vfix); blockers.push(vfix);
      const vglow = box(w * 0.5, 0.02, 0.10, new THREE.MeshBasicMaterial({ color: 0xf2f6ff }));
      vglow.position.set(px, py + 0.555, pz - 0.28); add(vglow); reflHide.push(vglow);
      m.onBeforeRender = (r, s, c) => drawReflection(r, s, c, m);
      mirrorMeshes.push(m);
      /* click-SOLID, the same way doors and furniture are: a ray aimed at the
         glass would otherwise pass straight through it and land on the tiled
         wall behind, so you'd be writing on a surface you can't see. Being a
         blocker is what makes "not on the mirrors" true without a special
         case anywhere. */
      blockers.push(m);
      add(m);
    };
    // BOTH bays get the same run, mirrored about the door: four basins along
    // the entry wall under a long mirror.
    // The plan put urinals on the centre partition's east face instead — but
    // that face IS the way into the east bay, so the run stood square in the
    // gap you walk through and you couldn't get in at all. A fitting mounted
    // on a partition has to be on a stretch of it that isn't a doorway; here
    // there wasn't one. Symmetry is worth more than the plan's split.
    const basinRun = (sd) => {                   // -1 = west bay, +1 = east
      const edge = BATH.w / 2;
      for (let i = 0; i < 4; i++)
        basin(BATH.x + sd * (edge - 0.60 - i * 0.72), bnZ - 0.18, Math.PI);
      mirror(2.90, 0.95, BATH.x + sd * (edge - 1.68), 1.56, bnZ - 0.02, Math.PI);
      const nb = box(3.05, 0.02, 0.02, new THREE.MeshBasicMaterial({ color: 0x2de0ff }));
      nb.position.set(BATH.x + sd * (edge - 1.68), 0.70, bnZ - 0.07); add(nb);
      const a = BATH.x + sd * 0.95, b = BATH.x + sd * edge;   // partition → end wall
      NO_WALK.push({ x0: Math.min(a, b), x1: Math.max(a, b), z0: bnZ - 0.52, z1: BZ0 });
    };
    basinRun(-1); basinRun(1);

    /* YOU, for the mirrors only. First person has no body in the scene, so a
       planar reflection has nothing of you to reflect — it was showing an
       empty room you were standing in. This group rides the camera and is
       tagged onto the reflection layer ONLY, never layer 0: the main camera
       can't render it, so there's no way to walk into the back of your own
       head, and it costs nothing anywhere else because the only camera that
       renders layer 5 is the one that runs when a mirror is on screen.
       main.js owns WHAT stands here, the same split the podium uses — avatars
       are built after buildWorld so the toon pass can't eat them. */
    const selfMount = new THREE.Group();
    add(selfMount);
    bathSelf = {
      mount: selfMount,
      hits: bathHits,
      tags,
      // one authority for "is this x/z in the bathroom" — the fart reverb, the
      // voice reverb and the sample loader all have to agree on it
      inside: (x, z) => x > bx0 && x < bx1 && z < BZ0 && z > BZ1,
      // metres from the nearest point of the room; 0 once you're in it. The
      // ceiling speaker fades on this, so it has to be a real distance and
      // not a room flag — the doorway is the interesting part.
      distance: (x, z) => Math.hypot(
        Math.max(bx0 - x, 0, x - bx1), Math.max(BZ1 - z, 0, z - BZ0)),
      set(node) {
        while (selfMount.children.length) selfMount.remove(selfMount.children[0]);
        if (node) { selfMount.add(node); node.traverse((o) => o.layers.set(REFL_LAYER)); }
      },
      // avatars are modelled facing +Z and a player at yaw 0 looks down -Z,
      // so the figure is turned half a turn out of your yaw — same as ghosts
      pose(x, z, yaw) { selfMount.position.set(x, 0, z); selfMount.rotation.y = yaw + Math.PI; },
    };

    // tag the room onto the reflection layer — meshes AND its own lights, since
    // three.js collects lights through the same camera-layer test it culls
    // meshes with. Miss the lights and the reflection comes back pitch black.
    for (let i = sceneMark; i < scene.children.length; i++)
      scene.children[i].traverse((o) => o.layers.enable(REFL_LAYER));
    skyFill.layers.enable(REFL_LAYER);       // the world's ambient, so the
                                             // reflection matches the room
  }

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
    return grp;
  }
  // the four classic machines: a row along the back (west) wall, screens
  // facing east down the length of the hall toward whoever walks in
  const defGrp = cabinet("defender", "DEFENDER", "#ff3434", AR.x0 + 0.42, -3.0, Math.PI / 2);
  const pacGrp = cabinet("pac", "PAC-MAN", "#ffe737", AR.x0 + 0.42, -1.1, Math.PI / 2);
  const tronGrp = cabinet("tron", "TRON", "#22d4ff", AR.x0 + 0.42, 0.8, Math.PI / 2);
  const pongGrp = cabinet("pong", "PONG", "#e8e8e8", AR.x0 + 0.42, 2.7, Math.PI / 2);

  /* --- real scanned cabinets swap in over the procedural stand-ins when
     they load. Async on purpose: a page's first paint owes nothing to a
     hero prop. Height-matched so nothing can load in giant; if a model
     fails, the stand-in just stays. Models with animations (the pac
     cabinet's screen attract loop) get a mixer ticked by the world. --- */
  const cabinetMixers = [];
  function swapCabinetModel(grp, url, height, rotY = 0) {
    return import("three/addons/loaders/GLTFLoader.js").then(({ GLTFLoader }) =>
      new GLTFLoader().loadAsync(url)
    ).then((gltf) => {
      const model = gltf.scene;
      if (rotY) model.rotation.y = rotY;
      const box = new THREE.Box3().setFromObject(model);
      const h = box.max.y - box.min.y;
      if (h > 0.05) model.scale.setScalar(height / h);
      const box2 = new THREE.Box3().setFromObject(model);
      const c = box2.getCenter(new THREE.Vector3());
      model.position.x -= c.x;
      model.position.z -= c.z;
      model.position.y -= box2.min.y;                      // feet on the carpet
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        // scanned materials arrive wearing physically-based jewellery.
        // transmission is the expensive piece: ONE visible transmissive
        // material makes three render the ENTIRE scene an extra time every
        // frame. in a dark arcade, tinted plastic reads the same as glass.
        const m = o.material;
        if (m) {
          if (m.transmission > 0) { m.transmission = 0; m.transparent = true; m.opacity = Math.min(m.opacity, 0.5); }
          if (m.clearcoat > 0) m.clearcoat = 0;            // per-pixel cost, invisible in here
          m.needsUpdate = true;
        }
      });
      for (const child of [...grp.children]) {
        if (!child.userData.arcade) grp.remove(child);     // keep the click target
      }
      // warm the GPU BEFORE the model joins the scene: shaders compile off
      // the parallel path, and each texture uploads on its own frame — the
      // old way paid for all of it in one stutter on the frame you first
      // looked at the cabinet (misery in a headset, where a long frame is
      // a lurch in the stomach rather than a hiccup).
      // NOTE: inside an immersive session the page's rAF doesn't fire, and a
      // stalled warm-up must never eat a cabinet — so the stagger runs on
      // timers and the compile gets a deadline instead of a blank cheque.
      const warm = renderer.compileAsync
        ? renderer.compileAsync(model, warmupCam, scene).catch(() => {})
        : Promise.resolve();
      const deadline = new Promise((ok) => setTimeout(ok, 2500));
      return Promise.race([warm, deadline]).then(() => new Promise((done) => {
        const texs = [];
        model.traverse((o) => {
          const m = o.isMesh && o.material;
          if (!m) return;
          for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"]) {
            if (m[k]) texs.push(m[k]);
          }
        });
        const next = () => {
          const t = texs.pop();
          if (!t) return done();
          try { renderer.initTexture(t); } catch (e) {}
          setTimeout(next, 16);   // NOT rAF — the page's rAF sleeps during VR
        };
        next();
      })).then(() => {
        grp.add(model);
        if (gltf.animations && gltf.animations.length) {
          const mixer = new THREE.AnimationMixer(model);
          mixer.clipAction(gltf.animations[0]).play();
          cabinetMixers.push(mixer);
        }
      });
    }).catch(() => {});
  }
  /* --- the same trick for the props on the smoking tables. A cabinet is
     sized by its HEIGHT; an ashtray isn't — it's a wide flat thing, and a
     joint is a long thin one, so the axis you match on is part of the ask.
     `centre` tips the balance for anything that lies at an angle: the model
     is centred in its host so the host's rotation turns it about its middle
     instead of swinging it off one end. --- */
  function swapProp(host, url, { size, axis = "y", rotY = 0, centre = false, tag }) {
    return import("three/addons/loaders/GLTFLoader.js").then(({ GLTFLoader }) =>
      new GLTFLoader().loadAsync(url)
    ).then((gltf) => {
      const model = gltf.scene;
      if (rotY) model.rotation.y = rotY;
      const b = new THREE.Box3().setFromObject(model);
      const d = b.getSize(new THREE.Vector3());
      const extent = axis === "xz" ? Math.max(d.x, d.z)
                   : axis === "max" ? Math.max(d.x, d.y, d.z)
                   : d.y;
      if (extent > 1e-4) model.scale.setScalar(size / extent);
      const b2 = new THREE.Box3().setFromObject(model);
      const c = b2.getCenter(new THREE.Vector3());
      model.position.x -= c.x;
      model.position.z -= c.z;
      model.position.y -= centre ? c.y : b2.min.y;   // stood on the table, or centred to be tipped
      const meshes = [];
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.userData.smoke = tag;                       // the whole model is the click target
        meshes.push(o);
        const m = o.material;
        if (m) {
          // same rule as the cabinets: one visible transmissive material makes
          // three render the entire scene twice a frame. tinted glass is fine.
          if (m.transmission > 0) { m.transmission = 0; m.transparent = true; m.opacity = Math.min(m.opacity, 0.6); }
          if (m.clearcoat > 0) m.clearcoat = 0;
          m.needsUpdate = true;
        }
      });
      const warm = renderer.compileAsync
        ? renderer.compileAsync(model, warmupCam, scene).catch(() => {})
        : Promise.resolve();
      return Promise.race([warm, new Promise((ok) => setTimeout(ok, 2000))]).then(() => {
        // the stand-in leaves the scene AND the raycast list — a click target
        // pointing at a mesh nobody can see is a ghost you can still tap
        for (const child of [...host.children]) {
          child.traverse((o) => {
            const i = smokeHits.indexOf(o);
            if (i >= 0) smokeHits.splice(i, 1);
          });
          host.remove(child);
        }
        host.add(model);
        for (const m of meshes) smokeHits.push(m);   // intersectObjects is NON-recursive
      });
    }).catch(() => {});
  }

  const warmupCam = new THREE.PerspectiveCamera();
  // loaded up-front (one at a time, right after first paint) — the models
  // are ~300KB each now and the GPU warm-up spreads their cost, so there's
  // nothing worth deferring. (pong and defender ship turned; sketchfab
  // models pick their own forward.)
  setTimeout(async () => {
    await swapCabinetModel(tronGrp, "assets/models/tron_cabinet.glb", 1.78);
    await swapCabinetModel(pacGrp, "assets/models/pac_cabinet.glb", 1.78);
    await swapCabinetModel(pongGrp, "assets/models/pong_cabinet.glb", 1.78, Math.PI / 2);
    await swapCabinetModel(defGrp, "assets/models/defender_cabinet.glb", 1.78, Math.PI);
    // the smoking corner, sized to the stand-ins they replace
    await swapProp(smokeProps.bong, "assets/models/bong.glb", { size: 0.375, axis: "y", tag: "bong" });
    await swapProp(smokeProps.ashtray, "assets/models/ashtray.glb", { size: 0.155, axis: "xz", tag: "joint" });
    await swapProp(smokeProps.joint, "assets/models/joint.glb", { size: 0.095, axis: "max", centre: true, tag: "joint" });
  }, 1200);

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

  /* ============================================================
     THE ARCADE BAR — a real bar against the south wall, run E-W, with
     a man behind it (bartender.js). The back-bar (bottle shelves) hugs
     the wall; the counter stands well off it so the bartender has a real
     walkway to work in — patrons lean in from the room (north) side.
     ============================================================ */
  {
    const ABX = -6.0;                     // bar centre x
    const WALLZ = AR.z0;                   // south wall (-5.9)
    const backZ = WALLZ + 0.15;            // back-bar cabinet, against the wall
    const counterZ = WALLZ + 1.10;         // counter, ~1 m off the wall (-4.80)
    const topY = 1.05, LEN = 3.8;

    // back-bar cabinet + two lit shelves of bottles
    const backCab = box(LEN, 0.95, 0.3,
      new THREE.MeshLambertMaterial({ color: 0x241d2c, emissive: 0x120e17 }));
    backCab.position.set(ABX, 0.475, backZ + 0.02); add(backCab);   // off the wall plane
    const barBottleCols = [0x4a7a5a, 0x7a4a5a, 0x4a5a7a, 0xa8853c, 0x5a7a4a, 0x7a5a4a, 0x4a6a7a, 0x8a4a6a];
    let abi = 0;
    for (const sy of [1.28, 1.66]) {
      const shelf = box(LEN - 0.2, 0.03, 0.2, lam(0x191522));
      shelf.position.set(ABX, sy, backZ + 0.02); add(shelf);
      for (let k = 0; k < 9; k++) {
        const col = barBottleCols[abi++ % barBottleCols.length];
        const hgt = 0.20 + (abi % 3) * 0.03;
        // the bottles carry their own colour as emissive. The lamp had to come
        // down to a 0.8 m throw (the bathroom is behind this wall now) and
        // can't reach the back shelves any more — but there's a lit strip
        // right behind every bottle, so backlit glass is what they should have
        // been doing all along. It costs no light and so can't leak.
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.034, hgt, 8),
          new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.8,
            emissive: new THREE.Color(col).multiplyScalar(0.45) }));
        b.position.set(ABX - 1.65 + k * 0.41, sy + 0.005 + hgt / 2, backZ + 0.02); add(b);
      }
      const strip = box(LEN - 0.2, 0.02, 0.04, new THREE.MeshBasicMaterial({ color: 0xffc88a }));
      strip.position.set(ABX, sy - 0.05, backZ + 0.12); add(strip);
    }

    // the counter — a solid base + a proud top, its front toward the room.
    // everything from the counter's face back to the wall belongs to the
    // bartender; you lean on it, you don't walk through it.
    NO_WALK.push({ x0: ABX - LEN / 2 - 0.14, x1: ABX + LEN / 2 + 0.14,
                   z0: WALLZ - 0.3, z1: counterZ + 0.34 });
    const barBase = box(LEN, 1.0, 0.5, lam(0x2a2233));
    barBase.position.set(ABX, 0.5, counterZ); add(barBase);
    const barTop = box(LEN + 0.16, 0.06, 0.64, lam(0x12101a));
    barTop.position.set(ABX, topY, counterZ); add(barTop);
    // a warm under-counter glow line on the patron side
    const rail = box(LEN, 0.03, 0.03, new THREE.MeshBasicMaterial({ color: 0xff9a4a }));
    rail.position.set(ABX, 0.86, counterZ + 0.27); add(rail);

    // three stools on the room side, facing the bar
    for (const sx of [-1.1, 0, 1.1]) {
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 14), lam(0x3a2430));
      seat.position.set(ABX + sx, 0.62, counterZ + 0.62); add(seat);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), lam(0x4a4550));
      pole.position.set(ABX + sx, 0.31, counterZ + 0.62); add(pole);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 12), lam(0x4a4550));
      foot.position.set(ABX + sx, 0.012, counterZ + 0.62); add(foot);
    }

    // a bar lamp hung low over the counter — the FIXTURE and the light, modeled
    // on the pool table's billiard lamp so it reads as part of the room. biased
    // a touch toward the bartender's side so he's lit, not lurking in the dark.
    // hung LOW — 1.80 rather than 2.15. The bathroom's east bay now sits
    // behind this wall, 0.85 m from the bulbs, and `distance` is the only
    // leash a point light has: to die inside that gap the throw has to be
    // under 0.85, and from 2.15 a throw that short doesn't even reach the
    // counter. Dropping the lamp is what buys it. Nobody can walk under it —
    // it's inside the bar's NO_WALK — and a low lamp over a counter is what
    // the fixture was always modelled on.
    const lampY = 1.80, lampZ = counterZ - 0.25;
    const shade = box(2.6, 0.13, 0.42, lam(0x2a1f14));
    shade.position.set(ABX, lampY, lampZ); add(shade);
    const shadeLip = box(2.66, 0.045, 0.48, lam(0x6a5028));
    shadeLip.position.set(ABX, lampY - 0.08, lampZ); add(shadeLip);
    const glowPanel = box(2.42, 0.02, 0.34, new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
    glowPanel.position.set(ABX, lampY - 0.095, lampZ); add(glowPanel);
    for (const ru of [-1.0, 1.0]) {                  // hang rods up to the ceiling
      const rodLen = ARC_H - (lampY + 0.06);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, rodLen, 6), lam(0x2a2228));
      rod.position.set(ABX + ru, lampY + 0.06 + rodLen / 2, lampZ); add(rod);
    }
    // FOUR bulbs at 0.8 m instead of two at 3.7. Short throws mean small
    // pools, so it takes twice as many to cover the counter — but from 1.62
    // each one still reaches the top, the bartender's side, and the stools,
    // and none of them can reach through the wall behind.
    for (const lu of [-1.35, -0.45, 0.45, 1.35]) {
      const bulb = new THREE.PointLight(0xffd6a0, 7, 0.8, 2);
      bulb.position.set(ABX + lu, lampY - 0.18, lampZ); add(bulb);
    }
  }

  /* ============================================================
     POOL / 8-BALL — a real in-world table. world.js builds the
     furniture + the balls + the cue + the aim guide and hands them
     back; pool.js runs the turn-based game (aim, power, 2D physics on
     the cloth plane). Turn-based + a drawn aim line = deliberate and
     controllable, on purpose. Long axis runs E-W. Table-local coords:
     u = x-centre (length), w = z-centre (width).
     ============================================================ */
  // a factory, not a one-off — the arcade now has TWO identical tables in a row
  // along the north wall (idKey namespaces each table's click targets + buttons
  // so main.js can tell them apart; everything else is built relative to PT).
  function buildPool(PT, idKey) {
    const surfaceY = 0.78;
    const hl = 1.2, hw = 0.6;             // playfield half-extents (length, width)
    const r = 0.03;                       // ball radius
    const pocketR = 0.072;
    const railTop = 0.05;                 // cushion rises this far above cloth
    const woodH = 0.1;                    // wooden rail cap thickness

    const grp = new THREE.Group();
    grp.position.set(PT.x, 0, PT.z);
    // you can't walk through slate: playfield + rail cap + a little clearance
    NO_WALK.push({ x0: PT.x - hl - 0.22, x1: PT.x + hl + 0.22,
                   z0: PT.z - hw - 0.22, z1: PT.z + hw + 0.22 });

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
    const joinHit = wallBtn("JOIN", "#3ce47e", -0.36, idKey + "Join");
    const resetHit = wallBtn("RESET", "#ff5a5a", 0.36, idKey + "Reset");

    // click target over the whole table
    const hit = new THREE.Mesh(new THREE.BoxGeometry(2 * hl + 0.3, 0.4, 2 * hw + 0.3),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(PT.x, surfaceY + 0.1, PT.z);
    hit.userData[idKey] = true;
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
  }
  // two tables in a row down the north wall — the original at x=-9, a second
  // where the darts board used to hang (x=-13.2). same z so they line up.
  const pool = buildPool({ x: -9.0, z: 2.9 }, "pool");
  const pool2 = buildPool({ x: -13.2, z: 2.9 }, "pool2");

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
    // the board face. the red square is NOT a box around the ring — on a real
    // backboard its BOTTOM edge is level with the rim and the box stands above
    // it, which is the whole point: you bank off the inside of the square.
    const BB_W = 1.28, BB_H = 0.9, BB_Y = 3.12;              // the face's size + centre
    const bbTex = canvasTex(280, 200, (g, cw, ch) => {
      const ppy = ch / BB_H, ppx = cw / BB_W, top = BB_Y + BB_H / 2;
      const my = (y) => (top - y) * ppy;                     // world height -> canvas row
      g.fillStyle = "#f2f0ea"; g.fillRect(0, 0, cw, ch);
      g.strokeStyle = "#20242a"; g.lineWidth = 8; g.strokeRect(4, 4, cw - 8, ch - 8);
      const sqW = 0.44, sqH = 0.33;                          // regulation, scaled to this board
      g.strokeStyle = "#d8392a"; g.lineWidth = 6;
      g.strokeRect(cw / 2 - sqW / 2 * ppx, my(rimY + sqH), sqW * ppx, sqH * ppy);
    });
    const bb = box(BB_W + 0.06, BB_H + 0.06, 0.06, lam(0x20242a));
    bb.position.set(BX, BB_Y, WALLZ + 0.035); add(bb);
    const bbFace = new THREE.Mesh(new THREE.PlaneGeometry(BB_W, BB_H),
      new THREE.MeshBasicMaterial({ map: bbTex }));
    bbFace.position.set(BX, BB_Y, BBz); add(bbFace);     // PlaneGeometry faces +z = into the court

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
    // short throw: the bathroom's west bay now sits behind this stretch of
    // wall, and its ceiling is only 1.27 m from this lamp. 1.15 keeps the
    // light on the rim and the board, which is all it was ever for.
    const hoopLamp = new THREE.PointLight(0xfff0d6, 7, 1.15, 2);
    hoopLamp.position.set(BX, 3.6, rimZ + 0.4); add(hoopLamp);

    // --- the court: a painted hardwood decal floating 2 cm over the floor ---
    const court = { x0: BX - 2.4, x1: BX + 2.4, z0: WALLZ + 0.12, z1: WALLZ + 4.0 };
    const Wc = court.x1 - court.x0, Dc = court.z1 - court.z0;
    /* The lines used to be guessed as fractions of the canvas, which put the
       3-point arc straight through the free-throw circle — a thing that can't
       happen on a real floor. So they're laid out in METRES now, off ONE scale
       factor, in the same proportions as a real half court:

         3-pt arc   6.75 m from the ring        free-throw line  4.225 m from it
         lane        4.90 m wide                free-throw circle  1.80 m radius
         restricted  1.25 m                     corner lines     0.90 m in from
                                                                 the sideline

       6.75 m won't fit in a 4.8×3.88 m room, so everything shrinks together by
       k. The arc still lands well clear of the circle, because on a real court
       it does. The canvas is sized to the court's own aspect so a circle drawn
       here is a circle on the floor and not an ellipse. */
    const R3 = 2.9;                       // the 3-point radius we can actually fit
    const k = R3 / 6.75;                  // ...and everything else rides on it
    const rimOffZ = rimZ - court.z0;      // how far the ring hangs off the baseline
    const CT_W = 512, CT_H = Math.round(CT_W * Dc / Wc);
    const PPM = CT_W / Wc;                // canvas px per metre, both axes
    const courtTex = canvasTex(CT_W, CT_H, (g, cw, ch) => {
      // canvas TOP (v=1) lands against the wall: baseline and rim up there
      const px = (x) => (x + Wc / 2) * PPM;      // x in metres from centre
      const pz = (z) => z * PPM;                 // z in metres from the baseline
      const cx = px(0), ry = pz(rimOffZ);        // the ring, on the floor

      // hardwood: warm planks running across
      g.fillStyle = "#c79350"; g.fillRect(0, 0, cw, ch);
      g.strokeStyle = "rgba(120,80,30,0.35)"; g.lineWidth = 2;
      for (let y = 0; y < ch; y += 26) { g.beginPath(); g.moveTo(0, y); g.lineTo(cw, y); g.stroke(); }

      const white = "#f4efe2";
      g.strokeStyle = white; g.lineCap = "butt";

      // boundary: sidelines + the baseline under the backboard
      g.lineWidth = 6;
      g.strokeRect(px(-2.3), pz(0.08), 4.6 * PPM, (Dc - 0.2) * PPM);

      // --- the lane, hanging off the baseline ---
      const laneHalf = 2.45 * k, ftZ = rimOffZ + 4.225 * k, ftR = 1.8 * k;
      g.fillStyle = "rgba(210,120,60,0.22)";     // painted key
      g.fillRect(px(-laneHalf), pz(0.08), laneHalf * 2 * PPM, (ftZ - 0.08) * PPM);
      g.lineWidth = 5;
      g.strokeRect(px(-laneHalf), pz(0.08), laneHalf * 2 * PPM, (ftZ - 0.08) * PPM);

      // free-throw circle: solid on the far side, dashed where it crosses the
      // lane — the way it's actually painted
      g.beginPath(); g.arc(cx, pz(ftZ), ftR * PPM, 0, Math.PI); g.stroke();
      g.setLineDash([9, 9]);
      g.beginPath(); g.arc(cx, pz(ftZ), ftR * PPM, Math.PI, Math.PI * 2); g.stroke();
      g.setLineDash([]);

      // the restricted-area arc under the ring
      g.lineWidth = 4;
      g.beginPath(); g.arc(cx, ry, 1.25 * k * PPM, 0, Math.PI); g.stroke();

      // --- the 3-point line: two straight corners, then the arc between them ---
      const cornerX = Wc / 2 - 0.9 * k;                       // 0.9 m in from the sideline
      const meetZ = rimOffZ + Math.sqrt(Math.max(0, R3 * R3 - cornerX * cornerX));
      const meetA = Math.acos(cornerX / R3);                  // where the arc meets them
      g.lineWidth = 6;
      for (const s of [-1, 1]) {
        g.beginPath(); g.moveTo(px(s * cornerX), pz(0.08)); g.lineTo(px(s * cornerX), pz(meetZ)); g.stroke();
      }
      g.beginPath(); g.arc(cx, ry, R3 * PPM, meetA, Math.PI - meetA); g.stroke();

    });
    const courtMesh = new THREE.Mesh(new THREE.PlaneGeometry(Wc, Dc),
      new THREE.MeshLambertMaterial({ map: courtTex }));
    courtMesh.rotation.x = -Math.PI / 2;                            // lie flat
    courtMesh.rotation.z = 0;                                       // baseline+key+3pt arc toward the wall (-z), under the rim
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

    /* --- the STREAK board, bolted to the wall under the rim ------------
       A shoot-around with no scoreboard is just a wall. This one only
       cares about one number — how many you've hit without missing —
       and whose it is. It wakes up when a ball goes in, heats up as the
       run gets longer, and goes back to sleep when you walk away. --- */
    const SB = { w: 768, h: 320 };
    const sbCanvas = document.createElement("canvas");
    sbCanvas.width = SB.w; sbCanvas.height = SB.h;
    const sbCtx = sbCanvas.getContext("2d");
    const sbTex = new THREE.CanvasTexture(sbCanvas);
    sbTex.colorSpace = THREE.SRGBColorSpace;
    // who's shooting, how hot, and how long since the last thing happened
    const sbState = { name: "", streak: 0, best: 0, bestName: "", pop: 0, miss: 0, swish: false };

    const sbRound = (g, x, y, w, h, r) => {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    };
    // white → amber → orange → red as the run gets longer. 3 is heating up,
    // 5 is on fire; every arcade since 1993 agrees about this.
    function heatOf(n) {
      if (n >= 7) return { hue: "#ff3a2f", label: "UNCONSCIOUS", glow: 0xff3a2f };
      if (n >= 5) return { hue: "#ff7a1f", label: "ON FIRE", glow: 0xff7a1f };
      if (n >= 3) return { hue: "#ffc23c", label: "HEATING UP", glow: 0xffc23c };
      return { hue: "#e8eef6", label: "IN A ROW", glow: 0x88b4ff };
    }

    function drawStreak(t) {
      const g = sbCtx, s = sbState;
      const heat = heatOf(s.streak);
      // a live run STAYS on the wall — you walked away mid-streak, not out of it.
      // the board only goes back to sleep once someone misses.
      const wake = s.streak > 0 ? 1 : 0;
      g.clearRect(0, 0, SB.w, SB.h);

      // the case
      g.fillStyle = "#07080d";
      sbRound(g, 6, 6, SB.w - 12, SB.h - 12, 18); g.fill();
      g.strokeStyle = heat.hue;
      g.globalAlpha = 0.25 + 0.5 * wake + s.pop * 0.3;
      g.lineWidth = 4; g.stroke();
      g.globalAlpha = 1;

      if (wake <= 0) {
        // asleep: just the house mark and whatever the record is
        g.textAlign = "center"; g.textBaseline = "middle";
        g.font = "500 62px 'Six Caps', sans-serif"; g.letterSpacing = "12px";
        g.fillStyle = "rgba(255,150,215,0.55)";
        g.fillText("METRO HOOPS", SB.w / 2, 112);
        g.letterSpacing = "0px";
        g.font = "900 30px monospace";
        g.fillStyle = s.miss > 0 && s.miss < 1.6 ? "rgba(226,58,82,0.9)" : "rgba(120,132,152,0.75)";
        g.fillText(s.miss > 0 && s.miss < 1.6 ? "STREAK OVER" : "SHOOT TO START A RUN", SB.w / 2, 186);
        if (s.best > 0) {
          g.font = "900 26px monospace";
          g.fillStyle = "rgba(255,210,60,0.8)";
          g.fillText(`BEST  ${s.best}  ${String(s.bestName || "").toUpperCase()}`.trim(), SB.w / 2, 240);
        }
        sbTex.needsUpdate = true;
        return;
      }

      // the number, which lands with a thump and settles
      const bump = 1 + s.pop * 0.28;
      g.save();
      g.translate(212, 150);
      g.scale(bump, bump);
      g.textAlign = "center"; g.textBaseline = "middle";
      g.font = "900 150px monospace";
      g.shadowColor = heat.hue; g.shadowBlur = 30 + s.pop * 40;
      g.fillStyle = heat.hue;
      g.fillText(String(s.streak), 0, 0);
      g.shadowBlur = 0;
      g.restore();

      // ...and what it means, on the right
      g.textAlign = "left"; g.textBaseline = "middle";
      g.font = "900 46px monospace";
      g.fillStyle = heat.hue;
      g.fillText(heat.label, 366, 118);
      g.font = "900 34px monospace";
      g.fillStyle = "#dfe6f0";
      g.fillText(String(s.name || "anon").slice(0, 14).toUpperCase(), 366, 176);
      if (s.swish) {
        g.font = "900 24px monospace";
        g.fillStyle = "rgba(110,230,160,0.9)";
        g.fillText("ALL NET", 366, 216);
      }

      // a pip per make, so a long run reads at a glance without counting
      const pips = Math.min(12, s.streak);
      for (let i = 0; i < pips; i++) {
        const bx = 372 + i * 30, by = 258;
        g.fillStyle = heat.hue;
        g.globalAlpha = i === pips - 1 ? 0.5 + 0.5 * Math.abs(Math.sin(t * 4)) : 0.85;
        g.beginPath(); g.arc(bx, by, 9, 0, 7); g.fill();
      }
      g.globalAlpha = 1;
      if (s.streak > 12) {
        g.font = "900 22px monospace"; g.fillStyle = heat.hue;
        g.fillText("+" + (s.streak - 12), 372 + 12 * 30, 258);
      }

      // best-ever tucked in the corner
      if (s.best > 0) {
        g.textAlign = "right"; g.font = "900 22px monospace";
        g.fillStyle = "rgba(255,210,60,0.7)";
        g.fillText(`BEST ${s.best}`, SB.w - 30, 46);
      }

      // once you're on fire the board catches too: flames licking the bottom
      // edge, taller the hotter the run
      if (s.streak >= FIRE_AT) {
        const hh = Math.min(1, (s.streak - FIRE_AT + 1) / 8);
        for (let i = 0; i < 26; i++) {
          const fx = 24 + i * (SB.w - 48) / 25;
          const lick = (34 + hh * 62) * (0.45 + 0.55 * Math.abs(Math.sin(t * 6 + i * 1.7)));
          const grd = g.createLinearGradient(0, SB.h - 12, 0, SB.h - 12 - lick);
          grd.addColorStop(0, "rgba(255,226,120,0.85)");
          grd.addColorStop(0.45, "rgba(255,122,31,0.55)");
          grd.addColorStop(1, "rgba(255,40,20,0)");
          g.fillStyle = grd;
          g.beginPath();
          g.moveTo(fx - 16, SB.h - 12);
          g.quadraticCurveTo(fx - 6, SB.h - 12 - lick * 0.6, fx, SB.h - 12 - lick);
          g.quadraticCurveTo(fx + 6, SB.h - 12 - lick * 0.6, fx + 16, SB.h - 12);
          g.closePath(); g.fill();
        }
      }

      // the whole face flashes on the make itself
      if (s.pop > 0.02) {
        g.fillStyle = `rgba(255,255,255,${0.34 * s.pop * s.pop})`;
        sbRound(g, 6, 6, SB.w - 12, SB.h - 12, 18); g.fill();
      }
      sbTex.needsUpdate = true;
    }

    const sbBoard = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 0.675),
      new THREE.MeshBasicMaterial({ map: sbTex, transparent: true }));
    // 2.15, not eye level: the rock you're holding sits at ~1.55 dead ahead and
    // would park itself right on top of the board every time you wound up
    sbBoard.position.set(BX, 2.15, WALLZ + 0.04);   // under the rim, facing the court
    add(sbBoard);
    const sbWash = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.5),
      new THREE.MeshBasicMaterial({
        color: 0x88b4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, map: canvasTex(64, 64, (g) => {
          const rg = g.createRadialGradient(32, 32, 2, 32, 32, 32);
          rg.addColorStop(0, "rgba(255,255,255,1)"); rg.addColorStop(1, "rgba(255,255,255,0)");
          g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
        }),
      }));
    sbWash.position.set(BX, 2.15, WALLZ + 0.03);
    sbWash.renderOrder = -1;
    add(sbWash);

    // main.js calls this on every make and every miss
    function setStreak(p = {}) {
      const s = sbState;
      if (p.name !== undefined) s.name = p.name;
      if (p.best !== undefined) s.best = p.best;
      if (p.bestName !== undefined) s.bestName = p.bestName;
      if (p.streak !== undefined) {
        if (p.streak > 0 && p.streak !== s.streak) { s.pop = 1; if (p.streak > s.streak) fireBurst(p.streak); }
        if (p.streak === 0 && s.streak > 0) s.miss = 0.001;   // "STREAK OVER" for a beat
        s.streak = p.streak;
      }
      s.swish = !!p.swish;
    }

    /* --- ON FIRE ---------------------------------------------------------
       NBA Jam's rule, kept exactly: five in a row and you catch. After
       that every bucket feeds it — more embers off the ring, a hotter
       rim, a ball that burns in your hands — so the tenth in a row looks
       nothing like the fifth. One miss and it all goes out.

       One Points cloud with per-vertex colour, a fixed pool that recycles.
       Embers are born white-hot and cool to a dark red as they rise, which
       is what fire actually does and what makes a flat sprite read as a
       flame. --- */
    const FIRE_AT = 5;                    // makes in a row before you catch
    const FP_N = 260;
    const fPos = new Float32Array(FP_N * 3);
    const fCol = new Float32Array(FP_N * 3);
    const fVel = Array.from({ length: FP_N }, () => ({ x: 0, y: 0, z: 0 }));
    const fLife = new Float32Array(FP_N), fMax = new Float32Array(FP_N);
    for (let k = 0; k < FP_N; k++) { fPos[k * 3] = BX; fPos[k * 3 + 1] = rimY; fPos[k * 3 + 2] = rimZ; }
    const fGeo = new THREE.BufferGeometry();
    fGeo.setAttribute("position", new THREE.BufferAttribute(fPos, 3));
    fGeo.setAttribute("color", new THREE.BufferAttribute(fCol, 3));
    // an untextured Point draws as a hard SQUARE — at close range that reads as
    // glitching rectangles, not fire. every ember gets a soft round falloff.
    const emberSprite = canvasTex(64, 64, (g) => {
      const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      rg.addColorStop(0, "rgba(255,255,255,1)");
      rg.addColorStop(0.35, "rgba(255,255,255,0.55)");
      rg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    });
    const fMat = new THREE.PointsMaterial({
      size: 0.11, map: emberSprite, vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const firePts = new THREE.Points(fGeo, fMat);
    firePts.frustumCulled = false; firePts.visible = false; add(firePts);
    let fCursor = 0, fLive = 0;
    function ember(x, y, z, spread, up, life) {
      const k = (fCursor++) % FP_N;
      if (fLife[k] <= 0) fLive++;
      fPos[k * 3] = x; fPos[k * 3 + 1] = y; fPos[k * 3 + 2] = z;
      fVel[k] = { x: (Math.random() - 0.5) * spread, y: up * (0.5 + Math.random()),
                  z: (Math.random() - 0.5) * spread };
      fMax[k] = fLife[k] = life * (0.7 + Math.random() * 0.6);
    }

    let fire = 0, fireTarget = 0, fireEmit = 0;
    const rimBase = new THREE.Color(0xff7a1f), rimHot = new THREE.Color(0xfff0c0);
    const lampBase = new THREE.Color(0xfff0d6), lampHot = new THREE.Color(0xff9a3c);
    // a scorch of light on the floor right under the ring
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(1.15, 24),
      new THREE.MeshBasicMaterial({
        color: 0xff6a1e, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, map: canvasTex(64, 64, (g) => {
          const rg = g.createRadialGradient(32, 32, 1, 32, 32, 32);
          rg.addColorStop(0, "rgba(255,255,255,1)");
          rg.addColorStop(0.45, "rgba(255,255,255,0.35)");
          rg.addColorStop(1, "rgba(255,255,255,0)");
          g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
        }),
      }));
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.set(BX, 0.03, rimZ);
    scorch.visible = false;
    add(scorch);

    // every bucket past the fifth throws more up than the one before it
    function fireBurst(streak) {
      if (streak < FIRE_AT) return;
      const heat = Math.min(1, (streak - FIRE_AT + 1) / 8);
      const n = Math.round(14 + heat * 40);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = rimR * (0.2 + Math.random() * 0.9);
        ember(BX + Math.cos(a) * r, rimY - 0.1 - Math.random() * 0.2, rimZ + Math.sin(a) * r,
              1.6 + heat * 1.8, 2.4 + heat * 2.6, 0.7 + heat * 0.5);
      }
    }

    const ballDark = new THREE.Color(0x000000), ballGlow = new THREE.Color(0xff6a12);
    function tickFire(dt, t, ppos) {
      // catch at five, and climb from there — this is the "building up" part
      fireTarget = sbState.streak >= FIRE_AT ? Math.min(1, (sbState.streak - FIRE_AT + 1) / 8) : 0;
      // it lights fast and dies instantly, the way a miss should feel
      fire += (fireTarget - fire) * Math.min(1, dt * (fireTarget > fire ? 3.5 : 14));
      if (fire < 0.004) fire = 0;

      // the ring, the lamp over it and the floor under it all run off `fire`
      const hot = fire * (0.75 + 0.25 * Math.sin(t * 17));
      rim.material.color.copy(rimBase).lerp(rimHot, hot);
      mount.material.color.copy(rimBase).lerp(rimHot, hot * 0.7);
      net.material.opacity = 0.55 + fire * 0.4;
      net.material.color.set(fire > 0.02 ? 0xffd8a0 : 0xeef2f6);
      hoopLamp.color.copy(lampBase).lerp(lampHot, fire);
      hoopLamp.intensity = 5.5 + fire * (7 + 2.5 * Math.sin(t * 13));
      scorch.visible = fire > 0.02;
      scorch.material.opacity = fire * (0.3 + 0.09 * Math.sin(t * 9));
      scorch.scale.setScalar(0.7 + fire * 0.55);

      // a steady fountain off the ring while it burns...
      if (fire > 0.02) {
        fireEmit += dt * (18 + fire * 90);
        while (fireEmit >= 1) {
          fireEmit -= 1;
          const a = Math.random() * Math.PI * 2;
          ember(BX + Math.cos(a) * rimR, rimY - 0.06, rimZ + Math.sin(a) * rimR,
                0.5 + fire * 0.7, 1.1 + fire * 1.5, 0.55 + fire * 0.45);
        }
        // ...and a trail off every ball in the air, because in NBA Jam the
        // ROCK is what's on fire, not the hoop
        const NEAR = 1.15;   // no ember is born closer to the eye than this
        for (const m of balls) {
          if (!m.visible) continue;
          if (ppos && Math.hypot(m.position.x - ppos.x, m.position.z - ppos.z) < NEAR) continue;
          for (let i = 0; i < 1 + Math.round(fire * 3); i++) {
            ember(m.position.x + (Math.random() - 0.5) * 0.1,
                  m.position.y + (Math.random() - 0.5) * 0.1,
                  m.position.z + (Math.random() - 0.5) * 0.1,
                  0.35, 0.5 + fire, 0.28 + fire * 0.25);
          }
        }
      }
      // the rock itself glows instead — held and in flight
      const bc = fire * (0.8 + 0.2 * Math.sin(t * 19));
      if (handBall.material.emissive) handBall.material.emissive.copy(ballDark).lerp(ballGlow, bc);
      for (const m of balls) if (m.material.emissive) m.material.emissive.copy(ballDark).lerp(ballGlow, bc);

      // fly the embers: they rise, slow, and cool white → yellow → red → out
      if (fLive > 0) {
        fLive = 0;
        for (let k = 0; k < FP_N; k++) {
          if (fLife[k] <= 0) continue;
          fLive++;
          fLife[k] -= dt;
          if (fLife[k] <= 0) {
            fPos[k * 3] = BX; fPos[k * 3 + 1] = rimY; fPos[k * 3 + 2] = rimZ;
            fCol[k * 3] = fCol[k * 3 + 1] = fCol[k * 3 + 2] = 0;   // black on an additive blend = gone
            continue;
          }
          const v = fVel[k];
          v.y += 1.6 * dt;                       // hot air lifts them as they go
          v.x *= 1 - 1.8 * dt; v.z *= 1 - 1.8 * dt;
          fPos[k * 3] += v.x * dt; fPos[k * 3 + 1] += v.y * dt; fPos[k * 3 + 2] += v.z * dt;
          // the hall has a roof — embers die under it instead of sailing through
          if (fPos[k * 3 + 1] > ARC_H - 0.25) fLife[k] = Math.min(fLife[k], 0.12);
          const a = fLife[k] / (fMax[k] || 1);   // 1 = just born, 0 = spent
          fCol[k * 3] = Math.min(1, 0.35 + a * 0.75);          // red the whole way
          fCol[k * 3 + 1] = Math.max(0, a * a * 0.62 - 0.04);  // yellow only while young
          fCol[k * 3 + 2] = Math.max(0, a * a * a * a * 0.3);  // a touch of white at birth
        }
        fGeo.attributes.position.needsUpdate = true;
        fGeo.attributes.color.needsUpdate = true;
      }
      firePts.visible = fLive > 0;
      fMat.size = 0.09 + fire * 0.05;
    }

    const _sbCol = new THREE.Color();
    let sbAcc = 0;
    function tickStreak(dt, t, ppos) {
      const s = sbState;
      s.pop = Math.max(0, s.pop - dt * 2.6);
      if (s.miss > 0) s.miss += dt;
      const heat = heatOf(s.streak);
      const lit = s.streak > 0 ? 1 : 0;
      sbWash.material.color.lerp(_sbCol.setHex(heat.glow), Math.min(1, dt * 4));
      sbWash.material.opacity = lit * (0.10 + 0.05 * Math.sin(t * 3)) + s.pop * 0.35;
      tickFire(dt, t, ppos);      // burns wherever you're standing; only the CANVAS is gated
      // same rule as the marquee: only repaint where it can be read
      if (!ppos || Math.abs(ppos.x - BX) > 5 || ppos.z < WALLZ - 1 || ppos.z > WALLZ + 8) return;
      sbAcc += dt;
      if (sbAcc < 1 / 30) return;
      sbAcc = 0;
      drawStreak(t);
    }
    drawStreak(0);

    return {
      rim: { x: BX, y: rimY, z: rimZ }, rimR, ballR, faceSign: 1, floorY: 0, ceilY: ARC_H,
      backboard: { z: BBz, x0: BX - BB_W / 2, x1: BX + BB_W / 2, y0: BB_Y - BB_H / 2, y1: BB_Y + BB_H / 2 },
      court, balls, handBall, setArc, hideGuide, swish: pulseNet,
      setStreak, _tick: tickStreak, fireAt: FIRE_AT,
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

  // desk clock — actual Hawthorne time. body + face live in one group so
  // the admin layout editor can move the clock as a single thing.
  const clockScr = makeClockScreen();
  const deskClock = new THREE.Group();
  deskClock.position.set(0.62, deskTopY + 0.035, -0.09);   // the group IS the clock's spot, so rotation pivots in place
  desk.add(deskClock);
  const clockBody = box(0.17, 0.07, 0.05, lam(0x101216));
  clockBody.rotation.x = -0.1;
  clockBody.position.set(0, 0, -0.01);
  deskClock.add(clockBody);
  const clockFace = plane(0.155, 0.058, new THREE.MeshBasicMaterial({ map: clockScr.tex }));
  clockFace.rotation.x = -0.1;
  clockFace.position.set(0, 0.0005, 0.017);
  deskClock.add(clockFace);

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

  // gather each loose desk item into its own group so the admin layout
  // editor can pick it up whole. attach() keeps world transforms, so this
  // changes nothing visually — it only gives each thing a handle to hold.
  const wrapDeskItem = (px, pz, ...parts) => {
    const g = new THREE.Group();
    g.position.set(px, deskTopY, pz);
    desk.add(g);
    for (const p of parts) g.attach(p);
    return g;
  };
  const deskInterface = wrapDeskItem(0, -0.2, dbox, dboxKnob, dboxLed);
  const deskMonitor = wrapDeskItem(0, -0.21, monBezel, monScreen, screenGlow);
  const deskKeyboard = wrapDeskItem(-0.04, 0.13, kb, kbTop);
  const deskTrackball = wrapDeskItem(0.28, 0.13, tbBase, tbBall);
  const deskMeters = wrapDeskItem(-0.7, -0.14, pmBezel, pmScreen);
  const deskMug = wrapDeskItem(0.49, 0.04, mug, coffee);
  const deskMac = wrapDeskItem(-0.7, -0.12, mac);

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
  /* The whole instrument, in one handle. The body and the keybed are separate
     meshes with separate jobs — the chassis is the piano-voice selector, the
     strip is what you play — so the layout editor was picking up the keys and
     leaving the keyboard behind. attach() re-parents without moving anything,
     the same trick wrapDeskItem uses for the loose desk gear. */
  const midiKeys = new THREE.Group();
  midiKeys.position.set(0, 0.46, 0.27);
  desk.add(midiKeys);
  midiKeys.attach(midiBody);
  midiKeys.attach(midiKeybed);
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
    // faint sandy self-glow so the box is findable on the dark night floor
    emissive: new THREE.Color(0x6b6048), emissiveIntensity: 0.3,
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
    // a soft self-glow (carried through the toon swap) so the bowls read on a
    // dark floor at night without adding a light — the room's pitch-black after
    // dusk and these sit flat on the ground where the spotlights don't reach
    outer.material.emissive = new THREE.Color(color);
    outer.material.emissiveIntensity = 0.35;
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
    fillMat.emissive = new THREE.Color(kind === "food" ? 0x6a4a26 : 0x2f6f9c);
    fillMat.emissiveIntensity = 0.3;   // the contents glow a touch too, so you can tell food from water
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

  /* --- METRO: MIX & MASTER neon, on the bedroom door (the one light that
     stays) — the door is the portal to the mix & master site now --- */
  const neonCanvas = document.createElement("canvas");
  neonCanvas.width = 1024; neonCanvas.height = 160;
  const neonTex = new THREE.CanvasTexture(neonCanvas);
  neonTex.colorSpace = THREE.SRGBColorSpace;
  function drawNeon() {
    const g = neonCanvas.getContext("2d");
    g.clearRect(0, 0, 1024, 160);
    g.font = "500 88px 'Six Caps', sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.letterSpacing = "8px";
    g.shadowColor = "#ff4d2e"; g.shadowBlur = 16;
    g.strokeStyle = "#ff6a4a"; g.lineWidth = 3;
    g.strokeText("METRO: MIX & MASTER", 512, 82);
    g.shadowBlur = 0;
    g.fillStyle = "#fff1ec";
    g.fillText("METRO: MIX & MASTER", 512, 82);
    neonTex.needsUpdate = true;
  }
  drawNeon();
  if (document.fonts?.ready) document.fonts.ready.then(drawNeon);
  const plaque = box(0.80, 0.16, 0.012, lam(0x141518));
  plaque.position.set(0, 1.62, 0.062);
  entryDoor.add(plaque);
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.119), new THREE.MeshBasicMaterial({
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
  // a moving sun like the bedroom's — tag it explicitly so room-culling files
  // it with the boat (position alone would mis-bucket it when it rides high).
  boatSun.userData.cullRoom = "desi";
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
  boatGroup.traverse((o) => { o.layers.set(3); });   // 3, not 1 — three.js reserves 1/2 for the XR eyes

  /* --- THE CREW: the Echo Arena, far above everything ---
     Behind the Echo poster in the arcade (or one click in METRO OS).
     Laid out from the real top-down: a long hall split into orange and
     blue zones around MID, goal domes with backboards and 3-point
     bubbles at each end, floating island cubes to bank off, mid-wing
     tunnels. No lockers, no tubes — the room is for flying.
     Movement out there is pure momentum. --- */
  const ARENA = { x: 0, y: 80, z: 0, hx: 30, hy: 11, hz: 14 };
  const A = ARENA;
  const DOME_R = 8;            // the goal domes capping each end
  const GOAL_X = 34;           // ring planes, inside the domes
  const BUBBLE_R = 14;         // outside this sphere a goal pays three

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
    const plate = new THREE.Mesh(new THREE.ShapeGeometry(plateShape, 24), endMat);
    plate.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    plate.position.set(A.x + s * 38.5, A.y, A.z);
    addA(plate);
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

  /* ---- no lockers, no tubes, no ceremony: you spawn floating in the
     hall, each team nudged toward its own end so two arrivals don't
     share a skull. the room is for FLYING now. ---- */
  const grabHandles = [];   // (kept for the api: the catapults are gone)
  const kiosks = [];
  const setTubeBarriers = () => {};          // no tubes, no barriers
  const inTube = () => false;                // nobody is ever in a tube now

  /* ---- the way home: a glowing hatch mid-height on the north wall,
     right where you spawn facing. click it, you're back at the lift. ---- */
  const arenaExits = [];
  {
    const hatch = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.09, 10, 32),
      new THREE.MeshBasicMaterial({ color: 0x9fffb0 }));
    hatch.add(frame);
    const pane = new THREE.Mesh(new THREE.CircleGeometry(1.05, 28),
      new THREE.MeshBasicMaterial({ color: 0x0d1f14, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    hatch.add(pane);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.34),
      new THREE.MeshBasicMaterial({
        map: canvasTex(256, 56, (g) => {
          g.clearRect(0, 0, 256, 56);
          g.font = "900 30px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
          g.fillStyle = "#9fffb0"; g.shadowColor = "#9fffb0"; g.shadowBlur = 10;
          g.fillText("EXIT", 128, 28);
        }), transparent: true, side: THREE.DoubleSide,
      }));
    label.position.set(0, 1.55, 0);
    hatch.add(label);
    const hit = new THREE.Mesh(new THREE.CircleGeometry(1.3, 20),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
    hit.userData.arenaExit = true;
    hatch.add(hit);
    arenaExits.push(hit);
    hatch.position.set(A.x, A.y, A.z - A.hz + 0.12);   // north wall, mid-height
    addA(hatch);
  }
  const arenaSpawnFor = (team) => ({
    x: A.x + (team === "b" ? 6 : -6), y: A.y, z: A.z,
    yaw: team === "b" ? Math.PI / 2 : -Math.PI / 2,
  });

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
  arenaGroup.traverse((o) => { o.layers.set(4); });   // 4, not 2 — see the boat above

  /* --- room culling: geometry, not just lights ---------------------------
     "far away" is not the same as "out of sight". The bedroom window looks a
     hundred metres down a street, and the other rooms sit inside that view —
     so the boat's sea sheets and the venue's shell can drift into the corner
     of the glass. Every room's scenery is bucketed here by where it actually
     SITS (bounding-box centre, not group origin — boatGroup's own origin is
     0,0,0 while everything in it lives out at x=40), and main.js flips the
     buckets when you change rooms, the same moment it culls the lights. --- */
  const cullRooms = { desi: [], crew: [], venue: [], gym: [], studio: [] };
  function bucketRoomGeometry() {
    scene.updateMatrixWorld(true);
    const bb = new THREE.Box3(), c = new THREE.Vector3();
    for (const child of scene.children) {
      if (child.isLight || child === outsideGroupRef) continue;
      bb.setFromObject(child);
      if (bb.isEmpty()) continue;
      bb.getCenter(c);
      let r = null;
      if (c.y > 40) r = "crew";
      else if (c.z > 40) r = "gym";
      else if (c.z < -40) r = "studio";
      else if (c.x > 20) r = "desi";
      else if (c.x < -20) r = "venue";
      if (r) cullRooms[r].push(child);
    }
  }
  let cullScope = null;
  // anything main.js hangs on the scene AFTER the world is built (the venue's
  // big screen, for one) has to be told which room it belongs to
  function cullAdd(obj, room) {
    if (!obj || !cullRooms[room]) return obj;
    cullRooms[room].push(obj);
    obj.visible = cullScope === room;
    return obj;
  }
  function setRoomCull(scope) {
    if (scope === cullScope) return;
    cullScope = scope;
    // LA belongs to the bedroom and the arcade, and nowhere else
    outsideGroupRef.visible = scope === "home";
    for (const room in cullRooms) {
      const on = room === scope;
      for (const o of cullRooms[room]) o.visible = on;
    }
  }

  /* --- the tap-to-walk ping: a ring that lands where you pointed ---------
     Tapping the floor with nothing happening looks broken even when the walk
     has started, because the first step is slow and the camera turn hides it.
     One ring, drawn once, moved to wherever the last tap was and expanding as
     it fades. It is the receipt for a tap. --- */
  const pingRing = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.30, 28),
    new THREE.MeshBasicMaterial({
      color: 0xffd23c, transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    }));
  pingRing.rotation.x = -Math.PI / 2;
  pingRing.visible = false;
  pingRing.renderOrder = 997;
  add(pingRing);
  let pingT = 0;
  function pingFloor(x, z) {
    pingRing.position.set(x, 0.04, z);
    pingRing.visible = true;
    pingT = 1;
  }
  function tickPing(dt) {
    if (!pingRing.visible) return;
    pingT -= dt * 1.7;
    if (pingT <= 0) { pingRing.visible = false; return; }
    const grow = 1 + (1 - pingT) * 1.6;
    pingRing.scale.set(grow, grow, grow);
    pingRing.material.opacity = pingT * 0.85;
  }

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

  /* --- arcade air: the room is a dark hall full of neon, and neon in a
     dark hall always has something floating in it. two populations —
     slow motes that drift and turn over, and rarer bright embers that
     rise off the cabinets like sparks off a fire. coloured per-particle
     from the room's own palette, one draw call each. --- */
  const ARCMOTES = 300, ARCEMBERS = 70;
  const arcadeParticles = (count, colors, size, opacity, blend) => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const vel = [];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rand(AR.x0 + 0.4, AR.x1 - 0.4);
      pos[i * 3 + 1] = rand(0.15, ARC_H - 0.3);
      pos[i * 3 + 2] = rand(AR.z0 + 0.4, AR.z1 - 0.4);
      c.setHex(colors[(Math.random() * colors.length) | 0]);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      vel.push({ x: rand(-0.05, 0.05), y: rand(0.02, 0.13), z: rand(-0.05, 0.05),
                 ph: Math.random() * 7, sp: 0.4 + Math.random() * 1.1 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const pts = add(new THREE.Points(geo, new THREE.PointsMaterial({
      vertexColors: true, size, transparent: true, opacity,
      blending: blend, depthWrite: false, sizeAttenuation: true,
    })));
    pts.frustumCulled = false;
    return { geo, vel, count };
  };
  const arcDust = arcadeParticles(ARCMOTES,
    [0xff2da0, 0x22d4ff, 0xffd23c, 0x9a6bff, 0x54e08a], 0.028, 0.5, THREE.AdditiveBlending);
  const arcEmbers = arcadeParticles(ARCEMBERS,
    [0xffe9b0, 0xff8a3c, 0xff4d6a], 0.05, 0.75, THREE.AdditiveBlending);
  function tickArcadeAir(dt, t) {
    for (const [set, sway, lift] of [[arcDust, 0.22, 1], [arcEmbers, 0.1, 2.1]]) {
      const a = set.geo.attributes.position.array;
      for (let i = 0; i < set.count; i++) {
        const v = set.vel[i];
        // a lazy sideways wander so nothing rises in a straight line
        a[i * 3] += (v.x + Math.sin(t * v.sp + v.ph) * sway * 0.06) * dt;
        a[i * 3 + 1] += v.y * lift * dt;
        a[i * 3 + 2] += (v.z + Math.cos(t * v.sp * 0.8 + v.ph) * sway * 0.06) * dt;
        if (a[i * 3 + 1] > ARC_H - 0.15) {          // reaches the roof, starts again
          a[i * 3 + 1] = 0.12;
          a[i * 3] = rand(AR.x0 + 0.4, AR.x1 - 0.4);
          a[i * 3 + 2] = rand(AR.z0 + 0.4, AR.z1 - 0.4);
        }
        if (a[i * 3] > AR.x1) a[i * 3] = AR.x0; else if (a[i * 3] < AR.x0) a[i * 3] = AR.x1;
        if (a[i * 3 + 2] > AR.z1) a[i * 3 + 2] = AR.z0; else if (a[i * 3 + 2] < AR.z0) a[i * 3 + 2] = AR.z1;
      }
      set.geo.attributes.position.needsUpdate = true;
    }
  }

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
    for (const m of cabinetMixers) m.update(dt);   // the pac cabinet's attract loop
    tickNeuro(elapsed, dt);
    tickKuko(elapsed, dt, ppos);
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
    sky.tick(elapsed, dt, ppos);   // haze drifts, traffic runs, LA stays home
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
    tickArcadeAir(dt, elapsed);
    tickPing(dt);
    tickMarquee(dt, elapsed, ppos);
    hoops._tick(dt, elapsed, ppos);
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
    new THREE.MeshLambertMaterial({ map: clubFloorTex, side: THREE.DoubleSide })));
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
    // the lift doors glide toward their target; the seam light fades as they
    // part, and the cab brightens as it opens to the room
    elevDoorPos += (elevDoorTarget - elevDoorPos) * Math.min(1, dt * 6);
    const elSlide = elevDoorPos * 0.5;
    elevDoorL.position.x = elLeafLx - elSlide;
    elevDoorR.position.x = elLeafRx + elSlide;
    elSeam.material.opacity = 1 - elevDoorPos;
    elLight.intensity = elevDoorPos * 15;
    tickFireworks(dt);
    tickBackdrop(dt);
    tickFog(dt);
  }

  /* --- the gym --- THE COURT: a full-court gymnasium far out at z=+80, its own
     sealed box (like the boat / club / arena). You reach it by the JOIN sign on
     the arcade court, not on foot — nothing walkable connects it. Hoops stand at
     each baseline (rims along x); the ball + the game logic live in gymball.js,
     driven from main.js. Lit by downward SPOTLIGHTS only (cones can't reach the
     other rooms — the cross-room light rule), tagged cullRoom:"gym" so the
     phone light-budget cull (see main.js) drops them everywhere else. */
  const gym = (() => {
    const GX = 0, GZ = 80;                 // court centre, way out in +z
    const HALFL = 12.5, HALFW = 6.8;       // court half-length (along x), half-width (along z)
    const WX = 15, WZ0 = GZ - 9, WZ1 = GZ + 9, CEIL = 8;   // room shell + ceiling
    const rimY = 3.05, rimR = 0.23, ballR = 0.122;
    const BBx = HALFL - 0.55;              // backboard plane distance from centre
    const rimX = BBx - 0.42;               // rim reaches out into the court

    // --- floor: hardwood + a full-court line set, painted on one canvas. width
    // of the canvas = x (length, baseline→baseline), height = z (sideline width).
    const courtTex = canvasTex(1100, 600, (g, cw, ch) => {
      // a night-court: deep resin floor (readable, not pure black), glowing neon lines
      g.fillStyle = "#231b38"; g.fillRect(0, 0, cw, ch);
      g.strokeStyle = "rgba(120,90,200,0.10)"; g.lineWidth = 2;          // faint board seams
      for (let x = 0; x < cw; x += 28) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, ch); g.stroke(); }
      const cyan = "#3df0ff", magenta = "#ff3df0", cx = cw / 2, cy = ch / 2;
      // neon line work, drawn with a glow (shadowBlur) so it reads as lit
      g.shadowBlur = 18;
      g.strokeStyle = cyan; g.shadowColor = cyan; g.lineWidth = 6;
      g.strokeRect(20, 20, cw - 40, ch - 40);                            // boundary
      g.beginPath(); g.moveTo(cx, 20); g.lineTo(cx, ch - 20); g.stroke();// half-court line
      g.beginPath(); g.arc(cx, cy, 78, 0, Math.PI * 2); g.stroke();      // centre circle
      for (const s of [-1, 1]) {
        const base = s < 0 ? 20 : cw - 20, keyD = 200, keyW = 150, dir = s < 0 ? 1 : -1;
        g.strokeStyle = magenta; g.shadowColor = magenta; g.lineWidth = 6;
        g.strokeRect(Math.min(base, base + dir * keyD), cy - keyW / 2, keyD, keyW);   // the key
        g.beginPath(); g.arc(base + dir * keyD, cy, keyW / 2, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = cyan; g.shadowColor = cyan;
        // 3-pt arc must bulge INTO the court: west opens right (-90°→90°),
        // east opens left (90°→270°). the old formula sent the east arc off-court.
        const a0 = s < 0 ? -0.5 * Math.PI : 0.5 * Math.PI;
        const a1 = s < 0 ? 0.5 * Math.PI : 1.5 * Math.PI;
        g.beginPath(); g.arc(base + dir * 34, cy, 320, a0, a1); g.stroke();
        g.fillStyle = magenta; g.beginPath(); g.arc(base + dir * 34, cy, 9, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = "#3df0ff"; g.shadowColor = "#3df0ff"; g.shadowBlur = 26;
      g.font = "900 84px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("METRO", cx, cy);
      g.shadowBlur = 0;
    });
    // the court is MeshBasic so the neon lines self-glow (a flat Tron floor),
    // independent of how moody the lighting gets
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALFL * 2, HALFW * 2),
      new THREE.MeshBasicMaterial({ map: courtTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(GX, 0.02, GZ); add(floor);
    // a dark apron under the rest of the room (lit, so the coloured spots pool)
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(WX * 2, (WZ1 - WZ0)),
      new THREE.MeshLambertMaterial({ color: 0x251f38 }));
    apron.rotation.x = -Math.PI / 2; apron.position.set(GX, 0.0, GZ); add(apron);

    // --- shell: indigo walls + dark ceiling (cyberpunk, but light enough to
    // read on a phone — pure near-black went invisible on mobile) ---
    const wallMat = lam(0x322c52), ceilMat = lam(0x171326);
    const mkWall = (w, h, x, z, ry) => {
      const m = box(w, h, 0.2, wallMat); m.position.set(x, h / 2, z); m.rotation.y = ry; add(m); return m;
    };
    mkWall(WX * 2, CEIL, GX, WZ0, 0);                 // far sideline wall (-z)
    mkWall(WX * 2, CEIL, GX, WZ1, 0);                 // near sideline wall (+z)
    mkWall((WZ1 - WZ0), CEIL, GX - WX, GZ, Math.PI / 2);  // west baseline wall
    mkWall((WZ1 - WZ0), CEIL, GX + WX, GZ, Math.PI / 2);  // east baseline wall
    const ceil = box(WX * 2, 0.2, (WZ1 - WZ0), ceilMat);
    ceil.position.set(GX, CEIL, GZ); add(ceil);
    // --- neon: glowing strips run the walls (cyan low, magenta high) + a few
    // vertical accents on the baselines. all MeshBasic so they always glow. ---
    const neonCyan = new THREE.MeshBasicMaterial({ color: 0x3df0ff });
    const neonMag = new THREE.MeshBasicMaterial({ color: 0xff3df0 });
    for (const z of [WZ0 + 0.12, WZ1 - 0.12]) {
      const lo = box(WX * 2 - 0.6, 0.07, 0.05, neonCyan); lo.position.set(GX, 1.1, z); add(lo);
      const hi = box(WX * 2 - 0.6, 0.07, 0.05, neonMag); hi.position.set(GX, CEIL - 1.2, z); add(hi);
    }
    for (const x of [GX - WX + 0.12, GX + WX - 0.12]) {
      const lo = box(0.05, 0.07, (WZ1 - WZ0) - 0.6, neonCyan); lo.position.set(x, 1.1, GZ); add(lo);
      const hi = box(0.05, 0.07, (WZ1 - WZ0) - 0.6, neonMag); hi.position.set(x, CEIL - 1.2, GZ); add(hi);
    }
    // vertical neon pillars up the corners-ish of the long wall
    for (let i = -2; i <= 2; i++) {
      const v = box(0.06, CEIL - 1.6, 0.05, i % 2 ? neonMag : neonCyan);
      v.position.set(GX + i * 5.2, (CEIL - 1.6) / 2 + 0.2, WZ0 + 0.14); add(v);
    }
    // low dark bleachers down each sideline, each with a thin neon nose-strip
    for (const s of [-1, 1]) {
      for (let r = 0; r < 3; r++) {
        const zc = GZ + s * (HALFW + 0.7 + r * 0.7);
        const bl = box(HALFL * 2 - 1, 0.4, 0.7, lam(0x1a1730));
        bl.position.set(GX, 0.2 + r * 0.4, zc); add(bl);
        const trim = box(HALFL * 2 - 1, 0.04, 0.04, r % 2 ? neonMag : neonCyan);
        trim.position.set(GX, 0.4 + r * 0.4, zc - s * 0.35); add(trim);
      }
    }

    // --- a regulation hoop at a baseline. side -1 = west, +1 = east. The rim
    // reaches toward centre; the backboard sits just outside it. ---
    // a SQUARE backboard: light board, black edge, a red border frame and the
    // red shooter's square in the lower-centre — sitting just ABOVE the rim
    const bbTex = canvasTex(360, 280, (g, cw, ch) => {
      g.fillStyle = "#ecebe7"; g.fillRect(0, 0, cw, ch);                  // light board
      g.lineWidth = 8; g.strokeStyle = "#1a1a1a"; g.strokeRect(5, 5, cw - 10, ch - 10);   // black edge
      g.lineWidth = 15; g.strokeStyle = "#e23b30"; g.strokeRect(26, 26, cw - 52, ch - 52); // red border frame
      g.lineWidth = 13; g.strokeStyle = "#e23b30";                        // red shooter's square, low-centre
      const sqW = cw * 0.30, sqH = ch * 0.30;
      g.strokeRect(cw / 2 - sqW / 2, ch * 0.50, sqW, sqH);
    });
    const poleMat = lam(0x9aa0a8);          // round galvanized pole
    const rimMat = lam(0xe2622a);           // orange rim
    const chainMat = new THREE.MeshBasicMaterial({ color: 0xc6cad2, wireframe: true, transparent: true, opacity: 0.8 });
    const hoops = [];
    for (const side of [-1, 1]) {
      const bx = GX + side * BBx, rx = GX + side * rimX;
      const poleX = GX + side * 13.6;       // the standard stands behind the baseline (out of bounds)
      const boardY = 3.45;                  // board centre — bottom sits just below the rim (3.05)
      // round pole + a curved arm cantilevering the board out over the court
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, boardY + 0.45, 16), poleMat);
      pole.position.set(poleX, (boardY + 0.45) / 2, GZ); add(pole);
      const armLen = Math.abs(poleX - bx) + 0.1;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, armLen, 12), poleMat);
      arm.rotation.z = Math.PI / 2;
      arm.position.set((poleX + bx) / 2, boardY + 0.18, GZ); add(arm);
      // a thin board with thickness: dark backing box + a bright textured face
      // (MeshBasic so the board stays readable, not cel-shaded into the dark)
      const bbBack = box(0.08, 1.32, 1.72, lam(0xd7d4cc));
      bbBack.position.set(bx + side * 0.05, boardY, GZ); add(bbBack);
      const bbFace = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.3),
        new THREE.MeshBasicMaterial({ map: bbTex }));
      bbFace.position.set(bx, boardY, GZ); bbFace.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      add(bbFace);
      // rim + a little mount bracket back to the board
      const rim = new THREE.Mesh(new THREE.TorusGeometry(rimR, 0.025, 12, 30), rimMat);
      rim.rotation.x = Math.PI / 2; rim.position.set(rx, rimY, GZ); add(rim);
      const bracket = box(Math.abs(bx - rx) + 0.05, 0.05, 0.07, rimMat);
      bracket.position.set((bx + rx) / 2, rimY, GZ); add(bracket);
      // a silver CHAIN net: a dense wireframe cone reads as hanging links
      const net = new THREE.Mesh(
        new THREE.CylinderGeometry(rimR * 0.97, rimR * 0.46, 0.42, 12, 5, true), chainMat);
      net.position.set(rx, rimY - 0.21, GZ); add(net);
      const swish = (() => { let iv = null; return () => {
        let tt = 0; clearInterval(iv); iv = setInterval(() => {
          tt += 0.05; const sg = Math.sin(Math.min(tt, 0.3) / 0.3 * Math.PI) * 0.35;
          net.scale.set(1, 1 + sg * 0.6, 1); net.position.y = rimY - 0.2 - sg * 0.12;
          if (tt >= 0.32) { clearInterval(iv); net.scale.set(1, 1, 1); net.position.y = rimY - 0.2; }
        }, 25);
      }; })();
      hoops.push({
        side, rim: { x: rx, y: rimY, z: GZ }, rimR,
        // board faces toward centre; its normal points to -side·x
        backboard: { x: bx, faceSign: -side, z0: GZ - 0.85, z1: GZ + 0.85, y0: 2.85, y1: 4.05 },
        swish,
      });
    }

    // --- the ball: a glowing NEON rock (self-lit so it streaks through the
    // dark court) with seams + an additive halo. MeshBasic = always bright. ---
    const ballTex = canvasTex(64, 64, (g, cw, ch) => {
      g.fillStyle = "#ff7a18"; g.fillRect(0, 0, cw, ch);              // hot neon orange
      g.strokeStyle = "#3df0ff"; g.lineWidth = 3;                     // cyan seams
      g.beginPath(); g.moveTo(cw / 2, 0); g.lineTo(cw / 2, ch);
      g.moveTo(0, ch / 2); g.lineTo(cw, ch / 2); g.stroke();
      g.beginPath(); g.arc(-cw * 0.15, ch / 2, cw * 0.62, -1, 1); g.stroke();
      g.beginPath(); g.arc(cw * 1.15, ch / 2, cw * 0.62, Math.PI - 1, Math.PI + 1); g.stroke();
    });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(ballR, 18, 14),
      new THREE.MeshBasicMaterial({ map: ballTex }));
    ball.position.set(GX, ballR, GZ); add(ball);
    const ballHalo = new THREE.Mesh(new THREE.SphereGeometry(ballR * 1.55, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.28,
        blending: THREE.AdditiveBlending, depthWrite: false }));
    ball.add(ballHalo);

    // --- neon particle burst (shot / pass / dunk sparks). one cheap Points
    // cloud, mobile-friendly: a fixed pool that fades, no per-frame allocation. ---
    const P_N = 80;
    const pPos = new Float32Array(P_N * 3).fill(-999);
    const pVel = Array.from({ length: P_N }, () => ({ x: 0, y: 0, z: 0 }));
    const pLife = new Float32Array(P_N);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({ color: 0x3df0ff, size: 0.16, transparent: true,
      opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false; add(points);
    let pCursor = 0;
    const burst = (x, y, z, color = 0x3df0ff, n = 18, spread = 3) => {
      pMat.color.setHex(color);
      for (let i = 0; i < n; i++) {
        const k = (pCursor++) % P_N;
        pPos[k * 3] = x; pPos[k * 3 + 1] = y; pPos[k * 3 + 2] = z;
        pVel[k] = { x: (Math.random() - 0.5) * spread, y: Math.random() * spread * 0.8 + 0.5, z: (Math.random() - 0.5) * spread };
        pLife[k] = 0.55 + Math.random() * 0.25;
      }
      pGeo.attributes.position.needsUpdate = true;
    };
    const updateParticles = (dt) => {
      let any = false;
      for (let k = 0; k < P_N; k++) {
        if (pLife[k] <= 0) continue;
        any = true; pLife[k] -= dt;
        const v = pVel[k]; v.y -= 7 * dt;
        pPos[k * 3] += v.x * dt; pPos[k * 3 + 1] += v.y * dt; pPos[k * 3 + 2] += v.z * dt;
        if (pLife[k] <= 0) pPos[k * 3 + 1] = -999;
      }
      if (any) pGeo.attributes.position.needsUpdate = true;
    };

    // --- scoreboard hung over centre court (canvas, redrawn by setScore) ---
    const sbCv = document.createElement("canvas"); sbCv.width = 512; sbCv.height = 200;
    const sbTex = new THREE.CanvasTexture(sbCv); sbTex.colorSpace = THREE.SRGBColorSpace;
    const drawSB = (red, blue) => {
      const g = sbCv.getContext("2d");
      g.fillStyle = "#070a10"; g.fillRect(0, 0, 512, 200);
      g.strokeStyle = "#1c2230"; g.lineWidth = 8; g.strokeRect(6, 6, 500, 188);
      g.textAlign = "center"; g.textBaseline = "middle";
      g.font = "900 34px monospace";
      g.fillStyle = "#ff5a4d"; g.fillText("RED", 128, 44);
      g.fillStyle = "#5a9bff"; g.fillText("BLUE", 384, 44);
      g.font = "900 96px monospace";
      g.fillStyle = "#ff5a4d"; g.shadowColor = "#ff5a4d"; g.shadowBlur = 16; g.fillText(String(red), 128, 130);
      g.fillStyle = "#5a9bff"; g.shadowColor = "#5a9bff"; g.fillText(String(blue), 384, 130);
      g.shadowBlur = 0; g.fillStyle = "#3a4254"; g.font = "900 30px monospace"; g.fillText("·", 256, 120);
      sbTex.needsUpdate = true;
    };
    drawSB(0, 0);
    // a scoreboard mounted high on each BASELINE wall, above its hoop, facing
    // into the court — like a real gym (no more board dangling over centre).
    // both share sbTex, so drawSB() updates them together.
    const sbY = 5.7;
    for (const side of [-1, 1]) {
      const sb = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 1.37),
        new THREE.MeshBasicMaterial({ map: sbTex }));
      sb.position.set(GX + side * (WX - 0.18), sbY, GZ);
      sb.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;   // face toward centre
      add(sb);
      // a dark backer box so it reads as a mounted unit, not a floating panel
      const back = box(0.12, 1.56, 3.7, lam(0x0a0c14));
      back.position.set(GX + side * (WX - 0.05), sbY, GZ); add(back);
    }

    // --- aim guide: a faint parabola while you wind up a shot ---
    const ARC_N = 64;
    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ARC_N * 3), 3));
    const arcLine = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({
      color: 0xffd23c, transparent: true, opacity: 0.4, depthTest: false }));
    arcLine.renderOrder = 998; arcLine.visible = false; add(arcLine);
    const setArc = (pts) => {
      const pos = arcGeo.attributes.position, n = pts.length;
      for (let i = 0; i < ARC_N; i++) { const src = pts[Math.min(n - 1, Math.floor(i / (ARC_N - 1) * (n - 1)))]; pos.setXYZ(i, src.x, src.y, src.z); }
      pos.needsUpdate = true; arcLine.visible = true;
    };
    const hideGuide = () => { arcLine.visible = false; };

    // --- cyberpunk lighting that's actually BRIGHT enough on a phone: a few
    // strong SATURATED neon downlights (cyan / magenta) pool colour on the
    // court, plus two cool fills so the whole hall reads. fewer lights than
    // before (kinder to mobile GPUs — the see-through-walls uniform cap). the
    // cones stay in the room (cross-room rule); emissive tubes glow overhead. ---
    let li = 0;
    for (const lx of [-7, 7]) for (const lz of [GZ - 4, GZ + 4]) {
      const cool = (li++) % 2 === 0;
      const col = cool ? 0x49c6ff : 0xff5ad8;            // cyan / magenta
      const sp = new THREE.SpotLight(col, 230, 32, Math.PI / 2.5, 0.5, 1.0);
      sp.position.set(lx, CEIL - 0.3, lz);
      sp.target.position.set(lx, 0, lz);
      sp.userData.cullRoom = "gym"; sp.target.userData.cullRoom = "gym";
      add(sp); add(sp.target);
      // the glowing neon tube you see overhead
      const fix = box(2.6, 0.12, 0.5, new THREE.MeshBasicMaterial({ color: cool ? 0x8ff2ff : 0xff9ae8 }));
      fix.position.set(lx, CEIL - 0.16, lz); add(fix);
    }
    // bright cool fills top + mid so the room reads clearly on any screen
    for (const fy of [CEIL - 1.0, 3.2]) {
      const f = new THREE.PointLight(0xcdd8ff, fy > 4 ? 55 : 38, 42, 1.0);
      f.position.set(GX, fy, GZ); f.userData.cullRoom = "gym"; add(f);
    }

    // --- the JOIN sign, mounted on the ARCADE south wall beside the pop-a-shot
    // hoop (BX≈-14.5, wall at AR.z0): tap it to ride out to the gym. ---
    const joinTex = canvasTex(256, 320, (g) => {
      g.fillStyle = "#0a0c12"; g.fillRect(0, 0, 256, 320);
      g.strokeStyle = "#ff7a1f"; g.lineWidth = 6; g.strokeRect(8, 8, 240, 304);
      g.fillStyle = "#ff7a1f"; g.shadowColor = "#ff7a1f"; g.shadowBlur = 14;
      g.font = "70px serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("🏀", 128, 78);
      g.font = "900 40px monospace"; g.fillStyle = "#ffd9b0"; g.fillText("JOIN", 128, 150);
      g.fillText("5-ON-5", 128, 196);
      g.font = "900 26px monospace"; g.fillStyle = "#9adcff"; g.shadowColor = "#9adcff";
      g.fillText("THE GYM", 128, 250); g.fillText("▶", 128, 290);
    });
    const joinSign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.88),
      new THREE.MeshBasicMaterial({ map: joinTex, transparent: true }));
    joinSign.position.set(-12.0, 1.45, AR.z0 + 0.06);
    joinSign.userData.gymJoin = true; add(joinSign);

    // --- the EXIT panel inside the gym, on a baseline wall: tap to ride back ---
    const exitTex = canvasTex(256, 96, (g) => {
      g.fillStyle = "#0a0c12"; g.fillRect(0, 0, 256, 96);
      g.strokeStyle = "#3bff9d"; g.lineWidth = 5; g.strokeRect(6, 6, 244, 84);
      g.fillStyle = "#3bff9d"; g.shadowColor = "#3bff9d"; g.shadowBlur = 12;
      g.font = "900 34px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("◀ EXIT", 128, 50);
    });
    const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.38),
      new THREE.MeshBasicMaterial({ map: exitTex, transparent: true }));
    exitSign.position.set(GX - WX + 0.12, 2.0, GZ - 3.2);
    exitSign.rotation.y = Math.PI / 2;
    exitSign.userData.gymExit = true; add(exitSign);

    // --- the READY board: a big lit panel on each sideline wall. tap it to ready
    // up; when everyone present is ready the game tips off. main.js redraws it
    // via setReady() with the live ready count. both share one canvas/texture. ---
    const readyCv = document.createElement("canvas"); readyCv.width = 512; readyCv.height = 256;
    const readyTex = new THREE.CanvasTexture(readyCv); readyTex.colorSpace = THREE.SRGBColorSpace;
    const drawReady = (live, mine, ready, total) => {
      const g = readyCv.getContext("2d");
      g.fillStyle = "#0a0c12"; g.fillRect(0, 0, 512, 256);
      g.textAlign = "center"; g.textBaseline = "middle";
      if (live) {
        g.strokeStyle = "#3bff9d"; g.lineWidth = 9; g.strokeRect(10, 10, 492, 236);
        g.fillStyle = "#3bff9d"; g.shadowColor = "#3bff9d"; g.shadowBlur = 22;
        g.font = "900 68px monospace"; g.fillText("GAME ON", 256, 128);
      } else {
        const col = mine ? "#ffd23c" : "#3bff9d";
        g.strokeStyle = col; g.lineWidth = 9; g.strokeRect(10, 10, 492, 236);
        g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 20;
        g.font = "900 54px monospace"; g.fillText(mine ? "✓ YOU'RE READY" : "TAP TO READY", 256, 86);
        g.shadowBlur = 0;
        g.fillStyle = "#eaf2ff"; g.font = "900 46px monospace"; g.fillText(`${ready} / ${total} ready`, 256, 156);
        g.fillStyle = "#9adcff"; g.font = "800 26px monospace"; g.fillText("all ready = tip-off", 256, 208);
      }
      readyTex.needsUpdate = true;
    };
    drawReady(false, false, 0, 1);
    const readyHits = [];
    for (const sz of [-1, 1]) {
      const rs = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3),
        new THREE.MeshBasicMaterial({ map: readyTex, transparent: true }));
      rs.position.set(GX, 2.55, GZ + sz * (HALFW + 2.0));   // high on each sideline wall, above the bleachers
      rs.rotation.y = sz < 0 ? 0 : Math.PI;                 // face inward toward centre
      rs.userData.gymReady = true; rs.userData.cullRoom = "gym"; add(rs);
      readyHits.push(rs);
    }

    return {
      info: { x: GX, z: GZ }, ceilY: CEIL, floorY: 0, ballR,
      // where the ball may roam: full length to the baseline walls, but the
      // sidelines stop at the FRONT of the bleachers (the ball bounces off the
      // stands instead of passing through them)
      bounds: { x0: GX - WX + 0.3, x1: GX + WX - 0.3,
                z0: GZ - (HALFW + 0.35), z1: GZ + (HALFW + 0.35) },
      // two spawn points (one per team baseline), facing the far hoop
      spawnFor: (team) => team === "blue"
        ? { x: GX + HALFL - 3.5, z: GZ, yaw: Math.PI / 2 }    // blue defends east, faces -x
        : { x: GX - HALFL + 3.5, z: GZ, yaw: -Math.PI / 2 },  // red defends west, faces +x
      // which hoop a team attacks (red → east/+ , blue → west/-)
      hoopFor: (team) => team === "blue" ? hoops[0] : hoops[1],
      hoops, ball, mesh: ball, setArc, hideGuide,
      setScore: drawSB, burst, updateParticles,
      joinHit: joinSign, exitHit: exitSign,
      readyHits, setReady: drawReady,
    };
  })();

  // where feet may go: bedroom + closet passage + arcade room
  // (cabinet walls get ~1.1 m clearance so you can stand at any machine)
  const WALK_RECTS = [
    // the gym court — open floor inside the bleachers/poles (you can't walk
    // through them): stops short of the sideline bleachers (±7.5) and the
    // baseline hoop standards (±13.6)
    { x0: gym.info.x - 13.1, x1: gym.info.x + 13.1, z0: gym.info.z - 7.0, z1: gym.info.z + 7.0 },
    { x0: -2.3, x1: 2.3, z0: -2.35, z1: 3.0 },
    // passage reaches well into the arcade rect — overlapping rects,
    // so there's no dead strip at the threshold
    { x0: AR.x1 - 0.6, x1: -2.2, z0: CZ - OPEN_W / 2 + 0.15, z1: CZ + OPEN_W / 2 - 0.15 },
    { x0: AR.x0 + 1.15, x1: AR.x1 - 0.15, z0: AR.z0 + 0.45, z1: AR.z1 - 0.45 },
    // the bathroom: one rect per bay, two more bridging the gaps through the
    // bay partitions, and the doorway strip that reaches into the arcade rect
    // — overlapping again, so the threshold has no dead step in it. the
    // stalls are INSIDE these rects on purpose (you can walk into one); it's
    // NO_WALK that holds the dividers and the fixtures.
    { x0: BATH.x - BATH.w / 2 + 0.14, x1: BPX1 - 0.1,
      z0: AR.z0 - BATH.d + 0.16, z1: AR.z0 - 0.30 },
    { x0: BPX1 + 0.1, x1: BPX2 - 0.1, z0: AR.z0 - BATH.d + 0.16, z1: AR.z0 - 0.15 },
    { x0: BPX2 + 0.1, x1: BATH.x + BATH.w / 2 - 0.14,
      z0: AR.z0 - BATH.d + 0.16, z1: AR.z0 - 0.30 },
    { x0: BPX1 - 0.22, x1: BPX1 + 0.22, z0: -7.85, z1: -6.65 },
    { x0: BPX2 - 0.22, x1: BPX2 + 0.22, z0: -7.85, z1: -6.65 },
    { x0: bxL + 0.12, x1: bxR - 0.12, z0: AR.z0 - 0.4, z1: AR.z0 + 0.7 },
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
  // THE STUDIO is another space in this same scene, like the boat and the
  // arena — filled in once the room is built below (after the toon pass, so
  // it keeps its own look)
  let studioWalk = () => false;
  const isWalkable = (x, z) =>
    studioWalk(x, z) ||
    (!NO_WALK.some(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) &&
     (WALK_RECTS.some(r => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) ||
    // the recessed elevator cab + its threshold, walkable only when open
      (elevDoorPos > 0.45 &&
        x >= ELWALK.x0 && x <= ELWALK.x1 && z >= ELWALK.z0 && z <= ELWALK.z1)));

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

  /* --- THE STUDIO ---
     the sequencer room used to be its own web page; now it's a space in
     this scene, reached by playing the fill on the kit. built AFTER the
     toon pass so it keeps its own PBR look, and hidden until you're in it
     (an invisible group costs nothing — its lights and shadow map go with
     it). --- */
  const STUDIO = { x: 0, z: -80 };   // -80, not +80: the gym owns +80 and we were standing in its court
  const studio = buildStudioRoom({ parent: scene, offset: STUDIO });
  studio.root.visible = false;
  bucketRoomGeometry();       // now that every room exists, sort them into buckets
  setRoomCull("home");        // and start with only the bedroom's own world showing
  studioWalk = (x, z) => {
    if (Math.abs(x - STUDIO.x) > studio.half || Math.abs(z - STUDIO.z) > studio.half) return false;
    for (const c of studio.consoles) {
      if (Math.hypot(x - c.x, z - c.z) < studio.consoleR) return false;   // can't stand inside a machine
    }
    return true;
  };

  /* --- admin layout: the props the booth can pick up and re-place.
     each id maps to the group that IS that prop's spot, so position and
     rotation.y transplant cleanly. homes are recorded so reset works and
     a bad saved layout can always be walked back. --- */
  const movables = {
    tele, pedalboard, kbpedals: kbPedals, midikeys: midiKeys, radio: laRadio.group,
    lava, mixer, clock: deskClock,
    monitor: deskMonitor, interface: deskInterface, keyboard: deskKeyboard,
    trackball: deskTrackball, meters: deskMeters, mug: deskMug, mac: deskMac,
  };
  if (kukoRug) movables.rug = kukoRug;   // headless builds have no renderer, no rug
  const movableHomes = {};
  for (const [id, g] of Object.entries(movables))
    movableHomes[id] = { p: g.position.toArray(), ry: g.rotation.y, s: g.scale.x };
  function applyLayout(layout) {
    if (!layout) return;
    for (const [id, t] of Object.entries(layout)) {
      const g = movables[id];
      if (!g || !t || !Array.isArray(t.p)) continue;
      g.position.fromArray(t.p);
      if (typeof t.ry === "number") g.rotation.y = t.ry;
      if (typeof t.s === "number") g.scale.setScalar(t.s);
    }
  }
  function resetMovable(id) {
    const g = movables[id], h = movableHomes[id];
    if (g && h) { g.position.fromArray(h.p); g.rotation.y = h.ry; g.scale.setScalar(h.s); }
  }
  function layoutSnapshot() {
    const out = {};
    for (const [id, g] of Object.entries(movables))
      out[id] = { p: g.position.toArray().map(v => +v.toFixed(4)), ry: +g.rotation.y.toFixed(4), s: +g.scale.x.toFixed(4) };
    return out;
  }

  return {
    scene, walls, blockers, noteGroup, ghostGroup, tick,
    bounds: ROOM.bounds, isWalkable,
    spawn: { x: 1.7, z: 2.35, yaw: 0.28 },
    // the ONE gap between the bedroom and the arcade. anything that walks
    // itself between the two rooms (the guide) has to steer for this: the
    // opening is only 1.5 m of a 4.6 m wall, so a body heading straight at
    // its destination just meets brick. x sits in the overlap of the two
    // walk rects, so the point is walkable from either side.
    arcadeDoor: { x: -2.25, z: CZ },
    movables, applyLayout, resetMovable, layoutSnapshot,
    studio, STUDIO,
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
    smokeHits, puffSmoke, pingFloor,
    // the bathroom's mirror-only body — main.js hangs your figure in it
    bath: bathSelf,
    // the avatar podium in the arcade's far corner. `mount` is where main.js
    // hangs the figure; `spin` turns it (drag-to-turn lives in the creator).
    podium: {
      group: podGroup, mount: podMount, hits: podHits,
      anchor: { x: POD.x, y: 1.1, z: POD.z, ry: POD.ry },
      spin: (r) => { podMount.rotation.y = r; },
      spinOf: () => podMount.rotation.y,
    },
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
    setRoomCull, cullAdd,
    planeUp: () => planeT >= 0 && !planeShot,
    jetCanvas: () => jetXY(plane01, planeDir),   // (tests aim with this)
    // (u, v) is the raycast uv on the glass → sky-canvas pixels, with
    // the parallax offset baked in. returns "hit" | "miss" | null
    shootAtGlass: (u, v) => {
      if (planeT < 0 || plane01 == null || planeShot) return null;
      const { x: cx, y: cy } = sky.glassToFx(u, v);
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
    // paint the outside as if the sun sat at altDeg — the smoke harness
    // needs to photograph day AND night without waiting for either. it
    // REPLACES skyCache rather than painting once, because the beacon
    // blink redraws from that cache twice a second at night and would
    // stomp a one-off paint before the screenshot fires. updateSky()
    // still takes it back within a minute; for a screenshot that's forever.
    // interior light is untouched; this is the VIEW only.
    skyPreview: (altDeg, o = {}) => {
      const D = Math.PI / 180;
      skyCache = {
        sun: { azimuth: (o.sunAz ?? 23) * D, altitude: altDeg * D },
        // the moon follows the sun below the horizon unless a caller asks
        // for it — moonAlt/moonAz/frac exist so a test can put a daylight
        // moon in frame on purpose, which is the case that had a bug in it
        moon: { azimuth: (o.moonAz ?? -34) * D, altitude: (o.moonAlt ?? (altDeg < 0 ? 30 : -30)) * D },
        fraction: o.frac ?? 0.6,
        phase: o.phase ?? 0.25,
      };
      redrawSky(true);
    },
    edrumHits, pressEdrum, guitarHits, strumTele, guitarVoiceHits, setGuitarVoiceSwitch,
    addAccessory,
    // how much arcade you should hear from (x, z): 1 inside, a leak
    // through the open closet doorway, near-nothing across the bedroom
    arcadeZoneLevel: (x, z) => {
      if (x < -X - ALCOVE_D && x > AR.x0 && z > AR.z0 && z < AR.z1) return 1;
      if (x <= -X + 0.12 && x >= -X - ALCOVE_D && Math.abs(z - CZ) < OPEN_W) return 0.72;
      // from the bedroom the arcade is meant to be a faint, distant thing — a
      // hint of cabinet hum, not the loudest thing in the room. it only swells
      // to regular volume once you actually step through into the arcade. with
      // the closet shut it drops below the attract-melody threshold (0.04) so
      // the chiptune goes quiet entirely.
      const leak = closet.open ? 1 : 0.2;    // doors do their job
      const d = Math.hypot(x + X, z - CZ);
      return Math.max(0, 0.14 - d * 0.07) * leak;
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
    pool, pool2, hoops,
    // THE GYM — full-court basketball, far out at z=+80 (gymball.js drives it)
    gym,
    inGym: (x, z) => z > 40,
    gymSpawnFor: gym.spawnFor,
    discGroup, discHit, setArenaScore,
    elevHits, elevCallHits, setElevatorDoors, elevatorOpen, inElevatorCab,
    // where you land when you leave any room — back inside the cab, facing out
    // the (open) doors into the arcade, so the lift is the hub for every trip
    elevReturn: { x: ELC.x, z: zWall - 0.4, yaw: Math.PI },
    setScores,
    setParallax,
    boatSpawn: { x: BOAT.x, z: BOAT.z + 0.4, yaw: 0 },
    inBoat: (x) => x > 30,
    // THE CLUB (the dj bar — name pending)
    clubInfo: CLUB,
    clubSpawn: { x: CLUB.x + 2.6, z: CLUB.z + 3.6, yaw: 0.35 },
    // the ARCADE bar (built up in the arcade section). counter runs E-W along x
    // against the south wall; the bartender patrols x on his standing line
    // (cross z), faces +z (the room) to greet patrons leaning in from the north.
    barInfo: {
      run: "x", min: -7.2, max: -4.8, cross: AR.z0 + 0.55, faceYaw: 0,
      patronAxis: "z", patronSign: 1, patronLine: AR.z0 + 0.9,
    },
    // the arcade mirror: east wall, just south of the entrance doorway (a hard
    // left as you walk in). sits proud of the wall (AR.x1), glass facing -x.
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
      /* Derived, not written down. The keybed is a movable prop now (the
         booth can pull it out from the desk), and a hardcoded perch would
         leave the cat pacing thin air where the keyboard used to be. Half a
         key-width in at each end so it walks the keys rather than the rim. */
      get keys() {
        const p = new THREE.Vector3();
        midiKeybed.getWorldPosition(p);
        return { x1: p.x - 0.43, x2: p.x + 0.43, z: p.z, y: p.y + 0.04 };
      },
      // between the e-kit and the desk: the old spot (-1.7,-2.7) was six
      // centimetres from the kick drum, so the cat's window seat was
      // INSIDE the instrument. no collision system fixes a bed in a drum.
      windowFloor: { x: -1.15, z: -2.72 },
      foodBowl: { x: 2.12, z: 0.75 },
      waterBowl: { x: 2.12, z: 1.08 },
      litter: { x: -2.1, z: 2.8 },
      bounds: ROOM.bounds,
      /* floor furniture the cat walks AROUND now, not through. axis-aligned
         rects, deliberately a little generous. a rect that contains the
         cat's own destination stays passable — the keybed and the chair are
         perches, and a cat that can't reach its perch just wedges. */
      avoid: [
        { x0: -2.65, x1: -1.25, z0: -3.3, z1: -2.05 },   // the e-kit
        { x0: -0.85, x1: 1.30, z0: -3.3, z1: -2.38 },    // the desk
        { x0: 1.45, x1: 2.45, z0: -2.7, z1: -1.15 },     // tele + amp corner
      ],
    },
  };
}
