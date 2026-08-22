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

/* How big a thing on the wall is, in metres.

   These were 0.30 / 0.38 / 0.36 and the three bedroom walls FILLED UP —
   measured 2026-08-22 against the live database: 0% of back, west or east
   would take another note, and every attempt to post had been dying on the
   "that wall's packed" check since roughly the start of August. Nobody saw
   an error, because the check happens in the browser and never reaches the
   database; a visitor just wrote a note and watched it not appear.

   The wall is not as big as it looks. Thirteen acoustic slabs push no-post
   rects onto it, and between them they leave only 15-23% of each wall
   postable before a single note goes up. A note also needs its WHOLE
   footprint clear, so shrinking it wins back area faster than linearly —
   13% off each side is what turns "no room at all" into room for about
   sixty more. Measured, not guessed. */
const NOTE_W = 0.26, PHOTO_W = 0.33, LINK_W = 0.32;

// footprint on the wall per kind, in meters [w, h]
const KIND_SIZE = {
  note: [NOTE_W, NOTE_W],
  photo: [PHOTO_W, PHOTO_W * (300 / 256)],
  link: [LINK_W, LINK_W * (132 / 256)],
};
/* ---------- the wall has a HISTORY, not just a surface ----------

   A wall is a fixed amount of room and the room fills up; on 2026-08-22 all
   three bedroom walls were full and posting had silently stopped. Making the
   notes smaller bought a couple of months and would have bought the same
   problem back in November.

   So the bedroom wall shows ONE MONTH at a time. New notes land on this
   month, which starts empty every time the calendar turns over, and the
   months behind it are still there to walk back through. "Full" stops being
   a state the wall can reach, and nothing is ever deleted — which matters,
   because the room's own promise is "it's on the wall. it stays."

   Only the bedroom walls do this. THE DESI's three walls hold fourteen notes
   between them, most of them hers, and hiding those behind a month you have
   to go looking for would be the wrong trade entirely. They show everything,
   always. */
const MONTH_WALLS = new Set(["back", "west", "east"]);

// which month a note belongs to, in LA — where the room is. a note posted at
// 02:00 UTC on the 1st went up the evening BEFORE in Los Angeles, and it
// belongs to the month the person was living in when they wrote it.
export function monthKeyOf(iso, now) {
  const d = iso ? new Date(iso) : (now || new Date());
  const la = new Date(d.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  return `${la.getFullYear()}-${String(la.getMonth() + 1).padStart(2, "0")}`;
}
export function currentMonthKey(now) { return monthKeyOf(null, now); }
const MONTH_NAMES = ["january", "february", "march", "april", "may", "june",
                     "july", "august", "september", "october", "november", "december"];
export function monthLabel(key) {
  const [y, m] = String(key).split("-").map(Number);
  return `${MONTH_NAMES[(m || 1) - 1]} ${y}`;
}

const PAD = 0.02;   // breathing room between notes
// usable vertical strip as a fraction of wall height — notes live between
// these. wider band + smaller notes = the wall holds a lot more before it's
// genuinely "packed" (it used to cap at the middle 13%–78% of the wall).
// the top is 0.85 because the month plate hangs above it: notes stop at
// 2.295 m on a 2.7 m wall and the plate's bottom edge is at 2.346. it went
// 0.86 -> 0.92 for one commit to buy capacity, which the monthly turnover
// made unnecessary — a month's worth of notes was never the problem.
const BAND_LO = 0.08, BAND_HI = 0.85;

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
    this._fullCache = new Map(); // "wall:kind" -> is it out of room? (see isFull)
    this.all = new Map();        // id -> note, EVERY month, whether hung or not
    this._monthsCache = null;    // months() is asked far more often than it changes
    this.month = currentMonthKey();   // which one the bedroom walls are showing
  }

  /* ---------- months ---------- */

  isMonthWall(wallId) { return MONTH_WALLS.has(wallId); }
  // does this note belong on the wall as it's currently set?
  showing(note) {
    return !MONTH_WALLS.has(note.wall) || monthKeyOf(note.created_at) === this.month;
  }
  /* Every month from the first note to this one, oldest first — INCLUDING
     the quiet ones. A list of only the months that have something in it
     would be shorter, but the rail on the plate is a timeline: the gaps are
     part of what it's telling you, and a room that went quiet for a summer
     should look like it did. This month is always the last entry, so there
     is always somewhere to write. */
  months() {
    // memoized — the aim tip and the plate's hit test both ask, several
    // times a second, and the honest answer walks every note in the archive
    if (this._monthsCache) return this._monthsCache;
    const seen = new Map();
    for (const n of this.all.values()) {
      if (!MONTH_WALLS.has(n.wall)) continue;
      const k = monthKeyOf(n.created_at);
      seen.set(k, (seen.get(k) || 0) + 1);
    }
    const now = currentMonthKey();
    if (!seen.has(now)) seen.set(now, 0);
    const keys = [...seen.keys()].sort();
    const out = [];
    let [y, m] = keys[0].split("-").map(Number);
    const [ey, em] = now.split("-").map(Number);
    // walk the calendar rather than the notes, so an empty month still gets
    // a tick. guarded at 600 so a clock skewed into the future can't hang us.
    for (let guard = 0; guard < 600; guard++) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      out.push({ key, count: seen.get(key) || 0 });
      if (y === ey && m === em) break;
      if (++m > 12) { m = 1; y++; }
    }
    this._monthsCache = out;
    return this._monthsCache;
  }
  _forgetMonths() { this._monthsCache = null; }

  /* Hang a different month. The meshes for the month you were reading are
     thrown away rather than hidden: every note owns a canvas and a texture,
     and a room that has been going for years would otherwise carry every one
     of them in memory to show you twenty. Boat notes are untouched. */
  showMonth(key) {
    if (key === this.month) return;
    this.month = key;
    for (const [id, mesh] of [...this.byId]) {
      if (!MONTH_WALLS.has(mesh.userData.note.wall)) continue;
      this.remove(id);
    }
    this._hangAll();
  }

  // (re)hang everything that belongs on the wall right now, oldest first —
  // the de-overlap spiral is order-dependent, so this is what makes every
  // visitor see the same layout
  _hangAll() {
    const want = [...this.all.values()].filter(n => this.showing(n) && !this.byId.has(n.id));
    want.sort((a, b) =>
      String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)));
    for (const n of want) this._hang(n);
  }

  has(id) { return this.byId.has(id); }

  setAll(notes) {
    this.all.clear();
    this._forgetMonths();
    for (const n of notes) this.all.set(n.id, n);
    /* Open on the newest month that actually HAS anything, not blindly on
       this one. Otherwise the first visitor on the 2nd of the month walks in
       to a bare wall, which is a worse thing to show someone than last
       month's — and the whole reason this exists is that the wall made a bad
       first impression. Writing still always goes to the current month; the
       dial makes it obvious which one you're standing in front of. */
    const withNotes = this.months().filter(m => m.count > 0);
    this.month = withNotes.length ? withNotes[withNotes.length - 1].key : currentMonthKey();
    this._hangAll();
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

  /* A note arrives — yours, or a peer's over realtime. It always joins the
     archive; it only goes ON the wall if the wall is showing its month. */
  add(note) {
    this.all.set(note.id, note);
    this._forgetMonths();
    if (!this.showing(note)) return;
    return this._hang(note);
  }

  _hang(note) {
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
    this._forgetFull();

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
      if (i >= 0) { taken.splice(i, 1); this._forgetFull(); break; }
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

  /* Is this wall out of room for the SMALLEST thing you can post?

     Worth its own method because it answers a different question from
     canPlace: not "can this go here" but "is it worth opening the composer
     at all". Before this existed the room would happily invite you to write
     something onto a full wall, let you type it, and only then say no — and
     since the check never reaches the database, the note was gone and there
     was no trace of the attempt anywhere. That's how the wall being full
     since early August went unnoticed.

     Cached per wall, because the honest answer runs _resolveSpot's whole
     fallback sweep — a few thousand cells against every note already up —
     and the aim tip asks six times a second. Anything that changes what's
     on a wall drops the cache. */
  isFull(wallId, kind = "note") {
    const key = wallId + ":" + kind;
    if (this._fullCache.has(key)) return this._fullCache.get(key);
    // seed from the middle: _resolveSpot sweeps the whole wall before it
    // gives up, so where we start it doesn't change the answer
    const full = !this.canPlace(wallId, kind, 0.5, 0.5);
    this._fullCache.set(key, full);
    return full;
  }
  _forgetFull() { this._fullCache.clear(); }

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
    this._forgetFull();

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
      if (i >= 0) { taken.splice(i, 1); this._forgetFull(); break; }
    }
    const [kw, kh] = KIND_SIZE[mesh.userData.note.kind] || KIND_SIZE.note;
    const hu = kw / 2 + PAD, hv = kh / 2 + PAD;
    const cu = place.x * wall.w, cv = place.y * wall.h;
    if (!this.occupied.has(wall.id)) this.occupied.set(wall.id, []);
    this.occupied.get(wall.id).push({ id, cu, cv, hu, hv });
    this._forgetFull();
    Object.assign(mesh.userData.note, { wall: place.wall, x: place.x, y: place.y, rot: place.rot ?? (mesh.userData.note.rot || 0) });
    this._placeMesh(mesh, wall, cu, cv, mesh.userData.note.rot || 0);
  }

  /* Take a note OFF the wall. This is un-hanging, not deleting — switching
     months calls it on everything currently up, and the archive keeps them.
     Actual deletion is forget(), below. Getting these two the same way round
     would mean walking back a month emptied it. */
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
      if (i >= 0) { taken.splice(i, 1); this._forgetFull(); break; }
    }
  }

  // gone for good — an admin delete, or a peer's removal over realtime
  forget(id) {
    this.remove(id);
    this.all.delete(id);
    this._forgetMonths();
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
  // which wall a raycast hit landed on, by id (null if it wasn't a wall)
  wallIdOf(mesh) {
    const w = this.walls.find(x => x.mesh === mesh);
    return w ? w.id : null;
  }

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
