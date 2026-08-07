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

export function setupXR({ renderer, camera, scene, controls, world, onSelect, canEnter = () => true }) {
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

  function step(dt) {
    const session = renderer.xr.getSession();
    if (!session) return;

    // let the HUD note expire on its own
    if (noteText && performance.now() > noteUntil) { noteText = ""; paintHud(); }

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

    // --- smooth locomotion, head-relative, with the room's collision ---
    if (Math.abs(mx) > DEAD || Math.abs(mz) > DEAD) {
      camera.getWorldDirection(fwd);
      fwd.y = 0; fwd.normalize();
      right.crossVectors(fwd, UP);            // fwd × up = right
      const dist = SPEED * dt;
      // stick up is -1 in xr-standard, so forward is -mz
      const dx = (right.x * mx - fwd.x * mz) * dist;
      const dz = (right.z * mx - fwd.z * mz) * dist;
      camera.getWorldPosition(headWorld);
      // axis-slide against the walkable floorplan, same rules as on foot
      let nx = headWorld.x + dx, nz = headWorld.z + dz;
      if (!world.isWalkable(nx, headWorld.z)) nx = headWorld.x;
      if (!world.isWalkable(nx, nz)) nz = headWorld.z;
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
    note,                                     // a transient message
    tip,                                      // what you're pointing at
    aimController: () => primary || controllers[0],
  };
}
