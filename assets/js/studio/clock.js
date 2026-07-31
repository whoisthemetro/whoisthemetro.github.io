/* ============================================================
   THE STUDIO — the shared clock

   Everything in this room is timed against one number: what time is
   it, really. Not what your laptop thinks — laptops are routinely
   seconds off, and a second is two bars at 120bpm.

   So we NTP against the database. Ask what time it is, note how long
   the round trip took, assume the two legs were about even, and you
   know your own clock's error to within a few milliseconds. From then
   on `clock.now()` is the same number in every browser in the room.

   In local mode (no backend, two tabs on one machine) there is nothing
   to correct — both tabs already read the same system clock — so the
   offset is zero and that is not a fallback, it's the right answer.
   ============================================================ */

import { store } from "../store.js";

const SAMPLES   = 4;      // probes per sync — we keep the luckiest one
const GAP_MS    = 70;     // breathing room between probes
const RESYNC_MS = 45000;  // clocks drift; check back now and then

let offset  = 0;          // clock.now() = Date.now() + offset
let rtt     = Infinity;   // the round trip we based that offset on
let source  = "local";    // "server" once we've actually heard from the db
let timer   = null;

async function probe() {
  const t0 = Date.now();
  const { data, error } = await store.client.rpc("studio_now");
  const t3 = Date.now();
  if (error) throw error;
  const server = Number(data);
  if (!isFinite(server)) throw new Error("clock replied with nonsense");
  const trip = t3 - t0;
  // the server stamped its clock somewhere inside our round trip. with no
  // way to know where, the middle is the best guess — and the error in that
  // guess can never exceed half the trip.
  return { off: server - (t0 + trip / 2), trip };
}

// "the function isn't installed" and "that probe was unlucky" need very
// different responses, so tell them apart.
function notInstalled(e) {
  const s = `${e?.code || ""} ${e?.message || ""} ${e?.details || ""}`.toLowerCase();
  return s.includes("pgrst202") || s.includes("could not find the function") || s.includes("404");
}

async function resync() {
  if (store.mode !== "supabase" || !store.client) { source = "local"; return; }
  let best = null;
  for (let i = 0; i < SAMPLES; i++) {
    try {
      const s = await probe();
      if (!best || s.trip < best.trip) best = s;
    } catch (e) {
      // a missing migration will still be missing three probes from now, and
      // people are standing at the door waiting. give up immediately — the HUD
      // says "clock not synced" in red, which is the honest thing to show.
      if (notInstalled(e)) { source = "local"; return; }
      // anything else is just an unlucky probe; that's what the others are for
    }
    if (i < SAMPLES - 1) await new Promise(r => setTimeout(r, GAP_MS));
  }
  // fastest round trip wins. a slow probe spent its extra time queued
  // somewhere and we have no way to know which leg ate it, so its midpoint
  // guess is the least trustworthy of the batch.
  if (best) {
    offset = best.off;
    rtt = best.trip;
    source = "server";
  }
}

export const clock = {
  async start() {
    await resync();
    clearInterval(timer);
    timer = setInterval(resync, RESYNC_MS);
  },
  // shared studio time, unix ms. the one number everyone agrees on.
  now: () => Date.now() + offset,
  // for the HUD, so a bad sync is visible instead of just sounding wrong
  info: () => ({ source, rtt, offset, accurate: source === "server" || store.mode !== "supabase" }),
};
