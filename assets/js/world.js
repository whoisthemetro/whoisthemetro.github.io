/* ============================================================
   THE METRO — the room
   A bedroom home studio at night, generated entirely in code:
   desk against the front wall with an ultrawide riding on a
   Dangerous Music D-Box MK1, Apple keyboard + trackball,
   Mac Studio with a portable monitor on top, a MIDI controller
   half-tucked under the desk, a 12U rack on casters with an
   Apollo Twin on top, an ergo chair, sound panels, and three
   doors (bathroom, closet, entry).

   The DAW on the ultrawide is always playing — moving playhead,
   bouncing meters — so the room is alive even when empty.

   Layout (meters), y up, floor y=0, ceiling y=2.7:
     x: -2.6 (left wall: bathroom door + closet) .. 2.6 (right wall: entry door)
     z: -2.2 (front wall: desk) .. 2.2 (back wall)
   ============================================================ */

import * as THREE from "three";
import { rand } from "./util.js";

export const ROOM = {
  X: 2.6, ZF: -2.2, ZB: 2.2, H: 2.7,
  bounds: { minX: -2.3, maxX: 2.3, minZ: -1.3, maxZ: 1.9 },
};

/* ---------------- procedural textures ---------------- */

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function woodFloorTexture() {
  const t = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = "#5a4634";
    g.fillRect(0, 0, w, h);
    const plank = 128;
    for (let y = 0; y < h; y += plank) {
      const tone = 0.85 + Math.random() * 0.3;
      g.fillStyle = `rgb(${90 * tone | 0},${70 * tone | 0},${52 * tone | 0})`;
      g.fillRect(0, y + 2, w, plank - 4);
      // grain
      g.strokeStyle = "rgba(40,28,18,0.25)";
      for (let i = 0; i < 14; i++) {
        g.beginPath();
        const gy = y + 8 + Math.random() * (plank - 16);
        g.moveTo(0, gy);
        for (let x = 0; x <= w; x += 64) g.lineTo(x, gy + Math.sin(x * 0.01 + i) * 3);
        g.stroke();
      }
      // butt joints
      g.fillStyle = "rgba(30,20,12,0.5)";
      for (let x = (y / plank % 2) * 256; x < w; x += 512) g.fillRect(x, y, 3, plank);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// A full wall painted as one canvas: warm drywall, baseboard, and a
// scatter of acoustic panels drawn in (flat, so notes pin right over them).
function wallTexture(wMeters, hMeters, panels = [], opts = {}) {
  const ppm = 200;  // pixels per meter
  return canvasTex(Math.round(wMeters * ppm), Math.round(hMeters * ppm), (g, w, h) => {
    g.fillStyle = opts.base || "#3b3f46";
    g.fillRect(0, 0, w, h);
    // subtle mottle
    for (let i = 0; i < w * h / 240; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.018})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    // acoustic panels: [u, v, wM, hM] in meters from bottom-left
    for (const [pu, pv, pw, ph] of panels) {
      const x = pu * ppm, y = h - (pv + ph) * ppm;
      g.fillStyle = "#16181c";
      g.fillRect(x, y, pw * ppm, ph * ppm);
      g.fillStyle = "#202329";
      g.fillRect(x + 5, y + 5, pw * ppm - 10, ph * ppm - 10);
      // bevel + fabric weave
      g.strokeStyle = "rgba(0,0,0,0.55)";
      g.lineWidth = 4;
      g.strokeRect(x + 2, y + 2, pw * ppm - 4, ph * ppm - 4);
      g.fillStyle = "rgba(255,255,255,0.025)";
      for (let yy = y; yy < y + ph * ppm; yy += 5) g.fillRect(x, yy, pw * ppm, 1);
    }
    // baseboard
    g.fillStyle = "#23262b";
    g.fillRect(0, h - 0.1 * ppm, w, 0.1 * ppm);
  });
}

function rackFaceTexture() {
  return canvasTex(256, 360, (g, w, h) => {
    g.fillStyle = "#0e1013";
    g.fillRect(0, 0, w, h);
    // rails with screw holes
    g.fillStyle = "#1c2025";
    g.fillRect(0, 0, 18, h); g.fillRect(w - 18, 0, 18, h);
    g.fillStyle = "#000";
    for (let y = 10; y < h; y += 22) { g.fillRect(6, y, 7, 7); g.fillRect(w - 13, y, 7, 7); }
    // a few units
    const unit = (y, uh, draw) => {
      g.fillStyle = "#15181d";
      g.fillRect(20, y, w - 40, uh - 4);
      g.strokeStyle = "#000"; g.lineWidth = 2;
      g.strokeRect(20, y, w - 40, uh - 4);
      draw(y, uh);
    };
    unit(8, 52, (y) => {            // power conditioner
      g.fillStyle = "#d8dee4"; g.font = "700 13px Archivo"; g.fillText("PWR", 30, y + 30);
      for (let i = 0; i < 8; i++) { g.fillStyle = i < 6 ? "#3be07a" : "#222"; g.fillRect(110 + i * 14, y + 20, 8, 12); }
    });
    unit(64, 52, (y) => {           // interface w/ knobs
      for (let i = 0; i < 4; i++) {
        g.fillStyle = "#2a2e35"; g.beginPath(); g.arc(50 + i * 46, y + 24, 13, 0, 7); g.fill();
        g.strokeStyle = "#888"; g.lineWidth = 2;
        g.beginPath(); g.moveTo(50 + i * 46, y + 24); g.lineTo(50 + i * 46 + 8, y + 14); g.stroke();
      }
      g.fillStyle = "#e0653a"; g.fillRect(212, y + 18, 8, 8);
    });
    unit(120, 100, (y) => {         // vented blank
      g.fillStyle = "#0a0c0e";
      for (let yy = y + 12; yy < y + 84; yy += 12) g.fillRect(34, yy, w - 68, 5);
    });
    unit(224, 52, (y) => {          // patchbay
      g.fillStyle = "#000";
      for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(38 + i * 15, y + 18, 5, 0, 7); g.fill(); }
      for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(38 + i * 15, y + 36, 5, 0, 7); g.fill(); }
    });
    // empty space below = future gear
  });
}

function doorTexture(double = false) {
  return canvasTex(double ? 512 : 256, 640, (g, w, h) => {
    g.fillStyle = "#4a4540";
    g.fillRect(0, 0, w, h);
    const panel = (x, y, pw, ph) => {
      g.strokeStyle = "rgba(0,0,0,0.4)"; g.lineWidth = 5;
      g.strokeRect(x, y, pw, ph);
      g.strokeStyle = "rgba(255,255,255,0.06)"; g.lineWidth = 2;
      g.strokeRect(x + 6, y + 6, pw - 12, ph - 12);
    };
    const leaves = double ? 2 : 1;
    for (let l = 0; l < leaves; l++) {
      const ox = l * (w / leaves);
      panel(ox + 22, 30, w / leaves - 44, 250);
      panel(ox + 22, 320, w / leaves - 44, 280);
      if (double) { g.fillStyle = "#1a1c1f"; g.fillRect(ox + (l ? 4 : w / 2 - 8), 0, 4, h); }
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
  // pre-baked clip layout so it doesn't change frame to frame
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
    // toolbar
    g.fillStyle = "#1a1d23"; g.fillRect(0, 0, 1024, 26);
    g.fillStyle = "#3be07a"; g.beginPath(); g.moveTo(12, 6); g.lineTo(22, 13); g.lineTo(12, 20); g.fill();
    g.fillStyle = "#d8dee4"; g.font = "11px Archivo"; g.fillText("the metro session — 96 kHz", 36, 17);
    const rowH = (432 - 60) / TRACKS;
    for (let i = 0; i < TRACKS; i++) {
      const y = 32 + i * rowH;
      g.fillStyle = i % 2 ? "#14161b" : "#16191e";
      g.fillRect(0, y, 1024, rowH - 2);
      // track header + meter
      g.fillStyle = "#1e2228"; g.fillRect(0, y, 126, rowH - 2);
      meters[i] = Math.max(0.05, Math.min(1, meters[i] + (Math.random() - 0.48) * 0.25));
      g.fillStyle = "#22262c"; g.fillRect(96, y + 4, 8, rowH - 10);
      const mh = (rowH - 10) * meters[i];
      g.fillStyle = meters[i] > 0.85 ? "#e05050" : "#3be07a";
      g.fillRect(96, y + 4 + (rowH - 10) - mh, 8, mh);
      g.fillStyle = "#9aa3ad"; g.font = "10px Archivo"; g.fillText(["kick","snare","hats","808","keys","gtr","vox 1","vox 2","pad","fx","bus"][i] || "trk", 8, y + 14);
    }
    // clips with fake waveforms
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
    // timeline + playhead
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

/* ---------------- world ---------------- */

export function buildWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080b);
  scene.fog = new THREE.Fog(0x07080b, 6, 30);

  const { X, ZF, ZB, H } = ROOM;
  const W = 2 * X;          // 5.2 room width
  const D = ZB - ZF;        // 4.4 room depth

  const add = (m) => { scene.add(m); return m; };
  const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  const plane = (w, h, mat) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const lam = (color) => new THREE.MeshLambertMaterial({ color });

  const blockers = [];      // doors etc — clickable but not postable

  /* --- shell --- */
  const floorTex = woodFloorTexture();
  floorTex.repeat.set(2, 2);
  const floor = add(plane(W, D, new THREE.MeshLambertMaterial({ map: floorTex })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, (ZF + ZB) / 2);

  const ceil = add(plane(W, D, lam(0x2b2e33)));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, H, (ZF + ZB) / 2);

  // postable walls — id, origin (bottom-left facing the wall), uDir, vDir, normal
  const walls = [];
  function postableWall(id, w, mat, setup, origin, uDir, normal) {
    const mesh = add(plane(w, H, mat));
    setup(mesh);
    mesh.userData.postable = true;
    walls.push({ id, mesh, w, h: H, origin, uDir, vDir: new THREE.Vector3(0, 1, 0), normal });
    return mesh;
  }

  // back wall — big panel cluster
  postableWall("back", W,
    new THREE.MeshLambertMaterial({
      map: wallTexture(W, H, [
        [0.6, 1.0, 0.6, 1.2], [1.35, 1.0, 0.6, 1.2],
        [3.25, 1.0, 0.6, 1.2], [4.0, 1.0, 0.6, 1.2],
      ]),
    }),
    m => { m.rotation.y = Math.PI; m.position.set(0, H / 2, ZB); },
    new THREE.Vector3(X, 0, ZB), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1));

  // left wall — panels between the doors
  postableWall("west", D,
    new THREE.MeshLambertMaterial({
      map: wallTexture(D, H, [[2.0, 1.1, 0.55, 1.1], [3.7, 1.1, 0.55, 1.1]]),
    }),
    m => { m.rotation.y = Math.PI / 2; m.position.set(-X, H / 2, (ZF + ZB) / 2); },
    new THREE.Vector3(-X, 0, ZB), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0));

  // right wall — panels forward of the entry door
  postableWall("east", D,
    new THREE.MeshLambertMaterial({
      map: wallTexture(D, H, [[0.5, 1.1, 0.55, 1.1], [1.25, 1.1, 0.55, 1.1], [2.0, 1.1, 0.55, 1.1]]),
    }),
    m => { m.rotation.y = -Math.PI / 2; m.position.set(X, H / 2, (ZF + ZB) / 2); },
    new THREE.Vector3(X, 0, ZF), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0));

  // front wall (desk wall) — not postable, dressed in panels around the screen
  const front = add(plane(W, H, new THREE.MeshLambertMaterial({
    map: wallTexture(W, H, [
      [0.35, 1.5, 0.55, 0.9], [1.05, 1.5, 0.55, 0.9],
      [3.6, 1.5, 0.55, 0.9], [4.3, 1.5, 0.55, 0.9],
      [1.75, 2.05, 0.55, 0.45], [2.9, 2.05, 0.55, 0.45],
    ], { base: "#34383f" }),
  })));
  front.position.set(0, H / 2, ZF);

  /* --- doors --- */
  function door(w, h, x, z, rotY, double = false) {
    const grp = new THREE.Group();
    const leaf = box(w, h, 0.045, new THREE.MeshLambertMaterial({ map: doorTexture(double) }));
    leaf.position.y = h / 2;
    grp.add(leaf);
    // frame
    const fm = lam(0x26282c);
    for (const side of [-1, 1]) {
      const jamb = box(0.06, h + 0.06, 0.08, fm);
      jamb.position.set(side * (w / 2 + 0.03), (h + 0.06) / 2, 0);
      grp.add(jamb);
    }
    const head = box(w + 0.12, 0.06, 0.08, fm);
    head.position.set(0, h + 0.03, 0);
    grp.add(head);
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
  door(0.82, 2.03, -X + 0.035, -1.3, Math.PI / 2);          // bathroom — left of desk
  door(1.5, 2.03, -X + 0.035, 0.45, Math.PI / 2, true);     // closet — left of bathroom door
  door(0.86, 2.03, X - 0.035, 1.4, -Math.PI / 2);           // entry — right wall near back

  /* --- the desk rig --- */
  const deskTopY = 0.74;
  const desk = new THREE.Group();

  const top = box(1.9, 0.04, 0.78, new THREE.MeshLambertMaterial({ color: 0x2b241c }));
  top.position.y = deskTopY - 0.02;
  desk.add(top);
  for (const sx of [-0.88, 0.88]) {  // metal frame legs
    const leg = box(0.05, deskTopY - 0.04, 0.7, lam(0x16181b));
    leg.position.set(sx, (deskTopY - 0.04) / 2, 0);
    desk.add(leg);
  }

  // D-Box MK1 — squat black box, big monitor knob on the face
  const dbox = box(0.36, 0.105, 0.26, lam(0x111317));
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
  const monBezel = box(monW + 0.02, monH + 0.02, 0.03, lam(0x0c0d10));
  monBezel.position.set(0, deskTopY + 0.105 + monH / 2 + 0.01, -0.21);
  desk.add(monBezel);
  const monScreen = plane(monW, monH, new THREE.MeshBasicMaterial({ map: daw.tex }));
  monScreen.position.set(0, monBezel.position.y, -0.21 + 0.016);
  desk.add(monScreen);
  const screenGlow = new THREE.PointLight(0x8fb6ff, 9, 4.5, 2);
  screenGlow.position.set(0, deskTopY + 0.45, -0.05);
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
  const mac = box(0.2, 0.095, 0.2, new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 0.6, roughness: 0.45 }));
  mac.position.set(-0.7, deskTopY + 0.0475, -0.12);
  desk.add(mac);
  const meterScr = makeMeterScreen();
  const pmBezel = box(0.35, 0.225, 0.012, lam(0x0c0d10));
  pmBezel.rotation.x = -0.12;
  pmBezel.position.set(-0.7, deskTopY + 0.095 + 0.115, -0.14);
  desk.add(pmBezel);
  const pmScreen = plane(0.33, 0.2, new THREE.MeshBasicMaterial({ map: meterScr.tex }));
  pmScreen.rotation.x = -0.12;
  pmScreen.position.set(-0.7, pmBezel.position.y, -0.133);
  desk.add(pmScreen);

  // midi controller tucked under the desk, keys barely sticking out
  const midiBody = box(0.96, 0.065, 0.27, lam(0x191b1f));
  midiBody.position.set(0, 0.46, 0.27);
  desk.add(midiBody);
  const midiKeys = canvasTex(480, 60, (g) => {
    g.fillStyle = "#f2f2ef"; g.fillRect(0, 0, 480, 60);
    g.fillStyle = "#0c0c0e";
    for (let x = 0; x < 480; x += 19) {
      g.fillRect(x + 17, 0, 4, 60);                 // gaps
      if ((x / 19) % 7 !== 2 && (x / 19) % 7 !== 6) g.fillRect(x + 12, 0, 10, 34);  // black keys
    }
  });
  const midiKeybed = plane(0.9, 0.1, new THREE.MeshLambertMaterial({ map: midiKeys }));
  midiKeybed.rotation.x = -Math.PI / 2;
  midiKeybed.position.set(0, 0.494, 0.345);
  desk.add(midiKeybed);

  desk.position.set(0.2, 0, -1.81);   // desk back edge against the front wall
  add(desk);

  /* --- 12U rack on casters, apollo twin on top --- */
  const rack = new THREE.Group();
  const rb = box(0.56, 0.62, 0.6, lam(0x101317));
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
  // apollo twin — little silver wedge with the big knob
  const apollo = box(0.16, 0.065, 0.15, new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.65, roughness: 0.4 }));
  apollo.position.set(0, 0.62 + 0.06 + 0.0325, 0.1);
  rack.add(apollo);
  const apKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.018, 18),
    new THREE.MeshStandardMaterial({ color: 0x2c2f34, metalness: 0.7, roughness: 0.35 }));
  apKnob.position.set(0, 0.62 + 0.06 + 0.068, 0.12);
  rack.add(apKnob);
  rack.position.set(1.95, 0, -1.55);
  rack.rotation.y = -0.25;
  add(rack);

  /* --- ergo chair, pushed aside --- */
  const chair = new THREE.Group();
  const seat = box(0.48, 0.07, 0.46, lam(0x1c1e22));
  seat.position.y = 0.47;
  chair.add(seat);
  const backRest = box(0.46, 0.62, 0.06, lam(0x23262b));
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
  chair.position.set(0.85, 0, -1.05);
  chair.rotation.y = 0.8;
  add(chair);

  /* --- LED strip + lamp + neon --- */
  const led = box(1.86, 0.015, 0.015, new THREE.MeshBasicMaterial({ color: 0x7a4dff }));
  led.position.set(0.2, deskTopY + 0.02, ZF + 0.03);
  add(led);
  const ledLight = add(new THREE.PointLight(0x7a4dff, 7, 3.2, 2));
  ledLight.position.set(0.2, deskTopY + 0.15, ZF + 0.25);

  // small neon METRO over the desk — drawn once the display font is in,
  // otherwise the glow blurs into a solid blob
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
  const neon = add(plane(1.15, 0.29, new THREE.MeshBasicMaterial({
    map: neonTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  })));
  neon.position.set(0.2, 2.25, ZF + 0.03);
  const neonLight = add(new THREE.PointLight(0xff4d2e, 7, 4, 2));
  neonLight.position.set(0.2, 2.2, ZF + 0.35);

  // warm floor lamp, back-left corner
  const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 1.5, 8), lam(0x222428));
  lampPole.position.set(-2.25, 0.75, 1.85);
  add(lampPole);
  const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.22, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, side: THREE.DoubleSide }));
  lampShade.position.set(-2.25, 1.55, 1.85);
  add(lampShade);
  const lampLight = add(new THREE.PointLight(0xffc88a, 22, 7, 2));
  lampLight.position.set(-2.25, 1.5, 1.8);

  /* --- general light --- */
  add(new THREE.AmbientLight(0x6a727d, 1.7));
  add(new THREE.HemisphereLight(0x4c545c, 0x241f18, 1.2));
  // soft ceiling bounce so the corners read
  const bounce = add(new THREE.PointLight(0xb8c0c8, 16, 9, 2));
  bounce.position.set(0, H - 0.25, 0.4);

  /* --- dust in the lamplight --- */
  const DUST = 220;
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
  let dawAt = 0, meterAt = 0;
  let nextCityAt = 40 + rand(0, 60);
  let onCity = null;

  function tick(dt) {
    elapsed += dt;

    // the DAW never stops
    if (elapsed - dawAt > 0.09) { dawAt = elapsed; daw.draw(); }
    if (elapsed - meterAt > 0.15) { meterAt = elapsed; meterScr.draw(); }

    // screen light breathes with the imaginary mix
    screenGlow.intensity = 8 + Math.sin(elapsed * 2.3) * 1.2 + Math.sin(elapsed * 7.1) * 0.6;

    // neon sputter
    if (Math.random() < 0.004) neonLight.intensity = 2;
    else neonLight.intensity = 7 * (0.88 + 0.12 * Math.sin(elapsed * 1.9));

    // dust
    const p = dustGeo.attributes.position.array;
    for (let i = 0; i < DUST; i++) {
      const v = dustVel[i];
      p[i * 3] += v.x * dt; p[i * 3 + 1] += v.y * dt; p[i * 3 + 2] += v.z * dt;
      if (p[i * 3 + 1] > H) p[i * 3 + 1] = 0.05;
      if (p[i * 3] > X) p[i * 3] = -X; else if (p[i * 3] < -X) p[i * 3] = X;
      if (p[i * 3 + 2] > ZB) p[i * 3 + 2] = ZF; else if (p[i * 3 + 2] < ZF) p[i * 3 + 2] = ZB;
    }
    dustGeo.attributes.position.needsUpdate = true;

    // the city outside, faintly
    nextCityAt -= dt;
    if (nextCityAt <= 0) {
      nextCityAt = rand(70, 180);
      if (onCity) { try { onCity(Math.random() < 0.5 ? "siren" : "car"); } catch (e) {} }
    }
  }

  return {
    scene, walls, blockers, noteGroup, ghostGroup, tick,
    bounds: ROOM.bounds,
    spawn: { x: 1.55, z: 1.25, yaw: 0.42 },
    setCityListener: fn => { onCity = fn; },
  };
}
