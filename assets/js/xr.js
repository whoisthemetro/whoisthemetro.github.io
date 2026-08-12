/* ============================================================
   THE METRO — VR (WebXR, phase one)

   Walk the bedroom in a headset: left stick strolls (head-relative,
   with the room's real collision), right stick snap-turns 30°, either
   trigger fires the same click dispatch the crosshair uses — via a
   laser from the controller instead of the screen centre.

   DOM overlays don't exist inside a session, so this module also owns a
   small in-world HUD (toasts + aim tips) and main.js redirects anything
   that would open an overlay to it instead of silently freezing.
   ============================================================ */

import * as THREE from "three";

const SNAP = Math.PI / 6;        // 30° per flick — the comfort standard
const SPEED = 2.2;               // m/s, gentler than desktop walking
const DEAD = 0.15;               // stick deadzone

export function setupXR({ renderer, camera, scene, controls, world, onSelect, canEnter = () => true, zerogDisc = null, onTalk = null, arcade = null }) {
  if (!("xr" in navigator)) return { presenting: () => false, tick() {}, showButton() {} };

  renderer.xr.enabled = true;

  // the rig is your body: the headset poses the camera INSIDE it, the
  // sticks move it. it only owns the camera while a session runs.
  const rig = new THREE.Group();
  scene.add(rig);

  // lasers on both hands — either one can point and click
  const controllers = [];
  for (let i = 0; i < 2; i++) {
    const c = renderer.xr.getController(i);
    const beam = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -4)]),
      new THREE.LineBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.6 }));
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffb347 }));
    c.add(beam, tip);
    c.visible = false;   // lasers exist only inside a session
    c.addEventListener("select", () => { if (renderer.xr.isPresenting) onSelect(c); });
    rig.add(c);
    controllers.push(c);
  }

  /* --- the wrist HUD ---
     toasts and aim tips are DOM, and DOM does not exist inside a session.
     rather than hang them in the middle of your view, the headset wears
     them on the off hand: raise your wrist to read, drop it and the room
     is unobstructed. it's a child of a CONTROLLER, which only joins the
     scene graph while a session runs — so the flat screen pays nothing. */
  const hudCanvas = document.createElement("canvas");
  hudCanvas.width = 768; hudCanvas.height = 200;
  const hg = hudCanvas.getContext("2d");
  const hudTex = new THREE.CanvasTexture(hudCanvas);
  hudTex.colorSpace = THREE.SRGBColorSpace;
  const hud = new THREE.Mesh(
    new THREE.PlaneGeometry(0.20, 0.052),
    new THREE.MeshBasicMaterial({ map: hudTex, transparent: true, depthTest: false }));
  // worn on the wrist, not floating in the middle of your view: tilted to
  // face up and back toward your eyes, the way you'd read a watch
  hud.position.set(0, 0.05, 0.055);
  hud.rotation.set(-1.15, 0, 0);
  hud.renderOrder = 999;
  hud.visible = false;
  const hudHolder = new THREE.Group();
  hudHolder.add(hud);
  controllers[0].add(hudHolder);   // moves to the off hand once we know which is which

  let tipText = "", noteText = "", noteUntil = 0;
  function paintHud() {
    hg.clearRect(0, 0, 768, 200);
    const lines = [];
    if (noteText) lines.push([noteText, "#ffd9a0"]);
    if (tipText) lines.push([tipText, "#7ec97e"]);
    if (!lines.length) { hud.visible = false; hudTex.needsUpdate = true; return; }
    hg.fillStyle = "rgba(8,11,14,0.8)";
    hg.fillRect(6, 6, 756, 188);
    hg.strokeStyle = "rgba(255,179,71,0.4)";
    hg.lineWidth = 4;
    hg.strokeRect(6, 6, 756, 188);
    hg.textAlign = "center"; hg.textBaseline = "middle";
    // big for its canvas: this ends up ~20cm wide read at arm's length
    hg.font = "600 46px ui-monospace, Menlo, Consolas, monospace";
    lines.forEach(([txt, col], i) => {
      hg.fillStyle = col;
      hg.fillText(txt, 384, lines.length === 1 ? 100 : 66 + i * 68, 712);
    });
    hud.visible = true;
    hudTex.needsUpdate = true;
  }
  function note(msg) {
    noteText = msg || "";
    noteUntil = performance.now() + 3600;
    paintHud();
  }
  function tip(msg) {
    msg = msg || "";
    if (msg === tipText) return;      // don't repaint a canvas for nothing
    tipText = msg;
    paintHud();
  }

  let primary = null;
  // what we last pushed into controls.pos — lets us notice when the WORLD
  // moves the body instead (a lift ride, a room jump) and follow it
  let wroteX = NaN, wroteZ = NaN;
  let snapReady = true;
  const headWorld = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  renderer.xr.addEventListener("sessionstart", () => {
    // step into VR exactly where you were standing, facing the same way
    rig.position.set(controls.pos.x, 0, controls.pos.z);
    rig.rotation.y = controls.yaw;
    rig.add(camera);
    for (const c of controllers) c.visible = true;
    try { renderer.xr.setFoveation(1); } catch (e) {}
  });
  renderer.xr.addEventListener("sessionend", () => {
    rig.remove(camera);
    for (const c of controllers) c.visible = false;
    tipText = ""; noteText = ""; hud.visible = false;
    // hand the body back to the desktop controls where VR left it
    camera.position.set(controls.pos.x, 1.5, controls.pos.z);
    if (btn) btn.textContent = "[ enter vr ]";
  });

  // a controller quirk on unfamiliar hardware must never blank the headset —
  // if input handling throws, the frame still renders and you can still look
  // around. warns once so remote debugging can see it.
  let warned = false;
  function tick(dt) {
    try { step(dt); }
    catch (e) { if (!warned) { warned = true; console.warn("xr: input tick failed —", e); } }
  }

  /* ---------- zero-g: the Echo bindings, on real controllers ----------
     GRIP grabs whatever your hand is near — move the hand while holding
     and you drag yourself; let go and your last pull is your throw.
     A/X fire the wrist thruster on that hand, thrust pointing where the
     hand points. Clicking the LEFT stick is boost (a shove toward your
     gaze); holding the RIGHT stick click is the brake. The right stick's
     x-axis still snap-turns. Everything writes controls.vel/pos/flyY, so
     desktop peers see a VR flyer exactly like any other flyer. ---- */
  const handPrev = [null, null];       // last frame's PLAYSPACE pos per hand (the pull)
  const worldPrev = [null, null];      // last frame's WORLD pos per hand (the throw)
  const handVel = [new THREE.Vector3(), new THREE.Vector3()];   // smoothed world hand velocity
  // the last few RAW hand velocities per hand — a throw releases near the
  // peak of the swing, and smoothing alone under-reports the peak
  const velRing = [[], []];
  const gripHeld = [false, false];
  let discHand = -1;                   // which hand is holding the disc (-1: none)
  const pullVel = { x: 0, y: 0, z: 0 };
  let wasZeroG = false, boostCd = 0;
  const hw = new THREE.Vector3(), hq = new THREE.Quaternion(), hv = new THREE.Vector3();

  function stepZeroG(dt, session) {
    controls.stunT = Math.max(0, (controls.stunT || 0) - dt);
    const stunned = controls.stunT > 0;
    boostCd = Math.max(0, boostCd - dt);

    let turn = 0, thrusting = false, braking = false, anchored = -1;
    const srcs = session.inputSources;
    for (let i = 0; i < srcs.length; i++) {
      const src = srcs[i], gp = src.gamepad, ctl = controllers[i];
      if (!gp || !ctl) continue;
      const left = src.handedness === "left";
      if (!left) { turn = gp.axes.length >= 4 ? gp.axes[2] : 0; primary = ctl; }
      if (left && ctl && hudHolder.parent !== ctl) ctl.add(hudHolder);

      const btn = (n) => !!(gp.buttons[n] && gp.buttons[n].pressed);
      const squeeze = btn(1), ax = btn(4), stick = btn(3);
      ctl.getWorldPosition(hw);

      // the hand's WORLD velocity, smoothed over a few frames — it already
      // contains the body's motion, so it IS the physics of a throw
      const h0 = left ? 0 : 1;
      if (worldPrev[h0] && dt > 0) {
        hv.copy(hw).sub(worldPrev[h0]).divideScalar(dt);
        handVel[h0].lerp(hv, 0.4);
        const ring = velRing[h0];
        ring.push({ x: hv.x, y: hv.y, z: hv.z, m: hv.length() });
        if (ring.length > 8) ring.shift();
        worldPrev[h0].copy(hw);
      } else worldPrev[h0] = hw.clone();

      // --- the disc: Echo's rule exactly — it's yours only while the grip
      // is down. squeeze near it to take it; open your hand and whatever
      // your arm was doing becomes the throw (or the drop). ---
      if (zerogDisc) {
        if (squeeze && !stunned && discHand < 0 && zerogDisc.free()) {
          const dp = zerogDisc.pos();
          if (dp && Math.hypot(hw.x - dp.x, hw.y - dp.y, hw.z - dp.z) < 1.0) {
            discHand = h0;
            gripHeld[h0] = true;         // this grip is spoken for — not a wall grab
            zerogDisc.grab();
          }
        } else if (discHand === h0 && !squeeze) {
          discHand = -1;
          gripHeld[h0] = false;
          // the throw is the PEAK of the swing, not its average: take the
          // three fastest of the last eight frames. a lob leaves a lob, a
          // sling leaves a sling. capped only where tracking glitches live.
          const ring = velRing[h0].slice().sort((a, b) => b.m - a.m).slice(0, 3);
          const t = new THREE.Vector3();
          for (const r of ring) t.x += r.x / ring.length, t.y += r.y / ring.length, t.z += r.z / ring.length;
          t.multiplyScalar(1.3);
          const sp = t.length();
          if (sp > 18) t.multiplyScalar(18 / sp);
          zerogDisc.throwVec({ x: hw.x, y: hw.y, z: hw.z }, { x: t.x, y: t.y, z: t.z });
        }
      }

      // --- grab: hold GRIP near anything and your hand owns your body.
      // the pull is measured in PLAYSPACE space (ctl.position — the pose
      // three decodes from the headset), not world space: the rig chases
      // the body every frame, and a world-space hand would swallow its own
      // pull. local deltas rotate by the rig's yaw to face the room. ---
      const h = left ? 0 : 1;
      if (discHand === h) {
        // this hand is carrying the disc — it doesn't also hold walls
      } else if (squeeze && !stunned && world.arenaNearWall(hw.x, hw.y, hw.z, 1.3)) {
        if (!gripHeld[h]) { gripHeld[h] = true; handPrev[h] = ctl.position.clone(); controls.onGrab?.(); }
        else if (handPrev[h] && dt > 0) {
          hv.copy(ctl.position).sub(handPrev[h]).applyQuaternion(rig.quaternion);
          controls.pos.x -= hv.x; controls.flyY -= hv.y; controls.pos.z -= hv.z;
          // remember the pull as velocity — releasing turns it into a throw
          pullVel.x = -hv.x / dt; pullVel.y = -hv.y / dt; pullVel.z = -hv.z / dt;
          handPrev[h].copy(ctl.position);
          // hands beat drift: while holding, momentum is what your arm says
          controls.vel.x = 0; controls.vel.y = 0; controls.vel.z = 0;
        }
        anchored = h;
      } else if (gripHeld[h]) {
        gripHeld[h] = false; handPrev[h] = null;
        // the fling: your last pull — capped at echo's push-off speed
        let fx = pullVel.x * 1.15, fy = pullVel.y * 1.15, fz = pullVel.z * 1.15;
        const fm = Math.hypot(fx, fy, fz);
        if (fm > 5) { fx *= 5 / fm; fy *= 5 / fm; fz *= 5 / fm; }
        controls.vel.x = fx; controls.vel.y = fy; controls.vel.z = fz;
        controls.onFling?.();
      }

      // --- wrist thruster: A/X pushes along where that hand points ---
      if (ax && !stunned && anchored < 0) {
        ctl.getWorldQuaternion(hq);
        hv.set(0, 0, -1).applyQuaternion(hq);
        const ACC = 4.5;   // echo-feel: thrusters trim your vector, they don't launch you
        controls.vel.x += hv.x * ACC * dt;
        controls.vel.y += hv.y * ACC * dt;
        controls.vel.z += hv.z * ACC * dt;
        thrusting = true;
      }

      // --- stick clicks: left is boost, right is brake ---
      if (stick && !stunned) {
        if (left && boostCd === 0) {
          boostCd = 1.4;
          camera.getWorldDirection(hv);
          // echo's main booster: engages you at the 5 m/s cap, no more
          controls.vel.x += hv.x * 5; controls.vel.y += hv.y * 5; controls.vel.z += hv.z * 5;
          controls.onBoost?.();
        } else if (!left) braking = true;
      }
    }

    // snap turn still lives on the right stick's x — brake is the CLICK
    if (Math.abs(turn) > 0.6 && snapReady) {
      snapReady = false;
      camera.getWorldPosition(headWorld);
      rig.rotation.y += -Math.sign(turn) * SNAP;
      rig.updateMatrixWorld(true);
      const after = camera.getWorldPosition(new THREE.Vector3());
      rig.position.x += headWorld.x - after.x;
      rig.position.y += headWorld.y - after.y;
      rig.position.z += headWorld.z - after.z;
    } else if (Math.abs(turn) < 0.3) snapReady = true;

    if (braking) {
      const k = Math.pow(0.02, dt);
      controls.vel.x *= k; controls.vel.y *= k; controls.vel.z *= k;
    }

    // cap + integrate + clamp, the same numbers the desktop flyer obeys:
    // echo's self-propelled 5 m/s, 4.7 with the disc in hand
    const vmax = discHand >= 0 ? 4.7 : 5.0;
    const vm = Math.hypot(controls.vel.x, controls.vel.y, controls.vel.z);
    if (vm > vmax) { const sc = vmax / vm; controls.vel.x *= sc; controls.vel.y *= sc; controls.vel.z *= sc; }
    if (anchored < 0) {
      controls.pos.x += controls.vel.x * dt;
      controls.flyY += controls.vel.y * dt;
      controls.pos.z += controls.vel.z * dt;
    }
    if (controls.clampFn) {
      const pp = { x: controls.pos.x, y: controls.flyY, z: controls.pos.z };
      controls.clampFn(pp, controls.vel, 0.55);
      controls.pos.x = pp.x; controls.flyY = pp.y; controls.pos.z = pp.z;
    }
    controls.thrusting = thrusting;

    // carry the rig so the HEAD sits at the flyer's position — including Y,
    // which walking rooms never touch
    camera.getWorldPosition(headWorld);
    rig.position.x += controls.pos.x - headWorld.x;
    rig.position.y += controls.flyY - headWorld.y;
    rig.position.z += controls.pos.z - headWorld.z;

    camera.getWorldDirection(hv);
    controls.yaw = Math.atan2(-hv.x, -hv.z);
    controls.pitch = Math.asin(Math.max(-1, Math.min(1, hv.y)));
    wroteX = controls.pos.x; wroteZ = controls.pos.z;
    wasZeroG = true;
  }

  // a broken frame must never kill the animate loop — a dead loop IS the
  // "black screen". catch, report to the wrist (and console), carry on.
  let lastErrAt = 0;
  function step(dt, sessionOverride) {
    try {
      stepInner(dt, sessionOverride);
    } catch (e) {
      const now = performance.now();
      if (now - lastErrAt > 2000) {
        lastErrAt = now;
        console.error("xr step:", e);
        try { note("⚠ " + (e && e.message ? String(e.message).slice(0, 60) : "vr error")); } catch (e2) {}
      }
    }
  }
  let talkHeld = false;
  let arcadeGripPrev = false;
  function stepInner(dt, sessionOverride) {
    const session = sessionOverride || renderer.xr.getSession();
    if (!session) return;

    // push-to-talk on B or Y (either hand's top face button) — held, like
    // V on a keyboard. works in every room, walking or flying.
    if (onTalk) {
      let held = false;
      for (const src of session.inputSources) {
        const gp = src.gamepad;
        if (gp && gp.buttons[5] && gp.buttons[5].pressed) held = true;
      }
      if (held !== talkHeld) { talkHeld = held; onTalk(held); }
    }

    // --- a cabinet game is on the panel: the controllers ARE the cabinet.
    // left stick plays the arrows, A/X is the fire button, trigger is
    // start/enter, and a GRIP is walking away. nothing else moves. ---
    if (arcade && arcade.active()) {
      let lx = 0, ly = 0, fire = false, start = false, grip = false;
      for (const src of session.inputSources) {
        const gp = src.gamepad;
        if (!gp) continue;
        if (src.handedness === "left" && gp.axes.length >= 4) { lx = gp.axes[2]; ly = gp.axes[3]; }
        if (gp.buttons[4] && gp.buttons[4].pressed) fire = true;
        if (gp.buttons[0] && gp.buttons[0].pressed) start = true;
        if (gp.buttons[1] && gp.buttons[1].pressed) grip = true;
      }
      arcade.key("ArrowLeft", lx < -0.45);
      arcade.key("ArrowRight", lx > 0.45);
      arcade.key("ArrowUp", ly < -0.45);
      arcade.key("ArrowDown", ly > 0.45);
      arcade.key("Space", fire);
      arcade.key("Enter", start);
      if (grip && !arcadeGripPrev) arcade.close();
      arcadeGripPrev = grip;
      return;   // the room waits while you play
    }
    arcadeGripPrev = false;

    // the boat (3) and arena (4) live on light layers; the desktop camera
    // enables them once, but the XR EYE cameras are three's own and ship
    // with only their eye masks — without this the far rooms render as
    // pure black inside a headset. cheap, so it runs every frame.
    const xc = renderer.xr.getCamera();
    xc.layers.enable(3); xc.layers.enable(4);
    for (const c of xc.cameras) { c.layers.enable(3); c.layers.enable(4); }

    if (controls.zerog) return stepZeroG(dt, session);
    if (wasZeroG) {
      // back on solid ground: the rig's altitude belongs to the floor again
      wasZeroG = false;
      rig.position.y = 0;
      rig.updateMatrixWorld(true);
    }

    // --- sticks (xr-standard mapping: thumbstick on axes 2/3) ---
    let mx = 0, mz = 0, turn = 0;
    const srcs = session.inputSources;
    for (let i = 0; i < srcs.length; i++) {
      const src = srcs[i];
      const gp = src.gamepad;
      if (!gp) continue;
      const ax = gp.axes.length >= 4 ? gp.axes[2] : (gp.axes[0] || 0);
      const ay = gp.axes.length >= 4 ? gp.axes[3] : (gp.axes[1] || 0);
      if (src.handedness === "left") {
        mx = ax; mz = ay;
        // the screen rides the hand you don't point with
        if (controllers[i] && hudHolder.parent !== controllers[i]) controllers[i].add(hudHolder);
      } else if (src.handedness === "right") {
        turn = ax;
        if (controllers[i]) primary = controllers[i];
      }
    }

    // --- did something outside VR teleport us? bring the rig along ---
    if (Math.abs(controls.pos.x - wroteX) > 0.001 || Math.abs(controls.pos.z - wroteZ) > 0.001) {
      camera.getWorldPosition(headWorld);
      rig.position.x += controls.pos.x - headWorld.x;
      rig.position.z += controls.pos.z - headWorld.z;
      rig.updateMatrixWorld(true);
    }

    // --- snap turn, pivoting around the HEAD so the room doesn't slide ---
    if (Math.abs(turn) > 0.6 && snapReady) {
      snapReady = false;
      const a = -Math.sign(turn) * SNAP;
      camera.getWorldPosition(headWorld);
      rig.rotation.y += a;
      // keep the head planted: rotate the rig, then move it so the head
      // lands back where it was
      rig.updateMatrixWorld(true);
      const after = camera.getWorldPosition(new THREE.Vector3());
      rig.position.x += headWorld.x - after.x;
      rig.position.z += headWorld.z - after.z;
    } else if (Math.abs(turn) < 0.3) {
      snapReady = true;
    }

    // --- smooth locomotion, head-relative, with the room's collision.
    // the stick is an accelerator now: half tilt strolls, full tilt jogs,
    // and shoving it to the rim breaks into a run ---
    if (Math.abs(mx) > DEAD || Math.abs(mz) > DEAD) {
      camera.getWorldDirection(fwd);
      fwd.y = 0; fwd.normalize();
      right.crossVectors(fwd, UP);            // fwd × up = right
      const mag = Math.min(1, Math.hypot(mx, mz));
      const dist = SPEED * (0.4 + mag * (mag > 0.93 ? 1.5 : 0.8)) * dt;
      // stick up is -1 in xr-standard, so forward is -mz
      const dx = (right.x * mx - fwd.x * mz) * dist;
      const dz = (right.z * mx - fwd.z * mz) * dist;
      camera.getWorldPosition(headWorld);
      // axis-slide against the walkable floorplan, same rules as on foot
      let nx = headWorld.x + dx, nz = headWorld.z + dz;
      // same escape as on foot: standing somewhere illegal must not weld you there
      if (world.isWalkable(headWorld.x, headWorld.z)) {
        if (!world.isWalkable(nx, headWorld.z)) nx = headWorld.x;
        if (!world.isWalkable(nx, nz)) nz = headWorld.z;
      }
      rig.position.x += nx - headWorld.x;
      rig.position.z += nz - headWorld.z;
    }

    // the game (presence, cat, vacuum, analytics) tracks the HEAD, so
    // ghosts of VR visitors stand where the visitor actually stands
    camera.getWorldPosition(headWorld);
    controls.pos.x = headWorld.x;
    controls.pos.z = headWorld.z;
    camera.getWorldDirection(fwd);
    controls.yaw = Math.atan2(-fwd.x, -fwd.z);
    wroteX = controls.pos.x; wroteZ = controls.pos.z;
  }

  // --- the door into VR: a quiet terminal-style button ---
  let btn = null;
  async function showButton() {
    let ok = false;
    try { ok = await navigator.xr.isSessionSupported("immersive-vr"); } catch (e) {}
    if (!ok || btn) return;
    btn = document.createElement("button");
    btn.id = "vr-btn";
    btn.textContent = "[ enter vr ]";
    btn.addEventListener("click", async () => {
      if (renderer.xr.isPresenting) {
        renderer.xr.getSession()?.end();
        return;
      }
      if (!canEnter()) {
        btn.textContent = "[ walk home first ]";   // VR starts from the bedroom
        setTimeout(() => { btn.textContent = "[ enter vr ]"; }, 2000);
        return;
      }
      try {
        const session = await navigator.xr.requestSession("immersive-vr", {
          optionalFeatures: ["local-floor"],
        });
        await renderer.xr.setSession(session);
        btn.textContent = "[ exit vr ]";
      } catch (e) {
        btn.textContent = "[ vr failed ]";
        setTimeout(() => { btn.textContent = "[ enter vr ]"; }, 2000);
      }
    });
    document.body.appendChild(btn);
  }

  return {
    presenting: () => renderer.xr.isPresenting,
    tick,
    showButton,
    // rooms are separate places: crossing a door wipes the wrist clean
    clearHud: () => { noteText = ""; tipText = ""; paintHud(); },
    // while a hand carries the disc, the room should draw it at that hand
    discHand: () => {
      if (discHand < 0 || !controllers[discHand]) return null;
      controllers[discHand].getWorldPosition(hv);
      return { x: hv.x, y: hv.y, z: hv.z };
    },
    // test rig: lets a headless harness drive the REAL step with a fake
    // session — the only way to exercise VR code without a headset
    _debug: { step, rig, controllers },
    note,                                     // a transient message
    tip,                                      // what you're pointing at
    aimController: () => primary || controllers[0],
  };
}
