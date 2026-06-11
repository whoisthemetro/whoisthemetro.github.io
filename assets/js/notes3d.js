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

const NOTE_W = 0.38, PHOTO_W = 0.46, LINK_W = 0.44;

// footprint on the wall per kind, in meters [w, h]
const KIND_SIZE = {
  note: [NOTE_W, NOTE_W],
  photo: [PHOTO_W, PHOTO_W * (300 / 256)],
  link: [LINK_W, LINK_W * (132 / 256)],
};
const PAD = 0.03;   // breathing room between notes

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
    const clampV = (cv) => Math.min(wall.h * 0.78 - hv, Math.max(wall.h * 0.13 + hv, cv));

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
    return { cu, cv, hu, hv };   // wall truly full — overlap beats losing the note
  }

  add(note) {
    if (this.byId.has(note.id)) return;
    const wall = this.walls.find(w => w.id === note.wall);
    if (!wall) return;

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
    // slight self-glow so what people leave is always readable in the gloom;
    // depthTest off + late renderOrder = a note can NEVER be hidden behind
    // a door, panel, or piece of furniture
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshLambertMaterial({
        map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.42,
        depthTest: false, depthWrite: false,
      }),
    );

    // world position from (wall, u, v), de-overlapped so every note owns
    // its own patch of wall, with a tiny stagger against z-fighting
    const spot = this._resolveSpot(wall, note);
    if (!this.occupied.has(wall.id)) this.occupied.set(wall.id, []);
    this.occupied.get(wall.id).push({ id: note.id, ...spot });

    const offset = 0.014 + (this.seq++ % 64) * 0.0008;
    const pos = wall.origin.clone()
      .addScaledVector(wall.uDir, spot.cu)
      .addScaledVector(wall.vDir, spot.cv)
      .addScaledVector(wall.normal, offset);
    mesh.position.copy(pos);
    mesh.quaternion.copy(wall.mesh.quaternion);
    mesh.rotateZ(note.rot || 0);
    mesh.userData.note = note;
    mesh.renderOrder = 50 + (this.seq % 64);   // drawn after the whole room
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
  placementFromHit(hit) {
    const wall = this.walls.find(w => w.mesh === hit.object);
    if (!wall) return null;
    const rel = hit.point.clone().sub(wall.origin);
    let u = rel.dot(wall.uDir) / wall.w;
    let v = rel.dot(wall.vDir) / wall.h;
    u = Math.min(0.96, Math.max(0.04, u));
    v = Math.min(0.76, Math.max(0.14, v));   // keep within arm's reach, below the neon
    return { wall: wall.id, x: u, y: v, rot: (Math.random() - 0.5) * 0.16 };
  }
}
