// THE METRO — sfu Edge Function (Cloudflare Realtime SFU broker)
// The venue screen-share publishes ONCE to Cloudflare's SFU, which fans the
// video out to every viewer — so the host's upload stays flat no matter how many
// people watch (P2P mesh made the host upload one copy per viewer, which choked).
//
// This is a thin, locked-down proxy: the browser drives the SFU's session/track
// API, and we just add the App Secret (a server-side secret — never shipped to
// the browser) and forward. Only the SFU endpoints are allowed.
//
// Deploy: Supabase Dashboard → Edge Functions → Deploy new function → name it
// exactly `sfu`, paste this file. Then add Secrets:
//   CF_SFU_APP_ID     = (Cloudflare Realtime → Serverless SFU → your app's ID)
//   CF_SFU_APP_SECRET = (that app's secret/token)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const BASE = "https://rtc.live.cloudflare.com/v1";

// only these SFU paths may be proxied (path is relative to /apps/{appId}/)
function allowed(path) {
  return path === "sessions/new"
    || /^sessions\/[A-Za-z0-9]+\/tracks\/new$/.test(path)
    || /^sessions\/[A-Za-z0-9]+\/renegotiate$/.test(path)
    || /^sessions\/[A-Za-z0-9]+\/tracks\/close$/.test(path);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  const appId = Deno.env.get("CF_SFU_APP_ID");
  const secret = Deno.env.get("CF_SFU_APP_SECRET");
  if (!appId || !secret) return json({ error: "sfu not configured" }, 503);

  let payload;
  try { payload = await req.json(); } catch (e) { return json({ error: "bad request" }, 400); }
  const { path, method, body } = payload || {};
  if (typeof path !== "string" || !allowed(path)) return json({ error: "path not allowed" }, 403);

  try {
    const res = await fetch(`${BASE}/apps/${appId}/${path}`, {
      method: method === "PUT" ? "PUT" : "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: body == null ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    // pass Cloudflare's JSON straight through (status included)
    return new Response(text, { status: res.status, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});
