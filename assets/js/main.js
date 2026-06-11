/* ============================================================
   THE METRO — boot + glue
   ============================================================ */

import * as THREE from "three";
import { buildWorld } from "./world.js";
import { Controls } from "./controls.js";
import { NotesWall } from "./notes3d.js";
import { Ghosts } from "./ghosts.js";
import { store } from "./store.js";
import { presence } from "./presence.js";
import { startAmbience, citySound, pianoNote, purr, setRain, meow, hiss, careSound } from "./ambience.js";
import { weather } from "./weather.js";
import { Cat } from "./cat.js";
import { openArcade, closeArcade, arcadeIsOpen, handleGameMessage } from "./arcade.js";
import {
  PAPERS, IS_TOUCH, safeUrl, hostOf, timeAgo, toast,
  getIdentity, saveIdentity, shrinkImage,
} from "./util.js";

const $ = (s) => document.querySelector(s);

/* ---------------- renderer / scene ---------------- */
const canvas = $("#scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 120);
const world = buildWorld(renderer);
const controls = new Controls(camera, canvas, world.bounds, world.isWalkable);
const notesWall = new NotesWall(world.noteGroup, world.walls, store);
const ghosts = new Ghosts(world.ghostGroup);
const raycaster = new THREE.Raycaster();
const identity = getIdentity();

controls.pos.x = world.spawn.x;
controls.pos.z = world.spawn.z;
controls.yaw = world.spawn.yaw;

world.setCityListener((type) => citySound(type));

// the cat — its key-walking plays the same piano visitors can play
const cat = new Cat(world.scene, world.catSpots, {
  plink: (i) => { pianoNote(i % 15); world.pressPianoKey(i % 15); },
  purr, meow, hiss, dig: () => careSound("sand"),
});

// shared cat needs — bowls and litter are the same for every visitor
let catState = null;
function applyCatState(s) {
  catState = s;
  const d = store.decayCat(s);
  world.updateCare(d);
  cat.setNeeds(d);
  // the hunger meter HUD
  const pct = (v) => `${Math.round(v * 100)}%`;
  const cls = (v) => v > 0.85 ? "crit" : v > 0.6 ? "low" : "";
  $("#cat-meters").innerHTML =
    `hunger <span class="${cls(d.hunger)}">${pct(d.hunger)}</span>` +
    ` · thirst <span class="${cls(d.thirst)}">${pct(d.thirst)}</span>` +
    (d.litter > 0.5 ? ` · litter <span class="${cls(d.litter)}">${pct(d.litter)}</span>` : "") +
    ((d.hungry && d.food <= 0.05) ? ` · <span class="crit">bowl empty!</span>` : "");
}
setInterval(() => { if (catState) applyCatState(catState); }, 60000);  // re-check the timers

// when the cat finishes eating/drinking/using the box, the shared state
// changes for everyone — first visitor's cat to act wins, the rest sync
cat.onNeed = (kind) => {
  const action = kind === "litterbox" ? "bathroom" : kind;
  wrapCare(action)
    .then(res => { if (res && res.ok !== false) applyCatState(res); })
    .catch(() => {});
};

// the real weather outside
weather.onUpdate((wx) => { world.setWeather(wx); setRain(wx.rain); });
world.setWeather(weather.current);

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ---------------- ui elements ---------------- */
const intro = $("#intro"), paused = $("#paused"), hud = $("#hud");
const composer = $("#composer"), reader = $("#reader");
const aimTip = $("#aim-tip");

let modalOpen = false;
let pendingPlacement = null;
let currentNote = null;       // note shown in reader
let entered = false;
let lastPostAt = 0;
const adminMode = location.hash === "#admin";

function show(el) { el.classList.add("show"); }
function hide(el) { el.classList.remove("show"); }

function safeLock() {
  try {
    const p = canvas.ownerDocument && controls.lock();
    if (p && p.catch) p.catch(() => show(paused));
  } catch (e) { show(paused); }
}

controls.onLockChange((locked) => {
  if (locked) {
    hide(paused); hide(intro);
    hud.classList.add("show");
  } else if (entered && !modalOpen) {
    show(paused);
  }
});

$("#enter-btn").addEventListener("click", () => {
  entered = true;
  startAmbience();
  hide(intro);
  hud.classList.add("show");
  safeLock();
});
$("#resume-btn").addEventListener("click", () => { hide(paused); safeLock(); });
canvas.addEventListener("click", () => {
  if (entered && !modalOpen && !controls.locked && !IS_TOUCH) safeLock();
});

/* ---------------- aiming / interacting ---------------- */
function castAt(ndcX, ndcY) {
  raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
  // doors are included as blockers so notes can't be pinned onto them
  const targets = [cat.hitMesh, world.pianoMesh, ...world.arcadeHits, ...world.dmTargets, ...world.closetHits, ...world.careTargets, ...world.curtainHits, ...notesWall.raycastTargets(), ...world.blockers];
  const hits = raycaster.intersectObjects(targets, false);
  return hits[0] || null;
}

function gotScratched() {
  hiss();
  const el = $("#scratch");
  el.classList.remove("flash");
  void el.offsetWidth;          // restart the animation
  el.classList.add("flash");
  canvas.classList.remove("shake");
  void canvas.offsetWidth;
  canvas.classList.add("shake");
  toast("😾 the cat scratched you");
}

function treatsLeftToday() {
  let log = [];
  try { log = JSON.parse(localStorage.getItem("metro.treats") || "[]"); } catch (e) {}
  log = log.filter(t => Date.now() - t < 24 * 3600000);
  try { localStorage.setItem("metro.treats", JSON.stringify(log)); } catch (e) {}
  return 3 - log.length;
}

async function handleCare(kind) {
  const d = store.decayCat(catState);
  try {
    if (kind === "food") {
      if (d.food >= 0.6) return toast("the food bowl is still pretty full");
      careSound("kibble");
      applyCatState(await wrapCare("feed"));
      toast("you filled the food bowl 🐾");
    } else if (kind === "water") {
      if (d.water >= 0.7) return toast("the water's fine");
      careSound("water");
      applyCatState(await wrapCare("water"));
      toast("fresh water, poured");
    } else if (kind === "litter") {
      if (d.litter <= 0.15) return toast("the litter box is clean");
      careSound("sand");
      applyCatState(await wrapCare("clean"));
      toast("litter box: spotless. you're a good person.");
    } else if (kind === "treats") {
      if (treatsLeftToday() <= 0) return toast("you've spoiled the cat enough for one day");
      const res = await wrapCare("treat");
      if (res && res.ok === false) return toast("the cat is full of treats right now");
      try {
        const log = JSON.parse(localStorage.getItem("metro.treats") || "[]");
        log.push(Date.now());
        localStorage.setItem("metro.treats", JSON.stringify(log));
      } catch (e) {}
      const p = controls.pose();
      cat.treatAt(p.x - Math.sin(p.yaw) * 0.7, p.z - Math.cos(p.yaw) * 0.7);
      if (res) applyCatState(res);
      toast("the cat is sprinting over");
    }
  } catch (e) {
    toast("couldn't reach the cat's things — try again");
  }
}
// cat_care returns the fresh state; stamp it so decay math starts now
async function wrapCare(action) {
  const res = await store.catCare(action);
  return res ? { ...res, updated_at: new Date().toISOString() } : res;
}

let lastPetAt = 0;
controls.onAction((ndcX, ndcY) => {
  if (modalOpen) return;
  const hit = castAt(ndcX, ndcY);
  if (!hit) return;
  if (hit.object.userData.cat && hit.distance < 2.2) {
    if (Date.now() - lastPetAt < 1200) return;
    lastPetAt = Date.now();
    const outcome = cat.petOutcome();
    if (outcome === "scratch") gotScratched();
    wrapCare("pet").then(res => {
      if (res && outcome === "love") {
        toast(`purrrr — this cat has been petted ${res.pets} time${res.pets === 1 ? "" : "s"}`);
        applyCatState(res);
      }
    }).catch(() => {});
  } else if (hit.object.userData.closet && hit.distance < 3) {
    const open = world.toggleCloset();
    toast(open ? "the closet creaks open…" : "closet closed");
  } else if (hit.object.userData.arcade && hit.distance < 3.2) {
    modalOpen = true;
    controls.unlock();
    openArcade(hit.object.userData.arcade, {
      send: (p) => presence.sendGame(p),
      myUid: identity.uid,
    });
  } else if (hit.object.userData.arcadeSoon && hit.distance < 3.2) {
    toast(`${hit.object.userData.arcadeSoon} — cabinet's dark. coming soon.`);
  } else if (hit.object.userData.dm && hit.distance < 3) {
    openDM();
  } else if (hit.object.userData.piano && hit.distance < 2.4 && hit.uv) {
    const key = Math.max(0, Math.min(14, Math.floor(hit.uv.x * 15)));
    pianoNote(key);
    world.pressPianoKey(key);
    presence.sendNote(key);
  } else if (hit.object.userData.curtain && hit.distance < 3.2) {
    const closed = world.toggleCurtains();
    toast(closed ? "curtains drawn — it's just you and the glow now" : "curtains open");
  } else if (hit.object.userData.care && hit.distance < 2.6) {
    handleCare(hit.object.userData.care);
  } else if (hit.object.userData.note) {
    openReader(hit.object.userData.note);
  } else if (hit.object.userData.postable && hit.distance < 4.5) {
    const place = notesWall.placementFromHit(hit);
    if (place) openComposer(place);
  }
});

// what would a tap/click do right now? (crosshair hint, desktop AND mobile)
const TAP = IS_TOUCH ? "tap" : "click";
setInterval(() => {
  if (!controls.locked || modalOpen) { aimTip.classList.remove("show"); return; }
  const hit = castAt(0, 0);
  if (hit && hit.object.userData.cat && hit.distance < 2.2) {
    const d = store.decayCat(catState);
    aimTip.textContent = `${TAP} to pet the cat · hunger ${Math.round(d.hunger * 100)}%`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.closet && hit.distance < 3) {
    aimTip.textContent = world.closetOpen() ? `${TAP} to close the closet` : `${TAP} to open the closet`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.arcade && hit.distance < 3.2) {
    aimTip.textContent = `${TAP} to play ${hit.object.userData.arcade.toUpperCase()}`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.arcadeSoon && hit.distance < 3.2) {
    aimTip.textContent = `${hit.object.userData.arcadeSoon} — coming soon`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.dm && hit.distance < 3) {
    aimTip.textContent = adminMode ? `${TAP} to open your inbox` : `${TAP} to send Metro a private note`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.piano && hit.distance < 2.4) {
    aimTip.textContent = `${TAP} the keys to play`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.curtain && hit.distance < 3.2) {
    aimTip.textContent = world.curtainsClosed() ? `${TAP} to open the curtains` : `${TAP} to draw the curtains`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.care && hit.distance < 2.6) {
    const d = store.decayCat(catState);
    const k = hit.object.userData.care;
    aimTip.textContent =
      k === "food" ? `food ${Math.round(d.food * 100)}% — ${TAP} to refill` :
      k === "water" ? `water ${Math.round(d.water * 100)}% — ${TAP} to refill` :
      k === "litter" ? (d.litter > 0.15 ? `${TAP} to clean the litter box` : "litter box — clean") :
      `treat jar — ${Math.max(0, treatsLeftToday())} left today`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.note) {
    aimTip.textContent = `${TAP} to read`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.postable && hit.distance < 4.5) {
    aimTip.textContent = `${TAP} to leave something`;
    aimTip.classList.add("show");
  } else {
    aimTip.classList.remove("show");
  }
}, 160);

/* ---------------- composer ---------------- */
let kind = "note";
let chosenPaper = PAPERS[0];
let photoBlob = null;

const noteText = $("#note-text"), charCount = $("#char-count");
const authorInput = $("#author-name");
const swatches = $("#swatches");

PAPERS.forEach((p, i) => {
  const b = document.createElement("button");
  b.className = "swatch" + (i === 0 ? " active" : "");
  b.style.background = p.bg;
  b.addEventListener("click", () => {
    chosenPaper = p;
    swatches.querySelectorAll(".swatch").forEach(s => s.classList.remove("active"));
    b.classList.add("active");
  });
  swatches.appendChild(b);
});

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    kind = tab.dataset.kind;
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === tab));
    for (const k of ["note", "photo", "link"]) {
      $(`#pane-${k}`).classList.toggle("hidden", k !== kind);
    }
  });
});

noteText.addEventListener("input", () => { charCount.textContent = noteText.value.length; });

$("#photo-input").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    photoBlob = await shrinkImage(f);
    const prev = $("#photo-preview");
    prev.src = URL.createObjectURL(photoBlob);
    prev.classList.remove("hidden");
    $("#file-drop-label").textContent = "";
  } catch (err) {
    toast("that file doesn't look like a picture");
  }
});

function openComposer(place) {
  pendingPlacement = place;
  modalOpen = true;
  controls.unlock();
  authorInput.value = identity.name || "";
  show(composer);
  if (!IS_TOUCH) setTimeout(() => noteText.focus(), 50);
}
function closeComposer(relock = true) {
  hide(composer);
  modalOpen = false;
  pendingPlacement = null;
  if (relock && entered) safeLock();
}
$("#composer-close").addEventListener("click", () => closeComposer());

$("#post-btn").addEventListener("click", async () => {
  if (!pendingPlacement) return closeComposer();
  if (Date.now() - lastPostAt < 20000) {
    return toast("easy — one thing on the wall every 20 seconds");
  }

  const author = authorInput.value.trim().slice(0, 24);
  const base = {
    kind, author: author || null, color: null, text: null, url: null,
    wall: pendingPlacement.wall,
    x: pendingPlacement.x, y: pendingPlacement.y, rot: pendingPlacement.rot,
  };
  let blob = null;

  if (kind === "note") {
    const text = noteText.value.trim();
    if (!text) return toast("write something first");
    base.text = text.slice(0, 280);
    base.color = chosenPaper.bg;
  } else if (kind === "photo") {
    if (!photoBlob) return toast("choose a picture first");
    base.text = $("#photo-caption").value.trim().slice(0, 120) || null;
    blob = photoBlob;
  } else {
    const url = safeUrl($("#link-url").value);
    if (!url) return toast("that needs to be a real http(s) link");
    base.url = url;
    base.text = $("#link-title").value.trim().slice(0, 80) || null;
  }

  identity.name = author;
  saveIdentity(identity);

  const btn = $("#post-btn");
  btn.disabled = true;
  try {
    const saved = await store.add(base, blob);
    notesWall.add(saved);
    lastPostAt = Date.now();
    // reset for next time
    noteText.value = ""; charCount.textContent = "0";
    $("#photo-caption").value = ""; $("#link-url").value = ""; $("#link-title").value = "";
    $("#photo-preview").classList.add("hidden");
    $("#file-drop-label").textContent = "tap to choose a picture";
    photoBlob = null;
    closeComposer();
    toast("it's on the wall. it stays.");
  } catch (err) {
    console.warn("[metro] post failed:", err);
    const msg = String(err?.message || err);
    toast(msg.includes("rate") || msg.includes("wall is busy")
      ? "the wall is busy — try again in a minute"
      : "couldn't reach the wall — try again");
  } finally {
    btn.disabled = false;
  }
});

/* ---------------- reader ---------------- */
function openReader(note) {
  currentNote = note;
  modalOpen = true;
  controls.unlock();
  const content = $("#reader-content");
  const visit = $("#reader-visit");
  visit.classList.add("hidden");

  if (note.kind === "photo") {
    const url = store.imageUrl(note.image_path);
    content.innerHTML = "";
    if (url) {
      const img = document.createElement("img");
      img.src = url; img.alt = note.text || "a photo someone left";
      content.appendChild(img);
    }
    if (note.text) {
      const cap = document.createElement("div");
      cap.className = "note-body";
      cap.textContent = note.text;
      content.appendChild(cap);
    }
  } else if (note.kind === "link") {
    content.innerHTML = "";
    const t = document.createElement("div");
    t.className = "link-title";
    t.textContent = note.text || hostOf(note.url);
    content.appendChild(t);
    visit.href = note.url;
    visit.textContent = `visit ${hostOf(note.url)} ↗`;
    visit.classList.remove("hidden");
  } else {
    content.innerHTML = "";
    const body = document.createElement("div");
    body.className = "note-body";
    body.textContent = note.text || "";
    content.appendChild(body);
  }

  $("#reader-meta").textContent =
    `${note.author ? note.author + " · " : ""}${timeAgo(note.created_at)}`;
  $("#reader-delete").classList.toggle("hidden", !adminMode);
  show(reader);
}
function closeReader() {
  hide(reader);
  modalOpen = false;
  currentNote = null;
  if (entered) safeLock();
}
$("#reader-close").addEventListener("click", closeReader);

$("#reader-delete").addEventListener("click", async () => {
  if (!currentNote) return;
  let pass = sessionStorage.getItem("metro.adminpass");
  if (!pass) {
    pass = prompt("admin passphrase:");
    if (!pass) return;
  }
  try {
    await store.adminDelete(currentNote.id, pass);
    sessionStorage.setItem("metro.adminpass", pass);
    notesWall.remove(currentNote.id);
    closeReader();
    toast("gone.");
  } catch (e) {
    sessionStorage.removeItem("metro.adminpass");
    toast("wrong passphrase");
  }
});

/* ---------------- private notes to Metro ---------------- */
const dmOverlay = $("#dm");
async function openDM() {
  modalOpen = true;
  controls.unlock();
  if (adminMode) {
    // owner: this is your inbox
    let pass = sessionStorage.getItem("metro.adminpass") || prompt("admin passphrase:");
    if (!pass) { modalOpen = false; if (entered) safeLock(); return; }
    $("#dm-title").textContent = "your inbox";
    $("#dm-compose").classList.add("hidden");
    const box = $("#dm-inbox");
    box.classList.remove("hidden");
    box.innerHTML = "<div class='dm-item'>opening…</div>";
    show(dmOverlay);
    try {
      const msgs = await store.readInbox(pass);
      if (msgs === null) throw new Error("wrong passphrase");
      sessionStorage.setItem("metro.adminpass", pass);
      box.innerHTML = msgs.length ? "" : "<div class='dm-item'>nothing yet — quiet day.</div>";
      for (const m of msgs) {
        const div = document.createElement("div");
        div.className = "dm-item";
        const meta = document.createElement("div");
        meta.className = "dm-meta";
        meta.textContent = `${m.name || "anonymous"} · ${timeAgo(m.created_at)}`;
        const body = document.createElement("div");
        body.textContent = m.text;
        div.append(meta, body);
        if (m.url && safeUrl(m.url)) {
          const a = document.createElement("a");
          a.href = safeUrl(m.url);
          a.target = "_blank";
          a.rel = "noopener noreferrer nofollow";
          a.textContent = m.url;
          div.appendChild(a);
        }
        box.appendChild(div);
      }
    } catch (e) {
      sessionStorage.removeItem("metro.adminpass");
      box.innerHTML = "<div class='dm-item'>wrong passphrase.</div>";
    }
  } else {
    $("#dm-title").textContent = "private note to metro";
    $("#dm-compose").classList.remove("hidden");
    $("#dm-inbox").classList.add("hidden");
    show(dmOverlay);
    if (!IS_TOUCH) setTimeout(() => $("#dm-text").focus(), 50);
  }
}
function closeDM() {
  hide(dmOverlay);
  modalOpen = false;
  if (entered) safeLock();
}
$("#dm-close").addEventListener("click", closeDM);
$("#dm-send").addEventListener("click", async () => {
  const text = $("#dm-text").value.trim();
  if (!text) return toast("write something first");
  const url = $("#dm-url").value.trim() ? safeUrl($("#dm-url").value) : null;
  if ($("#dm-url").value.trim() && !url) return toast("that link needs to be http(s)");
  const btn = $("#dm-send");
  btn.disabled = true;
  try {
    await store.sendDM({ name: $("#dm-name").value.trim().slice(0, 40) || null, text: text.slice(0, 500), url });
    $("#dm-text").value = ""; $("#dm-url").value = "";
    closeDM();
    toast(store.mode === "supabase" ? "sent. it's on metro's computer now." : "saved locally — connect supabase to really send it");
  } catch (e) {
    toast("couldn't send — try again in a bit");
  } finally {
    btn.disabled = false;
  }
});

function closeArcadeOverlay() {
  closeArcade();
  modalOpen = false;
  if (entered) safeLock();
}
$("#arcade-close").addEventListener("click", closeArcadeOverlay);

addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modalOpen) {
    if (composer.classList.contains("show")) closeComposer(false);
    if (reader.classList.contains("show")) closeReader();
    if (dmOverlay.classList.contains("show")) closeDM();
    if (arcadeIsOpen()) closeArcadeOverlay();
  }
});

/* ---------------- data + presence boot ---------------- */
(async function boot() {
  const mode = await store.init();

  // erase deep-link from a Discord notification: site.com/#erase=<note id>
  const eraseMatch = location.hash.match(/^#erase=([0-9a-f-]{36})$/i);
  if (eraseMatch) {
    const id = eraseMatch[1];
    let pass = sessionStorage.getItem("metro.adminpass") || prompt("admin passphrase to erase this:");
    if (pass) {
      try {
        await store.adminDelete(id, pass);
        sessionStorage.setItem("metro.adminpass", pass);
        toast("erased from the wall.");
      } catch (e) {
        sessionStorage.removeItem("metro.adminpass");
        toast("couldn't erase — wrong passphrase?");
      }
    }
    history.replaceState(null, "", location.pathname);
  }

  const badge = $("#mode-badge");
  if (mode === "supabase") {
    badge.textContent = "● connected — what you leave here is permanent";
  } else {
    badge.textContent = "local mode — notes only persist in this browser for now";
    badge.classList.add("warn");
  }

  // handwriting font has to be ready before notes are painted
  try { await document.fonts.ready; } catch (e) {}
  try {
    const notes = await store.list();
    notesWall.setAll(notes);
  } catch (e) {
    console.warn("[metro] couldn't load the wall:", e);
    toast("couldn't load the wall — refresh to retry");
  }

  store.onNew((n) => { if (!notesWall.has(n.id)) notesWall.add(n); });
  store.onRemoved((id) => notesWall.remove(id));

  presence.join(identity, () => controls.pose());
  presence.onPeers((peers) => {
    ghosts.syncPeers(peers);
    $("#online-count").textContent = String(peers.size + 1);
  });
  presence.onPose((uid, pose) => ghosts.setPose(uid, pose));
  presence.onNote((uid, i) => { pianoNote(i); world.pressPianoKey(i); });
  presence.onGame((p) => handleGameMessage(p));

  weather.start();

  // cat needs: load shared state, stay subscribed to everyone's care
  try { applyCatState(await store.getCatState()); }
  catch (e) { applyCatState({ food: 1, water: 1, litter: 0, pets: 0, updated_at: new Date().toISOString() }); }
  store.onCatState((s) => applyCatState(s));
})();

/* ---------------- frame loop ---------------- */
window.METRO_DEBUG = { renderer, camera, world, controls, THREE, cat, notesWall };

const clock = new THREE.Clock();
let t = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  controls.update(dt);
  world.tick(dt);
  ghosts.tick(dt, t);
  cat.tick(dt, t, controls.pose());
  renderer.render(world.scene, camera);
});
