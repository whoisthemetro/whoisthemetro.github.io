/* ============================================================
   THE STUDIO — walking and pointing

   Pointer-lock first person, plus twin thumbsticks on touch. Deliberately
   thin: aiming is a ray out of the camera and nothing else, which is the
   same shape a controller ray has. When this room grows a WebXR mode, this
   is the only file that has to learn anything new.
   ============================================================ */

import * as THREE from "three";

const SPEED = 3.4;
const RUN = 5.6;
const EYE = 1.62;

export function makeControls(camera, dom, clampWalk) {
  const pos = new THREE.Vector3(0, EYE, 0);
  let yaw = 0, pitch = 0;
  const keys = new Set();
  let locked = false;

  // touch state
  let moveTouch = null, lookTouch = null;
  const stick = { x: 0, y: 0 };
  let lookDX = 0, lookDY = 0;

  /* ---------- mouse ---------- */

  function onMove(e) {
    if (!locked) return;
    yaw -= e.movementX * 0.0022;
    pitch -= e.movementY * 0.0022;
    pitch = Math.max(-1.35, Math.min(1.35, pitch));
  }

  document.addEventListener("pointerlockchange", () => {
    locked = document.pointerLockElement === dom;
    document.dispatchEvent(new CustomEvent("studio-lock", { detail: locked }));
  });
  document.addEventListener("mousemove", onMove);

  addEventListener("keydown", (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    keys.add(e.code);
  });
  addEventListener("keyup", (e) => keys.delete(e.code));
  addEventListener("blur", () => keys.clear());

  /* ---------- touch ---------- */

  if (matchMedia("(pointer: coarse)").matches) {
    dom.addEventListener("touchstart", (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth / 2 && moveTouch === null) moveTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
        else if (lookTouch === null) lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    }, { passive: true });
    dom.addEventListener("touchmove", (e) => {
      for (const t of e.changedTouches) {
        if (moveTouch && t.identifier === moveTouch.id) {
          stick.x = Math.max(-1, Math.min(1, (t.clientX - moveTouch.x) / 58));
          stick.y = Math.max(-1, Math.min(1, (t.clientY - moveTouch.y) / 58));
        } else if (lookTouch && t.identifier === lookTouch.id) {
          lookDX += t.clientX - lookTouch.x;
          lookDY += t.clientY - lookTouch.y;
          lookTouch.x = t.clientX; lookTouch.y = t.clientY;
        }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (moveTouch && t.identifier === moveTouch.id) { moveTouch = null; stick.x = stick.y = 0; }
        if (lookTouch && t.identifier === lookTouch.id) lookTouch = null;
      }
    };
    dom.addEventListener("touchend", end, { passive: true });
    dom.addEventListener("touchcancel", end, { passive: true });
  }

  /* ---------- step ---------- */

  function update(dt) {
    yaw -= lookDX * 0.0042;
    pitch -= lookDY * 0.0042;
    pitch = Math.max(-1.35, Math.min(1.35, pitch));
    lookDX = lookDY = 0;

    let fwd = 0, side = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) fwd += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) fwd -= 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) side -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) side += 1;
    fwd -= stick.y; side += stick.x;

    const len = Math.hypot(fwd, side);
    if (len > 1) { fwd /= len; side /= len; }

    const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? RUN : SPEED;
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const nx = pos.x + (-sin * fwd + cos * side) * speed * dt;
    const nz = pos.z + (-cos * fwd - sin * side) * speed * dt;

    const c = clampWalk(nx, nz);
    pos.x = c.x; pos.z = c.z;

    camera.position.copy(pos);
    camera.rotation.set(0, 0, 0);
    camera.rotateY(yaw);
    camera.rotateX(pitch);
  }

  return {
    update,
    locked: () => locked,
    // newer Chrome returns a promise here, and a rejected one surfaces as an
    // uncaught error (headless refuses the lock outright) — swallow both shapes
    lock: () => {
      try {
        const r = dom.requestPointerLock();
        if (r && typeof r.catch === "function") r.catch(() => {});
      } catch (e) {}
    },
    pose: () => ({ x: pos.x, y: 0, z: pos.z, yaw }),
    // for smoke tests: setting camera.rotation directly is pointless because
    // update() rewrites it from yaw/pitch on the very next frame
    place: (x, z, y = yaw, p = pitch) => { pos.x = x; pos.z = z; yaw = y; pitch = p; },
  };
}
