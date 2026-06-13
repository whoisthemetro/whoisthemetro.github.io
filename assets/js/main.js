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
import { startAmbience, citySound, pianoNote, semitoneToKey, audioNow, purr, setRain, setWater, setRoomTone, setClubTone, kettleBoil, setThruster, boostSound, discSound, goalHorn, meow, hiss, careSound, drumHit, setArcadeZone, punchSound, shieldClang, stunBuzz, edrumHit, guitarPluck, shotSound, smokeSound } from "./ambience.js";
import { SONGS, playSong, stopSong, currentSongId } from "./songs.js";
import { progress } from "./progress.js";
import { voice } from "./voice.js";
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
// phones: skip MSAA, cap the pixel ratio, take the cheap shadow filter —
// the room reads the same and the battery lives twice as long
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: !IS_TOUCH, powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = IS_TOUCH ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 120);
camera.layers.enable(1);   // boat layer
camera.layers.enable(2);   // arena layer
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

world.setCityListener((type) => { if (!inBoat && !inArena && !inClub) citySound(type); });

// the arcade hums and chirps when you're near it — spatial by position
setInterval(() => {
  if (!entered) return;
  setArcadeZone(inBoat || inArena || inClub ? 0 : world.arcadeZoneLevel(controls.pos.x, controls.pos.z));
}, 250);

/* ---------------- voice: hold to talk, tap to leave it open ---------------- */
voice.init(identity.uid, (p) => presence.sendVoice(p));
// a shared tab/screen killed from the browser's "Stop sharing" pill ends the set
voice.setOnDJEnded(() => endSet());
let djHeardAt = 0;            // last dj chunk we received — lights the ON AIR sign for listeners
presence.onVoice((p) => {
  voice.handleChunk(p);
  if (p.dj && inClub) djHeardAt = Date.now();
});
// is a set reaching the room right now? the broadcaster knows from djLive
// (they never hear their own chunks); listeners know from the chunk clock.
function djAudioPresent() {
  return voice.djLive() || (!!djHeardAt && Date.now() - djHeardAt < 1600);
}
// the ON AIR sign and the idle sub both follow it: music on → sign lit, the
// empty-room drone ducks away; music off → sign dark, the drone holds the room
setInterval(() => {
  if (!entered || !inClub) return;
  const live = djAudioPresent();
  world.setOnAir(live);
  setClubTone(!live);
}, 400);
const micBtn = $("#mic-btn");
function updateMicUI() {
  micBtn.classList.toggle("live", voice.mode() === "open");
  micBtn.classList.toggle("ptt", voice.mode() === "ptt");
}
let micDownAt = 0;
micBtn.addEventListener("pointerdown", async (e) => {
  e.preventDefault();
  if (inClub) return toast("the venue is chat-only — press T or 💬 to talk");
  micDownAt = Date.now();
  if (!voice.isOn()) {
    if (!(await voice.startTalk(false))) toast("the mic said no — check browser permissions");
    updateMicUI();
  }
});
micBtn.addEventListener("pointerup", (e) => {
  e.preventDefault();
  const tap = Date.now() - micDownAt < 300;
  if (voice.mode() === "ptt") {
    if (tap) { voice.leaveOpen(); toast("mic open — tap again to close it"); }
    else voice.stopTalk();
  } else if (voice.mode() === "open" && tap) {
    voice.stopTalk();
    toast("mic closed");
  }
  updateMicUI();
});
micBtn.addEventListener("pointercancel", () => {
  if (voice.mode() === "ptt") voice.stopTalk();
  updateMicUI();
});
// desktop bonus: hold V to talk
addEventListener("keydown", (e) => {
  if (e.code === "KeyV" && !e.repeat && controls.locked && !modalOpen && entered && !inClub && !voice.isOn()) {
    voice.startTalk(false).then(ok => { if (!ok) toast("the mic said no — check browser permissions"); updateMicUI(); });
  }
});
addEventListener("keyup", (e) => {
  if (e.code === "KeyV" && voice.mode() === "ptt") { voice.stopTalk(); updateMicUI(); }
  // admin's quick venue re-skin — cycle the loft theme (backdrop + neon).
  // local + instant, the way the host sets the vibe before doors open.
  if (e.code === "KeyG" && !e.repeat && adminMode && inClub && entered && !modalOpen) {
    toast(`theme: ${world.cycleClubTheme()}`);
  }
});

// piano voice — sticky per visitor, broadcast with each note
let pianoVoice = 0;
try { pianoVoice = (parseInt(localStorage.getItem("metro.voice") || "0", 10) || 0) % PIANO_VOICES.length; } catch (e) {}

// the cat — its key-walking plays the same piano visitors can play.
// All bedroom sounds are gated: aboard THE DESI you hear only the sea.
const bedroomSound = (fn) => (...a) => { if (!inBoat && !inArena && !inClub) fn(...a); };
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
let carrying = null;          // {id, home} while re-hanging your own note
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
    if (carrying) { cancelCarry(); toast("put it back — re-hang it again when you're ready"); }
    show(paused);
  }
});

// the door wants a name — it floats over your head and signs everything you post
const nameInput = $("#visitor-name");
if (nameInput) nameInput.value = identity.name || "";
function enterRoom() {
  const name = (nameInput?.value || "").trim().slice(0, 24);
  if (!name) {
    nameInput?.focus();
    nameInput?.classList.remove("nudge");
    void nameInput?.offsetWidth;          // restart the shake
    nameInput?.classList.add("nudge");
    toast("the room wants a name first");
    return;
  }
  identity.name = name;
  saveIdentity(identity);
  presence.updateMeta({ name });          // others see your tag the moment you walk in
  entered = true;
  startAmbience();
  hide(intro);
  hud.classList.add("show");
  safeLock();
  // earned accessories: rebuild what this visitor already owns,
  // celebrate anything new they unlock from here on
  progress.start((acc, isNew) => {
    world.addAccessory(acc.id);
    if (isNew) toast(`🔓 the room grew something: ${acc.title}`);
  });
}
$("#enter-btn").addEventListener("click", enterRoom);
nameInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); enterRoom(); } });
$("#resume-btn").addEventListener("click", () => { hide(paused); safeLock(); });
canvas.addEventListener("click", () => {
  if (entered && !modalOpen && !controls.locked && !IS_TOUCH) safeLock();
});

/* ---------------- aiming / interacting ---------------- */
function castAt(ndcX, ndcY) {
  raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
  // doors are included as blockers so notes can't be pinned onto them
  const targets = [cat.hitMesh, world.pianoMesh, world.pianoVoiceMesh, world.dimmerHit, world.boatExitHit, world.clubExitHit, world.clubWindowHit, ...world.deckHits, world.volcaHit, world.bottleHit, world.echoPoster, world.discHit, world.blindsHit, world.glassHit, ...world.smokeHits, ...world.edrumHits, ...world.guitarHits, ...world.arenaExits, ...world.grabHandles, ...world.kiosks, ...world.arcadeHits, ...world.dmTargets, ...world.closetHits, ...world.careTargets, ...world.curtainHits, ...notesWall.raycastTargets(), ...world.blockers];
  const hits = raycaster.intersectObjects(targets, false);
  return hits[0] || null;
}

// a ray that only sees bare wall + the solid things stuck to it — used while
// re-hanging a note so the note you're carrying (floating on top of the
// crosshair) doesn't shadow the wall behind it.
function castWalls(ndcX, ndcY) {
  raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
  const targets = [...world.walls.map(w => w.mesh), ...world.blockers];
  return raycaster.intersectObjects(targets, false)[0] || null;
}

/* ---------- pick up & re-hang your OWN note ---------- */

function pickUpNote(note) {
  if (carrying || !note || note.uid !== identity.uid) return;
  const home = notesWall.pickUp(note.id);
  if (!home) return;
  carrying = { id: note.id, home };
  toast("carrying your note — look at bare wall and " + (IS_TOUCH ? "tap" : "click") + " to set it down");
}

// fired every frame while carrying: hover the note on the wall under the
// crosshair and tint it by whether that exact patch is free.
function updateCarry() {
  if (!carrying) return;
  const hit = castWalls(0, 0);
  const place = hit && hit.distance < 4.5 ? notesWall.placementFromHit(hit) : null;
  const mesh = notesWall.byId.get(carrying.id);
  if (!mesh) { carrying = null; return; }
  if (place) {
    place.rot = mesh.userData.note.rot || 0;   // keep its own tilt, don't re-roll
    notesWall.preview(carrying.id, place);
    mesh.material.opacity = notesWall.spotFree(place) ? 0.92 : 0.4;
    carrying.place = place;
  } else {
    carrying.place = null;
    mesh.material.opacity = 0.5;
  }
}

async function dropCarried() {
  if (!carrying) return;
  const c = carrying;
  if (!c.place) return toast("point at some bare wall first");
  const final = notesWall.drop(c.id, c.place);
  if (!final) return toast("no room right there — try another spot");
  carrying = null;
  refreshNoteVisibility();
  // tell everyone else live, then make it stick
  presence.sendAct({ kind: "notemove", id: c.id, ...final });
  try {
    await store.moveNote(c.id, identity.uid, final);
    toast("re-hung. it stays there now.");
  } catch (err) {
    toast("moved it here, but couldn't save the new spot");
  }
}

// ESC / losing the pointer mid-carry puts the note back where it was
function cancelCarry() {
  if (!carrying) return;
  notesWall.drop(carrying.id, carrying.home);
  carrying = null;
  refreshNoteVisibility();
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
  if (carrying) { dropCarried(); return; }   // a click while carrying sets it down
  const hit = castAt(ndcX, ndcY);
  // in the arena, a click is a swing — unless you're on a catapult
  // handle (then the punch IS the launch) or aiming at something useful
  if (inArena) {
    if (controls.anchored && controls._launchDir) {
      const d = controls._launchDir;
      controls.anchored = false;
      controls._launchDir = null;
      controls.vel.x = d * 12; controls.vel.y = 0; controls.vel.z = 0;
      boostSound();
      toast("LAUNCH 🚀");
      return;
    }
    const useful = hit && hit.distance < 4 &&
      (hit.object.userData.disc || hit.object.userData.arenaExit ||
       hit.object.userData.kiosk || hit.object.userData.launchHandle);
    if (!useful) { tryPunch(); return; }
  }
  if (!hit) return;
  if (hit.object.userData.cat && hit.distance < 2.2) {
    if (Date.now() - lastPetAt < 1200) return;
    lastPetAt = Date.now();
    const outcome = cat.petOutcome();
    if (outcome === "scratch") gotScratched();
    else presence.sendAct({ kind: "pet" });
    if (outcome === "love") { store.logEvent("pet"); progress.bump("pets"); }
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
    progress.bump("arcade");
    openArcade(hit.object.userData.arcade, {
      send: (p) => presence.sendGame(p),
      myUid: identity.uid,
    });
  } else if (hit.object.userData.arcadeSoon && hit.distance < 3.2) {
    toast(`${hit.object.userData.arcadeSoon} — cabinet's dark. coming soon.`);
  } else if (hit.object.userData.dm && hit.distance < 3) {
    openPC();
  } else if (hit.object.userData.piano && hit.distance < 2.4 && hit.uv) {
    const key = Math.max(0, Math.min(14, Math.floor(hit.uv.x * 15)));
    pianoNote(key, pianoVoice);
    world.pressPianoKey(key);
    presence.sendNote(key, pianoVoice);
    progress.bump("piano");
    if (Date.now() - (window.__pianoLogAt || 0) > 60000) {
      window.__pianoLogAt = Date.now();
      store.logEvent("piano");
    }
  } else if (hit.object.userData.dimmer && hit.distance < 2.6) {
    openDimmer();
  } else if (hit.object.userData.launchHandle && hit.distance < 3) {
    const h = hit.object.userData.launchHandle;
    controls.pos.x = h.x; controls.flyY = h.y; controls.pos.z = h.z;
    controls.vel.x = controls.vel.y = controls.vel.z = 0;
    controls.anchored = true;
    controls._launchDir = h.dir;
    discSound("catch");
    toast(`tube ${h.tube} — hold on. PUNCH now to push off, or wait for GO and ride the current`);
  } else if (hit.object.userData.kiosk && hit.distance < 3) {
    readyUp(hit.object.userData.kiosk);
  } else if (hit.object.userData.edrum !== undefined && hit.distance < 2.6) {
    const pad = hit.object.userData.edrum;
    edrumHit(pad);
    world.pressEdrum(pad);
    presence.sendAct({ kind: "edrum", pad });
  } else if (hit.object.userData.guitar && hit.distance < 2.4) {
    // higher on the neck, higher the note
    const n = Math.max(0, Math.min(10, Math.round((hit.point.y - 0.25) * 12)));
    guitarPluck(n);
    world.strumTele();
    presence.sendAct({ kind: "guitar", n });
  } else if (hit.object.userData.boatExit && hit.distance < 2.6) {
    leaveBoat();
  } else if (hit.object.userData.clubExit && hit.distance < 2.6) {
    leaveClub();
  } else if (hit.object.userData.decks && hit.distance < 2.6) {
    toggleDeck();
  } else if (hit.object.userData.clubWindow && hit.distance < 12) {
    if (canDJ()) {
      const seed = (Math.random() * 1e6) | 0;
      world.clubFireworks(seed);
      presence.sendAct({ kind: "fireworks", seed });
      toast("🎆 fireworks over the skyline");
    } else {
      toast("the city glitters — only the booth can light the sky");
    }
  } else if (hit.object.userData.portalArena && hit.distance < 3) {
    tryArena();
  } else if (hit.object.userData.arenaExit && hit.distance < 4) {
    leaveArena();
  } else if (hit.object.userData.disc && hit.distance < 3.2) {
    if (!disc.holder) grabDisc();
    else if (disc.holder === identity.uid) throwDisc();
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
  } else if (hit.object.userData.lava && hit.distance < 2.4) {
    toast(world.toggleLava() ? "the wax wakes up 🌋" : "lava lamp off");
  } else if (hit.object.userData.blinds && hit.distance < 3.2) {
    const open = world.toggleBlinds();
    presence.sendAct({ kind: "blinds", open });
    toast(open ? "blinds gathered — there's the city" : "blinds drawn across the glass");
  } else if (hit.object.userData.curtain && hit.distance < 3.2) {
    const closed = world.toggleCurtains();
    store.logEvent("curtains");
    presence.sendAct({ kind: "curtains", closed });
    toast(closed ? "curtains drawn — it's just you and the glow now" : "curtains open");
  } else if (hit.object.userData.glass && hit.uv) {
    // the plane hunt: a jet on the glass is fair game
    const shot = world.shootAtGlass(hit.uv.x, hit.uv.y);
    if (shot) {
      shotSound();
      if (shot === "hit") {
        setTimeout(() => { if (!inBoat && !inArena && !inClub) citySound("boom"); }, 300);
        toast("🛩️💥 got it. somewhere over Inglewood, a pilot is very confused");
        presence.sendAct({ kind: "planeshot" });
      }
    }
  } else if (hit.object.userData.smoke && hit.distance < 2.4) {
    const what = hit.object.userData.smoke;
    smokeSound(what);
    world.puffSmoke(what);
    getHigh();
    presence.sendAct({ kind: "smoke", what });
    toast(what === "bong" ? "the water does its job 🫧" : "just a little one");
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
  if (carrying) {
    aimTip.textContent = carrying.place
      ? `${TAP} to set it down here`
      : "find some bare wall…";
    aimTip.classList.add("show");
    return;
  }
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
    aimTip.textContent = `${TAP} — the computer · rooms · messages · music`;
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
  } else if (hit && hit.object.userData.lava && hit.distance < 2.4) {
    aimTip.textContent = `${TAP} — lava lamp`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.blinds && hit.distance < 3.2) {
    aimTip.textContent = `${TAP} — blinds`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.glass && world.planeUp()) {
    aimTip.textContent = `${TAP} — take the shot 🛩️`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.smoke && hit.distance < 2.4) {
    aimTip.textContent = hit.object.userData.smoke === "bong" ? `${TAP} — the bong` : `${TAP} — a little joint`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.portalArena && hit.distance < 3) {
    aimTip.textContent = "ECHO VR — step through";
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.arenaExit && hit.distance < 4) {
    aimTip.textContent = `${TAP} — airlock back to the arcade`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.disc && hit.distance < 3.2) {
    aimTip.textContent = disc.holder === identity.uid ? `${TAP} to THROW` : disc.holder ? "someone has it" : `${TAP} to grab the disc`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.kiosk && hit.distance < 3) {
    aimTip.textContent = `${TAP} — READY UP, start the match`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.launchHandle && hit.distance < 3) {
    aimTip.textContent = `${TAP} — grab the catapult handles`;
    aimTip.classList.add("show");
  } else if (inArena && controls.anchored && controls._launchDir) {
    aimTip.textContent = "PUNCH the open space to LAUNCH";
    aimTip.classList.add("show");
  } else if (inArena && controls.anchored) {
    aimTip.textContent = "E — FLING yourself";
    aimTip.classList.add("show");
  } else if (inArena && controls.nearGrabSurface()) {
    aimTip.textContent = "E — grab the wall";
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
  } else if (hit && hit.object.userData.edrum !== undefined && hit.distance < 2.6) {
    aimTip.textContent = `${TAP} the pads — e-kit`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.guitar && hit.distance < 2.4) {
    aimTip.textContent = `${TAP} — the tele (A minor pentatonic lives here)`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.boatExit && hit.distance < 2.6) {
    aimTip.textContent = `${TAP} to go back to the room`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.clubExit && hit.distance < 2.6) {
    aimTip.textContent = `${TAP} — out into the night, back home`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.decks && hit.distance < 2.6) {
    aimTip.textContent = adminMode ? `${TAP} — booth controls`
      : voice.djLive() ? `${TAP} — end the set`
      : canDJ() ? `${TAP} — pick a source, go live`
      : deckLockedMsg();
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.clubWindow && hit.distance < 12) {
    aimTip.textContent = canDJ() ? `${TAP} — fireworks over the city`
      : adminMode ? `press G to change the venue theme (now: ${world.clubThemeName()})`
      : `the lights of ${world.clubThemeName()}, past the glass`;
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

  // every post is signed with the name you walked in under
  const author = (identity.name || "").trim().slice(0, 24);
  const base = {
    kind, author: author || null, color: null, text: null, url: null,
    uid: identity.uid,                 // so you can re-hang your own later
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

  // resolve a spot BEFORE we touch the db. otherwise a packed wall still
  // inserts the row (firing the discord webhook) and only then fails to place
  // it — leaving an invisible orphan note and a "packed" toast at the same
  // time. check first; if there's truly no room, bail without writing anything.
  if (!notesWall.canPlace(base.wall, kind, base.x, base.y)) {
    closeComposer();
    return toast("that wall's packed — find some bare wall");
  }

  const btn = $("#post-btn");
  btn.disabled = true;
  try {
    const saved = await store.add(base, blob);
    const placed = notesWall.add(saved);
    refreshNoteVisibility();
    store.logEvent(saved.kind);
    lastPostAt = Date.now();
    // we pre-checked, but a realtime post from someone else could have taken
    // the last patch during the await — skip cleanly if so (rare).
    if (!placed) {
      closeComposer();
      return toast("that wall's packed — find some bare wall");
    }
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
  // you can re-hang anything you posted (going forward — old notes have no uid)
  $("#reader-move").classList.toggle("hidden", !(note.uid && note.uid === identity.uid));
  show(reader);
}
function closeReader() {
  hide(reader);
  modalOpen = false;
  currentNote = null;
  if (entered) safeLock();
}
$("#reader-close").addEventListener("click", closeReader);

$("#reader-move").addEventListener("click", () => {
  if (!currentNote) return;
  const note = currentNote;
  closeReader();                 // closes + relocks the pointer
  pickUpNote(note);
});

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
  while (chatLog.children.length > 12) chatLog.removeChild(chatLog.firstChild);
  setTimeout(() => div.classList.add("old"), 20000);
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
// nothing typed? clicking anywhere outside the bar walks away from it
document.addEventListener("pointerdown", (e) => {
  if (chatOpen && !chatInput.value.trim() && !chatBar.contains(e.target)) closeChat();
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
  modalOpen = true;                      // keep the pause screen away
  const pass = prompt("this door is private. password:");
  if (!pass) { modalOpen = false; if (entered) safeLock(); return; }
  if (await sha256(pass.trim().toLowerCase()) !== BOAT_PASS_HASH) {
    modalOpen = false;
    if (entered) safeLock();
    return toast("the door doesn't budge.");
  }
  fadeTo(() => {
    inBoat = true;
    controls.pos.x = world.boatSpawn.x;
    controls.pos.z = world.boatSpawn.z;
    controls.yaw = world.boatSpawn.yaw;
    setWater(true);
    store.logEvent("boat");
    progress.bump("trips");
    setRoomTone(false);                  // the bedroom stays behind, fully
    refreshNoteVisibility();
    toast("welcome aboard THE DESI 🌊");
    modalOpen = false;
    hide(paused);
    if (entered) safeLock();
  });
}
// each room shows only its own notes
function refreshNoteVisibility() {
  for (const mesh of world.noteGroup.children) {
    const onBoat = String(mesh.userData.note?.wall || "").startsWith("boat");
    mesh.visible = inArena || inClub ? false : inBoat ? onBoat : !onBoat;
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

/* ---------------- THE VENUE: the dj bar, name pending ---------------- */
// dev placeholder ("soundcheck") — swap for the real hash before the event
const CLUB_PASS_HASH = "7aaaa3946f3f4de633bda31fc85970434577eb3b0d4540b00879727861012586";
let inClub = false;
async function tryClub() {
  modalOpen = true;                      // keep the pause screen away
  const pass = prompt("an unmarked door. bass through the brick. password:");
  if (!pass) { modalOpen = false; if (entered) safeLock(); return; }
  if (await sha256(pass.trim().toLowerCase()) !== CLUB_PASS_HASH) {
    modalOpen = false;
    if (entered) safeLock();
    return toast("the bouncer shakes his head.");
  }
  fadeTo(() => {
    inClub = true;
    controls.pos.x = world.clubSpawn.x;
    controls.pos.z = world.clubSpawn.z;
    controls.yaw = world.clubSpawn.yaw;
    setRoomTone(false);                  // the bedroom stays behind, fully
    setClubTone(true);                   // the empty-room sub, until a set starts
    voice.setInClub(true);               // now the set can reach your ears
    // the venue is sealed: the mic goes quiet (chat only), the cat HUD and any
    // flight strip that crept up at home are gone — only the set + chat get in
    voice.stopTalk(); updateMicUI();
    hideFlightStrip();
    document.body.classList.add("in-club");
    djHeardAt = 0;
    wasGranted = djGrantedToMe();         // so a later grant toasts, but a standing one doesn't
    world.setOnAir(false);               // dark until a chunk says otherwise
    store.logEvent("boat");              // counts as a portal trip
    progress.bump("trips");
    refreshNoteVisibility();
    toast("you're in 🪩 — the decks are dark until showtime");
    modalOpen = false;
    hide(paused);
    if (entered) safeLock();
  });
}
function leaveClub() {
  if (voice.djLive()) voice.stopDJ();    // you can't broadcast from the street
  voice.setInClub(false);
  world.setOnAir(false);
  setClubTone(false);                    // the street is quiet
  document.body.classList.remove("in-club");   // the mic + cat HUD come back home
  fadeTo(() => {
    inClub = false;
    // the walk home ends at your own front door
    controls.pos.x = world.spawn.x;
    controls.pos.z = world.spawn.z;
    controls.yaw = world.spawn.yaw;
    setRoomTone(true);
    refreshNoteVisibility();
  });
}

/* ---------------- the booth: power, grant, go live ---------------- */
// djState = { on, act:{uid,name}|null } — the host powers the decks and hands
// them to one present user. it lives in room_state so it survives reload.
let djState = null;
let wasGranted = false;
let lastPeers = new Map();                 // uid -> {name,color,...}, cached for the booth list
const peerX = new Map();                   // uid -> last x, for a room-scoped headcount
function clubHeadcount() {
  let n = inClub ? 1 : 0;
  for (const x of peerX.values()) if (x < -30) n++;   // club lives past x = -30
  return n;
}
function djGrantedToMe() { return !!(djState && djState.on && djState.act && djState.act.uid === identity.uid); }
// a granted peer (or the host) may spin, but only at a powered booth
function canDJ() { return inClub && !!(djState && djState.on) && (adminMode || djGrantedToMe()); }
function deckLockedMsg() {
  if (!djState || !djState.on) return "the decks are locked — nothing's booked tonight";
  if (djState.act) return `tonight's set belongs to ${djState.act.name || "the booked dj"}`;
  return "the booth's powered, but no one's been handed the decks yet";
}

function toggleDeck() {
  if (!inClub) return;
  if (adminMode) return openBooth();             // the host always gets the controls
  if (voice.djLive()) return endSet();
  if (canDJ()) return openDJPicker();
  toast(deckLockedMsg());
}
function endSet() {
  voice.stopDJ();
  world.setOnAir(false);
  toast("set over — the decks go dark");
  if ($("#booth").classList.contains("show")) renderBooth();
}

// the grant changed under us (someone got the booth, power was cut, etc.)
function onDJChanged() {
  if (voice.djLive() && !canDJ()) endSet();      // revoked / powered off mid-set → kicked
  if (inClub) {
    const g = djGrantedToMe();
    if (g && !wasGranted && !adminMode) toast("the booth is yours — click the decks to go live 🎧");
    wasGranted = g;
  }
  if ($("#booth").classList.contains("show")) renderBooth();
}

/* ---- host panel: power the decks, hand them to someone present ---- */
function adminPass() {
  let p = sessionStorage.getItem("metro.adminpass");
  if (!p) { p = prompt("admin passphrase:"); if (p) sessionStorage.setItem("metro.adminpass", p); }
  return p;
}
async function writeDJ(dj) {
  const needPass = store.mode === "supabase";
  const pass = needPass ? adminPass() : "local";
  if (needPass && !pass) return;
  try {
    await store.saveDJ(dj, pass);
    djState = dj;                                 // optimistic; realtime confirms
    onDJChanged();
    renderBooth();
  } catch (e) {
    if (String(e.message).includes("passphrase")) sessionStorage.removeItem("metro.adminpass");
    toast(String(e.message).includes("passphrase") ? "wrong passphrase" : "couldn't reach the booth");
  }
}
function powerToggle() {
  const on = !(djState && djState.on);
  writeDJ({ on, act: on ? (djState?.act || null) : null });   // cutting power clears the act
}
function grantBooth(uid, name) { writeDJ({ on: true, act: { uid, name: name || "" } }); }
function revokeBooth() { writeDJ({ on: true, act: null }); }

function openBooth() {
  modalOpen = true;
  controls.unlock();
  renderBooth();
  show($("#booth"));
}
function renderBooth() {
  const on = !!(djState && djState.on);
  const act = djState && djState.act;
  $("#booth-power").textContent = on ? "◉ decks powered — tap to cut the power" : "○ decks dark — tap to power up";
  const self = $("#booth-self");
  self.classList.toggle("hidden", !on);
  self.textContent = voice.djLive() ? "■ end your set" : "🎧 spin it yourself";
  $("#booth-now").textContent = act ? (act.name || "dj") : on ? "open — no one yet" : "powered down";
  const wrap = $("#booth-peers");
  wrap.innerHTML = "";
  if (!on) {
    wrap.innerHTML = "<p class='fine-print'>power the decks to hand them out</p>";
  } else {
    if (act) {
      const r = document.createElement("button");
      r.className = "pc-item";
      r.textContent = `↩ take the booth back from ${act.name || "them"}`;
      r.addEventListener("click", revokeBooth);
      wrap.appendChild(r);
    }
    const others = [...lastPeers.entries()].filter(([uid]) => !act || act.uid !== uid);
    if (!others.length && !act) {
      wrap.innerHTML += "<p class='fine-print'>no one else is here to hand it to</p>";
    }
    for (const [uid, p] of others) {
      const b = document.createElement("button");
      b.className = "pc-item";
      b.textContent = `🎚️ hand the booth to ${p.name || "someone"}`;
      b.addEventListener("click", () => grantBooth(uid, p.name));
      wrap.appendChild(b);
    }
  }
  $("#booth-count").textContent = `${clubHeadcount()} in the room`;
}
$("#booth-power").addEventListener("click", powerToggle);
$("#booth-self").addEventListener("click", () => {
  if (voice.djLive()) { endSet(); return; }
  hide($("#booth"));
  openDJPicker();
});
$("#booth-close").addEventListener("click", () => {
  hide($("#booth"));
  modalOpen = false;
  if (entered) safeLock();
});

async function openDJPicker() {
  modalOpen = true;
  controls.unlock();
  const list = $("#dj-list");
  list.innerHTML = "";
  show($("#dj"));
  // the easy path first: share a tab / system audio, no driver to install
  if (voice.canShare()) {
    const share = document.createElement("button");
    share.className = "pc-item";
    share.textContent = "🔊 share a tab / system audio";
    share.addEventListener("click", goLiveShare);
    list.appendChild(share);
    const hint = document.createElement("p");
    hint.className = "fine-print";
    hint.textContent = "pick a tab and tick “share tab audio”, or share your screen with system audio";
    list.appendChild(hint);
    const sep = document.createElement("div");
    sep.className = "pc-sec";
    sep.textContent = "…or pick a raw input";
    list.appendChild(sep);
  }
  // the fallback: a real input device (an interface, or a loopback driver)
  const finding = document.createElement("p");
  finding.className = "fine-print";
  finding.textContent = "finding inputs…";
  list.appendChild(finding);
  const inputs = await voice.listInputs();
  finding.remove();
  if (!inputs.length) {
    const none = document.createElement("p");
    none.className = "fine-print";
    none.textContent = "no audio inputs found — grant mic access?";
    list.appendChild(none);
    return;
  }
  for (const d of inputs) {
    const b = document.createElement("button");
    b.className = "pc-item";
    b.textContent = `🎛️ ${d.label}`;
    b.addEventListener("click", () => goLive(d.deviceId));
    list.appendChild(b);
  }
}
async function goLive(deviceId) {
  const ok = await voice.startDJ(deviceId);
  hide($("#dj"));
  modalOpen = false;
  if (!ok) { if (entered) safeLock(); return toast("that input said no — try another"); }
  world.setOnAir(true);
  toast("you're on — THE VENUE is live 🔴");
  if (entered) safeLock();
}
async function goLiveShare() {
  const ok = await voice.startDJShare();
  if (ok === "no-audio") return toast("no audio came through — tick “share tab audio” in the picker");
  hide($("#dj"));
  modalOpen = false;
  if (!ok) { if (entered) safeLock(); return toast("sharing was cancelled"); }
  world.setOnAir(true);
  toast("you're on — THE VENUE is live 🔴");
  if (entered) safeLock();
}
$("#dj-close").addEventListener("click", () => {
  hide($("#dj"));
  modalOpen = false;
  if (entered) safeLock();
});

/* ---------------- THE CREW: the zero-g arena ---------------- */
let inArena = false;
const A = world.arenaInfo;
const disc = {
  holder: null,
  pos: new THREE.Vector3(A.x, A.y, A.z),
  vel: new THREE.Vector3(),
  lastGoal: 0,
};
const arenaScore = { o: 0, b: 0 };
let myTeam = "o";
try { myTeam = localStorage.getItem("metro.team") || (Math.random() < 0.5 ? "o" : "b"); } catch (e) {}
async function tryArena() {
  // no password — but you do have to pick a locker room
  modalOpen = true;
  controls.unlock();
  show($("#team"));
}
$("#team-o").addEventListener("click", () => enterArena("o"));
$("#team-b").addEventListener("click", () => enterArena("b"));
$("#team-close").addEventListener("click", () => {
  hide($("#team"));
  modalOpen = false;
  if (entered) safeLock();
});
function enterArena(team) {
  hide($("#team"));
  modalOpen = false;
  myTeam = team;
  try { localStorage.setItem("metro.team", team); } catch (e) {}
  fadeTo(() => {
    inArena = true;
    controls.zerog = true;
    controls.arena = A;
    controls.clampFn = world.arenaClamp;
    controls.nearWallFn = world.arenaNearWall;
    controls.onGrabGhost = grabNearestGhost;
    controls.vel = { x: 0, y: 0, z: 0 };
    const sp = world.arenaSpawnFor(team);
    controls.pos.x = sp.x;
    controls.pos.z = sp.z;
    controls.flyY = sp.y;
    controls.yaw = sp.yaw;
    controls.pitch = 0;
    setRoomTone(false);
    refreshNoteVisibility();
    store.logEvent("boat");   // counts as a portal trip
    progress.bump("trips");
    voice.setArenaFx(true);    // voices arrive over the arena intercom
    startArenaMusic();
    toast(`your ${team === "o" ? "ORANGE" : "BLUE"} locker room · fly the tubes to MID · E grab/fling · click PUNCH · F shield · ready up at the kiosk`);
    hide(paused);
    if (entered) safeLock();
  });
}
function leaveArena() {
  stopArenaMusic();
  // don't walk off with the disc
  if (disc.holder === identity.uid) {
    disc.holder = null;
    disc.pos.set(A.x, A.y, A.z);
    disc.vel.set(0, 0, 0);
    presence.sendAct({ kind: "disc", sub: "throw", p: [A.x, A.y, A.z], v: [0, 0, 0] });
  }
  fadeTo(() => {
    inArena = false;
    controls.zerog = false;
    controls.anchored = false;
    controls.stunT = 0;
    controls.blocking = false;
    controls.clampFn = null;
    controls.nearWallFn = null;
    controls.onGrabGhost = null;
    controls.ghostHold = null;
    controls._launchDir = null;
    voice.setArenaFx(false);
    setThruster(false);
    controls.pos.x = world.arcadeReturn.x;
    controls.pos.z = world.arcadeReturn.z;
    controls.yaw = world.arcadeReturn.yaw;
    controls.pitch = 0;
    setRoomTone(true);
    refreshNoteVisibility();
  });
}
controls.onBoost = () => { if (inArena) boostSound(); };
controls.onGrab = () => { if (inArena) discSound("catch"); };
controls.onFling = () => { if (inArena) punchSound(false); };

/* ---------------- arena combat: punch, block, stun ---------------- */
// the shield — a faint hex of light in front of your face while F is held
world.scene.add(camera);
const shieldMesh = new THREE.Mesh(
  new THREE.CircleGeometry(0.34, 6),
  new THREE.MeshBasicMaterial({
    color: 0x66e0ff, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
shieldMesh.position.set(0, -0.04, -0.6);
shieldMesh.visible = false;
camera.add(shieldMesh);

let lastPunchAt = 0;
function tryPunch() {
  if (Date.now() - lastPunchAt < 700 || controls.stunT > 0) return true;  // still our click
  lastPunchAt = Date.now();
  // a lunge with the swing — punching is movement out here, and a
  // real arm push inside a launch tube
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const push = world.inTube(controls.pos.x, controls.flyY, controls.pos.z) ? 5 : 1.2;
  controls.vel.x += dir.x * push; controls.vel.y += dir.y * push; controls.vel.z += dir.z * push;
  // whoever's in reach and roughly in front of the fist gets it
  let hitUid = null;
  for (const [uid, g] of ghosts.byUid) {
    const c = g.grp.position;
    const to = new THREE.Vector3(c.x - camera.position.x, c.y + 1.1 - camera.position.y, c.z - camera.position.z);
    const d = to.length();
    if (d < 1.8 && to.normalize().dot(dir) > 0.72) { hitUid = uid; break; }
  }
  punchSound(!!hitUid);
  if (hitUid) presence.sendAct({ kind: "punch", target: hitUid, from: identity.uid });
  return true;
}
function getStunned() {
  controls.stunT = 2.5;
  controls.anchored = false;
  stunBuzz();
  gotScratched();                              // the flash + shake earn their keep
  toast("⚡ stunned — your thrusters are rebooting");
  if (disc.holder === identity.uid) {          // the disc tumbles loose
    disc.holder = null;
    disc.pos.copy(camera.position);
    disc.pos.y -= 0.4;
    disc.vel.set(controls.vel.x * 0.5 + (Math.random() - 0.5), controls.vel.y * 0.5 - 0.5, controls.vel.z * 0.5 + (Math.random() - 0.5));
    disc.thrownFrom = null;
    presence.sendAct({ kind: "disc", sub: "throw", p: [disc.pos.x, disc.pos.y, disc.pos.z], v: [disc.vel.x, disc.vel.y, disc.vel.z] });
  }
}

function discTick(dt) {
  const g = world.discGroup;
  if (disc.holder) {
    if (disc.holder === identity.uid) {
      // riding my hand: just in front and below my gaze
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      disc.pos.copy(camera.position).addScaledVector(dir, 1.05);
      disc.pos.y -= 0.3;
    } else {
      const ghostPos = ghosts.byUid.get(disc.holder)?.grp.position;
      if (ghostPos) disc.pos.set(ghostPos.x, ghostPos.y + 1.1, ghostPos.z);
    }
  } else {
    disc.pos.addScaledVector(disc.vel, dt);
    disc.vel.multiplyScalar(Math.pow(0.995, dt * 60));
    // same union of volumes the players fly — banks off islands too
    world.arenaClamp(disc.pos, disc.vel, 0.3, true);   // true: tubes are off-limits to the disc
    // goals: through either ring inside the domes. release point
    // outside the 3-point bubble pays 3, inside pays 2
    const ringR = Math.hypot(disc.pos.y - A.y, disc.pos.z - A.z);
    const dlx = disc.pos.x - A.x;
    if (Date.now() - disc.lastGoal > 3000 && ringR < 1.55 &&
        Math.abs(Math.abs(dlx) - world.arenaGoalX) < 0.8) {
      const gx = A.x + Math.sign(dlx) * world.arenaGoalX;
      const pts = disc.thrownFrom
        ? (Math.hypot(disc.thrownFrom[0] - gx, disc.thrownFrom[1] - A.y, disc.thrownFrom[2] - A.z) >= world.arenaBubbleR ? 3 : 2)
        : 2;
      scoreGoal(dlx < 0 ? "b" : "o", true, pts);
    }
  }
  g.position.copy(disc.pos);
  g.rotation.y += dt * 4;
  world.discHit.position.copy(disc.pos);
}
function scoreGoal(team, announce, pts = 2) {
  disc.lastGoal = Date.now();
  arenaScore[team] += pts;
  world.setArenaScore(arenaScore.o, arenaScore.b);
  if (inArena) { goalHorn(); toast(pts === 3 ? "💥 THREE from downtown" : "GOAL — 2 points"); }
  disc.holder = null;
  disc.thrownFrom = null;
  disc.pos.set(A.x, A.y, A.z);
  disc.vel.set(0, 0, 0);
  if (announce) presence.sendAct({ kind: "goal", team, pts, o: arenaScore.o, b: arenaScore.b });
}
/* ---- the match: BOTH teams ready up, ten seconds, barriers drop ---- */
const match = { phase: "free", timers: [], ready: { o: 0, b: 0 }, liveAt: 0 };
function applyReady(team, t) {
  if (match.phase === "count") return;
  match.ready[team] = t || Date.now();
  // alone in here? your word is enough. otherwise it takes both lockers.
  if (presence.count() <= 1) return applyMatchStart(Date.now() + 10000);
  if (match.ready.o && match.ready.b) return applyMatchStart(Math.max(match.ready.o, match.ready.b) + 10000);
  if (inArena) toast(team === "o" ? "ORANGE is ready — waiting on BLUE" : "BLUE is ready — waiting on ORANGE");
}
function applyMatchStart(at) {
  if (match.phase === "count") return;
  match.phase = "count";
  match.ready.o = match.ready.b = 0;
  match.timers.forEach(clearTimeout);
  match.timers = [];
  world.setTubeBarriers(true);
  const left = Math.max(400, at - Date.now());
  toast(`both teams ready — grab the handholds behind the launch ring (${Math.round(left / 1000)}s)`);
  for (const c of [3, 2, 1]) {
    if (left - c * 1000 > 0) match.timers.push(setTimeout(() => { if (inArena) toast(String(c)); }, left - c * 1000));
  }
  match.timers.push(setTimeout(() => {
    match.phase = "live";
    match.liveAt = Date.now();
    world.setTubeBarriers(false);
    arenaScore.o = 0; arenaScore.b = 0;
    world.setArenaScore(0, 0);
    disc.holder = null;
    disc.thrownFrom = null;
    disc.pos.set(A.x, A.y, A.z);
    disc.vel.set(0, 0, 0);
    // the catapult takes whoever's holding on — the current does the rest
    if (inArena && controls.anchored && controls._launchDir) {
      controls.anchored = false;
      controls.vel.x = controls._launchDir * 10;
      controls.vel.y = 0; controls.vel.z = 0;
      controls._launchDir = null;
      boostSound();
    }
    if (inArena) { goalHorn(); toast("GO — barriers down, ride the current. disc is live at MID"); }
  }, left));
}
function readyUp(team) {
  if (match.phase === "count") return toast("countdown's already running");
  if (match.ready[team]) return toast(team === "o" ? "ORANGE is already ready" : "BLUE is already ready");
  const t = Date.now();
  presence.sendAct({ kind: "ready", team, t });
  applyReady(team, t);
}
function grabNearestGhost() {
  if (!inArena) return null;
  let best = null, bestD = 2.1;
  for (const g of ghosts.byUid.values()) {
    const c = g.grp.position;
    const d = Math.hypot(c.x - controls.pos.x, c.y + 1.1 - controls.flyY, c.z - controls.pos.z);
    if (d < bestD) { bestD = d; best = g; }
  }
  if (!best) return null;
  const rec = best;
  return {
    pos: () => ({ x: rec.grp.position.x, y: rec.grp.position.y + 1.1, z: rec.grp.position.z }),
    vel: () => rec.vel || { x: 0, y: 0, z: 0 },
  };
}

function grabDisc() {
  disc.holder = identity.uid;
  if (inArena) discSound("catch");
  presence.sendAct({ kind: "disc", sub: "hold", holder: identity.uid });
}
function throwDisc() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  disc.holder = null;
  disc.pos.copy(camera.position).addScaledVector(dir, 1.3);
  disc.vel.copy(dir).multiplyScalar(13)
    .add(new THREE.Vector3(controls.vel.x, controls.vel.y, controls.vel.z));
  disc.thrownFrom = [disc.pos.x, disc.pos.y, disc.pos.z];   // the release point decides the points
  if (inArena) discSound("throw");
  presence.sendAct({
    kind: "disc", sub: "throw",
    p: [disc.pos.x, disc.pos.y, disc.pos.z],
    v: [disc.vel.x, disc.vel.y, disc.vel.z],
    t: disc.thrownFrom,
  });
}

/* ---------------- arena lobby music (Echo VR lobby theme) ---------------- */
const ARENA_TRACK = "XAd1fq-cPzA";
let ytPlayer = null, ytLoading = false;
function startArenaMusic() {
  if (ytPlayer) { try { ytPlayer.playVideo(); } catch (e) {} return; }
  if (ytLoading) return;
  ytLoading = true;
  const boot = () => {
    ytPlayer = new YT.Player("arena-music", {
      width: 2, height: 2, videoId: ARENA_TRACK,
      playerVars: { autoplay: 1, loop: 1, playlist: ARENA_TRACK, controls: 0, disablekb: 1 },
      events: {
        onReady: (e) => { e.target.setVolume(9); e.target.playVideo(); },   // faintly
      },
    });
  };
  if (window.YT && window.YT.Player) boot();
  else {
    window.onYouTubeIframeAPIReady = boot;
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  }
}
function stopArenaMusic() {
  try { ytPlayer?.pauseVideo(); } catch (e) {}
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

/* ---------------- ten soft seconds ---------------- */
let highTimer = null;
function getHigh() {
  const el = $("#high");
  el.classList.add("on");
  clearTimeout(highTimer);
  highTimer = setTimeout(() => el.classList.remove("on"), 10000);
}

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
// pull any strip off the screen at once — the venue has no window on LAX
function hideFlightStrip() {
  clearTimeout(stripTimer);
  $("#flight-strip").classList.remove("show");
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

/* ---------------- the computer: rooms · messages · music ---------------- */
const pcOverlay = $("#pc");
// "turn the music to 4%" — song notes peak around 4% full scale,
// background piano, not a concert
const MUSIC_VEL = 0.57;
function refreshSongUI() {
  const playing = currentSongId();
  for (const b of $("#pc-songs").children) {
    const on = b.dataset.song === playing;
    b.classList.toggle("playing", on);
    b.querySelector(".pc-hint").textContent = on ? "■ stop" : "▶ play";
  }
  const s = SONGS.find(x => x.id === playing);
  $("#pc-now").textContent = s ? `now playing — ${s.title}` : "";
}
function toggleSong(id) {
  if (currentSongId() === id) { stopSong(); return; }   // stop calls ended → UI refresh
  playSong(id, {
    now: audioNow,
    // the song keeps rolling while you're in another room — you just
    // don't hear the bedroom piano from there
    // songs are chromatic — key is a raw semitone, not a white-key index
    note: (key, vel, when) => { if (!inBoat && !inArena && !inClub) pianoNote(key, pianoVoice, vel * MUSIC_VEL, when, true); },
    visual: (key, delay) => setTimeout(() => { if (!inBoat && !inArena && !inClub) world.pressPianoKey(semitoneToKey(key)); }, delay),
    ended: refreshSongUI,
  });
  store.logEvent("piano");
  refreshSongUI();
}
for (const s of SONGS) {
  const b = document.createElement("button");
  b.className = "pc-item";
  b.dataset.song = s.id;
  b.textContent = `🎹 ${s.title}`;
  const hint = document.createElement("span");
  hint.className = "pc-hint";
  hint.textContent = "▶ play";
  b.appendChild(hint);
  b.addEventListener("click", () => toggleSong(s.id));
  $("#pc-songs").appendChild(b);
}
function openPC() {
  modalOpen = true;
  controls.unlock();
  $("#pc-inbox").classList.toggle("hidden", !adminMode);
  refreshSongUI();
  show(pcOverlay);
}
function closePC() {
  hide(pcOverlay);
  modalOpen = false;
  if (entered) safeLock();
}
$("#pc-close").addEventListener("click", closePC);
$("#pc-desi").addEventListener("click", () => { hide(pcOverlay); tryBoat(); });
$("#pc-club").addEventListener("click", () => { hide(pcOverlay); tryClub(); });
$("#pc-echo").addEventListener("click", () => { hide(pcOverlay); modalOpen = false; tryArena(); });
$("#pc-dm").addEventListener("click", () => { hide(pcOverlay); openDM(); });
$("#pc-inbox").addEventListener("click", () => { hide(pcOverlay); openDM(); });
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
    if (pcOverlay.classList.contains("show")) closePC();
    if ($("#team").classList.contains("show")) {
      hide($("#team"));
      modalOpen = false;
      if (entered) safeLock();
    }
    if ($("#dj").classList.contains("show")) {
      hide($("#dj"));
      modalOpen = false;
      if (entered) safeLock();
    }
    if ($("#booth").classList.contains("show")) {
      hide($("#booth"));
      modalOpen = false;
      if (entered) safeLock();
    }
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
  // another tab re-hung a note (local mode) — mirror its new spot
  store.onMoved((m) => { notesWall.moveTo(m.id, m); refreshNoteVisibility(); });

  presence.join(identity, () => controls.pose());
  presence.onPeers((peers) => {
    ghosts.syncPeers(peers);
    $("#online-count").textContent = String(peers.size + 1);
    lastPeers = peers;
    for (const uid of [...peerX.keys()]) if (!peers.has(uid)) peerX.delete(uid);
    if ($("#booth").classList.contains("show")) renderBooth();
  });
  presence.onPose((uid, pose) => { ghosts.setPose(uid, pose); peerX.set(uid, pose.x); });
  presence.onNote((uid, i, v) => {
    if (inBoat || inArena) return;   // the bedroom piano stays in the bedroom
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
    } else if (p.kind === "blinds") {
      world.setBlinds(p.open);
      toast(p.open ? "someone gathered the blinds" : "someone drew the blinds");
    } else if (p.kind === "pet") {
      if (!inBoat) cat.remoteHearts();
    } else if (p.kind === "dimmer") {
      dimLevel = p.level;
      world.setRoomLight(p.level, p.color);
      $("#dim-level").value = Math.round(p.level * 100);
    } else if (p.kind === "disc") {
      if (p.sub === "hold") { disc.holder = p.holder; if (inArena) discSound("catch"); }
      else if (p.sub === "throw") {
        disc.holder = null;
        disc.pos.set(p.p[0], p.p[1], p.p[2]);
        disc.vel.set(p.v[0], p.v[1], p.v[2]);
        disc.thrownFrom = p.t || null;
        if (inArena) discSound("throw");
      }
    } else if (p.kind === "goal") {
      disc.lastGoal = Date.now();
      arenaScore.o = p.o; arenaScore.b = p.b;
      world.setArenaScore(p.o, p.b);
      disc.holder = null;
      disc.thrownFrom = null;
      disc.pos.set(A.x, A.y, A.z);
      disc.vel.set(0, 0, 0);
      if (inArena) { goalHorn(); toast(p.pts === 3 ? "💥 THREE from downtown" : "GOAL — 2 points"); }
    } else if (p.kind === "volca") {
      if (!inBoat) return;       // and the boat's sampler stays on the boat
      drumHit(p.pad);
      world.pressVolcaPad(p.pad);
    } else if (p.kind === "punch") {
      if (p.target === identity.uid && inArena) {
        if (controls.blocking) {
          // shield up: the swing rings off it and the attacker eats the stun
          shieldClang();
          ghosts.flash(p.from, 0x66e0ff);
          presence.sendAct({ kind: "deflect", target: p.from });
        } else {
          getStunned();
          ghosts.flash(p.from, 0xffffff);
        }
      } else if (inArena) {
        // spectator: see the hit land
        ghosts.flash(p.target, 0xff4040);
        punchSound(true);
      }
    } else if (p.kind === "smoke") {
      // a remote puff: the corner bubbles and smokes, but only the
      // one who pulled gets the soft ten seconds
      if (!inBoat && !inArena && !inClub) {
        world.puffSmoke(p.what);
        smokeSound(p.what);
      }
    } else if (p.kind === "planeshot") {
      // someone else took the shot — if our jet is still up, down it
      if (world.downPlane() && !inBoat && !inArena && !inClub) {
        citySound("boom");
        toast("someone shot the plane out of the sky 🛩️💥");
      }
    } else if (p.kind === "edrum") {
      if (!inBoat && !inArena && !inClub) { edrumHit(p.pad); world.pressEdrum(p.pad); }
    } else if (p.kind === "guitar") {
      if (!inBoat && !inArena && !inClub) { guitarPluck(p.n); world.strumTele(); }
    } else if (p.kind === "ready") {
      applyReady(p.team, p.t);
    } else if (p.kind === "match") {
      applyMatchStart(p.at);
    } else if (p.kind === "deflect") {
      if (p.target === identity.uid && inArena) {
        shieldClang();
        getStunned();
        toast("🛡 deflected — that one bounced back");
      } else if (inArena) {
        ghosts.flash(p.target, 0x66e0ff);
      }
    } else if (p.kind === "notemove") {
      // someone re-hung their note — slide it to its new home for us too
      notesWall.moveTo(p.id, { wall: p.wall, x: p.x, y: p.y, rot: p.rot });
      refreshNoteVisibility();
    } else if (p.kind === "fireworks") {
      // the dj painted the sky — everyone in the venue sees the same show
      if (inClub) world.clubFireworks(p.seed);
    }
  });
  presence.onChat((p) => pushChat(p.name || "someone", p.color, p.text));

  // arcade leaderboard: load it, keep it live, report new scores
  const refreshScores = () =>
    store.listScores("defender", 8).then(rows => world.updateScores(rows)).catch(() => {});
  refreshScores();
  store.onNewScore(refreshScores);
  setScoreHook((game, score) => {
    store.submitScore(game, (identity.name || "anon").slice(0, 24), score, identity.uid)
      .then(refreshScores)
      .catch(() => {});
  });

  weather.start();
  // real LAX traffic drives the window flyovers when the API is up —
  // each one gets a flight strip: who it is, what it is, where it's going
  startPlanes((info) => {
    world.triggerPlane(info && info.dir);
    if (info && !inBoat && !inArena && !inClub) showFlightStrip(info);
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

  // the booth remembers who it was handed to
  store.getDJ().then(dj => { djState = dj; wasGranted = djGrantedToMe(); }).catch(() => {});
  store.onDJ(dj => { djState = dj; onDJChanged(); });
  // keep the booth's headcount plate honest while anyone's in the club
  setInterval(() => { if (entered && inClub) world.setBoothHeadcount(clubHeadcount()); }, 1500);

  store.logEvent("visit");

  // cat needs: load shared state, stay subscribed to everyone's care
  try { applyCatState(await store.getCatState()); }
  catch (e) { applyCatState({ food: 1, water: 1, litter: 0, pets: 0, updated_at: new Date().toISOString() }); }
  store.onCatState((s) => applyCatState(s));
})();

/* ---------------- frame loop ---------------- */
window.METRO_DEBUG = { renderer, camera, world, controls, THREE, cat, notesWall,
  uid: identity.uid,
  carry: { pick: pickUpNote, drop: dropCarried, state: () => carrying },
  booth: { dj: () => djState, canDJ: () => canDJ(), headcount: () => clubHeadcount(), live: () => voice.djLive() } };

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
  // the club lights dance to the set; everywhere else energy stays at zero
  world.setClubEnergy(inClub ? voice.djLevel() : 0);
  world.tick(dt, controls.pos);
  if (carrying) updateCarry();
  ghosts.tick(dt, t);
  cat.tick(dt, t, controls.pose());
  discTick(dt);
  // the tunnel current: for 8 s after GO the tubes carry you at 10 m/s.
  // it only ever speeds you up — an early push keeps its extra speed,
  // and the regrab slingshot stays possible. hug the wall and you smear.
  if (inArena && match.liveAt && Date.now() - match.liveAt < 8000 && !controls.anchored) {
    const tb = world.inTube(controls.pos.x, controls.flyY, controls.pos.z);
    if (tb) {
      if (controls.vel.x * tb.dir < 10) controls.vel.x += (tb.dir * 10 - controls.vel.x) * Math.min(1, dt * 5);
      if (tb.off > 0.78) {
        const k = Math.pow(0.18, dt);
        controls.vel.x *= k; controls.vel.y *= k; controls.vel.z *= k;
      }
    }
  }
  shieldMesh.visible = inArena && !!controls.blocking;
  if (inArena) setThruster(controls.thrusting);
  renderer.render(world.scene, camera);
});
