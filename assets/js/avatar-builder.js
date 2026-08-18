/* ============================================================
   THE METRO — avatar builder
   Turns an outfit spec (plain data) into a dressed figure built from
   primitives + a glowing 8-bit face. Inclusive + curated: any build,
   a range of hairstyles, tops, bottoms, beards, and colors — "within
   reason". The mirror builds the owner from their saved spec; the
   ghosts will build each peer from the spec they broadcast.

   buildAvatarFigure(spec) -> { group, setVoice(level), dispose }
   The group's feet sit at y=0; the glowing face reacts to voice.

   The figure is deliberately low-poly — everything in this world is
   primitives, and that's the look. What makes one read as a person
   and not a chess pawn is SILHOUETTE: arms, shoes, a waist, and hair
   that has an edge. See buildHair() for why sphere shells alone fail.
   ============================================================ */

import * as THREE from "three";
import { makeFace } from "./face.js";

/* the option lists the picker offers (kept modest on purpose).
   ONE fit — a tee and trousers. The jacket and the dress were retired on
   2026-08-15: at this polygon count a "jacket" is a torso with two dark
   stripes on it, and reading as a jacket was never going to happen. What you
   colour and what you put on your feet is where the character actually is. */
export const OPTIONS = {
  build: ["slim", "average", "broad"],
  hair: ["none", "buzz", "short", "mohawk", "long", "locs", "bun", "afro"],
  shoe: ["sneaker", "hitop", "chunky", "platform", "boot"],
  beard: ["none", "stubble", "full", "long"],
  swatches: ["#191920", "#0d0d11", "#3a2c1c", "#7a2a34", "#274a7a", "#2f6b4a",
             "#caa23c", "#b8b3ad", "#e9e4d8", "#8a4a6a", "#4a2f6a", "#c8562a",
             "#1f5f6b", "#d8455a"],
  hairColors: ["#1a140e", "#2a2018", "#5a4326", "#caa23c", "#9a9088", "#d8d8e0",
               "#3a6a8a", "#3ad8c8", "#8a4a6a", "#e05a8a"],
  shoeColors: ["#e9e4d8", "#14141a", "#b8352f", "#274a7a", "#2f6b4a", "#caa23c",
               "#e05a8a", "#3ad8c8", "#7a4a2a", "#8a4ad8"],
  skinTones: ["#f4d6bd", "#e8bd98", "#d8a878", "#c08a55", "#a06b3c", "#7a4f2b", "#583618", "#3a2414"],
  faceColors: ["#9fe6ff", "#7dff9a", "#ff7ad0", "#ffd23c", "#ff5a4a", "#b18bff", "#ffffff"],
};

export const DEFAULT_SPEC = {
  build: "average", skin: "#d8a878", hair: "short", hairColor: "#2a2018",
  topColor: "#191920", bottomColor: "#0d0d11",
  shoe: "sneaker", shoeColor: "#e9e4d8",
  beard: "none", faceColor: "#9fe6ff", logo: "METRO",
};

const HEAD_Y = 1.44;      // head centre — every hair/beard number hangs off this
const HEAD_R = 0.15;
// the torso's two ends. TORSO_TOP is where the capsule's top cap lands for
// every build — the neck starts there and the arms hang just under it.
const TORSO_TOP = 1.26, HIP_Y = 0.6;
const SHOULDER_Y = 1.19;
// the 8-bit face's eyes sit at y 1.470–1.495 (face.js draws them at rows 12–16
// of a 32px canvas on a 0.2 plane centred at 1.47). NOTHING opaque goes in
// front of the head above that line, or the hair covers someone's eyes.
const BROW_Y = 1.50;

function logoTex(text) {
  const c = document.createElement("canvas"); c.width = 160; c.height = 44;
  const g = c.getContext("2d");
  g.fillStyle = "#e9e9ef"; g.font = "800 30px Arial, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText((text || "").slice(0, 8).toUpperCase(), 80, 24);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function softGlow() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function buildAvatarFigure(spec = {}) {
  const s = { ...DEFAULT_SPEC, ...spec };
  const group = new THREE.Group();
  const disposables = [];
  const track = (m) => { disposables.push(m); return m; };
  // one material per colour: a figure is ~20 meshes sharing four or five
  // colours, and every peer in the room builds one of these
  const mats = new Map();
  /* Every body part is Lambert, and in this world ALL room light comes from
     the window. Stand where the window doesn't reach and a Lambert body
     renders pure black — which is how a peer ends up as a silhouette with
     nothing but floating eyes, because the face and the logo are Basic and
     light themselves. A person is the one thing in here that must be legible
     from anywhere.

     So each colour carries an EMISSIVE floor of itself. It costs no light
     budget (it isn't a light), it can't leak through a wall, and it survives
     the toon pass — the same trick the bathroom tile uses for its corners.
     Low enough that real light still does the shading and the figure keeps
     its form; high enough that a body in a dark corner still reads as that
     person's colours. */
  // a share of the colour, PLUS a small flat lift. the share alone leaves dark
  // clothing dark (34% of near-black is still near-black), and a black tee in
  // an unlit corner is the silhouette problem all over again. the flat part is
  // what keeps the shape readable; the share is what keeps it that person's
  // colour rather than a uniform grey.
  const FLOOR_MUL = 0.30, FLOOR_ADD = 0.075;
  const floorOf = (c) => {
    const col = new THREE.Color(c);
    col.setRGB(Math.min(1, col.r * FLOOR_MUL + FLOOR_ADD),
               Math.min(1, col.g * FLOOR_MUL + FLOOR_ADD),
               Math.min(1, col.b * FLOOR_MUL + FLOOR_ADD));
    return col;
  };
  const lam = (c) => {
    const k = String(c);
    let m = mats.get(k);
    if (!m) {
      m = track(new THREE.MeshLambertMaterial({ color: c, emissive: floorOf(c) }));
      mats.set(k, m);
    }
    return m;
  };

  const wide = s.build === "broad" ? 1.18 : s.build === "slim" ? 0.86 : 1;
  const topC = s.topColor, botC = s.bottomColor;

  /* --- shoes -------------------------------------------------------------
     The one part of this figure that changes its HEIGHT. A platform sole has
     to LIFT you, not swallow your ankle, so the shoes are built on `group` at
     floor level and the whole rest of the person goes in `body`, raised by
     whatever that pair adds underfoot. Feet still sit at y=0 either way. --- */
  const lift = buildShoes(group, s, { wide, lam, track });
  const body = new THREE.Group();
  body.position.y = lift;
  group.add(body);

  // --- legs + a waist band -----------------------------------------------
  // the ankle tapers hard on purpose: a trouser leg wider than the shoe hangs
  // OVER it, and all you see of a red hi-top is a sliver of sole on the floor
  for (const sx of [-0.085, 0.085]) {
    const leg = new THREE.Mesh(track(new THREE.CylinderGeometry(0.084 * wide, 0.056 * wide, 0.5, 10)), lam(botC));
    leg.position.set(sx * wide, 0.32, 0); body.add(leg);
  }
  /* --- torso --------------------------------------------------------------
     A trunk with a dome on top, not a capsule. The dome IS the shoulders — it
     lands on TORSO_TOP for every build, which is where the neck starts and
     just above where the arms hang, and it's solved from the radius because
     the radius rides `wide` (a fixed capsule length left the slim torso 3 cm
     short with its neck hanging in the air). The BOTTOM has to be flat: a
     capsule's lower cap tapers to a point below the waistband and hangs out
     between the legs like a shirt-tail wedge. --- */
  const torsoR = 0.2 * wide, waistR = torsoR * 0.94;
  const trunkTop = TORSO_TOP - torsoR;
  const trunk = new THREE.Mesh(
    track(new THREE.CylinderGeometry(torsoR, waistR, trunkTop - HIP_Y, 16)), lam(topC));
  trunk.position.y = (trunkTop + HIP_Y) / 2; body.add(trunk);
  const shoulders = new THREE.Mesh(
    track(new THREE.SphereGeometry(torsoR, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)), lam(topC));
  shoulders.position.y = trunkTop; body.add(shoulders);
  // one ring to separate top from bottom — a dark tee over dark trousers still
  // reads as one lump without it — sat right on the hem so it caps the shirt
  const belt = new THREE.Mesh(track(new THREE.CylinderGeometry(waistR + 0.006, waistR + 0.006, 0.062, 16)),
    lam(shade(botC, -0.35)));
  belt.position.y = HIP_Y; body.add(belt);

  /* --- arms: the single biggest silhouette win. they hang; nobody animates
     them; a figure without them is a bowling pin. Two numbers matter and they
     pull against each other. The pivot sits INSIDE the torso's shoulder cap,
     because an arm that starts clear of the body reads as detached. The splay
     then carries it out: 0.22 rad is what it takes for the forearm and hand to
     clear the trunk and the belt below it. Note the sign —
     `sx * splay` swings the hand OUT, `-sx * splay` swings it into the hip. */
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(sx * 0.178 * wide, SHOULDER_Y, 0);
    arm.rotation.z = sx * 0.24;
    body.add(arm);
    const upper = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.053, 0.19, 4, 8)), lam(topC));
    upper.position.y = -0.155; arm.add(upper);
    const fore = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.046, 0.19, 4, 8)), lam(s.skin));
    fore.position.y = -0.385; fore.rotation.x = -0.1; arm.add(fore);   // a tee = bare forearms
    const hand = new THREE.Mesh(track(new THREE.SphereGeometry(0.05, 8, 6)), lam(s.skin));
    hand.position.set(0, -0.55, 0.012); hand.scale.set(0.85, 1.1, 0.75); arm.add(hand);
  }

  // chest logo
  if (s.logo) {
    const t = track(logoTex(s.logo));
    const logo = new THREE.Mesh(track(new THREE.PlaneGeometry(0.24, 0.066)),
      new THREE.MeshBasicMaterial({ map: t, transparent: true }));
    logo.position.set(0, 0.97, torsoR + 0.02); body.add(logo);
    disposables.push(logo.material);
  }

  // --- neck + head (skin) ---
  const neck = new THREE.Mesh(track(new THREE.CylinderGeometry(0.058, 0.072, 0.12, 8)), lam(shade(s.skin, -0.12)));
  neck.position.y = 1.29; body.add(neck);
  const head = new THREE.Mesh(track(new THREE.SphereGeometry(HEAD_R, 16, 14)), lam(s.skin));
  head.position.y = HEAD_Y; body.add(head);
  // ears — two flat discs at the temples. tiny, but they break the perfect
  // sphere, and every hairstyle then has something to sit in front of.
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(track(new THREE.SphereGeometry(0.032, 8, 6)), lam(s.skin));
    ear.position.set(sx * 0.142, 1.435, -0.006); ear.scale.set(0.45, 1, 0.8); body.add(ear);
  }

  // --- hair + beard ---
  buildHair(body, s, lam, track);
  buildBeard(body, s, lam, track);

  // --- the glowing 8-bit face + a voice halo ---
  const halo = new THREE.Mesh(track(new THREE.PlaneGeometry(0.46, 0.46)),
    new THREE.MeshBasicMaterial({ map: track(softGlow()), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: s.faceColor }));
  halo.position.set(0, 1.47, 0.175); body.add(halo);
  disposables.push(halo.material);
  const face = makeFace(0.2, s.faceColor);
  face.mesh.position.set(0, 1.47, 0.185); body.add(face.mesh);   // proud of the head so hair never covers it

  // slim/broad also stand a little shorter/taller — uniform, so the feet stay
  // on the floor, and a crowd of peers stops looking like one person cloned
  group.scale.setScalar(s.build === "slim" ? 0.97 : s.build === "broad" ? 1.035 : 1);

  let op = 0.78;
  function setVoice(level, dt = 0.016) {
    const lvl = level || 0;
    op += (0.78 + lvl * 0.22 - op) * Math.min(1, dt * 12);
    face.mesh.material.opacity = op;
    face.mesh.scale.setScalar(1 + lvl * 0.06);
    halo.material.opacity = lvl * 0.6;
    halo.scale.setScalar(1 + lvl * 0.7);
    face.draw({ mouth: Math.min(1, lvl * 1.3) });
  }
  function dispose() { for (const d of disposables) { try { d.dispose && d.dispose(); } catch (e) {} } }

  return { group, face, setVoice, dispose };
}

/* ---------------- shoes ----------------
   Five pairs, ONE flat colour each — sole, upper, toe cap, collar and all.
   Earlier passes gave the sole its own colour, then its own shade; both read
   as a band stuck under the foot. The shape has to come from the geometry.

   Two things every pair has to respect. The trouser hem is 15 cm across, so
   a shoe narrower than that disappears under it — these are all ≥13 cm and
   the collars/shafts are wider than the ankle they sleeve, or they render
   INSIDE the leg and you see nothing. And the pair's own height is returned
   as a LIFT: the body sits on top of the shoe rather than inside it, which is
   the whole point of a platform. Feet stay at y=0 regardless. */
const SHOE_LIFT = { sneaker: 0, hitop: 0, chunky: 0.034, platform: 0.062, boot: 0.009 };

function buildShoes(group, s, { wide, lam, track }) {
  const style = SHOE_LIFT[s.shoe] === undefined ? "sneaker" : s.shoe;
  const shoeC = s.shoeColor || DEFAULT_SPEC.shoeColor;
  // ONE material for the whole shoe. The sole, the toe cap, the collar and the
  // tongue are all the colour you picked — no contrast, not even a shade down.
  // A lighter sole read as a white band stuck under every foot.
  const C = lam(shoeC), S = C;
  const put = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(track(geo), mat);
    m.position.set(x, y, z); group.add(m); return m;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const tube = (rt, rb, h) => new THREE.CylinderGeometry(rt, rb, h, 12);

  for (const sx of [-1, 1]) {
    const x = sx * 0.085 * wide;
    if (style === "platform") {
      // the sole IS the statement: a slab you stand on
      put(box(0.14, 0.08, 0.222), S, x, 0.04, 0.028);
      put(box(0.13, 0.058, 0.192), C, x, 0.109, 0.022);
      put(box(0.132, 0.016, 0.09), S, x, 0.142, 0.05);      // a strap over the toe
    } else if (style === "chunky") {
      // dad shoe: fat midsole, bulbous toe, nothing subtle about it
      put(box(0.148, 0.048, 0.236), S, x, 0.024, 0.03);
      put(box(0.136, 0.062, 0.202), C, x, 0.079, 0.024);
      put(box(0.138, 0.05, 0.076), S, x, 0.07, 0.108);
    } else if (style === "boot") {
      put(box(0.132, 0.03, 0.208), S, x, 0.015, 0.026);
      put(box(0.126, 0.055, 0.194), C, x, 0.057, 0.022);
      // the shaft has to be WIDER than the shin or it renders inside the leg
      put(tube(0.094, 0.088, 0.22), C, x, 0.19, -0.012);
      put(tube(0.098, 0.098, 0.018), S, x, 0.295, -0.012);  // a cuff at the top
    } else if (style === "hitop") {
      put(box(0.136, 0.026, 0.212), S, x, 0.013, 0.026);
      put(box(0.13, 0.05, 0.198), C, x, 0.051, 0.024);
      put(tube(0.09, 0.086, 0.105), C, x, 0.125, -0.006);   // the ankle collar
      put(box(0.056, 0.09, 0.03), S, x, 0.118, 0.058);      // the tongue
    } else {
      // sneaker: low, a midsole and a toe cap in the same colour
      put(box(0.136, 0.026, 0.212), S, x, 0.013, 0.026);
      put(box(0.13, 0.05, 0.2), C, x, 0.051, 0.024);
      put(box(0.132, 0.036, 0.07), S, x, 0.044, 0.1);
    }
  }
  return SHOE_LIFT[style];
}

/* ---------------- hair ----------------
   The old version built every style from a smooth SphereGeometry cap sat on a
   smooth SphereGeometry head. Two concentric spheres have no edge between
   them, so it read as a swim cap — and "long" was an open cylinder, i.e. a
   tube. Three things fix it, none of them colour or polygon count:

   1. THE CROWN IS TIPPED BACK. A sphere cap's rim sits at one height all the
      way round, and real hair doesn't: it's high at the forehead and low at
      the nape. Rotating the cap back ~0.3 rad buys both at once — which also
      means no separate nape patch, and no hood.
   2. THE HAIRLINE IS LOCKS, not the rim. Five-sided tapers laid across the
      brow at different angles, with a part off to one side, so the edge you
      read is a diagonal instead of a circle.
   3. A SHELL MUST NOT DIP INSIDE THE SKULL. Offset a cap backwards further
      than (its radius − the head's) and its front cuts through the face,
      which is where the ragged notch over one eye came from.

   Hard rule: nothing opaque crosses the FRONT of the head below BROW_Y. */
function buildHair(group, s, lam, track) {
  if (!s.hair || s.hair === "none") return;
  const hy = HEAD_Y;
  const C = lam(s.hairColor);
  const D = lam(shade(s.hairColor, -0.4));    // underside/roots — an edge, not a colour
  // shaved sides are SKIN with stubble on it, not dark hair — a hair-coloured
  // cap under a crest just puts the swim cap back on
  const SHAVE = lam(shade(s.skin, -0.22));

  const put = (geo, mat, pos, rot, scl) => {
    const m = new THREE.Mesh(track(geo), mat || C);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    if (scl) m.scale.set(scl[0], scl[1], scl[2]);
    group.add(m); return m;
  };
  // a lock of hair: a five-sided taper. angular, cheap, and a handful of them
  // at different angles is the whole difference between hair and a helmet.
  const lock = (rT, rB, len, pos, rot, scl, mat) =>
    put(new THREE.CylinderGeometry(rT, rB, len, 5), mat, pos, rot, scl);
  // the crown: a cap of a sphere that is NOT the head's, tipped back so its
  // rim rides high at the brow and drops past the ears behind
  const crown = (r, thetaLen, tip = 0.3, scl = [1, 1, 1], dy = 0.005, mat) =>
    put(new THREE.SphereGeometry(r, 14, 10, 0, Math.PI * 2, 0, thetaLen), mat,
      [0, hy + dy, 0], [-tip, 0, 0], scl);
  const sideburns = (len = 0.06) => {
    for (const sx of [-1, 1])
      lock(0.024, 0.014, len, [sx * 0.138, hy - 0.045, 0.02], [0, 0, sx * 0.05], [0.55, 1, 0.8]);
  };
  // the fringe IS the hairline: a long sweep from a part off to the left, a
  // short piece on the other side of the part, a chunk over the temple. every
  // one of them is pressed flat to the skull (scale z) — stood proud they
  // become the peak of a baseball cap — and the whole run stays above
  // BROW_Y wherever it crosses x ±0.1, which is where the eyes are.
  const fringe = () => {
    lock(0.044, 0.021, 0.21, [0.02, 1.532, 0.108], [0, -0.3, 1.33], [1, 1, 0.5]);
    lock(0.038, 0.019, 0.09, [-0.085, 1.536, 0.092], [0, 0.45, -1.15], [1, 1, 0.5]);
    lock(0.036, 0.016, 0.13, [0.12, 1.508, 0.068], [0, -0.8, 1.45], [1, 1, 0.6]);
  };

  if (s.hair === "buzz") {
    crown(0.156, Math.PI * 0.47, 0.28, [1, 1, 1], 0.004, D);
    sideburns(0.075);
  } else if (s.hair === "short") {
    crown(0.161, Math.PI * 0.47, 0.3, [1.02, 1.13, 1]);
    fringe();
    sideburns();
  } else if (s.hair === "mohawk") {
    crown(0.152, Math.PI * 0.47, 0.26, [1, 1, 1], 0.003, SHAVE);   // shaved to the skin at the sides
    // the crest: seven blades along the skull's midline, tallest over the
    // crown and overlapping, so it reads as one fin rather than six spikes
    for (let i = 0; i < 7; i++) {
      const th = -0.62 + i * 0.28;                    // front → back along the midline
      const len = 0.26 - Math.abs(i - 2.4) * 0.032;
      const r = HEAD_R + len / 2 - 0.075;
      lock(0.036, 0.016, len, [0, hy + Math.cos(th) * r, -Math.sin(th) * r], [-th, 0, 0], [0.8, 1, 2.1]);
    }
  } else if (s.hair === "long") {
    crown(0.161, Math.PI * 0.47, 0.3, [1.02, 1.1, 1]);
    fringe();
    // curtains down the front of the shoulders — hair that FRAMES the face is
    // what says "long" from any angle. a back mass alone just says "hood".
    for (const sx of [-1, 1]) {
      lock(0.082, 0.055, 0.48, [sx * 0.13, 1.23, 0.005], [0, 0, sx * 0.05], [0.7, 1, 0.62]);
      lock(0.055, 0.032, 0.22, [sx * 0.15, 1.37, -0.035], [0, 0, sx * 0.12], [0.8, 1, 0.9]);
    }
    lock(0.16, 0.12, 0.46, [0, 1.25, -0.062], null, [1, 1, 0.62]);        // the back mass
  } else if (s.hair === "locs") {
    crown(0.16, Math.PI * 0.46, 0.3, [1.02, 1.06, 1]);
    fringe();
    // strands hanging round the back and sides, skipping the face
    const N = 10, TILT = 0.17;
    for (let i = 0; i < N; i++) {
      const a = Math.PI * (0.29 + (i / (N - 1)) * 1.42);   // 0 = straight ahead
      const len = 0.3 + ((i * 7) % 5) * 0.045;             // varied, but the same every rebuild
      const x = Math.sin(a) * 0.14, z = Math.cos(a) * 0.14;
      lock(0.027, 0.02, len, [x, hy + 0.03 - len / 2, z],
        [-TILT * Math.cos(a), 0, TILT * Math.sin(a)]);
    }
  } else if (s.hair === "bun") {
    crown(0.159, Math.PI * 0.48, 0.34, [1, 1, 1.05]);      // swept back, not puffed up
    put(new THREE.SphereGeometry(0.078, 10, 8), C, [0, hy + 0.135, -0.125], null, [1.15, 0.95, 1.05]);
    put(new THREE.TorusGeometry(0.056, 0.015, 6, 12), D, [0, hy + 0.1, -0.1], [1.1, 0, 0]);   // the tie
    for (const sx of [-1, 1])                              // two strands loose at the temples
      lock(0.022, 0.012, 0.16, [sx * 0.13, hy - 0.03, 0.05], [0, 0, sx * 0.16], [0.8, 1, 0.7]);
  } else if (s.hair === "afro") {
    // a cluster, not a ball: four low-poly puffs at different radii, so the
    // outline has bumps in it. one perfect sphere reads as a helmet.
    const puffs = [[0, 0.09, -0.05, 0.175], [-0.105, 0.05, -0.025, 0.125],
                   [0.105, 0.05, -0.025, 0.125], [0, 0.005, -0.14, 0.14]];
    for (const [x, y, z, r] of puffs)
      put(new THREE.SphereGeometry(r, 10, 8), C, [x, hy + y, z], null, [1, 0.95, 1]);
    crown(0.155, Math.PI * 0.46, 0.28);                    // ties the cluster to the head
    sideburns(0.07);
  }
}

/* ---------------- beard ----------------
   Same problem as the hair: the old one was a cone pointing down off the chin.
   A beard is a MASS on the jaw with an edge along the cheek, plus whatever
   hangs below it. The moustache sits above the 8-bit mouth block. */
function buildBeard(group, s, lam, track) {
  if (!s.beard || s.beard === "none") return;
  const hy = HEAD_Y;
  const C = lam(s.beard === "stubble" ? shade(s.hairColor, -0.25) : s.hairColor);
  const put = (geo, pos, rot, scl) => {
    const m = new THREE.Mesh(track(geo), C);
    m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    if (scl) m.scale.set(scl[0], scl[1], scl[2]);
    group.add(m); return m;
  };
  // the jaw: the BOTTOM cap of a sphere a hair bigger than the head, so it
  // reads as growth on the skin rather than a painted-on shape
  const r = s.beard === "stubble" ? 0.153 : 0.158;
  put(new THREE.SphereGeometry(r, 14, 10, 0, Math.PI * 2, Math.PI * 0.56, Math.PI * 0.44),
    [0, hy - 0.004, 0.004], null, [1, 1.05, 1]);
  if (s.beard === "stubble") return;
  // a moustache — a small slab just above the mouth block
  put(new THREE.BoxGeometry(0.072, 0.02, 0.03), [0, 1.437, 0.126], [0.15, 0, 0]);
  // the chin mass, and for "long" a taper hanging off it
  put(new THREE.CylinderGeometry(0.075, 0.055, 0.09, 6), [0, 1.315, 0.052], null, [1, 1, 0.8]);
  if (s.beard === "long")
    put(new THREE.CylinderGeometry(0.06, 0.028, 0.24, 5), [0, 1.185, 0.045], null, [1, 1, 0.75]);
}

// darken/lighten a hex color (amt -1..1)
function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const f = amt < 0 ? 1 + amt : 1;
  c.r *= f; c.g *= f; c.b *= f;
  return c.getHex();
}
