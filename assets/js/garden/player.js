/* ============================================================
   THE GARDEN — the player

   One track at a time, streamed, positioned at its own plant.

   Three decisions in here that aren't obvious:

   1. STREAMING, not decodeAudioData. Every other sound in this world is
      a short one-shot decoded into an AudioBuffer, and that's right for
      a fart or a snare. A ten-minute track decoded to an AudioBuffer is
      10 x 60 x 48000 x 2 x 4 = 230 MB of float32 sitting in RAM, and it
      won't make a sound until the whole file has downloaded. So the
      garden uses an <audio> element as the source: it range-requests,
      starts in about a second, and costs a buffer's worth of memory no
      matter how long the piece is.

   2. ONE element for the whole garden, reused. A MediaElementAudioSource
      node is welded to its element for life and there's no clean way to
      dispose of one, so making a new pair per click leaks a node per
      click. Setting .src on the same element re-points the same graph.

   3. crossOrigin = "anonymous". The audio lives on R2, so it's
      cross-origin, and a cross-origin media element without CORS is
      TAINTED: it plays through a speaker but a MediaElementAudioSource
      reading it outputs SILENCE, with no error anywhere. The bucket has
      to send Access-Control-Allow-Origin to match (see the R2 notes in
      tools/garden/README.md). This is the one that eats an afternoon.

   The panner puts each track at its plant, so walking the path is the
   crossfade — you hear a piece come up out of the bed as you approach
   and fall behind you as you go on. refDistance is deliberately wide so
   the track you PICKED stays with you for most of the path.
   ============================================================ */

import * as THREE from "three";
import { audioGraph } from "../ambience.js";
import { GARDEN_BASE, GARDEN_TRACKS } from "../garden-catalog.js";

const urlOf = (t) => {
  const base = GARDEN_BASE || "assets/audio/garden/";
  return base.endsWith("/") ? base + t.file : `${base}/${t.file}`;
};

export function makeGardenPlayer(opts = {}) {
  const { onState = () => {}, onError = () => {} } = opts;

  let el = null, src = null, panner = null, gain = null, ana = null, data = null;
  let curId = null, wantId = null, loading = false;

  // built on the first click, not at boot: nobody should pay for an audio
  // graph they never walk into, and the AudioContext is only running by then
  function ensure() {
    if (el) return true;
    const { ctx, master } = audioGraph();
    if (!ctx || !master) return false;

    el = new Audio();
    el.crossOrigin = "anonymous";      // see (3) above — silence without it
    el.preload = "none";               // don't fetch until something is picked
    el.loop = false;
    el.addEventListener("error", () => {
      loading = false;
      const t = GARDEN_TRACKS.find((x) => x.id === curId);
      onError(t ? t.title : "that one", curId);
      curId = null;
      push();
    });
    el.addEventListener("playing", () => { loading = false; push(); });
    el.addEventListener("ended", () => { curId = null; push(); });

    src = ctx.createMediaElementSource(el);
    gain = ctx.createGain();
    gain.gain.value = 0.9;
    panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 7;            // wide: your pick follows you down the path
    panner.rolloffFactor = 0.7;
    panner.maxDistance = 46;
    ana = ctx.createAnalyser();
    ana.fftSize = 256;
    ana.smoothingTimeConstant = 0.75;
    data = new Uint8Array(ana.frequencyBinCount);

    src.connect(gain).connect(panner).connect(master);
    gain.connect(ana);                 // metering tap, before the panner
    return true;
  }

  function setPos(p) {
    if (!panner || !p) return;
    if (panner.positionX) {
      panner.positionX.value = p.x; panner.positionY.value = p.y; panner.positionZ.value = p.z;
    } else panner.setPosition(p.x, p.y, p.z);   // older Safari
  }

  let level = 0;
  function push() {
    onState({
      id: curId, loading,
      progress: (el && el.duration) ? el.currentTime / el.duration : 0,
      time: el ? el.currentTime : 0,
      dur: (el && el.duration) || 0,
      level,
    });
  }

  /* ---- the one thing this room does: play that one, stop the other ---- */
  function play(id, worldPos) {
    if (!ensure()) return false;
    const t = GARDEN_TRACKS.find((x) => x.id === id);
    if (!t) return false;
    // clicking the plant that's already playing stops it — a plant is a
    // switch, not a button, so you never have to look for a stop control
    if (curId === id && !el.paused) { stop(); return true; }

    const { ctx } = audioGraph();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});

    wantId = id;
    curId = id;
    loading = true;
    setPos(worldPos);
    el.preload = "auto";
    el.src = urlOf(t);
    el.currentTime = 0;
    push();
    el.play().catch((e) => {
      // an autoplay refusal shouldn't look like a broken track
      loading = false;
      if (wantId === id) { onError(t.title, id); curId = null; push(); }
    });
    return true;
  }

  function stop() {
    wantId = null;
    if (el) { try { el.pause(); } catch (e) {} el.removeAttribute("src"); try { el.load(); } catch (e) {} }
    curId = null;
    loading = false;
    level = 0;
    push();
  }

  /* ---- per frame: the listener follows the camera, the meter feeds the plant ----
     Nothing else in this world uses positional audio, so the AudioListener has
     never been pointed anywhere. It has to be driven every frame or every
     track plays as if it were behind your left ear at the origin. */
  const fwd = new THREE.Vector3(), up = new THREE.Vector3();
  function tick(camera) {
    if (!el || !panner) return { id: null, progress: 0, level: 0 };
    const { ctx } = audioGraph();
    if (ctx && camera) {
      const L = ctx.listener;
      const p = camera.position;
      camera.getWorldDirection(fwd);
      up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      if (L.positionX) {
        const at = ctx.currentTime;
        L.positionX.setTargetAtTime(p.x, at, 0.02);
        L.positionY.setTargetAtTime(p.y, at, 0.02);
        L.positionZ.setTargetAtTime(p.z, at, 0.02);
        L.forwardX.setTargetAtTime(fwd.x, at, 0.02);
        L.forwardY.setTargetAtTime(fwd.y, at, 0.02);
        L.forwardZ.setTargetAtTime(fwd.z, at, 0.02);
        L.upX.setTargetAtTime(up.x, at, 0.02);
        L.upY.setTargetAtTime(up.y, at, 0.02);
        L.upZ.setTargetAtTime(up.z, at, 0.02);
      } else {
        L.setPosition(p.x, p.y, p.z);
        L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
      }
    }
    // one RMS number out of the analyser — this is what makes the plant breathe
    // with the track instead of on a timer. TIME domain, not frequency: the
    // frequency bytes are a dB scale, so their "RMS" pegs at 1.0 on anything
    // louder than a whisper and the plant just sits at full brightness.
    if (ana && curId) {
      ana.getByteTimeDomainData(data);
      let s = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        s += v * v;
      }
      const rms = Math.sqrt(s / data.length);
      level += (Math.min(1, rms * 3.2) - level) * 0.25;
    } else level += (0 - level) * 0.2;

    return {
      id: curId, loading,
      progress: (el.duration && !isNaN(el.duration)) ? el.currentTime / el.duration : 0,
      time: el.currentTime, dur: el.duration || 0, level,
    };
  }

  return {
    play, stop, tick,
    playing: () => curId,
    isLoading: () => loading,
    // is there anywhere for the audio to actually come from? GARDEN_BASE is
    // empty until the R2 bucket is wired up, and the encoded tracks are
    // gitignored — so on a deployed site an empty base means every plant in
    // the garden is a dead switch. main.js keeps the gate shut until this is
    // true (see tools/garden/README.md).
    configured: () => !!GARDEN_BASE,
    // the room goes quiet behind you: the studio does the same thing with its
    // master gain, but a stream should stop DOWNLOADING too, not just mute
    leave: stop,
    tracks: GARDEN_TRACKS,
  };
}
