/* ============================================================
   THE METRO — the venue big screen

   A Twitch / YouTube stream hung high on the booth wall, shared by
   everyone in THE VENUE. Cross-origin players can't be drawn onto a
   WebGL texture, so we float a real player in 3D with CSS3DRenderer
   and composite it on its own layer just above the canvas. The audio
   comes straight from the platform — every client pulls the same
   stream, so there's nothing to relay and nothing to sync but the URL.

   We drive playback through the platforms' official JS player APIs
   (Twitch.Player / YT.Player) rather than a bare <iframe>, because a
   bare iframe's autoplay attribute is unreliable — browsers suppress
   it inside a CSS 3D transform and on iOS. With the API we call
   play()/mute() programmatically (muted autoplay is allowed
   everywhere), and a keypress / tap unmutes.
   ============================================================ */
import * as THREE from "three";
import { CSS3DRenderer, CSS3DObject } from "three/addons/renderers/CSS3DRenderer.js";

const IS_TOUCH = matchMedia("(pointer: coarse)").matches;

// where it hangs: the north (booth) wall of THE VENUE, high above the dj.
// CLUB={x:-40,z:0}, depth 9 → north wall at z=-4.5, ceiling 5.6. sits just
// proud of the wall, above the dj's head, raked a touch down at the floor.
const POS = { x: -40, y: 3.8, z: -4.32 };
const TILT = 0.1;                  // small downward rake toward the dance floor
const PX_W = 1280, PX_H = 720;     // the element's own pixel canvas (16:9)
const WORLD_W = 4.8;               // metres wide in the room
const SCALE = WORLD_W / PX_W;      // css px → world metres

let cssRenderer = null, cssScene = null, obj = null, frame = null, mount = null;
let mounted = false, muted = true;
let cur = null;                    // { platform, kind, id } currently loaded
let player = null;                 // the live Twitch.Player / YT.Player instance

/* ---- lazy loaders for the two player SDKs ---- */
let twitchQ = [], twitchLoading = false;
function loadTwitch(cb) {
  if (window.Twitch && window.Twitch.Player) return cb(true);
  twitchQ.push(cb);
  if (twitchLoading) return;
  twitchLoading = true;
  const sc = document.createElement("script");
  sc.src = "https://player.twitch.tv/js/embed/v1.js";
  sc.onload = () => { twitchLoading = false; const q = twitchQ; twitchQ = []; q.forEach(f => f(true)); };
  sc.onerror = () => { twitchLoading = false; const q = twitchQ; twitchQ = []; q.forEach(f => f(false)); };
  document.head.appendChild(sc);
}
let ytQ = [], ytLoading = false;
function loadYT(cb) {
  if (window.YT && window.YT.Player) return cb(true);
  ytQ.push(cb);
  if (ytLoading) return;
  ytLoading = true;
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => { try { prev && prev(); } catch (e) {} const q = ytQ; ytQ = []; q.forEach(f => f(true)); };
  const sc = document.createElement("script");
  sc.src = "https://www.youtube.com/iframe_api";
  sc.onerror = () => { ytLoading = false; const q = ytQ; ytQ = []; q.forEach(f => f(false)); };
  document.head.appendChild(sc);
}

function build() {
  if (cssRenderer) return;
  cssRenderer = new CSS3DRenderer();
  cssRenderer.setSize(innerWidth, innerHeight);
  const el = cssRenderer.domElement;
  el.style.position = "fixed";
  el.style.inset = "0";
  el.style.zIndex = "5";           // above the canvas (0), below the hud (10) + modals (90)
  el.style.pointerEvents = "none"; // the empty layer never eats a click — only the screen does
  document.body.appendChild(el);
  cssScene = new THREE.Scene();

  frame = document.createElement("div");
  frame.style.width = PX_W + "px";
  frame.style.height = PX_H + "px";
  frame.style.background = "#000";
  frame.style.border = "10px solid #0b0a12";
  frame.style.boxShadow = "0 0 60px rgba(138,92,255,.45), inset 0 0 0 2px #1c1730";
  frame.style.overflow = "hidden";
  frame.style.display = "none";
  // on touch there's no pointer-lock, so let people tap the player (start/unmute);
  // on desktop keep it click-through so it can't break the look controls (use M)
  frame.style.pointerEvents = IS_TOUCH ? "auto" : "none";

  mount = document.createElement("div");
  mount.style.width = "100%";
  mount.style.height = "100%";
  frame.appendChild(mount);

  obj = new CSS3DObject(frame);
  obj.position.set(POS.x, POS.y, POS.z);
  obj.rotation.x = TILT;
  obj.scale.setScalar(SCALE);
  cssScene.add(obj);
}

// tear down the live player + its iframe (this is what stops the audio)
function dropPlayer() {
  try { if (player && player.destroy) player.destroy(); } catch (e) {}
  try { if (player && player.pause) player.pause(); } catch (e) {}
  player = null;
  if (mount) mount.innerHTML = "";
}

// a fresh host element for the SDK to turn into an iframe
function freshHost() {
  mount.innerHTML = "";
  const host = document.createElement("div");
  host.style.width = "100%";
  host.style.height = "100%";
  mount.appendChild(host);
  return host;
}

// last-resort path if an SDK won't load: a bare iframe with autoplay params
function fallbackIframe(s, m) {
  const host = freshHost();
  const ifr = document.createElement("iframe");
  ifr.style.width = "100%"; ifr.style.height = "100%"; ifr.style.border = "0";
  ifr.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
  ifr.setAttribute("allowfullscreen", "");
  if (s.platform === "twitch") {
    const host2 = location.hostname || "localhost";
    ifr.src = "https://player.twitch.tv/?parent=" + encodeURIComponent(host2) +
      "&parent=localhost&autoplay=true&muted=" + (m ? "true" : "false") +
      (s.kind === "video" ? "&video=" + encodeURIComponent(s.id) : "&channel=" + encodeURIComponent(s.id));
  } else {
    ifr.src = "https://www.youtube.com/embed/" + encodeURIComponent(s.id) +
      "?autoplay=1&playsinline=1&rel=0&mute=" + (m ? "1" : "0");
  }
  host.appendChild(ifr);
}

function loadTwitchPlayer(s, m) {
  loadTwitch((ok) => {
    if (cur?.id !== s.id || cur?.platform !== "twitch") return;   // superseded while loading
    if (!ok) return fallbackIframe(s, m);
    try {
      const host = freshHost();
      const opts = { parent: [location.hostname || "localhost", "localhost"], muted: m, autoplay: true, width: "100%", height: "100%" };
      if (s.kind === "video") opts.video = s.id; else opts.channel = s.id;
      player = new Twitch.Player(host, opts);
      player.addEventListener(Twitch.Player.READY, () => {
        try { player.setMuted(m); if (!m) player.setVolume(1); player.play(); } catch (e) {}
      });
    } catch (e) { fallbackIframe(s, m); }
  });
}

function loadYTPlayer(s, m) {
  loadYT((ok) => {
    if (cur?.id !== s.id || cur?.platform !== "youtube") return;
    if (!ok) return fallbackIframe(s, m);
    try {
      const host = freshHost();
      player = new YT.Player(host, {
        videoId: s.id, width: "100%", height: "100%",
        playerVars: { autoplay: 1, mute: m ? 1 : 0, playsinline: 1, rel: 0, modestbranding: 1 },
        events: { onReady: (e) => { try { if (m) e.target.mute(); else { e.target.unMute(); e.target.setVolume(100); } e.target.playVideo(); } catch (err) {} } },
      });
    } catch (e) { fallbackIframe(s, m); }
  });
}

export const screen = {
  // parse a pasted link (or a bare twitch channel name) into {platform,kind,id}
  parse(input) {
    const t = (input || "").trim();
    if (!t) return null;
    try {
      if (/youtu\.?be/i.test(t)) {
        const u = new URL(t.startsWith("http") ? t : "https://" + t);
        let id = "";
        if (u.hostname.includes("youtu.be")) id = u.pathname.slice(1);
        else if (u.searchParams.get("v")) id = u.searchParams.get("v");
        else { const m = u.pathname.match(/\/(?:live|embed|shorts)\/([^/?]+)/); if (m) id = m[1]; }
        return id ? { platform: "youtube", kind: "video", id } : null;
      }
      if (/twitch\.tv/i.test(t)) {
        const u = new URL(t.startsWith("http") ? t : "https://" + t);
        const vm = u.pathname.match(/\/videos\/(\d+)/);
        if (vm) return { platform: "twitch", kind: "video", id: vm[1] };
        const ch = u.pathname.split("/").filter(Boolean)[0];
        return ch ? { platform: "twitch", kind: "channel", id: ch } : null;
      }
    } catch (e) {}
    // no host → treat a bare word as a twitch channel
    if (/^[a-z0-9_]{2,30}$/i.test(t)) return { platform: "twitch", kind: "channel", id: t };
    return null;
  },

  // put a stream up (or re-show one). idempotent: same stream + a live player =
  // just sync the mute state, so the periodic re-announce never restarts it.
  show(s, m) {
    if (!s) return;
    build();
    const wantMute = m !== undefined ? m : muted;
    const same = cur && cur.platform === s.platform && cur.kind === s.kind && cur.id === s.id;
    if (mounted && same && player) { this.setMuted(wantMute); return; }
    cur = { platform: s.platform, kind: s.kind, id: s.id };
    muted = wantMute;
    dropPlayer();
    frame.style.display = "";
    mounted = true;
    if (cur.platform === "twitch") loadTwitchPlayer(cur, muted);
    else if (cur.platform === "youtube") loadYTPlayer(cur, muted);
  },

  // stop drawing + KILL THE AUDIO (tearing down the player stops it), but
  // remember what was playing so re-entering the venue brings it back
  hide() {
    dropPlayer();
    if (frame) frame.style.display = "none";
    mounted = false;
  },

  // turn it off for good (admin cleared the screen)
  clear() { cur = null; this.hide(); },

  active: () => mounted,
  has: () => !!cur,
  current: () => cur,
  isMuted: () => muted,
  setMuted(m) {
    muted = !!m;
    if (!player) return;
    try {
      if (cur && cur.platform === "twitch") { player.setMuted(muted); if (!muted) player.setVolume(1); }
      else if (cur && cur.platform === "youtube") { if (muted) player.mute(); else { player.unMute(); player.setVolume(100); } }
    } catch (e) {}
  },
  toggleMuted() { this.setMuted(!muted); return muted; },

  resize() { if (cssRenderer) cssRenderer.setSize(innerWidth, innerHeight); },
  render(camera) { if (cssRenderer && mounted) cssRenderer.render(cssScene, camera); },
};
