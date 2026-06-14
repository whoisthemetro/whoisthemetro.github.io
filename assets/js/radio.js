// radio.js — a real radio you can scan through.
//
// Unlike everything else in the room, this is NOT synthesized: it streams the
// live Sveriges Radio channels (the same feeds the boat already leans on for
// Gotland weather — the whole place runs on a Swedish clock). The feeds are
// public mp3 streams off api.sr.se and they send CORS, so a plain <audio>
// element plays them straight, no proxy. We deliberately DON'T route it through
// the WebAudio master — a bare element can't be tainted by the stream's redirect
// hops, and the broadcast is already mastered. Volume is ridden by hand instead
// (main.js fades it with distance + silences it when you leave the bedroom).
//
// "Scan through" is the whole point: the dial sweeps a curated band of channels,
// low → high like real FM. The MHz are invented flavor; the ids are real.

import { radioStatic } from "./ambience.js";

const SR = (id) => `https://www.sverigesradio.se/topsy/direkt/srapi/${id}.mp3`;

// ordered like a dial — talk at the bottom, oddities up top. hz is decoration.
export const STATIONS = [
  { id: 132,  hz: "87.9",  name: "P1",            tag: "news & talk" },
  { id: 163,  hz: "89.6",  name: "P2",            tag: "classical · world" },
  { id: 164,  hz: "92.4",  name: "P3",            tag: "pop & new music" },
  { id: 2576, hz: "94.0",  name: "P3 Din Gata",   tag: "hip-hop" },
  { id: 2562, hz: "98.2",  name: "P2 Musik",      tag: "all music, no talk" },
  { id: 205,  hz: "100.2", name: "P4 Gotland",    tag: "the island — same sky as the boat" },
  { id: 701,  hz: "103.3", name: "P4 Stockholm",  tag: "the city" },
  { id: 224,  hz: "104.5", name: "SR Sápmi",      tag: "Sámi radio" },
  { id: 226,  hz: "106.1", name: "SR Finska",     tag: "in Finnish" },
  { id: 2755, hz: "107.9", name: "Radioapan",     tag: "the kids' channel 🐒" },
].map((s) => ({ ...s, url: SR(s.id) }));

let el = null;
let wantOn = false;       // the user pressed power
let idx = 0;              // which station the dial sits on
let userVol = 0.82;       // the volume knob, 0..1
let gain = 1;             // distance/room multiplier, set from main.js each frame
let onStatus = null;      // (info) => void — UI + the 3D dial react
let state = "off";        // off · tuning · live · error

try {
  const sv = parseInt(localStorage.getItem("metro.radio.idx"), 10);
  if (sv >= 0 && sv < STATIONS.length) idx = sv;
  const vv = parseFloat(localStorage.getItem("metro.radio.vol"));
  if (vv >= 0 && vv <= 1) userVol = vv;
} catch (e) {}

function status() {
  if (onStatus) onStatus(info());
}
export function radioInfo() { return info(); }
function info() {
  return { idx, total: STATIONS.length, station: STATIONS[idx], on: wantOn, state, vol: userVol };
}

function applyVol() {
  if (el) el.volume = Math.max(0, Math.min(1, userVol * gain));
}

// the element only actually pulls bytes when the user wants it AND it'd be
// audible — walking off / leaving the room (gain→0) pauses the live feed so we
// aren't streaming to nobody. coming back rejoins at the live edge.
function sync() {
  if (!el) return;
  const shouldPlay = wantOn && gain > 0.0005;
  applyVol();
  if (shouldPlay && el.paused) {
    el.play().catch(() => {});       // a denied autoplay just leaves it paused
  } else if (!shouldPlay && !el.paused) {
    el.pause();
  }
}

function loadStation(i, withStatic) {
  idx = (i % STATIONS.length + STATIONS.length) % STATIONS.length;
  try { localStorage.setItem("metro.radio.idx", String(idx)); } catch (e) {}
  if (withStatic) radioStatic();
  if (el) {
    state = "tuning";
    el.src = STATIONS[idx].url;
    el.load();
    sync();
  }
  status();
}

export function initRadio(statusCb) {
  onStatus = statusCb || null;
  if (el) { status(); return; }
  el = new Audio();
  el.preload = "none";              // nothing streams until power-on
  el.volume = userVol;
  // a live stream should never look "buffered behind" — keep it pinned to now
  el.addEventListener("playing", () => { state = "live"; status(); });
  el.addEventListener("waiting", () => { if (wantOn) { state = "tuning"; status(); } });
  el.addEventListener("error", () => { if (wantOn) { state = "error"; status(); } });
  el.addEventListener("stalled", () => { if (wantOn && el.paused) sync(); });
  status();
}

export function radioPower(on) {
  wantOn = on;
  if (on) {
    if (el && !el.src) loadStation(idx, false);
    else { state = "tuning"; sync(); status(); }
  } else {
    if (el) el.pause();
    state = "off";
    status();
  }
}

export function radioToggle() { radioPower(!wantOn); return wantOn; }

export function radioTune(i) { loadStation(i, wantOn); }      // jump to a station
export function radioScan(dir) { loadStation(idx + (dir < 0 ? -1 : 1), wantOn); }

export function radioVolume(v) {
  userVol = Math.max(0, Math.min(1, v));
  try { localStorage.setItem("metro.radio.vol", String(userVol)); } catch (e) {}
  applyVol();
}

// main.js feeds this every frame from the camera↔radio distance (and 0 when
// you're off in another room).
export function radioGain(g) {
  const ng = Math.max(0, Math.min(1, g));
  if (Math.abs(ng - gain) < 0.001) return;
  gain = ng;
  sync();
}
