/* ============================================================
   THE METRO — notes on the wall, in 3D
   Each note is a little plane with a canvas-drawn texture:
     note  → sticky paper with handwriting (Caveat)
     photo → polaroid with the image + caption
     link  → small glowing plaque with title + domain

   Placement is stored as (wall id, u, v) in 0..1, so notes land
   in the same physical spot for every visitor on every screen.
   ============================================================ */

import * as THREE from "three";
import { PAPERS, hostOf } from "./util.js";

const NOTE_W = 0.30, PHOTO_W = 0.38, LINK_W = 0.36;

// footprint on the wall per kind, in meters [w, h]
const KIND_SIZE = {
  note: [NOTE_W, NOTE_W],
  photo: [PHOTO_W, PHOTO_W * (300 / 256)],
  link: [LINK_W, LINK_W * (132 / 256)],
};
const PAD = 0.03;   // breathing room between notes
// usable vertical strip as a fraction of wall height — notes live between
// these. wider band + smaller notes = the wall holds a lot more before it's
// genuinely "packed" (it used to cap at the middle 13%–78% of the wall).
const BAND_LO = 0.08, BAND_HI = 0.86;

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function wrapText(g, text, maxW, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const tryLine = line ? line + " " + w : w;
    if (g.measureText(tryLine).width > maxW && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) { lines[maxLines - 1] += "…"; return lines; }
    } else {
      line = tryLine;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

function paperFor(note) {
  return PAPERS.find(p => p.bg === note.color) || PAPERS[0];
}

/* ---------------- canvas painters ---------------- */

function drawNote(note) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const paper = paperFor(note);
  g.fillStyle = paper.bg;
  g.fillRect(0, 0, 256, 256);
  // soft edge shading so it reads as paper, not a flat decal
  const sh = g.createLinearGradient(0, 0, 256, 256);
  sh.addColorStop(0, "rgba(255,255,255,0.10)");
  sh.addColorStop(1, "rgba(0,0,0,0.14)");
  g.fillStyle = sh;
  g.fillRect(0, 0, 256, 256);
  // tape
  g.fillStyle = "rgba(245,242,230,0.55)";
  g.fillRect(88, 0, 80, 22);

  g.fillStyle = paper.ink;
  g.font = "500 30px Caveat, cursive";
  g.textBaseline = "top";
  const lines = wrapText(g, note.text || "", 216, 6);
  lines.forEach((ln, i) => g.fillText(ln, 20, 36 + i * 32));

  if (note.author) {
    g.font = "700 22px Caveat, cursive";
    g.textAlign = "right";
    g.fillText("— " + note.author, 236, 222);
  }
  return c;
}

function drawPhoto(note, img) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 300;
  const g = c.getContext("2d");
  g.fillStyle = "#f4f0e6";
  g.fillRect(0, 0, 256, 300);
  g.fillStyle = "#101214";
  g.fillRect(14, 14, 228, 228);
  if (img) {
    // cover-fit into the square window
    const s = Math.max(228 / img.width, 228 / img.height);
    const w = img.width * s, h = img.height * s;
    g.save();
    g.beginPath(); g.rect(14, 14, 228, 228); g.clip();
    g.drawImage(img, 14 + (228 - w) / 2, 14 + (228 - h) / 2, w, h);
    g.restore();
  }
  g.fillStyle = "#3a352c";
  g.font = "500 24px Caveat, cursive";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const cap = (note.text || "").slice(0, 40);
  g.fillText(cap, 128, 272, 228);
  return c;
}

function drawLink(note) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 132;
  const g = c.getContext("2d");
  roundRect(g, 2, 2, 252, 128, 10);
  g.fillStyle = "#14181d";
  g.fill();
  g.strokeStyle = "#ffb347";
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = "#e8e4da";
  g.font = "600 21px Archivo, sans-serif";
  g.textBaseline = "top";
  const title = note.text || hostOf(note.url) || "a link";
  wrapText(g, title, 200, 2).forEach((ln, i) => g.fillText(ln, 18, 22 + i * 27));
  g.fillStyle = "#ffb347";
  g.font = "400 17px Archivo, sans-serif";
  g.fillText(hostOf(note.url) + "  ↗", 18, 94);
  return c;
}

/* ---------------- the wall manager ---------------- */

export class NotesWall {
  constructor(group, walls, store) {
    this.group = group;          // THREE.Group from world
    this.walls = walls;
    this.store = store;
    this.byId = new Map();       // id -> mesh
    this.seq = 0;                // stacking order → tiny z offsets
    this.occupied = new Map();   // wall id -> [{id, cu, cv, hu, hv}] in meters
  }

  has(id) { return this.byId.has(id); }

  setAll(notes) {
    // oldest first → the deterministic de-overlap below gives every
    // visitor the exact same layout
    const sorted = [...notes].sort((a, b) =>
      String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)));
    for (const n of sorted) this.add(n);
  }

  // Every note is its own thing: if the stored spot overlaps an earlier
  // note, walk a deterministic spiral outward to the nearest free patch.
  _resolveSpot(wall, note) {
    const [kw, kh] = KIND_SIZE[note.kind] || KIND_SIZE.note;
    const hu = kw / 2 + PAD, hv = kh / 2 + PAD;
    const taken = this.occupied.get(wall.id) || [];
    const voids = wall.voids || [];
    const collides = (cu, cv) =>
      taken.some(o => Math.abs(cu - o.cu) < hu + o.hu && Math.abs(cv - o.cv) < hv + o.hv)
      || voids.some(r => cu + hu > r.u0 && cu - hu < r.u1 && cv + hv > r.v0 && cv - hv < r.v1);
    const clampU = (cu) => Math.min(wall.w * 0.96 - hu, Math.max(wall.w * 0.04 + hu, cu));
    const clampV = (cv) => Math.min(wall.h * BAND_HI - hv, Math.max(wall.h * BAND_LO + hv, cv));

    let cu = clampU(note.x * wall.w);
    let cv = clampV(note.y * wall.h);
    if (!collides(cu, cv)) return { cu, cv, hu, hv };

    const STEP = 0.07;
    for (let ring = 1; ring <= 60; ring++) {
      const n = 8 * ring;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const tu = clampU(note.x * wall.w + Math.cos(a) * ring * STEP);
        const tv = clampV(note.y * wall.h + Math.sin(a) * ring * STEP);
        if (!collides(tu, tv)) return { cu: tu, cv: tv, hu, hv };
      }
    }

    // the spiral lost its way — sweep every legal patch on the wall and
    // take the free one nearest home. clamping bends the spiral along the
    // edges, so on a crowded wall it can miss pockets that really exist.
    const cells = [];
    for (let tv = wall.h * BAND_LO + hv; tv <= wall.h * BAND_HI - hv; tv += 0.05)
      for (let tu = wall.w * 0.04 + hu; tu <= wall.w * 0.96 - hu; tu += 0.05)
        cells.push([tu, tv]);
    cells.sort((p, q) =>
      ((p[0] - cu) ** 2 + (p[1] - cv) ** 2) - ((q[0] - cu) ** 2 + (q[1] - cv) ** 2));
    for (const [tu, tv] of cells)
      if (!collides(tu, tv)) return { cu: tu, cv: tv, hu, hv };

    // the sweep above checked every legal patch — if nothing's free, the wall
    // is genuinely full. notes never overlap, so we'd rather skip this one than
    // stack it on someone else's. (deterministic: every visitor resolves the
    // same oldest-first order, so they all skip the very same note.)
    return null;
  }

  add(note) {
    if (this.byId.has(note.id)) return;
    const wall = this.walls.find(w => w.id === note.wall);
    if (!wall) return;

    // claim a free patch first — a full wall returns null and we skip the note
    // rather than build a mesh nobody can place without overlapping.
    const spot = this._resolveSpot(wall, note);
    if (!spot) return null;

    let canvas, w, h;
    if (note.kind === "photo") {
      canvas = drawPhoto(note, null);
      w = PHOTO_W; h = PHOTO_W * (300 / 256);
    } else if (note.kind === "link") {
      canvas = drawLink(note);
      w = LINK_W; h = LINK_W * (132 / 256);
    } else {
      canvas = drawNote(note);
      w = NOTE_W; h = NOTE_W;
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    // slight self-glow so what people leave is always readable in the gloom.
    // Real depth-testing: walls properly hide notes from other rooms. Notes
    // can't end up buried in doors anymore because door zones are voids.
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshLambertMaterial({
        map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.42,
      }),
    );

    // world position from (wall, u, v), de-overlapped so every note owns
    // its own patch of wall, with a tiny stagger against z-fighting
    if (!this.occupied.has(wall.id)) this.occupied.set(wall.id, []);
    this.occupied.get(wall.id).push({ id: note.id, ...spot });

    mesh.userData.note = note;
    this._placeMesh(mesh, wall, spot.cu, spot.cv, note.rot || 0);
    this.group.add(mesh);
    this.byId.set(note.id, mesh);

    // photos load their image async, then repaint
    if (note.kind === "photo" && note.image_path) {
      const url = this.store.imageUrl(note.image_path);
      if (url) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          tex.image = drawPhoto(note, img);
          tex.needsUpdate = true;
        };
        img.src = url;
      }
    }
    return mesh;
  }

  // pin a note's mesh onto (wall, cu, cv) in meters, proud of the wall by a
  // staggered offset so coincident notes never z-fight. reused by add + move.
  _placeMesh(mesh, wall, cu, cv, rot) {
    // proud-of-wall offset: enough to clear z-fighting, but capped UNDER the
    // shallowest wall decor so a note can never poke out past it. acoustic
    // slabs front-face at 0.073 m, the gold-record frame at 0.07 m — a note
    // that stuck out further read as "floating in front of the panel" at a
    // grazing angle (the #12 occlusion bug). 48 levels × 0.6 mm → 0.030–0.058 m
    // keeps every note recessed behind the panels, so depth-test hides them.
    if (mesh.userData.zoff == null) mesh.userData.zoff = 0.03 + (this.seq++ % 48) * 0.0006;
    const pos = wall.origin.clone()
      .addScaledVector(wall.uDir, cu)
      .addScaledVector(wall.vDir, cv)
      .addScaledVector(wall.normal, mesh.userData.zoff);
    mesh.position.copy(pos);
    mesh.quaternion.copy(wall.mesh.quaternion);
    mesh.rotateZ(rot || 0);
  }

  /* ---------- pick up & re-hang your OWN note ---------- */

  // lift a note off the wall: free its patch, float it on top of everything
  // (depthTest off) so it reads as "in hand". returns its home spot for cancel.
  pickUp(id) {
    const mesh = this.byId.get(id);
    if (!mesh) return null;
    const note = mesh.userData.note;
    for (const taken of this.occupied.values()) {
      const i = taken.findIndex(o => o.id === id);
      if (i >= 0) { taken.splice(i, 1); break; }
    }
    mesh.userData.carrying = true;
    mesh.renderOrder = 999;
    mesh.material.depthTest = false;
    mesh.material.transparent = true;
    mesh.material.opacity = 0.82;
    return { wall: note.wall, x: note.x, y: note.y, rot: note.rot || 0 };
  }

  // while carried: hover the mesh at a raw (wall, x, y) without claiming a patch
  preview(id, place) {
    const mesh = this.byId.get(id);
    const wall = this.walls.find(w => w.id === place.wall);
    if (!mesh || !wall) return;
    this._placeMesh(mesh, wall, place.x * wall.w, place.y * wall.h, mesh.userData.note.rot || 0);
  }

  // does this exact spot sit clear of every other note + void on the wall?
  // (no spiral — just the honest "is this patch free" the preview tint wants)
  spotFree(place) {
    const wall = this.walls.find(w => w.id === place.wall);
    if (!wall) return false;
    const note = { kind: "note", ...place };
    const [kw, kh] = KIND_SIZE[note.kind] || KIND_SIZE.note;
    const hu = kw / 2 + PAD, hv = kh / 2 + PAD;
    const cu = place.x * wall.w, cv = place.y * wall.h;
    const taken = this.occupied.get(wall.id) || [];
    const voids = wall.voids || [];
    return !taken.some(o => Math.abs(cu - o.cu) < hu + o.hu && Math.abs(cv - o.cv) < hv + o.hv)
      && !voids.some(r => cu + hu > r.u0 && cu - hu < r.u1 && cv + hv > r.v0 && cv - hv < r.v1);
  }

  // would a fresh post of this kind find a home on the wall right now?
  // read-only (doesn't claim the patch) — used to check BEFORE hitting the db
  // so a genuinely packed wall never fires the post webhook or leaves an
  // orphan row nobody can see.
  canPlace(wallId, kind, x, y) {
    const wall = this.walls.find(w => w.id === wallId);
    if (!wall) return false;
    return this._resolveSpot(wall, { kind, x, y }) != null;
  }

  // set the note down at place: re-resolve a free patch (spiral, like a fresh
  // post), settle the mesh, restore solid rendering. returns the FINAL place
  // (normalized to the resolved spot, so reloads land it exactly here) or null
  // if the wall has no room.
  drop(id, place) {
    const mesh = this.byId.get(id);
    const wall = this.walls.find(w => w.id === place.wall);
    if (!mesh || !wall) return null;
    const note = { ...mesh.userData.note, wall: place.wall, x: place.x, y: place.y };
    const spot = this._resolveSpot(wall, note);
    if (!spot) return null;
    if (!this.occupied.has(wall.id)) this.occupied.set(wall.id, []);
    this.occupied.get(wall.id).push({ id, ...spot });

    const final = { wall: place.wall, x: spot.cu / wall.w, y: spot.cv / wall.h, rot: place.rot ?? (note.rot || 0) };
    Object.assign(mesh.userData.note, final);
    mesh.userData.carrying = false;
    mesh.renderOrder = 0;
    mesh.material.depthTest = true;
    mesh.material.transparent = false;
    mesh.material.opacity = 1;
    this._placeMesh(mesh, wall, spot.cu, spot.cv, final.rot);
    return final;
  }

  // someone else re-hung their note (live, over presence): just relocate it.
  // unlike drop() this trusts the incoming spot verbatim — it's already been
  // resolved on the mover's machine — and reclaims occupancy for it.
  moveTo(id, place) {
    const mesh = this.byId.get(id);
    const wall = this.walls.find(w => w.id === place.wall);
    if (!mesh || !wall) return;
    for (const taken of this.occupied.values()) {
      const i = taken.findIndex(o => o.id === id);
      if (i >= 0) { taken.splice(i, 1); break; }
    }
    const [kw, kh] = KIND_SIZE[mesh.userData.note.kind] || KIND_SIZE.note;
    const hu = kw / 2 + PAD, hv = kh / 2 + PAD;
    const cu = place.x * wall.w, cv = place.y * wall.h;
    if (!this.occupied.has(wall.id)) this.occupied.set(wall.id, []);
    this.occupied.get(wall.id).push({ id, cu, cv, hu, hv });
    Object.assign(mesh.userData.note, { wall: place.wall, x: place.x, y: place.y, rot: place.rot ?? (mesh.userData.note.rot || 0) });
    this._placeMesh(mesh, wall, cu, cv, mesh.userData.note.rot || 0);
  }

  remove(id) {
    const mesh = this.byId.get(id);
    if (!mesh) return;
    this.group.remove(mesh);
    mesh.material.map?.dispose();
    mesh.material.dispose();
    mesh.geometry.dispose();
    this.byId.delete(id);
    for (const taken of this.occupied.values()) {
      const i = taken.findIndex(o => o.id === id);
      if (i >= 0) { taken.splice(i, 1); break; }
    }
  }

  // everything clickable: notes first (closer), then bare walls
  raycastTargets() {
    return [...this.group.children, ...this.walls.map(w => w.mesh)];
  }

  // convert a raycast hit on a wall mesh into stored (wall, u, v)
  // walls are DoubleSide, so the raycast happily hits the BACK of one — e.g.
  // the bedroom's west wall seen from the arcade behind it. each wall's normal
  // points into its own room, so you may only post from the front (room) side.
  // true if `pos` (a {x,y,z}) is on that side of the wall this hit landed on.
  postableFrom(hit, pos) {
    const wall = this.walls.find(w => w.mesh === hit.object);
    if (!wall || !pos) return false;
    const n = wall.normal, o = wall.origin;
    // controls.pos carries no y — and these walls are all vertical (n.y = 0), so
    // height is irrelevant. but an undefined pos.y makes (pos.y - o.y) * n.y NaN
    // (NaN * 0 is still NaN), which poisoned the whole dot product to false and
    // silently blocked posting on EVERY wall. default y to 0 so the side test
    // is the pure horizontal "which side of the wall am I on".
    const py = pos.y || 0;
    return (pos.x - o.x) * n.x + (py - o.y) * n.y + (pos.z - o.z) * n.z > 0;
  }

  placementFromHit(hit) {
    const wall = this.walls.find(w => w.mesh === hit.object);
    if (!wall) return null;
    const rel = hit.point.clone().sub(wall.origin);
    let u = rel.dot(wall.uDir) / wall.w;
    let v = rel.dot(wall.vDir) / wall.h;
    u = Math.min(0.96, Math.max(0.04, u));
    v = Math.min(BAND_HI - 0.02, Math.max(BAND_LO + 0.02, v));   // seed inside the usable band (spiral pulls it legal anyway)
    return { wall: wall.id, x: u, y: v, rot: (Math.random() - 0.5) * 0.16 };
  }
}
