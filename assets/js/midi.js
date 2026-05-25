/* ============================================================
   METRO — WEB MIDI INPUT
   Auto-connects to any plugged-in MIDI device.
   - Channel 10 (drums) or notes in GM drum map → drum sounds
   - All other notes → synth
   ============================================================ */

window.METRO_MIDI = (function () {
  let access = null;
  let inputs = [];
  let listeners = new Set();

  async function init() {
    if (!navigator.requestMIDIAccess) {
      console.info("[MIDI] Web MIDI API not available");
      notify({ status: "unsupported" });
      return;
    }
    try {
      access = await navigator.requestMIDIAccess({ sysex: false });
      bindAll();
      access.onstatechange = () => bindAll();
      notify({ status: "ready", devices: inputs.map(i => i.name) });
      console.info("[MIDI] Connected:", inputs.map(i => i.name).join(", ") || "(no devices)");
    } catch (e) {
      console.warn("[MIDI] requestMIDIAccess failed", e);
      notify({ status: "denied", error: String(e) });
    }
  }

  function bindAll() {
    inputs = [];
    for (const input of access.inputs.values()) {
      input.onmidimessage = onMessage;
      inputs.push(input);
    }
    notify({ status: "ready", devices: inputs.map(i => i.name) });
  }

  function onMessage(msg) {
    const A = window.METRO_AUDIO;
    if (!A) return;
    A.ensureCtx();
    const [status, d1, d2] = msg.data;
    const cmd = status & 0xf0;
    const channel = status & 0x0f; // 0-15

    if (cmd === 0x90 && d2 > 0) {
      // Note on
      // GM convention: channel 10 (index 9) = drums
      const treatAsDrum = (channel === 9);
      const drumName = A.midi.drumMap[d1];
      if (treatAsDrum || drumName) {
        // route to drum
        const name = drumName || "snare";
        A.drums.play(name, d2);
        emit({ kind: "drum", name, velocity: d2 });
      } else {
        // route to synth
        A.synth.playNote(d1, 0.5, d2);
        emit({ kind: "note", midi: d1, velocity: d2 });
      }
    } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {
      // Note off — synth is single-shot envelope so nothing to do
    } else if (cmd === 0xb0) {
      // CC — could map to FX in future
    }
  }

  function emit(payload) {
    listeners.forEach(fn => { try { fn(payload); } catch (e) {} });
  }
  function onEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function notify(payload) { /* status updates, future UI */ }

  return { init, onEvent, isReady: () => !!access, devices: () => inputs.map(i => i.name) };
})();

// Auto-init on first user gesture (browsers require gesture for MIDI prompt).
document.addEventListener("click", () => {
  if (!window.METRO_MIDI.isReady()) window.METRO_MIDI.init();
}, { once: true });
