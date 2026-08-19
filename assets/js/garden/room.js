/* ============================================================
   THE GARDEN — a listening path

   Metro's sound design, planted. A gravel path runs east-west with a
   raised soil bed either side of it, and every track in the catalog
   grows out of one of those beds as a row of reeds whose heights ARE
   that track's waveform. You walk down it, you can SEE what a piece
   is before you hear it, and you click the one you want.

   Why a room and not a list: a jukebox is a scrollbar, and it gets
   worse the more music you make. A path gets LONGER. The beds size
   themselves off the catalog, so planting the 40th track doesn't need
   a UI decision — it needs a metre and a half more path.

   Two rules this room lives by, both learned the hard way elsewhere
   in this codebase (see CLAUDE.md):

   - the toon pass at the end of buildWorld() replaces every Lambert /
     Standard material and does NOT carry `vertexColors` across. The
     reeds are therefore MeshBasicMaterial with vertex colours: the
     pass leaves Basic alone, so the base→tip gradient survives, the
     material reference is safe to hold for animation, and a waveform
     that lights itself is right anyway. Soil, path and posts stay
     Lambert so they cel-shade with the rest of the world.
   - no directional or ambient light, ever. A directional light reaches
     every object in the scene no matter where it sits. The garden is
     lit by DOWNWARD spotlights only (a cone pointing at the floor
     can't reach another room) plus emissive floors on the soil.

   Reads its plants from assets/js/garden-catalog.js, which is written
   by tools/garden/encode.mjs. The audio lives on R2, not in here.
   ============================================================ */

import * as THREE from "three";

/* ---------------- little helpers ---------------- */
function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

// merge a pile of geometries (each already positioned) into ONE, keeping
// position/normal/color. Every material-group is its own draw call, so 64
// reeds have to arrive as a single buffer or a plant costs 64 calls.
function mergeGeos(geos) {
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
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
  out.computeBoundingSphere();
  return out;
}

// a stable hue per track, so no two neighbours are the same green and the
// catalog's order doesn't decide the colours
function hueOf(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h / 360;
}

/* ============================================================ */
export function buildGarden(opts = {}) {
  const { parent, offset = { x: 0, z: 0 }, tracks = [] } = opts;
  const root = new THREE.Group();
  root.position.set(offset.x || 0, offset.y || 0, offset.z || 0);
  parent.add(root);
  const add = (m) => { root.add(m); return m; };

  // reeds per plant scale with the row's length so planting density stays even
  // — a long piece gets more teeth, not wider-spaced ones
  const REED_DENSITY = 30;     // reeds per metre of row
  const SPACING = 4.0;         // metres between plants on the same side
  const PATH_W = 2.9;          // gravel width (in z)
  const BED_D = 4.4;           // each bed's depth (in z)
  const BED_Y = 0.34;          // how high the soil sits above the path
  const bedZ = PATH_W / 2 + BED_D / 2;          // bed centre line, ± in z
  const plantZ = PATH_W / 2 + 1.15;             // plants near the path edge, in reach

  // the path is as long as the catalog needs it to be, and never shorter than
  // something that reads as a place. Two rows, staggered half a spacing.
  const perSide = Math.max(1, Math.ceil(tracks.length / 2));
  const span = (perSide - 1) * SPACING;
  const HALF = Math.max(11, span / 2 + 6.5);    // path half-length, in x

  /* ---------------- the sky: dusk, and it stays dusk ----------------
     Not tied to astro.js on purpose. The bedroom and the boat run on
     real sun because they're real places at a real hour; the garden is
     a room you go to in order to listen, and blue hour is when that
     feels right. It is always ten minutes after sunset in here. */
  const skyTex = canvasTex(8, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0.00, "#080a18");     // zenith, nearly night
    grd.addColorStop(0.42, "#1b2140");
    grd.addColorStop(0.68, "#3d3560");
    grd.addColorStop(0.86, "#8a5a5c");     // the last of the sun in the haze
    grd.addColorStop(1.00, "#c98a63");
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
  const sky = add(new THREE.Mesh(
    new THREE.SphereGeometry(HALF + 34, 24, 16),
    // BackSide + fog:false, same rules as the LA rings — a dome is scenery,
    // not geometry, and the room's fog would eat it at 40 m.
    //
    // depthWrite MUST stay on. The bedroom and the arcade are scope "home" and
    // are therefore never culled by anything — they are always in the scene. A
    // dome that doesn't write depth doesn't occlude, so the house rendered
    // straight through the sky and sat on the garden's horizon 160 m away as a
    // black silhouette. Writing depth at the dome's radius hides everything
    // beyond it, and three.js draws the dome first anyway (its bounding sphere
    // is centred on the camera, so it sorts nearest).
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: true })
  ));
  sky.position.y = -2;

  // stars, thin — it's only just dark. One Points cloud, additive.
  {
    const N = 260, p = new Float32Array(N * 3), c = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      // upper hemisphere only, biased high so none sit in the sunset band
      const a = Math.random() * Math.PI * 2, y = 0.25 + Math.random() * 0.72;
      const r = Math.sqrt(1 - y * y) * (HALF + 30);
      p[i * 3] = Math.cos(a) * r; p[i * 3 + 1] = y * (HALF + 30) - 2; p[i * 3 + 2] = Math.sin(a) * r;
      const k = 0.35 + Math.random() * 0.65;
      c[i * 3] = k; c[i * 3 + 1] = k * 0.97; c[i * 3 + 2] = k * 0.9;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    add(new THREE.Points(g, new THREE.PointsMaterial({
      // sizeAttenuation OFF: a star is a fixed pinprick at any distance, and
      // world-sized points render as big white squares whenever one drifts
      // near the camera
      size: 2.2, sizeAttenuation: false, vertexColors: true,
      transparent: true, opacity: 0.8, fog: false, blending: THREE.AdditiveBlending, depthWrite: false,
    })));
  }

  /* ---------------- ground, path, beds ---------------- */
  // the ground reaches further than the sky dome's base (HALF+34): stop it
  // short of that and you get a hard edge with stars underneath it
  const GW = HALF + 44, GD = HALF + 44;
  // the ground beyond the beds: rough grass going to dark. It reaches further
  // than you can walk, so the path never ends at a visible edge.
  const grassTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#131c14"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const k = Math.random();
      g.fillStyle = k > 0.7 ? "#1e2b1c" : k > 0.35 ? "#0f1710" : "#232f1e";
      g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1 + Math.random() * 3);
    }
  }, [GW / 3, GD / 3]);
  const ground = add(new THREE.Mesh(
    new THREE.PlaneGeometry(GW * 2, GD * 2),
    // emissive floor: the corners of this room are further from a lamp than
    // anything could reach, and a material that lifts its own floor cannot
    // leak through a wall because it isn't a light. Lifted until the grass
    // reads as ground — at 0x0a1410 the whole surround was a black void with
    // a lit path floating in it.
    new THREE.MeshLambertMaterial({ map: grassTex, color: 0xffffff, emissive: 0x1a241c })
  ));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = false;

  const pathTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#3a352e"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) {                       // gravel
      const r = 1 + Math.random() * 3.4, k = Math.random();
      g.fillStyle = k > 0.72 ? "#544d43" : k > 0.4 ? "#2c2823" : "#6b6255";
      g.beginPath(); g.arc(Math.random() * w, Math.random() * h, r, 0, 6.3); g.fill();
    }
  }, [HALF * 0.8, 1.6]);
  const path = add(new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2, PATH_W),
    new THREE.MeshLambertMaterial({ map: pathTex, emissive: 0x241d15 })
  ));
  path.rotation.x = -Math.PI / 2;
  path.position.y = 0.015;

  // one texture, shared by every plant's two glow coats
  const glowTex = canvasTex(128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0.00, "rgba(255,255,255,1)");
    grd.addColorStop(0.28, "rgba(255,255,255,0.62)");
    grd.addColorStop(0.62, "rgba(255,255,255,0.16)");
    grd.addColorStop(1.00, "rgba(0,0,0,0)");
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });

  const soilTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#2a1d14"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2200; i++) {                       // clods
      const k = Math.random();
      g.fillStyle = k > 0.75 ? "#3b2a1c" : k > 0.4 ? "#1d130d" : "#472f1e";
      g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 4, 0, 6.3); g.fill();
    }
  }, [HALF * 0.5, 2]);
  const soilMat = new THREE.MeshLambertMaterial({ map: soilTex, emissive: 0x120c08 });
  const edgeMat = new THREE.MeshLambertMaterial({ color: 0x4a3a2a, emissive: 0x0e0a06 });

  for (const s of [-1, 1]) {
    const bed = add(new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, BED_Y, BED_D), soilMat));
    bed.position.set(0, BED_Y / 2, s * bedZ);
    // the edging: a timber board on each long side. Runs PAST the bed's ends
    // (the every-end-runs-past rule) so no two faces end up coplanar.
    for (const e of [-1, 1]) {
      const b = add(new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 0.3, BED_Y + 0.12, 0.14), edgeMat));
      b.position.set(0, (BED_Y + 0.12) / 2, s * bedZ + e * (BED_D / 2));
    }
  }

  /* ---------------- a plant ----------------
     One track = one row of reeds. Reed i's height is peak bucket i, so the
     silhouette is the track's actual envelope: a drone is a hedge, a sparse
     piece is a picket fence with gaps in it, a swell is a hill.

     The row is also the PLAYHEAD. Reeds behind the position are lit and warm,
     reeds ahead are dim — so how far into a piece you are is something you
     read off the plant from across the garden. That's done by rewriting a
     slice of the colour attribute when the head crosses a reed (64 times a
     track, i.e. never), not per frame. */
  function makePlant(track, i) {
    const side = (i % 2) ? 1 : -1;
    const rank = Math.floor(i / 2);
    // stagger the two rows by half a spacing so the path doesn't read as a ladder
    const x = -span / 2 + rank * SPACING + (side > 0 ? SPACING / 2 : 0);
    const z = side * plantZ;

    const hue = hueOf(track.id);
    const tip = new THREE.Color().setHSL(hue, 0.62, 0.66);
    const base = new THREE.Color().setHSL((hue + 0.06) % 1, 0.55, 0.14);

    // 256 buckets down to REEDS, taking the loudest in each — the plant keeps
    // the track's peaks, not its average
    /* HOW LONG the row is IS how long the track is. Six minutes should not look
       like thirty seconds — duration is real information and this is the only
       place a visitor can read it from twenty metres away. sqrt, not linear, or
       a 6:42 piece would be eight times the width of a 0:32 one and the bed
       would be one hedge and nine sprouts. */
    const LEN = Math.max(1.15, Math.min(3.0, 1.1 + 1.9 * Math.sqrt((track.dur || 60) / 400)));
    const REEDS = Math.max(32, Math.min(96, Math.round(LEN * REED_DENSITY)));

    const pk = track.peaks || [];
    const heights = [];
    for (let r = 0; r < REEDS; r++) {
      let mx = 0;
      const a = Math.floor(r * pk.length / REEDS), b = Math.floor((r + 1) * pk.length / REEDS);
      for (let j = a; j < Math.max(b, a + 1); j++) mx = Math.max(mx, pk[j] || 0);
      heights.push(0.22 + (mx / 100) * 1.24);       // 22 cm floor so silence still sprouts
    }
    const geos = [];
    const spans = [];                                // vertex range per reed, for the playhead
    let cursor = 0;
    for (let r = 0; r < REEDS; r++) {
      const h = heights[r];
      const g = new THREE.CylinderGeometry(0.005, 0.017, h, 4, 1).toNonIndexed();
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      const p = g.attributes.position.array;
      for (let v = 0; v < n; v++) {
        const t = (p[v * 3 + 1] + h / 2) / h;        // 0 at soil, 1 at the tip
        const c = base.clone().lerp(tip, t * t);     // squared, so the glow crowds the tip
        col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      // lean each reed a hair off true, alternating — a perfectly upright row
      // is a barcode, not a plant
      const lean = (r % 2 ? 1 : -1) * (0.02 + (r % 7) * 0.006);
      g.rotateZ(lean);
      g.translate(-LEN / 2 + (r / (REEDS - 1)) * LEN, h / 2, (r % 3 - 1) * 0.02);
      geos.push(g);
      spans.push([cursor, cursor + n]);
      cursor += n;
    }
    const geo = mergeGeos(geos);
    // MeshBasic: the toon pass skips it, so the gradient lives, the reference
    // is safe to hold, and a waveform that lights itself is what we wanted
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const blade = new THREE.Mesh(geo, mat);

    const plant = new THREE.Group();
    plant.position.set(x, BED_Y, z);
    plant.rotation.y = side > 0 ? Math.PI : 0;      // face the path from either bed
    plant.add(blade);
    add(plant);

    // the root: a low mound at the foot of the row, so the reeds come OUT of
    // something instead of ending at a plane
    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      soilMat
    );
    mound.scale.set(2.6, 0.34, 0.62);
    plant.add(mound);

    // the stake: title on a plank, angled up out of the soil toward the path.
    // MeshBasic so it reads at dusk without a light on it.
    const label = canvasTex(512, 128, (g, w, h) => {
      // dark wood with pale lettering, not a white card. A pale plaque is the
      // brightest thing in a dusk garden: up close it's a label, but from ten
      // metres down the path the type is too small to read and all you see is
      // a row of bright rectangles floating over the beds. Dark sinks into the
      // soil at distance and still reads when you're standing at it.
      g.fillStyle = "#241d15"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) {                       // grain
        g.fillStyle = Math.random() > 0.5 ? "#1c1610" : "#2e251b";
        g.fillRect(0, Math.random() * h, w, 1);
      }
      g.strokeStyle = "#3d3225"; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
      g.font = "700 46px ui-monospace, Menlo, monospace";
      g.textBaseline = "middle";
      g.fillStyle = "#cbbfa4";
      let t = (track.title || track.id).toUpperCase();
      while (g.measureText(t).width > w - 130 && t.length > 4) t = t.slice(0, -2);
      g.fillText(t, 18, h / 2);
      const m = Math.floor(track.dur / 60), s = Math.round(track.dur % 60);
      g.font = "600 34px ui-monospace, Menlo, monospace";
      g.fillStyle = "#8a7c62";
      g.textAlign = "right";
      g.fillText(`${m}:${String(s).padStart(2, "0")}`, w - 18, h / 2);
    });
    // +z is the path side for both beds (the far row is rotated to face it), so
    // the label sits in the soil in FRONT of the reeds, not through them. Single
    // sided: a DoubleSide label seen from the wrong bed is just a blank cream
    // rectangle floating in the dark, which is what it looked like.
    const stake = new THREE.Mesh(
      new THREE.PlaneGeometry(0.58, 0.145),
      new THREE.MeshBasicMaterial({ map: label, side: THREE.FrontSide })
    );
    stake.position.set(0, 0.17, 0.62);
    stake.rotation.x = -0.42;
    plant.add(stake);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.2, 0.035), edgeMat);
    post.position.set(0, 0.06, 0.60);
    plant.add(post);

    // the glow, two coats (the daylight-additive rule): a wide soft aura that
    // only shows once it's lit, and a tighter core that holds an edge. Both
    // start at zero — a plant that isn't playing doesn't glow at all.
    const glowMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      color: new THREE.Color().setHSL(hue, 0.8, 0.5),
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    // sized to the plant, not to the sky: the aura used to stand a metre above
    // the tallest reed and read as a pane of glass
    const aura = new THREE.Mesh(new THREE.PlaneGeometry(LEN + 1.3, 1.9), glowMat);
    aura.position.set(0, 0.62, 0.06);
    plant.add(aura);
    const coreMat = glowMat.clone();
    const core = new THREE.Mesh(new THREE.PlaneGeometry(LEN + 0.3, 1.0), coreMat);
    core.position.set(0, 0.42, 0.05);
    plant.add(core);

    // one flat invisible quad to click, instead of raycasting 64 reeds
    const hit = new THREE.Mesh(
      new THREE.PlaneGeometry(LEN + 0.5, 1.9),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.set(0, 0.8, 0.35);
    hit.userData.gardenTrack = track.id;
    plant.add(hit);

    // playhead: rewrite the colour of every reed behind the head, once per
    // reed crossed. `lit` reeds go warm and bright, the rest sit at base.
    const colAttr = geo.attributes.color;
    const cold = colAttr.array.slice();             // the as-built gradient
    const warm = new Float32Array(cold.length);
    const hot = new THREE.Color().setHSL(hue, 0.85, 0.78);
    for (let r = 0; r < REEDS; r++) {
      const [a, b] = spans[r];
      for (let v = a; v < b; v++) {
        // keep the base→tip shape but push it toward the hot colour
        const c = new THREE.Color(cold[v * 3], cold[v * 3 + 1], cold[v * 3 + 2]).lerp(hot, 0.55);
        warm[v * 3] = c.r; warm[v * 3 + 1] = c.g; warm[v * 3 + 2] = c.b;
      }
    }
    let headAt = -1;
    function setProgress(p) {
      const head = p == null ? -1 : Math.min(REEDS, Math.floor(p * REEDS));
      if (head === headAt) return;
      const lo = Math.min(headAt < 0 ? 0 : headAt, head < 0 ? 0 : head);
      const hi = Math.max(headAt, head, 0);
      for (let r = lo; r < Math.min(REEDS, hi + 1); r++) {
        const [a, b] = spans[r];
        const src = r < head ? warm : cold;
        colAttr.array.set(src.subarray(a * 3, b * 3), a * 3);
      }
      colAttr.needsUpdate = true;
      headAt = head;
    }

    return {
      id: track.id, track, group: plant, blade, mat, hit, glowMat, coreMat,
      x, z, side, setProgress,
      // world position, for the panner that puts the sound in the plant
      world: () => plant.getWorldPosition(new THREE.Vector3()).setY(0.9),
    };
  }

  const plants = tracks.map(makePlant);
  const plantById = new Map(plants.map((p) => [p.id, p]));

  /* ---------------- lamps ----------------
     Warm posts down the path. Every one aims STRAIGHT DOWN: a spot whose
     axis points at the floor has no direction inside its cone with any
     velocity toward another room, which is the strong version of keeping a
     fixture at home (the other being a distance leash you have to re-check
     every time either end moves). */
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2a2622, emissive: 0x0c0a08 });
  // the hood is lit by NOTHING: its own spot points down and away from it, and
  // no other light in the room reaches up there. Left on the post material it
  // read as a black wedge cut out of the sky whenever you stood near a lamp.
  // Emissive is the fix — a material that lifts its own floor, no light needed.
  const hoodMat = new THREE.MeshLambertMaterial({ color: 0x322b24, emissive: 0x241a12 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false });
  const lampStep = 6.0;
  // the first lamp starts well in from the arrival step: at -HALF+3 you spawned
  // with a hood 2 m from your face, filling the corner of the frame
  for (let x = -HALF + 5.2, k = 0; x <= HALF - 3; x += lampStep, k++) {
    const s = (k % 2) ? 1 : -1;
    const lz = s * (PATH_W / 2 + 0.28);
    const post = add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 2.3, 8), lampMat));
    post.position.set(x, 1.15, lz);
    const hood = add(new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.2, 10), hoodMat));
    hood.position.set(x, 2.34, lz);
    const bulb = add(new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), bulbMat));
    bulb.position.set(x, 2.2, lz);

    const sp = new THREE.SpotLight(0xffc98a, 5.2, 7.4, 0.82, 0.55, 1.4);
    sp.position.set(x, 2.18, lz);
    sp.target.position.set(x, 0, lz);
    sp.userData.cullRoom = "garden";
    add(sp); add(sp.target);
  }

  // the fill: one cool spot hung high over the middle of the path, pointing
  // down the whole length of it. Wide cone, long throw, low intensity — this
  // is the "sky" without being a light that can reach the bedroom.
  const moon = new THREE.SpotLight(0x9fb4d8, 2.6, HALF * 2.6, 1.15, 0.9, 1.0);
  moon.position.set(0, 22, 0);
  moon.target.position.set(0, 0, 0);
  moon.userData.cullRoom = "garden";
  add(moon); add(moon.target);

  /* ---------------- the gate: how you leave ----------------
     At the east end, because you arrive at the west end and the walk is the
     point. An arch you click. */
  const gateX = HALF - 1.6;
  const gateMat = new THREE.MeshLambertMaterial({ color: 0x3a3028, emissive: 0x0d0a07 });
  for (const s of [-1, 1]) {
    const leg = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.5, 0.16), gateMat));
    leg.position.set(gateX, 1.25, s * (PATH_W / 2 - 0.1));
  }
  const lintel = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, PATH_W - 0.04), gateMat));
  lintel.position.set(gateX, 2.42, 0);
  const gateSign = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = "#101a14"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#7fd6a4"; g.lineWidth = 5; g.strokeRect(8, 8, w - 16, h - 16);
    g.font = "700 52px ui-monospace, Menlo, monospace";
    g.fillStyle = "#9ff0c0"; g.textAlign = "center"; g.textBaseline = "middle";
    g.shadowColor = "#7fd6a4"; g.shadowBlur = 22;
    g.fillText("← WAY OUT", w / 2, h / 2);
  });
  const gateHit = add(new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.375),
    new THREE.MeshBasicMaterial({ map: gateSign, side: THREE.DoubleSide, fog: false })
  ));
  gateHit.position.set(gateX - 0.1, 1.95, 0);
  gateHit.rotation.y = -Math.PI / 2;
  gateHit.userData.gardenExit = true;

  /* ---------------- fireflies ----------------
     A few, drifting. Dead slots park AT the emitter with a black vertex
     colour, never at -999: bucketRoomGeometry sorts by bounding-box centre,
     and one stray vertex out at the origin would file the whole cloud under
     another room and make it vanish in this one. On additive, black is gone. */
  const FLY = 34;
  const flyPos = new Float32Array(FLY * 3), flyCol = new Float32Array(FLY * 3);
  const flyState = [];
  for (let i = 0; i < FLY; i++) {
    flyState.push({
      x: (Math.random() * 2 - 1) * HALF, y: 0.4 + Math.random() * 1.6,
      // over the beds, on one side or the other — never down the middle of the
      // path, where they'd be flying through your head
      z: (Math.random() > 0.5 ? 1 : -1) * (PATH_W / 2 + 0.7 + Math.random() * (BED_D - 1.4)),
      p: Math.random() * 6.28, s: 0.4 + Math.random() * 0.7,
    });
  }
  const flyGeo = new THREE.BufferGeometry();
  flyGeo.setAttribute("position", new THREE.BufferAttribute(flyPos, 3));
  flyGeo.setAttribute("color", new THREE.BufferAttribute(flyCol, 3));
  const flies = add(new THREE.Points(flyGeo, new THREE.PointsMaterial({
    size: 3.4, sizeAttenuation: false, vertexColors: true, transparent: true,
    opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
  })));

  /* ---------------- per-frame ----------------
     `state` is what the player hands us each tick: which id is playing and
     how far through it is. Everything here is per-plant uniform writes, so
     the cost is the plant count, not the reed count. */
  let t = 0;
  function tick(dt, state = {}) {
    t += dt;
    const now = state.id || null;
    const level = state.level == null ? 0 : state.level;

    for (const p of plants) {
      const on = p.id === now;
      // idle plants sit dim; the playing one rides the track's own level, so
      // the plant breathes with the music instead of on a timer
      const want = on ? 1.0 + level * 0.5 : 0.52;
      const c = p.mat.color;
      c.setScalar(c.r + (want - c.r) * Math.min(1, dt * 6));
      const g = on ? 0.10 + level * 0.30 : 0;
      p.glowMat.opacity += (g - p.glowMat.opacity) * Math.min(1, dt * 5);
      p.coreMat.opacity += (g * 1.5 - p.coreMat.opacity) * Math.min(1, dt * 5);
      // a slow sway, a little faster on the one that's playing
      p.blade.rotation.z = Math.sin(t * (on ? 1.1 : 0.5) + p.x) * (on ? 0.028 : 0.014);
      p.setProgress(on ? state.progress : null);
    }

    for (let i = 0; i < FLY; i++) {
      const f = flyState[i];
      f.p += dt * f.s;
      flyPos[i * 3] = f.x + Math.sin(f.p) * 1.3;
      flyPos[i * 3 + 1] = f.y + Math.sin(f.p * 1.7) * 0.28;
      flyPos[i * 3 + 2] = f.z + Math.cos(f.p * 0.8) * 1.1;
      const k = 0.35 + 0.65 * Math.max(0, Math.sin(f.p * 2.3));
      flyCol[i * 3] = k * 0.95; flyCol[i * 3 + 1] = k * 0.85; flyCol[i * 3 + 2] = k * 0.35;
    }
    flyGeo.attributes.position.needsUpdate = true;
    flyGeo.attributes.color.needsUpdate = true;
  }

  /* ---------------- where feet may go ----------------
     The gravel only. You can't wade into the beds — and the plants sit just
     off the path's edge, close enough to click from it. Returned in WORLD
     coordinates because isWalkable() works in world space.
     One rect, generous at both ends so the gate and the arrival step aren't
     dead strips. */
  const walkRects = [{
    x0: offset.x - HALF + 0.6, x1: offset.x + HALF - 0.6,
    z0: offset.z - PATH_W / 2 + 0.25, z1: offset.z + PATH_W / 2 - 0.25,
  }];

  return {
    root, info: { x: offset.x, z: offset.z }, half: HALF,
    plants, plantById,
    hits: [...plants.map((p) => p.hit), gateHit],
    exitHit: gateHit,
    walkRects,
    // you arrive at the west end, facing down the path — the walk IS the room
    spawn: { x: offset.x - HALF + 1.8, z: offset.z, yaw: -Math.PI / 2 },
    tick,
  };
}
