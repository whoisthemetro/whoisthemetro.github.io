/* ============================================================
   THE METRO — VR (WebXR, phase one)

   Walk the bedroom in a headset: left stick strolls (head-relative,
   with the room's real collision), right stick snap-turns 30°, either
   trigger fires the same click dispatch the crosshair uses — via a
   laser from the controller instead of the screen centre.

   Phase-one rules: DOM overlays don't exist inside a session, so
   main.js filters interactions down to the physical stuff (drums,
   piano, cat, blinds…). Writing on the wall stays a flat-screen act.
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

    // --- sticks (xr-standard mapping: thumbstick on axes 2/3) ---
    let mx = 0, mz = 0, turn = 0;
    for (const src of session.inputSources) {
      const gp = src.gamepad;
      if (!gp) continue;
      const ax = gp.axes.length >= 4 ? gp.axes[2] : (gp.axes[0] || 0);
      const ay = gp.axes.length >= 4 ? gp.axes[3] : (gp.axes[1] || 0);
      if (src.handedness === "left") { mx = ax; mz = ay; }
      else if (src.handedness === "right") turn = ax;
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
      const step = SPEED * dt;
      // stick up is -1 in xr-standard, so forward is -mz
      const dx = (right.x * mx - fwd.x * mz) * step;
      const dz = (right.z * mx - fwd.z * mz) * step;
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
  };
}
