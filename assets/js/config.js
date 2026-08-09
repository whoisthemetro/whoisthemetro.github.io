/* ============================================================
   THE METRO — configuration
   Fill these in after creating your free Supabase project
   (see SETUP.md — takes about 3 minutes).

   Until then the room runs in LOCAL MODE: everything works,
   but notes only persist in your own browser.

   The anon key is safe to publish — it's designed to be public.
   What people can do with it is locked down by the database
   policies in supabase/schema.sql.
   ============================================================ */
window.METRO_CONFIG = {
  SUPABASE_URL: "https://donnxntnewmkzrycugpn.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvbm54bnRuZXdta3pyeWN1Z3BuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNjU3OTEsImV4cCI6MjA5NjY0MTc5MX0.rOl_otqZqZPM7czYVWLHFLxLMSAcYj7mChlrS9xytps",

  // PostHog product analytics (optional). Paste your PostHog Project API key
  // (it starts with "phc_" and is safe to publish). Leave empty to disable
  // analytics entirely. Set POSTHOG_HOST to your project's region:
  // US "https://us.i.posthog.com" / EU "https://eu.i.posthog.com". See docs/analytics.md.
  POSTHOG_KEY: "",
  POSTHOG_HOST: "https://us.i.posthog.com",

  // Venue screen-share TURN servers. Normally left unset: the `turn` edge
  // function mints short-lived Cloudflare credentials at boot (the secret stays
  // server-side). Only set this to hard-code your own ICE servers, e.g.
  //   ICE_SERVERS: [{ urls: "turn:your.turn:3478", username: "u", credential: "p" }],
  // It overrides the edge function + the STUN/openrelay fallback.
  // ICE_SERVERS: [],
};
