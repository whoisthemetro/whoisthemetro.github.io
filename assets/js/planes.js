/* ============================================================
   THE METRO — real traffic on the LAX approach
   Polls airplanes.live (free, no key, CORS-open) for aircraft
   within ~10 nm of the house every 5 minutes, estimates when
   each one crosses overhead from its position and ground speed,
   and fires the window flyover at that moment — with the actual
   flight number, aircraft type and altitude for the flight strip.

   When a jet crosses the glass, one is really up there.
   Falls back to occasional ambient planes if the API is down.
   ============================================================ */

const URL = "https://api.airplanes.live/v2/point/33.9164/-118.3526/10";
const HOME_LON = -118.3526;
const POLL_MS = 5 * 60 * 1000;

let live = false;
let timers = [];

export function startPlanes(onFlyover, onLiveChange) {
  async function poll() {
    try {
      const res = await fetch(URL);
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      for (const t of timers) clearTimeout(t);
      timers = [];
      let scheduled = 0;
      for (const a of data.ac || []) {
        const alt = a.alt_baro;                       // feet (or "ground")
        const gs = a.gs;                              // knots
        const lon = a.lon, lat = a.lat, track = a.track;
        if (alt === "ground" || typeof alt !== "number" || alt > 7000) continue;
        if (!gs || gs < 80 || lon == null) continue;

        const westbound = track != null && track > 200 && track < 330;
        const eastbound = track != null && track > 50 && track < 130;
        const overhead = Math.abs(lon - HOME_LON) < 0.04;
        if (!westbound && !eastbound && !overhead) continue;

        // meters to travel before crossing our longitude
        const distM = (lon - HOME_LON) * 111320 * Math.cos((lat || 33.92) * Math.PI / 180);
        const velMs = gs * 0.5144;
        let etaS;
        if (overhead) etaS = 1;
        else if (westbound && distM > 0) etaS = distM / velMs;   // east of us, heading west
        else if (eastbound && distM < 0) etaS = -distM / velMs;  // west of us, heading east
        else continue;

        if (etaS >= 0 && etaS < POLL_MS / 1000 && scheduled < 7) {
          scheduled++;
          const info = {
            flight: (a.flight || "").trim() || a.r || "unknown",
            type: a.t || "",
            alt: Math.round(alt / 100) * 100,
            label: westbound ? "ARRIVING LAX" : eastbound ? "DEPARTED LAX" : "OVERHEAD",
            // which way it crosses the glass: arrivals sink off to the
            // west (left → right), departures climb out east (right → left)
            dir: eastbound ? -1 : 1,
          };
          timers.push(setTimeout(() => { try { onFlyover(info); } catch (e) {} }, etaS * 1000));
        }
      }
      if (!live) { live = true; onLiveChange?.(true); }
    } catch (e) {
      // API down or rate-limited — ambient mode takes over
      if (live) { live = false; onLiveChange?.(false); }
    }
  }
  poll();
  setInterval(poll, POLL_MS);
}

export const planesAreLive = () => live;
