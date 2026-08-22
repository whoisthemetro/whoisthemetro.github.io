/* ============================================================
   THE BEDROOM — the month plate over the wall

   The wall used to be a fixed amount of room, and on 2026-08-22 it ran
   out: all three bedroom walls were full and every attempt to post was
   being refused in the browser, silently, with no trace of it reaching
   the server. Somebody was invited to leave a note and the room ignored
   her.

   Making the notes smaller bought two months and would have bought the
   same problem back in November. This is the actual fix: the wall shows
   ONE MONTH, new notes land on the month we're in, and the months behind
   it are still there to walk back through. A wall that turns over can't
   fill up, and nothing is ever thrown away — which matters, because the
   room's own promise is "it's on the wall. it stays."

   The plate is what tells you that, and it has to LOOK like part of the
   room rather than a control panel: it's the label above a gallery wall,
   which is exactly what it is. One canvas, three meshes — the same
   texture hung over each bedroom wall, because the month is a property
   of the room and not of the wall you happen to be facing.
   ============================================================ */

import * as THREE from "three";
import { monthLabel } from "./notes3d.js";

const W = 768, H = 132;
const C = {
  plate: "#171b21", edge: "rgba(255,196,106,0.45)",
  text: "#f0e7d8", dim: "#8b8375", live: "#ffc46a", tick: "#3a4049",
};

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r); g.closePath();
}
function label(g, t, x, y, size, color, align = "left", font = "ui-monospace, Menlo, monospace") {
  g.fillStyle = color;
  g.font = `${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = "middle";
  g.fillText(t, x, y);
}

/* ---------- layout, read by both the painter and the hit test ---------- */
const PAD = 14, ARROW = 60;
function layout(count) {
  const trackX = PAD + ARROW + 16, trackW = W - (PAD + ARROW + 16) * 2;
  return {
    left: { x: PAD, y: PAD, w: ARROW, h: H - PAD * 2 },
    right: { x: W - PAD - ARROW, y: PAD, w: ARROW, h: H - PAD * 2 },
    titleY: 46,
    trackY: 100, trackX, trackW,
    // one tick per month. they stay a comfortable size until there are
    // enough months that they have to share the rail.
    tickW: Math.max(6, Math.min(26, trackW / Math.max(1, count) - 4)),
    tickAt: (i) => trackX + (count <= 1 ? trackW / 2 : (i / (count - 1)) * trackW),
  };
}

export function draw(g, months, sel, opts = {}) {
  const L = layout(months.length);
  const i = Math.max(0, months.findIndex(m => m.key === sel));
  const m = months[i] || { key: sel, count: 0 };

  g.clearRect(0, 0, W, H);
  g.fillStyle = C.plate;
  rr(g, 2, 2, W - 4, H - 4, 12); g.fill();
  g.strokeStyle = C.edge; g.lineWidth = 2;
  rr(g, 2, 2, W - 4, H - 4, 12); g.stroke();

  // the arrows dim out at the ends of the run rather than disappearing —
  // a control that vanishes reads as broken, one that greys reads as done
  const canBack = i > 0, canFwd = i < months.length - 1;
  label(g, "◀", L.left.x + L.left.w / 2, H / 2 - 6, 40, canBack ? C.text : "#3b4048", "center");
  label(g, "▶", L.right.x + L.right.w / 2, H / 2 - 6, 40, canFwd ? C.text : "#3b4048", "center");

  const title = monthLabel(m.key).toUpperCase();
  label(g, title, W / 2, L.titleY, 40, C.text, "center", "Georgia, 'Times New Roman', serif");
  const n = m.count | 0;
  const sub = opts.live
    ? (n ? `${n} up · this month, and where new ones go` : "nothing up yet — this month's wall is yours")
    : `${n} ${n === 1 ? "note" : "notes"} · ${opts.readOnly ? "an older wall" : ""}`.trim().replace(/·\s*$/, "");
  label(g, sub, W / 2, L.titleY + 30, 17, opts.live ? C.live : C.dim, "center");

  // the rail: one tick per month, the one you're reading lit
  g.strokeStyle = C.tick; g.lineWidth = 2;
  g.beginPath(); g.moveTo(L.trackX, L.trackY); g.lineTo(L.trackX + L.trackW, L.trackY); g.stroke();
  // tick height IS that month's traffic — square-rooted, because one busy
  // month otherwise flattens every other one into the rail. a month with
  // nothing in it stays a stub, so quiet stretches read as quiet.
  const busiest = Math.max(1, ...months.map(m2 => m2.count));
  for (let k = 0; k < months.length; k++) {
    const x = L.tickAt(k), on = k === i, n2 = months[k].count;
    const h2 = n2 ? 9 + Math.sqrt(n2 / busiest) * 17 : 6;
    g.fillStyle = on ? C.live : n2 ? "#6d7684" : "#3a4049";
    rr(g, x - L.tickW / 2, L.trackY - h2 / 2, L.tickW, h2, 3);
    g.fill();
    if (on) {                       // the one you're reading wears a collar
      g.strokeStyle = C.live; g.lineWidth = 2;
      rr(g, x - L.tickW / 2 - 4, L.trackY - h2 / 2 - 4, L.tickW + 8, h2 + 8, 5);
      g.stroke();
    }
  }
}

// u,v from the raycast. v is flipped: 0 is the BOTTOM of a three.js plane.
export function hit(u, v, months) {
  const px = u * W, py = (1 - v) * H, L = layout(months.length);
  const inRect = (r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  if (inRect(L.left)) return { type: "step", d: -1 };
  if (inRect(L.right)) return { type: "step", d: 1 };
  if (py > L.trackY - 26 && py < L.trackY + 26 && months.length) {
    // nearest tick wins, so a fat finger on the rail still lands somewhere
    let best = 0, bd = Infinity;
    for (let k = 0; k < months.length; k++) {
      const d = Math.abs(px - L.tickAt(k));
      if (d < bd) { bd = d; best = k; }
    }
    return { type: "pick", index: best };
  }
  return { type: "none" };
}

/* ---------- the thing you hang on the wall ----------
   ONE canvas and ONE material, worn by a mesh over each bedroom wall.
   Three plates that always say the same thing is three copies of the same
   fact; sharing the texture makes that true by construction rather than
   by remembering to redraw all of them. */
export function makeMonthPlate() {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const PW = 1.6, PH = PW * (H / W);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  const meshes = [];
  let dirty = true;

  return {
    width: PW, height: PH, material: mat,
    // world.js calls this once per bedroom wall
    makeMesh() {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), mat);
      mesh.userData.monthPlate = true;
      meshes.push(mesh);
      return mesh;
    },
    meshes,
    markDirty() { dirty = true; },
    render(months, sel, opts) {
      if (!dirty) return;
      dirty = false;
      draw(g, months, sel, opts);
      tex.needsUpdate = true;
    },
  };
}
