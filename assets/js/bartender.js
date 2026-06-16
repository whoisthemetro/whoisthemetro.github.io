/* ============================================================
   THE METRO — the bartender (the arcade bar)
   The same ghostly glow-blob the visitors are, with a brain and a
   face: he idles behind the bar, moseys the counter, clocks you when
   you walk up, and — being a bartender — has a dry mouth on him.

   Pure primitives + a tiny canvas face (no models, nothing to
   download), so the room stays smooth. The glow body/head are
   additive-blended like the player ghosts; the FACE rides on a small
   plane in front of the head with simple swappable expressions
   (a sarcastic half-lidded smirk by default, blinks, a talk-flap when
   he says something), and a bowtie marks him as the barkeep. He nods
   when he greets you.

   He faces LOCAL +z; barInfo says which world axis the counter runs
   along, so the same brain works for a bar laid out E-W or N-S.
   ============================================================ */

import * as THREE from "three";
import { rand } from "./util.js";

const WALK = 0.55;             // m/s shuffle behind the bar
const GLOW = 0xffb070;         // warm amber so he reads as "the barkeep"
const FACE = "#16131d";        // face features, dark — reads over the amber glow

export class Bartender {
  constructor(scene, bar, fx = {}) {
    this.bar = bar;
    this.fx = fx;
    this.run = bar.run;
    this.faceYaw = bar.faceYaw;

    this.grp = new THREE.Group();
    this._build();
    scene.add(this.grp);

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
    this.target = null;
    this.greeted = false;
    this.serveT = 0;
    this.bob = Math.random() * 10;
    // expression clocks
    this.blinkIn = rand(2, 5);   // time until next blink
    this.blinkFor = 0;           // remaining blink duration
    this.talkT = 0;              // mouth-flap timer
    this.nodT = 0;               // greeting nod timer
    this._faceKey = null;
    this._setFace("smirk");
    this._apply(0);
  }

  _setRun(v) {
    if (this.run === "x") { this.pos.x = v; this.pos.z = this.bar.cross; }
    else { this.pos.z = v; this.pos.x = this.bar.cross; }
  }
  _runOf(p) { return this.run === "x" ? p.x : p.z; }

  _build() {
    // glow body (player-ghost look): additive, semi-transparent capsule + head
    const glowMat = new THREE.MeshBasicMaterial({
      color: GLOW, transparent: true, opacity: 0.34,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.mat = glowMat;
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.85, 6, 14), glowMat);
    this.body.position.y = 0.85;
    this.grp.add(this.body);

    // head group (so it can nod): the glow head + a face plane in front of it
    this.headGrp = new THREE.Group();
    this.headGrp.position.y = 1.62;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), glowMat);
    this.headGrp.add(head);

    this.faceCanvas = document.createElement("canvas");
    this.faceCanvas.width = this.faceCanvas.height = 128;
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    const faceMat = new THREE.MeshBasicMaterial({
      map: this.faceTex, transparent: true, depthWrite: false,
    });
    this.faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), faceMat);
    this.faceMesh.position.set(0, 0.01, 0.14);   // just proud of the head front (+z)
    this.faceMesh.renderOrder = 12;               // draw over the glow head
    this.headGrp.add(this.faceMesh);
    this.grp.add(this.headGrp);

    // a bowtie at the throat — the cheap "I'm the bartender" signal
    const tieMat = new THREE.MeshBasicMaterial({ color: 0x8a2a3a });
    const tie = new THREE.Group();
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.09, 3), tieMat);
      wing.rotation.z = s * Math.PI / 2;          // point outward
      wing.position.x = s * 0.05;
      tie.add(wing);
    }
    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.03), new THREE.MeshBasicMaterial({ color: 0x5a1a26 }));
    tie.add(knot);
    tie.position.set(0, 1.42, 0.16);
    this.grp.add(tie);

    // the floating tag, like the visitors' names
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
    sp.position.y = 2.05;
    return sp;
  }

  // draw a face. keys: smirk (idle/sarcastic), blink, talk
  _setFace(key) {
    if (key === this._faceKey) return;
    this._faceKey = key;
    const g = this.faceCanvas.getContext("2d");
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = FACE; g.strokeStyle = FACE;
    g.lineCap = "round"; g.lineJoin = "round";
    const eyeY = 52, lx = 44, rx = 84;
    if (key === "blink") {
      g.lineWidth = 6;
      g.beginPath(); g.moveTo(lx - 11, eyeY); g.lineTo(lx + 11, eyeY);
      g.moveTo(rx - 11, eyeY); g.lineTo(rx + 11, eyeY); g.stroke();
    } else {
      // half-lidded "unimpressed" eyes: a lid line with a small pupil under it
      g.lineWidth = 6;
      g.beginPath(); g.moveTo(lx - 12, eyeY - 4); g.lineTo(lx + 12, eyeY - 4);
      g.moveTo(rx - 12, eyeY - 4); g.lineTo(rx + 12, eyeY - 4); g.stroke();
      g.beginPath();
      g.arc(lx, eyeY + 4, 5, 0, Math.PI * 2);
      g.arc(rx, eyeY + 4, 5, 0, Math.PI * 2);
      g.fill();
    }
    // mouth
    g.lineWidth = 6;
    if (key === "talk") {
      g.beginPath(); g.ellipse(64, 92, 11, 9, 0, 0, Math.PI * 2); g.fill();
    } else {
      // a flat smirk, tilted up on his right (screen-left)
      g.beginPath(); g.moveTo(48, 96); g.quadraticCurveTo(64, 92, 82, 86); g.stroke();
    }
    this.faceTex.needsUpdate = true;
  }

  /* ---------- behaviour ---------- */

  _pick() {
    if (Math.random() < 0.4) { this.state = "walk"; this.target = rand(this.bar.min, this.bar.max); this.timer = 6; }
    else { this.state = "idle"; this.timer = rand(2.5, 5); }
  }

  serve() {
    this.state = "serve";
    this.serveT = 1.4;
    this.talkT = 1.3;            // mouth runs while he quips
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
        this.nodT = 0.55; this.talkT = 1.1;      // a nod + a few words
        this.fx.greet?.();
        this.fx.say?.(GREET_LINES[(Math.random() * GREET_LINES.length) | 0]);
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

    // expressions: blink occasionally, flap the mouth while talking
    this.nodT = Math.max(0, this.nodT - dt);
    this.talkT = Math.max(0, this.talkT - dt);
    this.blinkFor -= dt;
    if (this.blinkFor <= 0) {
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) { this.blinkFor = 0.12; this.blinkIn = rand(2.5, 6); }
    }
    let face = "smirk";
    if (this.blinkFor > 0) face = "blink";
    else if (this.talkT > 0) face = (Math.floor(this.talkT * 9) % 2) ? "talk" : "smirk";
    this._setFace(face);

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
    const lift = Math.sin(t * 1.8 + this.bob) * 0.03;
    this.body.position.y = 0.85 + lift;
    this.headGrp.position.y = 1.62 + lift;
    // greeting nod: a quick dip of the head
    this.headGrp.rotation.x = this.nodT > 0 ? Math.sin((0.55 - this.nodT) / 0.55 * Math.PI) * 0.32 : 0;
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
// sarcastic, but he'll still pour it
const SERVE_LINES = [
  "one regrettable decision, coming up.",
  "made it weak — like your high score.",
  "on the house. mostly out of pity.",
  "i call this one 'closing time.' hint, hint.",
  "tastes like your last mistake. cheers.",
  "here. don't make it weird.",
  "bold choice for someone who lost at pong.",
];
