/* ============================================================
   THE METRO — DARTS (501)
   Turn-based, deliberate — but the skill is REAL: a 3D projectile
   that GRAVITY arcs downward across the ~2.4 m throw, so you must
   aim above the bull and/or add power to beat the drop. A slow,
   learnable hand-sway means you can't pin a pixel on the treble-20
   (slow on purpose — sway is skill, not the air-hockey "chaos" trap).

   world.js owns every mesh (board, darts, the faint guide arc + the
   reticle, the scoreboard); we drive them through `h`'s render hooks.
   This file is pure logic + maths — no three.js — so all the vector
   work that needs THREE lives over in world.js.

   Coordinates: the board hangs on the north wall facing the room.
   "view space" (vx, vy) is how the thrower sees the face — vx to
   their right (= world -x), vy up. scoreAt() and the printed board
   share that space by construction, so they can never disagree.
   ============================================================ */

const G = 9.8;                 // gravity — the whole challenge
const DT = 1 / 240;            // fixed sim substep
const MIN_SPEED = 6.6;         // m/s at no charge (big arc, big drop)
const MAX_SPEED = 11.4;        // m/s at full charge (flatter, less drop)
const CHARGE_T = 1.0;          // seconds hold to full power
const REST_POWER = 0.5;        // preview power shown before you charge
const SWAY_AMP = 0.0135;       // radians (~0.77°) — slow hand wobble
const CPU_ERR = 0.052;         // metres of landing spread (beatable)
const BETWEEN = 0.8;           // seconds a landed dart lingers before the next
const START_SCORE = 501;
const AIM_FOV = 36;            // zoom in on the board while throwing (real distance stays)
const SPECTATE_FOV = 50;       // CPU's turn: pull back + widen so the whole board frames up

export function initDarts(h, opts = {}) {
  const net = opts.net || null;
  const snd = opts.sound || {};
  const hud = opts.hud || {};
  const cam = opts.camera;
  let youName = (opts.youName || "YOU").slice(0, 12);
  let oppName = (opts.oppName || "CPU").slice(0, 12);

  const cx = h.center.x, cy = h.center.y, boardZ = h.center.z;
  const ocheZ = h.oche.z, eyeY = h.oche.eyeY;
  // launch point: a touch below + ahead of the eye, like a real hand throw.
  // the guide is computed from the SAME P0, so what you see is what you get.
  const P0 = { x: cx, y: eyeY - 0.05, z: ocheZ + 0.14 };
  const floorY = h.floorY ?? 0;
  const scoreAt = h.scoreAt;
  const R = h.rings;            // ring radii (metres) — shared with the board art
  const SEG = h.seg;            // segment numbers clockwise from the top

  let playing = false, started = false;
  let phase = "aim";           // aim | flying | between | aimCPU | over
  let turn = "you";            // you | cpu
  let score = { you: START_SCORE, cpu: START_SCORE };
  let turnStart = START_SCORE; // score at the top of the turn (for bust revert)
  let dartsLeft = 3;
  let turnLabels = { you: [], cpu: [] };
  let turnEnding = false;
  let aimYaw = 0, aimPitch = 0.07;   // start pointed a hair high, at the bull
  let power = 0, charging = false;
  let swayT = 0;
  let cpuWait = 0, betweenCd = 0;
  let flight = null;           // {pts, t, dur}
  let pending = null;          // {world, view, dir, result, shooter}
  let overMsg = "";
  let overLatch = false;
  let peer = null, packetId = 0;
  const netQueue = [];
  const baseFov = cam ? cam.fov : 72;

  /* ---------- sway: slow, deterministic, learnable ---------- */
  function sway() {
    const y = SWAY_AMP * (Math.sin(swayT * 1.30) * 0.6 + Math.sin(swayT * 0.73 + 1.1) * 0.4);
    const p = SWAY_AMP * (Math.sin(swayT * 1.07 + 2.0) * 0.6 + Math.sin(swayT * 0.61 + 0.4) * 0.4);
    return { y, p };
  }
  function dirFrom(yaw, pitch) {
    const cp = Math.cos(pitch);
    return { x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: Math.cos(yaw) * cp };
  }
  function speedFor(p) { return MIN_SPEED + (MAX_SPEED - MIN_SPEED) * p; }

  /* ---------- the throw, integrated (player path) ---------- */
  function simulate(yaw, pitch, speed) {
    const d = dirFrom(yaw, pitch);
    let x = P0.x, y = P0.y, z = P0.z;
    let vx = d.x * speed, vy = d.y * speed, vz = d.z * speed;
    const pts = [{ x, y, z }];
    let steps = 0, world = null, dur = 0;
    while (steps < 2000) {
      const px = x, py = y, pz = z;
      vy -= G * DT; x += vx * DT; y += vy * DT; z += vz * DT; dur += DT; steps++;
      if (z >= boardZ) {                       // crossed the board plane
        const f = (boardZ - pz) / ((z - pz) || 1);
        x = px + (x - px) * f; y = py + (y - py) * f; z = boardZ;
        pts.push({ x, y, z }); world = { x, y, z, onBoard: true }; break;
      }
      if (y <= floorY) {                       // fell short — into the floor
        const f = (floorY - py) / ((y - py) || -1);
        x = px + (x - px) * f; y = floorY; z = pz + (z - pz) * f;
        pts.push({ x, y, z }); world = { x, y, z, onBoard: false }; break;
      }
      if (steps % 2 === 0) pts.push({ x, y, z });
    }
    if (!world) world = { x, y, z, onBoard: false };
    const vxv = -(world.x - cx), vyv = world.y - cy;
    const onScore = world.onBoard && Math.hypot(vxv, vyv) <= R.boardR;
    const result = onScore ? scoreAt(vxv, vyv)
                           : { value: 0, mult: 0, label: "MISS", region: "miss", isDouble: false };
    return { pts, world, view: { x: vxv, y: vyv }, dir: { x: vx, y: vy, z: vz },
             dur: Math.max(dur, 0.12), result };
  }

  /* a cheap parabola from P0 to a known landing — used for CPU darts and for
     a remote player's darts, where we only know where it lands, not the throw */
  function arcTo(world) {
    const pts = [], N = 16;
    const peak = Math.max(0.25, (P0.y + world.y) / 2 + 0.35);  // a believable hump
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = P0.x + (world.x - P0.x) * t;
      const z = P0.z + (world.z - P0.z) * t;
      const y = (1 - t) * P0.y + t * world.y + Math.sin(t * Math.PI) * (peak - (P0.y + world.y) / 2);
      pts.push({ x, y, z });
    }
    const dir = { x: world.x - pts[N - 1].x, y: world.y - pts[N - 1].y, z: world.z - pts[N - 1].z };
    return { pts, dir, dur: 0.55 };
  }

  /* ---------- aim guide ---------- */
  function showAim() {
    const s = sway();
    const sim = simulate(aimYaw + s.y, aimPitch + s.p, speedFor(charging ? power : REST_POWER));
    h.setArc(sim.pts, 0.55);                  // a short, faint arc — readable, not a cheat
    h.setReticle(sim.world);                  // where it'd land right now (drifts with sway)
  }
  function hideGuide() { h.hideGuide(); }

  function placeCamera() {
    if (!cam) return;
    cam.rotation.order = "YXZ";
    cam.rotation.z = 0;
    if (turn === "cpu") {
      // spectating: pull the camera back + down and centre it on the board so
      // the whole face frames up while the CPU throws (no leftover player aim)
      const camY = eyeY - 0.18, camZ = ocheZ - 0.55;
      cam.position.set(cx, camY, camZ);
      cam.rotation.y = Math.PI;
      cam.rotation.x = Math.atan2(cy - camY, boardZ - camZ);
      if (cam.fov !== SPECTATE_FOV) { cam.fov = SPECTATE_FOV; cam.updateProjectionMatrix(); }
    } else {
      cam.position.set(cx, eyeY, ocheZ);
      cam.rotation.y = aimYaw + Math.PI;      // face the board (+z), aim turns the view
      cam.rotation.x = aimPitch;
      if (cam.fov !== AIM_FOV) { cam.fov = AIM_FOV; cam.updateProjectionMatrix(); }
    }
  }

  /* ---------- throwing ---------- */
  function strike() {
    const s = sway();
    const sim = simulate(aimYaw + s.y, aimPitch + s.p, speedFor(power));
    pending = { ...sim, shooter: turn };
    flight = { pts: sim.pts, t: 0, dur: sim.dur };
    phase = "flying";
    hideGuide();
    snd.throw && snd.throw(power);
    if (net && peer && turn === "you") sendThrow(sim.world, sim.result);
    power = 0; charging = false;
  }

  /* land the held dart, apply 501, decide what comes next */
  function applyResult(sim, shooter) {
    const r = sim.result;
    h.placeDart(3 - dartsLeft, sim.world, sim.dir, sim.world.onBoard);
    turnLabels[shooter].push(r.label);
    snd.hit && snd.hit(r);

    const rem = score[shooter] - r.value;
    let bust = false, win = false;
    // 501: exactly zero, finished on a double; 1 or below-zero is a bust
    if (rem < 0 || rem === 1 || (rem === 0 && !r.isDouble)) bust = true;
    else { score[shooter] = rem; if (rem === 0) win = true; }
    dartsLeft--;

    if (win) { status(); endGame(shooter); return; }
    if (bust) { score[shooter] = turnStart; snd.bust && snd.bust(); turnEnding = true; }
    else if (dartsLeft <= 0) turnEnding = true;

    phase = "between"; betweenCd = BETWEEN;
    status();
  }

  function nextAfterThrow() {
    if (phase === "over") return;
    if (turnEnding) { handoff(); return; }
    // same shooter, next dart — the stuck darts stay on the board
    if (turn === "you") phase = "aim";
    else { phase = "aimCPU"; if (!peer) cpuWait = 0.7; }
    showAimIfMine();
  }

  function handoff() {
    const finished = turn;
    h.clearDarts();
    turnLabels[finished] = [];
    turn = finished === "you" ? "cpu" : "you";
    turnStart = score[turn];
    dartsLeft = 3; turnEnding = false; turnLabels[turn] = [];
    phase = turn === "you" ? "aim" : "aimCPU";
    if (turn === "cpu" && !peer) cpuWait = 0.85;
    status();
    showAimIfMine();
  }

  function showAimIfMine() { if (phase === "aim") showAim(); }

  function endGame(winner) {
    phase = "over"; started = false;
    overMsg = winner === "you" ? "GAME SHOT — YOU WIN" : `${oppName} CHECKS OUT`;
    snd.win && snd.win();
    status();
    hud.over && hud.over(overMsg + " — RESET to throw again");
  }

  /* ---------- CPU: aims true-ish, misses like a person ---------- */
  function segIndex(n) { return SEG.indexOf(n); }
  function pointAt(n, rMid) {
    const deg = segIndex(n) * 18, rad = deg * Math.PI / 180;
    return { x: Math.sin(rad) * rMid, y: Math.cos(rad) * rMid };
  }
  function cpuTarget() {
    const rem = score.cpu;
    if (rem === 50) return { x: 0, y: 0 };                       // bull checkout
    if (rem <= 40 && rem % 2 === 0) return pointAt(rem / 2, (R.dblIn + R.dblOut) / 2);
    if (rem <= 40 && rem % 2 === 1) return pointAt(Math.max(1, rem - 1), (R.bull25 + R.tripIn) / 2 + 0.04); // shave to an even number
    if (rem > 100) return pointAt(20, (R.tripIn + R.tripOut) / 2);   // treble-20 hunting
    if (rem > 60) return pointAt(20, (R.tripIn + R.tripOut) / 2);
    // 41..60: take a fat single to set up a double next visit
    return pointAt(20, (R.tripOut + R.dblIn) / 2);
  }
  function cpuShoot() {
    const t = cpuTarget();
    const ex = (Math.random() + Math.random() - 1) * CPU_ERR;
    const ey = (Math.random() + Math.random() - 1) * CPU_ERR;
    const vxv = t.x + ex, vyv = t.y + ey;
    const onScore = Math.hypot(vxv, vyv) <= R.boardR;
    const result = onScore ? scoreAt(vxv, vyv)
                           : { value: 0, mult: 0, label: "MISS", region: "miss", isDouble: false };
    const world = { x: cx - vxv, y: cy + vyv, z: boardZ, onBoard: onScore };
    const a = arcTo(world);
    pending = { world, view: { x: vxv, y: vyv }, dir: a.dir, result, shooter: "cpu" };
    flight = { pts: a.pts, t: 0, dur: a.dur };
    phase = "flying";
    snd.throw && snd.throw(0.6);
  }

  /* ---------- HUD ---------- */
  function boardData() {
    return {
      you: { name: youName, score: score.you, darts: turn === "you" ? turnLabels.you : [] },
      opp: { name: oppName, score: score.cpu, darts: turn === "cpu" ? turnLabels.cpu : [] },
      turn, dartsLeft, over: phase === "over" ? overMsg : null,
    };
  }
  function status() {
    let s;
    if (phase === "over") s = overMsg;
    else if (turn === "you") {
      const need = score.you;
      s = need <= 170 && need >= 2 ? `${need} LEFT · double out` : `${need} LEFT`;
    } else s = `${oppName} is throwing…`;
    hud.status && hud.status(s);
    h.setBoard && h.setBoard(boardData());
  }

  /* ---------- netcode: deterministic-result lockstep ----------
     Each dart is fully decided by where it lands (world + scored result).
     The thrower broadcasts that; every client runs the SAME 501 maths, so
     scores and turn order stay in step without streaming any physics. */
  function sendThrow(world, result) {
    net.send({ game: "darts", sub: "throw", id: ++packetId,
      w: [+world.x.toFixed(3), +world.y.toFixed(3), +world.z.toFixed(3)], on: world.onBoard ? 1 : 0,
      r: { value: result.value, mult: result.mult, label: result.label, region: result.region, isDouble: result.isDouble } });
  }
  function applyRemoteThrow(p) {
    const world = { x: p.w[0], y: p.w[1], z: p.w[2], onBoard: !!p.on };
    const a = arcTo(world);
    pending = { world, view: { x: -(world.x - cx), y: world.y - cy }, dir: a.dir, result: p.r, shooter: "cpu" };
    flight = { pts: a.pts, t: 0, dur: a.dur };
    phase = "flying";
  }
  function handleNet(p) {
    if (!net || p.game !== "darts") return;
    if (p.sub === "sit") {            // someone took the open seat
      if (playing && !peer) {
        peer = { uid: p.uid }; oppName = (p.name || "P2").slice(0, 12);
        net.send({ game: "darts", sub: "host", to: p.uid, uid: net.myUid, name: youName });
        startVersus(net.myUid < p.uid);
      }
      return;
    }
    if (p.sub === "host") {           // the seat-holder answered our sit
      if (p.to === net.myUid && !peer) {
        peer = { uid: p.uid }; oppName = (p.name || "P2").slice(0, 12);
        startVersus(net.myUid < p.uid);
      }
      return;
    }
    if (p.sub === "throw") {
      if (p.id != null && p.id <= packetId) return;
      packetId = p.id;
      if (phase === "flying" || phase === "between") netQueue.push(p);
      else applyRemoteThrow(p);
    }
  }
  function startVersus(iStart) {
    // a real 1v1 — fresh leg, lower uid throws first so both sides agree
    score = { you: START_SCORE, cpu: START_SCORE };
    turnStart = START_SCORE; dartsLeft = 3; turnLabels = { you: [], cpu: [] };
    turnEnding = false; overMsg = ""; power = 0; charging = false;
    h.clearDarts();
    turn = iStart ? "you" : "cpu";
    phase = turn === "you" ? "aim" : "aimCPU";
    status(); showAimIfMine();
  }

  /* ---------- new game / reset ---------- */
  function newGame() {
    score = { you: START_SCORE, cpu: START_SCORE };
    turnStart = START_SCORE; dartsLeft = 3; turnLabels = { you: [], cpu: [] };
    turn = "you"; phase = "aim"; turnEnding = false; overMsg = "";
    aimYaw = 0; aimPitch = 0.07; power = 0; charging = false;
    h.clearDarts(); status();
  }

  /* ---------- per-frame ---------- */
  function update(dt, input) {
    if (!playing) return;
    dt = Math.min(dt, 0.05);
    swayT += dt;
    placeCamera();

    if (phase === "aim") {
      if (input) {
        aimYaw += input.aimX || 0;
        aimPitch = Math.max(-0.25, Math.min(0.5, aimPitch + (input.aimY || 0)));
        if (input.charging) { charging = true; power = Math.min(1, (power || 0) + dt / CHARGE_T); }
        else if (charging) { const p = power; charging = false; if (p > 0.04) { power = p; strike(); } else power = 0; }
      }
      if (phase === "aim") { showAim(); hud.power && hud.power(charging ? power : 0, charging); }
    } else if (phase === "aimCPU") {
      if (!peer) { cpuWait -= dt; if (cpuWait <= 0) cpuShoot(); }
      // with a live opponent we just wait for their throw packets
    } else if (phase === "flying") {
      flight.t += dt;
      const f = Math.min(1, flight.t / flight.dur);
      const pts = flight.pts, fi = f * (pts.length - 1);
      const i0 = Math.floor(fi), i1 = Math.min(pts.length - 1, i0 + 1), fr = fi - i0;
      const a = pts[i0], b = pts[i1];
      h.flyDart(a.x + (b.x - a.x) * fr, a.y + (b.y - a.y) * fr, a.z + (b.z - a.z) * fr, pending.dir);
      if (f >= 1) { h.hideFly(); applyResult(pending, pending.shooter); pending = null; }
    } else if (phase === "between") {
      betweenCd -= dt;
      if (betweenCd <= 0) {
        if (netQueue.length && turn !== "you") { applyRemoteThrow(netQueue.shift()); }
        else nextAfterThrow();
      }
    } else if (phase === "over") {
      if (input && input.charging && !overLatch) { overLatch = true; reset(); }
      if (input && !input.charging) overLatch = false;
    }
  }

  /* ---------- dock / undock ---------- */
  function dock() {
    playing = true;
    if (net) net.send({ game: "darts", sub: "sit", uid: net.myUid, name: youName });
    if (!started) { started = true; newGame(); }
    else status();
    return h.oche;
  }
  // walking away just PAUSES — score, turn and the rack of throws all stay.
  function undock() {
    playing = false; charging = false; power = 0; hideGuide(); h.hideFly();
    if (cam && cam.fov !== baseFov) { cam.fov = baseFov; cam.updateProjectionMatrix(); }
  }
  function reset() { started = true; newGame(); phase = "aim"; }

  return {
    dock, undock, update, handleNet, reset,
    isPlaying: () => playing,
    setName: (n) => { youName = (n || "YOU").slice(0, 12); },
    _debug: () => ({ phase, turn, dartsLeft, score, peer: !!peer, aimYaw, aimPitch }),
  };
}
