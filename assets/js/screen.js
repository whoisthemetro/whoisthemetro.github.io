/* ============================================================
   THE METRO — the venue big screen (theater model)

   Research verdict (Hubs/A-Frame/three.js all converge here): a live
   Twitch/YouTube stream CANNOT be reliably shown as a free-floating,
   clickable, audio-playing panel inside a pointer-locked 3D world —
   iOS pauses any <video> transformed off-viewport, clicks don't land
   on a CSS3D iframe under pointer-lock, and cross-origin streams can't
   be a WebGL texture (CORS + ToS). So:

   - the WALL shows a diegetic, in-world panel (a plain WebGL mesh) that
     reads "NOW SHOWING <channel>" — communal, reliable, never pauses.
   - clicking it opens a flat 2D THEATER overlay: the platform's real
     iframe player, mounted normal (no 3D transform) so it never leaves
     the viewport and never auto-pauses, opened by a real click so its
     audio gesture is satisfied and its controls are clickable.

   The shared "what's on" is synced at our layer (presence + room_state);
   each person opens the theater when they want to watch.
   ============================================================ */
import * as THREE from "three";

// the in-world panel on the booth wall (north wall of THE VENUE).
// CLUB={x:-40,z:0}, depth 9 → wall at z=-4.5, ceiling 5.6.
const POS = { x: -40, y: 3.5, z: -4.36 };
const W = 5.0, H = 2.81;           // 16:9, in metres

let marker = null, mctx = null, mtex = null;
let cur = null;                    // { platform, kind, id } that's "on", or null
let overlay = null, oFrame = null, oUnmute = null, onClose = null;

/* ---- the in-world panel ---- */
function paintMarker() {
  if (!mctx) return;
  const c = mctx.canvas, g = mctx;
  g.clearRect(0, 0, c.width, c.height);
  // dark glass
  g.fillStyle = "#0b0a12"; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "#8a5cff"; g.lineWidth = 10; g.strokeRect(6, 6, c.width - 12, c.height - 12);
  g.textAlign = "center";
  if (cur) {
    g.fillStyle = "#ff3b6b"; g.beginPath(); g.arc(c.width / 2 - 150, 150, 22, 0, 7); g.fill();   // live dot
    g.fillStyle = "#fff"; g.font = "bold 84px system-ui, sans-serif";
    g.fillText("NOW SHOWING", c.width / 2 + 30, 175);
    g.fillStyle = "#cdbcff"; g.font = "bold 120px system-ui, sans-serif";
    g.fillText(cur.id, c.width / 2, 330);
    g.fillStyle = "#9b8cc8"; g.font = "48px system-ui, sans-serif";
    g.fillText("▶ click the screen to watch", c.width / 2, 460);
  } else {
    g.fillStyle = "#2a2738"; g.font = "bold 90px system-ui, sans-serif";
    g.fillText("THE BIG SCREEN", c.width / 2, c.height / 2 - 10);
    g.fillStyle = "#2a2738"; g.font = "44px system-ui, sans-serif";
    g.fillText("dark — nothing's on right now", c.width / 2, c.height / 2 + 70);
  }
  mtex.needsUpdate = true;
}

/* ---- the 2D theater overlay ---- */
function embedSrc(s, muted) {
  if (s.platform === "twitch") {
    const host = location.hostname || "localhost";
    const base = "https://player.twitch.tv/?parent=" + encodeURIComponent(host) +
      "&parent=localhost&autoplay=true&muted=" + (muted ? "true" : "false");
    return s.kind === "video" ? base + "&video=" + encodeURIComponent(s.id)
                              : base + "&channel=" + encodeURIComponent(s.id);
  }
  return "https://www.youtube.com/embed/" + encodeURIComponent(s.id) +
    "?autoplay=1&playsinline=1&rel=0&mute=" + (muted ? "1" : "0");
}

function buildOverlay() {
  if (overlay) return;
  overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:88;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.86);";
  const box = document.createElement("div");
  box.style.cssText = "position:relative;width:min(92vw,1120px);aspect-ratio:16/9;box-shadow:0 0 80px rgba(138,92,255,.5);border:2px solid #1c1730;background:#000;";
  oFrame = document.createElement("iframe");
  oFrame.style.cssText = "width:100%;height:100%;border:0;display:block;";
  oFrame.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
  oFrame.setAttribute("allowfullscreen", "");
  box.appendChild(oFrame);
  // close
  const x = document.createElement("button");
  x.textContent = "×";
  x.style.cssText = "position:absolute;top:-46px;right:0;font-size:34px;line-height:1;background:none;border:0;color:#fff;cursor:pointer;";
  x.addEventListener("click", () => screen.close());
  box.appendChild(x);
  // a real click here = a fresh user gesture → reloading unmuted is allowed
  oUnmute = document.createElement("button");
  oUnmute.textContent = "🔊 tap for sound";
  oUnmute.style.cssText = "position:absolute;bottom:14px;left:50%;transform:translateX(-50%);padding:10px 18px;border-radius:22px;border:0;background:#8a5cff;color:#fff;font:600 15px system-ui;cursor:pointer;";
  oUnmute.addEventListener("click", () => { if (cur) { oFrame.src = embedSrc(cur, false); oUnmute.style.display = "none"; } });
  box.appendChild(oUnmute);
  overlay.appendChild(box);
  // clicking the dim backdrop (not the player) closes it
  overlay.addEventListener("click", (e) => { if (e.target === overlay) screen.close(); });
  document.body.appendChild(overlay);
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
    if (/^[a-z0-9_]{2,30}$/i.test(t)) return { platform: "twitch", kind: "channel", id: t };
    return null;
  },

  // build the in-world panel; main.js adds the mesh to the scene + raycast list.
  // it's a plain unlit mesh (added after buildWorld, so it stays MeshBasic).
  mountMarker(scene) {
    if (marker) return marker;
    const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 576;
    mctx = cv.getContext("2d");
    mtex = new THREE.CanvasTexture(cv);
    marker = new THREE.Mesh(new THREE.PlaneGeometry(W, H),
      new THREE.MeshBasicMaterial({ map: mtex }));
    marker.position.set(POS.x, POS.y, POS.z);
    marker.rotation.x = 0.08;             // a touch of downward rake toward the floor
    marker.userData.screenWatch = true;   // raycast id (main.js opens the theater)
    scene.add(marker);
    paintMarker();
    return marker;
  },

  // what's "on" (updates the wall panel for everyone). null = dark.
  setStream(s) {
    cur = s ? { platform: s.platform, kind: s.kind, id: s.id } : null;
    paintMarker();
  },

  // open the theater overlay (call from a real click so audio is allowed)
  open() {
    if (!cur) return false;
    buildOverlay();
    oUnmute.style.display = "";
    oFrame.src = embedSrc(cur, true);     // muted autoplay = video shows immediately
    overlay.style.display = "flex";
    return true;
  },
  close() {
    if (!overlay) return;
    overlay.style.display = "none";
    if (oFrame) oFrame.src = "";          // stop the audio
    if (onClose) try { onClose(); } catch (e) {}
  },
  isOpen: () => !!(overlay && overlay.style.display !== "none"),
  setOnClose(fn) { onClose = fn; },

  has: () => !!cur,
  current: () => cur,
};
