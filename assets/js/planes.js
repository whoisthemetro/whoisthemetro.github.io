/* ============================================================
   THE METRO — real traffic on the LAX approach
   Polls the OpenSky Network (free, no key) for aircraft in the
   corridor over Hawthorne every 5 minutes, estimates when each
   one passes overhead from its position + ground speed, and
   fires the window flyover at that moment. When you see a jet
   cross the glass, there really is one over the house.

   Falls back silently to occasional ambient planes if the API
   is down or rate-limited.
   ============================================================ */

// box around Hawthorne / the LAX east approach
const URL = "https://opensky-network.org/api/states/all"
  + "?lamin=33.84&lomin=-118.62&lamax=34.05&lomax=-118.08";
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
      for (const s of data.states || []) {
        // [icao, callsign, country, t1, t2, lon, lat, baroAlt, onGround, vel(m/s), track, ...]
        const lon = s[5], lat = s[6], alt = s[7], ground = s[8], vel = s[9], track = s[10];
        if (ground || lon == null || alt == null || alt > 3200 || !vel || vel < 40) continue;
        // westbound (the landing flow over Hawthorne) heads roughly 200–330°
        const westbound = track != null && track > 200 && track < 330;
        const overhead = Math.abs(lon - HOME_LON) < 0.04;
        if (!westbound && !overhead) continue;
        // meters east of the house, positive = still inbound
        const distM = (lon - HOME_LON) * 111320 * Math.cos((lat || 33.92) * Math.PI / 180);
        const etaS = overhead ? 1 : distM > 0 ? distM / vel : -1;
        if (etaS >= 0 && etaS < POLL_MS / 1000 && scheduled < 7) {
          scheduled++;
          timers.push(setTimeout(() => { try { onFlyover(); } catch (e) {} }, etaS * 1000));
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
