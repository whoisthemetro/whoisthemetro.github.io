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
import { getSunPosition, getMoonPosition, getMoonIllumination } from "./astro.js";

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

  function draw(sun, moon, moonFrac, wx = { clouds: 0, fog: false, rain: 0 }) {
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

    g.fillStyle = sunAlt > 5 ? "rgba(70,80,95,0.85)" : "#05070c";
    for (let i = 0; i < 26; i++) {
      const bw = 14 + ((i * 37) % 38);
      const bh = 18 + ((i * 53) % 46);
      g.fillRect(i * 28, 280 - bh, bw, bh);
    }
    if (sunAlt < -4) {
      const glow = g.createLinearGradient(0, 280, 0, 190);
      glow.addColorStop(0, "rgba(255,160,80,0.35)");
      glow.addColorStop(1, "rgba(255,160,80,0)");
      g.fillStyle = glow;
      g.fillRect(0, 190, 720, 90);
      for (let i = 0; i < 60; i++) {
        g.fillStyle = `rgba(255,${190 + (i % 3) * 20},120,${0.5 + (i % 5) * 0.1})`;
        g.fillRect((i * 47) % 716, 280 - ((i * 13) % 52), 2, 2);
      }
    }

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

  const walls = [];
  function postableWall(id, w, mat, setup, origin, uDir, normal) {
    const mesh = add(plane(w, H, mat));
    setup(mesh);
    mesh.userData.postable = true;
    mesh.receiveShadow = true;
    walls.push({ id, mesh, w, h: H, origin, uDir, vDir: new THREE.Vector3(0, 1, 0), normal });
    return mesh;
  }

  postableWall("back", W,
    new THREE.MeshLambertMaterial({
      map: wallTexture(W, H, [
        [0.56, 1.0, 0.6, 1.2], [1.72, 1.0, 0.6, 1.2],
        [2.88, 1.0, 0.6, 1.2], [4.04, 1.0, 0.6, 1.2],
      ]),
    }),
    m => { m.rotation.y = Math.PI; m.position.set(0, H / 2, ZB); },
    new THREE.Vector3(X, 0, ZB), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1));

  postableWall("west", D,
    new THREE.MeshLambertMaterial({
      map: wallTexture(D, H, [
        [0.31, 1.0, 0.55, 1.2], [1.17, 1.0, 0.55, 1.2], [2.03, 1.0, 0.55, 1.2],
        [6.0, 1.0, 0.55, 1.2],
      ]),
    }),
    m => { m.rotation.y = Math.PI / 2; m.position.set(-X, H / 2, 0); },
    new THREE.Vector3(-X, 0, ZB), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0));

  postableWall("east", D,
    new THREE.MeshLambertMaterial({
      map: wallTexture(D, H, [
        [0.58, 1.0, 0.55, 1.2], [1.71, 1.0, 0.55, 1.2],
        [2.85, 1.0, 0.55, 1.2], [3.98, 1.0, 0.55, 1.2],
      ]),
    }),
    m => { m.rotation.y = -Math.PI / 2; m.position.set(X, H / 2, 0); },
    new THREE.Vector3(X, 0, ZF), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0));

  const front = add(plane(W, H, new THREE.MeshLambertMaterial({
    map: wallTexture(W, H, [
      [0.125, 1.0, 0.55, 1.2], [4.525, 1.0, 0.55, 1.2],
    ]),
  })));
  front.position.set(0, H / 2, ZF);
  front.receiveShadow = true;

  /* --- the window (faces south over LA) --- */
  const WIN = { w: 3.6, h: 1.4, cx: 0, cy: 1.6 };
  const sky = makeSky();
  const glass = add(plane(WIN.w, WIN.h, new THREE.MeshBasicMaterial({ map: sky.tex })));
  glass.position.set(WIN.cx, WIN.cy, ZF + 0.01);

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
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, WIN.w + 0.7, 8), lam(0x4a443a));
  rod.rotation.z = Math.PI / 2;
  rod.position.set(WIN.cx, WIN.cy + WIN.h / 2 + 0.3, ZF + 0.11);
  add(rod);

  // Shadow mask: invisible casters covering the front wall EXCEPT the
  // window, so the beam can only truly enter through the glass — like
  // real life. Without this the directional light rakes straight through
  // the wall and lights/shadows the doors.
  const maskMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  for (const [mw, mh, mx, my] of [
    [(W - WIN.w) / 2, H, -(WIN.w / 2 + (W - WIN.w) / 4), H / 2],   // left of window
    [(W - WIN.w) / 2, H, WIN.w / 2 + (W - WIN.w) / 4, H / 2],      // right of window
    [WIN.w, H - (WIN.cy + WIN.h / 2), 0, (H + WIN.cy + WIN.h / 2) / 2],  // above
    [WIN.w, WIN.cy - WIN.h / 2, 0, (WIN.cy - WIN.h / 2) / 2],      // below
  ]) {
    const mask = plane(mw, mh, maskMat);
    mask.position.set(mx, my, ZF - 0.06);
    mask.castShadow = true;
    add(mask);
  }

  /* --- ALL room light comes from outside --- */
  // soft spill just inside the glass
  const windowLight = add(new THREE.PointLight(0x9fb6e8, 0, 9, 2));
  windowLight.position.set(WIN.cx, WIN.cy, ZF + 0.6);
  // the beam: parallel rays from where the sun/moon actually is,
  // throwing real shadows (including the blind slats) into the room
  const beam = new THREE.DirectionalLight(0xfff0d8, 0);
  beam.castShadow = true;
  beam.shadow.mapSize.set(1024, 1024);
  beam.shadow.camera.left = -5; beam.shadow.camera.right = 5;
  beam.shadow.camera.top = 5; beam.shadow.camera.bottom = -5;
  beam.shadow.camera.near = 0.5; beam.shadow.camera.far = 30;
  beam.shadow.bias = -0.0004;
  add(beam);
  beam.target.position.set(0, 0.6, 0);
  add(beam.target);
  // sky bounce — the only "ambient", and it follows the sky too
  const skyFill = add(new THREE.HemisphereLight(0x8a96a8, 0x2a241c, 0.3));

  let wx = { clouds: 0, rain: 0, fog: false };

  function updateSky() {
    const now = new Date();
    const sun = getSunPosition(now, LAT, LNG);
    const moon = getMoonPosition(now, LAT, LNG);
    const { fraction } = getMoonIllumination(now);
    sky.draw(sun, moon, fraction, wx);

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
      windowLight.intensity = 0.55;
      beam.color.set(0x7a7080);
      beam.intensity = 0.08;
      skyFill.color.set(0x565e6e); skyFill.groundColor.set(0x241f18);
      skyFill.intensity = 0.18;
    }

    // clouds soften everything; rain a touch more
    const dim = Math.max(0.18, 1 - 0.65 * wx.clouds - (wx.rain ? 0.12 : 0));
    beam.intensity *= dim;
    windowLight.intensity *= Math.max(0.3, 1 - 0.45 * wx.clouds);
    skyFill.intensity *= Math.max(0.5, 1 - 0.3 * wx.clouds);

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
    windowLight.intensity = lightBase.win * k + 0.02;
    skyFill.intensity = lightBase.fill * k + 0.07;
  }
  updateSky();

  function setWeather(w) {
    wx = w || wx;
    rainPane.visible = wx.rain > 0;
    updateSky();
  }

  /* --- doors --- */
  function door(w, h, x, z, rotY, double = false) {
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
      knob.position.set(w / 2 - 0.09, 1.02, 0.05);
      grp.add(knob);
    }
    grp.position.set(x, 0, z);
    grp.rotation.y = rotY;
    add(grp);
    blockers.push(leaf);
    return grp;
  }
  door(0.82, 2.03, -X + 0.035, -2.1, Math.PI / 2);
  door(1.5, 2.03, -X + 0.035, -0.4, Math.PI / 2, true);
  const entryDoor = door(0.86, 2.03, X - 0.035, 2.3, -Math.PI / 2);

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
  desk.add(monScreen);
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

  // midi controller tucked under the desk, keys barely sticking out
  const midiBody = caster(box(0.96, 0.065, 0.27, lam(0x191b1f)));
  midiBody.position.set(0, 0.46, 0.27);
  desk.add(midiBody);
  // one playable C major octave, low on the left → high on the right
  const keysCanvas = document.createElement("canvas");
  keysCanvas.width = 480; keysCanvas.height = 60;
  const keysTex = new THREE.CanvasTexture(keysCanvas);
  keysTex.colorSpace = THREE.SRGBColorSpace;
  function drawKeys(pressed = -1) {
    const g = keysCanvas.getContext("2d");
    const kw = 480 / 8;
    g.fillStyle = "#f2f2ef";
    g.fillRect(0, 0, 480, 60);
    if (pressed >= 0) {
      g.fillStyle = "#ffb347";
      g.fillRect(pressed * kw, 0, kw, 60);
    }
    g.fillStyle = "#0c0c0e";
    for (let i = 1; i < 8; i++) g.fillRect(i * kw - 2, 0, 4, 60);
    // black keys: none between E–F (3–4) and B–C (7–8)
    for (const i of [0, 1, 3, 4, 5]) g.fillRect((i + 1) * kw - 7, 0, 14, 32);
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
    clumps.forEach((c, i) => { c.visible = dirty > (i + 1) / 6; });
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
  let dawAt = 0, meterAt = 0, clockAt = 0, skyAt = 0;
  let nextCityAt = 40 + rand(0, 60);
  let onCity = null;

  function tick(dt) {
    elapsed += dt;

    if (elapsed - dawAt > 0.09) { dawAt = elapsed; daw.draw(); }
    if (elapsed - meterAt > 0.15) { meterAt = elapsed; meterScr.draw(); }
    if (elapsed - clockAt > 1) { clockAt = elapsed; clockScr.draw(); }
    if (elapsed - skyAt > 60) { skyAt = elapsed; updateSky(); }

    screenGlow.intensity = 2.6 + Math.sin(elapsed * 2.3) * 0.45 + Math.sin(elapsed * 7.1) * 0.25;

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

    nextCityAt -= dt;
    if (nextCityAt <= 0) {
      nextCityAt = rand(70, 180);
      if (onCity) { try { onCity(Math.random() < 0.5 ? "siren" : "car"); } catch (e) {} }
    }
  }

  return {
    scene, walls, blockers, noteGroup, ghostGroup, tick,
    bounds: ROOM.bounds,
    spawn: { x: 1.7, z: 2.35, yaw: 0.28 },
    setCityListener: fn => { onCity = fn; },
    setWeather,
    getWeather: () => wx,
    careTargets, updateCare,
    curtainHits, toggleCurtains,
    curtainsClosed: () => curtains.closed,
    pianoMesh: midiKeybed, pressPianoKey,
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
