/* ============================================================
   THE METRO — analytics (PostHog, client-side, env-gated)
   No key in config.js → a total no-op (clean local dev). With a key,
   it loads PostHog and sends a small set of EXPLORATION/INTERACTION
   events (see docs/analytics.md). Everything is aggregated/throttled
   by the callers — never per-frame or per-note — so it can't lag the
   render thread or blow the free-tier quota.

   track(event, props) is always safe to call; it also keeps a tiny
   in-memory ring (window.METRO_DEBUG.analytics) for eyeballing.
   ============================================================ */

const buf = [];   // recent events, for debugging / smoke tests

export function initAnalytics() {
  const cfg = window.METRO_CONFIG || {};
  const key = cfg.POSTHOG_KEY;
  if (!key) return;                                   // no key → stay a no-op
  const host = cfg.POSTHOG_HOST || "https://us.i.posthog.com";
  // official PostHog web snippet — loads array.js from the region's assets host
  !function (t, e) { var o, n, p, r; e.__SV || (window.posthog = e, e._i = [], e.init = function (i, s, a) { function g(t, e) { var o = e.split("."); 2 == o.length && (t = t[o[0]], e = o[1]), t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))) } } (p = t.createElement("script")).type = "text/javascript", p.crossOrigin = "anonymous", p.async = !0, p.src = s.api_host.replace(".i.posthog.com", "-assets.i.posthog.com") + "/static/array.js", (r = t.getElementsByTagName("script")[0]).parentNode.insertBefore(p, r); var u = e; for (void 0 !== a ? u = e[a] = [] : a = "posthog", u.people = u.people || [], u.toString = function (t) { var e = "posthog"; return "posthog" !== a && (e += "." + a), t || (e += " (stub)"), e }, u.people.toString = function () { return u.toString(1) + ".people (stub)" }, o = "init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId".split(" "), n = 0; n < o.length; n++)g(u, o[n]); e._i.push([i, s, a]) }, e.__SV = 1) }(document, window.posthog || []);
  window.posthog.init(key, {
    api_host: host,
    capture_pageview: true,           // auto $pageview = "landed"
    autocapture: false,               // a 3D canvas world — no DOM-click autocapture noise; we send our own
    persistence: "localStorage",
    session_recording: { maskAllInputs: true },   // mask typed text (chat / notes / names); recording is enabled per-project
  });
}

export function track(event, props = {}) {
  buf.push({ event, props, t: Date.now() });
  if (buf.length > 200) buf.shift();
  try { window.posthog && window.posthog.capture && window.posthog.capture(event, props); } catch (e) {}
}

export function analyticsBuffer() { return buf; }
