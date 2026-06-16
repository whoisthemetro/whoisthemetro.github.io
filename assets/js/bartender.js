/* ============================================================
   THE METRO — the bartender (the arcade bar)
   A guy works the bar. He's never just standing there: he wipes
   the counter, shakes a cocktail, pours a pour, restocks the
   shelf, and shuffles up and down behind the bar on his own
   clock. Walk up and he clocks you — stops what he's doing, turns,
   and gives you the nod. Click him and he fixes you a drink.

   Built after buildWorld (like the cat), so its materials stay
   MeshLambert — no toon swap, which is fine, it matches the cat.
   world.js owns the bar furniture; this file owns the man + his
   little life behind it. No netcode — same loop for everyone,
   driven only by your local position.

   The model faces LOCAL +z ("front"); the counter/patrons are in
   front of him, the back-bar shelf is behind. barInfo says which
   world axis the counter runs along, so the same rig works whether
   the bar runs E-W or N-S.
   ============================================================ */

import * as THREE from "three";
import { rand } from "./util.js";

const WALK = 0.55;             // m/s shuffle behind the bar
const SKIN = 0xb98a63, SHIRT = 0xe9e4d8, VEST = 0x26222e, TIE = 0x141319;
const HAIR = 0x241a12, TROUSER = 0x1d1b22, APRON = 0x15141b;

export class Bartender {
  /* bar: {
       run: "x"|"z",            // axis the counter runs along (he patrols it)
       min, max,                // patrol range on the run axis (world coords)
       cross,                   // his fixed coord on the OTHER axis (standing line)
       faceYaw,                 // grp.rotation.y that points his front at patrons
       patronAxis:"x"|"z", patronSign:+1|-1, patronLine  // you're a patron if
                                //   (yourPos[patronAxis] - patronLine) * patronSign > 0
     } */
  constructor(scene, bar, fx = {}) {
    this.bar = bar;
    this.fx = fx;
    this.run = bar.run;
    this.faceYaw = bar.faceYaw;

    this.grp = new THREE.Group();
    this._build();
    scene.add(this.grp);

    // roomy invisible hitbox over his upper half (visible above the counter)
    this.hitMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.0, 0.7),
      new THREE.MeshBasicMaterial({ visible: false }));
    this.hitMesh.userData.bartender = true;
    scene.add(this.hitMesh);

    this.pos = { x: 0, z: 0 };
    this._setRun((bar.min + bar.max) / 2);
    this.yaw = this.faceYaw;
    this.state = "idle";
    this.timer = rand(1.5, 3);
    this.phase = 0;            // per-task animation clock
    this.target = null;        // run-axis value when walking
    this.greeted = false;
    this.serveT = 0;
    this._apply(0);
  }

  // place him along the run axis, pinned to his standing line on the other axis
  _setRun(v) {
    if (this.run === "x") { this.pos.x = v; this.pos.z = this.bar.cross; }
    else { this.pos.z = v; this.pos.x = this.bar.cross; }
  }
  _runOf(p) { return this.run === "x" ? p.x : p.z; }

  _build() {
    const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
    const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    // model faces +z: shoulders span x, the face/shirt/apron sit on +z. NOTE:
    // no two faces are coincident or near-coincident — every layer sits clearly
    // proud of the one beneath (≥1.2 cm) so nothing z-fights when he moves.

    // legs (mostly hidden by the counter). their tops tuck up inside the torso
    // box (no shared waist face to flicker)
    for (const sx of [-0.1, 0.1]) {
      const leg = box(0.15, 0.86, 0.18, lam(TROUSER));
      leg.position.set(sx, 0.43, 0);
      this.grp.add(leg);
    }

    // upper body: ONE group that pivots at the hips, so leaning bends the whole
    // torso + arms + head together instead of sliding layers apart
    this.upper = new THREE.Group();
    this.upper.position.y = 0.84;          // hip pivot
    this.grp.add(this.upper);

    // the body is the dark vest (a single box). the shirt is a proud front
    // panel, the apron a proud lower panel, the tie proud above the shirt —
    // each on its own depth, none touching.
    const vest = box(0.44, 0.54, 0.26, lam(VEST));    // front face at z = 0.13
    vest.position.y = 0.27;                            // world 1.11
    const shirt = box(0.2, 0.32, 0.02, lam(SHIRT));   // upper chest, y 1.03..1.35
    shirt.position.set(0, 0.355, 0.145);              // 1.5 cm proud of the vest
    const apron = box(0.34, 0.44, 0.02, lam(APRON));  // waist down, y 0.57..1.01
    apron.position.set(0, -0.05, 0.15);               // 2 cm proud, no y-overlap w/ shirt
    const tie = box(0.1, 0.05, 0.03, lam(TIE));
    tie.position.set(0, 0.5, 0.165);
    this.upper.add(vest, shirt, apron, tie);

    // head (faces +z), parented to the upper body so it leans with him
    this.head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 12), lam(SKIN));
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.123, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), lam(HAIR));
    hair.position.y = 0.012;
    const beard = box(0.15, 0.09, 0.1, lam(HAIR));
    beard.position.set(0, -0.075, 0.05);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0x1a1a22 }));
      eye.position.set(s * 0.045, 0.015, 0.1);
      this.head.add(eye);
    }
    this.head.add(skull, hair, beard);
    this.head.position.y = 0.66;          // world 1.50
    this.upper.add(this.head);

    // arms — shoulders on ±x (clear of the 0.22 torso half-width), each a pivot
    // holding an upper arm + a forearm pivot (the elbow). parented to the upper
    // body so they ride the lean. +rotation.x swings the arm toward the counter.
    this.arms = {};
    for (const side of ["L", "R"]) {
      const s = side === "L" ? 1 : -1;            // +x = his left
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.27, 0.46, 0);   // world y 1.30
      const upper = box(0.1, 0.26, 0.1, lam(VEST));
      upper.position.y = -0.13;
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.26;
      const fore = box(0.09, 0.24, 0.09, lam(SHIRT));
      fore.position.y = -0.12;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), lam(SKIN));
      hand.position.y = -0.25;
      elbow.add(fore, hand);
      shoulder.add(elbow);
      this.upper.add(shoulder);
      this.arms[side] = { shoulder, elbow, hand };
    }

    // props the right hand wields, shown one at a time per task
    const shaker = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.16, 10),
      new THREE.MeshLambertMaterial({ color: 0xb8bcc6 }));
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.2, 8),
      new THREE.MeshLambertMaterial({ color: 0x3a6a4a, transparent: true, opacity: 0.85 }));
    const rag = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.1),
      new THREE.MeshLambertMaterial({ color: 0xcfcabb }));
    this.props = { shaker, bottle, rag };
    for (const k in this.props) {
      this.props[k].visible = false;
      this.arms.R.elbow.add(this.props[k]);
      this.props[k].position.y = -0.28;
    }
  }

  /* ---------- behaviour ---------- */

  _pick() {
    const r = Math.random();
    if (r < 0.22) { this.state = "wipe";    this.timer = rand(2.5, 4.5); }
    else if (r < 0.42) { this.state = "shake";   this.timer = rand(2.0, 3.5); }
    else if (r < 0.58) { this.state = "pour";    this.timer = rand(1.8, 2.8); }
    else if (r < 0.74) { this.state = "restock"; this.timer = rand(2.0, 3.5); }
    else { this.state = "walk"; this.target = rand(this.bar.min, this.bar.max); this.timer = 6; }
    this.phase = 0;
    this._showProp(this.state === "shake" ? "shaker" : this.state === "pour" ? "bottle" : this.state === "wipe" ? "rag" : null);
  }

  _showProp(which) {
    for (const k in this.props) this.props[k].visible = (k === which);
  }

  // main.js calls this when you click him within reach
  serve() {
    this.state = "serve";
    this.serveT = 1.6;
    this.phase = 0;
    this._showProp("bottle");
    this.fx.serve?.();
    return BAR_LINES[(Math.random() * BAR_LINES.length) | 0];
  }

  /* ---------- per-frame ---------- */

  tick(dt, t, playerPose) {
    this.timer -= dt;
    this.phase += dt;

    // are you at the bar? on the patron side, close, and roughly alongside him
    const pb = this.bar;
    const near = playerPose &&
      Math.hypot(playerPose.x - this.pos.x, playerPose.z - this.pos.z) < 2.3 &&
      (playerPose[pb.patronAxis] - pb.patronLine) * pb.patronSign > 0;

    if (this.state === "serve") {
      this.serveT -= dt;
      if (this.serveT <= 0) { this.greeted = true; this.state = "attend"; this.timer = rand(2, 4); this._showProp(null); }
      this.yaw = this._turn(this.yaw, this._faceTowards(playerPose) ?? this.faceYaw, dt * 6);
    } else if (near) {
      if (this.state !== "attend") { this.state = "attend"; this._showProp(null); this.phase = 0; }
      if (!this.greeted) { this.greeted = true; this.fx.greet?.(); }
      this.yaw = this._turn(this.yaw, this._faceTowards(playerPose), dt * 6);
    } else {
      this.greeted = false;
      if (this.state === "attend") { this.state = "idle"; this.timer = rand(0.5, 1.5); }
      if (this.state === "walk" && this.target != null) {
        const cur = this._runOf(this.pos), d = this.target - cur;
        if (Math.abs(d) < 0.05 || this.timer <= 0) { this.state = "idle"; this.timer = rand(0.4, 1.2); this.target = null; }
        else this._setRun(cur + Math.sign(d) * WALK * dt);
        this.yaw = this._turn(this.yaw, this.faceYaw, dt * 5);   // sidestep, still facing the room
      } else if (this.timer <= 0) {
        if (this.state === "idle") this._pick();
        else { this.state = "idle"; this.timer = rand(0.5, 1.4); this._showProp(null); }
      }
      // chores face the room, except restock (turn to the back shelf)
      const want = this.state === "restock" ? this.faceYaw + Math.PI : this.faceYaw;
      if (this.state !== "walk") this.yaw = this._turn(this.yaw, want, dt * 4);
    }

    this._apply(t, dt);
  }

  // yaw that points his front (+z) at a world point; null if no point
  _faceTowards(p) {
    if (!p) return null;
    return Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
  }

  _turn(cur, want, max) {
    let d = want - cur;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return cur + Math.max(-max, Math.min(max, d));
  }

  _apply(t, dt = 0) {
    this.grp.position.set(this.pos.x, 0, this.pos.z);
    this.grp.rotation.y = this.yaw;

    const L = this.arms.L, R = this.arms.R;
    // rest pose: arms hang, very slightly forward
    let lShoX = -0.1, lElb = 0.2, rShoX = -0.1, rElb = 0.2, lean = 0, headNod = 0;
    let rShoZ = 0;
    const ph = this.phase;

    switch (this.state) {
      case "wipe": {                       // lean in, right hand sweeps the counter
        lean = 0.28;
        rShoX = -1.15; rElb = 0.5;
        rShoZ = Math.sin(ph * 7) * 0.5;    // side-to-side scrub
        lShoX = -0.7; lElb = 0.6;
        break;
      }
      case "shake": {                      // shaker up by the ear, quick rattle
        const s = Math.sin(ph * 18) * 0.22;
        rShoX = -2.4 + s; rElb = 1.5 + s;
        lShoX = -2.2 - s; lElb = 1.5 - s;
        headNod = Math.sin(ph * 18) * 0.04;
        break;
      }
      case "pour": {                       // right arm out over the counter, a slow tilt
        rShoX = -1.35; rElb = 0.3; rShoZ = -0.2;
        this.props.bottle.rotation.x = Math.min(1.1, ph * 1.4);
        lShoX = -0.5; lElb = 0.7;
        break;
      }
      case "restock": {                    // reach up to the shelf behind
        const up = Math.min(1, ph * 1.5);
        rShoX = 2.4 * up; rElb = 0.3;
        lShoX = 1.6 * up; lElb = 0.3;
        break;
      }
      case "serve": {                      // present the drink across the bar
        lean = 0.18;
        rShoX = -1.5; rElb = 0.2;
        this.props.bottle.rotation.x = Math.sin(ph * 3) * 0.2;
        break;
      }
      case "attend": {                     // squared up, a welcoming half-raise + nod
        const wave = ph < 1 ? Math.sin(ph * 8) * 0.25 : 0;
        rShoX = -0.3 - (ph < 1 ? 1.0 : 0); rElb = 0.4 + wave;
        headNod = ph < 1.2 ? Math.sin(ph * 6) * 0.05 : 0;
        break;
      }
      case "walk": {
        const sw = Math.sin(t * 8) * 0.4;
        lShoX = sw; rShoX = -sw;
        break;
      }
      default: {                           // idle: breathe + tiny weight shift
        lShoX = -0.1 + Math.sin(t * 1.5) * 0.04;
        rShoX = -0.1 - Math.sin(t * 1.5) * 0.04;
      }
    }

    // ease the limbs toward the target pose so transitions don't snap
    const k = dt ? Math.min(1, dt * 12) : 1;
    L.shoulder.rotation.x += (lShoX - L.shoulder.rotation.x) * k;
    R.shoulder.rotation.x += (rShoX - R.shoulder.rotation.x) * k;
    L.elbow.rotation.x += (lElb - L.elbow.rotation.x) * k;
    R.elbow.rotation.x += (rElb - R.elbow.rotation.x) * k;
    R.shoulder.rotation.z += (rShoZ - R.shoulder.rotation.z) * k;
    if (this.state !== "pour" && this.state !== "serve")
      this.props.bottle.rotation.x += (0 - this.props.bottle.rotation.x) * k;

    this.upper.rotation.x = lean;       // whole torso+arms+head bend from the hips
    this.head.rotation.x = headNod;     // nod on top of the lean

    const bob = Math.sin(t * 2) * 0.005;   // breathing
    this.grp.position.y = bob;

    this.hitMesh.position.set(this.pos.x, 1.15, this.pos.z);
  }
}

// what he says when you order — picked at random, shown as a toast
const BAR_LINES = [
  "comin' right up.",
  "good choice. on the house tonight.",
  "rough day? this'll fix it.",
  "one of my specials — don't ask what's in it.",
  "first one's always the best one.",
  "say when… too late.",
  "for you? always.",
];
