// THE METRO — turn Edge Function
// Mints SHORT-LIVED Cloudflare TURN credentials so the venue screen-share can
// relay video between people whose browsers can't make a direct peer path
// (two phones on the same wifi, anyone on cellular, etc). The Cloudflare API
// token is a SECRET and stays here on the server — the browser only ever gets
// throwaway credentials, so nothing sensitive ships in the public repo.
//
// Deploy: Supabase Dashboard → Edge Functions → Deploy new function →
// name it exactly `turn`, paste this file, deploy.
// Then, in Cloudflare: dashboard → Realtime → TURN → create a TURN key; copy
// the Turn Key ID and the API Token. Back in Supabase → Edge Functions → turn
// → Secrets, add:
//   CF_TURN_KEY_ID    = (the Turn Key ID)
//   CF_TURN_API_TOKEN = (the API Token)
// (Cloudflare TURN is free with a generous allowance and no card required.)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  const keyId = Deno.env.get("CF_TURN_KEY_ID");
  const token = Deno.env.get("CF_TURN_API_TOKEN");
  if (!keyId || !token) return json({ error: "turn not configured" }, 503);

  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: 86400 }),   // 24h is plenty for a session/event
      },
    );
    if (!res.ok) return json({ error: "cloudflare turn error", status: res.status }, 502);
    const data = await res.json();
    // Cloudflare hands back ONE iceServers object ({urls:[...], username, credential});
    // RTCPeerConnection wants an ARRAY of such objects.
    const servers = Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers];
    return json({ iceServers: servers });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
