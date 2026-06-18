/* ============================================================
   THE METRO — the venue big screen (live video on the wall)

   The picture is a REAL <video> element transformed onto the booth wall via
   CSS3DRenderer — not a WebGL VideoTexture. Same look (a screen on the wall in
   3D, the room + avatars all around it), but because it's a normal HTML video
   like the flat /venue page, iOS plays it reliably and a main-thread hitch never
   stalls it (a VideoTexture, decoded into a GL texture, did). The CSS3D layer
   sits above the 3D canvas and below the HUD; it has no depth occlusion, which
   is fine for a screen mounted high on the wall.

   Source: a live MediaStream (the Cloudflare-SFU screen-share) via
   setMediaStream(), or a CORS HLS/.mp4 URL via setStream(). Autoplays MUTED
   (always allowed); unmutes on the visitor's first input. Room-scoped: paused +
   the CSS layer hidden the moment you leave the venue.
   ============================================================ */
import * as THREE from "three";
import { CSS3DRenderer, CSS3DObject } from "three/addons/renderers/CSS3DRenderer.js";

// the screen on the booth wall (north wall of THE VENUE).
const POS = { x: -40, y: 3.5, z: -4.36 };
const W = 5.0, H = 2.81;           // 16:9, in metres
const VW = 1280, VH = 720;         // the <video> element's pixel size (scaled to W×H in 3D)

let mesh = null, labelCv = null, labelTex = null;
let video = null, holder = null, hls = null, Hls = null;
let cssRenderer = null, cssScene = null, cssObject = null;
let cur = null;                    // { url } | { live:true } currently on, or null
let inRoom = false;                // in the venue → play + (armed) audio
let unmuteArmed = false;
let noAutoUnmute = false;          // the host's own wall: don't auto-unmute (they hear the tab)

function isHls(u) { return /\.m3u8(\?|#|$)/i.test(u || ""); }

/* ---- the "dark — nothing's on" card painted on the wall mesh (the video
       overlays it via CSS3D when something's live) ---- */
function paintLabel() {
  const g = labelCv.getContext("2d"), c = labelCv;
  g.fillStyle = "#0b0a12"; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "#2a2738"; g.lineWidth = 10; g.strokeRect(6, 6, c.width - 12, c.height - 12);
  g.textAlign = "center"; g.fillStyle = "#2a2738";
  g.font = "bold 92px system-ui, sans-serif"; g.fillText("THE BIG SCREEN", c.width / 2, c.height / 2 - 8);
  g.font = "44px system-ui, sans-serif"; g.fillText("dark — nothing's on right now", c.width / 2, c.height / 2 + 66);
  labelTex.needsUpdate = true;
}

function ensureVideo() {
  if (video) return;
  video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.playsInline = true; video.setAttribute("playsinline", ""); video.setAttribute("webkit-playsinline", "");
  video.muted = true; video.autoplay = true; video.loop = false; video.preload = "auto";
  video.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;background:#000;";
  holder = document.createElement("div");
  holder.style.cssText = `width:${VW}px;height:${VH}px;overflow:hidden;background:#000;border:0;box-shadow:0 0 60px rgba(0,0,0,.6);`;
  holder.appendChild(video);
}

// the CSS3D layer: a second renderer whose DOM sits over the WebGL canvas, with
// the <video> transformed onto the wall. main.js drives render/resize.
function ensureCSS() {
  if (cssRenderer) return;
  ensureVideo();
  cssScene = new THREE.Scene();
  cssRenderer = new CSS3DRenderer();
  cssRenderer.setSize(window.innerWidth, window.innerHeight);
  cssRenderer.domElement.style.cssText = "position:fixed;top:0;left:0;pointer-events:none;z-index:5;display:none;";
  document.body.appendChild(cssRenderer.domElement);
  cssObject = new CSS3DObject(holder);
  cssObject.position.set(POS.x, POS.y, POS.z);
  cssObject.rotation.x = 0.08;             // match the mesh's downward rake
  const s = W / VW;                        // px → metres (so VW px = W m wide; VH → H)
  cssObject.scale.set(s, s, s);
  cssObject.visible = false;
  cssScene.add(cssObject);
}

function showVideo(on) {
  if (cssObject) cssObject.visible = !!on;
}

async function attach(url) {
  ensureVideo();
  if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
  video.removeAttribute("src"); video.srcObject = null;
  if (isHls(url)) {
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

// unmute on the first input the visitor makes (a gesture is required for sound)
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
  // build the wall mesh (the dark placeholder card) + the CSS3D video layer.
  mountScreen(scene) {
    if (mesh) return mesh;
    labelCv = document.createElement("canvas"); labelCv.width = 1024; labelCv.height = 576;
    labelTex = new THREE.CanvasTexture(labelCv);
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: labelTex }));
    mesh.position.set(POS.x, POS.y, POS.z);
    mesh.rotation.x = 0.08;
    mesh.userData.screenTap = true;       // raycast id (main.js toggles mute on click)
    scene.add(mesh);
    paintLabel();
    ensureCSS();
    return mesh;
  },

  // main.js render loop hooks: draw the CSS3D layer with the same camera, resize it
  renderCSS(camera) { if (cssRenderer && inRoom) cssRenderer.render(cssScene, camera); },
  resize() { if (cssRenderer) cssRenderer.setSize(window.innerWidth, window.innerHeight); },

  // the shared "what's on" — an HLS/.mp4 URL, or null for dark.
  setStream(s) {
    const url = s && s.url ? s.url : null;
    if (cur && cur.url && url && cur.url === url) { showVideo(true); return; }   // unchanged → no reload
    if (video) video.srcObject = null;
    noAutoUnmute = false;
    cur = url ? { url } : null;
    if (url) { attach(url); }
    else {
      if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
      if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
    }
    showVideo(!!cur);
  },

  // a live MediaStream on the wall (the SFU screen-share). muteSelf=true for the
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
    showVideo(!!cur);
  },

  // entering the venue → show the CSS layer, start playing, arm auto-unmute
  enter() {
    inRoom = true;
    ensureCSS();
    cssRenderer.domElement.style.display = "";
    if (cur) { ensureVideo(); if (cur.url && !video.src && !hls) attach(cur.url); else play(); }
    showVideo(!!cur);
  },
  // leaving → hide the CSS layer + mute/pause so nothing bleeds out
  leave() {
    inRoom = false;
    if (cssRenderer) cssRenderer.domElement.style.display = "none";
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
  // true only when a live MediaStream (screen-share) is actually on the wall
  showingLive: () => !!(cur && cur.live && video && video.srcObject),
  // nudge a stalled wall video back into playing (iOS pauses on a hitch/resume)
  kick: () => { if (cur && video && video.paused && inRoom) video.play().catch(() => {}); },
  current: () => cur,
  // smoke-test peek
  _state: () => ({ has: !!cur, url: cur && cur.url, inRoom, muted: !video || video.muted, paused: !video || video.paused, hls: !!hls, css: !!cssObject && cssObject.visible }),
};
