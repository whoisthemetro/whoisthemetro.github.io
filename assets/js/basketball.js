/* ============================================================
   THE METRO — BASKETBALL (free-roam pop-a-shot, no scoreboard)
   Not a game — just a hoop, a ball rack and a little court. Walk
   onto the court and you've always got a rock in your hands; face
   the rim, HOLD to wind up a shot, release to let it fly. Move
   around for different looks. Gravity arcs it; a clean swish feels
   great and that's the whole reward.

   You shoot with your own first-person view (no locked camera) —
   the ball launches where you're FACING with a natural loft, and
   how long you hold sets the power (= range). A faint arc previews
   the shot while you wind up. world.js owns every mesh; this file
   is the throw + the projectile sim with rim/backboard/floor
   bounces. No three.js here — mesh positions are plain writes.
   ============================================================ */

// realistic-ish constants: a 0.62 kg / 0.24 m regulation ball. COR (coefficient
// of restitution) from research — hardwood ~0.82 (NBA: a 72" drop bounces ~54"),
// a steel rim eats energy (~0.5), glass backboard ~0.55. Quadratic air drag uses
// a sphere's Cd≈0.47, so a hard shot loses a little range — like the real thing.
const G = 9.81;
const DT = 1 / 240;            // fixed sim substep
const MIN_SPEED = 4.0;         // m/s, a soft floater right under the rim
const MAX_SPEED = 9.5;         // m/s full charge — but a heave clips the low ceiling
const CHARGE_T = 0.95;         // seconds hold to full power
const LOFT_BASE = 0.90;        // ~52° — a high, soft arc that drops in (low ceiling needs it steep)
const LOFT_LOOK = 0.22;        // looking up nudges the loft a touch
const RELOAD = 0.32;           // a new ball in your hands this fast
const WIRE_R = 0.02;
const RIM_E = 0.5, BB_E = 0.55, FLOOR_E = 0.82, CEIL_E = 0.5;
const DRAG = 0.021;            // quadratic air drag coefficient (½·ρ·Cd·A / m)

export function initBasket(h, opts = {}) {
  const snd = opts.sound || {};
  const onBucket = opts.onBucket || (() => {});
  const court = h.court;                  // {x0,x1,z0,z1}
  const rim = h.rim, rimR = h.rimR, ballR = h.ballR, BB = h.backboard;
  const floorY = h.floorY ?? 0;
  const ceilY = h.ceilY ?? 3.4;
  const south = h.faceSign || 1;          // +1: rim is toward -z from the shooter (south wall)
  const meshes = h.balls;
  const handMesh = h.handBall;

  let hasBall = false, reloadCd = 0;
  let charging = false, charge = 0, prevPressed = false;
  let streak = 0;
  const balls = [];
  let cursor = 0;
  let lastCtx = null;

  const inCourt = (x, z) => x > court.x0 && x < court.x1 && z > court.z0 && z < court.z1;

  function launchDir(yaw, pitch) {
    const lp = Math.max(0.45, Math.min(1.25, LOFT_BASE + Math.max(0, pitch) * LOFT_LOOK));
    const cp = Math.cos(lp);
    return { x: -Math.sin(yaw) * cp, y: Math.sin(lp), z: -Math.cos(yaw) * cp };
  }
  function speedFor(c) { return MIN_SPEED + (MAX_SPEED - MIN_SPEED) * c; }

  // where the ball sits in your hands (front-low of the camera)
  function handPos(ctx) {
    const fx = -Math.sin(ctx.yaw), fz = -Math.cos(ctx.yaw);   // horizontal facing
    return { x: ctx.x + fx * 0.42, y: ctx.eyeY - 0.07, z: ctx.z + fz * 0.42 };  // released ~shoulder height
  }

  function arcPts(origin, dir, speed) {
    let x = origin.x, y = origin.y, z = origin.z, vx = dir.x * speed, vy = dir.y * speed, vz = dir.z * speed;
    const pts = [{ x, y, z }];
    for (let s = 0; s < 400; s++) {
      vy -= G * DT;
      const sv = Math.hypot(vx, vy, vz) || 1e-6, dr = DRAG * sv * DT;
      vx -= dr * vx; vy -= dr * vy; vz -= dr * vz;
      x += vx * DT; y += vy * DT; z += vz * DT;
      if (s % 3 === 0) pts.push({ x, y, z });
      if (y < floorY || y + ballR > ceilY) break;     // preview stops at the floor / ceiling (a tell)
    }
    return pts;
  }

  function throwBall(ctx) {
    const o = handPos(ctx), d = launchDir(ctx.yaw, ctx.pitch), sp = speedFor(charge);
    const mi = cursor; cursor = (cursor + 1) % meshes.length;
    balls.push({ mi, x: o.x, y: o.y, z: o.z, vx: d.x * sp, vy: d.y * sp, vz: d.z * sp,
      scored: false, touchedRim: false, bounces: 0, age: 0, dead: false });
    hasBall = false; reloadCd = RELOAD;
    snd.shoot && snd.shoot(charge);
  }

  function onMake(b) {
    streak = b.touchedRim ? 1 : streak + 1;   // a clean swish keeps a swish-streak
    snd.score && snd.score(b.touchedRim ? 0 : 1);
    h.swish && h.swish();
    onBucket({ swish: !b.touchedRim, streak });
  }

  function stepBall(b) {
    const py = b.y;
    b.vy -= G * DT;                                    // gravity
    const sv = Math.hypot(b.vx, b.vy, b.vz) || 1e-6, dr = DRAG * sv * DT;  // air drag
    b.vx -= dr * b.vx; b.vy -= dr * b.vy; b.vz -= dr * b.vz;
    b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT; b.age += DT;

    // ceiling — the low roof bats a heave back down (no more shots through it)
    if (b.y + ballR > ceilY && b.vy > 0) {
      b.y = ceilY - ballR; b.vy = -b.vy * CEIL_E; b.vx *= 0.85; b.vz *= 0.85; b.touchedRim = true;
      snd.bounce && snd.bounce();
    }
    // backboard (bank shots) — front face toward the court
    const intoBoard = south > 0 ? (b.vz < 0 && b.z - ballR < BB.z) : (b.vz > 0 && b.z + ballR > BB.z);
    if (intoBoard && b.x > BB.x0 && b.x < BB.x1 && b.y > BB.y0 && b.y < BB.y1) {
      b.z = BB.z + south * ballR; b.vz = -b.vz * BB_E; b.vx *= 0.8; b.vy *= 0.92; b.touchedRim = true;
      snd.bank && snd.bank();
    }
    // rim — nearest point on the ring
    const dx = b.x - rim.x, dz = b.z - rim.z, hd = Math.hypot(dx, dz);
    if (hd > 1e-4) {
      const nx = rim.x + dx / hd * rimR, nz = rim.z + dz / hd * rimR;
      const ex = b.x - nx, ey = b.y - rim.y, ez = b.z - nz, ed = Math.hypot(ex, ey, ez);
      if (ed < ballR + WIRE_R) {
        const inv = 1 / (ed || 1), Nx = ex * inv, Ny = ey * inv, Nz = ez * inv;
        const vn = b.vx * Nx + b.vy * Ny + b.vz * Nz;
        if (vn < 0) { const j = (1 + RIM_E) * vn; b.vx -= j * Nx; b.vy -= j * Ny; b.vz -= j * Nz; }
        const push = ballR + WIRE_R - ed; b.x += Nx * push; b.y += Ny * push; b.z += Nz * push;
        b.touchedRim = true; snd.rim && snd.rim();
      }
    }
    if (!b.scored && py > rim.y && b.y <= rim.y && b.vy < 0 && hd < rimR - ballR * 0.15) { b.scored = true; onMake(b); }
    if (b.y - ballR <= floorY) {
      b.y = floorY + ballR; b.vy = -b.vy * FLOOR_E; b.vx *= 0.8; b.vz *= 0.8; b.bounces++;  // hardwood bounce
      if (Math.abs(b.vy) > 1) snd.bounce && snd.bounce();
    }
    // let it bounce naturally and die once it's basically come to rest (or gone stale)
    const atRest = b.y - ballR < 0.03 && Math.hypot(b.vx, b.vy, b.vz) < 0.5;
    if ((atRest && b.age > 0.9) || b.age > 9 || (b.scored && b.y < rim.y - 0.6)) {
      if (!b.scored) streak = 0; b.dead = true;
    }
  }

  /* ---- per-frame ---- */
  function tick(dt, ctx) {
    dt = Math.min(dt, 0.05);
    lastCtx = ctx;
    // flying balls keep going even if you wander off the court
    let acc = dt;
    while (acc >= DT) { for (const b of balls) if (!b.dead) stepBall(b); acc -= DT; }
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i], m = meshes[b.mi];
      if (b.dead) { m.visible = false; balls.splice(i, 1); }
      else {
        m.position.set(b.x, b.y, b.z); m.visible = true;
        b.spin = (b.spin || 0) - dt * (3 + Math.hypot(b.vx, b.vz) * 1.4);  // a little backspin
        m.rotation.x = b.spin;
      }
    }

    const active = ctx && ctx.locked && inCourt(ctx.x, ctx.z);
    if (!active) {
      hasBall = false; charging = false; charge = 0; prevPressed = false;
      handMesh.visible = false; h.hideGuide();
      return;
    }
    if (!hasBall) { reloadCd -= dt; if (reloadCd <= 0) hasBall = true; }

    // hold to wind up, release to shoot
    if (hasBall && ctx.pressed) { charging = true; charge = Math.min(1, charge + dt / CHARGE_T); }
    else if (charging && !ctx.pressed) { throwBall(ctx); charging = false; charge = 0; }

    if (hasBall) {
      const hp = handPos(ctx);
      handMesh.position.set(hp.x, hp.y - (charging ? charge * 0.08 : 0), hp.z); handMesh.visible = true;
      if (charging) {
        h.setArc(arcPts(hp, launchDir(ctx.yaw, ctx.pitch), speedFor(charge)));
        opts.hud && opts.hud.power && opts.hud.power(charge);
      } else { h.hideGuide(); opts.hud && opts.hud.power && opts.hud.power(0); }
    } else { handMesh.visible = false; h.hideGuide(); }
    prevPressed = ctx.pressed;
  }

  function reset() {
    for (const b of balls) meshes[b.mi].visible = false;
    balls.length = 0; hasBall = false; charging = false; charge = 0; streak = 0; handMesh.visible = false; h.hideGuide();
  }

  return {
    tick, reset,
    wantsPointer: () => !!(lastCtx && lastCtx.locked && inCourt(lastCtx.x, lastCtx.z)),
    onCourt: () => !!(lastCtx && inCourt(lastCtx.x, lastCtx.z)),
    _debug: () => ({ hasBall, charging, charge: +charge.toFixed(2), streak, balls: balls.length }),
    _debugThrow: (c) => { if (!lastCtx) return; hasBall = true; charge = Math.max(0, Math.min(1, c)); throwBall(lastCtx); charge = 0; charging = false; },
  };
}
