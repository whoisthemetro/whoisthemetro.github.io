/* ============================================================
   THE METRO — the arcade mirror
   First-person means you have no body to reflect, so a true mirror
   would show an empty spot. Instead this framed panel renders a live
   "you" — a dressed figure with a glowing 8-bit face — into a small
   off-screen view, driven by YOUR mic level. Only the avatar is
   drawn, not the room, so it stays smooth.

   makeSelfieMirror(renderer) -> { group, update(dt, level, color) }.
   The outfit is currently hard-coded to the owner's look (black
   hoodie + hood, long beard, black pants, METRO); it'll become a
   picker later.
   ============================================================ */

import * as THREE from "three";
import { makeFace } from "./face.js";

function softGlow() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function metroLogo() {
  const c = document.createElement("canvas"); c.width = 160; c.height = 44;
  const g = c.getContext("2d");
  g.fillStyle = "#e9e9ef"; g.font = "800 30px Arial, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("METRO", 80, 24);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeSelfieMirror(renderer, { width = 0.95, height = 1.55, color = "#9fe6ff" } = {}) {
  const group = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.12, height + 0.12, 0.06),
    new THREE.MeshBasicMaterial({ color: 0x0d0b12 }));
  frame.position.z = -0.03;
  const trim = new THREE.Mesh(new THREE.BoxGeometry(width + 0.06, height + 0.06, 0.04),
    new THREE.MeshBasicMaterial({ color: 0x6a5028 }));
  trim.position.z = -0.01;
  const rt = new THREE.WebGLRenderTarget(420, 660);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: rt.texture }));
  glass.position.z = 0.015;
  group.add(frame, trim, glass);

  // a private scene with the dressed self-avatar
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(40, width / height, 0.1, 12);
  cam.position.set(0, 1.32, 2.75);     // pulled back for headroom
  cam.lookAt(0, 1.02, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 1.05));
  const key = new THREE.PointLight(0xfff0dc, 20, 9, 2);
  key.position.set(0.8, 2.4, 2.4); scene.add(key);
  const rim = new THREE.PointLight(0x88a0ff, 14, 8, 2);   // cool rim so the black hoodie isn't a void
  rim.position.set(-1.3, 1.9, -0.5); scene.add(rim);
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(8, 8),
    new THREE.MeshBasicMaterial({ color: 0x171320 }));
  bg.position.set(0, 1, -1.6); scene.add(bg);

  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const avatar = new THREE.Group(); scene.add(avatar);

  // --- the outfit: black pants, black hoodie, hood up, long beard, METRO ---
  for (const sx of [-0.085, 0.085]) {                       // pants
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.078, 0.56, 10), lam(0x0d0d11));
    leg.position.set(sx, 0.28, 0); avatar.add(leg);
  }
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.46, 6, 14), lam(0x191920));  // hoodie
  torso.position.y = 0.92; avatar.add(torso);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.066),
    new THREE.MeshBasicMaterial({ map: metroLogo(), transparent: true }));
  logo.position.set(0, 0.99, 0.205); avatar.add(logo);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 14), lam(0x16161c));
  head.position.y = 1.44; avatar.add(head);
  // hood: a dark shell over the back/top of the head + a cowl drape to the
  // shoulders, leaving the face open at the front
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.185, 18, 14), lam(0x101015));
  hood.position.set(0, 1.45, -0.03); hood.scale.set(1.05, 1.1, 1.05); avatar.add(hood);
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.27, 0.32, 14, 1, true), lam(0x121218));
  cowl.position.set(0, 1.18, -0.01); avatar.add(cowl);
  // long beard hanging from the jaw (greyed so it reads against the black hood)
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.36, 10), lam(0x6b6053));
  beard.rotation.x = Math.PI; beard.position.set(0, 1.24, 0.09); avatar.add(beard);

  // a soft glow halo behind the face that swells with your voice
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46),
    new THREE.MeshBasicMaterial({ map: softGlow(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color }));
  halo.position.set(0, 1.47, 0.16); avatar.add(halo);

  // the glowing 8-bit face, proud of the hood opening
  const face = makeFace(0.2, color);
  face.mesh.position.set(0, 1.47, 0.17);
  avatar.add(face.mesh);

  let op = 0.78, t = 0;
  function update(dt, level, col) {
    t += dt;
    if (col) { face.mesh.material.color.set(col); halo.material.color.set(col); }
    const lvl = level || 0;
    op += (0.78 + lvl * 0.22 - op) * Math.min(1, dt * 12);   // face glows brighter while talking
    face.mesh.material.opacity = op;
    face.mesh.scale.setScalar(1 + lvl * 0.06);
    halo.material.opacity = lvl * 0.6;                        // glow halo swells with voice
    halo.scale.setScalar(1 + lvl * 0.7);
    face.draw({ mouth: Math.min(1, lvl * 1.3) });            // mouth flaps with voice
    avatar.position.y = Math.sin(t * 1.8) * 0.015;           // breathing

    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    renderer.setRenderTarget(prev);
  }

  return { group, update };
}
