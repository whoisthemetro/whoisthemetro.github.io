/* graffiti.js — what people write on the bathroom walls.

   The walls of this room are procedural and SHARED: every tiled surface uses
   the same `tiled()` material with a repeating map, so there's nowhere to
   paint into. Each tag surface therefore gets its own transparent OVERLAY —
   a plane the size of that face, a hair proud of it, carrying its own canvas.
   Overlays are built LAZILY, on the first stroke that lands: a bathroom with
   nothing written in it costs nothing at all, and most of these faces will
   never be touched.

   Strokes are stored as (surface, colour, width, points) with u/v quantized to
   a byte, which is what makes a whole wall of them small enough to live in a
   room flag next to the blinds and the lava lamp.

   Two rules the geometry forces:
    - u/v come from the LOCAL hit point, not `hit.uv`. A BoxGeometry gives each
      face its own 0..1 and the orientation varies per face, so trusting it
      would flip and rotate tags depending on which side of a stall door you
      wrote on. Local coordinates are the same every time.
    - the overlay sits 6 mm proud AND carries polygonOffset. 6 mm alone
      z-fights; the 3 cm this codebase uses for notes would visibly float a
      layer of paint off a door at a grazing angle. */

const MAX_STROKES = 400;        // the wall fills up; oldest scrub off first
const PX_PER_M = 190;           // canvas resolution — marker scrawl, not print
const MAX_PX = 512;

export const TAG_COLORS = [
  "#ff2da0", "#22d4ff", "#3bff7a", "#ffe93c", "#9d4dff", "#ffffff", "#12131a",
];

export function createGraffiti(THREE, scene) {
  // meshId -> { mesh, axis, w, h }   (axis = the THIN one; the other two are the face)
  const drawable = new Map();
  // surfaceId -> { canvas, ctx, tex, mesh }
  const layers = new Map();
  const strokes = [];
  let live = null;                       // the stroke being drawn right now
  let dirty = false;
  let me = "";                           // whose hand is on the pen

  /* Every stroke carries a short id and a short author. Undo and delete both
     need to name a stroke over the wire — "the last one" is meaningless to a
     peer whose list is in a different order — and delete needs to know which
     ones are YOURS, because wiping other people's writing is a different and
     much bigger button. Strokes saved before this shipped have neither, which
     just means nobody owns them and nobody can delete them. */
  const sid = () => Math.random().toString(36).slice(2, 8);

  /* register a face. `axis` is the thin axis of a panel ("x" or "z"); pass
     null for a PlaneGeometry, whose face is always its own local xy.
     `name` has to be STABLE across page loads — it's what a saved stroke
     points at. It cannot be the mesh uuid: three.js mints a fresh one every
     build, so yesterday's writing would load into a surface that no longer
     exists and silently paint nothing. */
  function addSurface(mesh, axis = null, name = null) {
    const p = mesh.geometry.parameters || {};
    let w, h;
    if (!axis) { w = p.width; h = p.height; }
    else if (axis === "x") { w = p.depth; h = p.height; }
    else { w = p.width; h = p.height; }
    if (!w || !h) return;
    drawable.set(mesh.uuid, { mesh, axis, w, h, name: name || mesh.uuid });
    mesh.userData.tagSurface = true;
  }

  // which face of a registered mesh did this hit land on? "" = not a face we paint
  function faceOf(hit) {
    const d = drawable.get(hit.object.uuid);
    if (!d || !hit.face) return null;
    const n = hit.face.normal;
    const ax = d.axis || "z";
    const comp = ax === "x" ? n.x : n.z;
    // only the two big faces; the thin edges of a panel aren't a canvas
    if (Math.abs(comp) < 0.9) return null;
    return { d, sign: comp > 0 ? 1 : -1, id: `${d.name}:${comp > 0 ? "p" : "n"}` };
  }

  /* u,v in 0..1 across that face, from the local hit point. v runs DOWN so it
     matches canvas coordinates without a flip at every call site. */
  const _l = new THREE.Vector3();
  function uvOf(hit, f) {
    _l.copy(hit.point);
    hit.object.worldToLocal(_l);
    const across = f.d.axis === "x" ? _l.z * f.sign : _l.x * f.sign;
    return {
      u: Math.min(1, Math.max(0, across / f.d.w + 0.5)),
      v: Math.min(1, Math.max(0, 0.5 - _l.y / f.d.h)),
    };
  }

  // build the overlay for a face the first time anyone writes on it
  function layerFor(id) {
    if (layers.has(id)) return layers.get(id);
    const cut = id.lastIndexOf(":");
    const name = id.slice(0, cut), side = id.slice(cut + 1);
    let d = null;
    for (const v of drawable.values()) if (v.name === name) { d = v; break; }
    if (!d) return null;                 // a stroke from a surface that's gone
    const sign = side === "p" ? 1 : -1;
    const cw = Math.min(MAX_PX, Math.max(64, Math.round(d.w * PX_PER_M)));
    const ch = Math.min(MAX_PX, Math.max(64, Math.round(d.h * PX_PER_M)));
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d");
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(d.w, d.h),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
    // sit it on that face, 6 mm out, looking the way the face looks. A plane
    // has no thickness, so its overlay is just 6 mm off it; a panel's clears
    // its own half-thickness first.
    const pr = d.mesh.geometry.parameters || {};
    const half = !d.axis ? 0 : (d.axis === "x" ? (pr.width || 0) : (pr.depth || 0)) / 2;
    if (d.axis === "x") {
      mesh.position.set(sign * (half + 0.006), 0, 0);
      mesh.rotation.y = sign * Math.PI / 2;
    } else {
      mesh.position.set(0, 0, sign * (half + 0.006));
      if (sign < 0) mesh.rotation.y = Math.PI;
    }
    mesh.layers.mask = d.mesh.layers.mask;   // so tags show up in the mirrors too
    d.mesh.add(mesh);                    // ride the panel — doors swing
    const L = { canvas, ctx, tex, mesh };
    layers.set(id, L);
    return L;
  }

  function paint(s) {
    const L = layerFor(s.s);
    if (!L || !s.p || s.p.length < 2) return;
    const { ctx, canvas } = L;
    ctx.strokeStyle = TAG_COLORS[s.c] || TAG_COLORS[0];
    ctx.lineWidth = Math.max(1, s.w * canvas.width / 200);
    ctx.beginPath();
    for (let i = 0; i < s.p.length; i += 2) {
      const x = (s.p[i] / 255) * canvas.width, y = (s.p[i + 1] / 255) * canvas.height;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    if (s.p.length === 2) ctx.lineTo((s.p[0] / 255) * canvas.width + 0.6, (s.p[1] / 255) * canvas.height);
    ctx.stroke();
    L.tex.needsUpdate = true;
  }

  function repaintAll() {
    for (const L of layers.values()) { L.ctx.clearRect(0, 0, L.canvas.width, L.canvas.height); L.tex.needsUpdate = true; }
    for (const s of strokes) paint(s);
  }

  const Q = (n) => Math.max(0, Math.min(255, Math.round(n * 255)));

  return {
    addSurface,
    // the raycaster needs an explicit target list, and these are walls — they
    // aren't in `blockers` and nothing else would ever cast at them
    meshes() { return [...drawable.values()].map((d) => d.mesh); },
    // is the thing under the crosshair something you can write on?
    surfaceAt(hit) { return hit && faceOf(hit) ? true : false; },

    setAuthor(uid) { me = String(uid || "").slice(0, 8); },
    begin(hit, colorIdx, width) {
      const f = faceOf(hit); if (!f) return false;
      const { u, v } = uvOf(hit, f);
      live = { i: sid(), u: me, s: f.id, c: colorIdx, w: width, p: [Q(u), Q(v)] };
      return true;
    },
    // returns true if the point was far enough from the last to be worth keeping
    extend(hit) {
      if (!live) return false;
      const f = faceOf(hit); if (!f || f.id !== live.s) return false;
      const { u, v } = uvOf(hit, f);
      const qu = Q(u), qv = Q(v);
      const n = live.p.length;
      if (Math.abs(qu - live.p[n - 2]) + Math.abs(qv - live.p[n - 1]) < 2) return false;
      live.p.push(qu, qv);
      paint({ ...live, p: live.p.slice(-4) });   // draw just the new segment
      return true;
    },
    end() {
      const s = live; live = null;
      if (!s || s.p.length < 2) return null;
      strokes.push(s);
      if (strokes.length > MAX_STROKES) { strokes.splice(0, strokes.length - MAX_STROKES); repaintAll(); }
      dirty = true;
      return s;
    },
    drawing() { return !!live; },

    // somebody else's stroke, off the wire
    add(s) {
      if (!s || !s.s) return;
      strokes.push(s); paint(s);
      if (strokes.length > MAX_STROKES) { strokes.splice(0, strokes.length - MAX_STROKES); repaintAll(); }
    },
    /* which of MY strokes is under this point? Undo is strictly last-first,
       which is no help when the tag you regret is an old one and you'd rather
       not lose everything you've drawn since. Distance from the point to each
       segment of the polyline, nearest wins, latest breaks ties — so when
       strokes overlap you get the one drawn on top, which is the one you can
       see. Only ever mine. */
    pickMine(hit, tol = 0.028) {
      const f = faceOf(hit); if (!f) return null;
      const { u, v } = uvOf(hit, f);
      const px = u * 255, py = v * 255, lim = tol * 255;
      let best = null, bestD = Infinity;
      for (let k = 0; k < strokes.length; k++) {
        const st = strokes[k];
        if (st.s !== f.id || !st.u || st.u !== me) continue;
        for (let i = 0; i + 3 < st.p.length; i += 2) {
          const ax = st.p[i], ay = st.p[i + 1], bx = st.p[i + 2], by = st.p[i + 3];
          const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
          const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
          const qx = ax + t * dx, qy = ay + t * dy;
          const d = Math.hypot(px - qx, py - qy);
          if (d <= lim && d <= bestD) { bestD = d; best = st; }   // <=, so later wins ties
        }
        // a single-point dab has no segment to measure against
        if (st.p.length === 2) {
          const d = Math.hypot(px - st.p[0], py - st.p[1]);
          if (d <= lim && d <= bestD) { bestD = d; best = st; }
        }
      }
      return best ? best.i || null : null;
    },
    // take one named stroke of mine off the wall
    removeOne(id) {
      const k = strokes.findIndex((x) => x.i === id && x.u && x.u === me);
      if (k < 0) return false;
      strokes.splice(k, 1); repaintAll(); dirty = true;
      return true;
    },
    // how many on this wall are mine — the delete button needs to know
    mineCount() { return strokes.filter((x) => x.u && x.u === me).length; },
    // step back my most recent one; returns its id so it can go out on the wire
    undoMine() {
      for (let i = strokes.length - 1; i >= 0; i--) {
        if (strokes[i].u && strokes[i].u === me) {
          const id = strokes[i].i;
          strokes.splice(i, 1); repaintAll(); dirty = true;
          return id || null;
        }
      }
      return null;
    },
    // everything I've written in here, gone. Other people's stays.
    removeMine() {
      const ids = strokes.filter((x) => x.u && x.u === me).map((x) => x.i);
      if (!ids.length) return [];
      for (let i = strokes.length - 1; i >= 0; i--)
        if (strokes[i].u && strokes[i].u === me) strokes.splice(i, 1);
      repaintAll(); dirty = true;
      return ids;
    },
    // somebody else took theirs back
    remove(ids) {
      if (!Array.isArray(ids) || !ids.length) return;
      const kill = new Set(ids);
      let hit = false;
      for (let i = strokes.length - 1; i >= 0; i--)
        if (strokes[i].i && kill.has(strokes[i].i)) { strokes.splice(i, 1); hit = true; }
      if (hit) repaintAll();
    },
    load(list) {
      strokes.length = 0;
      if (Array.isArray(list)) for (const s of list) strokes.push(s);
      repaintAll();
      dirty = false;
    },
    all() { return strokes.slice(); },
    count() { return strokes.length; },
    isDirty() { return dirty; },
    clean() { dirty = false; },
    clear() { strokes.length = 0; repaintAll(); dirty = true; },
  };
}
