/* ============================================================
   THE METRO — first-person controls
   desktop: pointer lock, WASD/arrows + mouse, shift to hurry
   mobile:  left joystick to walk, drag anywhere else to look,
            quick tap = interact
   ============================================================ */

import { clamp, IS_TOUCH } from "./util.js";

const EYE = 1.62;
const SPEED = 3.1;
// THE GYM — basketball is on foot but deliberately heavy: a slow base jog so you
// can't just stroll up and dunk, a sprint that burns a stamina meter (bursts,
// not a free run), and a real jump with gravity so peers see you leave the floor.
const GYM_SPEED = 1.7;        // base jog (≈0.55× normal walk)
const GYM_SPRINT = 1.95;      // sprint multiplier (≈ a touch over normal walk)
const GYM_G = 16;             // gravity (snappier than real for game-feel)
const GYM_JUMP_V = 5.9;       // launch speed → apex ≈1.1 m
const GYM_STAM_DRAIN = 1.6;   // seconds of full-sprint to empty the meter (a real burst, then it's gone)
const GYM_STAM_REGEN = 4.2;   // seconds to refill from empty

export class Controls {
  constructor(camera, canvas, bounds, walkable = null) {
    this.camera = camera;
    this.canvas = canvas;
    this.bounds = bounds;
    this.walkable = walkable;   // fn(x,z) — overrides bounds when provided
    // pool: the game owns the camera; we only collect aim rotation + the
    // power-charge button state
    this.pooling = false;
    this.poolRotate = 0;        // accumulated aim delta since last frame (game zeroes it)
    this.poolCharging = false;
    // 2-axis aim mode shared by darts + basketball (any stand-and-throw game):
    // the game owns the camera and reads these per-frame yaw/pitch deltas +
    // the charge button
    this.aiming = false;
    this.aimDX = 0;
    this.aimDY = 0;
    this.aimCharge = false;
    // primary button held (free-roam basketball reads this to wind up a shot);
    // on desktop it's the mouse button, on touch a dedicated SHOOT button sets it
    this.pointerDown = false;
    // on-foot basketball (THE GYM): jump + sprint stamina layered over the walk
    this.gym = false;
    this.gymY = 0;            // height above the floor (0 = grounded)
    this.vy = 0;              // vertical velocity while airborne
    this.grounded = true;
    this.stamina = 1;         // 0..1 sprint meter (HUD reads it)
    this.touchJump = false;   // mobile buttons set these; desktop uses keys
    this.touchSprint = false;
    this.holdingBall = false; // true while you carry the gym ball (blocks boost)
    this._jumpHeld = false;
    this._sprinting = false;
    // zero-g flight (THE CREW arena)
    this.zerog = false;
    this.arena = null;            // {x,y,z,hx,hy,hz} when flying
    this.vel = { x: 0, y: 0, z: 0 };
    this.flyY = 1.62;
    this.boostCd = 0;
    this.thrusting = false;
    this.enabled = false;
    this.yaw = 0;                // start facing the note wall
    this.pitch = 0;
    this.pos = { x: 0, z: 2.6 };
    this.keys = new Set();
    this.joy = { x: 0, y: 0, active: false, pid: null };
    this.actionFns = [];
    this.lockChangeFns = [];
    this._applyCamera();

    if (IS_TOUCH) this._bindTouch();
    else this._bindDesktop();
  }

  onAction(fn) { this.actionFns.push(fn); }        // fn(ndcX, ndcY)
  onLockChange(fn) { this.lockChangeFns.push(fn); }

  lock() {
    if (IS_TOUCH) {
      this.enabled = true;
      this.lockChangeFns.forEach(f => f(true));
    } else {
      this.canvas.requestPointerLock();
    }
  }
  unlock() {
    if (IS_TOUCH) {
      this.enabled = false;
      this.lockChangeFns.forEach(f => f(false));
    } else if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }
  get locked() {
    return IS_TOUCH ? this.enabled : document.pointerLockElement === this.canvas;
  }

  pose() { return { x: this.pos.x, y: this.zerog ? this.flyY : (this.gym ? this.gymY : 0), z: this.pos.z, yaw: this.yaw }; }

  enterPool() { this.pooling = true; this.poolRotate = 0; this.poolCharging = false; this.keys.clear(); }
  exitPool() { this.pooling = false; this.poolCharging = false; this._applyCamera(); }

  enterAim() { this.aiming = true; this.aimDX = 0; this.aimDY = 0; this.aimCharge = false; this.keys.clear(); }
  exitAim() { this.aiming = false; this.aimCharge = false; this._applyCamera(); }

  // gym jump — called from main.js's keydown (fires reliably, pointer-lock or
  // not) and from the mobile JUMP button. only leaves the floor when grounded.
  gymJump() { if (this.gym && this.grounded) { this.vy = GYM_JUMP_V; this.grounded = false; this.onJump?.(); } }

  /* ---------- desktop ---------- */
  _bindDesktop() {
    document.addEventListener("pointerlockchange", () => {
      const locked = this.locked;
      this.enabled = locked;
      if (!locked) this.keys.clear();
      this.lockChangeFns.forEach(f => f(locked));
    });
    document.addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      if (this.pooling) { this.poolRotate -= e.movementX * 0.0032; return; }   // aim, not look
      if (this.aiming) { this.aimDX -= e.movementX * 0.0026; this.aimDY -= e.movementY * 0.0026; return; }
      this.yaw -= e.movementX * 0.0023;
      this.pitch = clamp(this.pitch - e.movementY * 0.0023, -1.25, 1.25);
    });
    document.addEventListener("keydown", (e) => {
      if (!this.locked) return;
      this.keys.add(e.code);
    });
    document.addEventListener("keyup", (e) => this.keys.delete(e.code));
    // hold the mouse button to charge a pool shot; release to fire (the game
    // reads poolCharging). normal click still fires the crosshair action.
    document.addEventListener("mousedown", () => {
      if (this.pooling && this.locked) this.poolCharging = true;
      if (this.aiming && this.locked) this.aimCharge = true;
      if (this.locked) this.pointerDown = true;
    });
    document.addEventListener("mouseup", () => {
      if (this.pooling) this.poolCharging = false;
      if (this.aiming) this.aimCharge = false;
      this.pointerDown = false;
    });
    this.canvas.addEventListener("click", () => {
      if (this.pooling || this.aiming) return;
      if (this.locked) this.actionFns.forEach(f => f(0, 0));   // crosshair center
    });
  }

  /* ---------- mobile ---------- */
  _bindTouch() {
    const joyEl = document.getElementById("joystick");
    const nub = document.getElementById("joystick-nub");
    joyEl.classList.add("show");

    joyEl.addEventListener("pointerdown", (e) => {
      this.joy.active = true;
      this.joy.pid = e.pointerId;
      joyEl.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    joyEl.addEventListener("pointermove", (e) => {
      if (!this.joy.active || e.pointerId !== this.joy.pid) return;
      const r = joyEl.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const len = Math.hypot(dx, dy) || 1;
      const s = len > 1 ? 1 / len : 1;
      this.joy.x = dx * s;
      this.joy.y = dy * s;
      nub.style.transform =
        `translate(calc(-50% + ${this.joy.x * 33}px), calc(-50% + ${this.joy.y * 33}px))`;
    });
    const joyEnd = (e) => {
      if (e.pointerId !== this.joy.pid) return;
      this.joy.active = false;
      this.joy.x = this.joy.y = 0;
      nub.style.transform = "translate(-50%,-50%)";
    };
    joyEl.addEventListener("pointerup", joyEnd);
    joyEl.addEventListener("pointercancel", joyEnd);

    // look + tap on the scene itself
    let look = null;
    this.canvas.addEventListener("pointerdown", (e) => {
      look = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (!look || e.pointerId !== look.id || !this.enabled) return;
      const dx = e.clientX - look.x, dy = e.clientY - look.y;
      look.moved += Math.abs(dx) + Math.abs(dy);
      look.x = e.clientX; look.y = e.clientY;
      if (this.pooling) { this.poolRotate -= dx * 0.006; return; }   // drag to aim
      if (this.aiming) { this.aimDX -= dx * 0.005; this.aimDY -= dy * 0.005; return; }
      this.yaw -= dx * 0.005;
      this.pitch = clamp(this.pitch - dy * 0.005, -1.25, 1.25);
    });
    this.canvas.addEventListener("pointerup", (e) => {
      if (!look || e.pointerId !== look.id) return;
      const quick = performance.now() - look.t < 350 && look.moved < 14;
      if (quick && this.enabled) {
        const ndcX = (e.clientX / innerWidth) * 2 - 1;
        const ndcY = -(e.clientY / innerHeight) * 2 + 1;
        this.actionFns.forEach(f => f(ndcX, ndcY));
      }
      look = null;
    });
  }

  /* ---------- per-frame ---------- */
  update(dt) {
    if (!this.enabled) return;
    if (this.pooling || this.aiming) return;     // the table/board game drives the camera
    if (this.zerog) { this._updateZeroG(dt); return; }
    if (this.gym) { this._updateGym(dt); return; }
    let fwd = 0, strafe = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) fwd += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) fwd -= 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) strafe -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) strafe += 1;
    fwd += -this.joy.y;
    strafe += this.joy.x;

    const len = Math.hypot(fwd, strafe);
    if (len > 0.01) {
      const sprint = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? 1.8 : 1;
      const sp = (SPEED * sprint * dt) / Math.max(1, len);
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      const dx = (sin * -fwd + cos * strafe) * sp;
      const dz = (cos * -fwd - sin * strafe) * sp;
      if (this.walkable) {
        // slide along walls: try each axis independently
        if (this.walkable(this.pos.x + dx, this.pos.z)) this.pos.x += dx;
        if (this.walkable(this.pos.x, this.pos.z + dz)) this.pos.z += dz;
      } else {
        this.pos.x = clamp(this.pos.x + dx, this.bounds.minX, this.bounds.maxX);
        this.pos.z = clamp(this.pos.z + dz, this.bounds.minZ, this.bounds.maxZ);
      }
    }
    this._applyCamera();
  }

  // on-foot basketball: a heavy jog (sprint burns stamina) with a real jump.
  // horizontal is the same axis-slide walk as update(), just slower; vertical is
  // gravity + a one-shot jump impulse. pose().y carries gymY so peers see hops.
  _updateGym(dt) {
    let fwd = 0, strafe = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) fwd += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) fwd -= 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) strafe -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) strafe += 1;
    fwd += -this.joy.y; strafe += this.joy.x;
    const len = Math.hypot(fwd, strafe);

    // sprint: hold SHIFT (or the touch button) WHILE MOVING to burn the meter
    // for a burst. once empty you can't re-engage until it recovers past a
    // quarter — the cooldown feel, no infinite running.
    // no boosting with the rock in your hands (the Echo VR rule — you can't
    // sprint while you carry; pass or shoot it first)
    const wantSprint = (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.touchSprint) && !this.holdingBall;
    if (wantSprint && len > 0.01 && this.stamina > 0.02 && (this._sprinting || this.stamina > 0.3)) {
      this._sprinting = true;
      this.stamina = Math.max(0, this.stamina - dt / GYM_STAM_DRAIN);
      if (this.stamina <= 0) this._sprinting = false;
    } else {
      this._sprinting = false;
      this.stamina = Math.min(1, this.stamina + dt / GYM_STAM_REGEN);
    }
    const sprintMul = this._sprinting ? GYM_SPRINT : 1;

    if (len > 0.01) {
      const sp = (GYM_SPEED * sprintMul * dt) / Math.max(1, len);
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      const dx = (sin * -fwd + cos * strafe) * sp;
      const dz = (cos * -fwd - sin * strafe) * sp;
      if (this.walkable) {
        if (this.walkable(this.pos.x + dx, this.pos.z)) this.pos.x += dx;
        if (this.walkable(this.pos.x, this.pos.z + dz)) this.pos.z += dz;
      } else {
        this.pos.x += dx; this.pos.z += dz;
      }
    }

    // jump — two independent paths so it can't silently break: keyboard SPACE
    // also comes through main.js → gymJump(); here we cover the keys set + the
    // mobile JUMP button. edge-triggered, grounded-only (no double-jump).
    const jump = this.keys.has("Space") || this.touchJump;
    if (jump && !this._jumpHeld && this.grounded) {
      this.vy = GYM_JUMP_V; this.grounded = false; this.onJump?.();
    }
    this._jumpHeld = jump;
    this.vy -= GYM_G * dt;
    this.gymY += this.vy * dt;
    if (this.gymY <= 0) { this.gymY = 0; this.vy = 0; this.grounded = true; }

    this._applyCamera();
  }

  // pure momentum: thrust with WASD (along your gaze), SPACE up, C down,
  // SHIFT boost burst, B brakes. Walls bounce you like the real thing.
  // are we close enough to any arena surface to grab it?
  nearGrabSurface() {
    if (this.nearWallFn) return this.nearWallFn(this.pos.x, this.flyY, this.pos.z);
    const a = this.arena;
    if (!a) return false;
    const m = 0.95;     // bounce margin (0.5) + arm's reach
    return this.pos.x < a.x - a.hx + m || this.pos.x > a.x + a.hx - m
        || this.flyY  < a.y - a.hy + m || this.flyY  > a.y + a.hy - m
        || this.pos.z < a.z - a.hz + m || this.pos.z > a.z + a.hz - m;
  }

  _updateZeroG(dt) {
    // a punch to the helmet: inputs die, momentum doesn't
    this.stunT = Math.max(0, (this.stunT || 0) - dt);
    const stunned = this.stunT > 0;
    if (stunned) { this.anchored = false; this.blocking = false; }
    else this.blocking = this.keys.has("KeyF");

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const sp = Math.sin(this.pitch), cp = Math.cos(this.pitch);
    const lx = -sy * cp, ly = sp, lz = -cy * cp;

    // grab & fling: E latches onto a nearby surface (velocity dies),
    // E again throws you off along your gaze — the slingshot
    const eDown = this.keys.has("KeyE");
    if (eDown && !this._eHeld) {
      this._eHeld = true;
      if (!stunned) {
        if (this.anchored) {
          this.anchored = false;
          this.vel.x = lx * 10; this.vel.y = ly * 10; this.vel.z = lz * 10;
          this.onFling?.();
        } else if (this.ghostHold) {
          // pull straight through your teammate — the slingshot
          const gv = this.ghostHold.vel();
          this.ghostHold = null;
          this.vel.x = gv.x + lx * 8; this.vel.y = gv.y + ly * 8; this.vel.z = gv.z + lz * 8;
          this.onFling?.();
        } else if (this.nearGrabSurface()) {
          this.anchored = true;
          this.vel.x = this.vel.y = this.vel.z = 0;
          this.onGrab?.();
        } else if (this.onGrabGhost) {
          const gh = this.onGrabGhost();
          if (gh) {
            const gp = gh.pos();
            this.ghostHold = gh;
            this._holdOff = { x: this.pos.x - gp.x, y: this.flyY - gp.y, z: this.pos.z - gp.z };
            this.onGrab?.();
          }
        }
      }
    } else if (!eDown) this._eHeld = false;

    if (this.anchored) {                    // latched on: free look, no drift
      this.thrusting = false;
      this.camera.position.set(this.pos.x, this.flyY, this.pos.z);
      this.camera.rotation.order = "YXZ";
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
      return;
    }
    if (this.ghostHold) {                   // holding a teammate: ride along
      const gp = this.ghostHold.pos();
      this.pos.x = gp.x + this._holdOff.x;
      this.flyY = gp.y + this._holdOff.y;
      this.pos.z = gp.z + this._holdOff.z;
      const gv = this.ghostHold.vel();
      this.vel.x = gv.x; this.vel.y = gv.y; this.vel.z = gv.z;
      this.thrusting = false;
      this.camera.position.set(this.pos.x, this.flyY, this.pos.z);
      this.camera.rotation.order = "YXZ";
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
      return;
    }

    const live = stunned ? 0 : 1;
    const fwd = live * ((this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0)
              - (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0));
    const strafe = live * ((this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0)
                 - (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0));
    const up = live * ((this.keys.has("Space") ? 1 : 0)
             - (this.keys.has("KeyC") || this.keys.has("ControlLeft") || this.keys.has("ControlRight") ? 1 : 0));
    const jx = this.joy.x * live, jy = this.joy.y * live;
    const ACC = 7;
    this.vel.x += (lx * fwd + cy * strafe + jx * cy - jy * lx) * ACC * dt;
    this.vel.y += (ly * fwd + up - jy * ly) * ACC * dt;
    this.vel.z += (lz * fwd - sy * strafe + jx * -sy - jy * lz) * ACC * dt;
    this.thrusting = !!(fwd || strafe || up || Math.abs(jx) > 0.1 || Math.abs(jy) > 0.1);
    this.boostCd = Math.max(0, this.boostCd - dt);
    if (!stunned && (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) && this.boostCd === 0) {
      this.boostCd = 1.4;
      this.vel.x += lx * 9; this.vel.y += ly * 9; this.vel.z += lz * 9;
      this.onBoost?.();
    }
    if (!stunned && this.keys.has("KeyB")) {   // brake
      const k = Math.pow(0.02, dt);
      this.vel.x *= k; this.vel.y *= k; this.vel.z *= k;
    }
    // cap + integrate + bounce
    const vmax = 14;
    const vm = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
    if (vm > vmax) { const s = vmax / vm; this.vel.x *= s; this.vel.y *= s; this.vel.z *= s; }
    this.pos.x += this.vel.x * dt;
    this.flyY += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;
    if (this.clampFn) {
      // the world knows the real shape out there — hall, domes, tubes,
      // lockers, islands. it clamps and bounces us in one call.
      const p = { x: this.pos.x, y: this.flyY, z: this.pos.z };
      this.clampFn(p, this.vel, 0.55);
      this.pos.x = p.x; this.flyY = p.y; this.pos.z = p.z;
    } else if (this.arena) {
      const a = this.arena, m = 0.5, R = 0.72;
      if (this.pos.x < a.x - a.hx + m) { this.pos.x = a.x - a.hx + m; this.vel.x = Math.abs(this.vel.x) * R; }
      if (this.pos.x > a.x + a.hx - m) { this.pos.x = a.x + a.hx - m; this.vel.x = -Math.abs(this.vel.x) * R; }
      if (this.flyY < a.y - a.hy + m) { this.flyY = a.y - a.hy + m; this.vel.y = Math.abs(this.vel.y) * R; }
      if (this.flyY > a.y + a.hy - m) { this.flyY = a.y + a.hy - m; this.vel.y = -Math.abs(this.vel.y) * R; }
      if (this.pos.z < a.z - a.hz + m) { this.pos.z = a.z - a.hz + m; this.vel.z = Math.abs(this.vel.z) * R; }
      if (this.pos.z > a.z + a.hz - m) { this.pos.z = a.z + a.hz - m; this.vel.z = -Math.abs(this.vel.z) * R; }
    }
    this.camera.position.set(this.pos.x, this.flyY, this.pos.z);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  _applyCamera() {
    if (this.zerog) {
      this.camera.position.set(this.pos.x, this.flyY, this.pos.z);
      this.camera.rotation.order = "YXZ";
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
      return;
    }
    this.camera.position.set(this.pos.x, EYE + (this.gym ? this.gymY : 0), this.pos.z);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }
}
