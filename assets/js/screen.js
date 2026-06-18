/* ============================================================
   THE METRO — the venue big screen (live video on the wall)

   The "watch-party" model (what Teleparty / Watch2Gether / Hubs all do):
   everyone loads the SAME stream URL and the live edge keeps them in sync —
   no media relayed through us, no per-viewer cost. The picture is a real
   THREE.VideoTexture on the booth wall, so it never pauses when you move
   (the wall is a texture, not a DOM element), and a walk-in just starts
   playing the same URL at the live edge.

   The source must be CORS-clean (a cross-origin player can't be textured):
   an HLS .m3u8 or an .mp4. For a Twitch/YouTube event the streamer adds a
   second OBS output to Cloudflare Stream Live, which hands back a CORS HLS
   link to paste in the booth.

   No click to watch: the <video> autoplays MUTED (always allowed), and we
   unmute on the first input the visitor makes (they're already walking /
   clicking), so sound just comes on. Audio is room-scoped — muted + paused
   the moment you leave the venue. iOS keep-alive: the <video> stays a 2px,
   barely-there, ON-DOM element (never display:none) so WebKit keeps
   decoding it into the texture.
   ============================================================ */
import * as THREE from "three";

// the screen on the booth wall (north wall of THE VENUE).
// CLUB={x:-40,z:0}, depth 9 → wall at z=-4.5, ceiling 5.6.
const POS = { x: -40, y: 3.5, z: -4.36 };
const W = 5.0, H = 2.81;           // 16:9, in metres

let mesh = null, labelCv = null, labelTex = null, videoTex = null;
let video = null, hls = null, Hls = null;
let cur = null;                    // { url } | { live:true } currently on, or null
let inRoom = false;                // in the venue → play + (armed) audio
let unmuteArmed = false;
let noAutoUnmute = false;          // the host's own wall: don't auto-unmute (they hear the tab)

function isHls(u) { return /\.m3u8(\?|#|$)/i.test(u || ""); }
function labelOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return "live"; } }

/* ---- the wall: video texture when playing, a "dark" card otherwise ---- */
function paintLabel() {
  const g = labelCv.getContext("2d"), c = labelCv;
  g.fillStyle = "#0b0a12"; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "#2a2738"; g.lineWidth = 10; g.strokeRect(6, 6, c.width - 12, c.height - 12);
  g.textAlign = "center"; g.fillStyle = "#2a2738";
  g.font = "bold 92px system-ui, sans-serif"; g.fillText("THE BIG SCREEN", c.width / 2, c.height / 2 - 8);
  g.font = "44px system-ui, sans-serif"; g.fillText("dark — nothing's on right now", c.width / 2, c.height / 2 + 66);
  labelTex.needsUpdate = true;
}
function setWall() {
  if (!mesh) return;
  mesh.material.map = (cur && videoTex) ? videoTex : labelTex;
  mesh.material.needsUpdate = true;
}

function ensureVideo() {
  if (video) return;
  video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.playsInline = true; video.setAttribute("playsinline", "");
  video.muted = true; video.autoplay = true; video.loop = false; video.preload = "auto";
  // iOS keep-alive: on-DOM + nominally visible (never display:none), but a 2px speck
  video.style.cssText = "position:fixed;top:0;left:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1;";
  document.body.appendChild(video);
  videoTex = new THREE.VideoTexture(video);
  videoTex.colorSpace = THREE.SRGBColorSpace;
}

async function attach(url) {
  ensureVideo();
  if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
  video.removeAttribute("src");
  if (isHls(url)) {
    // hls.js (lazy-loaded from CDN, no bundler) — the canonical order is to
    // PREFER hls.js wherever it's supported (Chrome/FF/Edge), and fall back to
    // native HLS only on Safari/iOS where hls.js isn't supported.
    if (!Hls) { try { Hls = (await import("https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.mjs")).default; } catch (e) {} }
    if (cur && cur.url !== url) return;           // superseded while loading
    if (Hls && Hls.isSupported()) {
      hls = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 3, backBufferLength: 30 });
      hls.loadSource(url); hls.attachMedia(video);
    } else {
      video.src = url;                            // Safari/iOS native HLS
    }
  } else {
    video.src = url;                              // a plain .mp4 / .webm
  }
  if (inRoom) play();
}

function play() {
  if (!video) return;
  video.play().catch(() => {});
  if (!noAutoUnmute && !unmuteArmed && inRoom) armUnmute();
}

// unmute on the first input the visitor makes (a gesture is required for sound,
// and they're already walking/clicking) → audio "just comes on", no extra step
function armUnmute() {
  unmuteArmed = true;
  const go = () => {
    if (inRoom && cur && video) { video.muted = false; video.play().catch(() => {}); }
    done();
  };
  const done = () => { unmuteArmed = false; ["pointerdown", "keydown", "touchstart"].forEach(e => window.removeEventListener(e, go, true)); };
  ["pointerdown", "keydown", "touchstart"].forEach(e => window.addEventListener(e, go, true, { passive: true }));
}

export const screen = {
  // build the wall mesh; main.js adds it to the scene (after buildWorld → stays unlit)
  mountScreen(scene) {
    if (mesh) return mesh;
    labelCv = document.createElement("canvas"); labelCv.width = 1024; labelCv.height = 576;
    labelTex = new THREE.CanvasTexture(labelCv);
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: labelTex }));
    mesh.position.set(POS.x, POS.y, POS.z);
    mesh.rotation.x = 0.08;               // a touch of downward rake toward the floor
    mesh.userData.screenTap = true;       // raycast id (main.js toggles mute on click)
    scene.add(mesh);
    paintLabel();
    return mesh;
  },

  // the shared "what's on" — an HLS/.mp4 URL, or null for dark (host's screen-share
  // uses setMediaStream instead). called for everyone.
  setStream(s) {
    const url = s && s.url ? s.url : null;
    if (cur && cur.url && url && cur.url === url) { setWall(); return; }   // unchanged → no reload
    if (video) video.srcObject = null;        // leaving any live screen-share
    noAutoUnmute = false;
    cur = url ? { url } : null;
    if (url) { attach(url); }
    else {
      if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
      if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
    }
    setWall();
  },

  // a live MediaStream on the wall (WebRTC screen-share). muteSelf=true for the
  // host's own wall so they don't double-hear the tab they're sharing.
  setMediaStream(s, muteSelf) {
    ensureVideo();
    if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
    video.removeAttribute("src");
    if (s) {
      noAutoUnmute = !!muteSelf;
      cur = { live: true };
      video.muted = true;
      video.srcObject = s;
      if (inRoom) play();
    } else {
      if (cur && cur.live) cur = null;
      noAutoUnmute = false;
      video.srcObject = null; video.pause();
    }
    setWall();
  },

  // entering the venue → start playing + arm the auto-unmute
  enter() {
    inRoom = true;
    if (cur) { ensureVideo(); if (cur.url && !video.src && !hls) attach(cur.url); else play(); }
    setWall();
  },
  // leaving → mute + pause so no audio bleeds out and we stop pulling bytes
  leave() {
    inRoom = false;
    if (video) { video.muted = true; video.pause(); }
  },

  // click on the screen toggles the venue's sound (a click is a valid gesture)
  toggleMuted() {
    if (!video || !cur) return true;
    video.muted = !video.muted;
    if (!video.muted) video.play().catch(() => {});
    return video.muted;
  },
  isMuted: () => !video || video.muted,

  has: () => !!cur,
  // true only when a live MediaStream (screen-share) is actually on the wall —
  // lets the host self-heal its own wall without disturbing a URL stream
  showingLive: () => !!(cur && cur.live && video && video.srcObject),
  // nudge a stalled wall video back into playing (iOS pauses it on a hitch / on
  // resume from background). safe no-op when nothing's on or it's already playing.
  kick: () => { if (cur && video && video.paused && inRoom) video.play().catch(() => {}); },
  current: () => cur,
  // smoke-test peek
  _state: () => ({ has: !!cur, url: cur && cur.url, inRoom, muted: !video || video.muted, paused: !video || video.paused, hls: !!hls }),
};
