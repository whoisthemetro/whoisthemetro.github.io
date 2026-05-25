/* ============================================================
   METRO — WEB MIDI INPUT

   Routing rules (no overlap):
   - Each connected device has a routing setting: AUTO | KEYS | DRUMS
   - AUTO  → channel 10 = drums, all other channels = synth
            (matches GM convention; what every DAW does)
   - KEYS  → all notes from this device → synth, regardless of channel
   - DRUMS → all notes from this device → drum sounds
            (GM drum map first, then chromatic fallback for unmapped notes)
   - Settings persist in localStorage so a plugged-in device stays assigned
     between sessions. New devices start in AUTO mode.

   Multi-player friendly: each person plugs in their own controller and
   sets it once. No "press to arm" needed.
   ============================================================ */

window.METRO_MIDI = (function () {
  const STORAGE_KEY = "metro-midi-routes-v1";
  let access = null;
  let inputs = [];                // [{ id, name, mode }]
  let routes = loadRoutes();      // { deviceId: "auto" | "keys" | "drums" }
  const listeners = new Set();    // status change subscribers

  function loadRoutes() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch { return {}; }
  }
  function saveRoutes() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(routes)); } catch {}
  }

  async function init() {
    if (!navigator.requestMIDIAccess) {
      console.info("[MIDI] Web MIDI API not available in this browser");
      emit({ status: "unsupported" });
      return;
    }
    try {
      access = await navigator.requestMIDIAccess({ sysex: false });
      bindAll();
      access.onstatechange = () => bindAll();
      console.info("[MIDI] Connected:", inputs.map(i => i.name).join(", ") || "(no devices)");
    } catch (e) {
      console.warn("[MIDI] requestMIDIAccess failed", e);
      emit({ status: "denied", error: String(e) });
    }
  }

  function bindAll() {
    inputs = [];
    for (const input of access.inputs.values()) {
      input.onmidimessage = (msg) => onMessage(msg, input);
      const mode = routes[input.id] || "auto";
      inputs.push({ id: input.id, name: input.name, manufacturer: input.manufacturer || "", mode });
    }
    emit({ status: "ready", devices: inputs.slice() });
  }

  function setMode(deviceId, mode) {
    if (!["auto", "keys", "drums"].includes(mode)) return;
    routes[deviceId] = mode;
    saveRoutes();
    // update local cache
    const d = inputs.find(i => i.id === deviceId);
    if (d) d.mode = mode;
    emit({ status: "ready", devices: inputs.slice() });
  }

  // Remember which target each MIDI note was sent to, so noteOff goes
  // to the same place even if routing changes mid-press.
  const activeMidiTarget = new Map(); // "deviceId:note" → "synth" | "drums"

  function onMessage(msg, input) {
    const A = window.METRO_AUDIO;
    if (!A) return;
    A.ensureCtx();
    const [status, d1, d2] = msg.data;
    const cmd = status & 0xf0;
    const channel = status & 0x0f;
    const key = input.id + ":" + d1;

    const isNoteOn  = (cmd === 0x90 && d2 > 0);
    const isNoteOff = (cmd === 0x80) || (cmd === 0x90 && d2 === 0);

    if (isNoteOn) {
      const mode = routes[input.id] || "auto";
      const target = decideTarget(mode, channel);
      activeMidiTarget.set(key, target);
      if (target === "drums") {
        const drumName = A.midi.drumMap[d1] || chromaticDrum(d1);
        A.drums.play(drumName, d2);
      } else {
        // sustained — release on noteOff
        A.synth.noteOn(d1, d2);
      }
    } else if (isNoteOff) {
      const target = activeMidiTarget.get(key);
      activeMidiTarget.delete(key);
      if (target === "synth") A.synth.noteOff(d1);
      // drums are one-shot — nothing to do
    }
  }

  function decideTarget(mode, channel) {
    if (mode === "keys")  return "synth";
    if (mode === "drums") return "drums";
    // AUTO: pure channel routing. GM channel 10 = drums.
    if (channel === 9) return "drums";
    // Else synth. We deliberately ignore the GM drum-map note-range
    // here so a low piano note doesn't trigger a kick drum.
    return "synth";
  }

  // For DRUMS-forced mode: map any note not in the GM drum table
  // to one of our 8 drum sounds by pitch class.
  const CHROMATIC_DRUM = [
    "kick", "clap", "snare", "clap",
    "hihat", "openhat", "clap", "tom1",
    "clap", "tom2", "clap", "tom3",
  ];
  function chromaticDrum(note) {
    return CHROMATIC_DRUM[((note % 12) + 12) % 12];
  }

  function emit(payload) { listeners.forEach(fn => { try { fn(payload); } catch (e) {} }); }
  function onEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  return {
    init, onEvent, setMode,
    isReady: () => !!access,
    devices: () => inputs.slice(),
    modeFor: (deviceId) => routes[deviceId] || "auto",
  };
})();

// Browsers require a user gesture before the MIDI permission prompt.
document.addEventListener("click", () => {
  if (!window.METRO_MIDI.isReady()) window.METRO_MIDI.init();
}, { once: true });
