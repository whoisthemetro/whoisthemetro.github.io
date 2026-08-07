/* ============================================================
   THE METRO — the actual weather outside
   Open-Meteo (free, no key) for Hawthorne, CA. If it's raining
   on the real window, it rains on this one.

   State shape: { clouds: 0..1, rain: 0|1|2, fog: bool }
   Polls every 15 min; falls back to the last known state, then
   to clear skies.
   ============================================================ */

const URL = "https://api.open-meteo.com/v1/forecast"
  + "?latitude=33.9164&longitude=-118.3526"
  + "&current=weather_code,cloud_cover,precipitation,temperature_2m";

const DEFAULT = { clouds: 0, rain: 0, fog: false, tempC: null };
const listeners = new Set();
let current = load() || DEFAULT;

function load() {
  try { return JSON.parse(localStorage.getItem("metro.wx") || "null"); } catch (e) { return null; }
}
function save(wx) {
  try { localStorage.setItem("metro.wx", JSON.stringify(wx)); } catch (e) {}
}

// WMO weather codes → our three knobs
function interpret(code, cloudCover, precip, tempC) {
  const wx = { clouds: Math.max(0, Math.min(1, (cloudCover ?? 0) / 100)), rain: 0, fog: false, tempC: tempC ?? null };
  if (code >= 45 && code <= 48) wx.fog = true;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) wx.rain = 1;
  if ((code >= 63 && code <= 67) || code === 82 || code >= 95) wx.rain = 2;
  if (precip > 2.5) wx.rain = 2;
  if (wx.rain) wx.clouds = Math.max(wx.clouds, 0.75);
  return wx;
}

async function poll() {
  try {
    const res = await fetch(URL);
    const data = await res.json();
    const cur = data.current || {};
    current = interpret(cur.weather_code ?? 0, cur.cloud_cover, cur.precipitation ?? 0, cur.temperature_2m);
    save(current);
    listeners.forEach(fn => { try { fn(current); } catch (e) {} });
  } catch (e) {
    // offline or API down — keep whatever we had
  }
}

export const weather = {
  get current() { return current; },
  onUpdate: fn => { listeners.add(fn); return () => listeners.delete(fn); },
  start() {
    poll();
    setInterval(poll, 15 * 60 * 1000);
  },
};
