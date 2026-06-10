/* ============================================================
   THE METRO — small shared helpers
   ============================================================ */

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const lerp = (a, b, t) => a + (b - a) * t;

export const IS_TOUCH = matchMedia("(pointer: coarse)").matches;

// Paper colors for sticky notes (bg, ink)
export const PAPERS = [
  { bg: "#f6e8a6", ink: "#3a3120" }, // classic yellow
  { bg: "#f8c8d4", ink: "#46232c" }, // pink
  { bg: "#bfe3c0", ink: "#1f3a24" }, // mint
  { bg: "#bcd9f0", ink: "#1e3242" }, // blue
  { bg: "#e8e4da", ink: "#2c2a25" }, // bone
  { bg: "#e3b9f5", ink: "#3a2347" }, // violet
];

// Visitor ghost colors
export const GHOST_COLORS = ["#ffb347", "#54e08a", "#5db8ff", "#ff6f91", "#c79bff", "#7ef5e0"];

// Only allow real web links.
export function safeUrl(raw) {
  try {
    const u = new URL(String(raw).trim());
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch (e) {}
  return null;
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
}

export function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Stable anonymous identity for this browser.
export function getIdentity() {
  let id;
  try {
    id = JSON.parse(localStorage.getItem("metro.id") || "null");
  } catch (e) { id = null; }
  if (!id || !id.uid) {
    id = {
      uid: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
      name: "",
      color: GHOST_COLORS[Math.floor(Math.random() * GHOST_COLORS.length)],
    };
    saveIdentity(id);
  }
  return id;
}
export function saveIdentity(id) {
  try { localStorage.setItem("metro.id", JSON.stringify(id)); } catch (e) {}
}

// Downscale an image file to a JPEG blob ≤ maxEdge px.
export function shrinkImage(file, maxEdge = 1280, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      c.toBlob(b => b ? resolve(b) : reject(new Error("encode failed")), "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("not an image")); };
    img.src = url;
  });
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

let toastTimer = null;
export function toast(msg, ms = 3200) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}
