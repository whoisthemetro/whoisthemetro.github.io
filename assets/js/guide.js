/* ============================================================
   THE METRO — the guide (the bedroom)

   The room is full of things that don't announce themselves: a secret
   fill on the e-kit that opens the studio, a lift that goes to four
   other places, a wall you can post to. Nobody finds that on their own.
   So somebody stands near where you land and offers to show you — one
   thing at a time, never the whole list.

   She's a small hovering bat: big ears, wings that beat, and the 8-bit
   face on a dark screen. The BRAIN is the bartender's (see bartender.js
   — same walk-up-and-she-clocks-you logic), but nothing about the body
   is, and her mouth flaps to a REAL voice rather than a timer —
   fx.speaking() is asked every frame, so it matches what say.js does.

   The shape is swappable: `form` picks between bat (hers), person (the
   glow-blob a visitor is), head and shard. Choosing between them meant
   seeing them in this room's own light, so the losers stay buildable.

   Two rules the lighting taught us, and both cost a round to find:
   additive glow can't hold a SHAPE against a sunlit wall — it washes to
   white — so anything that has to read as a silhouette (the face, the
   ears) is a DARK plate on normal blending with the glow inside it.
   And the halo she used to wear went in the bin when she grew ears: it
   sliced straight through them, and the ears already say she isn't a
   visitor, which was the only job the halo had.

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
const CHASE = 1.35;            // m/s crossing to a new post — a shade under walking pace
const NOTICE = 2.6;            // how close before she looks up
const ROAM = 0.55;             // how far from her post she'll drift
const STUCK = 1.6;             // seconds of getting nowhere before she gives up walking
const BLINK = 9;               // beyond this she doesn't even try to walk it
const YIELD = 1.15;            // come inside this and she gives you the floor
const GIVE = 1.9;              // m/s she backs off at — faster than you close on her
const ARRIVED = 0.35;          // near enough to her post to call it standing there

export class Guide {
  constructor(scene, home, fx = {}) {
    this.home = { x: home.x, z: home.z, yaw: home.yaw || 0 };
    this.name = home.name || "guide";   // the caller names her; this file is just a body
    this.form = home.form || "person";  // person | head | bat | shard
    this.fx = fx;

    this.grp = new THREE.Group();
    this._build();
    scene.add(this.grp);

    // an invisible box you can actually click — same trick as the bartender,
    // since a glow blob with additive blending is a terrible raycast target
    const [hw, hh, hy] = this.hit;      // set by whichever form was built
    this.hitY = hy;
    this.hitMesh = new THREE.Mesh(
      new THREE.BoxGeometry(hw, hh, hw),
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
    this.stuckT = 0;             // how long she's been walking without getting closer
    this.lastD = Infinity;       // distance to you last frame, for that check
    this.popT = 0;               // the flare after a blink, so it isn't a silent jump cut
    this.lvl = 0;                // smoothed loudness, 0..1, drives mouth and glow
    this._apply(0);
  }

  /* she goes where you go. one step of movement toward (tx,tz) with the same
     axis-slide the player has in controls.js: try the whole step, and if the
     room says no, keep whichever single axis still works. that's what gets her
     along a wall and through a doorway without any pathfinding. */
  _step(dt, tx, tz, speed) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) return 0;
    const sx = (dx / d) * speed * dt, sz = (dz / d) * speed * dt;
    const ok = this.fx.walkable || (() => true);
    if (ok(this.pos.x + sx, this.pos.z + sz)) { this.pos.x += sx; this.pos.z += sz; return d; }
    if (ok(this.pos.x + sx, this.pos.z)) { this.pos.x += sx; return d; }
    if (ok(this.pos.x, this.pos.z + sz)) { this.pos.z += sz; return d; }
    return d;                    // wedged — the stuck clock deals with it
  }

  /* when walking won't do it — she's wedged behind furniture, or her post is
     suddenly 40 m away because you took the lift — she just appears there.
     she's a ghost; a blink costs nothing and beats watching her grind into a
     wall forever. the exact spot first, then a widening ring, so she never
     lands inside geometry.

     it does NOT move her post any more. the post is the thing she's trying to
     REACH, and rewriting it here is exactly how she used to end up living
     wherever she happened to give up. */
  _blinkTo(tx, tz) {
    const ok = this.fx.walkable || (() => true);
    const land = (x, z) => {
      this.pos.x = x; this.pos.z = z;
      this.stuckT = 0; this.lastD = Infinity; this.popT = 0.5;
      return true;
    };
    if (ok(tx, tz)) return land(tx, tz);
    for (const r of [0.6, 1.1, 1.7]) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + this.bob;
        const x = tx + Math.cos(a) * r, z = tz + Math.sin(a) * r;
        if (ok(x, z)) return land(x, z);
      }
    }
    return false;
  }

  /* Move her post. This is the ONLY reason she ever travels — the room calls
     it when you cross into a space she has a spot in, and she goes and stands
     in that spot. She does not shadow you around a room; see the tick. */
  relocate(x, z, yaw) {
    if (Math.hypot(x - this.home.x, z - this.home.z) < 0.05) return;
    this.home.x = x; this.home.z = z;
    if (typeof yaw === "number") this.home.yaw = yaw;
    this.stuckT = 0; this.lastD = Infinity;
    this.target = null;
  }

  _build() {
    const coat = (color, opacity) => new THREE.MeshBasicMaterial({
      color, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const big = this.form !== "person";   // more surface = more additive light
    const auraMat = coat(AURA, big ? 0.15 : 0.2), coreMat = coat(CORE, big ? 0.22 : 0.34);
    this.mat = auraMat; this.coreMat = coreMat;
    this.coat = coat;
    this._formStep = () => {};        // forms with moving parts replace this

    const form = this[`_form_${this.form}`] || this._form_person;
    form.call(this, auraMat, coreMat);

    /* The visor. On the standing figure the face works because it's a small
       bright thing on a dim head. On the bigger floating shapes it vanished:
       an additive face drawn over an additive core is bright-on-bright, and
       there's no contrast left to make eyes out of. So those forms get a dark
       plate behind the face — NORMAL blending, not additive, the one thing in
       here allowed to subtract — and the face reads as a lit screen on it. */
    if (this.visorR) {
      const visor = new THREE.Mesh(
        new THREE.CircleGeometry(this.visorR, 24),
        new THREE.MeshBasicMaterial({ color: 0x05101c, transparent: true, opacity: 0.82, depthWrite: false }));
      visor.scale.y = 0.82;
      visor.position.set(0, 0, this.faceZ - 0.006);
      visor.renderOrder = 13;
      this.headGrp.add(visor);
    }

    this.face = makeFace(this.faceSize, "#bfefff");
    this.face.mesh.position.set(0, 0, this.faceZ);
    this.headGrp.add(this.face.mesh);
    this.grp.add(this.headGrp);

    // the halo: a thin ring that turns slowly overhead. the one thing that
    // says "the room made her" — visitors don't come with these.
    if (this.haloR) {
      this.halo = new THREE.Mesh(new THREE.TorusGeometry(this.haloR, 0.008, 6, 28), coat(CORE, 0.75));
      this.halo.rotation.x = Math.PI / 2;
      this.halo.position.y = this.haloY;
      this.grp.add(this.halo);
    }

    this.grp.add(this._tag(this.name));
    this._buildPanel();
  }

  /* ---------- the forms ----------
     Each one sets headGrp (carries the face and does the nodding), an eyeY
     so the card and the tag sit at the right height whatever the shape is,
     and optionally a body for the breathing bob. Anything that moves on its
     own hangs off _formStep. */

  // the original: a standing figure, the same glow-blob a visitor is
  _form_person(aura, core) {
    this.body = new THREE.Group();
    this.body.position.y = 0.78;
    this.body.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.72, 6, 14), aura));
    this.body.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.145, 0.6, 6, 12), core));
    this.grp.add(this.body);
    this.headGrp = new THREE.Group();
    this.headGrp.position.y = 1.46;
    this.headGrp.add(new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 12), aura));
    this.headGrp.add(new THREE.Mesh(new THREE.SphereGeometry(0.108, 12, 10), core));
    Object.assign(this, { eyeY: 1.46, faceSize: 0.26, faceZ: 0.135, haloR: 0.15, haloY: 1.74, hit: [0.72, 1.5, 0.95] });
  }

  // no body at all: a head at eye height with the wisp of one trailing off
  // under it, and three motes going round. reads as something the room is
  // projecting rather than somebody standing in it.
  _form_head(aura, core) {
    this.headGrp = new THREE.Group();
    this.headGrp.position.y = 1.45;
    this.headGrp.add(new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 14), aura));
    this.headGrp.add(new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), core));
    // the tail: a cone hanging under her, wide end up, fading into nothing
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.62, 14, 1, true), this.coat(0x2a7dff, 0.26));
    tail.position.y = -0.3; tail.rotation.x = Math.PI;
    this.headGrp.add(tail);
    // three motes on their own little orbits
    const motes = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), this.coat(CORE, 1));
      m.userData.a = (i / 3) * Math.PI * 2;
      m.userData.r = 0.36 + i * 0.05;
      m.userData.sp = 0.7 + i * 0.22;
      m.userData.yy = -0.05 + i * 0.09;
      motes.add(m);
    }
    this.headGrp.add(motes);
    this._formStep = (t) => {
      for (const m of motes.children) {
        const a = m.userData.a + t * m.userData.sp;
        m.position.set(Math.cos(a) * m.userData.r, m.userData.yy + Math.sin(t * 1.3 + m.userData.a) * 0.04, Math.sin(a) * m.userData.r);
      }
      tail.scale.y = 1 + Math.sin(t * 1.7) * 0.12;
    };
    Object.assign(this, { eyeY: 1.45, faceSize: 0.34, faceZ: 0.235, visorR: 0.17, haloR: 0.3, haloY: 1.83, hit: [0.6, 0.8, 1.45] });
  }

  // a small round bat, hovering. big ears, big eyes, wings that actually
  // beat. the cute one — and a bat belongs in a room this nocturnal.
  _form_bat(aura, core) {
    this.headGrp = new THREE.Group();
    this.headGrp.position.y = 1.4;
    this.headGrp.add(new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 13), aura));
    this.headGrp.add(new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 11), core));

    /* Ears. The first pair were additive cones and they simply weren't there
       against a sunlit wall — the same bright-on-bright problem the face had.
       So they're built the way the visor is: a DARK flat shape that holds its
       silhouette in any light, with a lit inner ear glowing inside it. Flat
       plates rather than cones because she always turns to face you, so the
       one angle they're seen from is the one that matters, and a rounded
       triangle reads as "bat" far better than a cone does. */
    const earShape = (w, h) => {
      const sh = new THREE.Shape();
      sh.moveTo(-w, 0);
      sh.quadraticCurveTo(-w * 0.95, h * 0.62, -w * 0.16, h);   // outer edge up to the tip
      sh.quadraticCurveTo(w * 0.2, h * 0.99, w * 0.62, h * 0.5); // over the rounded tip
      sh.quadraticCurveTo(w * 0.9, h * 0.16, w, 0);              // inner edge back down
      sh.quadraticCurveTo(0, -h * 0.12, -w, 0);                  // and across the base
      return new THREE.ShapeGeometry(sh, 14);
    };
    const earDark = new THREE.MeshBasicMaterial({ color: 0x05101c, transparent: true, opacity: 0.86, depthWrite: false });
    const outerEar = earShape(0.068, 0.19), innerEar = earShape(0.035, 0.115);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(outerEar, earDark);
      ear.position.set(s * 0.108, 0.145, 0.015);
      ear.rotation.z = s * -0.3;
      ear.renderOrder = 12;
      this.headGrp.add(ear);
      const inner = new THREE.Mesh(innerEar, this.coat(0x9fe4ff, 0.8));
      inner.position.set(s * 0.111, 0.168, 0.021);
      inner.rotation.z = s * -0.3;
      inner.renderOrder = 13;
      this.headGrp.add(inner);
    }

    // wings: the classic scalloped membrane, built once and mirrored
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.quadraticCurveTo(0.18, 0.12, 0.34, 0.06);
    wingShape.quadraticCurveTo(0.28, 0.0, 0.33, -0.06);
    wingShape.quadraticCurveTo(0.22, -0.03, 0.2, -0.12);
    wingShape.quadraticCurveTo(0.12, -0.04, 0.06, -0.11);
    wingShape.quadraticCurveTo(0.03, -0.05, 0, 0);
    const wingGeo = new THREE.ShapeGeometry(wingShape);
    this.wings = [];
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(wingGeo, this.coat(0x2f8cff, 0.72));
      w.scale.x = s;
      w.scale.setScalar(1.35); w.scale.x *= s; w.position.set(s * 0.18, 0.03, -0.02);
      this.headGrp.add(w);
      this.wings.push(w);
    }
    this._formStep = (t, talking) => {
      // a slow hover beat that quickens while she's speaking
      const beat = Math.sin(t * (talking ? 9 : 5.5));
      this.wings[0].rotation.y = -0.5 - beat * 0.5;
      this.wings[1].rotation.y = 0.5 + beat * 0.5;
      for (const w of this.wings) w.rotation.z = beat * 0.12;
    };
    Object.assign(this, { eyeY: 1.4, faceSize: 0.26, faceZ: 0.2, visorR: 0.135, haloR: 0, haloY: 1.78, hit: [0.78, 0.85, 1.4] });
  }

  // no face-of-a-creature at all: a turning solid with shards in orbit.
  // the room's own intelligence, wearing geometry instead of a body.
  _form_shard(aura, core) {
    this.headGrp = new THREE.Group();
    this.headGrp.position.y = 1.42;
    this.solid = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), this.coat(CORE, 0.34));
    this.headGrp.add(this.solid);
    this.headGrp.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), aura));
    const shards = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const sh = new THREE.Mesh(new THREE.TetrahedronGeometry(0.075 + (i % 2) * 0.03), this.coat(CORE, 0.95));
      sh.userData.a = (i / 5) * Math.PI * 2;
      sh.userData.r = 0.42 + (i % 3) * 0.06;
      sh.userData.sp = 0.5 + (i % 3) * 0.18;
      sh.userData.tilt = (i - 2) * 0.1;
      shards.add(sh);
    }
    this.headGrp.add(shards);
    this._formStep = (t, talking) => {
      // the solid turns on its own axis; the shards ride wider, slower rings
      this.solid.rotation.y = t * 0.35;
      this.solid.rotation.x = Math.sin(t * 0.4) * 0.25;
      for (const sh of shards.children) {
        const a = sh.userData.a + t * sh.userData.sp * (talking ? 1.9 : 1);
        sh.position.set(Math.cos(a) * sh.userData.r, sh.userData.tilt + Math.sin(a * 2) * 0.05, Math.sin(a) * sh.userData.r);
        sh.rotation.set(a, a * 1.4, 0);
      }
    };
    Object.assign(this, { eyeY: 1.42, faceSize: 0.3, faceZ: 0.235, visorR: 0.15, haloR: 0.34, haloY: 1.82, hit: [0.7, 0.85, 1.42] });
  }

  /* Her words, in the room instead of on the glass.

     A DOM toast is invisible inside a WebXR session — that's the whole
     reason vrBlocked() exists — so anything she says only reaches a headset
     if it's actual geometry. This is a canvas on a plane, parented to her
     group at local +z: she already turns to face you whenever you're near,
     so it faces you too, and there's no billboard math to run per frame.

     It hangs beside her head rather than over it. Over it and she's talking
     out of the top of her skull; beside it, you can read the words and still
     watch her mouth move. */
  _buildPanel() {
    /* The card is a FALLBACK now, not the default. Once she had a real
       recorded voice, printing the same words beside her head was reading
       out a subtitle to someone who can already hear it — and it ate the
       room you're trying to look at. So it only appears when there's no
       audible voice at all: no rendered clips AND no browser synth, which
       is the case where she'd otherwise mime silently at you.

       Checked live rather than once at boot, so a device that gets its
       voice late still loses the card on the next line. */
    this.wantPanel = () => (this.fx.silent ? this.fx.silent() : false);
    const W = 768, H = 432;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    this.panelCanvas = c;
    this.panelTex = new THREE.CanvasTexture(c);
    this.panelTex.colorSpace = THREE.SRGBColorSpace;
    this.panelTex.anisotropy = 4;
    this.panel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.04, 0.58),
      new THREE.MeshBasicMaterial({ map: this.panelTex, transparent: true, opacity: 0, depthWrite: false }));
    // clear of her head, not over it: the card is 1.04 wide, so its inner edge
    // has to start past her shoulder or she's talking through the back of it
    this.panel.position.set(1.02, this.eyeY, 0.1);
    this.panel.rotation.y = -0.26;        // angled in toward you, like she's holding it
    this.panel.renderOrder = 15;
    this.panel.visible = false;
    this.grp.add(this.panel);
    this.panelOp = 0;
  }

  // draw a line onto the panel, wrapped, shrinking the type if it runs long
  _drawPanel(text) {
    const c = this.panelCanvas, g = c.getContext("2d"), W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    // the card: dark glass with her own blue on the edge
    const r = 26;
    g.beginPath();
    g.moveTo(r, 0); g.arcTo(W, 0, W, H, r); g.arcTo(W, H, 0, H, r);
    g.arcTo(0, H, 0, 0, r); g.arcTo(0, 0, W, 0, r); g.closePath();
    g.fillStyle = "rgba(6,12,22,0.82)"; g.fill();
    g.lineWidth = 3; g.strokeStyle = "rgba(53,166,255,0.75)"; g.stroke();

    const PAD = 40, maxW = W - PAD * 2;
    // try sizes until the whole line fits in the card
    let size = 46, lines = [];
    for (; size >= 26; size -= 3) {
      g.font = `500 ${size}px Archivo, sans-serif`;
      lines = [];
      let cur = "";
      for (const word of String(text).split(/\s+/)) {
        const t = cur ? cur + " " + word : word;
        if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = word; } else cur = t;
      }
      if (cur) lines.push(cur);
      if (lines.length * (size * 1.32) <= H - PAD * 2 - 34) break;
    }
    // her name across the top, small, so it's clear who's speaking
    g.font = "700 24px Archivo, sans-serif";
    g.fillStyle = "rgba(120,205,255,0.9)";
    g.textAlign = "left"; g.textBaseline = "top";
    g.fillText(this.name.toUpperCase(), PAD, 26);

    g.font = `500 ${size}px Archivo, sans-serif`;
    g.fillStyle = "#eaf6ff";
    const lh = size * 1.32;
    let y = 26 + 34 + (H - PAD - 60 - lines.length * lh) / 2;
    for (const ln of lines) { g.fillText(ln, PAD, y); y += lh; }
    this.panelTex.needsUpdate = true;
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
    this.tagMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.62 });
    const sp = new THREE.Sprite(this.tagMat);
    sp.scale.set(1.0, 0.25, 1);
    sp.position.y = this.eyeY + 0.46;
    return sp;
  }

  /* ---------- what she does ---------- */

  // say a line out loud. the actual speaking belongs to whoever wired
  // fx.say (say.js today); this just runs the mouth and the nod.
  speak(text, clip) {
    this.lastLine = text;      // the card is a canvas, so this is how a test reads her
    this.nodT = 0.4;
    this._drawPanel(text);
    const ms = this.fx.say?.(text, clip);
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

    const dist = playerPose ? Math.hypot(playerPose.x - this.pos.x, playerPose.z - this.pos.z) : Infinity;
    const near = dist < NOTICE;

    /* SHE DOES NOT FOLLOW YOU. She used to: past two metres she'd give up her
       post and come after you, and wherever she stopped became the new post.
       That solved the real problem — a guide bolted to one tile of the bedroom
       is no use the moment you walk into the arcade — and created a worse one.
       She was on your heels everywhere, which means she was in the way
       everywhere: between you and the wall you were reading, between you and
       the cabinet you were playing.

       So the fix keeps the half that mattered and drops the half that didn't.
       She has a POST per room, and the room tells her which one (relocate) when
       you cross over. She walks to that post and she stands there. Inside a
       room she never moves toward you at all — you come to her, which is how
       it works with a person standing in a doorway you want to ask something.

       Three things she still does, in this order, because each outranks the
       one under it. */
    const hd = Math.hypot(this.home.x - this.pos.x, this.home.z - this.pos.z);

    if (playerPose && dist < YIELD) {
      /* One: personal space. Walk into her and SHE is the one who moves —
         straight away from you, through the same axis-slide as everything
         else, so she gives ground along a wall instead of into it. This is
         what "in the way" actually meant, and it's the only motion of hers
         you can cause. She wanders back to her post the moment you step off
         her, because the post never moved. */
      this.state = "yield";
      this.target = null;
      this.stuckT = 0; this.lastD = Infinity;
      const ax = (this.pos.x - playerPose.x) / Math.max(dist, 1e-3);
      const az = (this.pos.z - playerPose.z) / Math.max(dist, 1e-3);
      this._step(dt, this.pos.x + ax, this.pos.z + az, GIVE);
      if (!this.greeted) { this.greeted = true; this.nodT = 0.5; this.fx.greet?.(); }
    } else if (hd > ARRIVED) {
      /* Two: she's not where she's meant to be — you changed rooms, or you
         just finished shoving her across the floor. She goes to the POST, not
         to you. Same doorway steering as before: aiming at a spot on the far
         side of a wall only ever finds wall, and fx.waypoint knows the room's
         shape where this file doesn't. */
      this.state = "travel";
      this.target = null;
      if (hd > BLINK) {
        this._blinkTo(this.home.x, this.home.z);       // you took the lift
      } else {
        const wp = this.fx.waypoint?.(this.pos.x, this.pos.z, this.home.x, this.home.z);
        const tx = wp ? wp.x : this.home.x, tz = wp ? wp.z : this.home.z;
        this._step(dt, tx, tz, CHASE);
        // did that get her anywhere? measured against whatever she's currently
        // AIMED at — against the post it would read as stuck every time she
        // walks to a doorway that happens to be away from it
        const now = Math.hypot(tx - this.pos.x, tz - this.pos.z);
        this.stuckT = (now < this.lastD - 0.004) ? 0 : this.stuckT + dt;
        this.lastD = now;
        if (this.stuckT > STUCK) this._blinkTo(this.home.x, this.home.z);
      }
    } else if (near) {
      this.stuckT = 0; this.lastD = Infinity;
      if (this.state !== "attend") { this.state = "attend"; this.target = null; }
      if (!this.greeted) {
        this.greeted = true;
        this.nodT = 0.5;
        this.fx.greet?.();
      }
    } else {
      this.greeted = false;
      if (this.state === "attend" || this.state === "yield" || this.state === "travel") { this.state = "idle"; this.timer = rand(0.4, 1.2); }
      if (this.state === "walk" && this.target) {
        const d = this._step(dt, this.target.x, this.target.z, WALK);
        if (d < 0.05 || this.timer <= 0) { this.state = "idle"; this.timer = rand(0.6, 1.4); this.target = null; }
      } else if (this.timer <= 0) {
        this._pick();
      }
    }

    // facing: a thing she was told to look at wins, then you, then her post
    let want = this.home.yaw;
    if (this.gaze) want = Math.atan2(this.gaze.x - this.pos.x, this.gaze.z - this.pos.z);
    else if (playerPose && (near || this.state === "yield")) want = Math.atan2(playerPose.x - this.pos.x, playerPose.z - this.pos.z);
    else if (this.state === "travel") want = Math.atan2(this.home.x - this.pos.x, this.home.z - this.pos.z);
    else if (this.state === "walk" && this.target) want = Math.atan2(this.target.x - this.pos.x, this.target.z - this.pos.z);
    this.yaw = this._turn(this.yaw, want, dt * 5);

    // the mouth: a real voice if there is one, the fallback clock if not
    this.nodT = Math.max(0, this.nodT - dt);
    this.talkT = Math.max(0, this.talkT - dt);
    this.popT = Math.max(0, this.popT - dt);
    // two different questions. "is a line in the air" keeps the card up and
    // the glow lifted through the whole sentence; "is she making a noise right
    // now" runs the mouth, so it shuts on every comma instead of buzzing
    // straight through the punctuation.
    const voiced = this.fx.speaking ? this.fx.speaking() : false;
    const sounding = this.fx.voicing ? this.fx.voicing() : voiced;
    const talking = voiced || this.talkT > 0;
    const mouthing = this.fx.voicing ? sounding : talking;
    /* How loud she is this instant. Playing a real recording we can MEASURE
       it (fx.level reads an analyser on the clip), so she lands on her own
       stressed words. The browser synth gives us nothing to measure and
       reports -1, and that path keeps the old oscillator. */
    const lvl = mouthing ? (this.fx.level ? this.fx.level() : -1) : 0;
    this.lvl += ((lvl >= 0 ? lvl : 0) - this.lvl) * 0.35;
    this.blinkFor -= dt;
    if (this.blinkFor <= 0) {
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) { this.blinkFor = 0.12; this.blinkIn = rand(2.5, 6); }
    }
    // two sines at odd rates, so the flap has syllables in it rather than
    // running like a metronome — a steady buzz is the thing that reads as fake
    const mouth = !mouthing ? 0
      : lvl >= 0
        // measured: the mouth IS the waveform, floored so it never looks shut
        // mid-word and capped so a loud consonant doesn't gape
        ? Math.min(1, 0.16 + this.lvl * 1.15)
        // guessed: two sines at odd rates, so it has syllables in it rather
        // than ticking like a metronome
        : 0.2 + Math.abs(Math.sin(t * 10.5)) * (0.55 + Math.abs(Math.sin(t * 3.1)) * 0.25);
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
    // a form with no legs floats, so it gets a deeper, slower bob than a
    // figure standing on the carpet does
    const floating = this.form !== "person";
    const lift = Math.sin(t * (floating ? 1.15 : 1.6) + this.bob) * (floating ? 0.055 : 0.028);
    if (this.body) this.body.position.y = 0.78 + lift;
    this.headGrp.position.y = this.eyeY + lift;
    this._formStep(t, !!talking);
    // the halo turns always and tips a little as she breathes
    if (this.halo) {
      this.halo.position.y = this.haloY + lift * 1.4;
      this.halo.rotation.z = t * 0.6;
      this.halo.rotation.x = Math.PI / 2 + Math.sin(t * 0.9) * 0.09;
    }
    // she brightens while she's talking — same idea as the mic-reactive
    // player glow, except her "level" is whether a line is in the air
    // a blink shouldn't be a jump cut — she flares for half a second where she
    // lands, so your eye is told something arrived rather than just noticing
    // she's suddenly elsewhere
    // the card fades with the voice, and hides outright once it's clear —
    // an invisible plane still costs a draw call and still catches a raycast
    const wantPanel = (talking && this.wantPanel()) ? 1 : 0;
    this.panelOp += (wantPanel - this.panelOp) * (talking ? 0.22 : 0.08);
    this.panel.material.opacity = this.panelOp;
    this.panel.visible = this.panelOp > 0.01;

    const pop = this.popT > 0 ? this.popT / 0.5 : 0;
    /* She glows WITH the words. A flat "brighter while talking" reads as a
       light switch; riding the envelope reads as a voice. The base lift is
       kept so quiet passages still show she's the one speaking. */
    const say = talking ? 0.06 + this.lvl * 0.34 : 0;
    const targetOp = 0.2 + say * 0.55 + pop * 0.45;
    this.mat.opacity += (targetOp - this.mat.opacity) * 0.3;
    const targetCore = 0.34 + say * 0.9 + pop * 0.5;
    this.coreMat.opacity += (targetCore - this.coreMat.opacity) * 0.3;
    // and the name over her head lifts with it, so it reads as HER speaking
    if (this.tagMat) this.tagMat.opacity = 0.62 + say * 1.1 + pop * 0.3;
    // the wings beat a touch wider on the loud parts
    if (this.wings) for (const w of this.wings) w.scale.z = 1 + this.lvl * 0.12;
    this.headGrp.rotation.x = this.nodT > 0 ? Math.sin((0.5 - this.nodT) / 0.5 * Math.PI) * 0.3 : 0;
    this.hitMesh.position.set(this.pos.x, this.hitY, this.pos.z);
  }
}
