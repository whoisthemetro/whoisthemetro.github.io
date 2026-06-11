// THE METRO — demo-email Edge Function
// Emails each private message to you, with the audio file attached.
// Deploy: Supabase Dashboard → Edge Functions → Deploy new function →
// name it exactly `demo-email`, paste this file, deploy.
// Then add a secret: Edge Functions → demo-email → Secrets:
//   RESEND_API_KEY = (your key from resend.com — free tier is fine)
// Resend's free tier sends to YOUR OWN email without any domain setup.

import { createClient } from "npm:@supabase/supabase-js@2";

const TO = "whoisthemetro@gmail.com";
const MAX_ATTACH = 20 * 1024 * 1024;   // stay under Resend's request cap

Deno.serve(async (req) => {
  try {
    const { name, text, url, file_path } = await req.json();

    const attachments: { filename: string; content: string }[] = [];
    if (file_path) {
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data, error } = await sb.storage.from("demos").download(file_path);
      if (!error && data && data.size <= MAX_ATTACH) {
        const buf = new Uint8Array(await data.arrayBuffer());
        let bin = "";
        const CHUNK = 0x8000;
        for (let i = 0; i < buf.length; i += CHUNK) {
          bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
        }
        attachments.push({
          filename: file_path.split("-").slice(1).join("-") || "demo.mp3",
          content: btoa(bin),
        });
      }
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "THE METRO <onboarding@resend.dev>",
        to: [TO],
        subject: `📬 ${name || "someone"} left something on your computer`,
        text:
          `${text || ""}\n\n` +
          (url ? `link: ${url}\n` : "") +
          (file_path && !attachments.length ? `file too big to attach — grab it from the demos bucket: ${file_path}\n` : "") +
          `\n— sent from the room`,
        attachments,
      }),
    });

    return new Response(JSON.stringify({ ok: res.ok }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
