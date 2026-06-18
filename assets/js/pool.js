/* ============================================================
   THE METRO — POOL / 8-BALL
   Turn-based, deliberate, with a drawn aim line — on purpose. The
   physics follow the VRChat-pool model (see memory pool-physics-spec):
   a fixed-substep 2D simulation on the cloth plane, LINEAR rolling
   friction (not exponential — that's the whole "feel"), equal-mass
   ball collisions (e≈0.95), cushions (e≈0.82), pocket capture at 2.6R.

   world.js owns the meshes; we drive them. Coordinates are table-local
   metres: u = x-centre (length), w = z-centre (width). A ball's (u,w)
   is its mesh.position.(x,z) because the meshes live in a group at the
   table centre.
   ============================================================ */

const DT_SUB = 1 / 300;            // fixed physics substep
const MAX_DELTA = 0.05;
const FRICTION_A = 0.62;           // m/s² linear decay (cloth speed knob; tune)
const STOP_V = 0.012;              // below this a ball is stopped
const BALL_E = 0.95;               // ball-ball restitution
const CUSH_E = 0.82;               // cushion restitution
const MAX_POWER = 4.7;             // m/s at full charge
const MIN_POWER = 0.55;
const CHARGE_T = 1.25;             // seconds to full power

export function initPool(h, opts = {}) {
  const net = opts.net || null;
  const snd = opts.sound || {};
  const hud = opts.hud || {};
  const cam = opts.camera;
  let youName = (opts.youName || "YOU").slice(0, 12);
  let oppName = (opts.oppName || "CPU").slice(0, 12);

  const R = h.ballR, D = 2 * R;
  const HL = h.half.l, HW = h.half.w;
  const UWALL = HL - R, WWALL = HW - R;
  const CAPTURE = R * 2.7;
  const POCKET_GAP = h.pocketR + R;        // near a pocket mouth, rails give way
  const PX = h.center.x, PZ = h.center.z;

  // local state mirrors the world balls
  const balls = h.balls.map(b => ({
    id: b.id, type: b.type, mesh: b.mesh,
    u: 0, w: 0, vu: 0, vw: 0, active: true,
  }));
  const cue = balls[0];

  let playing = false;
  let started = false;                      // a game is racked & in progress
  let overClickLatch = false;
  let phase = "aim";                       // aim | rolling | aimCPU | over
  let turn = "you";                        // you | cpu
  let group = { you: null, cpu: null };    // 'solid' | 'stripe' | null (open)
  let open = true;
  let ballInHand = false;
  let aimYaw = 0;                          // shot direction (radians, table-local)
  let power = 0, charging = false;
  let cpuWait = 0;
  let overMsg = "";
  let shotInfo = null;                     // {firstHit, pocketed[]} accrued during a shot

  /* ---------- rack / reset ---------- */
  function placeBall(b, u, w) { b.u = u; b.w = w; b.vu = 0; b.vw = 0; }

  function rack() {
    for (const b of balls) { b.active = true; b.mesh.visible = true; }
    placeBall(cue, -HL * 0.5, 0);
    // standard-ish triangle at the foot spot: 8 in the centre, a stripe and a
    // solid in the back corners; the rest filled in
    const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
    const apex = HL * 0.42, dx = Math.sqrt(3) * R;
    let idx = 0;
    for (let row = 0; row < 5; row++) {
      for (let i = 0; i <= row; i++) {
        const b = balls[order[idx++]];
        placeBall(b, apex + row * dx, (i - row / 2) * D);
      }
    }
    placeMeshes();
  }

  function newGame() {
    group = { you: null, cpu: null };
    open = true; ballInHand = false; overMsg = "";
    turn = "you"; phase = "aim"; power = 0; charging = false;
    rack();
    // aim from the cue ball toward the rack to start
    aimYaw = 0;
    status();
  }

  function placeMeshes() {
    for (const b of balls) {
      if (b.active) { b.mesh.position.x = b.u; b.mesh.position.z = b.w; b.mesh.visible = true; }
      else b.mesh.visible = false;
    }
  }

  /* ---------- geometry helpers ---------- */
  const pockets = h.pockets;
  function nearPocket(u, w) {
    for (const p of pockets) if (Math.hypot(u - p.u, w - p.w) < CAPTURE) return p;
    return null;
  }
  function inPocketGapU(u) {                // is this u-position within a side/corner mouth on a long rail?
    return Math.abs(u) < POCKET_GAP || Math.abs(Math.abs(u) - HL) < POCKET_GAP;
  }
  function inPocketGapW(w) {                // corner mouth on a short rail
    return Math.abs(Math.abs(w) - HW) < POCKET_GAP;
  }

  /* ---------- physics ---------- */
  function step(dt) {
    // integrate + linear friction
    for (const b of balls) {
      if (!b.active) continue;
      const sp = Math.hypot(b.vu, b.vw);
      if (sp > 0) {
        const ns = Math.max(0, sp - FRICTION_A * dt);
        if (ns < STOP_V) { b.vu = 0; b.vw = 0; }
        else { b.vu *= ns / sp; b.vw *= ns / sp; }
      }
      b.u += b.vu * dt; b.w += b.vw * dt;
    }
    // ball-ball (equal mass): swap normal component, e≈0.95, push apart
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i]; if (!a.active) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j]; if (!b.active) continue;
        let du = a.u - b.u, dw = a.w - b.w;
        let dist = Math.hypot(du, dw);
        if (dist >= D || dist < 1e-6) continue;
        const nu = du / dist, nw = dw / dist;
        const rel = (a.vu - b.vu) * nu + (a.vw - b.vw) * nw;
        if (rel < 0) {
          const dv = (1 + BALL_E) * 0.5 * rel;
          a.vu -= dv * nu; a.vw -= dv * nw;
          b.vu += dv * nu; b.vw += dv * nw;
          const hardness = Math.min(1, -rel / 4);
          snd.click && snd.click(hardness);
          if (a.id === 0 || b.id === 0) {
            const other = a.id === 0 ? b : a;
            if (shotInfo && shotInfo.firstHit == null) shotInfo.firstHit = other;
          }
        }
        const overlap = (D - dist) * 0.5;   // separate so they don't sink in
        a.u += nu * overlap; a.w += nw * overlap;
        b.u -= nu * overlap; b.w -= nw * overlap;
      }
    }
    // cushions + pocket capture
    for (const b of balls) {
      if (!b.active) continue;
      const p = nearPocket(b.u, b.w);
      if (p) { pocket(b); continue; }
      if (b.u > UWALL && !inPocketGapW(b.w)) { b.u = UWALL; b.vu = -Math.abs(b.vu) * CUSH_E; railSnd(b); }
      else if (b.u < -UWALL && !inPocketGapW(b.w)) { b.u = -UWALL; b.vu = Math.abs(b.vu) * CUSH_E; railSnd(b); }
      if (b.w > WWALL && !inPocketGapU(b.u)) { b.w = WWALL; b.vw = -Math.abs(b.vw) * CUSH_E; railSnd(b); }
      else if (b.w < -WWALL && !inPocketGapU(b.u)) { b.w = -WWALL; b.vw = Math.abs(b.vw) * CUSH_E; railSnd(b); }
    }
  }

  function railSnd(b) { if (Math.abs(b.vu) + Math.abs(b.vw) > 0.6) snd.rail && snd.rail(); }

  function pocket(b) {
    b.active = false; b.vu = b.vw = 0; b.mesh.visible = false;
    snd.pocket && snd.pocket();
    if (shotInfo) shotInfo.pocketed.push(b);
  }

  function allStopped() {
    for (const b of balls) if (b.active && (b.vu || b.vw)) return false;
    return true;
  }

  /* ---------- aim prediction (the guide) ---------- */
  function predict(dirU, dirW) {
    // march the cue centre along the ray; nearest ball contact vs nearest rail
    let tBall = Infinity, hitBall = null;
    for (const b of balls) {
      if (!b.active || b.id === 0) continue;
      const rxu = b.u - cue.u, rxw = b.w - cue.w;
      const tc = rxu * dirU + rxw * dirW;
      if (tc < 0) continue;
      const d2 = rxu * rxu + rxw * rxw - tc * tc;
      if (d2 > D * D) continue;
      const t = tc - Math.sqrt(D * D - d2);
      if (t > 0 && t < tBall) { tBall = t; hitBall = b; }
    }
    // nearest rail (inset rectangle)
    let tWall = Infinity;
    if (dirU > 1e-6) tWall = Math.min(tWall, (UWALL - cue.u) / dirU);
    else if (dirU < -1e-6) tWall = Math.min(tWall, (-UWALL - cue.u) / dirU);
    if (dirW > 1e-6) tWall = Math.min(tWall, (WWALL - cue.w) / dirW);
    else if (dirW < -1e-6) tWall = Math.min(tWall, (-WWALL - cue.w) / dirW);
    if (hitBall && tBall <= tWall) {
      const gu = cue.u + dirU * tBall, gw = cue.w + dirW * tBall;
      let tu = hitBall.u - gu, tw = hitBall.w - gw;
      const tl = Math.hypot(tu, tw) || 1;
      return { end: [gu, gw], ghost: [gu, gw], target: hitBall, tdir: [tu / tl, tw / tl] };
    }
    const t = Math.max(0, tWall);
    return { end: [cue.u + dirU * t, cue.w + dirW * t], ghost: null, target: null };
  }

  function setLine(line, au, aw, bu, bw) {
    const pos = line.geometry.attributes.position;
    pos.setXYZ(0, au, h.surfaceY + 0.012, aw);
    pos.setXYZ(1, bu, h.surfaceY + 0.012, bw);
    pos.needsUpdate = true;
    line.visible = true;
  }
  function hideGuide() {
    h.aimLine.visible = false; h.targetLine.visible = false; h.ghost.visible = false;
    h.cueGrp.visible = false;
  }

  function showAim() {
    const du = Math.cos(aimYaw), dw = Math.sin(aimYaw);
    const pr = predict(du, dw);
    setLine(h.aimLine, cue.u, cue.w, pr.end[0], pr.end[1]);
    if (pr.ghost) {
      h.ghost.position.set(pr.ghost[0], h.surfaceY + 0.006, pr.ghost[1]);
      h.ghost.visible = true;
      const tl = 0.45;
      setLine(h.targetLine, pr.target.u, pr.target.w,
        pr.target.u + pr.tdir[0] * tl, pr.target.w + pr.tdir[1] * tl);
    } else { h.ghost.visible = false; h.targetLine.visible = false; }
    // cue stick behind the ball, pulled back with charge
    const pull = 0.07 + (charging ? power : 0) * 0.22;
    h.cueGrp.visible = true;
    h.cueGrp.position.set(cue.u - du * pull, h.surfaceY + R, cue.w - dw * pull);
    h.cueGrp.rotation.y = -aimYaw;
  }

  /* ---------- camera (we own it while playing) ---------- */
  function placeCamera() {
    if (!cam) return;
    const du = Math.cos(aimYaw), dw = Math.sin(aimYaw);
    const back = 0.92, height = 0.62;
    const cwx = PX + cue.u, cwz = PZ + cue.w;
    cam.position.set(cwx - du * back, h.surfaceY + height, cwz - dw * back);
    cam.rotation.order = "YXZ";
    cam.rotation.y = Math.atan2(-du, -dw);
    cam.rotation.x = -0.34;
  }

  /* ---------- shooting ---------- */
  function strike(angle, p) {
    aimYaw = angle;
    shotInfo = { firstHit: null, pocketed: [], shooter: turn };
    cue.vu = Math.cos(angle) * p;
    cue.vw = Math.sin(angle) * p;
    phase = "rolling";
    hideGuide();
    snd.strike && snd.strike(Math.min(1, p / MAX_POWER));
    if (net && turn === "you") sendShot(angle, p);
  }

  // whose-turn → which phase. with a real human peer the opponent's turn is a
  // passive "watch" (the network drives it); only solo-vs-CPU runs "aimCPU".
  function turnPhase(who) { return who === "you" ? "aim" : (peer ? "watch" : "aimCPU"); }

  /* ---------- end-of-shot rules (forgiving 8-ball) ---------- */
  function resolveShotEnd() {
    const info = shotInfo || { firstHit: null, pocketed: [] };
    const shooter = info.shooter || turn;
    const opp = shooter === "you" ? "cpu" : "you";
    const pocketed = info.pocketed;
    const cuePocketed = pocketed.some(b => b.id === 0);
    const eight = pocketed.find(b => b.id === 8);
    const objs = pocketed.filter(b => b.id !== 0 && b.id !== 8);

    // assign groups on the first legally-pocketed object ball
    if (open && objs.length && !cuePocketed) {
      const t = objs[0].type;                 // 'solid' | 'stripe'
      group[shooter] = t;
      group[opp] = t === "solid" ? "stripe" : "solid";
      open = false;
    }

    const myGroup = group[shooter];
    const clearedMine = myGroup && !balls.some(b => b.active && b.type === myGroup);

    // 8-ball endings
    if (eight) {
      const legal = clearedMine && !cuePocketed && info.firstHit && info.firstHit.id === 8;
      endGame(legal ? shooter : opp);
      return;
    }

    let foul = false;
    if (cuePocketed) foul = true;
    if (!info.firstHit) foul = true;          // hit nothing
    else if (!open && myGroup && info.firstHit.type !== myGroup && info.firstHit.id !== 8) {
      // struck the wrong group first — light foul (kept simple, forgiving)
      foul = true;
    }

    const pocketedMine = objs.some(b => myGroup ? b.type === myGroup : true);
    const continueTurn = !foul && pocketedMine && objs.length > 0;

    if (cuePocketed) respawnCue();

    if (continueTurn) {
      // same shooter goes again
      turn = shooter;
      phase = turnPhase(shooter);
      if (phase === "aimCPU") cpuWait = 0.7;
    } else {
      turn = opp;
      ballInHand = foul;                      // fouled -> opponent gets ball in hand
      phase = turnPhase(opp);
      if (phase === "aimCPU") cpuWait = 0.7;
    }
    if (foul && shooter === "you") snd.foul && snd.foul();
    if (ballInHand && turn === "cpu") { placeCueForCPU(); ballInHand = false; }
    // point the human's aim at a sensible default
    if (phase === "aim") aimAtNearestTarget();
    status();
    if (net) sendSettle();
  }

  function respawnCue() {
    cue.active = true; cue.mesh.visible = true;
    placeBall(cue, -HL * 0.5, 0);
    // nudge off any overlap
    for (let k = 0; k < 8; k++) {
      let hit = false;
      for (const b of balls) {
        if (b === cue || !b.active) continue;
        const dd = Math.hypot(cue.u - b.u, cue.w - b.w);
        if (dd < D) { cue.u -= 0.02; hit = true; }
      }
      if (!hit) break;
    }
  }
  function placeCueForCPU() { /* CPU just plays from where the cue sits */ }

  function endGame(winner) {
    phase = "over"; started = false; overMsg = winner === "you" ? "YOU WIN" : `${oppName} WINS`;
    snd.win && snd.win();
    status();
    hud.over && hud.over(overMsg + " — RESET to rack again");
  }

  function targetsFor(who) {
    const g = group[who];
    if (g) {
      const mine = balls.filter(b => b.active && b.type === g);
      return mine.length ? mine : balls.filter(b => b.active && b.id === 8);
    }
    return balls.filter(b => b.active && b.id !== 0 && b.id !== 8); // open table
  }

  function aimAtNearestTarget() {
    const ts = targetsFor("you");
    let best = null, bd = Infinity;
    for (const b of ts) {
      const d = Math.hypot(b.u - cue.u, b.w - cue.w);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) aimYaw = Math.atan2(best.w - cue.w, best.u - cue.u);
  }

  /* ---------- CPU ---------- */
  function cpuShoot() {
    const ts = targetsFor("cpu");
    let best = null;
    for (const b of ts) {
      for (const p of pockets) {
        const s = evalShot(b, p);
        if (s && (!best || s.score > best.score)) best = s;
      }
    }
    if (!best) {
      // no clear pot — just nudge the nearest target so it's a legal hit
      let near = null, nd = Infinity;
      for (const b of ts) { const d = Math.hypot(b.u - cue.u, b.w - cue.w); if (d < nd) { nd = d; near = b; } }
      const ang = near ? Math.atan2(near.w - cue.w, near.u - cue.u) : Math.random() * 6.28;
      strike(ang + (Math.random() - 0.5) * 0.04, 1.6 + Math.random() * 0.8);
      return;
    }
    const err = (Math.random() - 0.5) * 0.05;       // beatable
    strike(best.angle + err, best.power);
  }

  function evalShot(ball, p) {
    // ghost-ball position: where the cue must send its centre to pot `ball`
    const bpu = p.u - ball.u, bpw = p.w - ball.w;
    const bpl = Math.hypot(bpu, bpw) || 1;
    const pdu = bpu / bpl, pdw = bpw / bpl;         // ball -> pocket dir
    const gu = ball.u - pdu * D, gw = ball.w - pdw * D;
    const cdu = gu - cue.u, cdw = gw - cue.w;
    const cdl = Math.hypot(cdu, cdw) || 1;
    const cut = (cdu / cdl) * pdu + (cdw / cdl) * pdw;  // cue->ghost vs ball->pocket
    if (cut < 0.25) return null;                    // too thin / behind
    if (pathBlocked(cue.u, cue.w, gu, gw, ball)) return null;
    if (pathBlocked(ball.u, ball.w, p.u, p.w, ball)) return null;
    const angle = Math.atan2(cdw, cdu);
    const dist = cdl + bpl;
    const power = Math.min(MAX_POWER, 1.5 + dist * 1.0);
    const score = cut * 2 - dist * 0.3;
    return { angle, power, score };
  }

  function pathBlocked(au, aw, bu, bw, ignore) {
    const du = bu - au, dw = bw - aw;
    const len = Math.hypot(du, dw) || 1;
    const nu = du / len, nw = dw / len;
    for (const b of balls) {
      if (!b.active || b === ignore || b.id === 0) continue;
      const rxu = b.u - au, rxw = b.w - aw;
      const tc = rxu * nu + rxw * nw;
      if (tc < 0 || tc > len) continue;
      const d2 = rxu * rxu + rxw * rxw - tc * tc;
      if (d2 < (D * 1.05) * (D * 1.05)) return true;
    }
    return false;
  }

  /* ---------- HUD ---------- */
  function boardData() {
    const made = (g) => (g ? 7 - balls.filter(b => b.active && b.type === g).length : 0);
    return {
      you: { name: youName, group: group.you, made: made(group.you) },
      opp: { name: oppName, group: group.cpu, made: made(group.cpu) },
      turn, open,
    };
  }
  function status() {
    let s;
    if (phase === "over") s = overMsg;
    else {
      const who = turn === "you" ? "YOUR SHOT" : `${oppName}…`;
      s = turn === "you"
        ? `${who}  ·  ${open ? "open table" : (group.you === "solid" ? "SOLIDS" : "STRIPES")}`
        : `${who}`;
    }
    hud.status && hud.status(s);
    h.setBoard && h.setBoard(boardData());
  }

  /* ---------- netcode (shooter-authority, 2 packets) ---------- */
  let packetId = 0, peer = null;
  function snapshot() { return balls.map(b => [b.active ? 1 : 0, +b.u.toFixed(4), +b.w.toFixed(4)]); }
  function applySnapshot(snap) {
    snap.forEach((s, i) => { balls[i].active = !!s[0]; balls[i].u = s[1]; balls[i].w = s[2]; });
    placeMeshes();
  }
  function sendShot(angle, p) {
    if (!net) return;
    net.send({ game: "pool", sub: "shot", id: ++packetId, a: +angle.toFixed(4), p: +p.toFixed(3), snap: snapshot(), turn });
  }
  function sendSettle() {
    if (!net) return;
    net.send({ game: "pool", sub: "settle", id: ++packetId, snap: snapshot(), turn, group, open, over: overMsg });
  }
  function handleNet(p) {
    if (!net || p.game !== "pool") return;
    if (p.id != null && p.id <= packetId && p.sub !== "sit" && p.sub !== "host") return;
    if (p.sub === "sit") {
      // someone docked at the other end. we become the host (we go first) and
      // hand them our authoritative table so both sides start from one truth.
      if (playing && !peer) {
        peer = { uid: p.uid };
        oppName = (p.name || "P2").slice(0, 12);
        if (phase === "aimCPU") { phase = "watch"; cpuWait = 0; }  // the human inherits the CPU's seat
        net.send({ game: "pool", sub: "host", to: p.uid, name: youName, id: ++packetId,
                   snap: snapshot(), group, open, turn, started, over: overMsg });
        status();
      }
      return;
    }
    if (p.sub === "host") {
      // we're the joiner — adopt the host's table verbatim. their 'you' is our
      // opponent, so the host shoots first and we start in "watch".
      if (p.to === net.myUid && !peer) {
        peer = { uid: p.uid };
        oppName = (p.name || "P2").slice(0, 12);
        if (p.id != null) packetId = p.id;
        if (p.snap) applySnapshot(p.snap);
        if (p.group) group = p.group;
        if (typeof p.open === "boolean") open = p.open;
        if (p.started != null) started = p.started;
        turn = p.turn === "you" ? "cpu" : "you";
        charging = false; power = 0;
        if (p.over) { overMsg = p.over; phase = "over"; }
        else phase = turnPhase(turn);
        status();
      }
      return;
    }
    if (p.sub === "shot") {
      packetId = p.id; applySnapshot(p.snap);
      aimYaw = p.a; turn = p.turn === "you" ? "cpu" : "you"; // their 'you' is our opponent
      strike(p.a, p.p);
    } else if (p.sub === "settle") {
      // the shooter's settle is the source of truth — hard-snap to it.
      packetId = p.id; applySnapshot(p.snap);
      group = p.group; open = p.open;
      turn = p.turn === "you" ? "cpu" : "you";
      if (p.over) { overMsg = p.over; phase = "over"; }
      else phase = turnPhase(turn);
      status();
    }
  }

  /* ---------- public update ---------- */
  function update(dt, input) {
    if (!playing) return;
    dt = Math.min(dt, MAX_DELTA);

    // human aim input — rotate is a per-frame delta so the game keeps aim
    // authority across turn changes
    if (phase === "aim") {
      if (input) {
        aimYaw += input.rotate || 0;
        if (input.charging) { charging = true; power = Math.min(MAX_POWER, (power || MIN_POWER) + (MAX_POWER - MIN_POWER) / CHARGE_T * dt); }
        else if (charging) { charging = false; const p = power; power = 0; if (p >= MIN_POWER) strike(aimYaw, p); }
      }
      if (phase === "aim") { showAim(); placeCamera(); hud.power && hud.power(charging ? power / MAX_POWER : 0, charging); }
    } else if (phase === "aimCPU") {
      cpuWait -= dt;
      placeCamera();
      if (cpuWait <= 0 && !peer) cpuShoot();   // never auto-play when a real human is here
    } else if (phase === "watch") {
      // a real opponent owns this turn; just hold on the table until their
      // shot/settle arrives over the wire. no local sim, no CPU.
      placeCamera();
    } else if (phase === "rolling") {
      let acc = dt;
      while (acc >= DT_SUB) { step(DT_SUB); acc -= DT_SUB; }
      placeMeshes();
      placeCamera();
      if (allStopped()) {
        // shooter authority: only the player who took the shot resolves it and
        // broadcasts the settle. a watcher just parks at rest and waits for that
        // authoritative settle — no local resolve, no phantom turn flip.
        if (peer && shotInfo && shotInfo.shooter !== "you") { phase = "watch"; status(); }
        else resolveShotEnd();
      }
    } else if (phase === "over") {
      placeCamera();
      // a click after the game's over racks a fresh one (so do the reset button)
      if (input && input.charging && !overClickLatch) { overClickLatch = true; reset(); }
      if (input && !input.charging) overClickLatch = false;
    }
  }

  function dock(end) {
    playing = true;
    if (net) net.send({ game: "pool", sub: "sit", name: youName });
    if (!started) { started = true; newGame(); }   // fresh table
    else { if (phase === "aim") aimAtNearestTarget(); status(); }   // resume where we left off
    return h.dock[end];
  }
  // walking away (ESC) just PAUSES — the rack, the turn, the score all stay.
  // come back and dock to pick up your shot. only reset() / a win ends it.
  function undock() {
    playing = false; charging = false; power = 0;
    hideGuide();
  }
  function reset() {
    started = true; phase = "aim"; newGame();
    // in a 2-human game, hand the peer the fresh rack so they sync to "watch"
    // (we racked it, so we shoot first) instead of both claiming the first turn.
    if (net && peer) sendSettle();
  }

  return {
    dock, undock, update, handleNet, reset,
    isPlaying: () => playing,
    aimYaw: () => aimYaw,
    nearestEnd: (x) => (Math.abs(x - h.dock.west.x) <= Math.abs(x - h.dock.east.x) ? "west" : "east"),
    setName: (n) => { youName = (n || "YOU").slice(0, 12); },
    setAimYaw: (y) => { aimYaw = y; },
    canAim: () => phase === "aim",
    _debug: () => ({ phase, turn, open, group, balls: balls.map(b => ({ id: b.id, u: b.u, w: b.w, active: b.active, v: Math.hypot(b.vu, b.vw) })) }),
  };
}
