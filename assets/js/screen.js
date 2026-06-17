/* ============================================================
   THE METRO — the venue big screen

   A Twitch / YouTube stream hung high on the booth wall, shared by
   everyone in THE VENUE. Cross-origin players can't be drawn onto a
   WebGL texture, so we float a real <iframe> in 3D with CSS3DRenderer
   and composite it on its own layer just above the canvas. The audio
   comes straight from the platform — every client pulls the same
   stream, so there's nothing to relay and nothing to sync but the URL.

   Hard browser truth we work with, not against: a cross-origin player
   can only be *started with sound* by a direct click ON the player —
   a keypress or postMessage from the parent page doesn't count as a
   gesture inside the iframe. So the screen is clickable (native Twitch/
   YouTube controls), it boots muted+autoplay for a best-effort silent
   preview, and main.js gives desktop a "focus the screen" mode (the
   cursor frees so you can click play / unmute). Touch just taps it.
   ============================================================ */
import * as THREE from "three";
import { CSS3DRenderer, CSS3DObject } from "three/addons/renderers/CSS3DRenderer.js";

// where it hangs: the north (booth) wall of THE VENUE, high above the dj.
// CLUB={x:-40,z:0}, depth 9 → north wall at z=-4.5, ceiling 5.6. sits just
// proud of the wall, above the dj's head, raked a touch down at the floor.
const POS = { x: -40, y: 3.8, z: -4.32 };
const TILT = 0.1;                  // small downward rake toward the dance floor
const PX_W = 1280, PX_H = 720;     // the element's own pixel canvas (16:9)
const WORLD_W = 4.8;               // metres wide in the room
const SCALE = WORLD_W / PX_W;      // css px → world metres

let cssRenderer = null, cssScene = null, obj = null, frame = null, iframe = null;
let mounted = false;
let cur = null;                    // { platform, kind, id } currently loaded

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
  frame.style.pointerEvents = "auto";   // the player itself is clickable (native controls)

  iframe = document.createElement("iframe");
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "0";
  iframe.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
  iframe.setAttribute("allowfullscreen", "");
  frame.appendChild(iframe);

  obj = new CSS3DObject(frame);
  obj.position.set(POS.x, POS.y, POS.z);
  obj.rotation.x = TILT;
  obj.scale.setScalar(SCALE);
  cssScene.add(obj);
}

// the embed URL. muted=true so the silent preview can autoplay; the viewer
// clicks the player to unmute (the only thing browsers accept for sound).
function srcFor(s) {
  if (!s) return "";
  if (s.platform === "twitch") {
    const host = location.hostname || "localhost";
    const base = "https://player.twitch.tv/?parent=" + encodeURIComponent(host) +
      "&parent=localhost&autoplay=true&muted=true";
    return s.kind === "video" ? base + "&video=" + encodeURIComponent(s.id)
                              : base + "&channel=" + encodeURIComponent(s.id);
  }
  if (s.platform === "youtube") {
    return "https://www.youtube.com/embed/" + encodeURIComponent(s.id) +
      "?autoplay=1&mute=1&playsinline=1&rel=0";
  }
  return "";
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

  // put a stream up (or re-show one). idempotent: same stream = no reload, so the
  // periodic re-announce never restarts playback (and never resets the volume).
  show(s) {
    if (!s) return;
    build();
    const same = cur && cur.platform === s.platform && cur.kind === s.kind && cur.id === s.id;
    if (mounted && same) return;
    cur = { platform: s.platform, kind: s.kind, id: s.id };
    iframe.src = srcFor(cur);
    frame.style.display = "";
    mounted = true;
  },

  // stop drawing + KILL THE AUDIO (blanking the src is what actually stops it),
  // but remember what was playing so re-entering the venue brings it back
  hide() {
    if (iframe) iframe.src = "";
    if (frame) frame.style.display = "none";
    mounted = false;
  },

  // turn it off for good (admin cleared the screen)
  clear() { cur = null; this.hide(); },

  active: () => mounted,
  has: () => !!cur,
  current: () => cur,

  resize() { if (cssRenderer) cssRenderer.setSize(innerWidth, innerHeight); },
  render(camera) { if (cssRenderer && mounted) cssRenderer.render(cssScene, camera); },
};
