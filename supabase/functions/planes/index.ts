/* ============================================================
   THE METRO — the LAX feed, proxied

   airplanes.live went 403 in August 2026 ("contact us for access"), which
   took the window's flight strips with it. The obvious replacements —
   adsb.lol and adsb.fi — both serve the data happily but send NO
   access-control-allow-origin, so a browser on whoisthemetro.com can't
   read them. This is the one hop that fixes that.

   It is deliberately NOT a general proxy. The coordinates are baked in, so
   the only thing this URL can ever return is the sky over the bedroom
   window — pointing it at anything else isn't a matter of a query string.
   Two upstreams, tried in order, because the whole reason this exists is
   that a free feed disappeared without warning.

   Returns the airplanes.live shape ({ ac: [...] }) whatever it talked to,
   so planes.js keeps the parser it already had.
   ============================================================ */

const LAT = 33.9164, LON = -118.3526, DIST_NM = 10;

const UPSTREAMS = [
  { name: "adsb.lol", url: `https://api.adsb.lol/v2/point/${LAT}/${LON}/${DIST_NM}` },
  { name: "adsb.fi", url: `https://opendata.adsb.fi/api/v2/lat/${LAT}/lon/${LON}/dist/${DIST_NM}` },
];

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

// the room polls every 5 minutes; a shared 60s cache means a crowd costs the
// upstream the same as one person
let cache: { at: number; body: string } | null = null;
const CACHE_MS = 60_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (cache && Date.now() - cache.at < CACHE_MS) {
    return new Response(cache.body, {
      headers: { ...CORS, "content-type": "application/json", "x-metro-cache": "hit" },
    });
  }

  for (const up of UPSTREAMS) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const res = await fetch(up.url, { signal: ctl.signal, headers: { accept: "application/json" } });
      clearTimeout(t);
      if (!res.ok) continue;
      const data = await res.json();
      // both feeds answer with `ac`, but adsb.fi has used `aircraft` before
      const ac = Array.isArray(data.ac) ? data.ac
        : Array.isArray(data.aircraft) ? data.aircraft : null;
      if (!ac) continue;
      const body = JSON.stringify({ ac, src: up.name });
      cache = { at: Date.now(), body };
      return new Response(body, {
        headers: { ...CORS, "content-type": "application/json", "x-metro-src": up.name },
      });
    } catch (_e) { /* try the next one */ }
  }

  // every upstream is down: say so plainly and let the room fall back to its
  // own ambient planes rather than hanging
  return new Response(JSON.stringify({ ac: [], src: "none" }), {
    status: 200,
    headers: { ...CORS, "content-type": "application/json", "x-metro-src": "none" },
  });
});
