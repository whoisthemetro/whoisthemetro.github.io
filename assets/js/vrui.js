/* ============================================================
   THE METRO — in-world windows (VR)

   DOM overlays don't exist inside a headset, and for a long time the
   answer was vrBlocked("…needs a flat screen"). This is the better
   answer: a window that pops up IN THE ROOM — a canvas painted onto a
   plane, hung in front of you where you opened it, worked with the
   laser and trigger like everything else. Close it and walk away, or
   just walk away — past a few metres it closes itself.

   One window at a time. A window is rows of widgets:
     { label: "SKIN" }                       a small caps heading
     { text: "…" | () => "…", cls }         a body line (fn = live)
     { lines: () => [{text, cls}], max }    a terminal block
     { buttons: [{ label, on?, accent?, tip?, cb }] }
     { swatches: [{ c, on?, cb }] }
     { gap: px }
   Labels/text can be functions so repaint() re-reads the world.

   The mesh carries userData.vrui; main.js adds it to the raycast
   targets and forwards hover/click hits here. It renders with
   depthTest OFF (a window buried in the desk is a window you can't
   read) — same trade a DOM overlay makes.
   ============================================================ */

import * as THREE from "three";

const W = 640;                    // canvas width — heights are computed
const PAD = 18;
/* the terminal block is sized so the WIDEST thing METRO OS prints fits on
   one line. its commands already wrap themselves to 58 characters for the
   DOM shell, and at 18px this canvas fit ~55 — so every long line got wrapped
   a second time, into ragged hanging indents. 15px monospace clears 58. */
const LINE_FONT = "500 15px ui-monospace, Menlo, Consolas, monospace";
const LINE_H = 21;
const TITLE_H = 48;
const PANEL_W = 0.92;             // metres in the room
const CLOSE_DIST = 3.4;           // walk this far away and it lets go

// the room's palette: amber phosphor on near-black, like the terminal
const INK = {
  bg: "rgba(10,12,16,0.94)",
  frame: "rgba(255,179,71,0.55)",
  title: "#ffd9a0",
  label: "#8a97a8",
  text: "#d8c9a8",
  bright: "#ffe9c0",
  dim: "#8a7a5c",
  err: "#ff6a5a",
  cmdline: "#9ab88a",
  btn: "#1a1822",
  btnEdge: "#3a3545",
  btnText: "#cdd5dd",
  btnOn: "#2a6fb0",
  btnOnEdge: "#5aa6e8",
  accent: "#2f6b4a",
};

export function createVRUI({ scene, camera }) {
  let win = null;   // { mesh, tex, cvs, g, widgets, rows, title, onClose, anchor, hover, pressed }

  const headPos = new THREE.Vector3();
  const headFwd = new THREE.Vector3();

  /* ---------- layout: turn rows into positioned widgets ---------- */
  function layout(rows, g) {
    const widgets = [];   // clickable rects
    const paint = [];     // everything drawable, in order
    let y = TITLE_H + 10;
    for (const row of rows) {
      if (row.gap) { y += row.gap; continue; }
      if (row.label !== undefined) {
        paint.push({ kind: "label", y, get: () => (typeof row.label === "function" ? row.label() : row.label) });
        y += 26;
      } else if (row.text !== undefined) {
        paint.push({ kind: "text", y, cls: row.cls, get: () => (typeof row.text === "function" ? row.text() : row.text) });
        y += 28;
      } else if (row.lines) {
        const max = row.max || 14;
        paint.push({ kind: "lines", y, max, get: row.lines });
        y += max * LINE_H + 8;
      } else if (row.buttons) {
        let x = PAD;
        g.font = "600 20px Archivo, system-ui, sans-serif";
        let rowY = y;
        for (const b of row.buttons) {
          const tw = g.measureText(b.label).width;
          const w = Math.ceil(tw) + 28;
          if (x + w > W - PAD) { x = PAD; rowY += 48; }
          const wg = { kind: "button", x, y: rowY, w, h: 40, ...b };
          widgets.push(wg); paint.push(wg);
          x += w + 8;
        }
        y = rowY + 48;
      } else if (row.swatches) {
        // gap 6, not 8: the shirt row is 14 swatches, and at 8 the last dot
        // wrapped onto a lonely second row
        const d = 36, gap = 6;
        let x = PAD, rowY = y;
        for (const s of row.swatches) {
          if (x + d > W - PAD) { x = PAD; rowY += d + gap; }
          const wg = { kind: "swatch", x, y: rowY, w: d, h: d, ...s };
          widgets.push(wg); paint.push(wg);
          x += d + gap;
        }
        y = rowY + d + 10;
      }
    }
    return { widgets, paint, height: y + PAD };
  }

  /* ---------- painting ---------- */
  function draw() {
    if (!win) return;
    const { g, cvs, paint, title } = win;
    const H = cvs.height;
    g.clearRect(0, 0, W, H);
    // the card
    g.fillStyle = INK.bg;
    g.strokeStyle = INK.frame;
    g.lineWidth = 3;
    roundRect(g, 2, 2, W - 4, H - 4, 14);
    g.fill(); g.stroke();
    // title bar
    g.font = "800 22px ui-monospace, Menlo, Consolas, monospace";
    g.fillStyle = INK.title;
    g.textAlign = "left"; g.textBaseline = "middle";
    g.fillText(title, PAD, TITLE_H / 2 + 4);
    g.strokeStyle = "rgba(255,179,71,0.25)";
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(PAD, TITLE_H); g.lineTo(W - PAD, TITLE_H); g.stroke();
    // ✕
    drawButton(g, win.closeWg, "✕");

    for (const p of paint) {
      if (p.kind === "label") {
        g.font = "700 15px ui-monospace, Menlo, monospace";
        g.fillStyle = INK.label;
        g.textAlign = "left"; g.textBaseline = "top";
        g.fillText(String(p.get()).toUpperCase(), PAD, p.y + 4);
      } else if (p.kind === "text") {
        g.font = "600 20px ui-monospace, Menlo, monospace";
        g.fillStyle = INK[p.cls] || INK.text;
        g.textAlign = "left"; g.textBaseline = "top";
        g.fillText(clip(g, String(p.get()), W - PAD * 2), PAD, p.y + 2);
      } else if (p.kind === "lines") {
        g.font = LINE_FONT;
        g.textAlign = "left"; g.textBaseline = "top";
        const rows = wrapLines(g, p.get() || [], W - PAD * 2).slice(-p.max);
        rows.forEach((ln, i) => {
          g.fillStyle = INK[ln.cls] || INK.text;
          g.fillText(ln.text, PAD, p.y + i * LINE_H);
        });
      } else if (p.kind === "button") {
        drawButton(g, p, p.label);
      } else if (p.kind === "swatch") {
        const on = p.on && p.on();
        g.beginPath();
        g.arc(p.x + p.w / 2, p.y + p.h / 2, p.w / 2 - 3, 0, Math.PI * 2);
        g.fillStyle = p.c; g.fill();
        g.lineWidth = on ? 4 : 2;
        g.strokeStyle = on ? "#ffffff" : (win.hover === p ? INK.btnOnEdge : "#4a4555");
        g.stroke();
      }
    }
    win.tex.needsUpdate = true;
  }

  function drawButton(g, b, label) {
    const on = b.on && b.on();
    const hot = win.hover === b || win.pressed === b;
    g.fillStyle = b.accent ? INK.accent : on ? INK.btnOn : INK.btn;
    g.strokeStyle = hot ? "#ffd9a0" : on ? INK.btnOnEdge : INK.btnEdge;
    g.lineWidth = hot ? 3 : 2;
    roundRect(g, b.x, b.y, b.w, b.h, 9);
    g.fill(); g.stroke();
    g.font = "600 20px Archivo, system-ui, sans-serif";
    g.fillStyle = b.accent || on ? "#ffffff" : INK.btnText;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function clip(g, s, maxW) {
    if (g.measureText(s).width <= maxW) return s;
    while (s.length && g.measureText(s + "…").width > maxW) s = s.slice(0, -1);
    return s + "…";
  }

  // terminal lines can run long — wrap by words so nothing walks off the card
  function wrapLines(g, lines, maxW) {
    const out = [];
    for (const ln of lines) {
      const text = ln.text || "";
      if (g.measureText(text).width <= maxW) { out.push(ln); continue; }
      let row = "";
      for (const w of text.split(" ")) {
        const t = row ? row + " " + w : w;
        if (g.measureText(t).width > maxW && row) { out.push({ text: row, cls: ln.cls }); row = "  " + w; }
        else row = t;
      }
      if (row) out.push({ text: row, cls: ln.cls });
    }
    return out;
  }

  /* ---------- open / close ---------- */
  function open({ title = "", rows = [], onClose = null, side = 0 }) {
    close();   // one window at a time — opening another replaces it

    const cvs = document.createElement("canvas");
    const g = cvs.getContext("2d");
    const { widgets, paint, height } = layout(rows, g);
    cvs.width = W; cvs.height = height;

    const closeWg = { kind: "button", x: W - PAD - 40, y: 8, w: 40, h: 34, label: "✕", cb: () => close() };
    widgets.push(closeWg);

    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(PANEL_W, PANEL_W * (height / W)),
      // depthTest off + late renderOrder: it's a WINDOW, it reads over the
      // room the way a DOM overlay would, instead of burying in the desk
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    mesh.renderOrder = 950;
    mesh.userData.vrui = true;

    /* hang it where you're looking. the read distance follows the card's
       HEIGHT: the radio is a postcard and wants to be close, the creator is
       1.3 m of panel and at the same distance would fill your whole view.
       roughly a constant angular size, clamped to arm's reach either way.
       `side` slides it off-axis (the creator uses it so you still see the
       figure you're dressing). */
    const panelH = PANEL_W * (height / W);
    const dist = Math.min(2.1, Math.max(1.15, 0.55 + panelH * 0.95));
    camera.getWorldPosition(headPos);
    camera.getWorldDirection(headFwd);
    headFwd.y = 0;
    if (headFwd.lengthSq() < 1e-6) headFwd.set(0, 0, -1); else headFwd.normalize();
    const rightX = -headFwd.z, rightZ = headFwd.x;
    mesh.position.set(
      headPos.x + headFwd.x * dist + rightX * side,
      headPos.y - 0.06,
      headPos.z + headFwd.z * dist + rightZ * side);
    mesh.lookAt(headPos.x, mesh.position.y, headPos.z);
    scene.add(mesh);

    win = { mesh, tex, cvs, g, widgets, paint, title, onClose, closeWg,
            anchor: headPos.clone(), hover: null, pressed: null };
    draw();
    return { repaint: draw, close };
  }

  function close() {
    if (!win) return;
    const w = win;
    win = null;                      // null FIRST — onClose may repaint/reopen
    scene.remove(w.mesh);
    w.mesh.geometry.dispose();
    w.mesh.material.dispose();
    w.tex.dispose();
    if (w.onClose) w.onClose();
  }

  /* ---------- hits: hover paints, click fires ---------- */
  function widgetAt(hit) {
    if (!win || !hit.uv) return null;
    const px = hit.uv.x * W, py = (1 - hit.uv.y) * win.cvs.height;
    for (const wg of win.widgets) {
      if (px >= wg.x && px <= wg.x + wg.w && py >= wg.y && py <= wg.y + wg.h) return wg;
    }
    return null;
  }

  // returns what the hand is over (its tip text) so the wrist HUD can say it
  function hover(hit) {
    if (!win) return "";
    const wg = hit ? widgetAt(hit) : null;
    if (wg !== win.hover) { win.hover = wg; draw(); }
    if (!wg) return "";
    return wg.tip || (wg.kind === "swatch" ? "pick the colour" : wg.label || "");
  }

  function click(hit) {
    if (!win) return false;
    const wg = widgetAt(hit);
    if (!wg || !wg.cb) return true;   // the card itself swallows the click
    win.pressed = wg;
    draw();
    const w = win;
    setTimeout(() => { if (win === w) { win.pressed = null; draw(); } }, 130);
    wg.cb();
    if (win === w) draw();            // the world changed under it — re-read
    return true;
  }

  // called on a slow interval from main.js: let go when you walk away
  function tick(pos) {
    if (!win) return;
    const dx = pos.x - win.anchor.x, dz = pos.z - win.anchor.z;
    if (dx * dx + dz * dz > CLOSE_DIST * CLOSE_DIST) close();
  }

  return {
    open, close, hover, click, tick,
    isOpen: () => !!win,
    mesh: () => (win ? win.mesh : null),
    repaint: () => draw(),
    /* test rig: a headless harness can't wear a headset, so this is how it
       finds a button to aim at — canvas rects, and the uv that hits each
       one's centre (v measured from the TOP, the way the canvas is) */
    _widgets: () => (win ? win.widgets.map((w) => ({
      label: w.label || "", kind: w.kind,
      u: (w.x + w.w / 2) / W, v: (w.y + w.h / 2) / win.cvs.height,
    })) : []),
  };
}
