/* ============================================================
   THE METRO — the cat
   A ginger cat lives here. It sleeps on the chair, watches LA
   out the window, walks across the MIDI keys (you'll hear it),
   wanders, and comes over if you stand still near it. Click it
   to pet it — the pet count is shared by every visitor ever.

   It doesn't have a name yet. Maybe the wall will give it one.
   ============================================================ */

import * as THREE from "three";
import { rand } from "./util.js";

const WALK = 0.5;            // m/s
const FUR = 0xd98a3d, CHEST = 0xf0e3c8, EYE = 0x7ddc6a; // ginger tabby, cream belly, green eyes

export class Cat {
  constructor(scene, spots, fx) {
    // spots: { chair:{x,z,y}, keys:{x1,x2,z,y}, windowFloor:{x,z}, bounds }
    this.spots = spots;
    this.fx = fx;            // { plink(i), purr() }
    this.grp = new THREE.Group();
    this._build();
    scene.add(this.grp);

    // generous invisible hitbox so petting doesn't need pixel aim
    this.hitMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 8, 8),
      new THREE.MeshBasicMaterial({ visible: false }));
    this.hitMesh.userData.cat = true;
    scene.add(this.hitMesh);

    this.hearts = [];
    this.state = "sleep";
    this.timer = rand(20, 50);
    this.pos = { x: spots.chair.x, z: spots.chair.z };
    this.baseY = spots.chair.y;
    this.yaw = Math.PI;
    this.target = null;
    this.lastPlinkX = null;
    this.carrying = false;       // true while it's trotting the toy back to you

    // inner life
    this.mood = 0.35;                       // -1 grumpy .. 1 loving
    this.needs = { food: 1, water: 1, litter: 0 };
    this.moodTimer = rand(20, 50);
    this.meowTimer = rand(45, 150);
    this.needTimer = rand(30, 80);          // when to consider eating/drinking/litter
    this.actionT = 0;                       // anim clock for eat/drink/dig
    this._apply(0);
  }

  setNeeds(n) { if (n) this.needs = n; }

  _build() {
    const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
    const fur = lam(FUR);
    // everything hangs off an inner rig so we can ROLL the whole cat onto its
    // back (belly rubs) about its spine without disturbing grp's position/yaw
    this.rig = new THREE.Group();
    this.grp.add(this.rig);
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.16, 6, 10), fur);
    this.body.rotation.z = Math.PI / 2;
    this.body.position.y = 0.115;
    this.body.castShadow = true;
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), lam(CHEST));
    chest.position.set(0.07, 0.1, 0);
    this.head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.054, 12, 10), fur);
    this.head.add(skull);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.035, 4), fur);
      ear.position.set(-0.01, 0.05, s * 0.032);
      this.head.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 6, 6),
        new THREE.MeshBasicMaterial({ color: EYE }));
      eye.position.set(0.045, 0.012, s * 0.022);
      this.head.add(eye);
    }
    this.head.position.set(0.135, 0.16, 0);
    this.tail = [];
    let parent = this.rig;
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.011 - i * 0.002, 0.013 - i * 0.002, 0.09, 6), fur);
      seg.position.set(i ? 0 : -0.13, i ? 0.075 : 0.13, 0);
      if (i) seg.position.y = 0.08;
      seg.rotation.z = 0.5;
      parent.add(seg);
      parent = seg;
      this.tail.push(seg);
    }
    this.legs = [];
    for (const [lx, lz] of [[0.07, 0.035], [0.07, -0.035], [-0.07, 0.035], [-0.07, -0.035]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.009, 0.075, 6), fur);
      leg.position.set(lx, 0.038, lz);
      this.rig.add(leg);
      this.legs.push(leg);
    }
    this.rig.add(this.body, chest, this.head);
    this._roll = 0;             // current belly-roll about the spine (0 = upright)
    this._kick = 0;             // decaying bunny-kick flail after an over-rub
  }

  /* ---------- state machine ---------- */

  _pick(playerPose) {
    const s = this.spots;
    // the body's schedule comes first — these are the shared timers
    if (this.needs.hungry) {
      if (this.needs.food > 0.05) return this._goto(s.foodBowl.x, s.foodBowl.z, "eat", 0);
      // empty bowl: sit by it and complain until somebody fills it
      if (Math.random() < 0.6) {
        this.fx.meow?.();
        return this._goto(s.foodBowl.x - 0.25, s.foodBowl.z, "sit", 0);
      }
    }
    if (this.needs.thirsty) {
      if (this.needs.water > 0.05) return this._goto(s.waterBowl.x, s.waterBowl.z, "drink", 0);
      if (Math.random() < 0.5) return this._goto(s.waterBowl.x - 0.25, s.waterBowl.z, "sit", 0);
    }
    if (this.needs.bathroom)
      return this._goto(s.litter.x, s.litter.z, "litterbox", 0);
    const r = Math.random();
    if (r < 0.30) return this._goto(s.chair.x, s.chair.z, "sleep", s.chair.y);
    if (r < 0.50) return this._goto(s.windowFloor.x, s.windowFloor.z, "window", 0);
    // a MIDI song owns the keybed — the cat keeps off while one's playing
    if (r < 0.68 && !this.fx.songPlaying?.()) return this._goto(s.keys.x1, s.keys.z, "keys", s.keys.y);
    // wander somewhere on the carpet
    const b = s.bounds;
    return this._goto(rand(b.minX + 0.4, b.maxX - 0.4), rand(b.minZ + 0.4, b.maxZ - 0.4), "sit", 0);
  }

  _goto(x, z, thenState, thenY) {
    this.state = "walk";
    this.target = { x, z, thenState, thenY };
  }

  // Petting never scratches anymore — keep at it and a happy cat just gets
  // happier until it rolls over for a belly rub. The ONLY scratch in the room
  // is the overstimulated bunny-kick during a tummy rub (see rubTummy).
  // Returns 'love' | 'meh' so the caller can react.
  petOutcome() {
    // a neglected, grumpy cat merely tolerates you; anyone else enjoys it
    const out = this.mood > -0.4 ? "love" : "meh";

    if (out === "love") {
      this.mood = Math.min(1, this.mood + 0.03);   // pets warm it up, never sour it
      this.fx.purr?.();
      if (Math.random() < 0.4) this.fx.meow?.();
      this._hearts();
      this.lovePets = (this.lovePets || 0) + 1;
      // settle a sleeping / window-gazing cat so it can roll over
      if (this.state === "sleep" || this.state === "window") {
        this.state = "sit"; this.timer = rand(8, 16);
      }
      // keep petting a settled cat and it flops for belly rubs — only when it's
      // idle enough to (sitting), never mid-walk / eat / keys
      if (this.lovePets >= 3 && this.state === "sit") {
        this._flop();
      }
    } else {
      // tolerates you, barely — a slow tail flick, nothing more
      this.lovePets = 0;
      if (Math.random() < 0.3) this.fx.meow?.();
    }
    return out;
  }

  // flop onto its back, paws up, inviting a tummy rub
  _flop() {
    this.state = "belly";
    this.timer = rand(9, 15);     // how long it'll stay rolled over on its own
    this.lovePets = 0;
    this.target = null;
    this.fx.meow?.();
  }

  // clicked while it's belly-up. mostly bliss (purr + meow + hearts), but rub
  // too eagerly and you get the overstimulated bunny-kick. returns 'rub'|'kick'.
  rubTummy() {
    this._hearts();
    if (Math.random() < 0.2) {
      // too much — it grabs your hand, kicks, and rights itself
      this.fx.meow?.("angry");
      this.mood = Math.max(-0.3, this.mood - 0.04);
      this.state = "sit"; this.timer = rand(3, 6); this._kick = 0.5;
      return "kick";
    }
    this.fx.purr?.(2.6);
    if (Math.random() < 0.6) this.fx.meow?.();
    this.mood = Math.min(1, this.mood + 0.04);
    this.timer = rand(9, 15);     // keep enjoying it — resets the roll-back clock
    return "rub";
  }

  // Someone elsewhere on the internet petted it — show the love here too.
  remoteHearts() {
    this._hearts();
    if (Math.random() < 0.5) this.fx.purr?.();
  }

  // A treat hits different no matter the mood.
  treatAt(x, z) {
    this.mood = Math.min(1, this.mood + 0.6);
    this.isTreat = true;          // a treat is not a meal — bowls untouched
    this.fx.meow?.(true);
    this._goto(x, z, "eat", 0);
    this.timer = 5;
  }

  // Someone threw the toy mouse. Scamper after it, pick it up, and trot it
  // back to whoever's nearest. Returns true if the cat's actually coming — a
  // cat mid-meal or mid-tummy-rub, or a neglected grumpy one, just can't be
  // bothered (the caller leaves the toy lying there).
  goFetch(x, z) {
    if (this.state === "eat" || this.state === "drink" ||
        this.state === "litterbox" || this.state === "belly") return false;
    if (this.mood < -0.25) { this.fx.meow?.(); return false; }   // not in the mood
    this.carrying = false;
    this._goto(x, z, "pounce", 0);
    this.target.speed = 1.1;     // a playful scamper, faster than its amble
    this.fx.meow?.(true);        // an excited chirp as it springs after it
    return true;
  }

  // world position of the mouth, so the toy can ride there while it's carried
  mouthPos(out) {
    this.head.updateWorldMatrix(true, false);
    this.head.getWorldPosition(out);
    out.x += Math.sin(this.yaw) * 0.06;   // nudge to the front of the muzzle
    out.z += Math.cos(this.yaw) * 0.06;
    return out;
  }

  _hearts() {
    for (let i = 0; i < 3; i++) {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d");
      g.font = "44px serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("♥", 32, 36);
      const tex = new THREE.CanvasTexture(c);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, color: 0xff7a9a }));
      sp.scale.set(0.1, 0.1, 1);
      sp.position.set(this.pos.x + rand(-0.1, 0.1), this.baseY + 0.3, this.pos.z + rand(-0.1, 0.1));
      this.grp.parent.add(sp);
      this.hearts.push({ sp, t: 0, drift: rand(-0.05, 0.05) });
    }
  }

  /* ---------- per-frame ---------- */

  tick(dt, t, playerPose) {
    this.timer -= dt;

    // mood drifts with how well it's being taken care of
    this.moodTimer -= dt;
    if (this.moodTimer <= 0) {
      this.moodTimer = rand(20, 55);
      const cared = 0.45
        - 0.85 * (1 - (this.needs.fed ?? 1))        // starving = miserable
        - 0.5 * (1 - (this.needs.hydrated ?? 1))
        - 0.5 * this.needs.litter;
      const target = Math.max(-1, Math.min(1, cared + rand(-0.4, 0.4)));
      this.mood += (target - this.mood) * 0.6;
    }

    // it talks — more when hungry, never the same meow twice
    if (this.state !== "sleep") {
      this.meowTimer -= dt;
      if (this.meowTimer <= 0) {
        this.meowTimer = this.needs.food < 0.25 ? rand(25, 80) : rand(60, 220);
        this.fx.meow?.();
      }
    }

    if (this.state === "eat" || this.state === "drink" || this.state === "litterbox") {
      this.actionT += dt;
      if (this.state === "litterbox" && this.fx.dig && Math.floor(this.actionT / 0.8) !== Math.floor((this.actionT - dt) / 0.8)) {
        this.fx.dig();
      }
      if (this.timer <= 0) {
        // done — this is the moment the bowl/litter actually changes
        const finished = this.state;
        if (finished !== "litterbox") this.mood = Math.min(1, this.mood + 0.15);
        this.state = "sit";
        this.timer = rand(4, 10);
        if (finished === "eat" && this.isTreat) this.isTreat = false;
        else this.onNeed?.(finished);   // 'eat' | 'drink' | 'litterbox'
      }
    }

    if (this.state === "belly") {
      // rolled over on its back, paws up — stays put until the timer runs out,
      // then rights itself and goes back to sitting (the roll eases away in _apply)
      if (this.timer <= 0) { this.state = "sit"; this.timer = rand(4, 10); }
    }

    // --- toy fetch: chase -> pounce -> carry -> drop at your feet ---------
    // the chase itself is an ordinary "walk" (state set by goFetch) that lands
    // on "pounce"; from there these three states carry the loop home.
    if (this.state === "pounce") {
      // a beat crouched over the toy, then it's got it
      if (this.timer <= 0) {
        this.carrying = true;
        this.fx.onToyGrabbed?.();
        this.state = "carry";
        this.timer = 12;          // bail out if it somehow can't reach you
      }
    } else if (this.state === "carry") {
      // bring it to a spot a step IN FRONT of your gaze (not to its own belly),
      // so it lands in your sightline and is easy to grab. forward is the way
      // you're looking; clamp to the room so it never follows you out the door.
      const b = this.spots.bounds, D = 1.0;
      let tx = this.pos.x, tz = this.pos.z;
      if (playerPose) {
        tx = playerPose.x - Math.sin(playerPose.yaw) * D;
        tz = playerPose.z - Math.cos(playerPose.yaw) * D;
      }
      tx = Math.max(b.minX + 0.3, Math.min(b.maxX - 0.3, tx));
      tz = Math.max(b.minZ + 0.3, Math.min(b.maxZ - 0.3, tz));
      this.dropAt = { x: tx, z: tz };   // set the toy down HERE (in your sightline), not at the cat's feet
      const dx = tx - this.pos.x, dz = tz - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.35 || this.timer <= 0) {
        this.state = "dropToy"; this.timer = 0.45;
      } else {
        const want = Math.atan2(dx, dz);
        let dy = want - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.yaw += dy * Math.min(1, dt * 6);
        this.pos.x += (dx / dist) * 0.75 * dt;
        this.pos.z += (dz / dist) * 0.75 * dt;
      }
    } else if (this.state === "dropToy") {
      // sets it down, gives it a proud little meow, sits and looks up at you
      if (this.timer <= 0) {
        this.carrying = false;
        const da = this.dropAt || this.pos;   // a step ahead in your gaze, not under its belly
        this.fx.onToyDropped?.(da.x, da.z);
        this.dropAt = null;
        this.fx.meow?.();
        this.state = "sit"; this.timer = rand(3, 7);
      }
    }

    if (this.state === "walk" && this.target) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.06) {
        // arrived — hop up if the perch is raised
        this.baseY = this.target.thenY || 0;
        this.state = this.target.thenState;
        this.timer = this.state === "sleep" ? rand(50, 140)
                   : this.state === "keys" ? rand(6, 10)
                   : this.state === "eat" ? rand(5, 8)
                   : this.state === "drink" ? rand(4, 6)
                   : this.state === "litterbox" ? rand(5, 7)
                   : this.state === "pounce" ? rand(0.35, 0.6)
                   : rand(15, 45);
        if (this.state === "keys") this.target = { x: this.spots.keys.x2, z: this.spots.keys.z };
        else this.target = null;
        if (this.state === "window") this.yaw = Math.PI;  // face the glass
        this.actionT = 0;
      } else {
        const want = Math.atan2(dx, dz);
        let dy = want - this.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.yaw += dy * Math.min(1, dt * 6);
        const spd = this.target.speed || WALK;
        this.pos.x += (dx / dist) * spd * dt;
        this.pos.z += (dz / dist) * spd * dt;
        this.baseY += ((this.target.thenY && dist < 0.5 ? this.target.thenY : 0) - this.baseY) * dt * 5;
      }
    } else if (this.state === "keys") {
      // a song just started? hop off and find something else to do —
      // the keys are taken
      if (this.fx.songPlaying?.()) { this.baseY = 0; this.state = "walk"; this._pick(playerPose); return; }
      // pace across the keybed, plinking as it steps
      const k = this.spots.keys;
      const dx = this.target.x - this.pos.x;
      if (Math.abs(dx) < 0.04) {
        this.target = { x: this.target.x === k.x2 ? k.x1 : k.x2, z: k.z };
        if (this.timer <= 0) { this.state = "walk"; this._pick(playerPose); }
      } else {
        this.pos.x += Math.sign(dx) * 0.3 * dt;
        this.yaw = Math.sign(dx) > 0 ? Math.PI / 2 : -Math.PI / 2;
        const step = Math.floor(this.pos.x * 14);
        if (step !== this.lastPlinkX) {
          this.lastPlinkX = step;
          this.fx.plink?.(Math.abs(step) % 10);
        }
      }
    } else if (this.timer <= 0) {
      // bored — unless someone is standing quietly nearby, then go say hi
      if (playerPose && Math.hypot(playerPose.x - this.pos.x, playerPose.z - this.pos.z) < 1.6
          && this.state !== "sleep" && Math.random() < 0.5) {
        const a = Math.atan2(playerPose.x - this.pos.x, playerPose.z - this.pos.z);
        this._goto(playerPose.x - Math.sin(a) * 0.45, playerPose.z - Math.cos(a) * 0.45, "sit", 0);
      } else {
        this._pick(playerPose);
      }
    }

    // face a nearby visitor while sitting
    if (this.state === "sit" && playerPose) {
      const d = Math.hypot(playerPose.x - this.pos.x, playerPose.z - this.pos.z);
      if (d < 1.4) {
        const want = Math.atan2(playerPose.x - this.pos.x, playerPose.z - this.pos.z);
        let dy = want - this.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.yaw += dy * Math.min(1, dt * 4);
      }
    }

    this._apply(t, dt);

    // hearts
    for (let i = this.hearts.length - 1; i >= 0; i--) {
      const h = this.hearts[i];
      h.t += dt;
      h.sp.position.y += dt * 0.35;
      h.sp.position.x += h.drift * dt;
      h.sp.material.opacity = Math.max(0, 1 - h.t / 1.6);
      if (h.t > 1.6) {
        h.sp.parent?.remove(h.sp);
        this.hearts.splice(i, 1);
      }
    }
  }

  _apply(t, dt = 0) {
    const sleeping = this.state === "sleep";
    const walking = this.state === "walk" || this.state === "keys" || this.state === "carry";
    const headDown = this.state === "eat" || this.state === "drink" || this.state === "litterbox"
      || this.state === "pounce" || this.state === "dropToy";

    this.grp.position.set(this.pos.x, this.baseY, this.pos.z);
    this.grp.rotation.y = this.yaw - Math.PI / 2;   // model faces +x locally

    // belly roll: ease toward flopped-over (≈ onto its back) while belly-up,
    // back upright otherwise — about the spine, so position/yaw are untouched.
    // the bunny-kick flail (set in rubTummy) decays on its own.
    const rollTarget = this.state === "belly" ? Math.PI * 0.92 : 0;
    this._roll += (rollTarget - this._roll) * Math.min(1, dt * 6);
    this.rig.rotation.x = this._roll;
    // roll about the SPINE (body-center height), not the floor-level rig origin —
    // otherwise flipping over swings the body straight down through the floor/chair.
    // lifting the rig by h·(1-cosθ) moves the pivot up to y = SPINE.
    const SPINE = 0.115;
    this.rig.position.y = SPINE * (1 - Math.cos(this._roll));
    if (this._kick > 0) this._kick = Math.max(0, this._kick - dt * 1.5);

    // breathing / trot bob
    const breathe = sleeping ? Math.sin(t * 1.6) * 0.006 : 0;
    const bob = walking ? Math.abs(Math.sin(t * 8)) * 0.012 : 0;
    this.body.position.y = 0.115 + breathe + bob;
    this.head.position.y = (sleeping ? 0.09 : headDown ? 0.08 : 0.16) + bob;
    this.head.rotation.z = sleeping ? -0.5
      : headDown ? -0.9 + Math.sin((this.actionT || 0) * 7) * 0.12   // nibbling / digging
      : 0;
    // tail sway — faster when walking, lazy when asleep
    const sway = Math.sin(t * (walking ? 6 : 1.6));
    this.tail[0].rotation.x = sway * 0.35;
    this.tail[1].rotation.x = sway * 0.3;
    this.tail[2].rotation.x = sway * 0.25;
    // legs tuck when sleeping
    for (const leg of this.legs) leg.visible = !sleeping;
    if (sleeping) this.body.rotation.x = 0.35; else this.body.rotation.x = 0;
    // trot gait
    if (walking) {
      this.legs.forEach((leg, i) => {
        leg.rotation.x = Math.sin(t * 8 + (i % 2 ? Math.PI : 0)) * 0.5;
      });
    } else {
      this.legs.forEach(leg => { leg.rotation.x = 0; });
    }
    // overstimulated bunny-kick — a quick alternating flail of all four paws
    if (this._kick > 0) {
      this.legs.forEach((leg, i) => {
        leg.rotation.x = Math.sin(t * 28 + i * 1.7) * 0.7 * this._kick;
      });
    }

    this.hitMesh.position.set(this.pos.x, this.baseY + 0.15, this.pos.z);
  }
}
