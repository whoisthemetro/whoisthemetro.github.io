/* ============================================================
   THE METRO — earned accessories

   The room slowly furnishes itself around the people who keep
   showing up. Counters live in localStorage (per visitor, per
   browser — same as identity), tick up with real interactions
   and real time spent, and unlock small low-poly things that
   appear in the room and stay.
   ============================================================ */

const KEY = "metro.progress";

/* The gold record by the entry door was retired 2026-08-25. Anyone who had
   already earned it still has "gold" in their unlocked list; nothing looks it
   up any more, so it reads as a no-op rather than an error. */
export const ACCESSORIES = [
  { id: "plant",  title: "a snake plant on the windowsill",
    hint: "spend some time here",            test: s => s.seconds >= 600 },
  { id: "yarn",   title: "a yarn ball for the cat",
    hint: "the cat decides this one",        test: s => (s.pets || 0) >= 15 },
  { id: "disco",  title: "a disco ball for the arcade",
    hint: "the cabinets remember you",       test: s => (s.arcade || 0) >= 5 },
];

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
}
function write(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
}

let state = { seconds: 0, unlocked: [], ...read() };
let onUnlock = null;

function check() {
  for (const a of ACCESSORIES) {
    if (state.unlocked.includes(a.id) || !a.test(state)) continue;
    state.unlocked.push(a.id);
    write(state);
    if (onUnlock) try { onUnlock(a, true); } catch (e) {}
  }
}

export const progress = {
  // cb(accessory, isNew) — called for already-earned pieces at boot
  // (isNew false, no fanfare) and again whenever a new one unlocks
  start(cb) {
    onUnlock = cb;
    for (const a of ACCESSORIES) {
      if (state.unlocked.includes(a.id)) try { cb(a, false); } catch (e) {}
    }
    // time only counts while the tab is actually being looked at
    setInterval(() => {
      if (document.visibilityState !== "visible") return;
      state.seconds += 5;
      if (state.seconds % 30 === 0) write(state);
      check();
    }, 5000);
    check();
  },
  bump(kind, n = 1) {
    state[kind] = (state[kind] || 0) + n;
    write(state);
    check();
  },
  earned: () => [...state.unlocked],
};
