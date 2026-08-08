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

export function setupPads({ act, state, rec, drumRows, stepCount, nPats, canPlay, onOpen, onClose, blocked }) {
  const overlay = $("pads");
  const gridEl = $("pads-grid");
  const patsEl = $("pads-pats");
  if (!overlay || !gridEl) return { open() {}, close() {}, isOpen: () => false, showButton() {} };

  const padEls = [];

  // ---- the 4×4, built bottom row first so pad 1 lands bottom-left ----
  for (let r = ROWS - 1; r >= 0; r--) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const b = document.createElement("button");
      b.textContent = LABEL[drumRows[i]] || drumRows[i] || "";
      b.dataset.pad = String(i);
      // pointerdown, not click: a pad has to fire the instant you touch it
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); hit(i, 1); });
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
    act.trigger("drums", i, { vel });
    flash(i);
  }
  function flash(i) {
    const el = padEls[i];
    if (!el) return;
    el.classList.add("lit");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("lit"), 110);
  }

  // ---- keeping the chrome honest ----
  function paint() {
    $("pads-stepnum").textContent = String(stepCount());
    $("pads-rec").classList.toggle("on", rec.on());
    const cur = (state.xport && state.xport.pat) || 0;
    patEls.forEach((b, i) => b.classList.toggle("on", i === cur));
  }

  $("pads-rec").addEventListener("click", () => { rec.toggle(); paint(); });
  $("pads-undo").addEventListener("click", () => { act.undo(); paint(); });
  $("pads-clear").addEventListener("click", () => { act.clearDrums(); paint(); });
  $("pads-step-down").addEventListener("click", () => { act.setSteps(stepCount() - 1); paint(); });
  $("pads-step-up").addEventListener("click", () => { act.setSteps(stepCount() + 1); paint(); });
  $("pads-close").addEventListener("click", () => close());

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
    painting = setInterval(paint, 400);         // the room can change these under us
    onOpen && onOpen();
  }
  function close() {
    overlay.classList.remove("show");
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
