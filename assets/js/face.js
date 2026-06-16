/* ============================================================
   THE METRO — 8-bit avatar faces
   A glowing pixel face, drawn on a tiny 32×32 canvas with nearest-
   neighbour filtering so the pixels stay crisp and blocky (think a
   digital visor). Additive-blended so the lit pixels glow on top of
   any head. Shared by the bartender, the player ghosts, and the
   mirror so every face matches.
   ============================================================ */

import * as THREE from "three";

// draw the face. opts: { mouth 0..1, blink, smirk, color }
export function drawFace8(g, { mouth = 0, blink = false, smirk = false, color = "#8fe8ff" } = {}) {
  g.clearRect(0, 0, 32, 32);
  g.fillStyle = color;
  // eyes — chunky 4×4 blocks; a blink squashes them to a 4×1 bar
  const lx = 8, rx = 20, ey = 12;
  if (blink) {
    g.fillRect(lx, ey + 2, 4, 1); g.fillRect(rx, ey + 2, 4, 1);
  } else {
    g.fillRect(lx, ey, 4, 4); g.fillRect(rx, ey, 4, 4);
    if (smirk) { g.clearRect(lx, ey, 4, 2); g.clearRect(rx, ey, 4, 2); } // half-lidded = top two rows off
  }
  // mouth — a block that grows downward as it opens
  const mh = Math.max(1, Math.round(1 + mouth * 6));
  if (smirk && mouth < 0.2) {
    // a flat smirk: a short bar tilted up on one side (two stepped pixels)
    g.fillRect(12, 23, 6, 1); g.fillRect(18, 22, 2, 1);
  } else {
    g.fillRect(13, 22, 6, mh);
  }
  g.fillStyle = color;
}

// a face plane that glows (additive) with crisp pixels. returns the mesh plus a
// draw(opts) that redraws + flags the texture. keep a key and only redraw on change.
export function makeFace(size = 0.2, color = "#8fe8ff") {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  drawFace8(c.getContext("2d"), { color });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  mesh.renderOrder = 14;
  let key = "";
  return {
    mesh, tex,
    draw(opts) {
      const k = `${(opts.mouth || 0).toFixed(2)}|${opts.blink ? 1 : 0}|${opts.smirk ? 1 : 0}`;
      if (k === key) return;
      key = k;
      drawFace8(c.getContext("2d"), { color, ...opts });
      tex.needsUpdate = true;
    },
  };
}
