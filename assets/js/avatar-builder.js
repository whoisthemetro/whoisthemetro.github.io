/* ============================================================
   THE METRO — avatar builder
   Turns an outfit spec (plain data) into a dressed figure built from
   primitives + a glowing 8-bit face. Inclusive + curated: any build,
   a range of hairstyles, tops, bottoms, beards, and colors — "within
   reason". The mirror builds the owner from their saved spec; the
   ghosts will build each peer from the spec they broadcast.

   buildAvatarFigure(spec) -> { group, setVoice(level), dispose }
   The group's feet sit at y=0; the glowing face reacts to voice.
   ============================================================ */

import * as THREE from "three";
import { makeFace } from "./face.js";

// the option lists the picker offers (kept modest on purpose)
export const OPTIONS = {
  build: ["slim", "average", "broad"],
  hair: ["none", "short", "long", "bun", "buzz", "afro"],
  top: ["hoodie", "tee", "jacket", "dress"],
  bottom: ["pants", "shorts", "skirt"],
  beard: ["none", "stubble", "full", "long"],
  hood: [true, false],
  swatches: ["#191920", "#0d0d11", "#3a2c1c", "#7a2a34", "#274a7a", "#2f6b4a",
             "#caa23c", "#b8b3ad", "#e9e4d8", "#8a4a6a"],
  hairColors: ["#1a140e", "#2a2018", "#5a4326", "#caa23c", "#9a9088", "#3a6a8a", "#8a4a6a"],
  skinTones: ["#f4d6bd", "#e8bd98", "#d8a878", "#c08a55", "#a06b3c", "#7a4f2b", "#583618", "#3a2414"],
  faceColors: ["#9fe6ff", "#7dff9a", "#ff7ad0", "#ffd23c", "#ff5a4a", "#b18bff", "#ffffff"],
};

export const DEFAULT_SPEC = {
  build: "average", skin: "#d8a878", hair: "short", hairColor: "#2a2018",
  top: "hoodie", topColor: "#191920", hood: true,
  bottom: "pants", bottomColor: "#0d0d11",
  beard: "none", faceColor: "#9fe6ff", logo: "METRO",
};

function logoTex(text) {
  const c = document.createElement("canvas"); c.width = 160; c.height = 44;
  const g = c.getContext("2d");
  g.fillStyle = "#e9e9ef"; g.font = "800 30px Arial, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText((text || "").slice(0, 8).toUpperCase(), 80, 24);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function softGlow() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function buildAvatarFigure(spec = {}) {
  const s = { ...DEFAULT_SPEC, ...spec };
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const group = new THREE.Group();
  const disposables = [];
  const track = (m) => { disposables.push(m); return m; };

  const wide = s.build === "broad" ? 1.18 : s.build === "slim" ? 0.86 : 1;
  const topC = s.topColor, botC = s.bottomColor;

  // --- bottom: legs (pants/shorts) or a skirt ---
  if (s.top === "dress" || s.bottom === "skirt") {
    const isDress = s.top === "dress";
    // a flared skirt; for a dress it runs up to meet the bodice (no waist gap)
    const skirt = new THREE.Mesh(track(new THREE.ConeGeometry(0.28 * wide, isDress ? 0.66 : 0.52, 16, 1, true)),
      lam(isDress ? topC : botC));
    skirt.position.y = isDress ? 0.5 : 0.47; group.add(skirt);
    for (const sx of [-0.07, 0.07]) {                 // bare calves below the hem
      const leg = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.045, 0.3, 8)), lam(s.skin));
      leg.position.set(sx, 0.15, 0); group.add(leg);
    }
  } else {
    const legLen = s.bottom === "shorts" ? 0.34 : 0.56;
    const legY = s.bottom === "shorts" ? 0.4 : 0.28;
    for (const sx of [-0.085, 0.085]) {
      const leg = new THREE.Mesh(track(new THREE.CylinderGeometry(0.082 * wide, 0.078 * wide, legLen, 10)), lam(botC));
      leg.position.set(sx * wide, legY, 0); group.add(leg);
    }
    if (s.bottom === "shorts") {                       // bare shins
      for (const sx of [-0.085, 0.085]) {
        const shin = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.045, 0.34, 8)), lam(s.skin));
        shin.position.set(sx * wide, 0.17, 0); group.add(shin);
      }
    }
  }

  // --- top: torso (skip the body for a dress, the cone is the dress) ---
  if (s.top !== "dress") {
    const torso = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.2 * wide, 0.46, 6, 14)), lam(topC));
    torso.position.y = 0.92; group.add(torso);
    if (s.top === "jacket") {                          // a contrasting open panel
      const panel = new THREE.Mesh(track(new THREE.BoxGeometry(0.12, 0.4, 0.02)), lam(0x101015));
      panel.position.set(0, 0.95, 0.2 * wide + 0.006); group.add(panel);
    }
  } else {
    const bodice = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.18 * wide, 0.32, 6, 14)), lam(topC));
    bodice.position.y = 1.0; group.add(bodice);
  }

  // chest logo
  if (s.logo) {
    const t = track(logoTex(s.logo));
    const logo = new THREE.Mesh(track(new THREE.PlaneGeometry(0.24, 0.066)),
      new THREE.MeshBasicMaterial({ map: t, transparent: true }));
    logo.position.set(0, 0.99, 0.2 * wide + 0.025); group.add(logo);
  }

  // --- head (skin) ---
  const head = new THREE.Mesh(track(new THREE.SphereGeometry(0.15, 16, 14)), lam(s.skin));
  head.position.y = 1.44; group.add(head);

  // --- hair ---
  buildHair(group, s, lam, track);

  // --- hood (only if a hoodie, hood up) ---
  if (s.top === "hoodie" && s.hood) {
    const hood = new THREE.Mesh(track(new THREE.SphereGeometry(0.185, 18, 14)), lam(shade(topC, -0.3)));
    hood.position.set(0, 1.45, -0.03); hood.scale.set(1.05, 1.1, 1.05); group.add(hood);
    const cowl = new THREE.Mesh(track(new THREE.CylinderGeometry(0.14, 0.27 * wide, 0.32, 14, 1, true)), lam(shade(topC, -0.2)));
    cowl.position.set(0, 1.18, -0.01); group.add(cowl);
  }

  // --- beard ---
  if (s.beard && s.beard !== "none") {
    const len = s.beard === "long" ? 0.34 : s.beard === "full" ? 0.2 : 0.12;
    const beard = new THREE.Mesh(track(new THREE.ConeGeometry(0.12, len, 10)), lam(s.hairColor));
    beard.rotation.x = Math.PI; beard.position.set(0, 1.27, 0.08); group.add(beard);
  }

  // --- the glowing 8-bit face + a voice halo ---
  const halo = new THREE.Mesh(track(new THREE.PlaneGeometry(0.46, 0.46)),
    new THREE.MeshBasicMaterial({ map: track(softGlow()), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: s.faceColor }));
  halo.position.set(0, 1.47, 0.16); group.add(halo);
  const face = makeFace(0.2, s.faceColor);
  face.mesh.position.set(0, 1.47, 0.17); group.add(face.mesh);

  let op = 0.78;
  function setVoice(level, dt = 0.016) {
    const lvl = level || 0;
    op += (0.78 + lvl * 0.22 - op) * Math.min(1, dt * 12);
    face.mesh.material.opacity = op;
    face.mesh.scale.setScalar(1 + lvl * 0.06);
    halo.material.opacity = lvl * 0.6;
    halo.scale.setScalar(1 + lvl * 0.7);
    face.draw({ mouth: Math.min(1, lvl * 1.3) });
  }
  function dispose() { for (const d of disposables) { try { d.dispose && d.dispose(); } catch (e) {} } }

  return { group, face, setVoice, dispose };
}

function buildHair(group, s, lam, track) {
  if (!s.hair || s.hair === "none") return;
  const c = lam(s.hairColor);
  const hy = 1.44;
  if (s.hair === "buzz") {
    const cap = new THREE.Mesh(track(new THREE.SphereGeometry(0.155, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55)), c);
    cap.position.y = hy; group.add(cap);
  } else if (s.hair === "short") {
    const cap = new THREE.Mesh(track(new THREE.SphereGeometry(0.162, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62)), c);
    cap.position.y = hy + 0.005; group.add(cap);
  } else if (s.hair === "afro") {
    const puff = new THREE.Mesh(track(new THREE.SphereGeometry(0.2, 14, 12)), c);
    puff.position.set(0, hy + 0.05, -0.05); puff.scale.set(1.05, 0.95, 1); group.add(puff);   // sits back so the face shows
  } else if (s.hair === "bun") {
    const cap = new THREE.Mesh(track(new THREE.SphereGeometry(0.162, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.6)), c);
    cap.position.y = hy + 0.005; group.add(cap);
    const bun = new THREE.Mesh(track(new THREE.SphereGeometry(0.07, 10, 8)), c);
    bun.position.set(0, hy + 0.16, -0.02); group.add(bun);
  } else if (s.hair === "long") {
    const cap = new THREE.Mesh(track(new THREE.SphereGeometry(0.163, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62)), c);
    cap.position.y = hy + 0.005; group.add(cap);
    const drape = new THREE.Mesh(track(new THREE.CylinderGeometry(0.15, 0.12, 0.34, 12, 1, true)), c);
    drape.position.set(0, hy - 0.16, -0.05); group.add(drape);   // hangs down the back
  }
}

// darken/lighten a hex color (amt -1..1)
function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const f = amt < 0 ? 1 + amt : 1;
  c.r *= f; c.g *= f; c.b *= f;
  return c.getHex();
}
