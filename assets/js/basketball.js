/* ============================================================
   THE METRO — BASKETBALL (free-roam pop-a-shot on the arcade court)
   Not a game — just a hoop, a ball rack and a little court. Walk
   onto the court and you've always got a rock in your hands; HOLD to
   wind up, release to let it fly. Move around for different looks.

   The shot is THE GYM's shot, ported to this half court, because two
   rooms in one world shouldn't ask your hands to learn two different
   things:

     - AUTO-AIM. the ball flies at the ring, not at your crosshair, and
       the camera eases onto the backboard while you wind up so you can
       see what you're shooting at.
     - the ARC is solved for where you stand. a makeable shot always
       exists from anywhere on the floor; the loft is chosen so its
       perfect power sits comfortably mid-bar.
     - the POWER is the skill, and it PING-PONGS 0↔1 while you hold —
       miss the window and you just wait for it to swing back.
     - ACTIVE RELOAD: release inside the green band around the marker
       and the power snaps to perfect — a guaranteed swish. Outside it
       you fly your raw power and live with it.

   world.js owns every mesh; this file is the throw + the projectile sim
   with rim/backboard/floor bounces. No three.js here — mesh positions
   are plain writes.
   ============================================================ */

// realistic-ish constants: a 0.62 kg / 0.24 m regulation ball. COR (coefficient
// of restitution) from research — hardwood ~0.82 (NBA: a 72" drop bounces ~54"),
// a steel rim eats energy (~0.5), glass backboard ~0.55. Quadratic air drag uses
// a sphere's Cd≈0.47, so a hard shot loses a little range — like the real thing.
const G = 9.81;
const DT = 1 / 240;            // fixed sim substep
// this court is 3.9 m deep, so the whole bar lives in the range that fits it —
// a full-power heave off the back line, not a wasted top half
const MIN_SPEED = 3.4;         // m/s, a soft floater from under the rim
const MAX_SPEED = 8.8;         // m/s full charge — with headroom past the back line, so even the deepest shot's marker sits off the end of the bar
const CHARGE_T = 0.95;         // seconds for one sweep of the meter
const LOFT_BASE = 0.90;        // ~52° — the free-aim fallback's arc
const LOFT_LOOK = 0.15;        // looking up nudges the loft a touch
const LOFT_MIN = 0.55, LOFT_MAX = 1.05;   // solved arc range: ~31° … ~60°
const ASSIST_HALF = 0.085;     // release within this of the marker = a perfect swish
const RELOAD = 0.32;           // a new ball in your hands this fast
const WIRE_R = 0.02;
const RIM_E = 0.5, BB_E = 0.55, CEIL_E = 0.5;   // rim/backboard/ceiling restitution (the ball doesn't bounce on the floor — it vanishes)
const DRAG = 0.021;            // quadratic air drag coefficient (½·ρ·Cd·A / m)

export function initBasket(h, opts = {}) {
  const snd = opts.sound || {};
  const onBucket = opts.onBucket || (() => {});
  const onMiss = opts.onMiss || (() => {});
  const autoAim = opts.autoAim || (() => true);
  const court = h.court;                  // {x0,x1,z0,z1}
  const rim = h.rim, rimR = h.rimR, ballR = h.ballR, BB = h.backboard;
  const floorY = h.floorY ?? 0;
  const ceilY = h.ceilY ?? 3.4;
  const south = h.faceSign || 1;          // +1: rim is toward -z from the shooter (south wall)
  const meshes = h.balls;
  const handMesh = h.handBall;

  let hasBall = false, reloadCd = 0;
  let charging = false, charge = 0, chargeDir = 1;   // power OSCILLATES 0↔1 while held
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

  // the horizontal line from your hands to the ring — auto-aim's whole job
  function rimDir(o) {
    const hx = rim.x - o.x, hz = rim.z - o.z, hl = Math.hypot(hx, hz) || 1;
    return { x: hx / hl, z: hz / hl };
  }
  function aimDir(ctx, o) {
    if (!autoAim()) return launchDir(ctx.yaw, ctx.pitch);
    const dh = rimDir(o), sol = solveShot(ctx, o), cp = Math.cos(sol.loft);
    return { x: dh.x * cp, y: Math.sin(sol.loft), z: dh.z * cp };
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

  /* ---- the shot solver + the active-reload marker -----------------------
     For a swish you need the right ARC and the right POWER. We fix the arc
     per distance (so a makeable shot always exists and its perfect power
     sits mid-bar) and leave the power to you — that's the skill, and the
     marker shows where perfect is. Same shape as THE GYM's solver; the
     only difference is which axis the backboard lives on. ------------- */
  // fly a candidate with the SAME physics + bounces as stepBall(), and return
  // the horizontal miss at the moment it drops DOWN through the rim plane —
  // exactly what stepBall()'s make check uses, so the solver can't disagree
  // with reality. (never crosses the ring going down = a clean miss.)
  function simShot(o, dh, loft, sp) {
    const cp = Math.cos(loft);
    let x = o.x, y = o.y, z = o.z, vx = dh.x * cp * sp, vy = Math.sin(loft) * sp, vz = dh.z * cp * sp;
    for (let s = 0; s < 400; s++) {
      const py = y;
      vy -= G * DT;
      const sv = Math.hypot(vx, vy, vz) || 1e-6, dr = DRAG * sv * DT;
      vx -= dr * vx; vy -= dr * vy; vz -= dr * vz;
      x += vx * DT; y += vy * DT; z += vz * DT;
      if (y - ballR <= floorY) return Infinity;        // hit the floor first → miss
      if (y + ballR > ceilY && vy > 0) { y = ceilY - ballR; vy = -vy * CEIL_E; vx *= 0.85; vz *= 0.85; }
      // backboard bank
      const into = south > 0 ? (vz < 0 && z - ballR < BB.z) : (vz > 0 && z + ballR > BB.z);
      if (into && x > BB.x0 && x < BB.x1 && y > BB.y0 && y < BB.y1) {
        z = BB.z + south * ballR; vz = -vz * BB_E; vx *= 0.8; vy *= 0.92;
      }
      // rim torus bounce (nearest point on the ring)
      const dx = x - rim.x, dz = z - rim.z, hdr = Math.hypot(dx, dz);
      if (hdr > 1e-4) {
        const nx = rim.x + dx / hdr * rimR, nz = rim.z + dz / hdr * rimR;
        const ex = x - nx, ey = y - rim.y, ez = z - nz, ed = Math.hypot(ex, ey, ez);
        if (ed < ballR + WIRE_R) {
          const inv = 1 / (ed || 1), Nx = ex * inv, Ny = ey * inv, Nz = ez * inv, vn = vx * Nx + vy * Ny + vz * Nz;
          if (vn < 0) { const j = (1 + RIM_E) * vn; vx -= j * Nx; vy -= j * Ny; vz -= j * Nz; }
          const push = ballR + WIRE_R - ed; x += Nx * push; y += Ny * push; z += Nz * push;
        }
      }
      if (py > rim.y && y <= rim.y && vy < 0) return Math.hypot(x - rim.x, z - rim.z);
    }
    return Infinity;
  }
  // for one loft, scan the whole power bar. opt = the most-centred make;
  // lo..hi = the charges that still drop through.
  function scanPower(o, dh, loft) {
    const N = 48, THRESH = rimR - ballR * 0.12, hd = new Array(N + 1);
    let bI = -1, bHd = Infinity, anyI = 0, anyHd = Infinity;
    for (let i = 0; i <= N; i++) {
      hd[i] = simShot(o, dh, loft, speedFor(i / N));
      if (hd[i] < anyHd) { anyHd = hd[i]; anyI = i; }
      if (hd[i] < THRESH && hd[i] < bHd) { bHd = hd[i]; bI = i; }
    }
    if (bI < 0) return { loft, opt: anyI / N, lo: anyI / N, hi: anyI / N, miss: anyHd, makeable: false };
    let lo = bI, hi = bI;
    while (lo > 0 && hd[lo - 1] < THRESH) lo--;
    while (hi < N && hd[hi + 1] < THRESH) hi++;
    return { loft, opt: bI / N, lo: lo / N, hi: hi / N, miss: bHd, makeable: true };
  }
  // pick the arc whose perfect power is makeable AND closest to mid-bar (so the
  // meter has room to swing either side); if nothing drops, the arc that gets
  // nearest — the marker goes amber to say "you can't reach from here".
  function solveShotFor(o) {
    const dh = rimDir(o), L = 12;
    let best = null;
    for (let li = 0; li <= L; li++) {
      const s = scanPower(o, dh, LOFT_MIN + (LOFT_MAX - LOFT_MIN) * li / L);
      s.score = s.makeable ? Math.abs(s.opt - 0.6) : 10 + s.miss;
      if (!best || s.score < best.score) best = s;
    }
    // the band on the bar is the active-reload snap window, not the razor-thin
    // physics — a fair, readable target at any range
    if (best.makeable) { best.lo = Math.max(0, best.opt - ASSIST_HALF); best.hi = Math.min(1, best.opt + ASSIST_HALF); }
    return best;
  }
  let solKey = "", solCache = null;
  function solveShot(ctx, o) {
    const flat = Math.hypot(o.x - rim.x, o.z - rim.z);
    const key = flat.toFixed(2) + "|" + o.y.toFixed(2);
    if (key === solKey && solCache) return solCache;
    solKey = key; solCache = solveShotFor(o);
    return solCache;
  }

  function throwBall(ctx) {
    const o = handPos(ctx);
    // ACTIVE RELOAD: released inside the green snap-zone → the power locks to
    // perfect and it swishes. outside it, your raw power flies.
    let useCharge = charge;
    if (autoAim()) {
      const sol = solveShot(ctx, o);
      if (sol.makeable && Math.abs(charge - sol.opt) <= ASSIST_HALF) useCharge = sol.opt;
    }
    const d = aimDir(ctx, o), sp = speedFor(useCharge);
    const mi = cursor; cursor = (cursor + 1) % meshes.length;
    balls.push({ mi, x: o.x, y: o.y, z: o.z, vx: d.x * sp, vy: d.y * sp, vz: d.z * sp,
      scored: false, touchedRim: false, bounces: 0, age: 0, dead: false });
    hasBall = false; reloadCd = RELOAD;
    snd.shoot && snd.shoot(useCharge);
  }

  function onMake(b) {
    streak += 1;                              // consecutive MAKES — a rim rattle still counts
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
    // the ball just vanishes when it reaches the ground (a miss) or drops
    // through the net (a make) — it never bounces and rolls around the court
    if (b.y - ballR <= floorY || (b.scored && b.y < rim.y - 0.55) || b.age > 6) {
      if (b.y - ballR <= floorY) snd.bounce && snd.bounce();
      if (!b.scored) { streak = 0; onMiss(); }
      b.dead = true;
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
      hasBall = false; charging = false; charge = 0;
      handMesh.visible = false; h.hideGuide();
      opts.hud && opts.hud.power && opts.hud.power(0, null);
      opts.setAimLock && opts.setAimLock(null);
      return;
    }
    if (!hasBall) { reloadCd -= dt; if (reloadCd <= 0) hasBall = true; }

    // hold to wind up, release to shoot
    if (hasBall && ctx.pressed) {
      if (!charging) { charge = 0; chargeDir = 1; }   // every wind-up starts the sweep low
      charging = true;
      // a PING-PONG power bar: it ramps to the top, then back to the bottom,
      // over and over, so a missed window just swings back around
      charge += chargeDir * dt / CHARGE_T;
      if (charge >= 1) { charge = 1; chargeDir = -1; }
      else if (charge <= 0) { charge = 0; chargeDir = 1; }
    } else if (charging && !ctx.pressed) { throwBall(ctx); charging = false; charge = 0; }

    if (hasBall) {
      const hp = handPos(ctx);
      handMesh.position.set(hp.x, hp.y - (charging ? charge * 0.08 : 0), hp.z); handMesh.visible = true;
      if (charging) {
        let opt = null;
        if (autoAim()) {
          // no arc line — power by feel is the skill. instead the camera eases
          // onto the backboard so you see the target, and the bar carries the
          // perfect-release marker for where you stand.
          h.hideGuide();
          opts.setAimLock && opts.setAimLock({ x: rim.x, y: BB.y0 + 0.5, z: BB.z });
          opt = solveShot(ctx, hp);
        } else {
          h.setArc(arcPts(hp, launchDir(ctx.yaw, ctx.pitch), speedFor(charge)));
        }
        opts.hud && opts.hud.power && opts.hud.power(charge, opt);
      } else {
        h.hideGuide();
        opts.hud && opts.hud.power && opts.hud.power(0, null);
        opts.setAimLock && opts.setAimLock(null);
      }
    } else {
      handMesh.visible = false; h.hideGuide();
      opts.hud && opts.hud.power && opts.hud.power(0, null);
      opts.setAimLock && opts.setAimLock(null);
    }
  }

  function reset() {
    for (const b of balls) meshes[b.mi].visible = false;
    balls.length = 0; hasBall = false; charging = false; charge = 0; streak = 0; handMesh.visible = false; h.hideGuide();
    opts.setAimLock && opts.setAimLock(null);
  }

  return {
    tick, reset,
    streak: () => streak,
    wantsPointer: () => !!(lastCtx && lastCtx.locked && inCourt(lastCtx.x, lastCtx.z)),
    onCourt: () => !!(lastCtx && inCourt(lastCtx.x, lastCtx.z)),
    _debug: () => ({ hasBall, charging, charge: +charge.toFixed(2), streak, balls: balls.length }),
    _debugSolve: () => (lastCtx ? solveShot(lastCtx, handPos(lastCtx)) : null),
    _debugThrow: (c) => { if (!lastCtx) return; hasBall = true; charge = Math.max(0, Math.min(1, c)); throwBall(lastCtx); charge = 0; charging = false; },
  };
}
