/* ============================================================
   THE METRO — the cabinet in the closet
   An 8-bit DEFENDER, written from scratch: side-scrolling wrap
   world, landers abducting humanoids, mutants, smart bombs, a
   scanner strip — the whole liturgy. Lives inside the closet;
   click the cabinet to play. Arrows/WASD move, SPACE fires,
   B smart-bombs. Touch buttons appear on phones.
   ============================================================ */

import { beep } from "./ambience.js";

/* ---------------- attract mode (the screen in 3D) ---------------- */

export function makeAttractScreen(THREE) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 192;
  const g = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const stars = Array.from({ length: 50 }, () => [Math.random() * 256, Math.random() * 150, Math.random()]);
  let t = 0;
  function draw() {
    t += 0.15;
    g.fillStyle = "#000";
    g.fillRect(0, 0, 256, 192);
    for (const [x, y, r] of stars) {
      g.fillStyle = ((x + t * 8) % 50 < 25) ? "#9ff" : "#fff";
      g.fillRect((x + t * (r * 3)) % 256, y, 2, 2);
    }
    // mountains
    g.strokeStyle = "#a50";
    g.beginPath();
    for (let x = 0; x <= 256; x += 4) {
      const y = 165 - 18 * Math.abs(Math.sin((x + t * 6) * 0.05)) - 8 * Math.sin((x + t * 6) * 0.013);
      x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
    g.font = "900 30px monospace";
    g.textAlign = "center";
    g.fillStyle = Math.floor(t * 0.8) % 2 ? "#ff3434" : "#ffd23c";
    g.fillText("DEFENDER", 128, 70);
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

/* ---------------- the game ---------------- */

const W = 640, H = 400;        // canvas
const WORLD = 2560;            // wrap width
const SKY_TOP = 40;            // scanner strip above

let cv, g2, raf = null, onCloseCb = null;
let keys = {};
let st = null;                 // game state

const wrap = (x) => ((x % WORLD) + WORLD) % WORLD;
const wdist = (a, b) => {
  let d = wrap(b) - wrap(a);
  if (d > WORLD / 2) d -= WORLD;
  if (d < -WORLD / 2) d += WORLD;
  return d;
};
const groundY = (x) =>
  330 - 26 * Math.abs(Math.sin(x * 0.004)) - 14 * Math.sin(x * 0.0017 + 2) - 8 * Math.sin(x * 0.009);

function newGame() {
  st = {
    wave: 1, score: 0, lives: 3, bombs: 3, over: false, msg: 0,
    ship: { x: 200, y: 200, vx: 0, vy: 0, dir: 1, inv: 2 },
    humans: Array.from({ length: 8 }, (_, i) => ({ x: i * (WORLD / 8) + 120, st: "walk", y: 0, carrier: null })),
    landers: [], shots: [], bombsFx: [], parts: [], enemyShots: [],
  };
  spawnWave();
}
function spawnWave() {
  const n = 4 + st.wave * 2;
  for (let i = 0; i < n; i++) {
    st.landers.push({
      x: wrap(st.ship.x + 400 + Math.random() * (WORLD - 800)),
      y: 60 + Math.random() * 120,
      vx: (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5),
      st: "patrol", target: null, mutant: false, t: Math.random() * 9,
    });
  }
}

function boom(x, y, color, n = 14) {
  for (let i = 0; i < n; i++) {
    st.parts.push({
      x, y, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6,
      life: 0.5 + Math.random() * 0.4, color,
    });
  }
}

function update(dt) {
  const s = st.ship;
  st.msg = Math.max(0, st.msg - dt);

  if (!st.over) {
    // ship physics — defender-style momentum
    const thrust = keys.ArrowRight || keys.KeyD ? 1 : keys.ArrowLeft || keys.KeyA ? -1 : 0;
    if (thrust) { s.dir = thrust; s.vx += thrust * 14 * dt; }
    s.vx *= Math.pow(0.4, dt);
    s.vx = Math.max(-7, Math.min(7, s.vx));
    s.x = wrap(s.x + s.vx * 60 * dt);
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
      for (const L of st.landers) {
        if (Math.abs(wdist(s.x, L.x)) < W / 2) { killLander(L); }
      }
      st.landers = st.landers.filter(L => !L.dead);
    }
    if (!keys.KeyB) keys._bombed = false;
  }

  // landers
  for (const L of st.landers) {
    L.t += dt;
    if (L.mutant) {
      // hunts the player, jittery
      L.x = wrap(L.x + Math.sign(wdist(L.x, s.x)) * 90 * dt + (Math.random() - 0.5) * 3);
      L.y += Math.sign(s.y - L.y) * 70 * dt + (Math.random() - 0.5) * 3;
    } else if (L.st === "patrol") {
      L.x = wrap(L.x + L.vx * 50 * dt);
      L.y += Math.sin(L.t * 2) * 0.4;
      if (Math.random() < dt * 0.25) {
        const free = st.humans.filter(h => h.st === "walk");
        if (free.length) {
          L.target = free[Math.floor(Math.random() * free.length)];
          L.st = "descend";
        }
      }
    } else if (L.st === "descend" && L.target) {
      if (L.target.st !== "walk" && L.target.carrier !== L) { L.st = "patrol"; L.target = null; }
      else {
        L.x = wrap(L.x + Math.sign(wdist(L.x, L.target.x)) * 60 * dt);
        const gy = groundY(L.target.x) - 18;
        L.y += Math.sign(gy - L.y) * 60 * dt;
        if (Math.abs(wdist(L.x, L.target.x)) < 8 && Math.abs(L.y - gy) < 8) {
          L.st = "ascend"; L.target.st = "carried"; L.target.carrier = L;
          beep(800, 0.3, "square", 0.03, 1600);   // abduction alarm
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
    // lander fire
    if (!st.over && Math.random() < dt * (L.mutant ? 1.1 : 0.35) && Math.abs(wdist(s.x, L.x)) < 360) {
      const a = Math.atan2(s.y - L.y, wdist(L.x, s.x));
      st.enemyShots.push({ x: L.x, y: L.y, vx: Math.cos(a) * 3.2, vy: Math.sin(a) * 3.2, life: 2.4 });
    }
  }

  // humans falling after their captor dies
  for (const h of st.humans) {
    if (h.st === "fall") {
      h.y += 90 * dt;
      h.fell += 90 * dt;
      // caught by the ship?
      if (Math.abs(wdist(s.x, h.x)) < 16 && Math.abs(s.y - h.y) < 14) {
        h.st = "rescued"; st.score += 500; st.msg = 1.5; st.msgText = "CAUGHT! +500";
        beep(900, 0.2, "triangle", 0.05, 1800);
      } else if (h.y >= groundY(h.x) - 6) {
        if (h.fell > 130) { h.st = "gone"; boom(h.x, h.y, "#f66", 8); }
        else { h.st = "walk"; }
      }
    } else if (h.st === "rescued") {
      // riding along under the ship; drop off at ground level
      h.x = s.x; h.y = s.y + 14;
      if (s.y > groundY(s.x) - 40) { h.st = "walk"; st.score += 250; }
    } else if (h.st === "walk") {
      h.x = wrap(h.x + Math.sin(h.x * 0.01) * 12 * dt);
      h.y = groundY(h.x) - 6;
    }
  }

  // player shots
  for (const sh of st.shots) {
    sh.x = wrap(sh.x + sh.vx * 60 * dt);
    sh.life -= dt;
    for (const L of st.landers) {
      if (!L.dead && Math.abs(wdist(sh.x, L.x)) < 12 && Math.abs(sh.y - L.y) < 10) {
        killLander(L); sh.life = 0;
      }
    }
  }
  st.landers = st.landers.filter(L => !L.dead);
  st.shots = st.shots.filter(sh => sh.life > 0);

  // enemy shots
  for (const es of st.enemyShots) {
    es.x = wrap(es.x + es.vx * 60 * dt);
    es.y += es.vy * 60 * dt;
    es.life -= dt;
    if (!st.over && st.ship.inv <= 0 &&
        Math.abs(wdist(es.x, s.x)) < 12 && Math.abs(es.y - s.y) < 9) {
      es.life = 0; hitShip();
    }
  }
  st.enemyShots = st.enemyShots.filter(es => es.life > 0);

  // lander rams ship
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
}

function killLander(L) {
  L.dead = true;
  st.score += L.mutant ? 250 : 150;
  if (L.target && L.target.carrier === L) { L.target.st = "fall"; L.target.fell = 0; L.target.carrier = null; }
  boom(L.x, L.y, L.mutant ? "#f4f" : "#4f4");
  beep(220, 0.18, "sawtooth", 0.05, 40);
}

function hitShip() {
  st.lives--;
  boom(st.ship.x, st.ship.y, "#ff4", 24);
  beep(90, 0.5, "sawtooth", 0.08, 25);
  if (st.lives <= 0) { st.over = true; }
  else { st.ship.inv = 2.2; st.ship.vx = 0; }
}

/* ---------------- drawing ---------------- */

function toScreen(x) {
  // camera leads the ship in its facing direction
  const cam = wrap(st.ship.x + st.ship.dir * 140);
  let d = wdist(cam, x);
  return W / 2 + d;
}

function draw() {
  g2.fillStyle = "#000";
  g2.fillRect(0, 0, W, H);

  // terrain
  g2.strokeStyle = "#b85c00";
  g2.beginPath();
  const cam = wrap(st.ship.x + st.ship.dir * 140);
  for (let sx = 0; sx <= W; sx += 4) {
    const wx = cam + (sx - W / 2);
    const y = groundY(wrap(wx));
    sx === 0 ? g2.moveTo(sx, y) : g2.lineTo(sx, y);
  }
  g2.stroke();

  // humans
  for (const h of st.humans) {
    if (h.st === "gone") continue;
    const sx = toScreen(h.x);
    if (sx < -10 || sx > W + 10) continue;
    g2.fillStyle = "#f8f";
    g2.fillRect(sx - 2, h.y - 4, 4, 8);
  }
  // landers
  for (const L of st.landers) {
    const sx = toScreen(L.x);
    if (sx < -16 || sx > W + 16) continue;
    g2.fillStyle = L.mutant ? "#f4f" : "#4f4";
    g2.fillRect(sx - 7, L.y - 5, 14, 7);
    g2.fillRect(sx - 4, L.y - 9, 8, 4);
    g2.fillStyle = "#ff0";
    g2.fillRect(sx - 5, L.y + 2, 3, 3); g2.fillRect(sx + 2, L.y + 2, 3, 3);
  }
  // ship
  const s = st.ship;
  if (!st.over && (s.inv <= 0 || Math.floor(s.inv * 10) % 2)) {
    const sx = toScreen(s.x);
    g2.fillStyle = "#fff";
    g2.beginPath();
    g2.moveTo(sx + s.dir * 16, s.y);
    g2.lineTo(sx - s.dir * 10, s.y - 6);
    g2.lineTo(sx - s.dir * 10, s.y + 6);
    g2.closePath();
    g2.fill();
    g2.fillStyle = "#39f";
    g2.fillRect(sx - s.dir * 14, s.y - 2, 5, 4);
  }
  // shots
  g2.fillStyle = "#fff";
  for (const sh of st.shots) g2.fillRect(toScreen(sh.x) - 8, sh.y - 1, 16, 2);
  g2.fillStyle = "#f55";
  for (const es of st.enemyShots) g2.fillRect(toScreen(es.x) - 2, es.y - 2, 4, 4);
  for (const p of st.parts) {
    g2.fillStyle = p.color;
    g2.fillRect(toScreen(p.x) - 1, p.y - 1, 3, 3);
  }

  // scanner
  g2.fillStyle = "#020";
  g2.fillRect(0, 0, W, SKY_TOP - 6);
  g2.strokeStyle = "#0a0";
  g2.strokeRect(W * 0.3, 1, W * 0.4, SKY_TOP - 8);
  const mapX = (x) => W * 0.3 + (wrap(x - cam + WORLD / 2) / WORLD) * W * 0.4;
  for (const h of st.humans) if (h.st !== "gone") { g2.fillStyle = "#f8f"; g2.fillRect(mapX(h.x), 26, 2, 3); }
  for (const L of st.landers) { g2.fillStyle = L.mutant ? "#f4f" : "#4f4"; g2.fillRect(mapX(L.x), 8 + (L.y / 400) * 18, 2, 2); }
  g2.fillStyle = "#fff"; g2.fillRect(mapX(s.x), 8 + (s.y / 400) * 18, 3, 3);

  // hud
  g2.font = "14px monospace";
  g2.textAlign = "left";
  g2.fillStyle = "#ff4";
  g2.fillText(`SCORE ${st.score}`, 10, 16);
  g2.fillText(`HI ${hiScore()}`, 10, 32);
  g2.textAlign = "right";
  g2.fillText(`SHIPS ${st.lives}  BOMBS ${st.bombs}  WAVE ${st.wave}`, W - 10, 16);

  if (st.msg > 0 && st.msgText) {
    g2.textAlign = "center";
    g2.fillStyle = "#9ff";
    g2.fillText(st.msgText, W / 2, 70);
  }
  if (st.over) {
    g2.textAlign = "center";
    g2.font = "900 34px monospace";
    g2.fillStyle = "#f33";
    g2.fillText("GAME OVER", W / 2, 180);
    g2.font = "14px monospace";
    g2.fillStyle = "#fff";
    g2.fillText(`FINAL SCORE ${st.score}`, W / 2, 210);
    g2.fillText("PRESS ENTER TO PLAY AGAIN", W / 2, 236);
  }
}

function hiScore() {
  try { return parseInt(localStorage.getItem("metro.defender.hi") || "0", 10) || 0; } catch (e) { return 0; }
}
function saveHi() {
  try {
    if (st.score > hiScore()) localStorage.setItem("metro.defender.hi", String(st.score));
  } catch (e) {}
}

/* ---------------- overlay lifecycle ---------------- */

function keydown(e) {
  if (e.code === "Escape") return;     // main.js closes us
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  if (st?.over && e.code === "Enter") { saveHi(); newGame(); return; }
  keys[e.code] = true;
}
function keyup(e) { keys[e.code] = false; }

export function openArcade() {
  cv = document.getElementById("arcade-canvas");
  g2 = cv.getContext("2d");
  keys = {};
  newGame();
  document.getElementById("arcade").classList.add("show");
  addEventListener("keydown", keydown);
  addEventListener("keyup", keyup);
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  // touch controls
  document.querySelectorAll("#arcade .pad").forEach(btn => {
    const code = btn.dataset.code;
    btn.onpointerdown = (e) => { e.preventDefault(); keys[code] = true; };
    btn.onpointerup = btn.onpointercancel = btn.onpointerleave = () => { keys[code] = false; };
  });
}

export function closeArcade() {
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  saveHi();
  removeEventListener("keydown", keydown);
  removeEventListener("keyup", keyup);
  document.getElementById("arcade").classList.remove("show");
}

export function arcadeIsOpen() {
  return document.getElementById("arcade").classList.contains("show");
}
