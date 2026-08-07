/* ============================================================
   THE STUDIO — boot and glue

   Order of operations matters here. Audio can't exist before a real
   click (browsers won't allow it), and the transport can't exist before
   the clock has been checked, and we mustn't invent a transport at all
   if there's already a room playing. So: click, then sync, then ask the
   room what's going on, and only start something new if nobody answers.
   ============================================================ */

import * as THREE from "three";
import { store } from "../store.js";
import { getIdentity } from "../util.js";
import { clock } from "./clock.js";
import { net } from "./net.js";
import * as A from "./audio.js";
import {
  state, act, bindDevices, seedTransport, mergeRemote, snapshot, adoptSnapshot,
  startScheduler, playhead, applyMixer, arpMidi, STEPS,
} from "./devices.js";
import { hitPanel, sliderValue } from "./panels.js";
import { buildRoom } from "./room.js";
import { makeControls } from "./controls.js";
import { setupXR } from "../xr.js";

const me = getIdentity();
// the stored uid identifies the *person* and is shared across their tabs. as a
// network address that's wrong: two windows of one browser would each see the
// other's messages carrying their own uid, discard them as self-chatter, and
// sit there in silence. so the wire gets a per-tab address. it doubles as the
// tiebreak for simultaneous edits, which needs to be unique per client anyway.
const netId = me.uid + "." + Math.random().toString(36).slice(2, 7);
const $ = (id) => document.getElementById(id);

/* ---------- three ---------- */

const canvas = $("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 120);
const room = buildRoom();
const controls = makeControls(camera, canvas, room.clampWalk);

/* ---------- VR ----------
   the same rig the bedroom uses. xr.js asks a world for isWalkable; the
   studio thinks in clamps, so translate: a spot is walkable when the
   clamp leaves it where it was. */
let xrHandle = null;
const inVR = () => !!(xrHandle && xrHandle.presenting());
const xr = setupXR({
  renderer, camera, scene: room.scene, controls,
  world: {
    isWalkable: (x, z) => {
      const c = room.clampWalk(x, z);
      return Math.abs(c.x - x) < 1e-6 && Math.abs(c.z - z) < 1e-6;
    },
  },
  onSelect: (controller) => {
    xrAim = controller;
    try {
      const a = aim();
      if (!a) { if (aimDoor()) leaveToBedroom(); return; }
      apply(a.kind, hitPanel(a.kind, a.uv.x, a.uv.y));
    } finally { xrAim = null; }
  },
});
xrHandle = xr;

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ---------- state plumbing ---------- */

bindDevices({
  uid: netId,
  onLocalEdit: (id, data) => net.pushPatch(id, data),
  onStateChange: (id) => {
    room.markDirty(id);
    if (id === "mixer" || id === "*" || id === "xport") applyMixer();
    if (id === "xport" || id === "*") paintTransport();
  },
});

net.onPatch((id, data) => { mergeRemote(id, data); });
net.onWant((uid) => net.sendSnapshot(uid, snapshot()));
net.onSnapshot((snap) => {
  if (adopted) return;          // first answer wins; later ones are just echoes
  adopted = true;
  adoptSnapshot(snap);
  applyMixer();
  say("joined the session in progress");
});
net.onPose((uid, p) => {
  const peer = net.peers().get(uid);
  room.setGhost(uid, p, peer ? new THREE.Color(peer.color).getHex() : 0x7ef5e0);
});
net.onPeers((peers) => {
  room.dropGhosts(new Set(peers.keys()));
  paintPeers();
});

let adopted = false;

/* ---------- pointing at things ---------- */

const ray = new THREE.Raycaster();
const centre = new THREE.Vector2(0, 0);
const REACH = 5.5;
let dragging = null;    // { kind, type } while a fader is held

// in a headset the crosshair is the controller's laser: the hand that
// pulled the trigger wins, otherwise the pointing hand stands in
let xrAim = null;
const xrAimMat = new THREE.Matrix4();
function castRay() {
  const a = xrAim || (renderer.xr.isPresenting && xrHandle ? xrHandle.aimController() : null);
  if (a) {
    xrAimMat.identity().extractRotation(a.matrixWorld);
    ray.ray.origin.setFromMatrixPosition(a.matrixWorld);
    ray.ray.direction.set(0, 0, -1).applyMatrix4(xrAimMat);
  } else {
    ray.setFromCamera(centre, camera);
  }
}

function aim() {
  castRay();
  const hits = ray.intersectObjects(room.screens, false);
  if (!hits.length || hits[0].distance > REACH) return null;
  const h = hits[0];
  return { kind: h.object.userData.kind, uv: h.uv, distance: h.distance };
}

function aimDoor() {
  castRay();
  const hits = ray.intersectObjects(room.doorHits, false);
  return hits.length > 0 && hits[0].distance < REACH;
}

// the way out — the same door either way you use it: click it from across
// the room, or just walk through the glow like a doorway
let leaving = false;
function leaveToBedroom() {
  if (leaving) return;
  leaving = true;
  say("back through the door…");
  $("fade").classList.add("dark");
  setTimeout(() => { location.href = "/"; }, 520);
}

function applySlider(h) {
  if (h.ch) act.setChannel(h.ch, h.key, h.value);
  else act.setParam(h.dev, h.key, h.value);
}

const SCALE_NAMES = Object.keys(A.SCALES);
const ROOT_LO = 40;   // the key button walks one octave and wraps

function applyCycle(h) {
  const a = state.dev.arp;
  if (h.key === "voice") act.setParam("arp", "voice", cycle(A.VOICES, a.voice));
  else if (h.key === "scale") act.setParam("arp", "scale", cycle(SCALE_NAMES, a.scale));
  else if (h.key === "root") act.setParam("arp", "root", ROOT_LO + (((a.root - ROOT_LO) + 1) % 12));
  else if (h.key === "oct") act.setParam("arp", "oct", a.oct >= 2 ? -1 : a.oct + 1);
}

// one step of a held drag. only the horizontal position is asked for, and only
// of the control we already grabbed — which is the whole fix for faders
// stealing each other when your hand drifts a row up or down.
function dragStep(u) {
  if (!dragging) return;
  const v = sliderValue(dragging.kind, dragging.slider, u);
  if (v != null) applySlider({ ...dragging.slider, value: v });
}

function apply(kind, hit) {
  if (!hit || hit.type === "none") return;
  if (hit.type === "step") act.toggleStep(hit.id, hit.row, hit.step);
  else if (hit.type === "mute") act.toggleMute(hit.id);
  else if (hit.type === "clip") act.launchClip(hit.index);
  else if (hit.type === "chmute") act.setChannel(hit.name, "mute", !state.dev.mixer.ch[hit.name].mute);
  else if (hit.type === "slider") applySlider(hit);
  else if (hit.type === "cycle") applyCycle(hit);
}

canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  if (!controls.locked()) { controls.lock(); return; }
  const a = aim();
  if (!a) { if (aimDoor()) leaveToBedroom(); return; }
  const hit = hitPanel(a.kind, a.uv.x, a.uv.y);
  apply(a.kind, hit);
  // faders keep tracking while the button is down — anything else is a
  // single press and shouldn't repeat. we latch onto *which* fader, not just
  // which panel, so the rest of the drag can't wander onto its neighbour.
  if (hit.type === "slider") dragging = { kind: a.kind, slider: hit };
});
addEventListener("mouseup", () => { dragging = null; });

// touch: tap the middle of the screen to press whatever you're facing
canvas.addEventListener("touchend", (e) => {
  if (e.changedTouches.length !== 1) return;
  const t = e.changedTouches[0];
  if (Math.abs(t.clientX - innerWidth / 2) > innerWidth * 0.22) return;
  const a = aim();
  if (a) apply(a.kind, hitPanel(a.kind, a.uv.x, a.uv.y));
  else if (aimDoor()) leaveToBedroom();
}, { passive: true });

/* ---------- keys ---------- */

addEventListener("keydown", (e) => {
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.code === "Space") { e.preventDefault(); act.togglePlay(); }
  else if (e.code === "BracketLeft") act.setBpm(state.xport.bpm - 2);
  else if (e.code === "BracketRight") act.setBpm(state.xport.bpm + 2);
  else if (e.code === "KeyG") act.setSwing(state.xport.swing > 0.02 ? 0 : 0.14);
  else if (e.code === "Digit1") applyCycle({ key: "scale" });
  else if (e.code === "Digit2") applyCycle({ key: "voice" });
  else if (e.code === "Digit3") applyCycle({ key: "root" });
  else if (e.code === "Digit4") applyCycle({ key: "oct" });
});

const cycle = (list, cur) => list[(list.indexOf(cur) + 1) % list.length];

/* ---------- hud ---------- */

function paintTransport() {
  $("bpm").textContent = state.xport.bpm;
  $("playstate").textContent = state.xport.playing ? "PLAYING" : "STOPPED";
  $("playstate").className = state.xport.playing ? "on" : "";
  $("swing").textContent = Math.round(state.xport.swing * 100) + "%";
}

function paintPeers() {
  const n = net.count();
  $("peers").textContent = n === 1 ? "you're the only one here" : `${n} in the room`;
}

function paintClock() {
  const c = clock.info();
  const el = $("clock");
  if (c.source === "server") { el.textContent = `synced ±${Math.round(c.rtt / 2)}ms`; el.className = "ok"; }
  else if (store.mode !== "supabase") { el.textContent = "local mode"; el.className = "ok"; }
  else { el.textContent = "clock not synced"; el.className = "warn"; }
}

let sayTimer = null;
function say(msg, ms = 3000) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => el.classList.remove("show"), ms);
}

document.addEventListener("studio-lock", (e) => {
  $("hint").classList.toggle("hide", e.detail);
  $("crosshair").classList.toggle("hide", !e.detail);
});

/* ---------- the loop ---------- */

let last = performance.now();
function frame() {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  if (inVR()) xr.tick(dt); else controls.update(dt);

  if (dragging && controls.locked()) {
    // drifting off the row, off the end of the bar, or off the panel entirely
    // all do the sensible thing: hold, or keep tracking the fader you are
    // actually holding. one slider at a time, always.
    const a = aim();
    if (a && a.kind === dragging.kind) dragStep(a.uv.x);
  }

  // stepping into the doorway counts as using it
  const p = controls.pose();
  if (Math.hypot(p.x - room.doorPos.x, p.z - room.doorPos.z) < 0.6) leaveToBedroom();

  room.update(dt, playhead());
  renderer.render(room.scene, camera);
}

/* ---------- entering ---------- */

async function enter() {
  $("intro").classList.remove("show");

  // the room comes up first and connects second. a cold load has to fetch the
  // supabase client off a CDN and then sync the clock, and staring at a black
  // screen for three seconds is a worse first impression than walking into a
  // room that's still deciding what's playing.
  A.initAudio();                       // must ride the click that got us here
  applyMixer();
  startScheduler();
  paintTransport();
  controls.lock();
  xr.showButton();              // headsets get a door into the room
  renderer.setAnimationLoop(frame);   // WebXR drives the loop when a session runs

  try {
    await store.init();
    await clock.start();
  } catch (e) {
    // no backend is a worse room, not a broken one — you still get to play
    console.warn("studio: no backend, running solo —", e);
  }
  paintClock();
  setInterval(paintClock, 8000);

  try {
    await net.join({ ...me, uid: netId }, () => controls.pose());
  } catch (e) {
    console.warn("studio: couldn't join the channel —", e);
  }
  paintPeers();

  // give the room a moment to answer "what's playing?". if nobody does, we're
  // the first one in and it's on us to start something.
  setTimeout(() => {
    if (adopted) return;
    adopted = true;
    seedTransport();
    applyMixer();
    net.pushPatch("xport", state.xport);
    net.pushPatch("drums", state.dev.drums);
    net.pushPatch("clips", state.dev.clips);
    room.markDirty("*");
    say("you opened the room — it's yours to start");
  }, 1300);
}

$("enter-btn").addEventListener("click", enter, { once: true });

// a quiet hand to the console for smoke tests, same habit as the main site
window.STUDIO_DEBUG = {
  state, act, clock, net, room, controls, camera, renderer, THREE,
  playhead, STEPS, hitPanel, sliderValue, aim, netId, dragStep, apply, audio: A, arpMidi,
  beginDrag: (kind, hit) => { dragging = { kind, slider: hit }; },
  endDrag: () => { dragging = null; },
};
