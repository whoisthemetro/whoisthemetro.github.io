/* ============================================================
   THE METRO — boot + glue
   ============================================================ */

import * as THREE from "three";
import { buildWorld } from "./world.js";
import { Controls } from "./controls.js";
import { NotesWall } from "./notes3d.js";
import { Ghosts } from "./ghosts.js";
import { loadGlbAvatar } from "./avatar-glb.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { store } from "./store.js";
import { presence } from "./presence.js";
import { startAmbience, citySound, pianoNote, semitoneToKey, audioNow, purr, setRain, setWater, setRoomTone, setClubTone, setClubBed, kettleBoil, setThruster, boostSound, discSound, goalHorn, meow, hiss, careSound, drumHit, setArcadeZone, punchSound, shieldClang, stunBuzz, edrumHit, guitarPluck, guitarNote, shotSound, smokeSound, setFx, setDelayTempo, setBusLevel, setGuitarFilter, startVacuum, stopVacuum, beep, fireSound } from "./ambience.js";
import { SONGS, playSong, stopSong, currentSongId } from "./songs.js";
import { progress } from "./progress.js";
import { voice } from "./voice.js";
import { screen } from "./screen.js";
import { stream } from "./stream.js";
import { weather } from "./weather.js";
import { startPlanes } from "./planes.js";
import { Cat } from "./cat.js";
import { Bartender } from "./bartender.js";
import { Guide } from "./guide.js";
import { speak, stopSpeaking, isSpeaking, isVoicing, voiceAvailable, voiceInfo, preferVoices, loadClips, clipsReady } from "./say.js";
import { GUIDE_LINES, INTRO, ROOM_LINES, clipId } from "./lines.js";

/* What Trinity should sound like, best first. Every visitor's device owns
   its own voice list, so this is a wish rather than a setting: on a mac with
   the good voices downloaded she gets Ava or Allison, on a stock one she
   gets Samantha, on android a Google voice. Ordered modern-first, and all
   women, because she is one. */
preferVoices(["Ava", "Allison", "Samantha", "Susan", "Zoe", "Serena", "Nicky",
              "Joelle", "Noelle", "Karen", "Martha", "Tessa", "Moira", "Kathy", "Female"]);
/* And if her lines have been rendered to audio, those beat every one of the
   voices above. Best-effort and fire-and-forget: no manifest simply means
   nothing has been rendered yet and she stays on the browser synth. */
loadClips();
import { makeSelfieMirror } from "./mirror.js";
import { DEFAULT_SPEC } from "./avatar-builder.js";
import { openOutfitPicker } from "./picker.js";
import { initAnalytics, track, analyticsBuffer } from "./analytics.js";
import { openArcade, closeArcade, arcadeIsOpen, arcadeWantsEsc, handleGameMessage, setScoreHook, vrFrame as arcadeVrFrame, vrKey as arcadeVrKey } from "./arcade.js";
import { initPool } from "./pool.js";
import { initBasket } from "./basketball.js";
import { makeGymBall } from "./gymball.js";
import { initDebug } from "./debug.js";
import { PIANO_VOICES, GUITAR_VOICES } from "./ambience.js";
import { createRadio, SR_STATIONS, LA_STATIONS } from "./radio.js";
import { startTitleFX } from "./title.js";
import { setupXR } from "./xr.js";
// THE STUDIO's engine — the room itself is built by world.js
import * as SA from "./studio/audio.js";
import {
  state as sState, act as sAct, bindDevices as sBind, seedTransport as sSeed,
  mergeRemote as sMerge, snapshot as sSnap, adoptSnapshot as sAdopt,
  startScheduler as sStartScheduler, playhead as sPlayhead, applyMixer as sApplyMixer,
  stepCount as sStepCount, rec as sRec, MAX_STEPS as S_MAX_STEPS, N_PATS as S_NPATS,
  onStep as sOnStep, curGrid as sCurGrid,
} from "./studio/devices.js";
import { hitPanel as sHitPanel, dragValue as sDragValue } from "./studio/panels.js";
import { clock as sClock } from "./studio/clock.js";
import { net as sNet } from "./studio/net.js";
import { setupPads } from "./studio/pads.js";
import {
  PAPERS, IS_TOUCH, safeUrl, hostOf, timeAgo, toast as domToast,
  getIdentity, saveIdentity, shrinkImage,
} from "./util.js";

const $ = (s) => document.querySelector(s);

/* ---------------- VR bridges ----------------
   DOM is invisible inside a headset session. xrRef is filled in once
   setupXR has run; declaring it here (before anything can toast) keeps it
   out of the temporal dead zone. */
let xrRef = null;
const inVR = () => !!(xrRef && xrRef.presenting());
// every toast also lands on the in-world HUD
function toast(msg, ms, kind) {
  domToast(msg, ms, kind);
  if (inVR()) xrRef.note(msg);
}
// anything that would open a DOM overlay says so in-world instead of
// silently setting modalOpen and locking every further click
function vrBlocked(what) {
  if (!inVR()) return false;
  xrRef.note(what);
  return true;
}

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
// 3 and 4, not 1 and 2: three.js hands layers 1/2 to the left and right
// eye inside a WebXR session, so a room parked on those would render to
// one eye only once you ride the lift there in VR
camera.layers.enable(3);   // boat layer
camera.layers.enable(4);   // arena layer
const world = buildWorld(renderer);

/* --- per-room light culling: keep the mobile shader-uniform budget in check --
   Some GPUs (notably Qualcomm Adreno) cap MAX_FRAGMENT_UNIFORM_VECTORS at 256.
   three.js compiles EVERY material's fragment shader against the TOTAL scene
   light count, so all ~55 of our lights overflowed that cap on those phones —
   the wall (toon) shaders failed to link and the walls simply weren't drawn
   (the friend's "see-through walls" bug). Fix: only ever keep the CURRENT
   room's lights in the scene's light state. Hiding a light (visible=false)
   DROPS it from the uniform budget; intensity=0 does NOT. Measured worst case
   is "home" (bedroom+arcade) at 217 vec4s — safely under 256; every other room
   is far lower. The hemisphere fill is global (always on). The two suns move
   (their y climbs past the arena band at noon) so they carry an explicit
   userData.cullRoom from world.js instead of being placed by position.
   Toggling visibility recompiles materials on a room change — a brief hitch
   hidden by the fade-to-black; bedroom<->arcade is one "home" group, so the
   main space never re-compiles as you walk it. */
const cullLights = { home: [], desi: [], crew: [], venue: [], gym: [] };
(function bucketRoomLights() {
  world.scene.updateMatrixWorld(true);
  const wp = new THREE.Vector3();
  world.scene.traverse((o) => {
    if (!o.isLight || o.isHemisphereLight || o.isAmbientLight) return; // fill stays global
    o.getWorldPosition(wp);
    const r = o.userData.cullRoom || roomScopeOfPos(wp.x, wp.y, wp.z);
    (cullLights[r] || cullLights.home).push(o);
  });
})();
let lightCullRoom = null;
function applyLightCull(scope) {
  if (scope === lightCullRoom) return;
  lightCullRoom = scope;
  for (const room in cullLights) {
    const on = room === scope;
    for (const lt of cullLights[room]) lt.visible = on;
  }
}
// everyone spawns home — cull to it before the first render so a GPU that can't
// fit all 55 lights never has to compile that doomed shader even once.
applyLightCull("home");

/* ---------------- analytics (PostHog, env-gated; see docs/analytics.md) ----
   Exploration/interaction events, all aggregated by the callers. No-op until a
   key is set in config.js. ------------------------------------------------- */
initAnalytics();
const A_DEVICE = IS_TOUCH ? "mobile" : "desktop";
let aWorldLoaded = false;
addEventListener("error", (e) => {
  if (!aWorldLoaded) track("world_load_failed", { reason: String((e && (e.message || (e.error && e.error.message))) || "error").slice(0, 160), device: A_DEVICE });
});
function aWorldReady() {
  if (aWorldLoaded) return;
  aWorldLoaded = true;
  track("world_loaded", { loadSeconds: +(performance.now() / 1000).toFixed(2), device: A_DEVICE });
}
// which space the player is in — flags for the far rooms, x for bedroom vs arcade
function aRoomNow() {
  if (inStudio) return "studio";
  if (inBoat) return "desi";
  if (inArena) return "crew";
  if (inClub) return "venue";
  if (inGym) return "gym";
  return controls.pos.x < -3.6 ? "arcade" : "bedroom";
}
// which big space a world position is in. the rooms sit far apart with no
// walkable space between them, so position alone classifies cleanly; bedroom +
// arcade are one contiguous space ("home"). used to room-scope ghosts so we only
// build/animate avatars for people actually in the room with us.
function roomScopeOfPos(x, y, z) {
  if ((y || 0) > 40) return "crew";
  if (z > 40) return "gym";                  // the gym sits far out in +z
  if (z < -40) return "studio";              // and the studio far out in -z
  if (x > 20) return "desi";
  if (x < -20) return "venue";
  return "home";
}
function myScope() {
  if (inStudio) return "studio";
  if (inBoat) return "desi";
  if (inArena) return "crew";
  if (inClub) return "venue";
  if (inGym) return "gym";
  return "home";
}
let aRoom = null, aRoomAt = performance.now(), aRoomCount = 0, aEngaged = false;
function aEngage() { if (aEngaged) return; aEngaged = true; track("session_engaged", { device: A_DEVICE }); }
function aSetRoom(name) {
  if (name === aRoom) return;
  if (aRoom) track("room_exited", { room: aRoom, dwellSeconds: Math.round((performance.now() - aRoomAt) / 1000) });
  aRoom = name; aRoomAt = performance.now(); aRoomCount++;
  track("room_entered", { room: name });
  if (aRoomCount >= 2) aEngage();           // explored past the first space = engaged
}
function aItem(item) { track("item_interacted", { item, room: aRoom || aRoomNow() }); aEngage(); }
// instruments: one summary event when you stop, never per note
let aInstName = null, aInstCount = 0, aInstStart = 0, aInstT = null;
function aInstFlush() {
  if (aInstName && aInstCount > 0) track("instrument_played", { instrument: aInstName, notes: aInstCount, seconds: Math.round((performance.now() - aInstStart) / 1000) });
  aInstName = null; aInstCount = 0;
}
function aInstrument(name) {
  const now = performance.now();
  if (aInstName !== name) { aInstFlush(); aInstName = name; aInstStart = now; aInstCount = 0; }
  aInstCount++; aEngage();
  clearTimeout(aInstT); aInstT = setTimeout(aInstFlush, 2500);
}
let aArcadeGame = null, aArcadeStart = 0;
const controls = new Controls(camera, canvas, world.bounds, world.isWalkable);
const notesWall = new NotesWall(world.noteGroup, world.walls, store);
const ghosts = new Ghosts(world.ghostGroup);
const raycaster = new THREE.Raycaster();
raycaster.layers.enableAll();   // clickables exist on both light layers
const identity = getIdentity();

controls.pos.x = world.spawn.x;
controls.pos.z = world.spawn.z;
controls.yaw = world.spawn.yaw;

world.setCityListener((type) => { if (!inBoat && !inArena && !inClub && !inGym && !inStudio) citySound(type); });

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
// the venue big screen: a clickable in-world panel on the booth wall that opens
// the flat theater overlay. closing the overlay re-locks the room.
const screenMesh = screen.mountScreen(world.scene);
// the venue's big screen hangs in the venue — it has no business glowing
// away in the corner of the bedroom window
world.cullAdd(screenMesh, "venue");
// venue screen-share (WebRTC): the host projects their tab to the room; each
// viewer renders the received stream on the wall. fixes both the "iPad already
// in the room didn't update" (host re-announces + dials present viewers) and
// "one person leaving cuts everyone off" (each viewer has its own connection).
stream.init(presence.clientId);        // per-tab id, so two tabs of one user still connect
stream.onRemoteStream((s) => screen.setMediaStream(s, false));
stream.onRemoteEnd(() => { if (!stream.isHosting()) screen.setMediaStream(null); });
// let a viewer know how the screen-share connection is going (and why it isn't,
// when the network won't allow a peer path)
stream.onStatus((s) => {
  if (!inClub || stream.isHosting()) return;
  if (s === "connected") toast("📺 connected — the screen's coming through");
  else if (s === "failed") toast("📺 couldn't reach the screen-share (network blocked the connection)");
});
stream.onHostEnded(() => { screen.setMediaStream(null); toast("📺 sharing ended"); renderBooth(); });
// host wall self-heal: while we're the one sharing, the captured stream stays
// live no matter who comes or goes — so the host's OWN wall should never go dark
// until they stop. if anything ever knocks the stream off the wall (a viewer
// disconnecting, a stray clear), pin it back. cheap insurance, host-only.
setInterval(() => {
  if (stream.isHosting()) {
    if (stream.localStream() && !screen.showingLive()) screen.setMediaStream(stream.localStream(), true);
  } else if (inClub) {
    // viewer self-heal, escalating: (1) re-subscribe if the SFU connection died
    // (network blip / backgrounded tab); (2) if the picture has FROZEN while the
    // connection still claims "connected" — the iOS decode stall you get when
    // someone walks in and spawns an avatar — force a clean re-pull; (3) nudge a
    // merely-paused video back. all so the stream comes back WITHOUT a refresh.
    stream.ensureWatching();
    if (screen.stalled()) stream.resubscribe();
    screen.kick();
    checkVenueStreamHealth();              // if it's STILL gray after all that, nudge the user to reload
  }
}, 1500);

// last-resort safety net: the self-heal above fixes most hitches on its own, but
// if a viewer SHOULD be seeing a picture (a host is live / a stream is set) and
// the wall is still gray or frozen ~10s later, pop a friendly reload prompt in
// front of them (a centred overlay, so it's there no matter where they look).
const venueHelp = $("#venue-help");
let venueGrayStart = 0;             // when the gray/frozen stretch began (0 = healthy)
let venueHelpSnoozeUntil = 0;       // after a dismiss, hold off re-nagging for a bit
function showVenueHelp(on) { venueHelp.classList.toggle("show", !!on); }
function checkVenueStreamHealth() {
  // only viewers, only when there's genuinely something we ought to be receiving
  const expecting = inClub && !stream.isHosting() && (stream.hostLive() || screen.has());
  const healthy = screen.isPlaying() && screen.frameAge() < 2500;   // a frame advanced recently
  if (!expecting || healthy) { venueGrayStart = 0; showVenueHelp(false); return; }
  if (Date.now() < venueHelpSnoozeUntil) return;                    // snoozed after a dismiss
  if (!venueGrayStart) { venueGrayStart = Date.now(); return; }
  if (Date.now() - venueGrayStart > 10000) showVenueHelp(true);
}
$("#venue-help-reload").addEventListener("click", () => location.reload());
$("#venue-help-dismiss").addEventListener("click", () => {
  showVenueHelp(false); venueGrayStart = 0; venueHelpSnoozeUntil = Date.now() + 30000;
});
// is a set reaching the room right now? the broadcaster knows from djLive
// (they never hear their own chunks); listeners know from the chunk clock.
function djAudioPresent() {
  return voice.djLive() || (!!djHeardAt && Date.now() - djHeardAt < 1600);
}
// the ON AIR sign follows the DJ set. the empty-room drone (the "environment
// noise") ducks away for ANY media in the room — a DJ set OR anything rolling on
// the big screen (a screen-share or a video) — because the ambient bed over a
// show is just distracting. nothing on → the drone fades back in to hold the room.
setInterval(() => {
  if (!entered || !inClub) return;
  const djLive = djAudioPresent();
  const media = djLive || screen.isPlaying();   // a set, or a video/share on the wall
  world.setOnAir(djLive);
  setClubTone(!media);                           // setClubTone fades over ~1.2s, and no-ops if unchanged
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
  // in THE GYM: SPACE jumps (routed here so it fires reliably), E throws a pass
  if (e.code === "Space" && !e.repeat && inGym && entered && !modalOpen) {
    e.preventDefault();
    controls.gymJump();
  }
  if (e.code === "KeyE" && !e.repeat && inGym && entered && !modalOpen && controls.locked) {
    gymBall.pass();
  }
  // R readies you up during gym warm-up (desktop — you can't click DOM locked)
  if (e.code === "KeyR" && !e.repeat && inGym && entered && !modalOpen && !gymLive) {
    toggleReady();
  }
  // press G in the venue to re-skin the loft (backdrop + neon + the soothing
  // bed). local + instant — resets to the default on reload. a dj broadcasts
  // the look so the whole room follows.
  if (e.code === "KeyG" && !e.repeat && inClub && entered && !modalOpen) {
    const name = world.cycleClubTheme();
    setClubBed(clubBedFor());
    toast(`theme: ${name}`);
    if (canDJ()) presence.sendAct({ kind: "theme", ix: world.clubThemeIndex() });
  }
  // dj FX panel: F = fog cannon, X = fireworks — broadcast so the room shares it
  if (e.code === "KeyF" && !e.repeat && !modalOpen && canFX()) {
    const seed = (Math.random() * 1e6) | 0;
    world.clubFog(seed); presence.sendAct({ kind: "fog", seed }); toast("🌫 fog");
  }
  if (e.code === "KeyX" && !e.repeat && !modalOpen && canFX()) {
    const seed = (Math.random() * 1e6) | 0;
    world.clubFireworks(seed); presence.sendAct({ kind: "fireworks", seed }); toast("🎆 fireworks");
  }
  // admin quick-travel: 1 venue · 2 desi · 3 crew · 4 home — skip the elevator
  if (adminMode && entered && !modalOpen && !chatOpen && !e.repeat) {
    const ae = document.activeElement;
    if (!ae || (ae.tagName !== "INPUT" && ae.tagName !== "TEXTAREA")) {
      const to = { Digit1: "venue", Numpad1: "venue", Digit2: "desi", Numpad2: "desi",
                   Digit3: "crew", Numpad3: "crew", Digit4: "home", Numpad4: "home" }[e.code];
      if (to) { e.preventDefault(); adminJump(to); }
    }
  }
  // admin layout mode: L toggles it; while it's on, the arrows/QE/PgUpDn
  // move whatever prop is held (repeats allowed — holding an arrow slides)
  if (adminMode && entered && !modalOpen && !chatOpen) {
    const ae = document.activeElement;
    if (!ae || (ae.tagName !== "INPUT" && ae.tagName !== "TEXTAREA")) {
      if (e.code === "KeyL" && !e.repeat) { e.preventDefault(); setLayoutMode(!layoutMode); }
      else if (layoutMode) {
        const fine = e.shiftKey ? 0.01 : 0.05, rot = e.shiftKey ? 0.02 : 0.1;
        const act = {
          ArrowUp:    () => layoutNudge(0, 0, -fine),
          ArrowDown:  () => layoutNudge(0, 0, fine),
          ArrowLeft:  () => layoutNudge(-fine, 0, 0),
          ArrowRight: () => layoutNudge(fine, 0, 0),
          PageUp:     () => layoutNudge(0, fine, 0),
          PageDown:   () => layoutNudge(0, -fine, 0),
          KeyQ:       () => layoutNudge(0, 0, 0, rot),
          KeyE:       () => layoutNudge(0, 0, 0, -rot),
          Equal:      () => layoutScale(e.shiftKey ? 1.01 : 1.05),
          NumpadAdd:  () => layoutScale(e.shiftKey ? 1.01 : 1.05),
          Minus:      () => layoutScale(e.shiftKey ? 1 / 1.01 : 1 / 1.05),
          NumpadSubtract: () => layoutScale(e.shiftKey ? 1 / 1.01 : 1 / 1.05),
          KeyR:       () => { if (layoutSel) { world.resetMovable(layoutSel); layoutBox?.update(); } },
        }[e.code];
        // eat the key so the arrows edit the prop instead of walking you
        if (act) { e.preventDefault(); controls.keys?.delete(e.code); act(); }
      }
    }
  }
});
addEventListener("keyup", (e) => {
  if (e.code === "KeyV" && voice.mode() === "ptt") { voice.stopTalk(); updateMicUI(); }
});

// piano voice — sticky per visitor, broadcast with each note
let pianoVoice = 0;
try { pianoVoice = (parseInt(localStorage.getItem("metro.voice") || "0", 10) || 0) % PIANO_VOICES.length; } catch (e) {}
let guitarVoice = 0;
try { guitarVoice = (parseInt(localStorage.getItem("metro.gvoice") || "0", 10) || 0) % GUITAR_VOICES.length; } catch (e) {}
world.setGuitarVoiceSwitch(guitarVoice, GUITAR_VOICES.length);   // flick the blade to the saved voice

// the stompboxes — each on/off is client-side + sticky (everyone runs their own
// pedalboard, like the mixer to come). default on. labels for the toast/aim-tip.
const FX_LABEL = { "kb-chorus": "chorus", "kb-delay": "delay", "kb-reverb": "reverb", "gtr-od": "overdrive", "gtr-delay": "guitar delay", "gtr-reverb": "guitar reverb" };
const fxOn = {};
for (const id of world.stompIds) { try { fxOn[id] = localStorage.getItem("metro.fx." + id) !== "0"; } catch (e) { fxOn[id] = true; } }
// push every pedal's state into the audio graph + LEDs (call once audio is up)
function applyFxStates() { for (const id of world.stompIds) { setFx(id, fxOn[id]); world.setStompLED(id, fxOn[id]); } }

// the desk channel mixer — same deal as the pedals: client-side + sticky, each
// channel a 0..150% level on its instrument bus (100 = the room's natural mix).
const MIX_IDS = ["piano", "guitar", "drum"];
const MIX_LABEL = { piano: "keys", guitar: "guitar", drum: "drums" };
const mixLevel = {};
for (const id of MIX_IDS) {
  let v = 100;
  try { const s = localStorage.getItem("metro.mix." + id); if (s !== null) v = +s; } catch (e) {}
  mixLevel[id] = isFinite(v) ? Math.min(Math.max(v, 0), 150) : 100;
}
// push every channel's level into the bus + slide its 3D cap (call once audio is up)
function applyMixLevels() { for (const id of MIX_IDS) { setBusLevel(id, mixLevel[id]); world.setMixFader(id, mixLevel[id]); } }

// the guitar filter treadle: 0..1, 1 = lowpass wide open. client-side + sticky.
let gtrFilterLevel = 1;
try { const s = localStorage.getItem("metro.gtrfilter"); if (s !== null && isFinite(+s)) gtrFilterLevel = Math.min(Math.max(+s, 0), 1); } catch (e) {}
function applyGuitarFilter() { setGuitarFilter(gtrFilterLevel); world.setGuitarPedalTilt(gtrFilterLevel); }

// the cat — its key-walking plays the same piano visitors can play.
// All bedroom sounds are gated: aboard THE DESI you hear only the sea.
const bedroomSound = (fn) => (...a) => { if (!inBoat && !inArena && !inClub && !inGym && !inStudio) fn(...a); };
// the arcade is effectively its own room (walled off, through the opening): its
// zone reads ~1 inside, ~0.72 in the doorway, ≤0.14 from the bedroom. once you've
// crossed in, the bedroom's INSTRUMENTS shouldn't carry over the wall (the cat's
// voice and the bartender still do — they belong to the shared origin cluster).
const inArcade = () => world.arcadeZoneLevel(controls.pos.x, controls.pos.z) >= 0.5;
let toy = null;   // the fetch toy (built just below the cat); hooks reference it
const cat = new Cat(world.scene, world.catSpots, {
  plink: bedroomSound((i) => { if (inArcade()) return; pianoNote(i % 15, pianoVoice); world.pressPianoKey(i % 15); }),
  purr: bedroomSound(purr),
  meow: bedroomSound(meow),
  hiss: bedroomSound(hiss),
  dig: bedroomSound(() => careSound("sand")),
  // the music owns the keys — the cat keeps off while a MIDI song plays OR the
  // bedroom radio is on (radios is built further down; only ever read at tick)
  songPlaying: () => currentSongId() !== null || !!(radios.la && radios.la.radio.info().on),
  // the cat's grabbed the mouse — it now rides the cat's mouth until it's set down
  onToyGrabbed: () => { if (toy) toy.phase = "carried"; },
  onToyDropped: (x, z) => { if (toy) { toy.phase = "rest"; toy.claimed = false; toy.x = x; toy.z = z; toy.y = TOY_REST_Y; toy.spin = 0; } },
});

// the arcade bartender — works the bar, clocks you when you walk up, fixes you a
// drink on a click. sounds ride the bedroom/arcade scope (silent in other rooms).
const bartender = new Bartender(world.scene, world.barInfo, {
  greet: bedroomSound(() => { try { beep(392, 0.09, "sine", 0.035); setTimeout(() => beep(523, 0.1, "sine", 0.035), 90); } catch (e) {} }),
  serve: bedroomSound(() => { try { beep(1180, 0.05, "sine", 0.04); setTimeout(() => beep(1560, 0.06, "sine", 0.03), 70); } catch (e) {} }),
  say: (line) => toast(`🍸 ${line}`),   // his dry greeting; ordering toasts serve()'s line
});

/* --- the guide: she stands near where you land and explains the room ------
   The bedroom hides almost everything it can do — a fill on the e-kit that
   opens the studio, a lift to four other places, a wall you can post to.
   She's the one who tells you, one thing at a time. Her voice is say.js
   (the browser's own synth: free, no key), and every line she says also
   toasts, so the room still works with the sound off — or in a headset,
   where toast() mirrors to the wrist HUD on its own.

   Where she stands was chosen by screenshotting the spawn view, not by
   arithmetic: two metres out and 30° to the left puts her against the wall
   art instead of on top of the desk, so you see a person AND the room you
   just walked into. yaw 0.80 turns her to face the spawn point. */
// she's a bat. the other shapes stay in guide.js behind ?form=person|head|shard
// because picking between them meant seeing them in this room's own light,
// and that's worth being able to do again.
const GUIDE_FORM = new URLSearchParams(location.search).get("form") || "bat";
const guide = new Guide(world.scene, { x: 0.2, z: 0.9, yaw: 0.80, name: "Trinity", form: GUIDE_FORM }, {
  greet: bedroomSound(() => { try { beep(587, 0.08, "sine", 0.03); setTimeout(() => beep(880, 0.09, "sine", 0.028), 95); } catch (e) {} }),
  walkable: (x, z) => world.isWalkable(x, z),
  // the bedroom and the arcade share one 1.5 m opening. when she and you are
  // on opposite sides of it, hand her the threshold instead of you — and aim
  // a little PAST it, or she arrives at the doorway, recomputes, and stops
  // dead in it because technically she's still on the wrong side.
  waypoint: (fx, fz, tx, tz) => {
    const D = world.arcadeDoor;
    const arcadeSide = (x) => x < D.x;
    if (!D || arcadeSide(fx) === arcadeSide(tx)) return null;
    return { x: D.x + (arcadeSide(tx) ? -0.45 : 0.45), z: D.z };
  },
  speaking: isSpeaking,     // a line is in the air — the card stays up
  voicing: isVoicing,       // she's actually sounding — the mouth moves
  // one door for everything she says: subtitle it, speak it, and hand back
  // how long it'll take so her mouth runs exactly that long
  // NOT wrapped in bedroomSound — that wrapper swallows the return value and
  // her mouth needs the duration back. leaving the room silences her in the
  // tick instead, which also covers lift rides and the studio door.
  // no toast. her words live on the card beside her head now, and printing
  // them along the bottom of the screen as well was just saying it twice.
  // (portrait phones get neither — the card is off there and she's audible,
  // which is the trade that screen size buys.)
  say: (line, clip) => speak(line, { clip }),
});

/* What she says now lives in lines.js, because the offline renderer in
   tools/voice/ has to read exactly the same list — if the two ever drifted
   the room would ask for audio that was never made. The facts those lines
   depend on are written down beside them; go and read the code before you
   add one. This list has already been wrong once.

   A shuffle bag per room: draw without replacement, and a fresh bag never
   opens with the line you just heard. Same trick as the dumbek samples. */
function lineBag(items) {
  let pool = [], last = null;
  return () => {
    if (!pool.length) {
      pool = items.slice();
      for (let i = pool.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
      if (pool.length > 1 && pool[pool.length - 1] === last) { const t = pool[0]; pool[0] = pool[pool.length - 1]; pool[pool.length - 1] = t; }
    }
    return (last = pool.pop());
  };
}
const guideBags = { bedroom: lineBag(GUIDE_LINES.bedroom), arcade: lineBag(GUIDE_LINES.arcade) };
let guideMet = false;             // has she introduced herself yet
let guideGreetedRoom = null;      // and has she said anything about THIS room
// she calls you what you called yourself on the way in
const youAre = () => (identity.name || "").trim() || "you";
/* Returns BOTH what the card shows and which rendered take to play. They're
   the same string everywhere except the introduction, where the card greets
   you by name and the voice can't — a pre-rendered clip doesn't know who
   walked in, and splicing a synthesised name into a real recording sounds
   exactly as bad as it reads. */
function guideNextLine() {
  const room = inArcade() ? "arcade" : "bedroom";
  let line, spoken;
  if (!guideMet) {
    guideMet = true; guideGreetedRoom = room;
    line = INTRO.display; spoken = INTRO.spoken;
  } else if (guideGreetedRoom !== room) {
    guideGreetedRoom = room;
    line = spoken = ROOM_LINES[room];
  } else {
    line = spoken = guideBags[room]();
  }
  return { text: line.replace(/\{you\}/g, youAre()), clip: clipId(spoken) };
}

/* --- the toy mouse: throw it, the cat fetches it back ----------------------
   A felt mouse you pick up and toss; the cat scampers after it, carries it
   home in its mouth, and drops it at your feet so you can throw again.
   Local-first like treats and petting — the cat sim runs per-client, so
   there's no coherent shared toy to network (a follow-up if the cat ever goes
   shared). Bedroom only; that's where the cat lives. */
const TOY_REST_Y = 0.035;                 // mouse body half-height: sits ON the carpet
const TOY_BB = world.catSpots.bounds;     // keep throws inside the bedroom
const toyMouse = (() => {
  const g = new THREE.Group();
  // a soft self-glow so the mouse is visible (and obviously grabbable) on a
  // dark floor at night — a touch brighter than the bowls since it's the thing
  // a newcomer needs to notice. no light added: just emissive (free on mobile).
  const grey = new THREE.MeshLambertMaterial({ color: 0x9aa0a8, emissive: 0x6a7079, emissiveIntensity: 0.55 });
  const pink = new THREE.MeshLambertMaterial({ color: 0xe79bab, emissive: 0xc06a82, emissiveIntensity: 0.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 9), grey);
  body.scale.set(1.6, 0.9, 0.95); body.castShadow = true; g.add(body);
  for (const s of [-1, 1]) {              // round felt ears
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), pink);
    ear.scale.set(0.4, 1, 1); ear.position.set(0.028, 0.03, s * 0.026); g.add(ear);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 6), pink);
  nose.position.set(0.066, -0.002, 0); g.add(nose);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.001, 0.13, 5), pink);
  tail.position.set(-0.085, 0.004, 0); tail.rotation.z = Math.PI / 2 - 0.3; g.add(tail);
  world.scene.add(g);
  return g;
})();
// a generous invisible hit sphere so picking it up doesn't need pixel aim
const toyHit = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8),
  new THREE.MeshBasicMaterial({ visible: false }));
toyHit.userData.toy = true; world.scene.add(toyHit);
toy = { mesh: toyMouse, phase: "rest", claimed: false,
        x: 0.6, z: 1.6, y: TOY_REST_Y, vx: 0, vy: 0, vz: 0, spin: 0, faceYaw: 0 };

const toyAtHome = () => !inBoat && !inArena && !inClub;   // the cat's room only
const _toyMouth = new THREE.Vector3();
function grabToy() { toy.phase = "held"; }
function throwToy() {
  const p = controls.pose();
  const fwx = -Math.sin(p.yaw), fwz = -Math.cos(p.yaw);   // "forward" — matches treatAt
  toy.vx = fwx * 3.0; toy.vz = fwz * 3.0; toy.vy = 2.7;    // a gentle underarm arc
  toy.phase = "fly"; toy.claimed = false; toy.spin = 0; toy.faceYaw = p.yaw;
}
function toyTick(dt, t) {
  if (!toy) return;
  const home = toyAtHome();
  toyMouse.visible = home;
  toyHit.visible = home && toy.phase === "rest" && !toy.claimed;   // grabbable only at rest
  if (!home) { if (toy.phase === "held") toy.phase = "rest"; return; }
  const m = toyMouse;
  if (toy.phase === "held") {
    const p = controls.pose();
    toy.faceYaw = p.yaw;
    toy.x = p.x - Math.sin(p.yaw) * 0.5; toy.z = p.z - Math.cos(p.yaw) * 0.5;
    toy.y = 1.02 + Math.sin(t * 3) * 0.02;
  } else if (toy.phase === "fly") {
    toy.vy -= 9.0 * dt;
    toy.x += toy.vx * dt; toy.y += toy.vy * dt; toy.z += toy.vz * dt;
    // stop at the walls so it never sails into the next room
    if (toy.x < TOY_BB.minX + 0.2) { toy.x = TOY_BB.minX + 0.2; toy.vx = 0; }
    if (toy.x > TOY_BB.maxX - 0.2) { toy.x = TOY_BB.maxX - 0.2; toy.vx = 0; }
    if (toy.z < TOY_BB.minZ + 0.2) { toy.z = TOY_BB.minZ + 0.2; toy.vz = 0; }
    if (toy.z > TOY_BB.maxZ - 0.2) { toy.z = TOY_BB.maxZ - 0.2; toy.vz = 0; }
    toy.spin += dt * 12;
    if (toy.y <= TOY_REST_Y) {                 // landed
      toy.y = TOY_REST_Y; toy.phase = "rest"; toy.vx = toy.vy = toy.vz = 0;
      if (cat.goFetch(toy.x, toy.z)) toy.claimed = true;   // grumpy/busy cat just leaves it
    }
  } else if (toy.phase === "carried") {
    cat.mouthPos(_toyMouth);
    toy.x = _toyMouth.x; toy.y = _toyMouth.y; toy.z = _toyMouth.z;
    toy.faceYaw = cat.yaw;
  }
  m.position.set(toy.x, toy.y, toy.z);
  m.rotation.set(toy.phase === "fly" ? toy.spin : 0, toy.faceYaw + Math.PI / 2, 0);
  toyHit.position.set(toy.x, toy.y + 0.05, toy.z);
}

// your saved outfit spec (the picker writes it; defaults to the owner's look
// with the face glowing in your identity color)
function loadOutfit() {
  const base = { ...DEFAULT_SPEC, faceColor: identity.color || DEFAULT_SPEC.faceColor };
  try {
    const s = JSON.parse(localStorage.getItem("metro.outfit"));
    if (s) { const m = { ...base, ...s }; if (m.top === "hoodie") m.top = "tee"; return m; }  // hoodie retired
  } catch (e) {}
  return base;   // merge so saves from before a new option (e.g. skin) still fill in
}
function saveOutfit(spec) { try { localStorage.setItem("metro.outfit", JSON.stringify(spec)); } catch (e) {} }
let outfitSpec = loadOutfit();
identity.outfit = outfitSpec;   // broadcast over presence so others see your fit
identity.avatar = loadAvatarUrl();   // and the scanned avatar, if they made one

// the arcade mirror — a framed panel that renders a live "you" (your dressed
// figure + 8-bit face, driven by your mic level). click it to open the picker.
const mirror = makeSelfieMirror(renderer, outfitSpec);
{
  const a = world.mirrorAnchor;
  mirror.group.position.set(a.x, a.y, a.z);
  mirror.group.rotation.y = a.ry;
  world.scene.add(mirror.group);
}
/* ---------------- the wardrobe: bring your own avatar ----------------
   Every hosted avatar-creator either died (Ready Player Me), demands
   per-visitor accounts (Avaturn), or charges rent (MetaPerson). So the
   wardrobe takes the one thing that can't be rug-pulled: a direct link
   to a .glb. Make yourself anywhere — Blender, VRoid, a scanner, any
   exporter — put the file at a public URL, paste it here. We load it
   before we believe it: only a model that actually parses becomes you. */
function loadAvatarUrl() {
  try { return localStorage.getItem("metro.avatarGlb") || null; } catch (e) { return null; }
}
function saveAvatarUrl(url) {
  try { url ? localStorage.setItem("metro.avatarGlb", url) : localStorage.removeItem("metro.avatarGlb"); } catch (e) {}
}
let wardrobeOpen = false;
function openWardrobe() {
  if (vrBlocked("the wardrobe needs a flat screen")) return;
  if (wardrobeOpen) return;
  wardrobeOpen = true; modalOpen = true; controls.unlock();
  $("#wardrobe-url").value = loadAvatarUrl() || "";
  $("#wardrobe-status").textContent = "";
  show($("#wardrobe"));
  $("#wardrobe-url").focus();
}
function closeWardrobe() {
  if (!wardrobeOpen) return;
  wardrobeOpen = false; modalOpen = false;
  hide($("#wardrobe"));
  if (entered) safeLock();
}
$("#wardrobe-close").addEventListener("click", closeWardrobe);

// adopt a model — but only after it proves it IS one
async function adoptAvatarExport(url) {
  if (!url || typeof url !== "string" || !/^https:\/\//.test(url)) return false;
  const st = $("#wardrobe-status");
  st.textContent = "fetching the model…";
  const gltf = await loadGlbAvatar(url);
  if (!gltf) {
    st.textContent = "couldn't load that — needs a direct, public https link to a .glb file";
    return false;
  }
  saveAvatarUrl(url);
  identity.avatar = url;                      // heartbeats carry it from here on
  presence.updateMeta({ avatar: url });
  toast("that's you now — everyone sees it");
  closeWardrobe();
  return true;
}
$("#wardrobe-set").addEventListener("click", () => adoptAvatarExport($("#wardrobe-url").value.trim()));

// ---- a dropped file: prove it's a model, give it a public address, wear it ----
async function wearFile(file) {
  const st = $("#wardrobe-status");
  if (!file) return false;
  if (!/\.glb$/i.test(file.name) && file.type !== "model/gltf-binary") {
    st.textContent = "that's not a .glb"; return false;
  }
  if (file.size > 16 * 1024 * 1024) {
    st.textContent = "too big — keep it under 16MB (1K textures are plenty in here)"; return false;
  }
  try {
    st.textContent = "checking the model…";
    const buf = await file.arrayBuffer();
    // parse before upload: broken files die here, not on everyone's screen
    await new Promise((ok, no) => new GLTFLoader().parse(buf.slice(0), "", ok, no));
    st.textContent = "hanging it up…";
    const url = await store.uploadAvatar(identity.uid, buf);
    return adoptAvatarExport(url);
  } catch (e) {
    st.textContent = (e && e.message) ? String(e.message).slice(0, 120) : "couldn't read that file";
    return false;
  }
}
{
  const drop = $("#wardrobe-drop");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("armed"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("armed"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault(); drop.classList.remove("armed");
    wearFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
  });
  $("#wardrobe-file").addEventListener("change", (e) => wearFile(e.target.files && e.target.files[0]));
}
$("#wardrobe-url").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); adoptAvatarExport($("#wardrobe-url").value.trim()); }
  e.stopPropagation();                        // typing an URL must not walk you around
});
// worn backwards? one press turns you around (and presses again turn back)
$("#wardrobe-flip").addEventListener("click", () => {
  const cur = loadAvatarUrl();
  if (!cur) { $("#wardrobe-status").textContent = "nothing worn yet — wear a model first"; return; }
  const next = /#flip\b/.test(cur) ? cur.replace(/#flip\b/, "") : cur + "#flip";
  saveAvatarUrl(next);
  identity.avatar = next;
  presence.updateMeta({ avatar: next });
  toast("turned around — ask them if you're facing them now");
});
$("#wardrobe-off").addEventListener("click", () => {
  saveAvatarUrl(null); identity.avatar = null;
  presence.updateMeta({ avatar: null });
  toast("back to blocks");
  closeWardrobe();
});

let pickerOpen = false;
let pickerReturn = null;
function openPicker() {
  if (vrBlocked("the mirror needs a flat screen")) return;
  if (pickerOpen) return;
  pickerOpen = true; modalOpen = true; controls.unlock();
  // pull the camera back to frame the WHOLE mirror (nothing cut off): straight
  // in front of it, centred on its middle, far enough that the full panel fits.
  pickerReturn = { x: controls.pos.x, z: controls.pos.z, yaw: controls.yaw, pitch: controls.pitch };
  const a = world.mirrorAnchor;
  const dist = 1.7, side = 0.3;            // back up to fit the full panel; small shift to clear the left UI
  controls.pos.x = a.x - 0.02 - dist; controls.pos.z = a.z + side;
  camera.position.set(controls.pos.x, a.y, controls.pos.z);
  camera.lookAt(a.x, a.y, a.z);
  controls.yaw = camera.rotation.y; controls.pitch = camera.rotation.x;
  camera.updateMatrixWorld(true);
  openOutfitPicker(outfitSpec, {
    onChange: (s) => mirror.setSpec(s),
    onSave: (s) => {
      outfitSpec = s; saveOutfit(s); mirror.setSpec(s);
      // choosing blocks again also takes the scanned avatar off
      if (identity.avatar) { identity.avatar = null; saveAvatarUrl(null); presence.updateMeta({ avatar: null, outfit: s }); }
      else presence.updateMeta({ outfit: s });
      toast("look saved");
    },
    extra: { label: "✦ use a 3D avatar (.glb link)", onClick: () => openWardrobe() },
    onClose: () => {
      pickerOpen = false; modalOpen = false; mirror.setSpec(outfitSpec);
      if (pickerReturn) { controls.pos.x = pickerReturn.x; controls.pos.z = pickerReturn.z; controls.yaw = pickerReturn.yaw; controls.pitch = pickerReturn.pitch; pickerReturn = null; }
      if (entered) safeLock();
    },
  });
}

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
  screen.resize();                         // keep the CSS3D big-screen layer sized to the window
});

/* ---------------- ui elements ---------------- */
const intro = $("#intro"), paused = $("#paused"), hud = $("#hud");
const composer = $("#composer"), reader = $("#reader");
const aimTip = $("#aim-tip");

let modalOpen = false;
let pendingPlacement = null;
let currentNote = null;       // note shown in reader
let carrying = null;          // {id, home} while re-hanging your own note
let vacuuming = false;        // true while you're holding the vacuum

// pick the vacuum up / stand it back in its corner
function setVacuuming(on) {
  if (on === vacuuming) return;
  vacuuming = on;
  world.grabVacuum(on);
  if (on) { startVacuum(); toast("vacuuming — walk to clean the carpet · " + (IS_TOUCH ? "tap" : "click") + " to put it away"); }
  else { stopVacuum(); toast("vacuum back in the corner"); }
}
let entered = false;
let lastPostAt = 0;
// admin is a hash token now, so it can ride alongside #venue (e.g. #venue,admin
// — the booth host link). matched anywhere in the hash, in any order.
const adminMode = /(^|[#,])admin\b/i.test(location.hash);
// /venue → /#venue : land in the 3D world but walk straight into THE VENUE
// (the standalone flat watch page is gone). honoured once, on first entry.
const venueDeepLink = /(^|[#,])venue\b/i.test(location.hash);
// /studio → /#studio : same idea for the sequencer room, so there's a link
// you can hand a friend instead of teaching them the drum fill
const studioDeepLink = /(^|[#,])studio\b/i.test(location.hash);

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
    if (controls.pooling) leavePool();   // ESC drops you out of the table first
    if (carrying) { cancelCarry(); toast("put it back — re-hang it again when you're ready"); }
    if (vacuuming) setVacuuming(false);
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
  // only NOW do we appear to anyone else — join broadcasts you as a peer, so
  // nobody shows up in the room until they've walked in with a name on
  presence.join(identity, () => controls.pose());
  entered = true;
  startAmbience();
  applyFxStates();                        // restore each stompbox's saved on/off into the new graph
  applyMixLevels();                       // and the mixer's saved channel levels
  applyGuitarFilter();                     // and where the filter treadle was left
  if (roomFlags) applyRoomFlags(roomFlags);   // now that audio's unlocked, tune the radio to the room
  hide(intro);
  hud.classList.add("show");
  xr.showButton();   // quest & friends get a door into headset mode
  safeLock();
  // earned accessories: rebuild what this visitor already owns,
  // celebrate anything new they unlock from here on
  progress.start((acc, isNew) => {
    world.addAccessory(acc.id);
    if (isNew) toast(`🔓 the room grew something: ${acc.title}`);
  });
  // arrived via /venue or /studio — skip the bedroom and land in that room
  if (venueDeepLink) tryClub();
  else if (studioDeepLink) setupStudio();
}
$("#enter-btn").addEventListener("click", enterRoom);
// the door sign: a live shader masked to the hand-drawn letters
startTitleFX($("#title-fx"));
nameInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); enterRoom(); } });
$("#resume-btn").addEventListener("click", () => { hide(paused); safeLock(); });
canvas.addEventListener("click", () => {
  if (entered && !modalOpen && !controls.locked && !IS_TOUCH) safeLock();
});

/* ---------------- aiming / interacting ---------------- */
// while a VR trigger-pull is being dispatched, the "crosshair" is the
// controller's laser instead of the screen centre
let xrAim = null;
const xrAimMat = new THREE.Matrix4();
function castAt(ndcX, ndcY) {
  // an explicit xrAim (the hand that pulled the trigger) wins; otherwise the
  // pointing hand stands in, so aim tips and previews follow your hand too
  const aim = xrAim || (renderer.xr.isPresenting && xrRef ? xrRef.aimController() : null);
  if (aim) {
    xrAimMat.identity().extractRotation(aim.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(aim.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(xrAimMat);
  } else {
    raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
  }
  // doors are included as blockers so notes can't be pinned onto them
  const targets = [cat.hitMesh, toyHit, bartender.hitMesh, guide.hitMesh, mirror.glass, world.pianoMesh, world.pianoVoiceMesh, world.dimmerHit, world.boatExitHit, world.clubExitHit, world.clubWindowHit, ...world.deckHits, world.volcaHit, world.bottleHit, ...world.elevHits, ...world.elevCallHits, world.discHit, world.blindsHit, world.glassHit, ...world.smokeHits, ...world.edrumHits, ...world.guitarHits, ...world.guitarVoiceHits, ...world.arenaExits, ...world.grabHandles, ...world.kiosks, ...world.arcadeHits, world.pool.hit, world.pool.resetHit, world.pool.joinHit, world.pool2.hit, world.pool2.resetHit, world.pool2.joinHit, ...world.dmTargets, ...world.closetHits, ...world.careTargets, ...world.curtainHits, ...world.stompHits, ...world.mixerHits, ...world.radioHits, ...world.laRadioHits, ...world.filterPedalHit, ...world.vacuumHits, ...world.studio.screens, ...world.studio.doorHits, ...notesWall.raycastTargets(), screenMesh, world.gym.joinHit, world.gym.exitHit, ...world.gym.readyHits, ...world.blockers];
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
// how close you must stand to the wall to read or leave anything — kept
// tight so nobody posts (or opens) a note by accident from across the room
const NOTE_REACH = 2.2;
// crosshair and tint it by whether that exact patch is free.
function updateCarry() {
  if (!carrying) return;
  const hit = castWalls(0, 0);
  const place = hit && hit.distance < NOTE_REACH && notesWall.postableFrom(hit, controls.pos)
    ? notesWall.placementFromHit(hit) : null;
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

/* ---- POOL: an in-world 8-ball table you stand at to aim. pool.js runs the
   turn-based game + VRChat-style physics; controls.js feeds it aim rotation +
   the charge button; the game drives the camera while you play. ---- */
const poolSound = {
  click: (hard) => { try { drumHit(hard > 0.5 ? 3 : 4); } catch (e) {} },
  rail: () => { try { drumHit(1); } catch (e) {} },
  pocket: () => { try { discSound("score"); } catch (e) {} },
  strike: () => { try { drumHit(2); } catch (e) {} },
  foul: () => { try { stunBuzz(); } catch (e) {} },
  win: () => { try { goalHorn(); } catch (e) {} },
};
// a small HUD: status line + power bar, shown only while at the table
const poolHudEl = document.createElement("div");
poolHudEl.style.cssText =
  "position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:55;display:none;" +
  "text-align:center;font:700 15px monospace;color:#eaf3ff;text-shadow:0 1px 3px #000;pointer-events:none";
poolHudEl.innerHTML =
  '<div id="pool-status">YOUR SHOT</div>' +
  '<div style="margin:6px auto 0;width:180px;height:9px;border:1px solid #4a6a8a;border-radius:6px;overflow:hidden;background:rgba(0,0,0,.4)">' +
  '<div id="pool-power" style="height:100%;width:0;background:linear-gradient(90deg,#3bd17a,#ffd23c,#e23a52)"></div></div>' +
  '<div id="pool-hint" style="margin-top:5px;font-weight:400;opacity:.8;font-size:12px"></div>';
document.body.appendChild(poolHudEl);
const poolStatusEl = poolHudEl.querySelector("#pool-status");
const poolPowerEl = poolHudEl.querySelector("#pool-power");
const poolHintEl = poolHudEl.querySelector("#pool-hint");
const poolHud = {
  status: (s) => { poolStatusEl.textContent = s; },
  power: (frac, charging) => { poolPowerEl.style.width = Math.round(frac * 100) + "%"; },
  over: (msg) => { poolHintEl.textContent = msg; },
};
// two identical tables share one HUD + one shoot button (you can only stand at
// one at a time). each gets its own net channel so games don't cross-talk.
const poolGame = initPool(world.pool, {
  net: { send: (p) => presence.sendGame(p), myUid: identity.uid },
  sound: poolSound, hud: poolHud, camera,
  youName: identity.name || "YOU",
});
const poolGame2 = initPool(world.pool2, {
  net: { send: (p) => presence.sendGame(p), myUid: identity.uid },
  sound: poolSound, hud: poolHud, camera,
  youName: identity.name || "YOU", gameId: "pool2",
});
let activePool = null;                 // which table you're currently stood at
let poolShootBtn = null;
if (IS_TOUCH) {
  poolShootBtn = document.createElement("button");
  poolShootBtn.textContent = "● SHOOT";
  poolShootBtn.style.cssText =
    "position:fixed;right:18px;bottom:88px;z-index:60;display:none;width:104px;height:104px;border:0;" +
    "border-radius:52px;font:800 16px monospace;background:#2a6fb0;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.45)";
  const press = (v) => (e) => { e.preventDefault(); controls.poolCharging = v; };
  poolShootBtn.addEventListener("pointerdown", press(true));
  poolShootBtn.addEventListener("pointerup", press(false));
  poolShootBtn.addEventListener("pointercancel", press(false));
  document.body.appendChild(poolShootBtn);
}
function sitAtPool(game) {
  if (controls.pooling && activePool && activePool !== game) leavePool();
  activePool = game;
  game.setName(identity.name || "YOU");
  const end = game.nearestEnd(controls.pos.x);
  controls.enterPool();
  game.dock(end);
  hideFlightStrip();                 // no LAX banners while you're shooting
  poolHudEl.style.display = "block";
  if (poolShootBtn) poolShootBtn.style.display = "block";
  toast(IS_TOUCH ? "drag to aim · hold SHOOT for power" : "move mouse to aim · hold click for power, release to shoot");
}
function leavePool() {
  if (!controls.pooling) return;
  if (activePool) activePool.undock();
  activePool = null;
  controls.exitPool();
  poolHudEl.style.display = "none";
  if (poolShootBtn) poolShootBtn.style.display = "none";
}

/* ---- BASKETBALL: free-roam shoot-around on the lil court (south wall).
   Not a game — walk onto the court and you've always got a ball; HOLD to
   wind up, release to shoot where you're facing. basketball.js runs the
   throw + the projectile sim; the camera stays your own (no lock). ---- */
const basketSound = {
  shoot: () => { try { drumHit(2); } catch (e) {} },
  score: (clean) => { try { discSound("score"); if (clean) discSound("score"); } catch (e) {} },
  rim: () => { try { drumHit(4); } catch (e) {} },
  bank: () => { try { drumHit(3); } catch (e) {} },
  bounce: () => { try { drumHit(1); } catch (e) {} },
};
// a slim power bar at the bottom, shown only while you're winding up a shot
const bbPowerWrap = document.createElement("div");
bbPowerWrap.style.cssText =
  "position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:55;display:none;" +
  "width:200px;height:11px;border:1px solid #8a5a3a;border-radius:7px;overflow:hidden;background:rgba(0,0,0,.45)";
// fill = the ping-ponging power; band = the snap window for where you stand;
// opt line = the perfect-swish release point (the same active-reload marker
// THE GYM uses, because it's the same shot)
bbPowerWrap.innerHTML =
  '<div id="bb-power" style="position:absolute;left:0;top:0;height:100%;width:0;background:linear-gradient(90deg,#3bd17a,#ffd23c,#e23a52)"></div>' +
  '<div id="bb-power-band" style="position:absolute;top:0;bottom:0;background:rgba(180,255,210,.4);display:none"></div>' +
  '<div id="bb-power-opt" style="position:absolute;top:0;bottom:0;width:3px;margin-left:-1px;background:#eafff2;box-shadow:0 0 7px 1px #6bffb0;display:none"></div>';
document.body.appendChild(bbPowerWrap);
const bbPowerEl = bbPowerWrap.querySelector("#bb-power");
const bbPowerBand = bbPowerWrap.querySelector("#bb-power-band");
const bbPowerOpt = bbPowerWrap.querySelector("#bb-power-opt");
const basketHud = {
  power: (frac, opt) => {
    if (frac <= 0) { bbPowerWrap.style.display = "none"; return; }
    bbPowerWrap.style.display = "block";
    bbPowerEl.style.width = Math.round(frac * 100) + "%";
    if (opt) {
      bbPowerOpt.style.display = "block";
      bbPowerOpt.style.left = (opt.opt * 100) + "%";
      bbPowerOpt.style.background = opt.makeable ? "#eafff2" : "#ffd27a";
      bbPowerOpt.style.boxShadow = opt.makeable ? "0 0 7px 1px #6bffb0" : "0 0 7px 1px #e0a050";
      if (opt.makeable && opt.hi > opt.lo) {
        bbPowerBand.style.display = "block";
        bbPowerBand.style.left = (opt.lo * 100) + "%";
        bbPowerBand.style.width = ((opt.hi - opt.lo) * 100) + "%";
      } else bbPowerBand.style.display = "none";
    } else { bbPowerOpt.style.display = "none"; bbPowerBand.style.display = "none"; }
  },
};
// the wall board under the rim: your run, your name, and the record. it's
// shared, so anyone else on the court watches your streak climb in real time.
let hoopBest = 0;
try { hoopBest = parseInt(localStorage.getItem("metro.hoopBest") || "0", 10) || 0; } catch (e) {}
let hoopBestName = "";
try { hoopBestName = localStorage.getItem("metro.hoopBestName") || ""; } catch (e) {}
// NBA JAM rules: the fifth in a row lights you, and everything after feeds it
const hoopFire = bedroomSound((streak) => {
  const at = world.hoops.fireAt;
  if (streak === at) fireSound("catch");
  else if (streak > at) fireSound("make", (streak - at) / 8);
});
function showStreak(name, streak, swish) {
  if (streak > hoopBest) {
    hoopBest = streak; hoopBestName = name;
    try { localStorage.setItem("metro.hoopBest", String(hoopBest)); localStorage.setItem("metro.hoopBestName", name); } catch (e) {}
  }
  world.hoops.setStreak({ name, streak, swish, best: hoopBest, bestName: hoopBestName });
}
const hoopGame = initBasket(world.hoops, {
  sound: basketSound, hud: basketHud,
  setAimLock: (pt) => { controls.aimLockTarget = pt; },   // ease the camera onto the backboard while winding up
  onBucket: ({ swish, streak }) => {
    const me = (identity.name || "anon").slice(0, 24);
    showStreak(me, streak, swish);
    hoopFire(streak);
    presence.sendAct({ kind: "hoop", name: me, streak, swish });
    if (streak === world.hoops.fireAt) toast("🔥 YOU'RE ON FIRE 🔥");
    else if (streak > world.hoops.fireAt) toast(`${streak} IN A ROW — STILL BURNING 🔥`);
    else if (streak >= 3) toast(`${streak} IN A ROW`);
    else toast(swish ? "SWISH! 🏀" : "bucket 🏀");
  },
  onMiss: () => {
    const me = (identity.name || "anon").slice(0, 24);
    showStreak(me, 0, false);
    presence.sendAct({ kind: "hoop", name: me, streak: 0 });
  },
});
// once you walk onto the court a one-time hint nudges how to shoot
let hoopHinted = false;
// mobile: a SHOOT button (canvas drag stays look-only) — hold to wind up,
// shown only while you're on the court
let hoopShootBtn = null;
if (IS_TOUCH) {
  hoopShootBtn = document.createElement("button");
  hoopShootBtn.textContent = "🏀";
  hoopShootBtn.style.cssText =
    "position:fixed;right:18px;bottom:88px;z-index:60;display:none;width:104px;height:104px;border:0;" +
    "border-radius:52px;font:800 34px monospace;background:#d4631f;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.45)";
  const press = (v) => (e) => { e.preventDefault(); controls.pointerDown = v; };
  hoopShootBtn.addEventListener("pointerdown", press(true));
  hoopShootBtn.addEventListener("pointerup", press(false));
  hoopShootBtn.addEventListener("pointercancel", press(false));
  document.body.appendChild(hoopShootBtn);
}

let lastPetAt = 0;
controls.onAction((ndcX, ndcY) => {
  if (controls.pooling || controls.aiming) return;   // at the table/board the mouse aims; clicks charge
  if (hoopGame.wantsPointer()) return;               // on the court a press is a shot, not an interaction
  if (modalOpen) return;
  if (layoutMode) { layoutClick(); return; }   // in layout mode a click only grabs/drops props
  if (carrying) { dropCarried(); return; }   // a click while carrying sets it down
  if (vacuuming) { setVacuuming(false); return; }   // a click while vacuuming puts it away
  if (toy && toy.phase === "held") { throwToy(); return; }   // a click while holding the toy throws it
  if (inGym) {
    // on the court a click grabs a loose ball / strips the holder; the only
    // other thing worth clicking is the EXIT panel
    const h = castAt(ndcX, ndcY);
    if (h && h.object.userData.gymExit && h.distance < 4) { leaveGym(); return; }
    // tap the READY board on the wall to ready up for tip-off (aim + click from
    // anywhere on the court — it's a deliberate look at the sign)
    if (h && h.object.userData.gymReady && !gymLive) { toggleReady(); return; }
    gymBall.click();
    return;
  }
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
  if (hit.object.userData.mirror && hit.distance < 3.5) {
    aItem("mirror");
    openPicker();
  } else if (hit.object.userData.bartender && hit.distance < 3.2) {
    aItem("bartender");
    const line = bartender.serve();
    toast(`🍸 ${line}`);
  } else if (hit.object.userData.guide && hit.distance < 3.2) {
    aItem("guide");
    // clicking while she's mid-sentence cuts her off — you asked for the next
    // thing, so she stops talking about the last one
    if (isSpeaking()) stopSpeaking();
    const l = guideNextLine();
    guide.speak(l.text, l.clip);
  } else if (hit.object.userData.cat && hit.distance < 2.2) {
    if (Date.now() - lastPetAt < 1200) return;
    lastPetAt = Date.now();
    // belly-up? that's an invitation for a tummy rub, not an ordinary pet
    if (cat.state === "belly") {
      const r = cat.rubTummy();
      aItem("cat");
      if (r === "kick") gotScratched();   // hiss + shake — the overstimulated bunny-kick
      else { presence.sendAct({ kind: "pet" }); toast("😻 belly rubs — pure bliss"); }
      return;
    }
    const outcome = cat.petOutcome();   // 'love' | 'meh' — petting never scratches
    presence.sendAct({ kind: "pet" });
    if (outcome === "love") { store.logEvent("pet"); progress.bump("pets"); }
    aItem("cat");
    wrapCare("pet").then(res => {
      if (res && outcome === "love") {
        toast(`purrrr — this cat has been petted ${res.pets} time${res.pets === 1 ? "" : "s"}`);
        applyCatState(res);
      }
    }).catch(() => {});
  } else if (hit.object.userData.toy && toy.phase === "rest" && !toy.claimed && hit.distance < 2.6) {
    grabToy();
    aItem("toy");
  } else if (hit.object.userData.mixDoor && hit.distance < 3) {
    if (vrBlocked("that door leaves the room — step out of VR first")) return;
    // the bedroom door leads out to the mix & master site — walk through it.
    // absolute URL: the site lives on the production domain, and a relative
    // path 404s when you're walking the room off localhost
    toast("through the door…");
    fadeTo(() => { location.href = "https://whoisthemetro.com/mixandmaster/"; });
  } else if (hit.object.userData.closet && hit.distance < 3) {
    const open = world.toggleCloset();
    presence.sendAct({ kind: "closet", open });
    store.saveRoomFlag("closet", open).catch(() => {});
    toast(open ? "the closet creaks open…" : "closet closed");
  } else if (hit.object.userData.poolJoin && hit.distance < 4.8) {
    sitAtPool(poolGame);
  } else if (hit.object.userData.poolReset && hit.distance < 4.8) {
    poolGame.reset();
    sitAtPool(poolGame);
    toast("fresh rack — break 'em");
  } else if (hit.object.userData.pool && hit.distance < 3.0) {
    sitAtPool(poolGame);
  } else if (hit.object.userData.pool2Join && hit.distance < 4.8) {
    sitAtPool(poolGame2);
  } else if (hit.object.userData.pool2Reset && hit.distance < 4.8) {
    poolGame2.reset();
    sitAtPool(poolGame2);
    toast("fresh rack — break 'em");
  } else if (hit.object.userData.pool2 && hit.distance < 3.0) {
    sitAtPool(poolGame2);
  } else if (hit.object.userData.arcade && hit.distance < 3.2) {
    modalOpen = true;
    controls.unlock();
    store.logEvent("arcade_" + hit.object.userData.arcade);
    progress.bump("arcade");
    aArcadeGame = hit.object.userData.arcade; aArcadeStart = performance.now();
    track("arcade_game_opened", { game: aArcadeGame }); aEngage();
    openArcade(hit.object.userData.arcade, {
      send: (p) => presence.sendGame(p),
      myUid: identity.uid,
    });
    // in a headset the overlay is invisible — the game plays on a panel
    // floating in the room instead, and the controllers are the cabinet
    if (inVR()) {
      openVrArcadePanel();
      xrRef.note("stick moves · A fires · trigger starts · GRIP walks away");
    }
  } else if (hit.object.userData.arcadeSoon && hit.distance < 3.2) {
    toast(`${hit.object.userData.arcadeSoon} — cabinet's dark. coming soon.`);
  } else if (inStudio && hit.object.userData.kind && hit.uv && hit.distance < 5.5) {
    const k = hit.object.userData.kind;
    applyStudioHit(k, sHitPanel(k, hit.uv.x, hit.uv.y));
  } else if (inStudio && hit.object.userData.exit && hit.distance < 5.5) {
    toast("back through the door…");
    goHome();
  } else if (hit.object.userData.dm && hit.distance < 3) {
    openPC();
  } else if (hit.object.userData.piano && hit.distance < 2.4 && hit.uv) {
    const key = Math.max(0, Math.min(14, Math.floor(hit.uv.x * 15)));
    pianoNote(key, pianoVoice);
    world.pressPianoKey(key);
    presence.sendNote(key, pianoVoice);
    progress.bump("piano");
    aInstrument("piano");
    if (Date.now() - (window.__pianoLogAt || 0) > 60000) {
      window.__pianoLogAt = Date.now();
      store.logEvent("piano");
    }
  } else if (hit.object.userData.dimmer && hit.distance < 2.6) {
    aItem("dimmer");
    if (inVR()) vrCycleDimmer(); else openDimmer();
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
    // a hit that lands inside the secret fill flashes gold, not cyan —
    // the kit quietly confirming you're on the trail
    world.pressEdrum(pad, studioFill(pad) ? 0.11 : undefined);
    presence.sendAct({ kind: "edrum", pad });
    aInstrument("drums");
  } else if (hit.object.userData.guitar && hit.distance < 2.4) {
    // higher on the neck, higher the note
    const n = Math.max(0, Math.min(10, Math.round((hit.point.y - 0.25) * 12)));
    guitarPluck(n, guitarVoice);
    world.strumTele();
    presence.sendAct({ kind: "guitar", n, voice: guitarVoice });
    aInstrument("guitar");
  } else if (hit.object.userData.guitarVoice && hit.distance < 2.4) {
    guitarVoice = (guitarVoice + 1) % GUITAR_VOICES.length;
    try { localStorage.setItem("metro.gvoice", String(guitarVoice)); } catch (e) {}
    world.setGuitarVoiceSwitch(guitarVoice, GUITAR_VOICES.length);
    // flick the switch — no preview note (the blade shouldn't sound a fret)
    toast(`guitar voice: ${GUITAR_VOICES[guitarVoice].name}`);
  } else if (hit.object.userData.gymJoin && hit.distance < 4) {
    joinGym();
  } else if (hit.object.userData.boatExit && hit.distance < 2.6) {
    leaveBoat();
  } else if (hit.object.userData.clubExit && hit.distance < 2.6) {
    leaveClub();
  } else if (hit.object.userData.screenTap && inClub && hit.distance < 12) {
    const m = screen.toggleMuted();        // click the wall to mute/unmute the venue's sound
    if (screen.has()) toast(m ? "🔇 screen muted" : "🔊 screen sound on");
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
  } else if (hit.object.userData.elevCall && hit.distance < 3.4) {
    callElevator();
  } else if (hit.object.userData.elevFloor && hit.distance < 3.2) {
    rideElevator(hit.object.userData.elevFloor);
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
    // just switch the voice — no preview note (clicking the body shouldn't play)
    toast(`piano voice: ${PIANO_VOICES[pianoVoice].name}`);
  } else if (hit.object.userData.stomp && hit.distance < 2.8) {
    // click a pedal to toggle its effect — bypassed pedals dim their LED
    const id = hit.object.userData.stomp;
    fxOn[id] = !fxOn[id];
    try { localStorage.setItem("metro.fx." + id, fxOn[id] ? "1" : "0"); } catch (e) {}
    setFx(id, fxOn[id]);
    world.setStompLED(id, fxOn[id]);
    toast(`${FX_LABEL[id] || "pedal"} ${fxOn[id] ? "on" : "off"}`);
  } else if (hit.object.userData.mixer && hit.distance < 2.8) {
    openMixer();
  } else if (hit.object.userData.radio && hit.distance < 2.8) {
    if (inVR()) vrToggleRadio(radios.sr); else openRadio(radios.sr);
  } else if (hit.object.userData.laradio && hit.distance < 2.8) {
    if (inVR()) vrToggleRadio(radios.la); else openRadio(radios.la);
  } else if (hit.object.userData.gtrFilter && hit.distance < 2.8) {
    openFilter();
  } else if (hit.object.userData.vacuum && hit.distance < 2.6) {
    setVacuuming(true);
  } else if (hit.object.userData.lava && hit.distance < 2.4) {
    const on = world.toggleLava();
    presence.sendAct({ kind: "lava", on });               // the lamp is the room's, not yours
    store.saveRoomFlag("lava", on).catch(() => {});
    toast(on ? "the wax wakes up 🌋" : "lava lamp off");
  } else if (hit.object.userData.blinds && hit.distance < 3.2) {
    const open = world.toggleBlinds();
    presence.sendAct({ kind: "blinds", open });
    store.saveRoomFlag("blinds", open).catch(() => {});
    toast(open ? "blinds gathered — there's the city" : "blinds drawn across the glass");
  } else if (hit.object.userData.curtain && hit.distance < 3.2) {
    const closed = world.toggleCurtains();
    store.logEvent("curtains");
    presence.sendAct({ kind: "curtains", closed });
    store.saveRoomFlag("curtains", closed).catch(() => {});
    toast(closed ? "curtains drawn — it's just you and the glow now" : "curtains open");
  } else if (hit.object.userData.glass && hit.uv) {
    // the plane hunt: a jet on the glass is fair game
    const shot = world.shootAtGlass(hit.uv.x, hit.uv.y);
    if (shot) {
      shotSound();
      if (shot === "hit") {
        setTimeout(() => { if (!inBoat && !inArena && !inClub && !inStudio) citySound("boom"); }, 300);
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
  } else if (hit.object.userData.note && hit.distance < NOTE_REACH) {
    openReader(hit.object.userData.note);
  } else if (hit.object.userData.postable && hit.distance < NOTE_REACH && notesWall.postableFrom(hit, controls.pos)) {
    const place = notesWall.placementFromHit(hit);
    if (place) openComposer(place);
  }
});

// what would a tap/click do right now? (crosshair hint, desktop AND mobile)
const TAP = IS_TOUCH ? "tap" : "click";
// the DOM tip is invisible in a session — mirror it onto the in-world HUD
setInterval(() => {
  if (!inVR()) return;
  xrRef.tip(aimTip.classList.contains("show") ? aimTip.textContent : "");
}, 150);
setInterval(() => {
  // pointer lock never applies in a headset: the laser IS the crosshair
  if ((!controls.locked && !inVR()) || modalOpen) { aimTip.classList.remove("show"); return; }
  if (carrying) {
    aimTip.textContent = carrying.place
      ? `${TAP} to set it down here`
      : "find some bare wall…";
    aimTip.classList.add("show");
    return;
  }
  if (vacuuming) {
    aimTip.textContent = `walk to clean the carpet · ${TAP} to put it away`;
    aimTip.classList.add("show");
    return;
  }
  if (toy && toy.phase === "held") {
    aimTip.textContent = `${TAP} to throw the toy for the cat`;
    aimTip.classList.add("show");
    return;
  }
  const hit = castAt(0, 0);
  if (hit && hit.object.userData.vacuum && hit.distance < 2.6) {
    aimTip.textContent = `${TAP} to grab the vacuum`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.mirror && hit.distance < 3.5) {
    aimTip.textContent = `${TAP} — change your look`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.bartender && hit.distance < 3.2) {
    aimTip.textContent = `${TAP} — order a drink`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.guide && hit.distance < 3.2) {
    aimTip.textContent = !guideMet ? `${TAP} — ask Trinity` : `${TAP} — tell me another`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.cat && hit.distance < 2.2) {
    const d = store.decayCat(catState);
    aimTip.textContent = `${TAP} to pet · fed ${Math.round(d.fed * 100)}%`;   // you're looking right at the cat — no need to say so
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.toy && toy.phase === "rest" && !toy.claimed && hit.distance < 2.6) {
    aimTip.textContent = `${TAP} to pick up the toy`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.mixDoor && hit.distance < 3) {
    aimTip.textContent = `${TAP} — step out · MIX & MASTER`;
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
  } else if (inStudio && hit && hit.object.userData.kind && hit.distance < 5.5) {
    aimTip.textContent = `${TAP} — play the machine`;
    aimTip.classList.add("show");
  } else if (inStudio && hit && hit.object.userData.exit && hit.distance < 5.5) {
    aimTip.textContent = `${TAP} — back to the bedroom`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.dm && hit.distance < 3) {
    aimTip.textContent = `${TAP} — the computer · METRO OS`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.piano && hit.distance < 2.4) {
    aimTip.textContent = `${TAP} the keys to play`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.pianoVoice && hit.distance < 2.4) {
    aimTip.textContent = `${TAP} to change the piano sound (${PIANO_VOICES[pianoVoice].name})`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.stomp && hit.distance < 2.8) {
    const id = hit.object.userData.stomp;
    aimTip.textContent = `${TAP} to ${fxOn[id] ? "bypass" : "switch on"} the ${FX_LABEL[id] || "pedal"}`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.radio && hit.distance < 2.8) {
    aimTip.textContent = `${TAP} — the radio · scan the Swedish stations`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.laradio && hit.distance < 2.8) {
    aimTip.textContent = `${TAP} — the radio · scan LA stations`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.mixer && hit.distance < 2.8) {
    aimTip.textContent = `${TAP} — the channel mixer (keys · guitar · drums)`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.gtrFilter && hit.distance < 2.8) {
    aimTip.textContent = `${TAP} — the guitar filter (drag it down to sweep the tone off)`;
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
  } else if (hit && hit.object.userData.elevCall && hit.distance < 3.4) {
    aimTip.textContent = world.elevatorOpen() ? `${TAP} — step in, pick a floor` : `${TAP} — call the elevator`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.elevFloor && hit.distance < 3.2) {
    aimTip.textContent = `${TAP} — ${hit.object.userData.elevLabel}`;
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
  } else if (hit && hit.object.userData.guitarVoice && hit.distance < 2.4) {
    aimTip.textContent = `${TAP} to flick the guitar voice (${GUITAR_VOICES[guitarVoice].name})`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.boatExit && hit.distance < 2.6) {
    aimTip.textContent = `${TAP} to go back to the room`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.clubExit && hit.distance < 2.6) {
    aimTip.textContent = `${TAP} — out into the night, back home`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.screenTap && inClub && hit.distance < 12) {
    aimTip.textContent = !screen.has() ? "the big screen is dark"
      : screen.isMuted() ? `${TAP} — turn the sound on` : `${TAP} — mute the screen`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.decks && hit.distance < 2.6) {
    aimTip.textContent = adminMode ? `${TAP} — booth controls`
      : voice.djLive() ? `${TAP} — end the set`
      : canDJ() ? `${TAP} — pick a source, go live`
      : deckLockedMsg();
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.clubWindow && hit.distance < 12) {
    aimTip.textContent = canDJ() ? `${TAP} — fireworks over the city · G changes the view`
      : `press G to change the view — now: ${world.clubThemeName()}`;
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
  } else if (hit && hit.object.userData.note && hit.distance < NOTE_REACH) {
    aimTip.textContent = `${TAP} to read`;
    aimTip.classList.add("show");
  } else if (hit && hit.object.userData.postable && hit.distance < NOTE_REACH && notesWall.postableFrom(hit, controls.pos)) {
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
  if (vrBlocked("leaving a note needs a flat screen")) return;
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
    track("note_left", { room: aRoomNow(), kind: saved.kind });   // analytics
    aEngage();
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
  if (vrBlocked("reading a note needs a flat screen")) return;
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

/* ---------------- the channel mixer on the desk ---------------- */
// a modal like the dimmer (pointer unlocks so the faders work): three sliders
// riding the keys / guitar / drums buses. all client-side + sticky.
const mixerUI = $("#mixer-ui");
function setMixChannel(id, pct, save) {
  mixLevel[id] = Math.min(Math.max(pct, 0), 150);
  setBusLevel(id, mixLevel[id]);
  world.setMixFader(id, mixLevel[id]);
  const val = $("#mix-val-" + id);
  if (val) val.textContent = Math.round(mixLevel[id]) + "%";
  if (save) { try { localStorage.setItem("metro.mix." + id, String(Math.round(mixLevel[id]))); } catch (e) {} }
}
function openMixer() {
  if (vrBlocked("the mixer needs a flat screen")) return;
  modalOpen = true;
  controls.unlock();
  for (const id of MIX_IDS) {
    const sl = $("#mix-" + id);
    if (sl) sl.value = Math.round(mixLevel[id]);
    setMixChannel(id, mixLevel[id], false);   // refresh the readouts
  }
  show(mixerUI);
}
function closeMixer() {
  hide(mixerUI);
  modalOpen = false;
  if (entered) safeLock();
}
$("#mixer-close").addEventListener("click", closeMixer);
for (const id of MIX_IDS) {
  const sl = $("#mix-" + id);
  if (sl) sl.addEventListener("input", (e) => setMixChannel(id, +e.target.value, true));
}

/* ---------------- the radios (scan through live broadcast) ----------------
   two of them, one shared faceplate overlay. Desi's cabin runs Swedish, the
   bedroom rack runs LA — each is its own radio.js instance with its own dial,
   prop, and room gate. `radios` bundles each instance with the world hooks that
   light ITS prop and the room test that decides when it's audible. --- */
const radioUI = $("#radio-ui");
const STATE_LABEL = { off: "off air", tuning: "tuning…", live: "on air", error: "no signal" };
const radios = {};   // filled below once createRadio exists
let activeRadio = null;   // whichever one the open overlay is driving

// paint the open overlay from a radio's current state
function refreshOverlay(info) {
  const s = info.station;
  const hz = $("#radio-hz"), nm = $("#radio-name"), tg = $("#radio-tag"), st = $("#radio-state"), dial = $("#radio-dial");
  if (hz) hz.textContent = s.hz;
  if (nm) nm.textContent = s.name;
  if (tg) tg.textContent = s.tag;
  if (dial && +dial.value !== info.idx) dial.value = info.idx;
  if (st) {
    st.textContent = STATE_LABEL[info.state] || "";
    st.className = "radio-state" + (info.on && info.state !== "off" ? " " + info.state : "");
  }
  const pw = $("#radio-power");
  if (pw) pw.classList.toggle("on", info.on);
}
// keep the prop in lockstep always, and the overlay too when this radio is the
// open one. fires on every change — button, dial, or a stream event.
function makeRadioStatus(key) {
  return (info) => {
    const r = radios[key];
    r.setNeedle(info.total > 1 ? info.idx / (info.total - 1) : 0);
    r.setPower(info.on);
    if (activeRadio === r) refreshOverlay(info);
  };
}

radios.sr = {
  radio: createRadio({ stations: SR_STATIONS, storeKey: "metro.radio.sr", onStatus: makeRadioStatus("sr") }),
  setNeedle: world.setRadioNeedle, setPower: world.setRadioPower, pos: world.radioPos,
  audible: () => inBoat,
  which: "sr", shared: { on: false, idx: 0, at: 0 },   // the room's current dial, last-event-wins
};
radios.la = {
  radio: createRadio({ stations: LA_STATIONS, storeKey: "metro.radio.la", onStatus: makeRadioStatus("la") }),
  setNeedle: world.setLaRadioNeedle, setPower: world.setLaRadioPower, pos: world.laRadioPos,
  audible: () => !inBoat && !inArena && !inClub,
  which: "la", shared: { on: false, idx: 0, at: 0 },
};

// the radio is a SHARED object: changing its station or power tells the whole
// room (presence "radio" act), so everyone hears the same thing. ordered by a
// logical clock so a skewed wall-clock can't lock anyone out. volume is the one
// thing that stays personal to each listener.
let radioClock = 0;
const radioSaveTimers = {};
function broadcastRadio(desc) {
  radioClock += 1;
  const i = desc.radio.info();
  desc.shared = { on: i.on, idx: i.idx, at: radioClock };
  presence.sendAct({ kind: "radio", which: desc.which, on: i.on, idx: i.idx, at: radioClock });
  // persist too (debounced — a scan-through shouldn't hammer the DB), so the
  // room's dial survives a reload, not just a live session
  clearTimeout(radioSaveTimers[desc.which]);
  radioSaveTimers[desc.which] = setTimeout(() => {
    store.saveRoomFlag("radio_" + desc.which, { on: desc.shared.on, idx: desc.shared.idx }).catch(() => {});
  }, 1000);
}

// the room comes back the way it was left. visual toggles apply anytime (and
// re-apply on realtime updates as a backstop to the live presence acts); the
// radio only adopts persisted state on cold entry — its writes are debounced,
// so re-applying them on a realtime tick could stomp a newer live scan, and the
// presence "radio" acts (Lamport-ordered) own live sync.
let roomFlags = null;
// the shared carpet: skip a restore if the snapshot hasn't changed (this also
// swallows the realtime echo of our OWN save — same string back is a no-op)
let lastGrimeStr = null;
function applyGrime(str) {
  if (typeof str !== "string" || str === lastGrimeStr) return;
  lastGrimeStr = str;
  world.grimeRestore(str);
}
function applyRoomFlags(f, withRadio = true) {
  if (!f) return;
  // the admin's saved furniture arrangement — everyone gets the same room.
  // skipped while YOU are mid-edit so a stale echo can't yank the prop back.
  if (f.layout && !layoutMode) world.applyLayout(f.layout);
  if (typeof f.blinds === "boolean") world.setBlinds(f.blinds);
  if (typeof f.curtains === "boolean") world.setCurtains(f.curtains);
  if (typeof f.closet === "boolean") world.setCloset(f.closet);
  if (typeof f.lava === "boolean") world.setLava(f.lava);
  applyGrime(f.grime);   // accumulated dirt + vacuumed lanes, shared across visitors
  if (withRadio && entered) for (const which of ["sr", "la"]) {
    const rs = f["radio_" + which];
    if (rs && typeof rs.idx === "number") {
      radios[which].shared = { on: !!rs.on, idx: rs.idx | 0, at: radios[which].shared.at };
      radios[which].radio.applyRemote(!!rs.on, rs.idx | 0);
    }
  }
}

// in a headset the radio and the dimmer are physical things: a click is the
// power knob / the next brightness step, not an overlay you can't see
// one button, the whole dial: off → first station → next → … → last → off,
// so a headset can work the radio without the station overlay
function vrToggleRadio(r) {
  const before = r.radio.info();
  if (!before.on) r.radio.power(true);
  else if (before.idx >= before.total - 1) r.radio.power(false);
  else r.radio.scan(1);
  broadcastRadio(r);
  const now = r.radio.info();
  const name = now.station && (now.station.name || now.station.label);
  xrRef.note(now.on ? `📻 ${name || "station " + (now.idx + 1)}` : "radio off");
}
function vrCycleDimmer() {
  dimLevel = dimLevel >= 0.99 ? 0 : Math.min(1, Math.round((dimLevel + 0.34) * 100) / 100);
  applyDimmer(true);
  xrRef.note(`lights ${Math.round(dimLevel * 100)}%`);
}
function openRadio(r) {
  activeRadio = r;
  modalOpen = true;
  controls.unlock();
  const info = r.radio.info();
  const dial = $("#radio-dial");
  if (dial) dial.max = String(info.total - 1);
  const vol = $("#radio-vol");
  if (vol) vol.value = Math.round(info.vol * 100);
  refreshOverlay(info);
  show(radioUI);
}
function closeRadio() {
  hide(radioUI);
  activeRadio = null;
  modalOpen = false;
  if (entered) safeLock();
}
$("#radio-close").addEventListener("click", closeRadio);
$("#radio-power").addEventListener("click", () => { if (activeRadio) { activeRadio.radio.toggle(); broadcastRadio(activeRadio); } });
$("#radio-prev").addEventListener("click", () => { if (activeRadio) { activeRadio.radio.scan(-1); broadcastRadio(activeRadio); } });
$("#radio-next").addEventListener("click", () => { if (activeRadio) { activeRadio.radio.scan(1); broadcastRadio(activeRadio); } });
$("#radio-dial").addEventListener("input", (e) => { if (activeRadio) { activeRadio.radio.tune(+e.target.value); broadcastRadio(activeRadio); } });
$("#radio-vol").addEventListener("input", (e) => { if (activeRadio) activeRadio.radio.volume(+e.target.value / 100); });   // volume is personal
radios.sr.radio.init();
radios.la.radio.init();

/* ---------------- the guitar filter treadle ---------------- */
// a modal like the mixer (pointer unlocks so the slider drags): one vertical
// fader sweeping the front-of-chain lowpass. client-side + sticky.
const filterUI = $("#filter-ui");
function setFilterLevel(pct, save) {
  gtrFilterLevel = Math.min(Math.max(pct, 0), 1);
  setGuitarFilter(gtrFilterLevel);
  world.setGuitarPedalTilt(gtrFilterLevel);
  const val = $("#filter-val");
  if (val) val.textContent = gtrFilterLevel > 0.985 ? "open" : Math.round(100 * Math.pow(200, gtrFilterLevel)) + " Hz";
  if (save) { try { localStorage.setItem("metro.gtrfilter", gtrFilterLevel.toFixed(3)); } catch (e) {} }
}
function openFilter() {
  if (vrBlocked("the filter pedal needs a flat screen")) return;
  modalOpen = true;
  controls.unlock();
  const sl = $("#filter-slider");
  if (sl) sl.value = Math.round(gtrFilterLevel * 100);
  setFilterLevel(gtrFilterLevel, false);   // refresh the readout
  show(filterUI);
}
function closeFilter() {
  hide(filterUI);
  modalOpen = false;
  if (entered) safeLock();
}
$("#filter-close").addEventListener("click", closeFilter);
$("#filter-slider").addEventListener("input", (e) => setFilterLevel(+e.target.value / 100, true));

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
  if (vrBlocked("chat needs a flat screen")) return;
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
let inStudio = false;
let studioPersistNow = () => {};   // bound once the engine boots
let studioBooted = false;

/* --- THE STUDIO ---
   the sequencer room is a space in this world now, not another web page.
   its engine (transport, audio, net) boots the first time you walk in and
   then keeps running; the audio is gated so it goes quiet behind you. */
async function bootStudio() {
  if (studioBooted) return;
  studioBooted = true;
  const sUid = identity.uid + "." + Math.random().toString(36).slice(2, 7);
  SA.initAudio();                       // rides the click that got us here
  // wake the mutable pair (plaits + clouds, wasm) and push the room's
  // current knob positions once the worklets are actually listening
  SA.initMI().then(() => sApplyMixer()).catch(() => {});
  SA.loadPerc();                        // 77 dumbek one-shots, pulled in the background
  sBind({
    uid: sUid,
    onLocalEdit: (id, data) => { sNet.pushPatch(id, data); scheduleStudioSave(); },
    onStateChange: (id) => {
      world.studio.markDirty(id);
      // synth included: the plaits knobs ride applyMixer to the worklet
      if (id !== "drums") sApplyMixer();
    },
  });
  let adopted = false;

  /* ---- the room remembers: the last state anyone left is the state the
     next person finds. A live peer's snapshot always wins (it's newer by
     definition); the database is for walking into an empty room. Saves are
     debounced, and only the lowest uid present writes — one scribe, no
     stampede of identical rows. ---- */
  let saveTimer = null;
  const persistStudio = () => {
    if (!adopted) return;                      // never save a state we haven't joined
    const uids = [sUid, ...sNet.peers().keys()].sort();
    if (uids[0] !== sUid) return;              // someone else is the scribe
    store.saveRoomFlag("studio", sSnap()).catch(() => {});
  };
  const scheduleStudioSave = () => {
    if (!adopted) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistStudio, 2500);
  };
  addEventListener("beforeunload", persistStudio);
  studioPersistNow = persistStudio;            // leaveStudio flushes through this

  sNet.onPatch((id, data) => { if (sMerge(id, data)) scheduleStudioSave(); });
  sNet.onWant((uid) => sNet.sendSnapshot(uid, sSnap()));
  sNet.onSnapshot((snap) => {
    if (adopted) return;                // first answer wins; the rest are echoes
    adopted = true;
    sAdopt(snap); sApplyMixer();
    world.studio.markDirty("*");
    toast("joined the session in progress");
  });
  sApplyMixer();
  sStartScheduler();
  try { await sClock.start(); } catch (e) {}
  try {
    // poses go out in the studio's own local coordinates so anyone on the
    // old standalone page still sees people standing in the right place
    await sNet.join({ ...identity, uid: sUid }, () => ({
      x: controls.pos.x - world.STUDIO.x, y: 0,
      z: controls.pos.z - world.STUDIO.z, yaw: controls.yaw,
    }));
  } catch (e) {}
  // nobody answered — the room is empty. before starting from silence, ask
  // the database what was playing when the last person left.
  setTimeout(async () => {
    if (adopted) return;
    let saved = null;
    try { saved = (await store.getRoomFlags()).studio; } catch (e) {}
    if (adopted) return;                       // a peer answered while we read
    adopted = true;
    if (saved && saved.xport) {
      // a queued pattern change from a dead session must not fire on arrival
      saved.xport.qpat = -1; saved.xport.qat = -1;
      sAdopt(saved); sApplyMixer();
      toast("the room remembered — picking up where it left off");
    } else {
      sSeed(); sApplyMixer();
    }
    sNet.pushPatch("xport", sState.xport);
    sNet.pushPatch("drums", sState.dev.drums);
    sNet.pushPatch("synth", sState.dev.synth);
    world.studio.markDirty("*");
  }, 1300);
}

// the MPC overlay — built once, shown only while you're in the studio
let pads = null;
function ensurePads() {
  if (pads) return pads;
  pads = setupPads({
    act: sAct, state: sState, rec: sRec,
    drumRows: SA.DRUM_ROWS, stepCount: sStepCount, nPats: S_NPATS,
    canPlay: () => inStudio,
    playhead: sPlayhead, onStep: sOnStep, metroClick: SA.metroClick, curGrid: sCurGrid, audio: SA,
    blocked: () => vrBlocked("the pads need a flat screen"),
    onOpen: () => { modalOpen = true; controls.unlock(); },
    onClose: () => { modalOpen = false; if (entered) safeLock(); },
  });
  return pads;
}

function setupStudio() {
  inStudio = true;
  world.studio.root.visible = true;
  controls.pos.x = world.STUDIO.x;
  controls.pos.z = world.STUDIO.z + 2.6;
  controls.yaw = 0;                       // facing the drum machine (forward is -z here)
  setRoomTone(false);                     // the bedroom stays behind, fully
  setRain(0);                             // the booth is treated — no weather in here
  hideFlightStrip();                      // no window on LAX either
  document.body.classList.add("in-studio");   // the cat HUD stays home too
  refreshNoteVisibility();
  bootStudio();
  try { SA.setFx({ masterGain: 0.85 }); } catch (e) {}
  store.logEvent("studio");
  ensurePads().showButton(true);
  toast("THE STUDIO — everyone's on the same bar");
  hide(paused);
  if (entered) safeLock();
}

function leaveStudio() {
  inStudio = false;
  endStudioDrag();
  studioPersistNow();              // the beat stays on the books
  document.body.classList.remove("in-studio");
  try { setRain((world.getWeather() && world.getWeather().rain) || 0); } catch (e) {}   // weather back
  if (pads) { pads.close(); pads.showButton(false); }
  world.studio.root.visible = false;
  try { SA.setFx({ masterGain: 0 }); } catch (e) {}   // the loop keeps running, you just can't hear it
}

/* ---- grabbing a knob: hold the mouse on it and drag; the camera stays
   put and the motion turns the control. fine, relative, like hardware.
   taps still set bars by position — but a tap can't jump a knob. ---- */
let studioDrag = null;          // { kind, h, startValue, value, moved }
let studioDragClickGuard = 0;   // swallow the click that trails a real drag

function studioDragRead(h) {
  if (h.key === "bpm" || h.key === "swing") return sState.xport[h.key];
  return h.ch ? sState.dev.mixer.ch[h.ch][h.key] : sState.dev[h.dev][h.key];
}
function studioDragWrite(h, v) {
  // live preview: straight into state, no version bump — the commit on
  // release is the one edit the room hears about
  if (h.key === "bpm" || h.key === "swing") sState.xport[h.key] = v;
  else if (h.ch) sState.dev.mixer.ch[h.ch][h.key] = v;
  else sState.dev[h.dev][h.key] = v;
}
function beginStudioDrag(kind, h) {
  studioDrag = { kind, h, startValue: studioDragRead(h), value: studioDragRead(h), moved: false };
  controls.dragLock = true;
  controls.dragDX = 0; controls.dragDY = 0;
}
function tickStudioDrag() {
  if (!studioDrag) return;
  const d = studioDrag;
  if (Math.abs(controls.dragDX) + Math.abs(controls.dragDY) > 3) d.moved = true;
  if (!d.moved) return;
  // right or up turns it clockwise; 320px of hand = the full sweep
  const frac = (controls.dragDX - controls.dragDY) / 320;
  d.value = sDragValue(d.h, d.startValue, frac);
  if (d.h.key === "bpm") d.value = Math.round(d.value);
  studioDragWrite(d.h, d.value);
  world.studio.markDirty(d.kind);
  // bpm moves the shared clock, so it only applies on release; everything
  // else is safe to hear while you turn it
  if (d.h.key !== "bpm") sApplyMixer();
}
function endStudioDrag() {
  const d = studioDrag;
  studioDrag = null;
  controls.dragLock = false;
  if (!d) return;
  if (!d.moved) return;                       // a tap — the click path owns it
  studioDragClickGuard = performance.now();
  // put the start value back so the committed edit computes from the truth
  studioDragWrite(d.h, d.startValue);
  if (d.h.key === "bpm") sAct.setBpm(d.value);
  else if (d.h.key === "swing") sAct.setSwing(d.value);
  else if (d.h.ch) sAct.setChannel(d.h.ch, d.h.key, d.value);
  else sAct.setParam(d.h.dev, d.h.key, d.value);
  sApplyMixer();
}
document.addEventListener("mousedown", () => {
  if (!inStudio || !controls.locked || modalOpen || renderer.xr.isPresenting) return;
  const hit = castAt(0, 0);
  if (hit && hit.object.userData.kind && hit.uv && hit.distance < 5.5) {
    const k = hit.object.userData.kind;
    const h = sHitPanel(k, hit.uv.x, hit.uv.y);
    if (h && h.type === "slider") beginStudioDrag(k, h);
  }
});
document.addEventListener("mouseup", () => endStudioDrag());

// the machines answer a click the same way they did on the old page
function applyStudioHit(kind, hit) {
  if (!hit || hit.type === "none") return;
  if (hit.type === "step") sAct.toggleStep(hit.id, hit.row, hit.step);
  else if (hit.type === "clip") {
    // the launcher's tiles: firing the one already playing just opens it on
    // the editor instead of re-launching what you're already hearing
    const sy = sState.dev.synth;
    if (sy.active === hit.index) { sAct.selectPattern(hit.index); toast("opened for editing"); }
    else { sAct.launchPattern(hit.index); toast("queued — lands on the next bar"); }
  }
  else if (hit.type === "pad") sAct.trigger(hit.id, hit.row);     // played by hand, recorded if armed
  else if (hit.type === "rec") {
    toast(sRec.toggle() ? "REC armed — tap the pads to lay it in" : "REC off");
  } else if (hit.type === "pattern") {
    sAct.setPattern(hit.i);
    toast(`pattern ${"ABCD"[hit.i] || hit.i + 1}`);
  } else if (hit.type === "steps") {
    const id = hit.id === "synth" ? "synth" : "drums";
    const n = Math.max(1, Math.min(S_MAX_STEPS, sStepCount(id) + hit.d));
    sAct.setSteps(n, id);
    toast(`${id === "synth" ? "synth" : "drums"}: ${n} step${n === 1 ? "" : "s"}`);
  }
  else if (hit.type === "mute") sAct.toggleMute(hit.id);
  else if (hit.type === "clip") sAct.launchClip(hit.index);
  else if (hit.type === "chmute") sAct.setChannel(hit.name, "mute", !sState.dev.mixer.ch[hit.name].mute);
  else if (hit.type === "slider") {
    // the click that trails a finished drag must not re-set the value from
    // wherever the cursor happened to land
    if (performance.now() - studioDragClickGuard < 250) return;
    // a tap can nudge a bar to a spot, but a knob only answers to a drag
    if (hit.knob) return;
    // tempo and swing are transport, not device — they have their own actions
    if (hit.key === "bpm") sAct.setBpm(hit.value);
    else if (hit.key === "swing") sAct.setSwing(hit.value);
    else if (hit.ch) sAct.setChannel(hit.ch, hit.key, hit.value);
    else sAct.setParam(hit.dev, hit.key, hit.value);
    // everything that isn't a note reaches the audio graph through
    // applyMixer — sends, master filter, plaits knobs, clouds knobs
    sApplyMixer();
  } else if (hit.type === "pengine") {
    const cur = sState.dev.synth.pEngine || 0;
    const next = Math.max(0, Math.min(23, cur + hit.d));
    sAct.setParam("synth", "pEngine", next);
    sApplyMixer();
  } else if (hit.type === "clfreeze") {
    sAct.setParam("mixer", "clFreeze", !sState.dev.mixer.clFreeze);
    sApplyMixer();
    toast(sState.dev.mixer.clFreeze ? "❄ frozen — the buffer holds what it heard" : "recording again");
  } else if (hit.type === "clmode") {
    sAct.setParam("mixer", "clMode", ((sState.dev.mixer.clMode || 0) + 1) & 3);
    sApplyMixer();
  } else if (hit.type === "cycle") {
    const a = sState.dev.synth;
    const cyc = (list, cur) => list[(list.indexOf(cur) + 1) % list.length];
    if (hit.key === "voice") sAct.setParam("synth", "voice", cyc(SA.VOICES, a.voice));
    else if (hit.key === "scale") sAct.setParam("synth", "scale", cyc(Object.keys(SA.SCALES), a.scale));
    else if (hit.key === "root") sAct.setParam("synth", "root", 40 + (((a.root - 40) + 1) % 12));
    else if (hit.key === "oct") sAct.setParam("synth", "oct", a.oct >= 2 ? -1 : a.oct + 1);
  }
}

let inBoat = false;
async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
// the secret fill: kick, snare, hi tom, lo tom, hat, crash — play it in
// order on the kit and the drums open the studio. only YOUR hits count
// (a ghost drumming the fill shouldn't teleport you), a wrong pad starts
// you over (a kick always reads as a fresh downbeat), and taking longer
// than four seconds between hits lets the fill lapse.
const STUDIO_FILL = [0, 1, 3, 4, 2, 5];
let fillPos = 0, fillAt = 0;
// returns true when this hit advanced the fill (main.js flashes those gold)
function studioFill(pad) {
  const now = performance.now();
  if (now - fillAt > 4000) fillPos = 0;
  fillAt = now;
  const on = pad === STUDIO_FILL[fillPos];
  fillPos = on ? fillPos + 1 : (pad === 0 ? 1 : 0);
  if (fillPos < STUDIO_FILL.length) return on || fillPos === 1;
  fillPos = 0;
  toast("that's the fill — the kit knows the way…");
  // let the crash ring for a beat before the floor opens
  setTimeout(() => fadeTo(setupStudio), 700);
  return true;
}

function fadeTo(fn) {
  try { xrRef && xrRef.clearHud && xrRef.clearHud(); } catch (e) {}   // each world keeps its own wrist
  const f = $("#fade");
  f.classList.add("dark");
  setTimeout(() => {
    // never strand anyone on a black screen: if the room setup throws, still
    // lift the fade (and surface it) instead of leaving the overlay dark
    try { fn(); }
    catch (e) { console.error("room transition failed:", e); toast("hmm, that glitched — try again"); }
    finally { setTimeout(() => f.classList.remove("dark"), 150); }
  }, 480);
}
// the arcade elevator — a car you ride. CALL parts the doors with a chime;
// step inside and the back-wall buttons are the rooms. each floor reuses the
// existing portal flow, so the desi/venue passwords and the crew team-pick
// still stand; HOME just rides back to the bedroom.
let elevBusy = false;
// every room exit empties back into the cab (doors open) — the lift is the one
// hub all the trips run through, so you step out of it the same way you'd ride.
function returnToLift() {
  controls.pos.x = world.elevReturn.x;
  controls.pos.z = world.elevReturn.z;
  controls.yaw = world.elevReturn.yaw;
  world.setElevatorDoors(true);          // the doors are already parted on arrival
}
// ride-cam — the car actually moves. while it travels the controls are unlocked
// (so nothing else writes the camera) and we nudge it: a sink as it pulls away
// from the floor, a faint sway down the shaft, a little settle as the brakes
// grab. the lit ceiling panel keeps the sealed cab from going pitch black.
const rideCam = { active: false, t: 0, dur: 1.1, baseX: 0, baseY: 0 };
function startRideCam() {
  rideCam.active = true; rideCam.t = 0;
  rideCam.baseX = camera.position.x; rideCam.baseY = camera.position.y;
}
function stepRideCam(dt) {
  if (!rideCam.active) return;
  rideCam.t += dt;
  const p = Math.min(1, rideCam.t / rideCam.dur);
  const depart = Math.exp(-p * 6) * -0.11;             // weight in your knees as it pulls away
  const arrive = Math.exp(-(1 - p) * 7) * 0.08;        // float up as the brakes grab
  const hum = Math.sin(p * Math.PI) * Math.sin(p * 46) * 0.006;   // a faint shaft rattle, fades at the ends
  const sway = Math.sin(p * Math.PI) * Math.sin(p * 17) * 0.010;  // gentle side-to-side
  camera.position.y = rideCam.baseY + depart + arrive + hum;
  camera.position.x = rideCam.baseX + sway;
  if (p >= 1) rideCam.active = false;
}
function elevChime(up = true) {
  // a soft two-note ding (arrival/open)
  try {
    beep(up ? 784 : 988, 0.14, "sine", 0.05);
    setTimeout(() => beep(up ? 1047 : 659, 0.18, "sine", 0.05), 140);
  } catch (e) {}
}
function callElevator() {
  if (elevBusy) return;
  if (world.elevatorOpen()) return;        // already open — nothing to do
  world.setElevatorDoors(true);
  elevChime(true);
}
function rideElevator(floor) {
  if (elevBusy) return;
  track("elevator_used", { from: aRoomNow(), to: floor });   // analytics
  elevBusy = true;
  modalOpen = true;
  controls.unlock();                       // hands off — you're riding
  world.setElevatorDoors(false);           // doors slide shut in front of you
  startRideCam();                          // the car lurches off down the shaft
  try { beep(660, 0.05, "square", 0.04); beep(150, 0.9, "sine", 0.03, 120); } catch (e) {}  // button + departure hum
  // a couple of soft ticks as floors slip past the window
  try { setTimeout(() => beep(440, 0.04, "sine", 0.03), 420); setTimeout(() => beep(440, 0.04, "sine", 0.03), 760); } catch (e) {}
  setTimeout(() => {
    elevChime(floor === "home");            // a ding as the car arrives at your floor
    modalOpen = false;                      // each flow re-arms its own modal/lock
    elevBusy = false;
    if (floor === "home") goHome();
    else if (floor === "desi") tryBoat();
    else if (floor === "crew") tryArena();
    else if (floor === "venue") tryClub();
  }, 1100);                                 // let the ride-cam play out before the doors open
}
/* --- admin layout editor: press L in #admin to rearrange the props.
   click a prop to grab it (gold box), arrows slide it, PgUp/PgDn raise
   and lower, Q/E spin, shift makes every move fine, R sends it home.
   press L again and the layout saves to room_state — the room stays
   that way for everyone, and other visitors see it live. --- */
let layoutMode = false, layoutSel = null, layoutBox = null;
const layRay = new THREE.Raycaster();
const layCentre = new THREE.Vector2(0, 0);
const layDelta = new THREE.Vector3();
const layQuat = new THREE.Quaternion();
function layoutDrop() {
  if (layoutBox) { world.scene.remove(layoutBox); layoutBox = null; }
  layoutSel = null;
}
function setLayoutMode(on) {
  if (layoutMode === on) return;
  layoutMode = on;
  layoutDrop();
  if (on) {
    toast("layout mode — click a prop · arrows move · Q/E spin · +/- resize · PgUp/PgDn raise · R home · L saves");
  } else {
    store.saveRoomFlag("layout", world.layoutSnapshot()).catch(() => {});
    toast("layout saved — the room stays this way for everyone");
  }
}
function layoutSelect(id) {
  layoutDrop();
  const g = world.movables[id];
  if (!g) return;
  layoutSel = id;
  layoutBox = new THREE.BoxHelper(g, 0xffd23c);
  world.scene.add(layoutBox);
  toast(`holding: ${id} — arrows · Q/E · +/- · PgUp/PgDn · R resets it`);
}
function layoutClick() {
  layRay.setFromCamera(layCentre, camera);
  layRay.layers.enableAll();
  const h = layRay.intersectObjects(Object.values(world.movables), true)[0];
  if (!h || h.distance > 4.5) { layoutDrop(); return; }
  for (const [id, g] of Object.entries(world.movables)) {
    let o = h.object;
    while (o && o !== g) o = o.parent;
    if (o === g) { layoutSelect(id); return; }
  }
  layoutDrop();
}
function layoutScale(f) {
  if (!layoutSel) return;
  const g = world.movables[layoutSel];
  g.scale.setScalar(Math.max(0.2, Math.min(5, g.scale.x * f)));
  layoutBox?.update();
}
function layoutNudge(dx, dy, dz, dry = 0) {
  if (!layoutSel) return;
  const g = world.movables[layoutSel];
  if (dry) g.rotation.y += dry;
  if (dx || dy || dz) {
    // arrows speak world axes, but a prop may live inside a rotated parent
    // (the instrument rack leans −0.25) — carry the delta into its frame
    layDelta.set(dx, dy, dz);
    g.parent.getWorldQuaternion(layQuat);
    layDelta.applyQuaternion(layQuat.invert());
    g.position.add(layDelta);
  }
  layoutBox?.update();
}

// admin quick-travel: number keys jump straight to a room, skipping the lift
// and any password / team gate. 1 = venue · 2 = desi · 3 = crew · 4 = home.
// one fade tears down whatever room you're in and sets up the target.
function adminJump(target) {
  if (!adminMode || !entered || elevBusy) return;
  const cur = aRoomNow();
  const curKey = (cur === "bedroom" || cur === "arcade") ? "home" : cur;
  if (curKey === target) return;
  fadeTo(() => {
    if (curKey === "desi") teardownBoat();
    else if (curKey === "venue") teardownClub();
    else if (curKey === "crew") teardownArena();
    else if (curKey === "gym") teardownGym();
    if (target === "home") setupHome();
    else if (target === "desi") setupBoat();
    else if (target === "venue") setupClub();
    else if (target === "crew") setupArena(myTeam);
    else if (target === "gym") setupGym();
    else setupHome();          // never strand: an unknown target goes home
  });
}
function goHome() { fadeTo(setupHome); }
function setupHome() {
  if (inStudio) leaveStudio();
  controls.pos.x = world.spawn.x;
  controls.pos.z = world.spawn.z;
  controls.yaw = world.spawn.yaw;
  setRoomTone(true);
  refreshNoteVisibility();
  if (entered) safeLock();                  // re-lock — the ride unlocked us
}
async function tryBoat() {
  // the VR guard has to come BEFORE the flag goes up: bailing out with
  // modalOpen still true leaves an invisible modal wedging every click
  if (vrBlocked("that door wants a password — step out of VR")) return;
  modalOpen = true;                      // keep the pause screen away
  const pass = prompt("this door is private. password:");
  if (!pass) { modalOpen = false; if (entered) safeLock(); return; }
  if (await sha256(pass.trim().toLowerCase()) !== BOAT_PASS_HASH) {
    modalOpen = false;
    if (entered) safeLock();
    return toast("the door doesn't budge.");
  }
  fadeTo(() => { modalOpen = false; setupBoat(); });
}
function setupBoat() {
  inBoat = true;
  controls.pos.x = world.boatSpawn.x;
  controls.pos.z = world.boatSpawn.z;
  controls.yaw = world.boatSpawn.yaw;
  setWater(true);
  store.logEvent("boat");
  progress.bump("trips");
  setRoomTone(false);                    // the bedroom stays behind, fully
  refreshNoteVisibility();
  toast("welcome aboard THE DESI 🌊");
  hide(paused);
  if (entered) safeLock();
}
function teardownBoat() {
  inBoat = false;
  setWater(false);                       // the sea stays on the boat, fully
}
// each room shows only its own notes
function refreshNoteVisibility() {
  for (const mesh of world.noteGroup.children) {
    const onBoat = String(mesh.userData.note?.wall || "").startsWith("boat");
    mesh.visible = inArena || inClub || inGym ? false : inBoat ? onBoat : !onBoat;
  }
}

function leaveBoat() {
  fadeTo(() => {
    teardownBoat();
    returnToLift();
    setRoomTone(true);
    refreshNoteVisibility();
  });
}

/* ---------------- THE VENUE: the dj bar, name pending ---------------- */
// dev placeholder ("soundcheck") — swap for the real hash before the event
const CLUB_PASS_HASH = "7aaaa3946f3f4de633bda31fc85970434577eb3b0d4540b00879727861012586";
// the venue is open to everyone for now (nothing happens in there yet —
// people can just go look around). flip CLUB_OPEN back to false to put the
// bouncer + password back for showtime.
const CLUB_OPEN = true;
let inClub = false;
async function tryClub() {
  // guard first — see tryBoat
  if (!CLUB_OPEN && vrBlocked("that door wants a password — step out of VR")) return;
  modalOpen = true;                      // keep the pause screen away
  if (!CLUB_OPEN) {
    const pass = prompt("an unmarked door. bass through the brick. password:");
    if (!pass) { modalOpen = false; if (entered) safeLock(); return; }
    if (await sha256(pass.trim().toLowerCase()) !== CLUB_PASS_HASH) {
      modalOpen = false;
      if (entered) safeLock();
      return toast("the bouncer shakes his head.");
    }
  }
  fadeTo(() => { modalOpen = false; setupClub(); });
}
function setupClub() {
  inClub = true;
  presence.setSpace("venue");             // the venue is its own world — main-world traffic can't reach it
  controls.pos.x = world.clubSpawn.x;
  controls.pos.z = world.clubSpawn.z;
  controls.yaw = world.clubSpawn.yaw;
  setRoomTone(false);                    // the bedroom stays behind, fully
  setClubBed(clubBedFor());              // soothing bed matched to the theme
  setClubTone(true);                     // the idle bed, until a set starts
  voice.setInClub(true);                 // now the set can reach your ears
  // the venue is sealed: the mic goes quiet (chat only), the cat HUD and any
  // flight strip that crept up at home are gone — only the set + chat get in
  voice.stopTalk(); updateMicUI();
  hideFlightStrip();
  document.body.classList.add("in-club");
  djHeardAt = 0;
  wasGranted = djGrantedToMe();          // so a later grant toasts, but a standing one doesn't
  screen.enter();                        // the wall starts playing whatever's on; audio arms on your first move
  stream.enterVenue();                   // say hello to any live screen-share host so we get dialed in
  if (screenState) toast("📺 there's something on the big screen — click it to mute/unmute");
  world.setOnAir(false);                 // dark until a chunk says otherwise
  store.logEvent("boat");                // counts as a portal trip
  progress.bump("trips");
  refreshNoteVisibility();
  toast("you're in 🪩 — the decks are dark until showtime");
  hide(paused);
  if (entered) safeLock();
}
function teardownClub() {
  presence.setSpace("world");             // back to the main world's channel
  if (voice.djLive()) voice.stopDJ();    // you can't broadcast from the street
  voice.setInClub(false);
  if (stream.isHosting()) stream.stopShare();   // you can't broadcast from the street
  stream.leaveVenue();                          // drop just our own connection (others keep watching)
  screen.leave();                        // mute + pause the wall video → its audio stops at the door
  world.setOnAir(false);
  setClubTone(false);                    // the street is quiet
  document.body.classList.remove("in-club");   // the mic + cat HUD come back home
  showVenueHelp(false); venueGrayStart = 0;    // drop the reload nudge at the door
  inClub = false;
}
function leaveClub() {
  teardownClub();
  fadeTo(() => {
    // the lift was waiting — you step back out of it into the arcade
    returnToLift();
    setRoomTone(true);
    refreshNoteVisibility();
  });
}

/* ---------------- the big screen: a shared twitch/youtube stream ----------------
   admin-only. the host pastes a link in the booth; everyone in THE VENUE sees a
   diegetic "NOW SHOWING <channel>" panel light up on the booth wall, and clicks
   it to open the real player in a flat 2D theater overlay (the only reliable way
   to play a cross-origin stream with sound + clicks + no iOS auto-pause). the
   "what's on" rides room_state (admin-gated) so it persists across reloads and
   survives the host leaving; presence carries the instant update. last-wins on `at`. */
let screenState = null;       // { url, at } shared truth, or null
let screenClock = 0;          // last-event-wins guard across presence + db
let screenAnnounce = null;    // re-announce timer (covers late joiners pre-migration)

// broadcast what's on over presence — instant for everyone present, and the
// only sync channel in local mode (no realtime there)
function broadcastScreen() {
  const at = Date.now();
  screenClock = at;
  if (screenState) {
    screenState.at = at;
    presence.sendAct({ kind: "screen", on: true, url: screenState.url, at });
  } else {
    presence.sendAct({ kind: "screen", on: false, at });
  }
}
// persist to room_state so it outlives a reload + the host walking away
async function persistScreen() {
  if (store.mode !== "supabase") { store.saveScreen(screenState).catch(() => {}); return; }
  const pass = adminPass();
  if (!pass) return;
  try { await store.saveScreen(screenState, pass); }
  catch (e) {
    // pre-migration or a bad passphrase — the live broadcast still landed, so
    // don't blow up; just forget a wrong passphrase so the next try re-prompts
    if (String(e.message).includes("passphrase")) sessionStorage.removeItem("metro.adminpass");
  }
}
// re-announce over presence every few seconds while the host is here, so anyone
// who walks in mid-event catches the screen even if the db migration isn't run
// yet (the durable path covers the case where the host has LEFT).
function startScreenAnnounce() {
  if (screenAnnounce || !adminMode) return;
  screenAnnounce = setInterval(() => { if (screenState) broadcastScreen(); else stopScreenAnnounce(); }, 5000);
}
function stopScreenAnnounce() { if (screenAnnounce) { clearInterval(screenAnnounce); screenAnnounce = null; } }

// push whatever's in screenState onto the wall (the renderer plays/clears it)
function showScreen() { screen.setStream(screenState); }

// apply a stream that arrived from elsewhere (presence act, db load, or realtime)
function applyRemoteScreen(s) {
  const at = (s && s.at) ? s.at : Date.now();
  if (at < screenClock) return;            // stale vs a newer event we already have
  screenClock = at;
  if (s && s.url) {
    const changed = !screenState || screenState.url !== s.url;
    screenState = { url: s.url, at };
    showScreen();
    if (inClub && changed) toast("📺 something's on the big screen now");
    startScreenAnnounce();               // if we're the host (self-guards), keep relaying it
  } else {
    screenState = null;
    screen.setStream(null);
    stopScreenAnnounce();
  }
}

// admin sets / changes the stream — input is a CORS HLS (.m3u8) or .mp4 URL
function setScreen(input) {
  const url = (input || "").trim();
  if (!/^https?:\/\/.+/i.test(url)) {
    toast("paste a stream URL — a CORS HLS (.m3u8) or .mp4 link");
    return;
  }
  if (/twitch\.tv|youtube\.com|youtu\.be/i.test(url)) {
    toast("that's a watch-page link — the screen needs the raw HLS (.m3u8). see the booth note.");
    return;
  }
  screenState = { url, at: Date.now() };
  showScreen();
  broadcastScreen();
  persistScreen();
  startScreenAnnounce();
  toast("📺 stream set — it's on the big screen");
}
// stop a host screen-share + clear the wall
function stopShareToRoom() {
  stream.stopShare();
  screen.setMediaStream(null);
}
// admin clears it
function clearScreen() {
  screenState = null;
  screen.setStream(null);
  stopScreenAnnounce();
  broadcastScreen();
  persistScreen();
  toast("📺 screen cleared");
}

/* ---------------- the booth: power, grant, go live ---------------- */
// djState = { on, act:{uid,name}|null } — the host powers the decks and hands
// them to one present user. it lives in room_state so it survives reload.
let djState = null;
let wasGranted = false;
let lastPeers = new Map();                 // uid -> {name,color,...}, cached for the booth list
const peerX = new Map();                   // uid -> last x, for a room-scoped headcount
const peerScope = new Map();               // uid -> which space they're in (from their pose)
let lastMyScope = null;                    // my space last frame, to re-scope ghosts on a room change
// render ghosts ONLY for peers in the same space as you. building + animating an
// avatar for someone in another room (40m away, behind walls, invisible) is
// wasted work that hitches the frame — and on iOS that hitch stalls the venue
// video. peers with no live pose yet (just joined, or a dead/stale presence
// entry) are left out until they actually pose, which also keeps phantoms out.
function refreshGhostScope() {
  if (!lastPeers) return;
  const scope = myScope();
  const here = new Map();
  for (const [uid, meta] of lastPeers) {
    if (peerScope.get(uid) === scope) here.set(uid, meta);
  }
  ghosts.syncPeers(here);
}
function clubHeadcount() {
  let n = inClub ? 1 : 0;
  for (const x of peerX.values()) if (x < -30) n++;   // club lives past x = -30
  return n;
}
function djGrantedToMe() { return !!(djState && djState.on && djState.act && djState.act.uid === identity.uid); }
// a granted peer (or the host) may spin, but only at a powered booth
function canDJ() { return inClub && !!(djState && djState.on) && (adminMode || djGrantedToMe()); }
// the soothing idle bed that fits the current venue theme
function clubBedFor() {
  const n = world.clubThemeName();
  return n === "Deep Aquarium" ? "water" : n === "Deep Space" ? "space" : "rain";
}
// who gets the live FX (fog / fireworks): the host, or whoever holds the booth
function canFX() { return inClub && entered && (adminMode || canDJ()); }
// the dj-only FX legend — only shown to those who can fire the FX
function updateFxPanel() {
  const el = $("#fx-panel");
  if (el) el.classList.toggle("show", canFX());
}
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
  updateFxPanel();
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
  if (vrBlocked("the booth needs a flat screen")) return;
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
  // the big screen: host-only, paste a stream link
  const sc = $("#booth-screen");
  sc.classList.toggle("hidden", !adminMode);
  if (adminMode) {
    const hosting = stream.isHosting();
    const live = !!screenState;
    let host = "on"; try { host = new URL(screenState.url).hostname.replace(/^www\./, ""); } catch (e) {}
    $("#booth-screen-now").textContent = hosting ? "sharing your screen" : live ? host : "off";
    $("#booth-screen-share").textContent = hosting ? "■ stop sharing my screen" : "🖥️ share my screen / tab";
    $("#booth-screen-set").textContent = live ? "🔗 change the stream URL" : "🔗 …or paste a stream URL";
    $("#booth-screen-clear").classList.toggle("hidden", !(live || hosting));
  }
  $("#booth-count").textContent = `${clubHeadcount()} in the room`;
}
$("#booth-screen-share").addEventListener("click", async () => {
  if (stream.isHosting()) { stopShareToRoom(); renderBooth(); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    return toast("screen sharing isn't supported on this device — use a desktop browser");
  }
  let disp;
  try {
    // cap the CAPTURE up front — a home host meshes one encode per viewer, so
    // 720p/24fps keeps the cpu + uplink sane with a few people watching
    disp = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 24, max: 30 }, width: { max: 1280 }, height: { max: 720 } },
      audio: true,
    });
  } catch (e) { return toast("sharing was cancelled"); }
  if (!disp.getVideoTracks().length) { disp.getTracks().forEach(t => t.stop()); return toast("no screen came through"); }
  const vt0 = disp.getVideoTracks()[0];
  vt0.contentHint = "motion";                  // it's video — favour smooth fps over pin-sharp detail
  try { await vt0.applyConstraints({ frameRate: 24, width: { max: 1280 }, height: { max: 720 } }); } catch (e) {}
  if (screenState) clearScreen();              // a screen-share takes over from any URL stream
  screen.setMediaStream(disp, true);           // host sees it on the wall, muted (already hears the tab)
  const ok = await stream.startShare(disp);    // publish once to the SFU; it fans out to viewers
  if (!ok) { screen.setMediaStream(null); disp.getTracks().forEach(t => t.stop()); toast("couldn't start the share — try again"); renderBooth(); return; }
  toast("🖥️ you're sharing to the venue — pick a tab with 'share tab audio' for sound");
  renderBooth();
});
$("#booth-screen-set").addEventListener("click", () => {
  const link = prompt("stream URL — a CORS HLS (.m3u8) or .mp4.\n(Twitch/YouTube: have the streamer add an OBS output to Cloudflare Stream and paste its HLS link.)", screenState ? screenState.url : "");
  if (link == null) return;
  if (stream.isHosting()) stopShareToRoom();   // a URL stream takes over from a screen-share
  setScreen(link);
  renderBooth();
});
$("#booth-screen-clear").addEventListener("click", () => {
  if (stream.isHosting()) stopShareToRoom();
  clearScreen();
  renderBooth();
});
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
  if (vrBlocked("the decks need a flat screen")) return;
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
  // straight into the hall — no locker rooms, no ceremony. teams still
  // exist for the disc, but they're assigned quietly (sticky, alternating
  // for newcomers) instead of asked for. works in VR: flight is on the
  // controllers now.
  if (!myTeam || (myTeam !== "o" && myTeam !== "b")) myTeam = Math.random() < 0.5 ? "o" : "b";
  enterArena(myTeam);
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
  fadeTo(() => setupArena(team));
}
function setupArena(team) {
  myTeam = team;
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
  hide(paused);
  if (entered && !renderer.xr.isPresenting) safeLock();
}
function teardownArena() {
  stopArenaMusic();
  // don't walk off with the disc
  if (disc.holder === identity.uid) {
    disc.holder = null;
    disc.pos.set(A.x, A.y, A.z);
    disc.vel.set(0, 0, 0);
    presence.sendAct({ kind: "disc", sub: "throw", p: [A.x, A.y, A.z], v: [0, 0, 0] });
  }
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
  controls.pitch = 0;
  voice.setArenaFx(false);
  setThruster(false);
}
function leaveArena() {
  fadeTo(() => {
    teardownArena();
    returnToLift();
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
  controls.holdingDisc = disc.holder === identity.uid;   // echo's 4.7 m/s disc tax
  const g = world.discGroup;
  if (disc.holder) {
    if (disc.holder === identity.uid) {
      // in VR the disc sits IN the gripping hand; on desktop it rides
      // just in front and below the gaze
      const hp = xr.discHand && xr.discHand();
      if (hp) {
        disc.pos.set(hp.x, hp.y, hp.z);
      } else {
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        disc.pos.copy(camera.position).addScaledVector(dir, 1.05);
        disc.pos.y -= 0.3;
      }
    } else {
      const ghostPos = ghosts.byUid.get(disc.holder)?.grp.position;
      if (ghostPos) disc.pos.set(ghostPos.x, ghostPos.y + 1.1, ghostPos.z);
    }
  } else {
    disc.pos.addScaledVector(disc.vel, dt);
    // no drag: echo's disc keeps every bit of the throw until something
    // touches it. space doesn't slow things down.
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

/* ---------------- THE GYM: full-court basketball ----------------
   On foot, slow legs, a real jump, one shared ball. JOIN on the arcade
   court rides you out; the ball + rules live in gymball.js. Two teams
   (red attacks the east hoop, blue the west); scoring is by which hoop
   the ball drops through, so own-goals credit the other side. */
let inGym = false;
const GYM = world.gym;
const gymTeams = new Map();          // uid -> "red" | "blue" (for balance + display)
let myGymTeam = "red";
let gymBucketAt = 0;
// match phase (Echo-style): you spawn into WARM-UP (free roam, unlimited boost,
// makes don't count). everyone present readies up → TIP-OFF → live game (real
// stamina rules, the board counts). gymReady holds the uids that are readied.
let gymLive = false;
const gymReady = new Set();

// silent unless you're actually in the gym — recv() still runs everywhere to
// keep ball state synced, but the bedroom shouldn't hear distant dribbles
const gb = (fn) => (...a) => { if (inGym) { try { fn(...a); } catch (e) {} } };
const gymSound = {
  bounce: gb(() => beep(160 + Math.random() * 30, 0.05, "sine", 0.05)),
  rim:    gb(() => beep(820, 0.03, "square", 0.02)),
  bank:   gb(() => beep(300, 0.05, "sine", 0.035)),
  shoot:  gb(() => beep(520, 0.06, "sine", 0.03)),
  pass:   gb(() => beep(420, 0.05, "triangle", 0.04)),
  catch:  gb(() => beep(680, 0.04, "sine", 0.05)),
  steal:  gb(() => beep(900, 0.05, "sawtooth", 0.03)),
  dunk:   gb(() => { beep(220, 0.07, "square", 0.05); setTimeout(() => beep(120, 0.12, "sine", 0.05), 60); }),
  swish:  gb(() => { beep(880, 0.08, "sine", 0.05); setTimeout(() => beep(1320, 0.12, "sine", 0.04), 70); }),
};

function assignGymTeam() {
  let r = 0, b = 0;
  for (const [uid, t] of gymTeams) {
    if (uid !== identity.uid && ghosts.byUid.has(uid)) (t === "red" ? r++ : b++);
  }
  return r <= b ? "red" : "blue";
}

const gymBall = makeGymBall(GYM, {
  myUid: () => identity.uid,
  ctx: () => ({
    x: controls.pos.x, z: controls.pos.z, yaw: controls.yaw, pitch: controls.pitch,
    eyeY: 1.62 + (controls.gymY || 0), gymY: controls.gymY || 0,
    pressed: controls.pointerDown, locked: controls.locked,
  }),
  ghost: (uid) => {
    const g = ghosts.byUid.get(uid);
    if (!g) return null;
    return { x: g.grp.position.x, y: g.grp.position.y, z: g.grp.position.z, yaw: g.target.yaw };
  },
  team: () => myGymTeam,
  // aim is auto-solved at the hoop you're facing for EVERYONE now (desktop too):
  // the only skill is power (how long you hold). while winding up, the camera
  // eases onto the backboard so you see exactly where it's going — a big assist
  // that makes shooting readable for anybody, mouse or thumb.
  autoAim: () => true,
  live: () => gymLive,        // false during warm-up → makes don't count yet
  setAimLock: (pt) => { controls.aimLockTarget = pt; },   // ease camera onto the backboard while shooting
  // the best teammate to pass to: same team, the one you're most facing, in range
  passTarget: () => {
    const cam = new THREE.Vector3(); camera.getWorldDirection(cam); cam.y = 0;
    if (cam.lengthSq() < 1e-6) return null; cam.normalize();
    let best = null, bestScore = -Infinity;
    for (const [uid, g] of ghosts.byUid) {
      if (gymTeams.get(uid) !== myGymTeam) continue;          // teammates only
      const gp = g.grp.position;
      const to = new THREE.Vector3(gp.x - controls.pos.x, 0, gp.z - controls.pos.z);
      const dist = to.length();
      if (dist < 0.8 || dist > 38) continue;
      const score = to.normalize().dot(cam) * 2 - dist * 0.02; // in-front + nearer wins
      if (score > bestScore) { bestScore = score; best = { x: gp.x, y: gp.y + 1.3, z: gp.z }; }
    }
    return best;
  },
  send: (p) => presence.sendAct({ kind: "bball", ...p }),
  power: (c, opt) => {
    if (!gymPowerWrap) return;
    if (c <= 0) { gymPowerWrap.style.display = "none"; return; }
    gymPowerWrap.style.display = "block";
    gymPowerEl.style.width = Math.round(c * 100) + "%";
    // the active-reload marker: a bright line at the perfect-swish power, with a
    // green sweet-zone band when a make is reachable (amber line if it can't be)
    if (opt) {
      gymPowerOpt.style.display = "block";
      gymPowerOpt.style.left = (opt.opt * 100) + "%";
      gymPowerOpt.style.background = opt.makeable ? "#eafff2" : "#ffd27a";
      gymPowerOpt.style.boxShadow = opt.makeable ? "0 0 7px 1px #6bffb0" : "0 0 7px 1px #e0a050";
      if (opt.makeable && opt.hi > opt.lo) {
        gymPowerBand.style.display = "block";
        gymPowerBand.style.left = (opt.lo * 100) + "%";
        gymPowerBand.style.width = ((opt.hi - opt.lo) * 100) + "%";
      } else gymPowerBand.style.display = "none";
    } else { gymPowerOpt.style.display = "none"; gymPowerBand.style.display = "none"; }
  },
  sound: gymSound,
  toast,
  onScore: (team, pts, red, blue) => {
    gymBucketAt = Date.now();
    gymSound.swish();
    if (inGym) toast(`${team === "red" ? "🔴 RED" : "🔵 BLUE"} ${pts === 3 ? "for THREE 💥" : "bucket"} — ${red}-${blue}`);
    updateGymHud();
  },
  onSteal: (from, target) => {
    if (target === identity.uid && inGym) { gotScratched(); toast("🤚 someone stripped you!"); }
  },
});
// a tap on the right look-stick grabs a loose ball / strips the holder
// (our mobile stand-in for the "pressure" idea, since phones have no force touch)
controls.onLookTap(() => { if (inGym) gymBall.click(); });

/* --- gym HUD: score + stamina + a one-line hint (built lazily) --- */
let gymHud = null, gymScoreEl = null, gymStamEl = null;
// the throw meter: same slim green→yellow→red bar as the arcade pop-a-shot,
// shown only while you wind up a shot
let gymPowerWrap = null, gymPowerEl = null, gymPowerBand = null, gymPowerOpt = null;
let gymDunkWrap = null, gymDunkFill = null, gymDunkLabel = null;
function buildGymHud() {
  if (gymHud) return;
  gymHud = document.createElement("div");
  gymHud.style.cssText =
    "position:fixed;left:0;right:0;top:0;z-index:55;pointer-events:none;display:none;" +
    "font:800 16px monospace;text-align:center;color:#eaf2ff;text-shadow:0 2px 6px rgba(0,0,0,.7)";
  gymHud.innerHTML =
    "<div id='gym-score' style='margin-top:10px;font-size:22px'>🔴 0 — 0 🔵</div>" +
    "<div id='gym-boost-label' style='margin:8px auto 0;font:700 11px monospace;letter-spacing:2px;opacity:.85'>⚡ BOOST</div>" +
    "<div style='margin:3px auto 0;width:200px;height:9px;border:1px solid rgba(120,200,255,.5);border-radius:5px;background:rgba(0,0,0,.55);overflow:hidden'>" +
    "<div id='gym-stam' style='height:100%;width:100%;background:#2ff0ff'></div></div>" +
    "<div id='gym-hint' style='margin-top:6px;font-size:12px;opacity:.85'></div>";
  document.body.appendChild(gymHud);
  gymScoreEl = gymHud.querySelector("#gym-score");
  gymStamEl = gymHud.querySelector("#gym-stam");
  // a CLEAN screen on every device now: the score lives on the wall scoreboards
  // and the controls/ready prompt on the wall READY board, so the only thing left
  // up top is the slim boost gauge. no score line, no control hints, no clutter.
  gymScoreEl.style.display = "none";
  gymHud.querySelector("#gym-hint").style.display = "none";
  gymHud.querySelector("#gym-boost-label").style.display = "none";
  // the arcade-style power meter, centered low on screen
  gymPowerWrap = document.createElement("div");
  gymPowerWrap.style.cssText =
    "position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:55;display:none;" +
    "width:200px;height:11px;border:1px solid #8a5a3a;border-radius:7px;overflow:hidden;background:rgba(0,0,0,.45)";
  // fill = current (oscillating) power; band = the makeable sweet zone for where
  // you stand; opt line = the perfect-swish release point (active-reload marker)
  gymPowerWrap.innerHTML =
    '<div id="gym-power" style="position:absolute;left:0;top:0;height:100%;width:0;background:linear-gradient(90deg,#3bd17a,#ffd23c,#e23a52)"></div>' +
    '<div id="gym-power-band" style="position:absolute;top:0;bottom:0;background:rgba(180,255,210,.4);display:none"></div>' +
    '<div id="gym-power-opt" style="position:absolute;top:0;bottom:0;width:3px;margin-left:-1px;background:#eafff2;box-shadow:0 0 7px 1px #6bffb0;display:none"></div>';
  document.body.appendChild(gymPowerWrap);
  gymPowerEl = gymPowerWrap.querySelector("#gym-power");
  gymPowerBand = gymPowerWrap.querySelector("#gym-power-band");
  gymPowerOpt = gymPowerWrap.querySelector("#gym-power-opt");
  // the DUNK meter: appears in the paint near your hoop. jump to fill it; the
  // green window at the top is the moment to release for an automatic slam.
  gymDunkWrap = document.createElement("div");
  gymDunkWrap.style.cssText =
    "position:fixed;left:50%;bottom:158px;transform:translateX(-50%);z-index:56;display:none;" +
    "text-align:center;font:800 13px monospace;color:#fff;text-shadow:0 2px 6px rgba(0,0,0,.8)";
  gymDunkWrap.innerHTML =
    "<div id='gym-dunk-label' style='margin-bottom:3px'>JUMP TO DUNK</div>" +
    "<div style='position:relative;width:170px;height:14px;border:1px solid #ffb454;border-radius:8px;overflow:hidden;background:rgba(0,0,0,.55)'>" +
    "<div style='position:absolute;right:0;top:0;width:34%;height:100%;background:rgba(59,209,122,.25)'></div>" +   // the green target band
    "<div id='gym-dunk-fill' style='height:100%;width:0;background:#ffb454'></div></div>";
  document.body.appendChild(gymDunkWrap);
  gymDunkFill = gymDunkWrap.querySelector("#gym-dunk-fill");
  gymDunkLabel = gymDunkWrap.querySelector("#gym-dunk-label");
}
// the WARM-UP / ready state lives entirely on the wall READY board now — no DOM
// clutter. this just redraws that board (the live ready count, or GAME ON).
let gymReadyKey = "";   // cache so we only redraw the board when state changes
function updateGymWarm() {
  if (!inGym) return;
  const present = gymPresentUids();
  let ready = 0; for (const uid of present) if (gymReady.has(uid)) ready++;
  const key = `${gymLive}|${myReady()}|${ready}|${present.size}`;
  if (key !== gymReadyKey) { gymReadyKey = key; try { GYM.setReady(gymLive, myReady(), ready, present.size); } catch (e) {} }
}
function updateDunkMeter() {
  if (!gymDunkWrap) return;
  const di = gymBall.dunk();
  if (!di.inZone) { gymDunkWrap.style.display = "none"; return; }
  gymDunkWrap.style.display = "block";
  gymDunkFill.style.width = Math.round(di.phase * 100) + "%";
  if (di.ready) {
    gymDunkFill.style.background = "#3bd17a";
    gymDunkLabel.textContent = "🔥 DUNK! — shoot NOW";
    gymDunkLabel.style.color = "#7ee06a";
  } else {
    gymDunkFill.style.background = "#ffb454";
    gymDunkLabel.textContent = "in the paint — JUMP, then SHOOT at the top";
    gymDunkLabel.style.color = "#fff";
  }
}
function updateGymHud() {
  if (!gymHud) return;
  const s = gymBall.score;
  const meRed = myGymTeam === "red";
  gymScoreEl.innerHTML =
    `<span style='color:${meRed ? "#ff7a6a" : "#ff5a4d"}'>🔴 ${s.red}${meRed ? " ◄" : ""}</span>` +
    " — " +
    `<span style='color:${!meRed ? "#7ab0ff" : "#5a9bff"}'>${!meRed ? "► " : ""}${s.blue} 🔵</span>`;
  gymStamEl.style.width = Math.round((controls.stamina || 0) * 100) + "%";
  // green in warm-up (unlimited boost), grey while you carry in-game (boost
  // locked — Echo VR rule), cyan when ready, magenta while recharging
  gymStamEl.style.background = !gymLive ? "#3bff9d"
    : controls.holdingBall ? "#566" : (controls.stamina > 0.3 ? "#2ff0ff" : "#ff3df0");
}

/* --- mobile touch controls for the gym: twin sticks (left=move+edge-boost,
   right=look+tap-grab). the action buttons ORBIT the right stick's real
   on-screen position (measured live), so they stay glued to it on any device /
   safe-area, not at fixed pixels. SHOOT at the top, JUMP on the upper-left of
   the orbit, PASS just under it to the left of the stick. --- */
let gymBtns = null, gymBtnEls = null;
function buildGymBtns() {
  if (gymBtns || !IS_TOUCH) return;
  gymBtns = [];
  const mk = (label, size, bg, font) => {
    const b = document.createElement("button");
    b.innerHTML = label;
    b.style.cssText = "position:fixed;z-index:60;display:none;border:2px solid rgba(255,255,255,.4);" +
      "border-radius:50%;color:#fff;line-height:1.05;text-align:center;box-shadow:0 3px 16px rgba(0,0,0,.5);" +
      "touch-action:none;-webkit-user-select:none;user-select:none;" +
      `width:${size}px;height:${size}px;font:800 ${font}px monospace;background:${bg};`;
    document.body.appendChild(b); gymBtns.push(b);
    return b;
  };
  const shoot = mk("🏀", 84, "rgba(212,99,31,.92)", 30);
  const jump  = mk("⤴<br>JUMP", 76, "rgba(58,125,68,.92)", 13);
  const pass  = mk("➟<br>PASS", 76, "rgba(154,90,42,.92)", 13);
  gymBtnEls = { shoot, jump, pass };
  const pd = (el, on, off) => {
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); on(); });
    el.addEventListener("pointerup", (e) => { e.preventDefault(); e.stopPropagation(); off && off(); });
    el.addEventListener("pointercancel", (e) => { e.preventDefault(); off && off(); });
  };
  pd(jump,  () => { controls.touchJump = true; }, () => { controls.touchJump = false; });
  pd(shoot, () => { controls.pointerDown = true; }, () => { controls.pointerDown = false; });   // hold = wind up, release = shoot
  pd(pass,  () => { gymBall.pass(); });
  addEventListener("resize", () => { if (inGym) layoutGymBtns(); });
}
// place the buttons on an arc around the right stick's MEASURED centre
function layoutGymBtns() {
  if (!gymBtnEls) return;
  const stick = document.getElementById("joystick-r");
  if (!stick) return;
  const r = stick.getBoundingClientRect();
  const sx = r.left + r.width / 2, sy = r.top + r.height / 2, R = r.width / 2 + 50;
  // angle measured from straight-up, increasing toward the LEFT
  const place = (el, ang, sz) => {
    const cx = sx - Math.sin(ang) * R, cy = sy - Math.cos(ang) * R;
    el.style.left = (cx - sz / 2) + "px"; el.style.top = (cy - sz / 2) + "px";
    el.style.right = "auto"; el.style.bottom = "auto";
  };
  place(gymBtnEls.shoot, 0,    84);    // straight up
  place(gymBtnEls.jump,  0.9,  76);    // upper-left (~51°)
  place(gymBtnEls.pass,  1.75, 76);    // left + a touch low (~100°) → under JUMP
}
function showGymUI(on) {
  buildGymHud();
  if (IS_TOUCH) buildGymBtns();
  gymHud.style.display = on ? "block" : "none";
  if (gymPowerWrap && !on) gymPowerWrap.style.display = "none";
  if (gymDunkWrap && !on) gymDunkWrap.style.display = "none";
  if (IS_TOUCH) controls.setLookStick(on);     // show the right stick first…
  if (gymBtns) {
    if (on) layoutGymBtns();                    // …so the buttons can orbit its measured spot
    for (const b of gymBtns) b.style.display = on ? "block" : "none";
  }
  if (on) updateGymHud();
}

/* --- warm-up → tip-off (the ready-up flow) --- */
// who's actually in the gym right now: me + any peer we've heard a team for who
// still has a live ghost. that's the set that has to ready up to start.
function gymPresentUids() {
  const set = new Set([identity.uid]);
  for (const [uid] of gymTeams) if (uid !== identity.uid && ghosts.byUid.has(uid)) set.add(uid);
  return set;
}
const myReady = () => gymReady.has(identity.uid);
function setMyReady(on) {
  if (gymLive) return;
  if (on) gymReady.add(identity.uid); else gymReady.delete(identity.uid);
  presence.sendAct({ kind: "bball", sub: "ready", uid: identity.uid, ready: on, t: Date.now() });
  updateGymWarm();
  maybeTipOff();
}
function toggleReady() { if (inGym && !gymLive) setMyReady(!myReady()); }
// everyone present readied → I call the tip-off for the whole room (idempotent —
// startGymGame guards on gymLive, and the broadcast makes every client agree)
function maybeTipOff() {
  if (gymLive || !inGym) return;
  const present = gymPresentUids();
  for (const uid of present) if (!gymReady.has(uid)) return;
  presence.sendAct({ kind: "bball", sub: "start", t: Date.now() });
  startGymGame();
}
function startGymGame() {
  if (gymLive) return;
  gymLive = true;
  controls.gymWarmup = false;
  gymReady.clear();
  gymBall.startGame();          // 0–0, ball to centre
  controls.stamina = 1;
  if (inGym) { updateGymHud(); updateGymWarm(); toast("🏀 TIP-OFF! — game on, boost is limited now"); gymSound.swish(); }
}

// JOIN sign on the arcade court → ride out to the gym (auto-balanced team)
function joinGym() {
  if (modalOpen || elevBusy) return;
  myGymTeam = assignGymTeam();
  fadeTo(setupGym);
}
function setupGym() {
  inGym = true;
  controls.gym = true;
  controls.gymY = 0; controls.vy = 0; controls.grounded = true; controls.stamina = 1;
  controls.pitch = 0;
  // spawn into WARM-UP: unlimited boost, free roam, makes don't count yet
  gymLive = false; gymReady.clear(); controls.gymWarmup = true; gymReadyKey = "";
  const sp = world.gymSpawnFor(myGymTeam);
  controls.pos.x = sp.x; controls.pos.z = sp.z; controls.yaw = sp.yaw;
  gymTeams.set(identity.uid, myGymTeam);
  gymBall.reset();
  setRoomTone(false);
  setRain(0);                      // the court is indoors — kill weather noise
  hideFlightStrip();               // no LAX window out here
  refreshNoteVisibility();
  store.logEvent("boat");          // counts as a portal trip
  progress.bump("trips");
  showGymUI(true);
  updateGymWarm();
  // announce my team + ask everyone else's, so the count balances + displays
  presence.sendAct({ kind: "bball", sub: "team", uid: identity.uid, team: myGymTeam, t: Date.now() });
  presence.sendAct({ kind: "bball", sub: "teamq", uid: identity.uid, t: Date.now() });
  toast(`🏀 you're on ${myGymTeam === "red" ? "🔴 RED" : "🔵 BLUE"} — warm up, then READY to tip off`);
  hide(paused);
  if (entered) safeLock();
}
function teardownGym() {
  gymBall.leave();
  inGym = false;
  controls.gym = false;
  controls.gymWarmup = false;
  gymLive = false; gymReady.clear();
  controls.gymY = 0; controls.vy = 0; controls.grounded = true;
  controls.touchJump = false; controls.touchSprint = false;
  controls.aimLockTarget = null;
  showGymUI(false);
  try { setRain((world.getWeather() && world.getWeather().rain) || 0); } catch (e) {}   // weather back
}
function leaveGym() {
  fadeTo(() => {
    teardownGym();
    // step back out onto the arcade court, right where the JOIN sign is
    controls.pos.x = -13.6; controls.pos.z = -3.0; controls.yaw = Math.PI;
    setRoomTone(true);
    refreshNoteVisibility();
    if (entered) safeLock();
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
  if (vrBlocked("the bottle needs a flat screen")) return;
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
// the LAX strip stays off while you're in a game or a menu — no plane
// banners over the pool table, a cabinet, or any modal
function stripBlocked() {
  // the LAX window is the bedroom's — no flight strips in the far rooms
  // (boat / arena / venue / gym), behind a game, or over a modal
  return controls.pooling || controls.aiming || modalOpen ||
    inBoat || inArena || inClub || inGym || inStudio ||
    (typeof arcadeIsOpen === "function" && arcadeIsOpen());
}
function showFlightStrip(info) {
  if (stripBlocked()) return;
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
async function openDM(compose = false) {
  if (vrBlocked("writing to metro needs a flat screen")) return;
  modalOpen = true;
  controls.unlock();
  // compose=true always opens the write-a-note pane — no passphrase, even
  // for the booth. the inbox path stays for wherever it's needed next.
  if (adminMode && !compose) {
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
// how hard the self-playing songs hit, relative to your own manual play
// (a manual key/pad is velocity 1.0). kept just shy of parity so live
// playing still sits a touch on top — but close, so a song reads as the
// instrument actually being played, not a distant backing loop.
const MUSIC_VEL = 1.05;
// the jukebox UI left the computer when METRO OS became a terminal; the
// song engine stays wired (remote peers + the cat's keep-off-the-keys
// check still use it), there's just no local UI to repaint anymore
function refreshSongUI() {}
// the self-playing songs are a SHARED room thing now: when someone starts (or
// stops, or swaps) a track on the computer, the whole bedroom hears the same
// one, and anyone can stop it or pick another. ordered by a logical clock so a
// skewed connection can't get stuck on a stale start/stop. songState is what the
// room is playing, kept so a walk-in can be told and tune straight in.
let songClock = 0;
let songState = null;   // { id, at } or null when nothing's playing
// play (or stop) a song locally WITHOUT broadcasting — used both for your own
// click and for following a peer's choice
function applySong(id) {
  if (!id) { stopSong(); return; }   // stop calls ended → setDelayTempo(null) + UI
  // the song keeps rolling while you're in another room — you just don't
  // hear the bedroom instruments from there (the arcade counts as away too)
  const here = () => !inBoat && !inArena && !inClub && !inGym && !inStudio && !inArcade();
  playSong(id, {
    now: audioNow,
    // each track to its own instrument — piano is chromatic (raw semitone,
    // not a white-key index), guitar plays the song's real pitches, drums
    // hit the e-kit pads. all sit under MUSIC_VEL so it stays a backing track.
    play: (track, value, vel, when) => {
      if (!here()) return;
      if (track === "piano") pianoNote(value, pianoVoice, vel * MUSIC_VEL, when, true);
      else if (track === "guitar") guitarNote(value, vel * MUSIC_VEL, when, guitarVoice);
      else edrumHit(value, when, vel * MUSIC_VEL);
    },
    press: (track, value, delay) => setTimeout(() => {
      if (!here()) return;
      if (track === "piano") world.pressPianoKey(semitoneToKey(value));
      else if (track === "drum") world.pressEdrum(value);
      else world.strumTele();
    }, delay),
    ended: () => { setDelayTempo(null); refreshSongUI(); },   // delay pedals back to free-play time
  });
  // the delay pedals lock to this song's tempo (keys eighth, guitar dotted-eighth)
  const song = SONGS.find(x => x.id === id);
  if (song) setDelayTempo(song.bpm);
  refreshSongUI();
}
/* --- METRO OS: the terminal ---
   the computer stopped being a button menu. it's a little amber-phosphor
   tty now: scrollback, prompt, history, and a command table that new
   commands (the real-music jukebox is coming) can slot into. */
const termOut = $("#term-out");
const termIn = $("#term-in");
const termPromptEl = $("#term-prompt");
let termBooted = false;
const termHistory = [];
let termHistAt = -1;

function termUser() {
  const n = (identity.name || "visitor").toLowerCase().replace(/[^a-z0-9_-]+/g, "");
  return n || "visitor";
}
function termPrint(text = "", cls = "") {
  const div = document.createElement("div");
  if (cls) div.className = cls;
  div.textContent = text;
  termOut.appendChild(div);
  termOut.scrollTop = termOut.scrollHeight;
}
function termBanner() {
  termPrint("METRO OS v3.0", "bright");
  termPrint("─".repeat(34), "dim");
  termPrint("the room is always on.");
  termPrint("type 'help' to see what this thing does.", "dim");
  termPrint("");
}
const laTime = () => new Date().toLocaleString("en-US", {
  timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric",
  hour: "numeric", minute: "2-digit",
});
// the command table — one entry per command, help builds itself from it
const TERM_COMMANDS = {
  help: { blurb: "you're looking at it", run() {
    termPrint("commands:", "bright");
    for (const [name, c] of Object.entries(TERM_COMMANDS)) {
      if (c.admin && !adminMode) continue;
      termPrint(`  ${name.padEnd(10)} ${c.blurb}`, "");
    }
  } },
  msg: { blurb: "send metro a message / file", run() {
    hide(pcOverlay); openDM(true);   // straight to the composer, no passcode ever
  } },
  music: { blurb: "the sound system", run() {
    termPrint("the old jukebox has been unplugged.", "dim");
    termPrint("a new sound system is being wired in — check back soon.");
  } },
  cat: { blurb: "how the cat's doing", run() {
    const d = store.decayCat(catState);
    const mood = cat.mood > 0.5 ? "purring" : cat.mood > 0 ? "content"
      : cat.mood > -0.4 ? "aloof" : "plotting something";
    termPrint(`fed ${Math.round(d.fed * 100)}% · hydrated ${Math.round(d.hydrated * 100)}% · mood: ${mood}`);
    termPrint(`currently: ${cat.state}`, "dim");
  } },
  weather: { blurb: "what LA is doing outside", run() {
    const wx = world.getWeather() || {};
    const sky = wx.fog ? "fog" : wx.rain ? "rain" : wx.clouds > 0.6 ? "overcast"
      : wx.clouds > 0.2 ? "some clouds" : "clear";
    const temp = wx.tempC != null ? ` · ${Math.round(wx.tempC * 9 / 5 + 32)}°F (${Math.round(wx.tempC)}°C)` : "";
    termPrint(`hawthorne, ca — ${sky}${temp}` + (wx.clouds != null ? ` · cloud cover ${Math.round(wx.clouds * 100)}%` : ""));
  } },
  time: { blurb: "studio clock (LA)", run() { termPrint(laTime()); } },
  whoami: { blurb: "your name in the room", run() {
    termPrint(identity.name || "visitor");
  } },
  clear: { blurb: "wipe the scrollback", run() { termOut.textContent = ""; } },
  exit: { blurb: "back to the room", run() { closePC(); } },
};
// a few things people will inevitably try
const TERM_EGGS = {
  ls: () => termPrint("demos/  mixes/  cat_photos/  do_not_open/", ""),
  sudo: () => termPrint("this is metro's computer. nice try though.", "err"),
  pwd: () => termPrint("/home/metro/studio"),
  quit: () => TERM_COMMANDS.exit.run(),
};
function runTerm(line) {
  termPrint(`${termPromptEl.textContent} ${line}`, "cmdline");
  const [cmd, ...args] = line.trim().split(/\s+/);
  if (!cmd) return;
  const c = TERM_COMMANDS[cmd];
  if (c && (!c.admin || adminMode)) c.run(args);
  else if (TERM_EGGS[cmd]) TERM_EGGS[cmd](args);
  else {
    termPrint(`command not found: ${cmd}`, "err");
    termPrint("try 'help'", "dim");
  }
  termOut.scrollTop = termOut.scrollHeight;
}
termIn.addEventListener("keydown", (e) => {
  e.stopPropagation();   // the room's hotkeys don't belong in a terminal
  if (e.key === "Enter") {
    const line = termIn.value;
    termIn.value = "";
    if (line.trim()) { termHistory.push(line); }
    termHistAt = termHistory.length;
    runTerm(line);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (termHistAt > 0) { termHistAt--; termIn.value = termHistory[termHistAt] || ""; }
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    if (termHistAt < termHistory.length) { termHistAt++; termIn.value = termHistory[termHistAt] || ""; }
  } else if (e.key === "Escape") {
    closePC();
  }
});
// clicking anywhere in the shell keeps the keyboard on the prompt
pcOverlay.addEventListener("click", (e) => {
  if (e.target.closest(".term-shell")) termIn.focus();
});
function openPC() {
  if (vrBlocked("METRO OS needs a flat screen for now")) return;
  modalOpen = true;
  controls.unlock();
  termPromptEl.textContent = `${termUser()}@metro:~$`;
  if (!termBooted) { termBooted = true; termBanner(); }
  show(pcOverlay);
  setTimeout(() => termIn.focus(), 50);
}
function closePC() {
  hide(pcOverlay);
  modalOpen = false;
  if (entered) safeLock();
}
$("#pc-close").addEventListener("click", closePC);
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

/* ---- the VR cabinet screen: the game canvas on a panel in the room ---- */
let vrArcade = null;
function openVrArcadePanel() {
  if (vrArcade) return;
  const cvs = document.getElementById("arcade-canvas");
  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.0625),   // 640×400
    new THREE.MeshBasicMaterial({ map: tex }));
  const hp = new THREE.Vector3(); camera.getWorldPosition(hp);
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
  fwd.y = 0; fwd.normalize();
  mesh.position.copy(hp).addScaledVector(fwd, 1.7);
  mesh.position.y = hp.y;
  mesh.lookAt(hp.x, mesh.position.y, hp.z);
  world.scene.add(mesh);
  vrArcade = { mesh, tex };
}
function closeVrArcadePanel() {
  if (!vrArcade) return;
  world.scene.remove(vrArcade.mesh);
  vrArcade.mesh.geometry.dispose();
  vrArcade.mesh.material.dispose();
  vrArcade.tex.dispose();
  vrArcade = null;
}

function closeArcadeOverlay() {
  if (aArcadeGame) {
    track("arcade_game_ended", { game: aArcadeGame, seconds: Math.round((performance.now() - aArcadeStart) / 1000) });
    aArcadeGame = null;
  }
  closeArcade();
  closeVrArcadePanel();
  modalOpen = false;
  if (entered && !renderer.xr.isPresenting) safeLock();
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
    if (mixerUI.classList.contains("show")) closeMixer();
    if (filterUI.classList.contains("show")) closeFilter();
    // real DOOM owns ESC (its own menu) — only its × button closes it
    if (arcadeIsOpen() && !arcadeWantsEsc()) closeArcadeOverlay();
  }
});

/* ---------------- data + presence boot ---------------- */
(async function boot() {
  const mode = await store.init();

  // pull dedicated TURN credentials (Cloudflare, via the `turn` edge function)
  // and hand them to the screen-share. fire-and-forget: the share starts well
  // after boot, and if this fails stream.js keeps its STUN + openrelay default.
  store.getIceServers().then((s) => {
    if (s && s.length) { window.METRO_CONFIG = window.METRO_CONFIG || {}; window.METRO_CONFIG.ICE_SERVERS = s; }
  }).catch(() => {});

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

  // the badge only speaks up when something's off — connected is the
  // normal state and doesn't need announcing
  const badge = $("#mode-badge");
  if (mode !== "supabase") {
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

  // NB: presence.join is deferred to enterRoom — you don't broadcast as a peer
  // (and so can't show up nameless) until you've entered with a name. These
  // handlers just register; they fire once join connects.
  presence.onPeers((allPeers) => {
    // only ever show people who've actually named themselves — belt-and-braces
    // on top of the join-on-enter gate, so a stranger with no name (e.g. a stale
    // tab still on old cached code) never renders or counts toward the room
    const peers = new Map([...allPeers].filter(([, m]) => (m.name || "").trim()));
    const newcomer = [...peers.keys()].some(uid => !lastPeers.has(uid));   // someone just walked in
    $("#online-count").textContent = String(peers.size + 1);
    lastPeers = peers;
    for (const uid of [...peerX.keys()]) if (!peers.has(uid)) peerX.delete(uid);
    for (const uid of [...peerScope.keys()]) if (!peers.has(uid)) peerScope.delete(uid);
    refreshGhostScope();                  // build/keep only the avatars of people in your room
    if ($("#booth").classList.contains("show")) renderBooth();
    // re-announce whatever's playing so the newcomer tunes straight in. we
    // resend the existing event (same clock) — peers already in sync see it as
    // stale and ignore it; only the newcomer (clock 0) adopts it.
    if (newcomer) {
      for (const k in radios) {
        const d = radios[k];
        if (d.shared && d.shared.on) presence.sendAct({ kind: "radio", which: d.which, on: true, idx: d.shared.idx, at: d.shared.at });
      }
      // and the big screen — same trick, so a walk-in sees the video at once
      // instead of waiting up to 5s for the next re-announce tick
      if (screenState) presence.sendAct({ kind: "screen", on: true, url: screenState.url, at: screenState.at });
      // and whatever song the bedroom's playing, so a newcomer tunes in too
      if (songState) presence.sendAct({ kind: "song", id: songState.id, at: songState.at });
    }
  });
  presence.onPose((uid, pose) => {
    if (lastPeers && !lastPeers.has(uid)) return;
    const sc = roomScopeOfPos(pose.x, pose.y, pose.z);
    if (peerScope.get(uid) !== sc) { peerScope.set(uid, sc); refreshGhostScope(); }   // they crossed rooms
    ghosts.setPose(uid, pose);
    peerX.set(uid, pose.x);
  });
  presence.onNote((uid, i, v) => {
    if (inBoat || inArena || inArcade()) return;   // the bedroom piano stays in the bedroom
    pianoNote(i, v ?? 0);
    world.pressPianoKey(i);
  });
  presence.onGame((p) => {
    if (p.game === "pool") poolGame.handleNet(p);
    else if (p.game === "pool2") poolGame2.handleNet(p);
    else handleGameMessage(p);
  });
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
    } else if (p.kind === "lava") {
      world.setLava(p.on);
    } else if (p.kind === "pet") {
      if (!inBoat && !inArena && !inClub && !inGym) cat.remoteHearts();
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
    } else if (p.kind === "bball") {
      // THE GYM ball: hold/shot/score/steal all flow through gymball.recv;
      // team/teamq keep the roster balanced + the HUD honest
      if (p.sub === "team") {
        gymTeams.set(p.uid, p.team);
        if (inGym) { updateGymHud(); updateGymWarm(); }
      } else if (p.sub === "teamq") {
        if (inGym && p.uid !== identity.uid) {
          presence.sendAct({ kind: "bball", sub: "team", uid: identity.uid, team: myGymTeam, t: Date.now() });
          // tell a newcomer the room's already tipped off so they sync to live
          if (gymLive) presence.sendAct({ kind: "bball", sub: "phase", live: true, t: Date.now() });
        }
      } else if (p.sub === "ready") {
        if (p.ready) gymReady.add(p.uid); else gymReady.delete(p.uid);
        if (inGym) { updateGymWarm(); maybeTipOff(); }
      } else if (p.sub === "start") {
        if (inGym) startGymGame();
      } else if (p.sub === "phase") {
        if (inGym && p.live) startGymGame();
      } else {
        gymBall.recv(p);
        if (inGym && (p.sub === "score")) updateGymHud();
      }
    } else if (p.kind === "hoop") {
      // a peer's run drives the wall board too — the name on it is whoever's
      // actually shooting, not whoever happens to be looking at it
      showStreak(String(p.name || "someone").slice(0, 24), p.streak | 0, !!p.swish);
      hoopFire(p.streak | 0);       // a friend catching fire beside you is half the point
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
      if (!inBoat && !inArena && !inClub && !inGym) {
        world.puffSmoke(p.what);
        smokeSound(p.what);
      }
    } else if (p.kind === "planeshot") {
      // someone else took the shot — if our jet is still up, down it
      if (world.downPlane() && !inBoat && !inArena && !inClub && !inGym) {
        citySound("boom");
        toast("someone shot the plane out of the sky 🛩️💥");
      }
    } else if (p.kind === "edrum") {
      if (!inBoat && !inArena && !inClub && !inGym && !inArcade()) { edrumHit(p.pad); world.pressEdrum(p.pad); }
    } else if (p.kind === "guitar") {
      if (!inBoat && !inArena && !inClub && !inGym && !inArcade()) { guitarPluck(p.n, p.voice || 0); world.strumTele(); }
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
    } else if (p.kind === "fog") {
      if (inClub) world.clubFog(p.seed);
    } else if (p.kind === "theme") {
      // the dj set the look — the whole room follows
      if (inClub) { world.setClubTheme(p.ix); setClubBed(clubBedFor()); }
    } else if (p.kind === "screen") {
      // the host put a stream up (or cleared it) over presence — last-event-wins.
      // the d49ccac rebuild moved the payload to {url}; this used to still read the
      // old {platform,skind,id} shape, so url came through undefined and every
      // receiver fell into applyRemoteScreen's clear branch — i.e. the 5s
      // re-announce blanked the wall for everyone but the host. carry the url.
      applyRemoteScreen(p.on ? { url: p.url, at: p.at } : null);
    } else if (p.kind === "radio") {
      // someone tuned the shared radio — follow it (last-event-wins)
      const desc = radios[p.which];
      if (desc) {
        radioClock = Math.max(radioClock, p.at || 0);              // keep our clock ahead
        if (!(desc.shared && (p.at || 0) <= desc.shared.at)) {     // ignore anything stale
          desc.shared = { on: !!p.on, idx: p.idx | 0, at: p.at || 0 };
          desc.radio.applyRemote(!!p.on, p.idx | 0);
        }
      }
    } else if (p.kind === "song") {
      // someone started/stopped/swapped the bedroom song — follow it
      // (last-event-wins by logical clock, just like the radio)
      const at = p.at || 0;
      songClock = Math.max(songClock, at);                 // keep our clock ahead
      if (at > (songState ? songState.at : 0)) {           // ignore anything stale
        songState = p.id ? { id: p.id, at } : null;
        if (currentSongId() !== (p.id || null)) applySong(p.id || null);
      }
    }
  });
  presence.onChat((p) => pushChat(p.name || "someone", p.color, p.text));

  // arcade leaderboard: every cabinet keeps its own board, the marquee
  // cycles them. load all four, keep them live, report new scores.
  const SCORE_GAMES = ["defender", "pac", "tron", "pong"];
  const refreshScores = (flash = false) =>
    Promise.all(SCORE_GAMES.map(g =>
      store.listScores(g, 5).then(rows => [g, rows]).catch(() => [g, []])
    )).then(pairs => world.setScores(Object.fromEntries(pairs), flash)).catch(() => {});
  refreshScores();
  store.onNewScore(() => refreshScores());
  setScoreHook((game, score) => {
    store.submitScore(game, (identity.name || "anon").slice(0, 24), score, identity.uid)
      .then(() => refreshScores(true))     // your name lands and the board flashes
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
    applyRoomFlags(s.flags, false);            // blinds/curtains/closet/lava backstop (no radio)
  });

  // and so do the blinds, curtains, closet, lava lamp + radios
  store.getRoomFlags().then(f => { roomFlags = f; applyRoomFlags(f); }).catch(() => {});

  // the booth remembers who it was handed to
  store.getDJ().then(dj => { djState = dj; wasGranted = djGrantedToMe(); }).catch(() => {});
  store.onDJ(dj => { djState = dj; onDJChanged(); });
  // and the big screen remembers what's on it — survives reload + the host leaving
  store.getScreen().then(s => { if (s) applyRemoteScreen(s); }).catch(() => {});
  store.onScreen(s => applyRemoteScreen(s));
  // keep the booth's headcount plate honest while anyone's in the club
  setInterval(() => { if (entered && inClub) world.setBoothHeadcount(clubHeadcount()); updateFxPanel(); }, 1500);

  store.logEvent("visit");

  // cat needs: load shared state, stay subscribed to everyone's care
  try { applyCatState(await store.getCatState()); }
  catch (e) { applyCatState({ food: 1, water: 1, litter: 0, pets: 0, updated_at: new Date().toISOString() }); }
  store.onCatState((s) => applyCatState(s));
})();

/* ---------------- frame loop ---------------- */
/* --- VR: phase one (see xr.js) --- */
const xr = setupXR({
  renderer, camera, scene: world.scene, controls, world,
  // the disc, for VR hands: Echo's momentary grip — held only while the
  // grip button is down, thrown with the hand's own velocity on release
  // push-to-talk rides B/Y in a headset, the same contract as holding V:
  // live while held, off on release, never inside the venue (its own rules)
  arcade: {
    active: () => arcadeIsOpen() && !!vrArcade,
    key: (code, down) => arcadeVrKey(code, down),
    close: () => closeArcadeOverlay(),
  },
  onTalk: (held) => {
    if (held) {
      if (inClub || voice.isOn()) return;
      voice.startTalk(false).then((ok) => {
        if (!ok) { xrRef && xrRef.note("the mic said no"); return; }
        xrRef && xrRef.note("🎤 live");
        updateMicUI();
      });
    } else if (voice.mode() === "ptt") {
      voice.stopTalk();
      xrRef && xrRef.note("mic off");
      updateMicUI();
    }
  },
  zerogDisc: {
    free: () => inArena && !disc.holder,
    pos: () => (inArena ? { x: disc.pos.x, y: disc.pos.y, z: disc.pos.z } : null),
    grab: () => { if (inArena && !disc.holder) grabDisc(); },
    throwVec: (p, v) => {
      if (!inArena || disc.holder !== identity.uid) return;
      disc.holder = null;
      disc.pos.set(p.x, p.y, p.z);
      disc.vel.set(v.x, v.y, v.z);
      disc.thrownFrom = [p.x, p.y, p.z];   // the release point decides the points
      discSound("throw");
      presence.sendAct({
        kind: "disc", sub: "throw",
        p: [p.x, p.y, p.z], v: [v.x, v.y, v.z], t: disc.thrownFrom,
      });
    },
  },
  canEnter: () => !inBoat && !inArena && !inClub && !inGym && !modalOpen,   // studio is fine — it walks
  onSelect: (controller) => {
    // an overlay is invisible in a session, so a stuck modalOpen would
    // silently swallow every trigger pull. if nothing is actually on
    // screen and we're not mid-lift, the flag is stale — clear it.
    if (modalOpen && !elevBusy && !document.querySelector(".overlay.show")) modalOpen = false;
    if (modalOpen) return;
    xrAim = controller;
    try { controls.actionFns.forEach((f) => f(0, 0)); }
    finally { xrAim = null; }
  },
});

xrRef = xr;   // helpers above can reach it now that it exists

window.METRO_DEBUG = { renderer, camera, world, controls, xr, disc, hoop: hoopGame,
  vrArcadePanel: { open: openVrArcadePanel, close: closeVrArcadePanel },
  // a hand on the sequencer, same habit as the rest of the room
  studio: { state: sState, act: sAct, rec: sRec, hit: sHitPanel, apply: applyStudioHit,
            steps: sStepCount, playhead: sPlayhead, mi: () => SA.miStatus(),
            dragBegin: beginStudioDrag, dragTick: tickStudioDrag, dragEnd: endStudioDrag,
            wardrobe: { adopt: adoptAvatarExport, open: openWardrobe, wearFile }, percReady: () => SA.percReady(), percLast: () => SA.percLast() }, THREE, cat, bartender, guide, ghosts, voice, screen, stream, setScreen, clearScreen,
    // what the crosshair is actually on — the smoke harness can't pointer-lock,
    // so this is how a test sees what a click would have hit
    castAt: (x = 0, y = 0) => { const h = castAt(x, y); return h ? { ud: Object.keys(h.object.userData), d: +h.distance.toFixed(2) } : null; },
    say: { speak, stopSpeaking, isSpeaking, isVoicing, voiceAvailable, voiceInfo, clipsReady }, room: () => aRoomNow(), jump: adminJump, mirror, openPicker, analytics: analyticsBuffer, notesWall,
  layout: { set: setLayoutMode, select: layoutSelect, nudge: layoutNudge, scale: layoutScale, click: layoutClick, on: () => layoutMode, sel: () => layoutSel },
  uid: identity.uid, pool: poolGame, pool2: poolGame2, sitAtPool, leavePool,
  toy: () => toy, grabToy, throwToy,
  hoops: hoopGame,
  gym: { join: joinGym, leave: leaveGym, ball: gymBall, team: () => myGymTeam, teams: gymTeams, inGym: () => inGym, debug: () => gymBall.debug() },
  carry: { pick: pickUpNote, drop: dropCarried, state: () => carrying },
  booth: { dj: () => djState, canDJ: () => canDJ(), headcount: () => clubHeadcount(), live: () => voice.djLive() } };

// on-device diagnostics panel — opt in with #debug (or ?debug) in the URL.
// for chasing the "see through walls into other rooms" reports on phones.
let dbg = null;
if (/(\bdebug\b)/.test(location.hash + " " + location.search)) {
  try { dbg = initDebug({ renderer, camera, controls, room: () => aRoomNow() }); window.METRO_DEBUG.dbg = dbg; }
  catch (e) { console.error("debug panel failed", e); }
}

const clock = new THREE.Clock();
let t = 0;
let grimeSaveAt = 0;     // last time we pushed the carpet snapshot to room_state
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  if (xr.presenting()) xr.tick(dt); else controls.update(dt);
  aWorldReady();                       // analytics: world_loaded (first frame)
  if (entered) aSetRoom(aRoomNow());   // analytics: room_entered/exited + session_engaged
  // safety: never leave anyone shut inside the cab. if you're standing in the
  // car at home (not riding, not mid-fade, not in another room) with the doors
  // closed — e.g. you backed out of a password — part them so you can step out.
  if (!elevBusy && !inBoat && !inClub && !inArena && !modalOpen &&
      !$("#fade").classList.contains("dark") &&
      !world.elevatorOpen() && world.inElevatorCab(controls.pos.x, controls.pos.z)) {
    world.setElevatorDoors(true);
  }
  if (activePool && activePool.isPlaying()) {
    activePool.update(dt, { rotate: controls.poolRotate, charging: controls.poolCharging });
    controls.poolRotate = 0;
  }
  // THE GYM: the full-court game runs on foot — tick the ball + refresh the HUD.
  // self-heal: gym movement physics (jump/sprint) must be on whenever you're in
  // the gym, no matter how you got here — otherwise you'd fall back to the plain
  // walk path (no jump, no stamina).
  if (inGym) {
    if (!controls.gym) { controls.gym = true; controls.grounded = true; }
    controls.holdingBall = gymBall.haveBall();   // no boosting while you carry (Echo VR rule)
    gymBall.tick(dt);
    updateGymHud();
    updateDunkMeter();
    if (!gymLive) updateGymWarm();    // keep the ready count fresh as peers come/go
  }
  // basketball is free-roam — tick it every frame with your live pose; it only
  // does anything once you're standing on the court
  if (!inBoat && !inArena && !inClub && !inGym) {
    hoopGame.tick(dt, {
      x: controls.pos.x, z: controls.pos.z, yaw: controls.yaw, pitch: controls.pitch,
      eyeY: 1.62, pressed: controls.pointerDown, locked: controls.locked,
    });
    const onCourt = hoopGame.onCourt();
    if (onCourt && !hoopHinted) {
      hoopHinted = true;
      toast(IS_TOUCH ? "grab a ball — hold 🏀 to wind up, release to shoot"
                     : "you've got a ball — HOLD click to wind up, release to shoot 🏀");
    }
    if (hoopShootBtn) hoopShootBtn.style.display = onCourt ? "block" : "none";
  }
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
  tickStudioDrag();               // a held knob follows the hand each frame
  // the VR cabinet panel: the page's rAF sleeps in a session, so the world
  // loop drives the game and refreshes its texture
  if (vrArcade) {
    arcadeVrFrame(performance.now());
    vrArcade.tex.needsUpdate = true;
  }
  world.tick(dt, controls.pos);
  // each radio rides its own room — full up close, gone by ~7 m, and paused
  // (radio.js cuts the live feed at gain 0) anywhere it isn't audible
  for (const key in radios) {
    const r = radios[key];
    let g = 0;
    if (r.audible()) {
      const d = Math.hypot(controls.pos.x - r.pos.x, controls.pos.z - r.pos.z);
      g = d < 1.4 ? 1 : Math.max(0, 1 - (d - 1.4) / 6);
    }
    r.radio.setGain(g);
  }
  if (carrying) updateCarry();
  // the carpet grimes with traffic, and the vacuum lifts it — bedroom only.
  // while you're vacuuming you DON'T track your own dirt (otherwise you'd
  // leave a fresh trail behind you and the job would never finish)
  if (!inBoat && !inArena && !inClub && !inGym) {
    if (!vacuuming) world.floorTraffic(controls.pos.x, controls.pos.z, dt, 1);
    world.floorTraffic(cat.pos.x, cat.pos.z, dt, 0.6);
    if (vacuuming) {
      world.vacuumStep(controls.pos.x, controls.pos.z, controls.yaw);
      cat.scare(controls.pos.x, controls.pos.z);   // the enemy is loud and it is HERE
    }
    // persist the carpet for everyone on a slow throttle — the room stays as
    // dirty (or as freshly-vacuumed) as the last person left it
    if (world.grimeNeedsSave() && t - grimeSaveAt > 8) {
      grimeSaveAt = t;
      lastGrimeStr = world.grimeSnapshot();
      store.saveRoomFlag("grime", lastGrimeStr).catch(() => {});
    }
  } else if (vacuuming) {
    setVacuuming(false);   // you can't carry it out of the room
  }
  // when YOU change rooms, re-scope which avatars exist (catches every transition
  // path — elevator, password gate, admin jump — without hooking each one)
  const sc = myScope();
  if (sc !== lastMyScope) { lastMyScope = sc; refreshGhostScope(); applyLightCull(sc); world.setRoomCull(sc); }
  ghosts.tick(dt, t, (uid) => voice.level(uid));
  cat.tick(dt, t, controls.pose());
  toyTick(dt, t);
  // the bartender reacts to you only when you're in the bedroom/arcade with him
  bartender.tick(dt, t, (!inBoat && !inArena && !inClub && !inGym) ? controls.pose() : null);
  // the guide belongs to the bedroom only — and crossing any portal has to
  // shut her up, same rule as every other sound in the room
  const guideHome = !inBoat && !inArena && !inClub && !inGym && !inStudio;
  guide.tick(dt, t, guideHome ? controls.pose() : null);
  if (!guideHome && isSpeaking()) stopSpeaking();
  // the arcade mirror renders a live "you" from your own mic level — only while
  // you're in the bedroom/arcade (skip the extra render when off in another room)
  if (!inBoat && !inArena && !inClub && !inGym) mirror.update(dt, voice.selfLevel());
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
  if (inStudio) {
    world.studio.update(dt, sPlayhead(), sPlayhead("synth"));
    // stepping into the doorway counts as using it
    const dp = world.studio.doorPos;
    if (Math.hypot(controls.pos.x - dp.x, controls.pos.z - dp.z) < 0.6) goHome();
  }
  shieldMesh.visible = inArena && !!controls.blocking;
  if (inArena) setThruster(controls.thrusting);
  stepRideCam(dt);                         // nudge the camera while the car travels
  renderer.render(world.scene, camera);
  screen.renderCSS(camera);                // the venue big screen (flat <video> on the wall via CSS3D)
  if (dbg) dbg.tick(dt);                    // diagnostics overlay (only when #debug)
});
