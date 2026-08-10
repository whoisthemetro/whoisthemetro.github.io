/* ============================================================
   METRO'S ARCADE — the room behind the closet
   Four playable cabinets, written from scratch:
     DEFENDER — the full liturgy: wrap world, landers, mutants,
                smart bombs, scanner. Single player.
     PAC-MAN  — an original maze-chase homage. Single player.
     TRON     — light cycles. 2-PLAYER: anyone in the room who
                clicks the same cabinet becomes player 2.
     PONG     — same deal: solo vs AI until a stranger sits down.
   Multiplayer rides the presence channel: host simulates and
   streams state, guest streams inputs. If the other player
   leaves, the AI quietly takes their seat back.
   ============================================================ */

import { beep } from "./ambience.js";

/* ---------------- attract mode (cabinet screens in 3D) ---------------- */

export function makeAttractScreen(THREE, title = "DEFENDER", color = "#ff3434") {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 192;
  const g = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const stars = Array.from({ length: 50 }, () => [Math.random() * 256, Math.random() * 150, Math.random()]);
  let t = Math.random() * 100;
  function draw() {
    t += 0.15;
    g.fillStyle = "#000";
    g.fillRect(0, 0, 256, 192);
    for (const [x, y, r] of stars) {
      g.fillStyle = ((x + t * 8) % 50 < 25) ? "#9ff" : "#fff";
      g.fillRect((x + t * (r * 3)) % 256, y, 2, 2);
    }
    g.strokeStyle = "#a50";
    g.beginPath();
    for (let x = 0; x <= 256; x += 4) {
      const y = 165 - 18 * Math.abs(Math.sin((x + t * 6) * 0.05)) - 8 * Math.sin((x + t * 6) * 0.013);
      x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
    g.font = `900 ${title.length > 6 ? 26 : 32}px monospace`;
    g.textAlign = "center";
    g.fillStyle = Math.floor(t * 0.8) % 2 ? color : "#ffd23c";
    g.fillText(title, 128, 70);
    g.font = "10px monospace";
    g.fillStyle = "#9ff";
    g.fillText("INSERT COIN", 128, 100);
    g.fillStyle = "#7a7";
    g.fillText("CLICK TO PLAY", 128, 118);
    tex.needsUpdate = true;
  }
  draw();
  return { tex, draw };
}

/* ================= shared shell ================= */

const W = 640, H = 400;
let cv, g2, raf = null;
let keys = {};
// a finger on the canvas: normalized 0..1 coords, used for pong's drag-paddle
// and tron's swipe-to-steer. games read this straight off the module.
let touch = { active: false, x: 0, y: 0, sx: 0, sy: 0, swiped: false };
let current = null;            // active game object
let net = null;                // { send, myUid } from main
let peer = null;               // { uid, role: 'host'|'guest', lastSeen }
let gameId = null;

const hiKey = () => `metro.${gameId}.hi`;
function hiScore() {
  try { return parseInt(localStorage.getItem(hiKey()) || "0", 10) || 0; } catch (e) { return 0; }
}
let scoreHook = null;
export function setScoreHook(fn) { scoreHook = fn; }   // main reports to the wall
function saveHi(score) {
  try { if (score > hiScore()) localStorage.setItem(hiKey(), String(score)); } catch (e) {}
  if (score > 0 && gameId === "defender") scoreHook?.(gameId, score);
}

/* ================= DEFENDER (single player) ================= */

const Defender = (() => {
  const WORLD = 2560, SKY_TOP = 40;
  let st;
  const wrapx = (x) => ((x % WORLD) + WORLD) % WORLD;
  const wdist = (a, b) => {
    let d = wrapx(b) - wrapx(a);
    if (d > WORLD / 2) d -= WORLD;
    if (d < -WORLD / 2) d += WORLD;
    return d;
  };
  const groundY = (x) => 330 - 26 * Math.abs(Math.sin(x * 0.004)) - 14 * Math.sin(x * 0.0017 + 2) - 8 * Math.sin(x * 0.009);

  function init() {
    st = {
      wave: 1, score: 0, lives: 3, bombs: 3, over: false, msg: 0,
      ship: { x: 200, y: 200, vx: 0, vy: 0, dir: 1, inv: 2 },
      humans: Array.from({ length: 8 }, (_, i) => ({ x: i * (WORLD / 8) + 120, st: "walk", y: 0, carrier: null })),
      landers: [], shots: [], parts: [], enemyShots: [],
    };
    spawnWave();
  }
  function spawnWave() {
    for (let i = 0; i < 4 + st.wave * 2; i++) {
      st.landers.push({
        x: wrapx(st.ship.x + 400 + Math.random() * (WORLD - 800)),
        y: 60 + Math.random() * 120,
        vx: (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5),
        st: "patrol", target: null, mutant: false, t: Math.random() * 9,
      });
    }
  }
  function boomFx(x, y, color, n = 14) {
    for (let i = 0; i < n; i++) {
      st.parts.push({ x, y, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6, life: 0.5 + Math.random() * 0.4, color });
    }
  }
  function killLander(L) {
    L.dead = true;
    st.score += L.mutant ? 250 : 150;
    if (L.target && L.target.carrier === L) { L.target.st = "fall"; L.target.fell = 0; L.target.carrier = null; }
    boomFx(L.x, L.y, L.mutant ? "#f4f" : "#4f4");
    beep(220, 0.18, "sawtooth", 0.05, 40);
  }
  function hitShip() {
    st.lives--;
    boomFx(st.ship.x, st.ship.y, "#ff4", 24);
    beep(90, 0.5, "sawtooth", 0.08, 25);
    if (st.lives <= 0) { st.over = true; saveHi(st.score); }
    else { st.ship.inv = 2.2; st.ship.vx = 0; }
  }

  function update(dt) {
    const s = st.ship;
    st.msg = Math.max(0, st.msg - dt);
    if (!st.over) {
      const thrust = keys.ArrowRight || keys.KeyD ? 1 : keys.ArrowLeft || keys.KeyA ? -1 : 0;
      if (thrust) { s.dir = thrust; s.vx += thrust * 14 * dt; }
      s.vx *= Math.pow(0.4, dt);
      s.vx = Math.max(-7, Math.min(7, s.vx));
      s.x = wrapx(s.x + s.vx * 60 * dt);
      const vert = keys.ArrowUp || keys.KeyW ? -1 : keys.ArrowDown || keys.KeyS ? 1 : 0;
      s.y = Math.max(SKY_TOP + 14, Math.min(360, s.y + vert * 220 * dt));
      s.inv = Math.max(0, s.inv - dt);
      if (keys.Space && !keys._fired) {
        keys._fired = true;
        st.shots.push({ x: s.x + s.dir * 22, y: s.y, vx: s.dir * 16, life: 0.8 });
        beep(1400, 0.07, "square", 0.04, 300);
      }
      if (!keys.Space) keys._fired = false;
      if (keys.KeyB && !keys._bombed && st.bombs > 0) {
        keys._bombed = true;
        st.bombs--;
        beep(120, 0.6, "sawtooth", 0.07, 30);
        for (const L of st.landers) if (Math.abs(wdist(s.x, L.x)) < W / 2) killLander(L);
        st.landers = st.landers.filter(L => !L.dead);
      }
      if (!keys.KeyB) keys._bombed = false;
    }
    for (const L of st.landers) {
      L.t += dt;
      if (L.mutant) {
        L.x = wrapx(L.x + Math.sign(wdist(L.x, s.x)) * 90 * dt + (Math.random() - 0.5) * 3);
        L.y += Math.sign(s.y - L.y) * 70 * dt + (Math.random() - 0.5) * 3;
      } else if (L.st === "patrol") {
        L.x = wrapx(L.x + L.vx * 50 * dt);
        L.y += Math.sin(L.t * 2) * 0.4;
        if (Math.random() < dt * 0.25) {
          const free = st.humans.filter(h => h.st === "walk");
          if (free.length) { L.target = free[Math.floor(Math.random() * free.length)]; L.st = "descend"; }
        }
      } else if (L.st === "descend" && L.target) {
        if (L.target.st !== "walk" && L.target.carrier !== L) { L.st = "patrol"; L.target = null; }
        else {
          L.x = wrapx(L.x + Math.sign(wdist(L.x, L.target.x)) * 60 * dt);
          const gy = groundY(L.target.x) - 18;
          L.y += Math.sign(gy - L.y) * 60 * dt;
          if (Math.abs(wdist(L.x, L.target.x)) < 8 && Math.abs(L.y - gy) < 8) {
            L.st = "ascend"; L.target.st = "carried"; L.target.carrier = L;
            beep(800, 0.3, "square", 0.03, 1600);
          }
        }
      } else if (L.st === "ascend") {
        L.y -= 45 * dt;
        if (L.target) { L.target.x = L.x; L.target.y = L.y + 16; }
        if (L.y < SKY_TOP + 10) {
          if (L.target) { L.target.st = "gone"; L.target.carrier = null; }
          L.mutant = true; L.target = null;
          beep(200, 0.4, "sawtooth", 0.05, 900);
        }
      }
      if (!st.over && Math.random() < dt * (L.mutant ? 1.1 : 0.35) && Math.abs(wdist(s.x, L.x)) < 360) {
        const a = Math.atan2(s.y - L.y, wdist(L.x, s.x));
        st.enemyShots.push({ x: L.x, y: L.y, vx: Math.cos(a) * 3.2, vy: Math.sin(a) * 3.2, life: 2.4 });
      }
    }
    for (const h of st.humans) {
      if (h.st === "fall") {
        h.y += 90 * dt; h.fell += 90 * dt;
        if (Math.abs(wdist(s.x, h.x)) < 16 && Math.abs(s.y - h.y) < 14) {
          h.st = "rescued"; st.score += 500; st.msg = 1.5; st.msgText = "CAUGHT! +500";
          beep(900, 0.2, "triangle", 0.05, 1800);
        } else if (h.y >= groundY(h.x) - 6) {
          if (h.fell > 130) { h.st = "gone"; boomFx(h.x, h.y, "#f66", 8); }
          else h.st = "walk";
        }
      } else if (h.st === "rescued") {
        h.x = s.x; h.y = s.y + 14;
        if (s.y > groundY(s.x) - 40) { h.st = "walk"; st.score += 250; }
      } else if (h.st === "walk") {
        h.x = wrapx(h.x + Math.sin(h.x * 0.01) * 12 * dt);
        h.y = groundY(h.x) - 6;
      }
    }
    for (const sh of st.shots) {
      sh.x = wrapx(sh.x + sh.vx * 60 * dt);
      sh.life -= dt;
      for (const L of st.landers) {
        if (!L.dead && Math.abs(wdist(sh.x, L.x)) < 12 && Math.abs(sh.y - L.y) < 10) { killLander(L); sh.life = 0; }
      }
    }
    st.landers = st.landers.filter(L => !L.dead);
    st.shots = st.shots.filter(sh => sh.life > 0);
    for (const es of st.enemyShots) {
      es.x = wrapx(es.x + es.vx * 60 * dt);
      es.y += es.vy * 60 * dt;
      es.life -= dt;
      if (!st.over && s.inv <= 0 && Math.abs(wdist(es.x, s.x)) < 12 && Math.abs(es.y - s.y) < 9) { es.life = 0; hitShip(); }
    }
    st.enemyShots = st.enemyShots.filter(es => es.life > 0);
    if (!st.over && s.inv <= 0) {
      for (const L of st.landers) {
        if (Math.abs(wdist(L.x, s.x)) < 14 && Math.abs(L.y - s.y) < 11) { killLander(L); hitShip(); break; }
      }
      st.landers = st.landers.filter(L => !L.dead);
    }
    for (const p of st.parts) { p.x += p.vx; p.y += p.vy; p.life -= dt; }
    st.parts = st.parts.filter(p => p.life > 0);
    if (!st.landers.length && !st.over) {
      st.wave++; st.score += 1000;
      st.msg = 2; st.msgText = `WAVE ${st.wave}  +1000`;
      st.bombs = Math.min(5, st.bombs + 1);
      spawnWave();
    }
    if (st.over && keys.Enter) init();
  }

  function draw() {
    const s = st.ship;
    const cam = wrapx(s.x + s.dir * 140);
    const toScreen = (x) => W / 2 + wdist(cam, x);
    g2.fillStyle = "#000"; g2.fillRect(0, 0, W, H);
    g2.strokeStyle = "#b85c00";
    g2.beginPath();
    for (let sx = 0; sx <= W; sx += 4) {
      const y = groundY(wrapx(cam + (sx - W / 2)));
      sx === 0 ? g2.moveTo(sx, y) : g2.lineTo(sx, y);
    }
    g2.stroke();
    for (const h of st.humans) {
      if (h.st === "gone") continue;
      const sx = toScreen(h.x);
      if (sx < -10 || sx > W + 10) continue;
      g2.fillStyle = "#f8f";
      g2.fillRect(sx - 2, h.y - 4, 4, 8);
    }
    for (const L of st.landers) {
      const sx = toScreen(L.x);
      if (sx < -16 || sx > W + 16) continue;
      g2.fillStyle = L.mutant ? "#f4f" : "#4f4";
      g2.fillRect(sx - 7, L.y - 5, 14, 7);
      g2.fillRect(sx - 4, L.y - 9, 8, 4);
      g2.fillStyle = "#ff0";
      g2.fillRect(sx - 5, L.y + 2, 3, 3); g2.fillRect(sx + 2, L.y + 2, 3, 3);
    }
    if (!st.over && (s.inv <= 0 || Math.floor(s.inv * 10) % 2)) {
      const sx = toScreen(s.x);
      g2.fillStyle = "#fff";
      g2.beginPath();
      g2.moveTo(sx + s.dir * 16, s.y);
      g2.lineTo(sx - s.dir * 10, s.y - 6);
      g2.lineTo(sx - s.dir * 10, s.y + 6);
      g2.closePath(); g2.fill();
      g2.fillStyle = "#39f";
      g2.fillRect(sx - s.dir * 14, s.y - 2, 5, 4);
    }
    g2.fillStyle = "#fff";
    for (const sh of st.shots) g2.fillRect(toScreen(sh.x) - 8, sh.y - 1, 16, 2);
    g2.fillStyle = "#f55";
    for (const es of st.enemyShots) g2.fillRect(toScreen(es.x) - 2, es.y - 2, 4, 4);
    for (const p of st.parts) { g2.fillStyle = p.color; g2.fillRect(toScreen(p.x) - 1, p.y - 1, 3, 3); }
    g2.fillStyle = "#020"; g2.fillRect(0, 0, W, SKY_TOP - 6);
    g2.strokeStyle = "#0a0"; g2.strokeRect(W * 0.3, 1, W * 0.4, SKY_TOP - 8);
    const mapX = (x) => W * 0.3 + (wrapx(x - cam + WORLD / 2) / WORLD) * W * 0.4;
    for (const h of st.humans) if (h.st !== "gone") { g2.fillStyle = "#f8f"; g2.fillRect(mapX(h.x), 26, 2, 3); }
    for (const L of st.landers) { g2.fillStyle = L.mutant ? "#f4f" : "#4f4"; g2.fillRect(mapX(L.x), 8 + (L.y / 400) * 18, 2, 2); }
    g2.fillStyle = "#fff"; g2.fillRect(mapX(s.x), 8 + (s.y / 400) * 18, 3, 3);
    g2.font = "14px monospace"; g2.textAlign = "left"; g2.fillStyle = "#ff4";
    g2.fillText(`SCORE ${st.score}`, 10, 16);
    g2.fillText(`HI ${hiScore()}`, 10, 32);
    g2.textAlign = "right";
    g2.fillText(`SHIPS ${st.lives}  BOMBS ${st.bombs}  WAVE ${st.wave}`, W - 10, 16);
    if (st.msg > 0 && st.msgText) { g2.textAlign = "center"; g2.fillStyle = "#9ff"; g2.fillText(st.msgText, W / 2, 70); }
    if (st.over) {
      g2.textAlign = "center"; g2.font = "900 34px monospace"; g2.fillStyle = "#f33";
      g2.fillText("GAME OVER", W / 2, 180);
      g2.font = "14px monospace"; g2.fillStyle = "#fff";
      g2.fillText(`FINAL SCORE ${st.score}`, W / 2, 210);
      g2.fillText("PRESS ENTER TO PLAY AGAIN", W / 2, 236);
    }
  }
  return {
    init, update, draw,
    pad: { stick: true, btns: [{ code: "Space", label: "FIRE", fire: true }, { code: "KeyB", label: "BOMB" }] },
    help: "← → thrust · ↑ ↓ move · SPACE fire · B smart bomb",
  };
})();

/* ================= PAC-MAN (homage, single player) =================
   An original implementation with an original maze — the shape of the
   thing (chomping through a maze while four ghosts with four different
   ideas about how to catch you close in) with none of anyone's assets.
   Ghost temperaments, in the classic spirit: one chases your tile, one
   aims ahead of you, one flanks off the chaser's position, one loses
   its nerve up close. Scatter and chase alternate on a clock; power
   pellets flip the hunt. ================= */

const Pacman = (() => {
  // 21 wide, 23 tall. #=wall .=pellet o=power  =empty T=tunnel row
  // G=ghost house door area, original symmetric layout
  const RAW = [
    "#####################",
    "#........#..........#",
    "#o##.###.#.###.##..o#",
    "#...................#",
    "#.##.#.#####.#.##.###",
    "#....#...#...#......#",
    "####.###.#.###.####.#",
    "   #.#.......#.#    #",
    "####.#.##G##.#.####.#",
    "T....#.#   #.#.....T#",
    "####.#.#####.#.####.#",
    "   #.#.......#.#    #",
    "####.#.#####.#.####.#",
    "#........#..........#",
    "#.##.###.#.###.##...#",
    "#o.#.....P.......#.o#",
    "##.#.#.#####.#.#.#.##",
    "#....#...#...#.....##",
    "#.######.#.######...#",
    "#...................#",
    "#####################",
  ];
  const GW2 = RAW[0].length, GH2 = RAW.length, TS = 18;
  const OX = (W - GW2 * TS) / 2, OY = 12;
  let st;

  const wallAt = (x, y) => {
    if (y < 0 || y >= GH2) return true;
    const row = RAW[y];
    const c = row[((x % GW2) + GW2) % GW2];
    return c === "#" || c === " " && row[Math.max(0, Math.min(GW2 - 1, x))] === "#";
  };
  const solid = (x, y) => {
    if (y < 0 || y >= GH2) return true;
    const c = RAW[y][((x % GW2) + GW2) % GW2];
    return c === "#" || c === " ";
  };

  function freshDots() {
    const dots = new Set(), power = new Set();
    for (let y = 0; y < GH2; y++) for (let x = 0; x < GW2; x++) {
      const c = RAW[y][x];
      if (c === "." || c === "T") dots.add(y * GW2 + x);
      else if (c === "o") power.add(y * GW2 + x);
    }
    return { dots, power };
  }

  const GHOSTS = [
    { name: "chaser", color: "#ff3434" },   // aims at your tile
    { name: "ambush", color: "#ffb0de" },   // aims 4 tiles ahead of you
    { name: "flank",  color: "#2ad4d4" },   // mirrors the chaser through you
    { name: "shy",    color: "#ffa044" },   // hunts far, flees near
  ];

  function spawnGhost(i) {
    return { x: 9 + (i % 3), y: 9, dx: 0, dy: -1, frac: 0, dead: false, i,
             inHouse: i > 0, wait: i * 3.2 };
  }

  function init(level = 1, score = 0, lives = 3) {
    const { dots, power } = freshDots();
    st = {
      level, score, lives, dots, power,
      p: { x: 9, y: 15, dx: 0, dy: 0, wantDx: 0, wantDy: 0, frac: 0, mouth: 0 },
      ghosts: GHOSTS.map((g, i) => spawnGhost(i)),
      fright: 0, eatChain: 0, phase: 0, phaseT: 0,
      dead: 0, over: false, won: 0, t: 0,
    };
  }

  const SCAT = [[1, 1], [GW2 - 2, 1], [1, GH2 - 2], [GW2 - 2, GH2 - 2]];

  function ghostTarget(g) {
    const p = st.p;
    if (st.fright > 0) return null;                       // random flight
    const scatter = st.phase % 2 === 0;
    if (scatter) return SCAT[g.i];
    if (g.i === 0) return [p.x, p.y];
    if (g.i === 1) return [p.x + p.dx * 4, p.y + p.dy * 4];
    if (g.i === 2) { const c = st.ghosts[0]; return [p.x * 2 - c.x, p.y * 2 - c.y]; }
    const d = Math.hypot(g.x - p.x, g.y - p.y);
    return d > 7 ? [p.x, p.y] : SCAT[3];
  }

  function stepGhost(g, dt) {
    if (g.wait > 0) { g.wait -= dt; return; }
    if (g.inHouse) { g.inHouse = false; g.x = 9; g.y = 7; g.dx = 0; g.dy = -1; }
    const speed = g.dead ? 9 : st.fright > 0 ? 2.6 : 3.6 + st.level * 0.25;
    g.frac += speed * dt;
    while (g.frac >= 1) {
      g.frac -= 1;
      g.x = ((g.x + g.dx) % GW2 + GW2) % GW2; g.y += g.dy;
      if (g.dead && g.x === 9 && g.y === 9) { g.dead = false; g.dy = -1; }
      // pick a turn at each tile: toward the target, never straight back
      const target = g.dead ? [9, 9] : ghostTarget(g);
      const opts = [];
      for (const [dx, dy] of [[0, -1], [-1, 0], [0, 1], [1, 0]]) {
        if (dx === -g.dx && dy === -g.dy) continue;
        if (solid(g.x + dx, g.y + dy)) continue;
        opts.push([dx, dy]);
      }
      if (!opts.length) { g.dx = -g.dx; g.dy = -g.dy; continue; }
      let pick;
      if (!target) pick = opts[(Math.random() * opts.length) | 0];
      else {
        let best = 1e9;
        for (const o of opts) {
          const d = (g.x + o[0] - target[0]) ** 2 + (g.y + o[1] - target[1]) ** 2;
          if (d < best) { best = d; pick = o; }
        }
      }
      g.dx = pick[0]; g.dy = pick[1];
    }
  }

  function update(dt) {
    if (st.over) { if (keys.Enter) init(); return; }
    if (st.won > 0) {
      st.won -= dt;
      if (st.won <= 0) init(st.level + 1, st.score, st.lives);
      return;
    }
    if (st.dead > 0) {
      st.dead -= dt;
      if (st.dead <= 0) {
        st.lives--;
        if (st.lives <= 0) { st.over = true; saveHi(st.score); }
        else {
          st.p = { x: 9, y: 15, dx: 0, dy: 0, wantDx: 0, wantDy: 0, frac: 0, mouth: 0 };
          st.ghosts = GHOSTS.map((g, i) => spawnGhost(i));
          st.fright = 0;
        }
      }
      return;
    }
    st.t += dt;
    st.phaseT += dt;
    // scatter 6s / chase 18s, forever — the tide coming in and out
    if (st.phaseT > (st.phase % 2 === 0 ? 6 : 18)) { st.phase++; st.phaseT = 0; }
    if (st.fright > 0) st.fright -= dt;

    const p = st.p;
    if (keys.ArrowUp || keys.KeyW) { p.wantDx = 0; p.wantDy = -1; }
    else if (keys.ArrowDown || keys.KeyS) { p.wantDx = 0; p.wantDy = 1; }
    else if (keys.ArrowLeft || keys.KeyA) { p.wantDx = -1; p.wantDy = 0; }
    else if (keys.ArrowRight || keys.KeyD) { p.wantDx = 1; p.wantDy = 0; }
    if (touch.swipe) {
      const [sx, sy] = touch.swipe;
      if (Math.abs(sx) > Math.abs(sy)) { p.wantDx = Math.sign(sx); p.wantDy = 0; }
      else { p.wantDx = 0; p.wantDy = Math.sign(sy); }
      touch.swipe = null;
    }

    const speed = 4.4 + st.level * 0.15;
    p.frac += speed * dt;
    while (p.frac >= 1) {
      p.frac -= 1;
      if ((p.wantDx || p.wantDy) && !solid(p.x + p.wantDx, p.y + p.wantDy)) {
        p.dx = p.wantDx; p.dy = p.wantDy;
      }
      if (solid(p.x + p.dx, p.y + p.dy)) { p.dx = 0; p.dy = 0; }
      p.x = ((p.x + p.dx) % GW2 + GW2) % GW2; p.y += p.dy;
      const key = p.y * GW2 + p.x;
      if (st.dots.delete(key)) { st.score += 10; if (st.dots.size % 4 === 0) beep(880, 0.02, "square", 0.015); }
      if (st.power.delete(key)) {
        st.score += 50; st.fright = Math.max(3, 7 - st.level * 0.5); st.eatChain = 0;
        beep(320, 0.15, "square", 0.04);
      }
      if (!st.dots.size && !st.power.size) { st.won = 1.5; beep(660, 0.3, "square", 0.05); }
    }
    p.mouth += dt * 9;

    for (const g of st.ghosts) stepGhost(g, dt);

    // collisions on near-tile overlap
    for (const g of st.ghosts) {
      if (g.wait > 0 || g.dead) continue;
      const dx = (g.x + g.dx * g.frac) - (p.x + p.dx * p.frac);
      const dy = (g.y + g.dy * g.frac) - (p.y + p.dy * p.frac);
      if (dx * dx + dy * dy > 0.6) continue;
      if (st.fright > 0) {
        g.dead = true;
        st.eatChain++;
        st.score += 100 * Math.pow(2, st.eatChain);
        beep(1200, 0.1, "square", 0.05);
      } else {
        st.dead = 1.4;
        beep(140, 0.6, "sawtooth", 0.06);
        break;
      }
    }
  }

  function tile(x, y) { return [OX + x * TS + TS / 2, OY + y * TS + TS / 2]; }

  function draw() {
    g2.fillStyle = "#000"; g2.fillRect(0, 0, W, H);
    // walls: rounded neon-blue strokes, one per wall tile edge cluster
    g2.strokeStyle = "#2233dd"; g2.lineWidth = 3;
    for (let y = 0; y < GH2; y++) for (let x = 0; x < GW2; x++) {
      if (!solid(x, y)) continue;
      const [cx, cy] = tile(x, y);
      // draw wall edges only where they border walkable space
      g2.beginPath();
      if (!solid(x, y - 1) && y > 0) { g2.moveTo(cx - TS / 2, cy - TS / 2 + 2); g2.lineTo(cx + TS / 2, cy - TS / 2 + 2); }
      if (!solid(x, y + 1) && y < GH2 - 1) { g2.moveTo(cx - TS / 2, cy + TS / 2 - 2); g2.lineTo(cx + TS / 2, cy + TS / 2 - 2); }
      if (!solid(x - 1, y)) { g2.moveTo(cx - TS / 2 + 2, cy - TS / 2); g2.lineTo(cx - TS / 2 + 2, cy + TS / 2); }
      if (!solid(x + 1, y)) { g2.moveTo(cx + TS / 2 - 2, cy - TS / 2); g2.lineTo(cx + TS / 2 - 2, cy + TS / 2); }
      g2.stroke();
    }
    // pellets
    g2.fillStyle = "#ffd9a8";
    for (const k of st.dots) {
      const [cx, cy] = tile(k % GW2, (k / GW2) | 0);
      g2.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
    for (const k of st.power) {
      const [cx, cy] = tile(k % GW2, (k / GW2) | 0);
      if (Math.floor(st.t * 6) % 2) { g2.beginPath(); g2.arc(cx, cy, 5, 0, Math.PI * 2); g2.fill(); }
    }
    // our hero: the chomping wedge
    const p = st.p;
    const [px, py] = tile(p.x + p.dx * p.frac, p.y + p.dy * p.frac);
    const ang = Math.atan2(p.dy, p.dx || 0.0001);
    const jaw = st.dead > 0 ? Math.min(Math.PI, (1.4 - st.dead) * 3) : (0.15 + 0.32 * Math.abs(Math.sin(p.mouth)));
    g2.fillStyle = "#ffe737";
    g2.beginPath();
    g2.moveTo(px, py);
    g2.arc(px, py, TS * 0.48, ang + jaw, ang - jaw + Math.PI * 2);
    g2.fill();
    // the four temperaments
    for (const g of st.ghosts) {
      if (g.wait > 0) continue;
      const [gx, gy] = tile(g.x + g.dx * g.frac, g.y + g.dy * g.frac);
      const R = TS * 0.46;
      const frightened = st.fright > 0 && !g.dead;
      g2.fillStyle = g.dead ? "rgba(200,220,255,0.25)"
        : frightened ? (st.fright < 2 && Math.floor(st.t * 8) % 2 ? "#dde" : "#2233dd")
        : GHOSTS[g.i].color;
      g2.beginPath();
      g2.arc(gx, gy - R * 0.15, R, Math.PI, 0);
      g2.lineTo(gx + R, gy + R * 0.7);
      for (let i = 2; i >= -2; i--) g2.lineTo(gx + (i / 2.5) * R, gy + R * (i % 2 === 0 ? 0.7 : 0.5));
      g2.fill();
      // eyes always know where they're going
      g2.fillStyle = "#fff";
      g2.beginPath(); g2.arc(gx - R * 0.35, gy - R * 0.25, R * 0.24, 0, Math.PI * 2);
      g2.arc(gx + R * 0.35, gy - R * 0.25, R * 0.24, 0, Math.PI * 2); g2.fill();
      g2.fillStyle = "#223";
      g2.beginPath(); g2.arc(gx - R * 0.35 + g.dx * 2, gy - R * 0.25 + g.dy * 2, R * 0.12, 0, Math.PI * 2);
      g2.arc(gx + R * 0.35 + g.dx * 2, gy - R * 0.25 + g.dy * 2, R * 0.12, 0, Math.PI * 2); g2.fill();
    }
    // chrome
    g2.font = "900 14px monospace"; g2.textAlign = "left";
    g2.fillStyle = "#9ff"; g2.fillText(`SCORE ${st.score}`, 10, H - 8);
    g2.textAlign = "right"; g2.fillText(`L${st.level}`, W - 10, H - 8);
    g2.fillStyle = "#ffe737";
    for (let i = 0; i < st.lives - 1; i++) {
      g2.beginPath(); g2.arc(W / 2 - 30 + i * 22, H - 12, 7, 0.5, Math.PI * 2 - 0.5); g2.lineTo(W / 2 - 30 + i * 22, H - 12); g2.fill();
    }
    if (st.won > 0) {
      g2.textAlign = "center"; g2.font = "900 30px monospace"; g2.fillStyle = "#3f3";
      g2.fillText("MAZE CLEARED", W / 2, 200);
    }
    if (st.over) {
      g2.textAlign = "center"; g2.font = "900 34px monospace"; g2.fillStyle = "#f33";
      g2.fillText("GAME OVER", W / 2, 190);
      g2.font = "14px monospace"; g2.fillStyle = "#fff";
      g2.fillText(`FINAL SCORE ${st.score} · PRESS ENTER`, W / 2, 220);
    }
  }

  return {
    init: () => init(),
    update, draw,
    pad: { swipe: true },
    help: "arrows or swipe to steer · eat everything · power pellets turn the tables",
  };
})();

/* ================= PONG (2-player capable) ================= */

const Pong = (() => {
  let st;
  function init() {
    st = { b: { x: W / 2, y: H / 2, vx: 4.4, vy: 2.2 }, p1: H / 2, p2: H / 2, s1: 0, s2: 0, over: false, serve: 1 };
  }
  const PH = 64;
  function resetBall(dir) {
    st.b = { x: W / 2, y: H / 2, vx: 4.4 * dir, vy: (Math.random() - 0.5) * 5 };
  }
  function update(dt) {
    if (st.over) { if (keys.Enter && (!peer || peer.role === "host")) init(); return; }
    const mv = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);
    const mine = peer && peer.role === "guest" ? "p2" : "p1";
    st[mine] = Math.max(PH / 2, Math.min(H - PH / 2, st[mine] + mv * 330 * dt));
    // a finger dragging on the canvas places the paddle directly — the best
    // pong control there is. overrides the keyboard nudge while held.
    if (touch.active) st[mine] = Math.max(PH / 2, Math.min(H - PH / 2, touch.y * H));

    if (peer && peer.role === "guest") return;   // host simulates everything else

    if (peer) {
      // remote player drives p2 via inputs
      if (peer.p2y != null) st.p2 += Math.max(-330 * dt, Math.min(330 * dt, peer.p2y - st.p2));
    } else {
      // AI
      st.p2 += Math.max(-260 * dt, Math.min(260 * dt, st.b.y - st.p2));
    }
    st.p2 = Math.max(PH / 2, Math.min(H - PH / 2, st.p2));

    const b = st.b;
    b.x += b.vx * 60 * dt; b.y += b.vy * 60 * dt;
    if (b.y < 6 || b.y > H - 6) { b.vy *= -1; beep(440, 0.04, "square", 0.03); }
    if (b.x < 26 && Math.abs(b.y - st.p1) < PH / 2 + 6 && b.vx < 0) {
      b.vx = Math.abs(b.vx) * 1.04; b.vy += (b.y - st.p1) * 0.09;
      beep(660, 0.05, "square", 0.035);
    }
    if (b.x > W - 26 && Math.abs(b.y - st.p2) < PH / 2 + 6 && b.vx > 0) {
      b.vx = -Math.abs(b.vx) * 1.04; b.vy += (b.y - st.p2) * 0.09;
      beep(550, 0.05, "square", 0.035);
    }
    if (b.x < -10) { st.s2++; beep(180, 0.3, "square", 0.05); resetBall(1); }
    if (b.x > W + 10) { st.s1++; beep(180, 0.3, "square", 0.05); resetBall(-1); }
    if (st.s1 >= 7 || st.s2 >= 7) { st.over = true; saveHi(Math.max(st.s1, st.s2)); }
  }
  function netState() { return { b: [st.b.x | 0, st.b.y | 0], p: [st.p1 | 0, st.p2 | 0], s: [st.s1, st.s2], o: st.over ? 1 : 0 }; }
  function applyState(d) {
    st.b.x = d.b[0]; st.b.y = d.b[1];
    st.p1 = d.p[0];
    if (!(peer && peer.role === "guest")) st.p2 = d.p[1];
    else st.p2 = st.p2;        // guest owns its own paddle locally
    st.s1 = d.s[0]; st.s2 = d.s[1]; st.over = !!d.o;
  }
  function draw() {
    g2.fillStyle = "#000"; g2.fillRect(0, 0, W, H);
    g2.fillStyle = "#234";
    for (let y = 0; y < H; y += 24) g2.fillRect(W / 2 - 2, y, 4, 12);
    g2.fillStyle = "#fff";
    g2.fillRect(16, st.p1 - PH / 2, 8, PH);
    g2.fillRect(W - 24, st.p2 - PH / 2, 8, PH);
    g2.fillRect(st.b.x - 5, st.b.y - 5, 10, 10);
    g2.font = "900 40px monospace"; g2.textAlign = "center";
    g2.fillStyle = "#9ff";
    g2.fillText(st.s1, W / 2 - 70, 50);
    g2.fillText(st.s2, W / 2 + 70, 50);
    g2.font = "11px monospace";
    g2.fillStyle = "#7a7";
    g2.fillText(peer ? "2-PLAYER — a stranger is at the other paddle" : "VS CPU — anyone clicking this cabinet joins as P2", W / 2, H - 12);
    if (st.over) {
      g2.font = "900 30px monospace"; g2.fillStyle = "#ff4";
      g2.fillText(`${st.s1 > st.s2 ? "LEFT" : "RIGHT"} WINS`, W / 2, 180);
      g2.font = "13px monospace"; g2.fillStyle = "#fff";
      g2.fillText("ENTER FOR A REMATCH", W / 2, 210);
    }
  }
  return {
    init, update, draw, mp: true,
    netState, applyState,
    netInput: () => ({ y: (peer && peer.role === "guest" ? st.p2 : st.p1) | 0 }),
    applyInput: (d) => { if (peer) peer.p2y = d.y; },
    pad: { drag: true },               // no buttons — just slide a finger up/down
    help: "↑ ↓ or slide a finger to move · first to 7",
  };
})();

/* ================= TRON (2-player capable) ================= */

const Tron = (() => {
  const GS = 4;                 // grid cell px
  const GW = W / GS, GH = (H - 30) / GS | 0;
  let st;
  function init() {
    st = {
      grid: new Uint8Array(GW * GH),
      c1: { x: 20, y: GH / 2 | 0, dx: 1, dy: 0, alive: true },
      c2: { x: GW - 20, y: GH / 2 | 0, dx: -1, dy: 0, alive: true },
      s: [0, 0], over: false, round: 0, t: 0, msg: "",
    };
  }
  function roundReset() {
    st.grid = new Uint8Array(GW * GH);
    st.c1 = { x: 20, y: GH / 2 | 0, dx: 1, dy: 0, alive: true };
    st.c2 = { x: GW - 20, y: GH / 2 | 0, dx: -1, dy: 0, alive: true };
    st.t = 0;
  }
  function turn(c, dx, dy) {
    if (c.dx === -dx && c.dy === -dy) return;
    c.dx = dx; c.dy = dy;
  }
  function update(dt) {
    if (st.over) { if (keys.Enter && (!peer || peer.role === "host")) init(); return; }
    const me = peer && peer.role === "guest" ? st.c2 : st.c1;
    if (keys.ArrowUp || keys.KeyW) turn(me, 0, -1);
    else if (keys.ArrowDown || keys.KeyS) turn(me, 0, 1);
    else if (keys.ArrowLeft || keys.KeyA) turn(me, -1, 0);
    else if (keys.ArrowRight || keys.KeyD) turn(me, 1, 0);

    if (peer && peer.role === "guest") return;   // host simulates

    st.t += dt;
    if (st.t < 0.5) return;                      // round countdown
    const STEP = 1 / 30;
    st._acc = (st._acc || 0) + dt;
    while (st._acc >= STEP) {
      st._acc -= STEP;
      if (!peer) {
        // AI: avoid walls, mild randomness
        const c = st.c2;
        const ahead = (n) => occ(c.x + c.dx * n, c.y + c.dy * n);
        if (ahead(2) || ahead(1) || Math.random() < 0.02) {
          const opts = [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dx, dy]) =>
            !(dx === -c.dx && dy === -c.dy) && !occ(c.x + dx * 2, c.y + dy * 2) && !occ(c.x + dx, c.y + dy));
          if (opts.length) { const [dx, dy] = opts[Math.floor(Math.random() * opts.length)]; c.dx = dx; c.dy = dy; }
        }
      } else if (peer.dir) {
        turn(st.c2, peer.dir[0], peer.dir[1]);
      }
      for (const [i, c] of [st.c1, st.c2].entries()) {
        if (!c.alive) continue;
        st.grid[c.y * GW + c.x] = i + 1;
        c.x += c.dx; c.y += c.dy;
        if (occ(c.x, c.y)) {
          c.alive = false;
          beep(110, 0.4, "sawtooth", 0.07, 30);
        }
      }
      if (!st.c1.alive || !st.c2.alive) {
        if (st.c1.alive) st.s[0]++;
        else if (st.c2.alive) st.s[1]++;
        st.round++;
        if (st.s[0] >= 3 || st.s[1] >= 3) { st.over = true; saveHi(Math.max(...st.s)); }
        else roundReset();
        break;
      }
    }
    function occ(x, y) {
      if (x < 0 || y < 0 || x >= GW || y >= GH) return 1;
      return st.grid[y * GW + x];
    }
  }
  function netState() {
    return { c1: [st.c1.x, st.c1.y, st.c1.dx, st.c1.dy], c2: [st.c2.x, st.c2.y, st.c2.dx, st.c2.dy], s: st.s, o: st.over ? 1 : 0, r: st.round };
  }
  function applyState(d) {
    // guest replays heads into its own grid for trails
    if (d.r !== st.round) { roundReset(); st.round = d.r; }
    st.grid[st.c1.y * GW + st.c1.x] = 1;
    st.grid[st.c2.y * GW + st.c2.x] = 2;
    [st.c1.x, st.c1.y, st.c1.dx, st.c1.dy] = d.c1;
    [st.c2.x, st.c2.y, st.c2.dx, st.c2.dy] = d.c2;
    st.s = d.s; st.over = !!d.o;
  }
  function draw() {
    g2.fillStyle = "#02060a"; g2.fillRect(0, 0, W, H);
    g2.fillStyle = "#0a141c";
    for (let x = 0; x < W; x += 32) g2.fillRect(x, 30, 1, H);
    for (let y = 30; y < H; y += 32) g2.fillRect(0, y, W, 1);
    for (let i = 0; i < st.grid.length; i++) {
      const v = st.grid[i];
      if (!v) continue;
      g2.fillStyle = v === 1 ? "#22d4ff" : "#ff9d22";
      g2.fillRect((i % GW) * GS, 30 + ((i / GW) | 0) * GS, GS, GS);
    }
    g2.fillStyle = "#bff"; g2.fillRect(st.c1.x * GS - 1, 30 + st.c1.y * GS - 1, GS + 2, GS + 2);
    g2.fillStyle = "#fda"; g2.fillRect(st.c2.x * GS - 1, 30 + st.c2.y * GS - 1, GS + 2, GS + 2);
    g2.fillStyle = "#04101a"; g2.fillRect(0, 0, W, 28);
    g2.font = "900 16px monospace"; g2.textAlign = "left";
    g2.fillStyle = "#22d4ff"; g2.fillText(`BLUE ${st.s[0]}`, 12, 20);
    g2.textAlign = "right";
    g2.fillStyle = "#ff9d22"; g2.fillText(`${st.s[1]} ORANGE`, W - 12, 20);
    g2.textAlign = "center"; g2.font = "11px monospace"; g2.fillStyle = "#7a7";
    g2.fillText(peer ? "2-PLAYER GRID" : "VS CPU — anyone clicking this cabinet joins", W / 2, 19);
    if (st.over) {
      g2.font = "900 30px monospace"; g2.fillStyle = "#ff4";
      g2.fillText(`${st.s[0] > st.s[1] ? "BLUE" : "ORANGE"} WINS THE GRID`, W / 2, 180);
      g2.font = "13px monospace"; g2.fillStyle = "#fff";
      g2.fillText("ENTER FOR A REMATCH", W / 2, 210);
    }
  }
  function netInput() {
    const me = peer && peer.role === "guest" ? st.c2 : st.c1;
    return { dir: [me.dx, me.dy] };
  }
  return {
    init, update, draw, mp: true,
    netState, applyState, netInput,
    applyInput: (d) => { if (peer) peer.dir = d.dir; },
    pad: { swipe: true },              // no buttons — flick a finger to steer
    help: "arrows or swipe to steer · don't touch anything · first to 3",
  };
})();

const GAMES = { defender: Defender, pong: Pong, tron: Tron, pac: Pacman };

/* ================= multiplayer plumbing ================= */

let netTimer = null;

export function handleGameMessage(p) {
  if (!gameId) {
    return;
  }
  if (p.game !== gameId) return;
  if (p.sub === "sit" && current?.mp && !peer) {
    // someone sat down at our cabinet — we were first, so we host
    peer = { uid: p.uid, role: "host", lastSeen: Date.now() };
    net?.send({ game: gameId, sub: "host", to: p.uid });
    current.init?.();   // fresh match for two humans
  } else if (p.sub === "host" && p.to === net?.myUid && current?.mp) {
    peer = { uid: p.uid, role: "guest", lastSeen: Date.now() };
    current.init?.();
  } else if (p.sub === "state" && peer?.role === "guest") {
    peer.lastSeen = Date.now();
    current.applyState?.(p.d);
  } else if (p.sub === "input" && peer?.role === "host" && p.uid === peer.uid) {
    peer.lastSeen = Date.now();
    current.applyInput?.(p.d);
  } else if (p.sub === "leave" && peer && p.uid === peer.uid) {
    peer = null;        // AI takes the seat back
  }
}

/* ================= overlay lifecycle ================= */

function keydown(e) {
  if (e.code === "Escape") return;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
}
function keyup(e) { keys[e.code] = false; }

/* ---------------- touch controls ---------------- */

const DIR_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"];
function clearDirKeys() { for (const k of DIR_KEYS) keys[k] = false; }

// one on-screen button → a held key. `solo` (tron) clears the other
// directions first so only ever one steer is live at a time.
function mkPad(code, label, cls, solo) {
  const b = document.createElement("button");
  b.className = "pad" + (cls ? " " + cls : "");
  b.textContent = label;
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (solo) clearDirKeys();
    keys[code] = true;
    try { b.setPointerCapture(e.pointerId); } catch (_) {}   // stays held if the finger slides off
  });
  const release = () => { keys[code] = false; };
  b.addEventListener("pointerup", release);
  b.addEventListener("pointercancel", release);
  b.addEventListener("pointerleave", release);
  return b;
}

function clearEl(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }

// lay out exactly the controls this game wants. a spec with no buttons
// (pong = finger drag, tron = finger swipe) hides the bar entirely, as
// does null (DOOM, which brings its own touch UI).
function buildPads(spec) {
  const wrap = document.getElementById("arcade-pads");
  const L = document.getElementById("pad-left");
  const R = document.getElementById("pad-right");
  clearEl(L); clearEl(R);
  hideStick();                 // a fresh cabinet never inherits the last one's stick
  if (!spec || (!spec.dpad && !spec.vpad && !(spec.btns && spec.btns.length))) {
    wrap.classList.add("hidden");
    return;
  }
  wrap.classList.remove("hidden");
  if (spec.dpad) {
    const d = document.createElement("div");
    d.className = "dpad";
    d.appendChild(mkPad("ArrowUp", "▲", "d-up", spec.swipe));
    d.appendChild(mkPad("ArrowLeft", "◀", "d-left", spec.swipe));
    d.appendChild(mkPad("ArrowRight", "▶", "d-right", spec.swipe));
    d.appendChild(mkPad("ArrowDown", "▼", "d-down", spec.swipe));
    L.appendChild(d);
  }
  if (spec.vpad) {
    const v = document.createElement("div");
    v.className = "vpad";
    v.appendChild(mkPad("ArrowUp", "▲"));
    v.appendChild(mkPad("ArrowDown", "▼"));
    L.appendChild(v);
  }
  for (const b of (spec.btns || [])) {
    R.appendChild(mkPad(b.code, b.label, "pad-wide" + (b.fire ? " pad-fire" : "")));
  }
}

// --- a floating thumbstick (defender's "finger movement") ---
// it springs up wherever your left thumb lands and maps its tilt to the
// four movement keys, so the ship flies without a fixed pad to aim for.
const STICK_R = 46;
let stick = null;          // { base, knob } DOM, lazily made
let stickOn = false, stickCx = 0, stickCy = 0;
function ensureStick() {
  if (stick) return;
  const shell = document.querySelector(".arcade-shell");
  const base = document.createElement("div"); base.className = "stickbase";
  const knob = document.createElement("div"); knob.className = "stickknob";
  base.appendChild(knob); base.style.display = "none";
  shell.appendChild(base);
  stick = { base, knob };
}
function showStick(px, py) {
  ensureStick();
  const s = document.querySelector(".arcade-shell").getBoundingClientRect();
  stickCx = px; stickCy = py;
  stick.base.style.left = (px - s.left - STICK_R) + "px";
  stick.base.style.top = (py - s.top - STICK_R) + "px";
  stick.knob.style.transform = "translate(0,0)";
  stick.base.style.display = "block";
}
function moveStick(px, py) {
  let dx = px - stickCx, dy = py - stickCy;
  const d = Math.hypot(dx, dy);
  if (d > STICK_R) { dx = dx / d * STICK_R; dy = dy / d * STICK_R; }
  stick.knob.style.transform = `translate(${dx}px,${dy}px)`;
  const dead = STICK_R * 0.34;
  keys.ArrowLeft = dx < -dead; keys.ArrowRight = dx > dead;
  keys.ArrowUp = dy < -dead; keys.ArrowDown = dy > dead;
}
function hideStick() {
  if (stick) stick.base.style.display = "none";
  stickOn = false;
  keys.ArrowLeft = keys.ArrowRight = keys.ArrowUp = keys.ArrowDown = false;
}

// movement reads the WHOLE overlay, not just the canvas, so a thumb can sit
// out in the letterbox margins (landscape) instead of on top of the action.
// buttons (.arcade-pads) and the × handle their own touches — skip those.
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
let movePtr = null;        // the one pointer that drives movement this gesture
function ovDown(e) {
  if (e.target.closest(".arcade-pads") || e.target.closest("#arcade-close")) return;
  if (movePtr !== null) return;            // a second finger doesn't hijack movement
  e.preventDefault();
  movePtr = e.pointerId;
  const r = cv.getBoundingClientRect();
  touch.active = true; touch.swiped = false;
  touch.sx = touch.x = clamp01((e.clientX - r.left) / r.width);
  touch.sy = touch.y = clamp01((e.clientY - r.top) / r.height);
  keys.Enter = true;                       // tap to (re)start — ignored mid-play
  if (current && current.pad && current.pad.stick && e.clientX < innerWidth / 2) {
    stickOn = true; showStick(e.clientX, e.clientY);
  }
}
function ovMove(e) {
  if (e.pointerId !== movePtr) return;
  const r = cv.getBoundingClientRect();
  touch.x = clamp01((e.clientX - r.left) / r.width);
  touch.y = clamp01((e.clientY - r.top) / r.height);
  if (stickOn) { moveStick(e.clientX, e.clientY); return; }
  if (current && current.pad && current.pad.swipe) {
    const dx = touch.x - touch.sx, dy = touch.y - touch.sy;
    if (Math.hypot(dx, dy) > 0.05) {       // a real flick, not a jitter
      clearDirKeys();
      if (Math.abs(dx) > Math.abs(dy)) keys[dx > 0 ? "ArrowRight" : "ArrowLeft"] = true;
      else keys[dy > 0 ? "ArrowDown" : "ArrowUp"] = true;
      touch.sx = touch.x; touch.sy = touch.y;   // re-anchor so you can trace turns without lifting
    }
  }
}
function ovUp(e) {
  if (e.pointerId !== movePtr) return;
  movePtr = null;
  touch.active = false;
  keys.Enter = false;
  if (stickOn) hideStick();
}

function startLoop() {
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    current.update(dt);
    current.draw();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

export function openArcade(id, netAdapter) {
  gameId = id;
  net = netAdapter || null;
  peer = null;
  cv = document.getElementById("arcade-canvas");
  g2 = cv.getContext("2d");
  keys = {};
  addEventListener("keydown", keydown);
  addEventListener("keyup", keyup);

  current = GAMES[id];
  if (!current) return;
  cv.classList.remove("hidden");
  current.init();
  document.querySelector("#arcade .arcade-help").textContent =
    current.help + " · ESC to walk away";
  document.getElementById("arcade").classList.add("show");

  if (current.mp && net) {
    net.send({ game: gameId, sub: "sit" });
    netTimer = setInterval(() => {
      if (!peer) return;
      if (Date.now() - peer.lastSeen > 4000) { peer = null; return; }   // they vanished
      if (peer.role === "host") net.send({ game: gameId, sub: "state", d: current.netState() });
      else net.send({ game: gameId, sub: "input", d: current.netInput() });
    }, 50);
  }

  buildPads(current.pad);
  const ov = document.getElementById("arcade");
  ov.addEventListener("pointerdown", ovDown, { passive: false });
  ov.addEventListener("pointermove", ovMove, { passive: false });
  ov.addEventListener("pointerup", ovUp);
  ov.addEventListener("pointercancel", ovUp);
  startLoop();
}

// real DOOM owns the ESC key (its menu) — only the × closes it
export function arcadeWantsEsc() {
  return !!dosProps;
}

export function closeArcade() {
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  if (netTimer) clearInterval(netTimer);
  netTimer = null;
  if (current?.mp && net) net.send({ game: gameId, sub: "leave" });
  const ov = document.getElementById("arcade");
  ov.removeEventListener("pointerdown", ovDown);
  ov.removeEventListener("pointermove", ovMove);
  ov.removeEventListener("pointerup", ovUp);
  ov.removeEventListener("pointercancel", ovUp);
  cv?.classList.remove("hidden");
  peer = null;
  current = null;
  gameId = null;
  keys = {};                    // never carry a stuck pad into the next game
  vrLast = 0;
  touch.active = false;
  movePtr = null;
  hideStick();
  buildPads(null);
  removeEventListener("keydown", keydown);
  removeEventListener("keyup", keyup);
  document.getElementById("arcade").classList.remove("show");
}

export function arcadeIsOpen() {
  return document.getElementById("arcade").classList.contains("show");
}

/* ---------- VR: the same games, different hands ----------
   In a headset the DOM overlay is invisible, so the canvas gets textured
   onto a panel in the room instead — and the page's rAF sleeps during a
   session, so the world loop drives frames through vrFrame(). The stick
   plays the arrows, buttons play the keys, via vrKey(). ---------- */
let vrLast = 0;
export function vrFrame(now) {
  if (!current) return;
  if (!vrLast) vrLast = now;
  const dt = Math.min(0.05, (now - vrLast) / 1000);
  vrLast = now;
  current.update(dt);
  current.draw();
}
export function vrKey(code, down) {
  if (down) keys[code] = true;
  else delete keys[code];
}
export const _debugKeys = () => keys;

// test/debug introspection
export const _arcadeDbg = () => ({ gameId, peerRole: peer ? peer.role : null });
