/* ============================================================
   THE METRO — the arcade mirror
   First-person means you have no body to reflect, so a true mirror
   would show an empty spot where you stand. Instead this is a framed
   panel that renders a live "you" — the same glow-blob + face the
   other visitors see, driven by YOUR mic level — into a small
   off-screen view. So it shows your glow/expression without
   re-rendering the whole room (cheap, stays smooth).

   makeSelfieMirror(renderer) returns { group, update }: parent the
   group on a wall; call update(dt, level, color) each frame.
   ============================================================ */

import * as THREE from "three";

function drawFace(g, mouthOpen) {
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = "#0e0e16";
  g.beginPath(); g.arc(23, 27, 4, 0, 7); g.arc(41, 27, 4, 0, 7); g.fill();   // eyes
  const mh = 1.5 + mouthOpen * 11;
  g.beginPath(); g.ellipse(32, 45, 7, mh / 2, 0, 0, 7); g.fill();            // mouth
}

export function makeSelfieMirror(renderer, { width = 0.95, height = 1.5, color = "#ffb347" } = {}) {
  const group = new THREE.Group();

  // the frame on the wall + the glass (shows the render target)
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.12, height + 0.12, 0.06),
    new THREE.MeshBasicMaterial({ color: 0x0d0b12 }));
  frame.position.z = -0.03;
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.06, height + 0.06, 0.04),
    new THREE.MeshBasicMaterial({ color: 0x6a5028 }));   // warm brass trim
  trim.position.z = -0.01;
  const rt = new THREE.WebGLRenderTarget(384, 600);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: rt.texture }));
  glass.position.z = 0.015;
  group.add(frame, trim, glass);

  // a tiny private scene with a self-avatar — render this, not the room
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(34, width / height, 0.1, 12);
  cam.position.set(0, 1.28, 2.5);
  cam.lookAt(0, 1.05, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.PointLight(0xffd9b0, 14, 9, 2);
  key.position.set(0.7, 2.3, 2.2); scene.add(key);
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(7, 7),
    new THREE.MeshBasicMaterial({ color: 0x16121d }));
  bg.position.set(0, 1, -1.4); scene.add(bg);

  // the self-avatar — same glow-blob + face as the player ghosts
  const glowMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.34,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.85, 6, 14), glowMat);
  body.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), glowMat);
  head.position.y = 1.62;
  const fc = document.createElement("canvas"); fc.width = fc.height = 64;
  drawFace(fc.getContext("2d"), 0);
  const ftex = new THREE.CanvasTexture(fc); ftex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2),
    new THREE.MeshBasicMaterial({ map: ftex, transparent: true, depthWrite: false }));
  face.position.set(0, 1.62, 0.14); face.renderOrder = 12;
  scene.add(body, head, face);

  let mouthStep = -1, op = 0.34, t = 0;
  function update(dt, level, col) {
    t += dt;
    if (col) glowMat.color.set(col);
    const lvl = level || 0;
    op += (0.34 + lvl * 0.5 - op) * Math.min(1, dt * 12);
    glowMat.opacity = op;
    const step = Math.round(Math.min(1, lvl * 1.3) * 3);
    if (step !== mouthStep) { mouthStep = step; drawFace(fc.getContext("2d"), step / 3); ftex.needsUpdate = true; }
    const lift = Math.sin(t * 1.8) * 0.03;
    body.position.y = 0.85 + lift; head.position.y = 1.62 + lift; face.position.y = 1.62 + lift;

    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    renderer.setRenderTarget(prev);
  }

  return { group, update };
}
