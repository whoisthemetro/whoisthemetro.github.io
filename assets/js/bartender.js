/* ============================================================
   THE METRO — the bartender (the arcade bar)
   He's the same ghostly glow-blob the visitors are, just with a
   brain: he idles behind the bar, moseys up and down the counter,
   turns to clock you when you walk up, and — being a bartender —
   has something dry to say when he greets you or pours your drink.

   Pure primitives (a glowing capsule + a head, additive-blended like
   the player ghosts in ghosts.js) — no models, no loaders, nothing
   to download. Cheap to draw, keeps the room smooth.

   He faces LOCAL +z ("front"); barInfo says which world axis the
   counter runs along, so the same brain works for a bar laid out E-W
   or N-S.
   ============================================================ */

import * as THREE from "three";
import { rand } from "./util.js";

const WALK = 0.55;             // m/s shuffle behind the bar
const GLOW = 0xffb070;         // a warm amber so he reads as "the barkeep"

export class Bartender {
  /* bar: {
       run:"x"|"z", min, max,   // patrol range along the counter
       cross,                   // his fixed coord on the other axis (standing line)
       faceYaw,                 // yaw that points his front at patrons
       patronAxis, patronSign, patronLine   // you're a patron if
                                //   (yourPos[patronAxis]-patronLine)*patronSign > 0
     } */
  constructor(scene, bar, fx = {}) {
    this.bar = bar;
    this.fx = fx;
    this.run = bar.run;
    this.faceYaw = bar.faceYaw;

    this.grp = new THREE.Group();
    this._build();
    scene.add(this.grp);

    // roomy invisible hitbox over his glow (visible above the counter)
    this.hitMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.2, 0.7),
      new THREE.MeshBasicMaterial({ visible: false }));
    this.hitMesh.userData.bartender = true;
    scene.add(this.hitMesh);

    this.pos = { x: 0, z: 0 };
    this._setRun((bar.min + bar.max) / 2);
    this.yaw = this.faceYaw;
    this.state = "idle";
    this.timer = rand(1.5, 3);
    this.target = null;        // run-axis value when walking
    this.greeted = false;
    this.serveT = 0;
    this.bob = Math.random() * 10;
    this._apply(0);
  }

  _setRun(v) {
    if (this.run === "x") { this.pos.x = v; this.pos.z = this.bar.cross; }
    else { this.pos.z = v; this.pos.x = this.bar.cross; }
  }
  _runOf(p) { return this.run === "x" ? p.x : p.z; }

  _build() {
    // the player-ghost look (see ghosts.js makeFigure): a glowing capsule body
    // + a head, additive-blended and semi-transparent
    const mat = new THREE.MeshBasicMaterial({
      color: GLOW, transparent: true, opacity: 0.34,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.mat = mat;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.85, 6, 14), mat);
    body.position.y = 0.85;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), mat);
    head.position.y = 1.62;
    this.body = body; this.head = head;
    this.grp.add(body, head);

    // a little floating tag so he reads as the barkeep, like visitors' names
    this.grp.add(this._tag("barkeep"));
  }

  _tag(text) {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 64;
    const g = c.getContext("2d");
    g.font = "600 28px Archivo, sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.shadowColor = "rgba(0,0,0,0.9)"; g.shadowBlur = 8;
    g.fillStyle = "#ffd9a0";
    g.fillText(text, 128, 32, 240);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(1.0, 0.25, 1);
    sp.position.y = 2.02;
    return sp;
  }

  /* ---------- behaviour ---------- */

  _pick() {
    // mostly stands there; now and then moseys to another spot on the bar
    if (Math.random() < 0.4) { this.state = "walk"; this.target = rand(this.bar.min, this.bar.max); this.timer = 6; }
    else { this.state = "idle"; this.timer = rand(2.5, 5); }
  }

  // main.js calls this when you click him within reach → he pours + quips
  serve() {
    this.state = "serve";
    this.serveT = 1.4;
    this.fx.serve?.();
    return SERVE_LINES[(Math.random() * SERVE_LINES.length) | 0];
  }

  /* ---------- per-frame ---------- */

  tick(dt, t, playerPose) {
    this.timer -= dt;

    const pb = this.bar;
    const near = playerPose &&
      Math.hypot(playerPose.x - this.pos.x, playerPose.z - this.pos.z) < 2.3 &&
      (playerPose[pb.patronAxis] - pb.patronLine) * pb.patronSign > 0;

    if (this.state === "serve") {
      this.serveT -= dt;
      if (this.serveT <= 0) { this.greeted = true; this.state = "attend"; this.timer = rand(2, 4); }
      if (playerPose) this.yaw = this._turn(this.yaw, this._faceTowards(playerPose), dt * 6);
    } else if (near) {
      if (this.state !== "attend") { this.state = "attend"; }
      if (!this.greeted) {
        this.greeted = true;
        this.fx.greet?.();
        this.fx.say?.(GREET_LINES[(Math.random() * GREET_LINES.length) | 0]);   // a dry hello
      }
      this.yaw = this._turn(this.yaw, this._faceTowards(playerPose), dt * 6);
    } else {
      this.greeted = false;
      if (this.state === "attend") { this.state = "idle"; this.timer = rand(0.5, 1.5); }
      if (this.state === "walk" && this.target != null) {
        const cur = this._runOf(this.pos), d = this.target - cur;
        if (Math.abs(d) < 0.05 || this.timer <= 0) { this.state = "idle"; this.timer = rand(0.4, 1.2); this.target = null; }
        else this._setRun(cur + Math.sign(d) * WALK * dt);
      } else if (this.timer <= 0) {
        this._pick();
      }
      this.yaw = this._turn(this.yaw, this.faceYaw, dt * 4);
    }

    this._apply(t);
  }

  _faceTowards(p) { return Math.atan2(p.x - this.pos.x, p.z - this.pos.z); }

  _turn(cur, want, max) {
    let d = want - cur;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return cur + Math.max(-max, Math.min(max, d));
  }

  _apply(t) {
    this.grp.position.set(this.pos.x, 0, this.pos.z);
    this.grp.rotation.y = this.yaw;
    // gentle alive-bob, like the player ghosts
    const lift = Math.sin(t * 1.8 + this.bob) * 0.03;
    this.body.position.y = 0.85 + lift;
    this.head.position.y = 1.62 + lift;
    this.hitMesh.position.set(this.pos.x, 1.1, this.pos.z);
  }
}

// dry hellos when you walk up
const GREET_LINES = [
  "oh good, another one.",
  "let me guess — you 'just want water.'",
  "welcome. try not to touch anything.",
  "great, a paying customer. allegedly.",
  "you again. the stools missed you.",
  "rough day at the arcade? riveting.",
];
// what he says when you order — sarcastic, but he'll still pour it
const SERVE_LINES = [
  "one regrettable decision, coming up.",
  "made it weak — like your high score.",
  "on the house. mostly out of pity.",
  "i call this one 'closing time.' hint, hint.",
  "tastes like your last mistake. cheers.",
  "here. don't make it weird.",
  "bold choice for someone who lost at pong.",
];
