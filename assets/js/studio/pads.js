/* ============================================================
   THE STUDIO — the pads

   An MPC laid over the drum machine: sixteen pads in four rows, a record
   arm, undo, clear, the loop length and the four patterns. Built for a
   phone held upright, which is why it's DOM and not another canvas panel
   — thumbs want real hit targets, and the browser already knows how to
   make those.

   It also listens for a real controller over Web MIDI. Notes play the
   kit whether the overlay is open or not, so you can stand in the room
   with sticks in your hands and the sheet of glass out of the way.
   ============================================================ */

// pad 1 is bottom-left, the way an MPC numbers them — so the DOM has to be
// built from the bottom row up.
const ROWS = 4, COLS = 4;

const LABEL = {
  kick: "KICK", sub: "SUB", snare: "SNARE", clap: "CLAP",
  rim: "RIM", perc: "PERC", tomLo: "TOM LO", tomMid: "TOM MID",
  tomHi: "TOM HI", hat: "HAT", openhat: "OPEN HAT", ride: "RIDE",
  crash: "CRASH", cowbell: "COWBELL", shaker: "SHAKER", tamb: "TAMB",
};

const $ = (id) => document.getElementById(id);

export function setupPads({ act, state, rec, drumRows, stepCount, nPats, canPlay, onOpen, onClose, blocked,
                            playhead, onStep, metroClick, curGrid, audio }) {
  const overlay = $("pads");
  const gridEl = $("pads-grid");
  const patsEl = $("pads-pats");
  if (!overlay || !gridEl) return { open() {}, close() {}, isOpen: () => false, showButton() {} };

  const padEls = [];
  const seqEl = $("pads-seq-cells");
  // the strip follows the last voice you struck — that's the row you're
  // most likely wondering about
  let focusRow = 0;
  let metroOn = false;
  let holdTimer = null;

  // ---- the 4×4, built bottom row first so pad 1 lands bottom-left ----
  for (let r = ROWS - 1; r >= 0; r--) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const b = document.createElement("button");
      b.textContent = LABEL[drumRows[i]] || drumRows[i] || "";
      b.dataset.pad = String(i);
      // pointerdown, not click: a pad has to fire the instant you touch it.
      // hold it instead and the pad opens its sample drawer.
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        hit(i, 1);
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => openSampler(i), 520);
      });
      for (const ev of ["pointerup", "pointerleave", "pointercancel"]) {
        b.addEventListener(ev, () => clearTimeout(holdTimer));
      }
      gridEl.appendChild(b);
      padEls[i] = b;
    }
  }

  // ---- the four patterns ----
  const patEls = [];
  for (let i = 0; i < nPats; i++) {
    const b = document.createElement("button");
    b.textContent = "ABCD"[i] || String(i + 1);
    b.addEventListener("click", () => { act.setPattern(i); paint(); });
    patsEl.appendChild(b);
    patEls[i] = b;
  }

  // ---- striking a pad ----
  function hit(i, vel) {
    if (!canPlay()) return;
    focusRow = i;                              // the strip follows your hands
    act.trigger("drums", i, { vel });
    flash(i);
    paintSeq();
  }
  function flash(i) {
    const el = padEls[i];
    if (!el) return;
    el.classList.add("lit");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("lit"), 110);
  }

  // ---- the sequencer slice ----
  // one row of the grid — the voice you last played — so you can see where
  // your hits are landing, and fix one by tapping it.
  const seqCells = [];
  function buildSeq() {
    const n = stepCount();
    if (seqCells.length === n) return;
    seqEl.textContent = "";
    seqCells.length = 0;
    for (let i = 0; i < n; i++) {
      const c = document.createElement("span");
      if (i % 4 === 0) c.classList.add("beat");
      c.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        act.toggleStep("drums", focusRow, i);
        paintSeq();
      });
      seqEl.appendChild(c);
      seqCells.push(c);
    }
  }
  function paintSeq() {
    if (!seqEl || !curGrid) return;
    buildSeq();
    const row = curGrid("drums")[focusRow] || [];
    const head = playhead ? playhead() : -1;
    $("pads-seq-label").textContent = LABEL[drumRows[focusRow]] || "";
    for (let i = 0; i < seqCells.length; i++) {
      seqCells[i].classList.toggle("on", !!row[i]);
      seqCells[i].classList.toggle("head", i === head);
    }
  }

  // ---- keeping the chrome honest ----
  function paint() {
    $("pads-stepnum").textContent = String(stepCount());
    $("pads-rec").classList.toggle("on", rec.on());
    $("pads-metro").classList.toggle("on", metroOn);
    $("pads-mute").classList.toggle("on", !!state.dev.drums.mute);
    $("pads-mute").classList.toggle("mute", !!state.dev.drums.mute);
    const cur = (state.xport && state.xport.pat) || 0;
    const queued = state.xport ? state.xport.qpat : -1;
    patEls.forEach((b, i) => {
      b.classList.toggle("on", i === cur);
      // a queued switch blinks until the bar turns over and it lands
      b.classList.toggle("queued", queued >= 0 && i === queued);
    });
    paintSeq();
  }

  $("pads-rec").addEventListener("click", () => { rec.toggle(); paint(); });
  $("pads-undo").addEventListener("click", () => { act.undo(); paint(); });
  // CLEAR is scoped to the voice you're working on; CLR ALL takes the pattern
  $("pads-clear").addEventListener("click", () => { act.clearRow(focusRow); paint(); });
  $("pads-clear-all").addEventListener("click", () => { act.clearDrums(); paint(); });
  $("pads-mute").addEventListener("click", () => { act.toggleMute("drums"); paint(); });
  $("pads-step-down").addEventListener("click", () => { act.setSteps(stepCount() - 1); paint(); });
  $("pads-step-up").addEventListener("click", () => { act.setSteps(stepCount() + 1); paint(); });
  $("pads-metro").addEventListener("click", () => { metroOn = !metroOn; paint(); });
  $("pads-close").addEventListener("click", () => close());

  // the click track. local only — it's a thing for your ears, not the room's.
  if (onStep && metroClick) {
    onStep((pos, abs, at) => {
      if (!metroOn || !canPlay()) return;
      if (pos % 4 === 0) metroClick(at, pos === 0);   // the downbeat gets the accent
    });
  }

  /* ---------- the sampler: a long press opens a pad's sample drawer ---------- */

  const sampler = $("sampler");
  let smpRow = 0;
  const patchOf = (row) => (state.dev.drums.kit && state.dev.drums.kit[row]) || null;

  // the library list is built once — the packs don't change mid-session
  const listEl = $("sampler-list");
  const listBtns = [];
  if (listEl && audio) {
    for (const pack of audio.SAMPLE_PACKS) {
      pack.files.forEach((f, i) => {
        const b = document.createElement("button");
        b.textContent = `${pack.name} ${String(i + 1).padStart(2, "0")}`;
        b.dataset.url = pack.base + f;
        b.addEventListener("click", () => pickSample(b.dataset.url));
        listEl.appendChild(b);
        listBtns.push(b);
      });
    }
  }

  function pickSample(url) {
    const old = patchOf(smpRow) || {};
    act.setPad(smpRow, { url, start: old.start || 0, end: old.end == null ? 1 : old.end,
                         semis: old.semis || 0, gain: old.gain == null ? 1 : old.gain });
    audio.loadSample(url).then(() => { drawWave(); preview(); });
    paintSampler();
  }

  function preview() {
    const p = patchOf(smpRow);
    if (p && p.url) audio.playSample(p.url, audio.audioTime() + 0.01,
      { out: audio.channel("drums"), start: p.start, end: p.end, semis: p.semis, gain: p.gain });
    else act.trigger("drums", smpRow, { record: false });
  }

  // sliders write the patch live but only commit (version bump + wire) on
  // release — dragging shouldn't broadcast sixty edits a second
  function bindSlider(id, valId, read, write, show) {
    const el = $(id);
    el.addEventListener("input", () => {
      const p = patchOf(smpRow);
      if (p) { write(p, +el.value); $(valId).textContent = show(+el.value); drawWave(); }
    });
    el.addEventListener("change", () => {
      const p = patchOf(smpRow);
      if (!p) return;
      act.setPad(smpRow, p);
      preview();
    });
    return { el, read, show, valId };
  }
  const sliders = [
    bindSlider("smp-start", "smp-start-v", p => Math.round((p.start || 0) * 100),
      (p, v) => { p.start = Math.min(v, (p.end == null ? 100 : p.end * 100) - 3) / 100; }, v => v + "%"),
    bindSlider("smp-end", "smp-end-v", p => Math.round((p.end == null ? 1 : p.end) * 100),
      (p, v) => { p.end = Math.max(v, (p.start || 0) * 100 + 3) / 100; }, v => v + "%"),
    bindSlider("smp-pitch", "smp-pitch-v", p => p.semis || 0,
      (p, v) => { p.semis = v; }, v => (v > 0 ? "+" : "") + v),
    bindSlider("smp-gain", "smp-gain-v", p => Math.round((p.gain == null ? 1 : p.gain) * 100),
      (p, v) => { p.gain = v / 100; }, v => v + "%"),
  ];

  function drawWave() {
    const cv = $("sampler-wave");
    if (!cv) return;
    const c = cv.getContext("2d");
    c.clearRect(0, 0, cv.width, cv.height);
    const p = patchOf(smpRow);
    const buf = p && p.url && audio ? audio.sampleBuf(p.url) : null;
    if (!buf) {
      c.fillStyle = "#3a4450"; c.font = "12px ui-monospace, monospace"; c.textAlign = "center";
      c.fillText(p && p.url ? "loading…" : "built-in voice — pick a sample below", cv.width / 2, cv.height / 2 + 4);
      return;
    }
    const data = buf.getChannelData(0);
    const mid = cv.height / 2, stride = Math.max(1, Math.floor(data.length / cv.width));
    c.strokeStyle = "#54708a"; c.beginPath();
    for (let x = 0; x < cv.width; x++) {
      let peak = 0;
      const base = x * stride;
      for (let k = 0; k < stride; k += 8) peak = Math.max(peak, Math.abs(data[base + k] || 0));
      c.moveTo(x + 0.5, mid - peak * mid * 0.92);
      c.lineTo(x + 0.5, mid + peak * mid * 0.92);
    }
    c.stroke();
    // dim everything outside the trim, and mark the edges
    const sx = (p.start || 0) * cv.width, ex = (p.end == null ? 1 : p.end) * cv.width;
    c.fillStyle = "rgba(10,13,16,0.75)";
    c.fillRect(0, 0, sx, cv.height); c.fillRect(ex, 0, cv.width - ex, cv.height);
    c.fillStyle = "#ffb347";
    c.fillRect(sx, 0, 2, cv.height); c.fillRect(ex - 2, 0, 2, cv.height);
  }

  function paintSampler() {
    $("sampler-title").textContent = LABEL[drumRows[smpRow]] || "";
    const p = patchOf(smpRow);
    const file = p && p.url ? p.url.split("/").pop() : "built-in";
    $("sampler-file").textContent = file;
    listBtns.forEach(b => b.classList.toggle("on", !!p && b.dataset.url === p.url));
    for (const sl of sliders) {
      const v = p ? sl.read(p) : +sl.el.getAttribute("value");
      sl.el.value = v;
      $(sl.valId).textContent = sl.show(v);
    }
    drawWave();
  }

  function openSampler(row) {
    smpRow = row;
    overlay.classList.add("sampling");
    paintSampler();
    const on = listBtns.find(b => b.classList.contains("on"));
    if (on) on.scrollIntoView({ block: "center" });
  }
  function closeSampler() { overlay.classList.remove("sampling"); }

  $("sampler-close").addEventListener("click", closeSampler);
  $("smp-play").addEventListener("click", preview);
  $("smp-builtin").addEventListener("click", () => { act.setPad(smpRow, null); paintSampler(); preview(); });

  /* ---------- a real controller ---------- */

  // General MIDI / MPC both start their pad bank at note 36, so that's the
  // happy path; anything else wraps into the sixteen so no hit is silent.
  const noteToPad = (n) => (n >= 36 && n <= 51 ? n - 36 : ((n % 16) + 16) % 16);

  function midiMessage(e) {
    const [status, note, vel] = e.data;
    const cmd = status & 0xf0;
    if (cmd !== 0x90 || !vel) return;          // note-on with real velocity only
    hit(noteToPad(note), Math.max(0.25, vel / 127));
  }

  function sayMidi(names) {
    const el = $("pads-midi");
    if (!el) return;
    el.textContent = names.length ? `midi: ${names.join(", ").slice(0, 40)}` : "no midi";
    el.classList.toggle("live", names.length > 0);
  }

  let midiTried = false;
  async function initMidi() {
    if (midiTried || !navigator.requestMIDIAccess) { if (!navigator.requestMIDIAccess) sayMidi([]); return; }
    midiTried = true;
    try {
      const access = await navigator.requestMIDIAccess();
      const bind = () => {
        const names = [];
        access.inputs.forEach((input) => {
          input.onmidimessage = midiMessage;   // idempotent: re-binding is just reassignment
          names.push(input.name || "controller");
        });
        sayMidi(names);
      };
      bind();
      access.onstatechange = bind;             // plugged in after the fact? still works
    } catch (e) {
      sayMidi([]);
    }
  }

  /* ---------- the way in ---------- */

  const btn = document.createElement("button");
  btn.id = "pads-btn";
  btn.textContent = "[ pads ]";
  btn.addEventListener("click", () => open());
  document.body.appendChild(btn);

  let painting = null;
  function open() {
    if (blocked && blocked()) return;
    overlay.classList.add("show");
    paint();
    initMidi();                                // asks permission on a real gesture
    painting = setInterval(paint, 90);          // fast enough to carry the playhead
    onOpen && onOpen();
  }
  function close() {
    overlay.classList.remove("show");
    closeSampler();
    clearInterval(painting); painting = null;
    onClose && onClose();
  }

  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("show")) close();
  });

  return {
    open, close,
    isOpen: () => overlay.classList.contains("show"),
    showButton: (on) => btn.classList.toggle("show", !!on),
    // the controller should work with the sheet of glass put away
    listen: initMidi,
  };
}
