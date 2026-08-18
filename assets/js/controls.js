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
    // a hand on a studio knob: the camera holds still and the mouse's motion
    // feeds the knob instead (main.js runs the grab)
    this.dragLock = false;
    this.dragDX = 0;
    this.dragDY = 0;
    // on-foot basketball (THE GYM): jump + sprint stamina layered over the walk
    this.gym = false;
    this.gymY = 0;            // height above the floor (0 = grounded)
    this.vy = 0;              // vertical velocity while airborne
    this.grounded = true;
    this.stamina = 1;         // 0..1 sprint meter (HUD reads it)
    this.touchJump = false;   // mobile buttons set these; desktop uses keys
    this.touchSprint = false;
    this.holdingBall = false; // true while you carry the gym ball (blocks boost)
    this.gymWarmup = false;   // warm-up (pre-tipoff): unlimited boost, free roam
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
    this.goto = null;         // tap-to-walk destination, {x,z}, cleared on any real input
    // right look-stick (mobile, gym only): deflection drives the camera, a quick
    // tap fires onLookTap (grab). pressure-touch isn't a thing on modern phones.
    this.lookJoy = { x: 0, y: 0, active: false, pid: null };
    this.lookStickOn = false;
    this.lookTapFns = [];
    this.aimLockTarget = null;   // {x,y,z} the camera eases onto while winding up a shot
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

  // main.js hands us a floor spot from a tap; update() drives there and turns
  walkTo(x, z) { this.goto = { x, z }; this._gotoStuck = 0; this._gotoLast = null; }
  // gym jump — called from main.js's keydown (fires reliably, pointer-lock or
  // not) and from the mobile JUMP button. only leaves the floor when grounded.
  gymJump() { if (this.gym && this.grounded) { this.vy = GYM_JUMP_V; this.grounded = false; this.onJump?.(); } }

  // right look-stick wiring (mobile gym)
  onLookTap(fn) { this.lookTapFns.push(fn); }
  setLookStick(on) {
    this.lookStickOn = on;
    const el = document.getElementById("joystick-r");
    if (el) el.classList.toggle("show", !!on);
    if (!on) { this.lookJoy.x = 0; this.lookJoy.y = 0; this.lookJoy.active = false; this.lookJoy.pid = null; }
  }
  // turn the camera from the look-stick deflection (called each frame)
  _applyLookStick(dt) {
    if (!this.lookJoy.active) return;
    const RATE = 2.7;   // rad/s at full deflection
    this.yaw -= this.lookJoy.x * RATE * dt;
    this.pitch = clamp(this.pitch - this.lookJoy.y * RATE * dt, -1.25, 1.25);
  }
  // slide along walls: try each axis independently. if the spot you're ALREADY
  // standing in is illegal — a teleport, or furniture that grew collision under
  // your feet — both axes fail and you'd be welded in place, so anything goes
  // until you're back on legal floor.
  _slide(dx, dz) {
    if (!this.walkable(this.pos.x, this.pos.z)) { this.pos.x += dx; this.pos.z += dz; return; }
    if (this.walkable(this.pos.x + dx, this.pos.z)) this.pos.x += dx;
    if (this.walkable(this.pos.x, this.pos.z + dz)) this.pos.z += dz;
  }
  // lock-on: while winding up a shot, ease the camera (and crosshair) onto the
  // target backboard so you can see exactly where the ball is going
  _easeAim(dt) {
    const t = this.aimLockTarget;
    const camY = EYE + (this.gym ? this.gymY : 0);
    const dx = t.x - this.pos.x, dy = t.y - camY, dz = t.z - this.pos.z;
    const horiz = Math.hypot(dx, dz) || 1e-6;
    let dyaw = Math.atan2(-dx, -dz) - this.yaw;   // forward = (-sin yaw, -, -cos yaw)
    while (dyaw > Math.PI) dyaw -= 2 * Math.PI;
    while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
    const k = Math.min(1, dt * 9);
    this.yaw += dyaw * k;
    this.pitch = clamp(this.pitch + (Math.atan2(dy, horiz) - this.pitch) * k, -1.25, 1.25);
  }

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
      if (this.dragLock) { this.dragDX += e.movementX; this.dragDY += e.movementY; return; }   // turn the knob, not the head
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

    // right look-stick (shown only in the gym): deflection turns the camera,
    // a quick tap fires onLookTap (grab/steal — our stand-in for "pressure")
    const rEl = document.getElementById("joystick-r");
    const rNub = document.getElementById("joystick-r-nub");
    if (rEl) {
      let rStart = 0, rMoved = 0;
      rEl.addEventListener("pointerdown", (e) => {
        this.lookJoy.active = true; this.lookJoy.pid = e.pointerId;
        rEl.setPointerCapture(e.pointerId); rStart = performance.now(); rMoved = 0;
        e.preventDefault();
      });
      rEl.addEventListener("pointermove", (e) => {
        if (!this.lookJoy.active || e.pointerId !== this.lookJoy.pid) return;
        const r = rEl.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        const len = Math.hypot(dx, dy) || 1, s = len > 1 ? 1 / len : 1;
        this.lookJoy.x = dx * s; this.lookJoy.y = dy * s;
        rMoved += Math.abs(this.lookJoy.x) + Math.abs(this.lookJoy.y);
        rNub.style.transform = `translate(calc(-50% + ${this.lookJoy.x * 33}px), calc(-50% + ${this.lookJoy.y * 33}px))`;
      });
      const rEnd = (e) => {
        if (e.pointerId !== this.lookJoy.pid) return;
        if (performance.now() - rStart < 300 && rMoved < 0.6) this.lookTapFns.forEach(f => f());  // tap = grab
        this.lookJoy.active = false; this.lookJoy.x = this.lookJoy.y = 0; this.lookJoy.pid = null;
        rNub.style.transform = "translate(-50%,-50%)";
      };
      rEl.addEventListener("pointerup", rEnd);
      rEl.addEventListener("pointercancel", rEnd);
    }

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
      if (this.lookStickOn) return;   // in the gym the right stick owns looking
      if (look.moved > 24) this.goto = null;   // you took the wheel back
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
    if (this.aimLockTarget) this._easeAim(dt);    // lock onto the backboard while shooting
    else this._applyLookStick(dt);                // else the right look-stick turns the camera
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

    /* TAP TO WALK. A stick is a thing you have to learn; pointing at the floor
       isn't. main.js hands us a spot when a tap lands on walkable ground and
       nothing interactive, and we drive there ourselves — TURNING as we go, so
       the tap does the looking too. That turn is most of the value: the hard
       part on a phone was never the walking, it was aiming the camera first.
       Any real input takes it straight back; you are never a passenger. */
    if (this.goto) {
      if (Math.abs(fwd) > 0.01 || Math.abs(strafe) > 0.01) this.goto = null;
      else {
        const gx = this.goto.x - this.pos.x, gz = this.goto.z - this.pos.z;
        const gd = Math.hypot(gx, gz);
        if (gd < 0.28) this.goto = null;                 // arrived
        else {
          // ease the view onto the bearing, then just walk forward
          let dyaw = Math.atan2(-gx, -gz) - this.yaw;
          while (dyaw > Math.PI) dyaw -= 2 * Math.PI;
          while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
          this.yaw += dyaw * Math.min(1, dt * 6);
          fwd = 1;
          const before = this.pos.x + this.pos.z;
          this._gotoStuck = Math.abs(before - (this._gotoLast ?? before)) < 1e-5
            ? (this._gotoStuck || 0) + dt : 0;
          this._gotoLast = before;
          if (this._gotoStuck > 0.45) this.goto = null;  // walked into something; give up
        }
      }
    }

    const len = Math.hypot(fwd, strafe);
    if (len > 0.01) {
      const sprint = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? 1.8 : 1;
      const sp = (SPEED * sprint * dt) / Math.max(1, len);
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      const dx = (sin * -fwd + cos * strafe) * sp;
      const dz = (cos * -fwd - sin * strafe) * sp;
      if (this.walkable) {
        this._slide(dx, dz);
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
    // boost: SHIFT, the touch button, OR shoving the move-stick to its outer
    // edge (mobile stand-in for "press harder"). never while you carry the ball.
    // WARM-UP (before the room readies up): unlimited boost so it's easy to move
    // around — the meter stays pinned full and even carrying the ball can't lock
    // it. once the game tips off the real Echo-style stamina rules below kick in.
    const stickBoost = Math.hypot(this.joy.x, this.joy.y) > 0.92;
    const warmup = this.gymWarmup;
    const wantSprint = (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.touchSprint || stickBoost) && (warmup || !this.holdingBall);
    if (warmup) {
      this.stamina = 1;
      this._sprinting = wantSprint && len > 0.01;
    } else if (wantSprint && len > 0.01 && this.stamina > 0.02 && (this._sprinting || this.stamina > 0.3)) {
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
        this._slide(dx, dz);
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
          // echo's own number: pushing off geometry tops out around 4-5 m/s
          this.vel.x = lx * 5; this.vel.y = ly * 5; this.vel.z = lz * 5;
          this.onFling?.();
        } else if (this.ghostHold) {
          // pull straight through your teammate — the slingshot
          const gv = this.ghostHold.vel();
          this.ghostHold = null;
          // team-assisted speed is UNCAPPED in echo — the regrab meta. carry
          // their momentum plus your push, and let the cap look away briefly
          this.vel.x = gv.x + lx * 5; this.vel.y = gv.y + ly * 5; this.vel.z = gv.z + lz * 5;
          this.uncapT = 2.5;
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
    const ACC = 4.5;   // echo-feel: gentle thrusters, momentum is earned
    this.vel.x += (lx * fwd + cy * strafe + jx * cy - jy * lx) * ACC * dt;
    this.vel.y += (ly * fwd + up - jy * ly) * ACC * dt;
    this.vel.z += (lz * fwd - sy * strafe + jx * -sy - jy * lz) * ACC * dt;
    this.thrusting = !!(fwd || strafe || up || Math.abs(jx) > 0.1 || Math.abs(jy) > 0.1);
    this.boostCd = Math.max(0, this.boostCd - dt);
    if (!stunned && (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) && this.boostCd === 0) {
      this.boostCd = 1.4;
      // the main booster ENGAGES you at echo's 5 m/s, it doesn't fire you
      this.vel.x += lx * 5; this.vel.y += ly * 5; this.vel.z += lz * 5;
      this.onBoost?.();
    }
    if (!stunned && this.keys.has("KeyB")) {   // brake
      const k = Math.pow(0.02, dt);
      this.vel.x *= k; this.vel.y *= k; this.vel.z *= k;
    }
    // cap + integrate + bounce. self-propelled speed is echo's: 5 m/s flat,
    // 4.7 holding the disc — the fast lane is other people (uncap window)
    this.uncapT = Math.max(0, (this.uncapT || 0) - dt);
    const vmax = this.uncapT > 0 ? 30 : (this.holdingDisc ? 4.7 : 5.0);
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
