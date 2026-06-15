/* ============================================================
   THE METRO — ARCADE BASKETBALL (pop-a-shot)
   A 60-second rapid-fire shootout against the clock. You stand at
   the line and arc a 3D ball at the hoop — gravity does the rest.
   The skill is the arc: too short clanks the front rim, too long
   banks long off the back; a clean swish is worth more than a
   rim-rattle. A slight hand-sway + the clock keep it honest, so the
   leaderboard means something.

   world.js owns the meshes (hoop, rim, net, balls, the guide arc,
   the shot-clock + leaderboard panels); this file is the game — aim,
   power, the projectile sim with rim/backboard/floor bounces, scoring
   and the timer. No three.js here; mesh positions are plain writes.
   ============================================================ */

const G = 9.8;
const DT = 1 / 180;            // fixed sim substep
const MIN_SPEED = 5.0;         // m/s at no charge — makeable band (~6.0-6.3) sits mid-bar
const MAX_SPEED = 7.0;         // m/s at full charge
const CHARGE_T = 0.85;         // seconds hold to full power
const REST_POWER = 0.55;       // preview-arc power before you charge
const SWAY_AMP = 0.009;        // radians (~0.5°) — a little wobble
const RELOAD = 0.48;           // seconds between a shot and the next ball in hand
const GAME_TIME = 60;          // a real arcade minute
const READY_TIME = 2.2;        // 3-2-1 countdown before the clock starts
const FOV = 56;                // frames the hoop + the arc apex
const CAM_PITCH = 0.45;        // look UP at the hoop (not along the steep launch)
const WIRE_R = 0.02;           // rim tube radius (for bounce maths)
const RIM_E = 0.46, BB_E = 0.55, FLOOR_E = 0.5;
const SWISH = 3, RIMIN = 2;    // clean swish beats a rim-rattle make

export function initBasket(h, opts = {}) {
  const snd = opts.sound || {};
  const hud = opts.hud || {};
  const cam = opts.camera;
  const onScore = opts.onScore || (() => {});      // (finalScore) => submit to leaderboard
  let youName = (opts.youName || "YOU").slice(0, 14);

  const rim = h.rim;                               // {x,y,z} rim centre (world)
  const rimR = h.rimR, ballR = h.ballR;
  const BB = h.backboard;                          // {z, x0, x1, y0, y1} front face
  const floorY = h.floorY ?? 0;
  const eyeY = h.oche.eyeY, oX = h.oche.x, oZ = h.oche.z;
  const P0 = { x: oX, y: eyeY - 0.12, z: oZ + 0.12 };  // the hand (centred on the rim)
  const meshes = h.balls;                          // pool of ball meshes
  const handMesh = h.handBall;

  let playing = false, started = false;
  let phase = "idle";          // idle | ready | play | over
  let timeLeft = GAME_TIME, readyCd = 0;
  let score = 0, made = 0, shots = 0, streak = 0, best = 0;
  let aimYaw = 0, aimPitch = 0.95, power = 0, charging = false, swayT = 0;
  let inHand = true, reloadCd = 0;
  let overLatch = false;
  const balls = [];            // active flying balls
  let meshCursor = 0;

  function sway() {
    return {
      y: SWAY_AMP * (Math.sin(swayT * 1.4) * 0.6 + Math.sin(swayT * 0.83 + 1.0) * 0.4),
      p: SWAY_AMP * (Math.sin(swayT * 1.1 + 1.7) * 0.6 + Math.sin(swayT * 0.67 + 0.3) * 0.4),
    };
  }
  function dir(yaw, pitch) {
    const cp = Math.cos(pitch);
    return { x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: Math.cos(yaw) * cp };
  }
  function speedFor(p) { return MIN_SPEED + (MAX_SPEED - MIN_SPEED) * p; }

  /* ---- the aim guide: a faint parabola (no make/miss tell — read it) ---- */
  function arcPts(yaw, pitch, speed) {
    const d = dir(yaw, pitch);
    let x = P0.x, y = P0.y, z = P0.z, vx = d.x * speed, vy = d.y * speed, vz = d.z * speed;
    const pts = [{ x, y, z }];
    for (let s = 0; s < 360; s++) {
      vy -= G * DT; x += vx * DT; y += vy * DT; z += vz * DT;
      if (s % 2 === 0) pts.push({ x, y, z });
      if (y < floorY || z > BB.z + 0.25) break;
    }
    return pts;
  }
  function showAim() {
    const s = sway();
    h.setArc(arcPts(aimYaw + s.y, aimPitch + s.p, speedFor(charging ? power : REST_POWER)));
  }

  function placeCamera() {
    if (!cam) return;
    cam.position.set(oX, eyeY, oZ);
    cam.rotation.order = "YXZ";
    cam.rotation.y = aimYaw + Math.PI;          // pan left/right with aim
    // look at the hoop, not along the steep launch angle — the arc shows the
    // shot; the view just keeps the rim framed (with a little pitch response)
    cam.rotation.x = CAM_PITCH + (aimPitch - 0.95) * 0.3;
    cam.rotation.z = 0;
    if (cam.fov !== FOV) { cam.fov = FOV; cam.updateProjectionMatrix(); }
  }

  /* ---- shooting ---- */
  function shoot() {
    const s = sway();
    const d = dir(aimYaw + s.y, aimPitch + s.p), sp = speedFor(power);
    const mi = meshCursor; meshCursor = (meshCursor + 1) % meshes.length;
    balls.push({ mi, x: P0.x, y: P0.y, z: P0.z, vx: d.x * sp, vy: d.y * sp, vz: d.z * sp,
      scored: false, touchedRim: false, bounces: 0, age: 0, dead: false });
    inHand = false; reloadCd = RELOAD; shots++;
    snd.shoot && snd.shoot(power);
  }

  function onMake(b) {
    streak++;
    const fire = streak >= 3;
    const pts = (b.touchedRim ? RIMIN : SWISH) + (fire ? 1 : 0);
    score += pts; made++;
    snd.score && snd.score(b.touchedRim ? 0 : 1);
    h.swish && h.swish();
    hud.pop && hud.pop(`+${pts}${fire ? "  🔥" : b.touchedRim ? "" : "  SWISH!"}`);
  }

  function stepBall(b) {
    const py = b.y;
    b.vy -= G * DT; b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT; b.age += DT;

    // backboard (bank shots)
    if (b.vz > 0 && b.z + ballR > BB.z && b.x > BB.x0 && b.x < BB.x1 && b.y > BB.y0 && b.y < BB.y1) {
      b.z = BB.z - ballR; b.vz = -b.vz * BB_E; b.vx *= 0.8; b.vy *= 0.92; b.touchedRim = true;
      snd.bank && snd.bank();
    }
    // rim — nearest point on the ring, bounce off it
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
    // score: dropping down through the hoop
    if (!b.scored && py > rim.y && b.y <= rim.y && b.vy < 0 && hd < rimR - ballR * 0.15) onMake(b);
    // floor
    if (b.y - ballR <= floorY) {
      b.y = floorY + ballR; b.vy = -b.vy * FLOOR_E; b.vx *= 0.7; b.vz *= 0.7; b.bounces++;
      if (Math.abs(b.vy) > 1) snd.bounce && snd.bounce();
    }
    if (b.bounces > 2 || b.age > 3.8 || (b.scored && b.y < rim.y - 0.6)) {
      if (!b.scored) streak = 0;            // a clean miss snaps the streak
      b.dead = true;
    }
  }

  /* ---- lifecycle ---- */
  function newGame() {
    for (const b of balls) meshes[b.mi].visible = false;
    balls.length = 0;
    score = 0; made = 0; shots = 0; streak = 0;
    timeLeft = GAME_TIME; readyCd = READY_TIME; phase = "ready";
    aimYaw = 0; aimPitch = 0.95; power = 0; charging = false;
    inHand = false; reloadCd = 0.3;
    started = true;
    display();
  }
  function endGame() {
    phase = "over"; best = Math.max(best, score);
    inHand = false; handMesh.visible = false;
    h.hideGuide();
    snd.buzzer && snd.buzzer();
    onScore(score);                          // push to the leaderboard
    hud.over && hud.over(`TIME! you scored ${score} — ${made}/${shots} made. PLAY again?`);
    display();
  }

  function display() {
    h.setDisplay && h.setDisplay({
      phase, score, made, shots, streak,
      time: phase === "ready" ? Math.ceil(readyCd) : Math.ceil(timeLeft),
      ready: phase === "ready",
    });
    hud.status && hud.status(
      phase === "over" ? `FINAL ${score}` :
      phase === "ready" ? "GET READY…" :
      `${Math.ceil(timeLeft)}s   ·   ${score}` + (streak >= 3 ? "   🔥 ON FIRE" : ""));
  }

  /* ---- per-frame ---- */
  function update(dt, input) {
    if (!playing) return;
    dt = Math.min(dt, 0.05);
    swayT += dt;
    placeCamera();

    if (phase === "over") {
      if (input && input.charging && !overLatch) { overLatch = true; newGame(); }
      if (input && !input.charging) overLatch = false;
      return;
    }
    if (phase === "ready") {
      readyCd -= dt;
      if (input) { aimYaw += input.aimX || 0; aimPitch = clampPitch(aimPitch + (input.aimY || 0)); }
      showAim();
      if (Math.ceil(readyCd) !== lastReadyShown) { lastReadyShown = Math.ceil(readyCd); display(); }
      if (readyCd <= 0) { phase = "play"; inHand = true; display(); }
      return;
    }

    // phase === "play"
    timeLeft -= dt;
    if (input) {
      aimYaw += input.aimX || 0;
      aimPitch = clampPitch(aimPitch + (input.aimY || 0));
      if (input.charging) { charging = true; power = Math.min(1, (power || 0) + dt / CHARGE_T); }
      else if (charging) { const p = power; charging = false; power = 0; if (p > 0.05 && inHand) shoot(); }
    }
    if (!inHand) { reloadCd -= dt; if (reloadCd <= 0) inHand = true; }

    // step every ball through fixed substeps
    let acc = dt;
    while (acc >= DT) { for (const b of balls) if (!b.dead) stepBall(b); acc -= DT; }
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i], m = meshes[b.mi];
      if (b.dead) { m.visible = false; balls.splice(i, 1); }
      else { m.position.set(b.x, b.y, b.z); m.visible = true; }
    }
    // the ball in your hands, ready to fire
    if (inHand) { handMesh.position.set(P0.x, P0.y - 0.02, P0.z); handMesh.visible = true; }
    else handMesh.visible = false;

    showAim();
    hud.power && hud.power(charging ? power : 0);
    display();

    if (timeLeft <= 0) endGame();
  }
  let lastReadyShown = -1;
  function clampPitch(p) { return Math.max(0.5, Math.min(1.3, p)); }

  /* ---- dock / undock ---- */
  function dock() {
    playing = true;
    if (!started || phase === "over") newGame();    // a fresh minute
    else display();                                 // resume a paused run
    return h.oche;
  }
  function undock() {                                // leaving pauses the clock
    playing = false; charging = false; power = 0;
    handMesh.visible = false; h.hideGuide();
    if (cam) { cam.fov = opts.baseFov || 72; cam.updateProjectionMatrix(); }
  }
  function reset() { newGame(); }

  return {
    dock, undock, update, reset,
    isPlaying: () => playing,
    setName: (n) => { youName = (n || "YOU").slice(0, 14); },
    _debugShoot: (p, pitch) => { if (pitch != null) aimPitch = pitch; power = Math.max(0, Math.min(1, p)); if (phase === "play") { inHand = true; shoot(); } power = 0; },
    _debug: () => ({ phase, timeLeft: +timeLeft.toFixed(1), score, made, shots, streak, balls: balls.length, inHand }),
  };
}
