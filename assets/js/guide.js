/* ============================================================
   THE METRO — the guide (the bedroom)

   The room is full of things that don't announce themselves: a secret
   fill on the e-kit that opens the studio, a lift that goes to four
   other places, a wall you can post to. Nobody finds that on their own.
   So somebody stands near where you land and offers to show you — one
   thing at a time, never the whole list.

   She's the same glow-blob the visitors are, built from the bartender's
   pattern (see bartender.js — same body, same 8-bit face, same
   walk-up-and-she-clocks-you brain), with three differences: a cool
   blue-white instead of his amber, a slow halo so she reads as
   something the room provided rather than someone who wandered in, and
   a mouth that flaps to a REAL voice instead of a timer — fx.speaking()
   is asked every frame, so the flap matches whatever say.js is doing.

   She mills about a small patch near her post and never wanders: a
   guide you have to go looking for isn't a guide. When you step away
   she forgets she greeted you, so coming back is a fresh hello.

   Deliberately knows nothing about the tutorial. She's a body, a face
   and a mouth; what she SAYS lives with whoever calls speak(). That's
   so the lesson can be rewritten without touching the character.
   ============================================================ */

import * as THREE from "three";
import { rand } from "./util.js";
import { makeFace } from "./face.js";

/* Two blues, and the reason is the daylight. The bartender's single additive
   shell works because the arcade is dark — additive ADDS to what's behind, so
   over a black room his amber reads as amber. The bedroom has a window in it,
   and adding a pale blue to a sunlit wall just walks everything toward white:
   she came out a grey smudge. So the colour is pushed deep and saturated (a
   near-zero red channel shifts the HUE of whatever is behind her instead of
   just brightening it), and she's built in two coats — a wide soft aura and a
   smaller, stronger core inside it. The core gives her an edge in daylight;
   the aura is what glows once the room dims. */
const AURA = 0x1e6cff;
const CORE = 0x35a6ff;
const WALK = 0.42;             // m/s amble; slower than the barkeep, she's in no hurry
const NOTICE = 2.6;            // how close before she looks up
const ROAM = 0.55;             // how far from her post she'll drift

export class Guide {
  constructor(scene, home, fx = {}) {
    this.home = { x: home.x, z: home.z, yaw: home.yaw || 0 };
    this.fx = fx;

    this.grp = new THREE.Group();
    this._build();
    scene.add(this.grp);

    // an invisible box you can actually click — same trick as the bartender,
    // since a glow blob with additive blending is a terrible raycast target
    this.hitMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 1.5, 0.72),
      new THREE.MeshBasicMaterial({ visible: false }));
    this.hitMesh.userData.guide = true;
    scene.add(this.hitMesh);

    this.pos = { x: this.home.x, z: this.home.z };
    this.yaw = this.home.yaw;
    this.state = "idle";
    this.timer = rand(1.5, 3);
    this.target = null;
    this.greeted = false;
    this.bob = Math.random() * 10;
    this.talkT = 0;              // fallback mouth clock when nothing's speaking for real
    this.gaze = null;            // a world point that outranks the player for facing
    this.gazeT = 0;
    this.blinkIn = rand(2, 5);
    this.blinkFor = 0;
    this.nodT = 0;
    this._apply(0);
  }

  _build() {
    const coat = (color, opacity) => new THREE.MeshBasicMaterial({
      color, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const auraMat = coat(AURA, 0.2), coreMat = coat(CORE, 0.34);
    this.mat = auraMat; this.coreMat = coreMat;

    // a touch shorter than the barkeep — she reads as a companion, not staff
    this.body = new THREE.Group();
    this.body.position.y = 0.78;
    this.body.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.72, 6, 14), auraMat));
    this.body.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.145, 0.6, 6, 12), coreMat));
    this.grp.add(this.body);

    this.headGrp = new THREE.Group();
    this.headGrp.position.y = 1.46;
    this.headGrp.add(new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 12), auraMat));
    this.headGrp.add(new THREE.Mesh(new THREE.SphereGeometry(0.108, 12, 10), coreMat));

    this.face = makeFace(0.26, "#bfefff");
    this.face.mesh.position.set(0, 0.01, 0.135);
    this.headGrp.add(this.face.mesh);
    this.grp.add(this.headGrp);

    // the halo: a thin ring that hangs over her and turns slowly. the one
    // thing that says "the room made her" — visitors don't come with these.
    this.halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.15, 0.008, 6, 28),
      coat(CORE, 0.75));
    this.halo.rotation.x = Math.PI / 2;
    this.halo.position.y = 1.74;
    this.grp.add(this.halo);

    this.grp.add(this._tag("guide"));
  }

  _tag(text) {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 64;
    const g = c.getContext("2d");
    g.font = "600 28px Archivo, sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.shadowColor = "rgba(0,0,0,0.9)"; g.shadowBlur = 8;
    g.fillStyle = "#cfefff";
    g.fillText(text, 128, 32, 240);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(1.0, 0.25, 1);
    sp.position.y = 1.92;
    return sp;
  }

  /* ---------- what she does ---------- */

  // say a line out loud. the actual speaking belongs to whoever wired
  // fx.say (say.js today); this just runs the mouth and the nod.
  speak(text) {
    this.nodT = 0.4;
    const ms = this.fx.say?.(text);
    // if the voice layer told us how long it'll take, trust it; otherwise
    // fall back to a length guess so the mouth doesn't run dry or forever
    this.talkT = Math.max(0.6, (typeof ms === "number" ? ms : String(text).length * 55) / 1000);
    return ms;
  }

  // look at a thing in the room for a moment — for "the drums are over there"
  lookAt(x, z, hold = 2.5) { this.gaze = { x, z }; this.gazeT = hold; }

  _pick() {
    if (Math.random() < 0.35) {
      // a small amble inside her patch, never further
      const a = Math.random() * Math.PI * 2, r = Math.random() * ROAM;
      this.target = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r };
      if (this.fx.walkable && !this.fx.walkable(this.target.x, this.target.z)) this.target = null;
      this.state = this.target ? "walk" : "idle";
      this.timer = 5;
    } else {
      this.state = "idle";
      this.timer = rand(2.5, 5);
    }
  }

  /* ---------- per-frame ---------- */

  tick(dt, t, playerPose) {
    this.timer -= dt;
    this.gazeT = Math.max(0, this.gazeT - dt);
    if (this.gazeT <= 0) this.gaze = null;

    const near = playerPose &&
      Math.hypot(playerPose.x - this.pos.x, playerPose.z - this.pos.z) < NOTICE;

    if (near) {
      if (this.state !== "attend") { this.state = "attend"; this.target = null; }
      if (!this.greeted) {
        this.greeted = true;
        this.nodT = 0.5;
        this.fx.greet?.();
      }
    } else {
      this.greeted = false;
      if (this.state === "attend") { this.state = "idle"; this.timer = rand(0.4, 1.2); }
      if (this.state === "walk" && this.target) {
        const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.05 || this.timer <= 0) { this.state = "idle"; this.timer = rand(0.6, 1.4); this.target = null; }
        else { this.pos.x += (dx / d) * WALK * dt; this.pos.z += (dz / d) * WALK * dt; }
      } else if (this.timer <= 0) {
        this._pick();
      }
    }

    // facing: a thing she was told to look at wins, then you, then her post
    let want = this.home.yaw;
    if (this.gaze) want = Math.atan2(this.gaze.x - this.pos.x, this.gaze.z - this.pos.z);
    else if (near) want = Math.atan2(playerPose.x - this.pos.x, playerPose.z - this.pos.z);
    else if (this.state === "walk" && this.target) want = Math.atan2(this.target.x - this.pos.x, this.target.z - this.pos.z);
    this.yaw = this._turn(this.yaw, want, dt * 5);

    // the mouth: a real voice if there is one, the fallback clock if not
    this.nodT = Math.max(0, this.nodT - dt);
    this.talkT = Math.max(0, this.talkT - dt);
    const voiced = this.fx.speaking ? this.fx.speaking() : false;
    const talking = voiced || this.talkT > 0;
    this.blinkFor -= dt;
    if (this.blinkFor <= 0) {
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) { this.blinkFor = 0.12; this.blinkIn = rand(2.5, 6); }
    }
    // flap on a fast triangle so it reads as speech, not a blinking light
    const mouth = talking ? 0.25 + Math.abs(Math.sin(t * 11)) * 0.75 : 0;
    this.face.draw({ blink: this.blinkFor > 0, mouth });

    this._apply(t, talking);
  }

  _turn(cur, want, max) {
    let d = want - cur;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return cur + Math.max(-max, Math.min(max, d));
  }

  _apply(t, talking) {
    this.grp.position.set(this.pos.x, 0, this.pos.z);
    this.grp.rotation.y = this.yaw;
    const lift = Math.sin(t * 1.6 + this.bob) * 0.028;
    this.body.position.y = 0.78 + lift;
    this.headGrp.position.y = 1.46 + lift;
    // the halo turns always and tips a little as she breathes
    this.halo.position.y = 1.74 + lift * 1.4;
    this.halo.rotation.z = t * 0.6;
    this.halo.rotation.x = Math.PI / 2 + Math.sin(t * 0.9) * 0.09;
    // she brightens while she's talking — same idea as the mic-reactive
    // player glow, except her "level" is whether a line is in the air
    const targetOp = 0.2 + (talking ? 0.14 : 0);
    this.mat.opacity += (targetOp - this.mat.opacity) * 0.2;
    const targetCore = 0.34 + (talking ? 0.2 : 0);
    this.coreMat.opacity += (targetCore - this.coreMat.opacity) * 0.2;
    this.headGrp.rotation.x = this.nodT > 0 ? Math.sin((0.5 - this.nodT) / 0.5 * Math.PI) * 0.3 : 0;
    this.hitMesh.position.set(this.pos.x, 0.95, this.pos.z);
  }
}
