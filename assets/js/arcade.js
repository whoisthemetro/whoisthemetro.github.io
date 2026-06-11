/* ============================================================
   METRO'S ARCADE — the room behind the closet
   Four playable cabinets, written from scratch:
     DEFENDER — the full liturgy: wrap world, landers, mutants,
                smart bombs, scanner. Single player.
     DOOM     — a raycast corridor shooter homage. Single player.
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
let current = null;            // active game object
let net = null;                // { send, myUid } from main
let peer = null;               // { uid, role: 'host'|'guest', lastSeen }
let gameId = null;

const hiKey = () => `metro.${gameId}.hi`;
function hiScore() {
  try { return parseInt(localStorage.getItem(hiKey()) || "0", 10) || 0; } catch (e) { return 0; }
}
function saveHi(score) {
  try { if (score > hiScore()) localStorage.setItem(hiKey(), String(score)); } catch (e) {}
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
  return { init, update, draw, help: "← → thrust · ↑ ↓ move · SPACE fire · B smart bomb" };
})();

/* ================= DOOM — the real one, via js-dos =================
   Runs the actual shareware DOOM (DOOM1.WAD, freely distributable)
   in a DOSBox-wasm emulator. If the CDN is unreachable, the BOOM
   raycaster below quietly takes its place. */

const DOS_JS = "https://v8.js-dos.com/latest/js-dos.js";
const DOS_CSS = "https://v8.js-dos.com/latest/js-dos.css";
// self-hosted shareware bundle (DOOM1.WAD is freely distributable) —
// same-origin, so no CORS surprises
const DOOM_BUNDLE = "assets/games/doom.jsdos";
let dosProps = null;
let dosLoaded = false;

function loadJsDos() {
  return new Promise((resolve, reject) => {
    if (dosLoaded && window.Dos) return resolve();
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = DOS_CSS;
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = DOS_JS;
    const timeout = setTimeout(() => reject(new Error("js-dos timeout")), 10000);
    s.onload = () => { clearTimeout(timeout); dosLoaded = true; resolve(); };
    s.onerror = () => { clearTimeout(timeout); reject(new Error("js-dos failed")); };
    document.head.appendChild(s);
  });
}

async function openRealDoom() {
  const box = document.getElementById("dosbox");
  const help = document.querySelector("#arcade .arcade-help");
  cv.classList.add("hidden");
  box.classList.remove("hidden");
  box.innerHTML = "<div class='dos-loading'>FIRING UP THE DOS MACHINE…</div>";
  help.textContent = "the actual 1993 DOOM · arrows move · ctrl fire · space open · use the × up top to walk away (ESC is DOOM's own menu)";
  document.getElementById("arcade").classList.add("show");
  try {
    await loadJsDos();
    box.innerHTML = "";
    dosProps = await window.Dos(box, { url: DOOM_BUNDLE, autoStart: true });
  } catch (e) {
    // CDN down — the homage engine steps in
    box.classList.add("hidden");
    box.innerHTML = "";
    cv.classList.remove("hidden");
    current = Boom;
    current.init();
    help.textContent = current.help + " · ESC to walk away";
    startLoop();
  }
}

/* ================= BOOM (raycast fallback, single player) ================= */

const Boom = (() => {
  const MAP = [
    "################",
    "#..............#",
    "#.####.###.##..#",
    "#.#  #.# #..#..#",
    "#.#..#.#.#..##.#",
    "#.#..........#.#",
    "#.####.####..#.#",
    "#......#  #....#",
    "#.##.#.#..#.##.#",
    "#.#..#.##.#..#.#",
    "#.#..#....#..#.#",
    "#.#.########.#.#",
    "#.#..........#.#",
    "#.##.######.##.#",
    "#..............#",
    "################",
  ].map(r => r.split("").map(c => c === "#" ? 1 : 0));
  const MS = 16;
  let st;
  const wall = (x, y) => (MAP[y | 0] && MAP[y | 0][x | 0]) ? 1 : 0;

  function init() {
    st = {
      x: 1.5, y: 1.5, a: 0.8, hp: 100, ammo: 40, score: 0, over: false, won: false,
      flash: 0, hurt: 0, kills: 0,
      imps: [], t: 0,
    };
    // scatter imps in open cells away from spawn
    let placed = 0;
    for (let tries = 0; tries < 500 && placed < 10; tries++) {
      const x = 1.5 + Math.random() * 13, y = 1.5 + Math.random() * 13;
      if (!wall(x, y) && Math.hypot(x - st.x, y - st.y) > 4) {
        st.imps.push({ x, y, hp: 2, t: Math.random() * 9, pain: 0 });
        placed++;
      }
    }
  }

  function update(dt) {
    st.t += dt;
    st.flash = Math.max(0, st.flash - dt * 6);
    st.hurt = Math.max(0, st.hurt - dt * 2);
    if (st.over) { if (keys.Enter) init(); return; }

    const turn = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
    st.a += turn * 2.4 * dt;
    const mv = (keys.ArrowUp || keys.KeyW ? 1 : 0) - (keys.ArrowDown || keys.KeyS ? 1 : 0);
    const strafe = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const sp = 3.1 * dt;
    const nx = st.x + (Math.cos(st.a) * mv - Math.sin(st.a) * strafe) * sp;
    const ny = st.y + (Math.sin(st.a) * mv + Math.cos(st.a) * strafe) * sp;
    if (!wall(nx, st.y)) st.x = nx;
    if (!wall(st.x, ny)) st.y = ny;

    if (keys.Space && !keys._fired) {
      keys._fired = true;
      if (st.ammo > 0) {
        st.ammo--;
        st.flash = 1;
        beep(160, 0.12, "square", 0.07, 50);
        // hitscan down the view ray
        let best = null, bestD = 1e9;
        for (const imp of st.imps) {
          const d = Math.hypot(imp.x - st.x, imp.y - st.y);
          const ang = Math.atan2(imp.y - st.y, imp.x - st.x);
          let da = ang - st.a;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          if (Math.abs(da) < 0.12 && d < bestD && clearLine(imp)) { best = imp; bestD = d; }
        }
        if (best) {
          best.hp--; best.pain = 0.25;
          if (best.hp <= 0) {
            st.imps = st.imps.filter(i => i !== best);
            st.kills++; st.score += 100;
            beep(80, 0.3, "sawtooth", 0.06, 20);
            if (!st.imps.length) { st.over = true; st.won = true; saveHi(st.score + st.hp); }
          }
        }
      } else beep(900, 0.05, "square", 0.02);
    }
    if (!keys.Space) keys._fired = false;

    function clearLine(imp) {
      const steps = 24;
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (wall(st.x + (imp.x - st.x) * t, st.y + (imp.y - st.y) * t)) return false;
      }
      return true;
    }

    for (const imp of st.imps) {
      imp.t += dt; imp.pain = Math.max(0, imp.pain - dt);
      const d = Math.hypot(imp.x - st.x, imp.y - st.y);
      if (d < 7 && clearLine(imp)) {
        const a = Math.atan2(st.y - imp.y, st.x - imp.x);
        const sp2 = 1.1 * dt;
        const ix = imp.x + Math.cos(a) * sp2, iy = imp.y + Math.sin(a) * sp2;
        if (!wall(ix, imp.y)) imp.x = ix;
        if (!wall(imp.x, iy)) imp.y = iy;
        if (d < 0.7 && Math.random() < dt * 2) {
          st.hp -= 8; st.hurt = 1;
          beep(60, 0.2, "sawtooth", 0.07, 30);
          if (st.hp <= 0) { st.over = true; st.won = false; saveHi(st.score); }
        }
      }
    }
    // ammo trickle so it never soft-locks
    if (st.ammo < 10 && Math.random() < dt * 0.2) st.ammo += 5;
  }

  function draw() {
    // ceiling / floor
    g2.fillStyle = "#1a1012"; g2.fillRect(0, 0, W, H / 2);
    g2.fillStyle = "#26201a"; g2.fillRect(0, H / 2, W, H / 2);
    const FOV = 1.05, COLS = 160, cw = W / COLS;
    const depth = new Array(COLS);
    for (let c = 0; c < COLS; c++) {
      const ra = st.a - FOV / 2 + (c / COLS) * FOV;
      const cos = Math.cos(ra), sin = Math.sin(ra);
      let d = 0, hit = 0, side = 0;
      while (d < 20 && !hit) {
        d += 0.02;
        const px = st.x + cos * d, py = st.y + sin * d;
        if (wall(px, py)) {
          hit = 1;
          side = Math.abs((px % 1) - 0.5) > Math.abs((py % 1) - 0.5) ? 0 : 1;
        }
      }
      const cd = d * Math.cos(ra - st.a);
      depth[c] = cd;
      const hh = Math.min(H, (H * 0.9) / cd);
      const shade = Math.max(0, 1 - cd / 12) * (side ? 0.75 : 1);
      g2.fillStyle = `rgb(${110 * shade | 0},${42 * shade | 0},${30 * shade | 0})`;
      g2.fillRect(c * cw, (H - hh) / 2, cw + 1, hh);
    }
    // imps as billboard sprites, far to near
    const sorted = [...st.imps].sort((a, b) =>
      Math.hypot(b.x - st.x, b.y - st.y) - Math.hypot(a.x - st.x, a.y - st.y));
    for (const imp of sorted) {
      const dx = imp.x - st.x, dy = imp.y - st.y;
      const d = Math.hypot(dx, dy);
      let da = Math.atan2(dy, dx) - st.a;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > 0.7 || d < 0.2) continue;
      const sx = W / 2 + (da / 1.05) * W;
      const col = Math.floor(sx / (W / 160));
      if (depth[col] && depth[col] < d) continue;   // behind a wall
      const size = Math.min(300, 130 / d);
      const bob = Math.sin(imp.t * 6) * size * 0.06;
      g2.fillStyle = imp.pain > 0 ? "#fff" : "#8a3a1e";
      g2.fillRect(sx - size / 4, H / 2 - size / 3 + bob, size / 2, size * 0.66);
      g2.fillStyle = imp.pain > 0 ? "#fff" : "#b8542a";
      g2.beginPath(); g2.arc(sx, H / 2 - size / 3 + bob, size / 4, 0, 7); g2.fill();
      g2.fillStyle = "#ffd23c";
      g2.fillRect(sx - size / 9, H / 2 - size / 3 + bob - size * 0.05, size / 16, size / 16);
      g2.fillRect(sx + size / 16, H / 2 - size / 3 + bob - size * 0.05, size / 16, size / 16);
    }
    // muzzle flash + gun
    if (st.flash > 0.4) {
      g2.fillStyle = "rgba(255,220,120,0.7)";
      g2.beginPath(); g2.arc(W / 2, H - 90, 36, 0, 7); g2.fill();
    }
    g2.fillStyle = "#222";
    g2.fillRect(W / 2 - 14, H - 80, 28, 80);
    g2.fillStyle = "#3a3a3a";
    g2.fillRect(W / 2 - 8, H - 96, 16, 24);
    g2.fillStyle = "#9ff";
    g2.fillRect(W / 2 - 1, H / 2 - 8, 2, 16);
    g2.fillRect(W / 2 - 8, H / 2 - 1, 16, 2);
    if (st.hurt > 0) {
      g2.fillStyle = `rgba(255,0,0,${st.hurt * 0.25})`;
      g2.fillRect(0, 0, W, H);
    }
    g2.font = "900 18px monospace"; g2.textAlign = "left";
    g2.fillStyle = "#f33"; g2.fillText(`HP ${Math.max(0, st.hp)}`, 12, H - 14);
    g2.fillStyle = "#ffd23c"; g2.fillText(`AMMO ${st.ammo}`, 120, H - 14);
    g2.textAlign = "right";
    g2.fillStyle = "#9ff"; g2.fillText(`DEMONS ${st.imps.length}`, W - 12, H - 14);
    if (st.over) {
      g2.textAlign = "center"; g2.font = "900 34px monospace";
      g2.fillStyle = st.won ? "#3f3" : "#f33";
      g2.fillText(st.won ? "AREA CLEARED" : "YOU DIED", W / 2, 170);
      g2.font = "14px monospace"; g2.fillStyle = "#fff";
      g2.fillText("PRESS ENTER", W / 2, 200);
    }
  }
  return { init, update, draw, help: "WASD move · ← → turn · SPACE shoot" };
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
    help: "↑ ↓ move · first to 7",
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
    help: "arrows steer · don't touch anything · first to 3",
  };
})();

const GAMES = { defender: Defender, pong: Pong, tron: Tron };

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

  if (id === "doom") {
    current = null;
    openRealDoom();
    return;
  }

  current = GAMES[id];
  if (!current) return;
  document.getElementById("dosbox").classList.add("hidden");
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

  startLoop();
  document.querySelectorAll("#arcade .pad").forEach(btn => {
    const code = btn.dataset.code;
    btn.onpointerdown = (e) => { e.preventDefault(); keys[code] = true; };
    btn.onpointerup = btn.onpointercancel = btn.onpointerleave = () => { keys[code] = false; };
  });
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
  if (dosProps) {
    try { dosProps.stop?.(); } catch (e) {}
    dosProps = null;
  }
  const box = document.getElementById("dosbox");
  box.classList.add("hidden");
  box.innerHTML = "";
  cv?.classList.remove("hidden");
  peer = null;
  current = null;
  gameId = null;
  removeEventListener("keydown", keydown);
  removeEventListener("keyup", keyup);
  document.getElementById("arcade").classList.remove("show");
}

export function arcadeIsOpen() {
  return document.getElementById("arcade").classList.contains("show");
}

// test/debug introspection
export const _arcadeDbg = () => ({ gameId, peerRole: peer ? peer.role : null });
