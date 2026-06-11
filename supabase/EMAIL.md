# Getting private messages (with audio attached) in your email

The inbox in the room works without any of this — this is the optional
"email me everything as attachments" layer. Takes ~5 minutes.

1. **Resend account** — [resend.com](https://resend.com) → sign up with
   **whoisthemetro@gmail.com** (important: the free tier without a domain
   only delivers to the account owner's own address — which is exactly
   what we want). Create an **API key**, copy it.

2. **Deploy the function** — Supabase Dashboard → **Edge Functions** →
   **Deploy a new function** → name it exactly `demo-email` → paste the
   contents of `supabase/functions/demo-email/index.ts` → Deploy.

3. **Add the secret** — on the function's page → **Secrets** →
   `RESEND_API_KEY` = the key from step 1.

That's it. `inbox.sql` already installed the database trigger that calls
the function on every new private message — if the function isn't
deployed yet, the call fails silently and the message still lands in
your in-room inbox. Once deployed, every message arrives at
whoisthemetro@gmail.com with the audio file attached (files over ~20 MB
arrive as a storage path instead — grab them from Storage → demos).
