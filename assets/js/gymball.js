/* ============================================================
   THE METRO — THE GYM ball (full-court basketball)
   One shared rock for a whole gym. Like the arena disc, it has two
   lives: HELD (snapped to whoever owns it — my hand, or a peer's), and
   LOOSE (a real projectile: gravity, air drag, floor/wall/ceiling
   bounces, rim torus + backboard banks). world.js owns the mesh; this
   file is the state machine + the sim + the possession rules. main.js
   wires it to controls/presence/ghosts through `hooks`.

   Netcode (mirrors the disc — broadcast absolute state, last-event-wins,
   every packet stamped with Date.now() so a stale one can't clobber a
   fresher one):
     hold {holder,t}    — a claim: pickup or a won steal. newest wins.
     shot {p,v,by,t}    — ball goes loose; EVERY client runs the same
                          fixed-step sim from p,v, so it converges with no
                          per-frame streaming. the shooter owns the make.
     score{team,red,blue,pts,t} — shooter-authoritative; absolute totals.
     steal{target,from,t} — a telegraph (sound/flash); the success itself
                          arrives as a `hold` for the stealer.
   Slow legs + the steal roll keep it from being a layup line; see controls.
   ============================================================ */

const G = 9.81;
const DT = 1 / 240;            // fixed sim substep (deterministic across clients)
const DRAG = 0.014;            // quadratic air drag (a touch less, so arcs read true)
// restitution: a real basketball bounces to ~75% off hardwood, dies fast on the
// rim/board, and barely rebounds off a wall. it must SETTLE, not pinball.
const FLOOR_E = 0.74, WALL_E = 0.32, CEIL_E = 0.4, RIM_E = 0.42, BB_E = 0.45, WIRE_R = 0.02;
const ROLL_FRIC = 0.06;        // floor friction multiplier/sec (small = strong drag → it stops)
const REST_V = 0.55;           // below this floor-bounce speed the ball stops bouncing
const ROLL_STOP = 0.35;        // below this ground speed it stops rolling (comes to rest)
const MIN_SPEED = 5.0, MAX_SPEED = 13.0;   // soft layup … half-court heave
const CHARGE_T = 1.0;          // seconds to full power
const LOFT_BASE = 0.86, LOFT_LOOK = 0.18;  // ~49° base arc, look up to flatten/raise
const PICKUP_R = 2.2;          // reach to grab a loose ball (generous — easy to pick up)
const STEAL_R = 2.1, STEAL_CHANCE = 0.5, STEAL_CD = 1100;   // how stealing feels
const THREE_R = 6.75;          // beyond this (from the hoop, on the floor) a make is 3
// dunking: get into the zone near your hoop, jump, and release the shot at the
// top of the jump (the meter's green window) — a clean, guaranteed slam.
const DUNK_ZONE_R = 2.7;       // horizontal reach to your rim to attempt a dunk
const MAX_JUMP = 1.088;        // apex height (matches controls GYM_JUMP_V/GYM_G)
const DUNK_WINDOW = 0.66;      // fraction of the apex height that counts as "the top"

export function makeGymBall(rig, hooks) {
  const mesh = rig.ball;
  const ballR = rig.ballR;
  const bounds = rig.bounds;
  const floorY = rig.floorY ?? 0, ceilY = rig.ceilY ?? 8;

  // ball state. holder: uid string | null. when null it's a live projectile.
  const ball = { holder: null, x: rig.info.x, y: ballR, z: rig.info.z, vx: 0, vy: 0, vz: 0,
                 lastShotBy: null, thrownFrom: null, spin: 0 };
  const score = { red: 0, blue: 0 };
  let charging = false, charge = 0;
  let lastSteal = 0, suppressClickUntil = 0;
  let acc = 0;
  let aimHoop = null;   // the basket latched when a wind-up begins (the one you're facing)

  const me = () => hooks.myUid();
  const dist3 = (ax, ay, az, bx, by, bz) => Math.hypot(ax - bx, ay - by, az - bz);

  // where the ball sits in a holder's hands. for me: front-low of the camera,
  // at eye-height (which already includes my jump via ctx.eyeY). for a peer:
  // out in front of their ghost at chest height (their y carries their hop).
  function myHand() {
    const c = hooks.ctx();
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    return { x: c.x + fx * 0.45, y: c.eyeY - 0.05, z: c.z + fz * 0.45 };
  }
  function peerHand(uid) {
    const g = hooks.ghost(uid);
    if (!g) return null;
    const fx = -Math.sin(g.yaw), fz = -Math.cos(g.yaw);
    return { x: g.x + fx * 0.42, y: g.y + 1.45, z: g.z + fz * 0.42 };
  }
  function holderPos() {
    if (!ball.holder) return null;
    return ball.holder === me() ? myHand() : peerHand(ball.holder);
  }

  function launchDir(yaw, pitch) {
    const lp = Math.max(0.4, Math.min(1.25, LOFT_BASE - pitch * LOFT_LOOK));
    const cp = Math.cos(lp);
    return { x: -Math.sin(yaw) * cp, y: Math.sin(lp), z: -Math.cos(yaw) * cp };
  }
  const speedFor = (c) => MIN_SPEED + (MAX_SPEED - MIN_SPEED) * c;

  function arcPts(o, d, sp) {
    let x = o.x, y = o.y, z = o.z, vx = d.x * sp, vy = d.y * sp, vz = d.z * sp;
    const pts = [{ x, y, z }];
    for (let s = 0; s < 360; s++) {
      vy -= G * DT;
      const sv = Math.hypot(vx, vy, vz) || 1e-6, dr = DRAG * sv * DT;
      vx -= dr * vx; vy -= dr * vy; vz -= dr * vz;
      x += vx * DT; y += vy * DT; z += vz * DT;
      if (s % 3 === 0) pts.push({ x, y, z });
      if (y < floorY) break;
    }
    return pts;
  }

  /* ---- possession ---- */
  function grab() {
    ball.holder = me();
    charging = false; charge = 0;
    hooks.send({ sub: "hold", holder: me(), t: Date.now() });
    hooks.sound?.catch?.();
  }

  // a click while not holding: pick up a loose ball, or try to strip the holder
  function click() {
    if (Date.now() < suppressClickUntil) return false;   // the shot release also fires a click
    if (ball.holder === me()) return false;               // shooting is hold-to-charge, not a click
    const c = hooks.ctx();
    const myY = (c.eyeY ?? 1.62) - 0.4;
    if (!ball.holder) {
      if (dist3(c.x, myY, c.z, ball.x, ball.y, ball.z) < PICKUP_R) { grab(); return true; }
      return false;
    }
    // someone holds it — strip attempt (range + cooldown + a coin-flip)
    if (Date.now() - lastSteal < STEAL_CD) return false;
    lastSteal = Date.now();
    const hp = holderPos();
    if (hp && dist3(c.x, myY, c.z, hp.x, hp.y - 0.4, hp.z) < STEAL_R) {
      hooks.send({ sub: "steal", target: ball.holder, from: me(), t: Date.now() });
      hooks.sound?.steal?.();
      if (Math.random() < STEAL_CHANCE) { grab(); hooks.toast?.("🤚 stolen!"); return true; }
      hooks.toast?.("missed the strip");
    }
    return false;
  }

  // the basket you're FACING (not the nearest): your gaze's x-sign picks the
  // east (+x) or west (-x) hoop. turn around and it flips to the far one.
  function facedHoop(c) {
    const fwdX = -Math.sin(c.yaw);
    const east = rig.hoops.find(h => h.side > 0), west = rig.hoops.find(h => h.side < 0);
    return (fwdX >= 0 ? east : west) || rig.hoops[0];
  }

  // dunk state for both the HUD meter and the shot itself: are you in the zone,
  // and is your jump at the top (the timing window)?
  function dunkInfo() {
    if (ball.holder !== me()) return { inZone: false, ready: false, phase: 0 };
    const c = hooks.ctx();
    const rim = facedHoop(c).rim;
    const flat = Math.hypot(c.x - rim.x, c.z - rim.z);
    const inZone = flat < DUNK_ZONE_R;
    const phase = Math.max(0, Math.min(1, (c.gymY || 0) / MAX_JUMP));
    return { inZone, ready: inZone && phase >= DUNK_WINDOW, phase, rim };
  }

  // which way a (non-dunk) shot flies. on mobile we AUTO-AIM horizontally at the
  // basket you latched when the wind-up began (the one you faced) with a fixed
  // high loft — direction is solved and the ONLY skill is how long you hold
  // (power). on desktop you free-aim with the camera.
  function aimDir(c, o) {
    if (hooks.autoAim && hooks.autoAim()) {
      const rim = (aimHoop || facedHoop(c)).rim;
      let hx = rim.x - o.x, hz = rim.z - o.z;
      const hl = Math.hypot(hx, hz) || 1, loft = 0.92, cp = Math.cos(loft);
      return { x: hx / hl * cp, y: Math.sin(loft), z: hz / hl * cp };
    }
    return launchDir(c.yaw, c.pitch);
  }

  function shoot() {
    if (ball.holder !== me()) return;
    const c = hooks.ctx();
    const o = myHand();
    const di = dunkInfo();
    let d, sp;
    if (di.ready) {
      // timed it right in the zone — an automatic SLAM, jammed straight down
      const rim = di.rim;
      ball.x = rim.x; ball.y = rim.y + 0.32; ball.z = rim.z;
      d = { x: 0, y: -0.8, z: 0 }; sp = 6;
      hooks.sound?.dunk?.();
    } else {
      d = aimDir(c, o); sp = speedFor(charge);
      ball.x = o.x; ball.y = o.y; ball.z = o.z;
      hooks.sound?.shoot?.(charge);
    }
    ball.holder = null;
    ball.vx = d.x * sp; ball.vy = d.y * sp; ball.vz = d.z * sp;
    ball.lastShotBy = me();
    ball.thrownFrom = { x: o.x, z: o.z };
    charging = false; charge = 0; aimHoop = null; rig.hideGuide(); hooks.setAimLock?.(null);
    suppressClickUntil = Date.now() + 350;
    hooks.send({ sub: "shot", p: [ball.x, ball.y, ball.z], v: [ball.vx, ball.vy, ball.vz], by: me(), t: Date.now() });
  }

  // an outlet pass: locks onto the teammate you're facing and lobs it GENTLY so
  // they have time to catch (grab it loose). no teammate in view → a soft throw
  // along your aim.
  function pass() {
    if (ball.holder !== me()) return;
    const c = hooks.ctx();
    const o = myHand();
    const tgt = hooks.passTarget?.();      // {x,y,z} of the best teammate, or null
    let d, sp;
    if (tgt) {
      const dx = tgt.x - o.x, dz = tgt.z - o.z, dist = Math.hypot(dx, dz) || 1;
      const up = 0.2 + Math.min(0.4, dist * 0.03);              // lead with a soft arc
      d = { x: dx / dist, y: up, z: dz / dist };
      const dl = Math.hypot(d.x, d.y, d.z); d.x /= dl; d.y /= dl; d.z /= dl;
      sp = Math.max(5.5, Math.min(8.5, dist * 1.4));            // gentle — catchable
    } else {
      d = { x: -Math.sin(c.yaw) * 0.97, y: 0.18, z: -Math.cos(c.yaw) * 0.97 };
      sp = 8;                                                    // slower than the old 12
    }
    ball.holder = null;
    ball.x = o.x; ball.y = o.y; ball.z = o.z;
    ball.vx = d.x * sp; ball.vy = d.y * sp; ball.vz = d.z * sp;
    ball.lastShotBy = null;              // a pass can't score — no own-basket flukes
    ball.thrownFrom = null;
    suppressClickUntil = Date.now() + 250;
    hooks.sound?.pass?.();
    hooks.send({ sub: "shot", p: [ball.x, ball.y, ball.z], v: [ball.vx, ball.vy, ball.vz], by: null, t: Date.now() });
  }

  /* ---- scoring (shooter-authoritative) ---- */
  function scoreBasket(hoop) {
    const team = hoop.side > 0 ? "red" : "blue";   // east hoop is red's to attack
    let pts = 2;
    if (ball.thrownFrom && Math.hypot(ball.thrownFrom.x - hoop.rim.x, ball.thrownFrom.z - hoop.rim.z) > THREE_R) pts = 3;
    score[team] += pts;
    rig.setScore(score.red, score.blue);
    hoop.swish?.();
    // the only particles in the game: a celebratory burst out of the hoop
    rig.burst?.(hoop.rim.x, hoop.rim.y, hoop.rim.z, team === "red" ? 0xff5a4d : 0x5a9bff, 34, 4.5);
    hooks.onScore?.(team, pts, score.red, score.blue);
    resetToCenter();
    hooks.send({ sub: "score", team, pts, red: score.red, blue: score.blue, t: Date.now() });
  }
  function resetToCenter() {
    ball.holder = null; ball.lastShotBy = null; ball.thrownFrom = null;
    ball.x = rig.info.x; ball.y = 1.2; ball.z = rig.info.z;
    ball.vx = ball.vy = ball.vz = 0;
  }

  /* ---- the projectile sim (one fixed substep) ---- */
  function step() {
    const mine = ball.lastShotBy === me();
    ball.vy -= G * DT;
    const sv = Math.hypot(ball.vx, ball.vy, ball.vz) || 1e-6, dr = DRAG * sv * DT;
    ball.vx -= dr * ball.vx; ball.vy -= dr * ball.vy; ball.vz -= dr * ball.vz;
    const py = ball.y;
    ball.x += ball.vx * DT; ball.y += ball.vy * DT; ball.z += ball.vz * DT;

    // floor: bounce a few times, then roll, then settle (a real ball stops —
    // no perpetual pinball, no machine-gun bounce ticks once it's calm)
    if (ball.y - ballR <= floorY) {
      ball.y = floorY + ballR;
      if (ball.vy < -REST_V) { ball.vy = -ball.vy * FLOOR_E; hooks.sound?.bounce?.(); }
      else if (ball.vy < 0) ball.vy = 0;                       // settle silently
      const k = Math.pow(ROLL_FRIC, DT); ball.vx *= k; ball.vz *= k;   // strong ground drag
      if (Math.hypot(ball.vx, ball.vz) < ROLL_STOP) { ball.vx = 0; ball.vz = 0; }
    }
    // ceiling
    if (ball.y + ballR >= ceilY && ball.vy > 0) { ball.y = ceilY - ballR; ball.vy = -ball.vy * CEIL_E; }
    // side/baseline walls
    if (ball.x - ballR < bounds.x0 && ball.vx < 0) { ball.x = bounds.x0 + ballR; ball.vx = -ball.vx * WALL_E; }
    if (ball.x + ballR > bounds.x1 && ball.vx > 0) { ball.x = bounds.x1 - ballR; ball.vx = -ball.vx * WALL_E; }
    if (ball.z - ballR < bounds.z0 && ball.vz < 0) { ball.z = bounds.z0 + ballR; ball.vz = -ball.vz * WALL_E; }
    if (ball.z + ballR > bounds.z1 && ball.vz > 0) { ball.z = bounds.z1 - ballR; ball.vz = -ball.vz * WALL_E; }

    for (const h of rig.hoops) {
      // backboard (banks). board sits at x = bx, facing centre; the ball
      // approaches from the centre side toward the baseline.
      const bb = h.backboard, s = h.side;
      const into = s > 0 ? (ball.vx > 0 && ball.x + ballR >= bb.x) : (ball.vx < 0 && ball.x - ballR <= bb.x);
      if (into && ball.z > bb.z0 && ball.z < bb.z1 && ball.y > bb.y0 && ball.y < bb.y1) {
        ball.x = bb.x - s * ballR; ball.vx = -ball.vx * BB_E; ball.vy *= 0.94; ball.vz *= 0.86;
        hooks.sound?.bank?.();
      }
      // rim torus — nearest point on the ring
      const rim = h.rim, dx = ball.x - rim.x, dz = ball.z - rim.z, hd = Math.hypot(dx, dz);
      if (hd > 1e-4) {
        const nx = rim.x + dx / hd * h.rimR, nz = rim.z + dz / hd * h.rimR;
        const ex = ball.x - nx, ey = ball.y - rim.y, ez = ball.z - nz, ed = Math.hypot(ex, ey, ez);
        if (ed < ballR + WIRE_R) {
          const inv = 1 / (ed || 1), Nx = ex * inv, Ny = ey * inv, Nz = ez * inv;
          const vn = ball.vx * Nx + ball.vy * Ny + ball.vz * Nz;
          if (vn < 0) { const j = (1 + RIM_E) * vn; ball.vx -= j * Nx; ball.vy -= j * Ny; ball.vz -= j * Nz; }
          const push = ballR + WIRE_R - ed; ball.x += Nx * push; ball.y += Ny * push; ball.z += Nz * push;
          hooks.sound?.rim?.();
        }
      }
      // a make — only the shooter calls it (authority); a pass can't score
      if (mine && ball.lastShotBy && py > rim.y && ball.y <= rim.y && ball.vy < 0 && hd < h.rimR - ballR * 0.12) {
        scoreBasket(h);
        return;     // ball is reset; stop stepping this frame
      }
    }
  }

  /* ---- per-frame ---- */
  function tick(dt) {
    dt = Math.min(dt, 0.05);
    rig.updateParticles?.(dt);
    if (ball.holder) {
      const hp = ball.holder === me() ? myHand() : peerHand(ball.holder);
      if (hp) {
        const bob = charging ? -charge * 0.08 : Math.sin(performance.now() / 220) * 0.015;  // steady, faint dribble
        ball.x = hp.x; ball.y = hp.y + bob; ball.z = hp.z;
      }
      // my shot: hold to wind up, release to fire
      if (ball.holder === me() && hooks.ctx().locked) {
        const pressed = hooks.ctx().pressed;
        if (pressed) {
          if (!charging) aimHoop = facedHoop(hooks.ctx());   // latch the basket you're facing
          charging = true; charge = Math.min(1, charge + dt / CHARGE_T);
        } else if (charging && !pressed) { shoot(); }
        if (charging) {
          const auto = hooks.autoAim && hooks.autoAim();
          if (auto) {
            // mobile: hide the arc (power-by-feel is the skill) and lock the
            // camera/crosshair onto the latched backboard so you see the target
            rig.hideGuide();
            const h = aimHoop || facedHoop(hooks.ctx());
            hooks.setAimLock?.({ x: h.backboard.x, y: 3.4, z: h.rim.z });
          } else {
            const o = myHand(); rig.setArc(arcPts(o, aimDir(hooks.ctx(), o), speedFor(charge)));
          }
          hooks.power?.(charge);
        } else { rig.hideGuide(); hooks.power?.(0); hooks.setAimLock?.(null); }
      } else { rig.hideGuide(); hooks.setAimLock?.(null); }
    } else {
      // loose: fixed-step the projectile
      rig.hideGuide();
      acc += dt;
      while (acc >= DT) { step(); acc -= DT; if (ball.holder) break; }   // step() may grab via score-reset
    }
    mesh.position.set(ball.x, ball.y, ball.z);
    ball.spin -= dt * (3 + Math.hypot(ball.vx, ball.vz) * 1.2);
    mesh.rotation.x = ball.spin;
    // fade the ball while YOU hold it (it sits right in your face) so you can
    // see the court in front of you; opaque for everyone else / when loose
    const heldByMe = ball.holder === me();
    mesh.material.transparent = true;
    mesh.material.opacity = heldByMe ? 0.4 : 1;
    if (mesh.children[0]) mesh.children[0].material.opacity = heldByMe ? 0.08 : 0.28;
  }

  /* ---- incoming presence ---- */
  function recv(p) {
    if (p.sub === "hold") {
      if (p.holder === me()) return;          // my own claim, already applied
      ball.holder = p.holder;
      charging = false; charge = 0;
      hooks.sound?.catch?.();
    } else if (p.sub === "shot") {
      ball.holder = null;
      ball.x = p.p[0]; ball.y = p.p[1]; ball.z = p.p[2];
      ball.vx = p.v[0]; ball.vy = p.v[1]; ball.vz = p.v[2];
      ball.lastShotBy = p.by || null;         // only the real shooter scores; null for a pass
      ball.thrownFrom = p.by ? { x: p.p[0], z: p.p[2] } : null;
      charging = false; charge = 0;
      acc = 0;
      hooks.sound?.shoot?.(0.5);
    } else if (p.sub === "score") {
      score.red = p.red; score.blue = p.blue;
      rig.setScore(p.red, p.blue);
      const h = rig.hoops.find(hh => (hh.side > 0 ? "red" : "blue") === p.team);
      h?.swish?.();
      if (h) rig.burst?.(h.rim.x, h.rim.y, h.rim.z, p.team === "red" ? 0xff5a4d : 0x5a9bff, 34, 4.5);
      hooks.onScore?.(p.team, p.pts, p.red, p.blue);
      resetToCenter();
    } else if (p.sub === "steal") {
      hooks.sound?.steal?.();
      hooks.onSteal?.(p.from, p.target);
    }
  }

  function reset() {
    ball.holder = null; ball.lastShotBy = null; ball.thrownFrom = null;
    ball.x = rig.info.x; ball.y = ballR; ball.z = rig.info.z;
    ball.vx = ball.vy = ball.vz = 0;
    charging = false; charge = 0; acc = 0;
    rig.hideGuide();
  }
  // leaving the gym while holding: drop it loose so it isn't carried away
  function leave() {
    if (ball.holder === me()) {
      ball.holder = null;
      hooks.send({ sub: "shot", p: [ball.x, ball.y, ball.z], v: [0, -1, 0], by: null, t: Date.now() });
    }
    charging = false; charge = 0; rig.hideGuide();
  }

  return {
    tick, click, pass, shoot, recv, reset, leave, dunk: dunkInfo,
    score, holder: () => ball.holder, haveBall: () => ball.holder === me(),
    stamina: () => 1,
    debug: () => ({ holder: ball.holder, charge: +charge.toFixed(2), red: score.red, blue: score.blue,
                    pos: [+ball.x.toFixed(1), +ball.y.toFixed(1), +ball.z.toFixed(1)] }),
  };
}
