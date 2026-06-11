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
import { startAmbience, citySound, pianoNote, purr, setRain, setWater, setRoomTone, kettleBoil, meow, hiss, careSound, drumHit } from "./ambience.js";
import { weather } from "./weather.js";
import { startPlanes } from "./planes.js";
import { Cat } from "./cat.js";
import { openArcade, closeArcade, arcadeIsOpen, arcadeWantsEsc, handleGameMessage, setScoreHook } from "./arcade.js";
import { PIANO_VOICES } from "./ambience.js";
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
camera.layers.enable(1);   // see the boat layer too (its lights stay its own)
const world = buildWorld(renderer);
const controls = new Controls(camera, canvas, world.bounds, world.isWalkable);
const notesWall = new NotesWall(world.noteGroup, world.walls, store);
const ghosts = new Ghosts(world.ghostGroup);
const raycaster = new THREE.Raycaster();
raycaster.layers.enableAll();   // clickables exist on both light layers
const identity = getIdentity();

controls.pos.x = world.spawn.x;
controls.pos.z = world.spawn.z;
controls.yaw = world.spawn.yaw;

world.setCityListener((type) => { if (!inBoat) citySound(type); });

// piano voice — sticky per visitor, broadcast with each note
let pianoVoice = 0;
try { pianoVoice = (parseInt(localStorage.getItem("metro.voice") || "0", 10) || 0) % PIANO_VOICES.length; } catch (e) {}

// the cat — its key-walking plays the same piano visitors can play.
// All bedroom sounds are gated: aboard THE DESI you hear only the sea.
const bedroomSound = (fn) => (...a) => { if (!inBoat) fn(...a); };
const cat = new Cat(world.scene, world.catSpots, {
  plink: bedroomSound((i) => { pianoNote(i % 15, pianoVoice); world.pressPianoKey(i % 15); }),
  purr: bedroomSound(purr),
  meow: bedroomSound(meow),
  hiss: bedroomSound(hiss),
  dig: bedroomSound(() => careSound("sand")),
});

// shared cat needs — bowls and litter are the same for every visitor
let catState = null;
function applyCatState(s) {
  catState = s;
  const d = store.decayCat(s);
  world.updateCare(d);
  cat.setNeeds(d);
  // cat wellbeing HUD: full while it feeds itself, drains only when
  // a meal is overdue and the bowl sits empty
  const pct = (v) => `${Math.round(v * 100)}%`;
  const well = (v) => v < 0.4 ? "crit" : v < 0.75 ? "low" : "";
  const dirty = (v) => v > 0.85 ? "crit" : v > 0.6 ? "low" : "";
  $("#cat-meters").innerHTML =
    `fed <span class="${well(d.fed)}">${pct(d.fed)}</span>` +
    ` · hydrated <span class="${well(d.hydrated)}">${pct(d.hydrated)}</span>` +
    (d.litter > 0.5 ? ` · litter <span class="${dirty(d.litter)}">${pct(d.litter)}</span>` : "") +
    ((d.hungry && d.food <= 0.05) ? ` · <span class="crit">food bowl empty!</span>` : "") +
    ((d.thirsty && d.water <= 0.05) ? ` · <span class="crit">water bowl empty!</span>` : "");
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
  const targets = [cat.hitMesh, world.pianoMesh, world.pianoVoiceMesh, world.dimmerHit, world.boatExitHit, world.volcaHit, world.bottleHit, ...world.arcadeHits, ...world.dmTargets, ...world.closetHits, ...world.careTargets, ...world.curtainHits, ...notesWall.raycastTargets(), ...world.blockers];
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
      store.logEvent("feed");
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
      store.logEvent("clean");
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
    else presence.sendAct({ kind: "pet" });
    if (outcome === "love") store.logEvent("pet");
    wrapCare("pet").then(res => {
      if (res && outcome === "love") {
        toast(`purrrr — this cat has been petted ${res.pets} time${res.pets === 1 ? "" : "s"}`);
        applyCatState(res);
      }
    }).catch(() => {});
  } else if (hit.object.userData.closet && hit.distance < 3) {
    const open = world.toggleCloset();
    presence.sendAct({ kind: "closet", open });
    toast(open ? "the closet creaks open…" : "closet closed");
  } else if (hit.object.userData.arcade && hit.distance < 3.2) {
    modalOpen = true;
    controls.unlock();
    store.logEvent("arcade_" + hit.object.userData.arcade);
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
    pianoNote(key, pianoVoice);
    world.pressPianoKey(key);
    presence.sendNote(key, pianoVoice);
    if (Date.now() - (window.__pianoLogAt || 0) > 60000) {
      window.__pianoLogAt = Date.now();
      store.logEvent("piano");
    }
  } else if (hit.object.userData.dimmer && hit.distance < 2.6) {
    openDimmer();
  } else if (hit.object.userData.portal === "boat" && hit.distance < 2.6) {
    tryBoat();
  } else if (hit.object.userData.boatExit && hit.distance < 2.6) {
    leaveBoat();
  } else if (hit.object.userData.kettle && hit.distance < 1.9) {
    kettleBoil();
    toast("fika in three minutes ☕");
  } else if (hit.object.userData.faucet && hit.distance < 1.9) {
    careSound("water");
  } else if (hit.object.userData.bottle && hit.distance < 2.2) {
    openBottle();
  } else if (hit.object.userData.volca && hit.distance < 1.8 && hit.uv) {
    // 2 rows × 4 pads, mapped straight off the face texture
    const col = Math.min(3, Math.floor(hit.uv.x * 4.27));
    const row = hit.uv.y > 0.45 ? 0 : 1;     // uv y up = top row
    const pad = row * 4 + col;
    drumHit(pad);
    world.pressVolcaPad(pad);
    presence.sendAct({ kind: "volca", pad });
  } else if (hit.object.userData.pianoVoice && hit.distance < 2.4) {
    pianoVoice = (pianoVoice + 1) % PIANO_VOICES.length;
    try { localStorage.setItem("metro.voice", String(pianoVoice)); } catch (e) {}
    pianoNote(7, pianoVoice);
    toast(`piano voice: ${PIANO_VOICES[pianoVoice].name}`);
  } else if (hit.object.userData.curtain && hit.distance < 3.2) {
    const closed = world.toggleCurtains();
    store.logEvent("curtains");
    presence.sendAct({ kind: "curtains", closed });
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
    aimTip.textContent = `${TAP} to pet the cat · fed ${Math.round(d.fed * 100)}%`;
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
  } else if (hit && hit.object.userData.pianoVoice && hit.distance < 2.4) {
    aimTip.textContent = `${TAP} to change the piano sound (${PIANO_VOICES[pianoVoice].name})`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.dimmer && hit.distance < 2.6) {
    aimTip.textContent = `${TAP} — light dimmer`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.kettle && hit.distance < 1.9) {
    aimTip.textContent = `${TAP} to put the kettle on`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.bottle && hit.distance < 2.2) {
    aimTip.textContent = `${TAP} — something washed up against the hull`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.volca && hit.distance < 1.8) {
    aimTip.textContent = `${TAP} the pads`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.portal === "boat" && hit.distance < 2.6) {
    aimTip.textContent = "private. it wants a password.";
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.boatExit && hit.distance < 2.6) {
    aimTip.textContent = `${TAP} to go back to the room`;
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
    refreshNoteVisibility();
    store.logEvent(saved.kind);
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

/* ---------------- the dimmer on the wall ---------------- */
// a proper modal (pointer unlocks, so the mouse actually works):
// full RGB hue wheel as a rainbow slider + a level slider
let dimLevel = 0, dimHue = 40;
const dimmerUI = $("#dimmer-ui");
// HSL(h, 90%, 70%) → hex — the full RGB wheel as one slider
const hueToHex = (h) => {
  const s = 0.9, l = 0.7;
  const a = s * Math.min(l, 1 - l);
  const chan = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const to = (v) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${to(chan(0))}${to(chan(8))}${to(chan(4))}`;
};
let dimSendT = 0, dimSaveT = 0;
function applyDimmer(broadcast) {
  const color = hueToHex(dimHue);
  world.setRoomLight(dimLevel, color);
  $("#dim-preview").style.background = color;
  $("#dim-preview").style.opacity = 0.25 + dimLevel * 0.75;
  if (broadcast && Date.now() - dimSendT > 200) {
    dimSendT = Date.now();
    presence.sendAct({ kind: "dimmer", level: dimLevel, color });
  }
  // persist (throttled): the lights stay how the room left them,
  // even for people who arrive tomorrow
  if (broadcast && Date.now() - dimSaveT > 1500) {
    dimSaveT = Date.now();
    store.saveRoomLight(dimLevel, color).catch(() => {});
  }
}
function openDimmer() {
  modalOpen = true;
  controls.unlock();
  show(dimmerUI);
  applyDimmer(false);
}
function closeDimmer() {
  hide(dimmerUI);
  modalOpen = false;
  // send + persist the final state so everyone (now and later) gets it
  const color = hueToHex(dimHue);
  presence.sendAct({ kind: "dimmer", level: dimLevel, color });
  store.saveRoomLight(dimLevel, color).catch(() => {});
  store.logEvent("light");
  if (entered) safeLock();
}
$("#dimmer-close").addEventListener("click", closeDimmer);
$("#dim-level").addEventListener("input", (e) => { dimLevel = e.target.value / 100; applyDimmer(true); });
$("#dim-hue").addEventListener("input", (e) => { dimHue = +e.target.value; applyDimmer(true); });

/* ---------------- room chat — press T, or the bubble ---------------- */
const chatLog = $("#chat-log");
const chatBar = $("#chat-bar");
const chatInput = $("#chat-input");
let chatOpen = false;
function pushChat(name, color, text, mine = false) {
  const div = document.createElement("div");
  div.className = "chat-msg";
  const n = document.createElement("span");
  n.className = "chat-name";
  n.style.color = color || "#ffb347";
  n.textContent = name || "someone";
  div.appendChild(n);
  div.appendChild(document.createTextNode(text));
  chatLog.appendChild(div);
  while (chatLog.children.length > 8) chatLog.removeChild(chatLog.firstChild);
  setTimeout(() => div.classList.add("old"), 14000);
}
function openChat() {
  if (modalOpen) return;
  chatOpen = true;
  modalOpen = true;
  controls.unlock();
  chatBar.classList.add("show");
  setTimeout(() => chatInput.focus(), 30);
}
function closeChat(relock = true) {
  chatOpen = false;
  modalOpen = false;
  chatBar.classList.remove("show");
  chatInput.blur();
  if (relock && entered) safeLock();
}
$("#chat-btn").addEventListener("click", () => { if (!chatOpen) openChat(); });
chatInput.addEventListener("keydown", (e) => {
  e.stopPropagation();
  if (e.key === "Enter") {
    const text = chatInput.value.trim().slice(0, 200);
    chatInput.value = "";
    if (text) {
      presence.sendChat(text);
      pushChat(identity.name || "you", identity.color, text, true);
      store.logEvent("chat");
    }
    closeChat();
  } else if (e.key === "Escape") {
    closeChat();
  }
});
addEventListener("keydown", (e) => {
  if ((e.code === "KeyT" || e.code === "Enter") && controls.locked && !modalOpen && entered) {
    e.preventDefault();
    openChat();
  }
});

/* ---------------- THE DESI: the boat room ---------------- */
const BOAT_PASS_HASH = "7b917f679d49b06d44802d0c701bc923dd077cd94719999c48f850fc468d1c57";
let inBoat = false;
async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function fadeTo(fn) {
  const f = $("#fade");
  f.classList.add("dark");
  setTimeout(() => { fn(); setTimeout(() => f.classList.remove("dark"), 150); }, 480);
}
async function tryBoat() {
  const pass = prompt("this door is private. password:");
  if (!pass) return;
  if (await sha256(pass.trim().toLowerCase()) !== BOAT_PASS_HASH) {
    return toast("the door doesn't budge.");
  }
  fadeTo(() => {
    inBoat = true;
    controls.pos.x = world.boatSpawn.x;
    controls.pos.z = world.boatSpawn.z;
    controls.yaw = world.boatSpawn.yaw;
    setWater(true);
    store.logEvent("boat");
    setRoomTone(false);                  // the bedroom stays behind, fully
    refreshNoteVisibility();
    toast("welcome aboard THE DESI 🌊");
  });
}
// each room shows only its own notes
function refreshNoteVisibility() {
  for (const mesh of world.noteGroup.children) {
    const onBoat = String(mesh.userData.note?.wall || "").startsWith("boat");
    mesh.visible = inBoat ? onBoat : !onBoat;
  }
}

function leaveBoat() {
  fadeTo(() => {
    inBoat = false;
    controls.pos.x = world.bathroomSpawn.x;
    controls.pos.z = world.bathroomSpawn.z;
    controls.yaw = world.bathroomSpawn.yaw;
    setWater(false);                     // the sea stays on the boat, fully
    setRoomTone(true);
    refreshNoteVisibility();
  });
}

/* ---------------- message in a bottle ---------------- */
const bottleOverlay = $("#bottle");
async function openBottle() {
  modalOpen = true;
  controls.unlock();
  $("#bottle-msg").textContent = "…uncorking…";
  show(bottleOverlay);
  try {
    const b = await store.readBottle();
    $("#bottle-msg").textContent = b && b.text
      ? `"${b.text}"\n\n— adrift since ${timeAgo(b.created_at)}`
      : "the bottle is empty. yours could be the first message in this sea.";
  } catch (e) {
    $("#bottle-msg").textContent = "the cork won't budge — try again later.";
  }
}
function closeBottle() {
  hide(bottleOverlay);
  modalOpen = false;
  if (entered) safeLock();
}
$("#bottle-close").addEventListener("click", closeBottle);
$("#bottle-send").addEventListener("click", async () => {
  const text = $("#bottle-text").value.trim().slice(0, 200);
  if (!text) return toast("write something first");
  let last = 0;
  try { last = +localStorage.getItem("metro.bottlecast") || 0; } catch (e) {}
  if (Date.now() - last < 24 * 3600000) return toast("one bottle a day — the sea has rules");
  try {
    await store.castBottle(text);
    try { localStorage.setItem("metro.bottlecast", String(Date.now())); } catch (e) {}
    $("#bottle-text").value = "";
    closeBottle();
    toast("the sea took it. someone will find it. 🌊");
  } catch (e) {
    toast("the tide refused — try again in a bit");
  }
});

/* ---------------- flight strip: the jet crossing the glass ---------------- */
let stripTimer = null;
function showFlightStrip(info) {
  const el = $("#flight-strip");
  el.innerHTML =
    `<span class="fs-plane">✈</span> <span class="fs-flight">${(info.flight || "").replace(/[<>&]/g, "")}</span>` +
    (info.type ? ` <span class="fs-type">${String(info.type).replace(/[<>&]/g, "")}</span>` : "") +
    ` <span class="fs-label">${info.label}</span>` +
    (info.alt ? ` <span class="fs-alt">${info.alt.toLocaleString()} ft</span>` : "");
  el.classList.add("show");
  clearTimeout(stripTimer);
  stripTimer = setTimeout(() => el.classList.remove("show"), 15000);
}

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
        if (m.file_path) {
          const src = store.demoUrl(m.file_path);
          if (src) {
            const audio = document.createElement("audio");
            audio.controls = true;
            audio.preload = "none";
            audio.src = src;
            audio.style.width = "100%";
            audio.style.marginTop = "8px";
            div.appendChild(audio);
            const dl = document.createElement("a");
            dl.href = src;
            dl.download = "";
            dl.textContent = "download file";
            div.appendChild(dl);
          }
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
$("#dm-file").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 25 * 1024 * 1024) {
    e.target.value = "";
    return toast("that file's over 25 MB — bounce it down a little");
  }
  $("#dm-file-label").textContent = `🎵 ${f.name} (${(f.size / 1048576).toFixed(1)} MB)`;
});

$("#dm-send").addEventListener("click", async () => {
  const text = $("#dm-text").value.trim();
  if (!text) return toast("write something first");
  const url = $("#dm-url").value.trim() ? safeUrl($("#dm-url").value) : null;
  if ($("#dm-url").value.trim() && !url) return toast("that link needs to be http(s)");
  const file = $("#dm-file").files[0] || null;
  const btn = $("#dm-send");
  btn.disabled = true;
  btn.textContent = file ? "uploading…" : "sending…";
  try {
    await store.sendDM({ name: $("#dm-name").value.trim().slice(0, 40) || null, text: text.slice(0, 500), url }, file);
    store.logEvent("dm");
    $("#dm-text").value = ""; $("#dm-url").value = ""; $("#dm-file").value = "";
    $("#dm-file-label").textContent = "or attach an audio file (≤ 25 MB)";
    closeDM();
    toast(store.mode === "supabase" ? "sent. it's on metro's computer now." : "saved locally — connect supabase to really send it");
  } catch (e) {
    toast("couldn't send — try again in a bit");
  } finally {
    btn.disabled = false;
    btn.textContent = "send to metro";
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
    if (bottleOverlay.classList.contains("show")) closeBottle();
    if (dimmerUI.classList.contains("show")) closeDimmer();
    // real DOOM owns ESC (its own menu) — only its × button closes it
    if (arcadeIsOpen() && !arcadeWantsEsc()) closeArcadeOverlay();
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
    refreshNoteVisibility();
  } catch (e) {
    console.warn("[metro] couldn't load the wall:", e);
    toast("couldn't load the wall — refresh to retry");
  }

  store.onNew((n) => { if (!notesWall.has(n.id)) { notesWall.add(n); refreshNoteVisibility(); } });
  store.onRemoved((id) => notesWall.remove(id));

  presence.join(identity, () => controls.pose());
  presence.onPeers((peers) => {
    ghosts.syncPeers(peers);
    $("#online-count").textContent = String(peers.size + 1);
  });
  presence.onPose((uid, pose) => ghosts.setPose(uid, pose));
  presence.onNote((uid, i, v) => {
    if (inBoat) return;          // the bedroom piano stays in the bedroom
    pianoNote(i, v ?? 0);
    world.pressPianoKey(i);
  });
  presence.onGame((p) => handleGameMessage(p));
  // the room is one shared physical space: doors, curtains, affection
  presence.onAct((p) => {
    if (p.kind === "curtains") {
      world.setCurtains(p.closed);
      toast(p.closed ? "someone drew the curtains" : "someone opened the curtains");
    } else if (p.kind === "closet") {
      world.setCloset(p.open);
      toast(p.open ? "someone opened the closet…" : "someone closed the closet");
    } else if (p.kind === "pet") {
      if (!inBoat) cat.remoteHearts();
    } else if (p.kind === "dimmer") {
      dimLevel = p.level;
      world.setRoomLight(p.level, p.color);
      $("#dim-level").value = Math.round(p.level * 100);
    } else if (p.kind === "volca") {
      if (!inBoat) return;       // and the boat's sampler stays on the boat
      drumHit(p.pad);
      world.pressVolcaPad(p.pad);
    }
  });
  presence.onChat((p) => pushChat(p.name || "someone", p.color, p.text));

  // arcade leaderboard: load it, keep it live, report new scores
  const refreshScores = () =>
    store.listScores("defender", 8).then(rows => world.updateScores(rows)).catch(() => {});
  refreshScores();
  store.onNewScore(refreshScores);
  setScoreHook((game, score) => {
    store.submitScore(game, (identity.name || "anon").slice(0, 24), score)
      .then(refreshScores)
      .catch(() => {});
  });

  weather.start();
  // real LAX traffic drives the window flyovers when the API is up —
  // each one gets a flight strip: who it is, what it is, where it's going
  startPlanes((info) => {
    world.triggerPlane();
    if (info && !inBoat) showFlightStrip(info);   // LA traffic is not Sweden's business
  }, (isLive) => world.setLivePlanes(isLive));

  // the lights come back exactly as the room left them
  store.getRoomLight().then(s => {
    if (!s) return;
    dimLevel = s.light_level ?? 0;
    world.setRoomLight(dimLevel, s.light_color);
    $("#dim-level").value = Math.round(dimLevel * 100);
  }).catch(() => {});
  store.onRoomLight((s) => {
    dimLevel = s.light_level ?? 0;
    world.setRoomLight(dimLevel, s.light_color);
    $("#dim-level").value = Math.round(dimLevel * 100);
  });

  store.logEvent("visit");

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
  world.setParallax(camera.position.x);
  // aboard THE DESI the whole world rolls a little — set absolutely
  // (never accumulate), so pausing/ESC can't drift you up or down
  if (inBoat) {
    camera.position.y = 1.62 + Math.sin(t * 0.85) * 0.022 + Math.sin(t * 1.7) * 0.008;
    camera.rotation.z = Math.sin(t * 0.5) * 0.013;
  } else {
    camera.rotation.z = 0;
  }
  world.tick(dt);
  ghosts.tick(dt, t);
  cat.tick(dt, t, controls.pose());
  renderer.render(world.scene, camera);
});
