/* ============================================================
   THE METRO — the arcade mirror
   First-person has no body to reflect, so this framed panel renders a
   live "you" — your dressed figure (built from your outfit spec) with
   a glowing 8-bit face — into a small off-screen view, driven by your
   mic level. Only the avatar is drawn, not the room, so it's cheap.
   It doubles as the live preview while you use the outfit picker:
   setSpec() rebuilds the figure and the mirror updates instantly.

   makeSelfieMirror(renderer, spec) -> { group, update, setSpec }
   ============================================================ */

import * as THREE from "three";
import { buildAvatarFigure } from "./avatar-builder.js";

export function makeSelfieMirror(renderer, spec, { width = 0.95, height = 1.55 } = {}) {
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
  glass.userData.mirror = true;            // click it → open the outfit picker
  group.add(frame, trim, glass);

  // private scene + camera
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(40, width / height, 0.1, 12);
  cam.position.set(0, 1.32, 2.75);
  cam.lookAt(0, 1.02, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 1.05));
  const key = new THREE.PointLight(0xfff0dc, 20, 9, 2);
  key.position.set(0.8, 2.4, 2.4); scene.add(key);
  const rim = new THREE.PointLight(0x88a0ff, 14, 8, 2);
  rim.position.set(-1.3, 1.9, -0.5); scene.add(rim);
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(8, 8),
    new THREE.MeshBasicMaterial({ color: 0x171320 }));
  bg.position.set(0, 1, -1.6); scene.add(bg);

  let figure = null;
  const holder = new THREE.Group(); scene.add(holder);
  function setSpec(spec) {
    if (figure) { holder.remove(figure.group); figure.dispose(); }
    figure = buildAvatarFigure(spec);
    holder.add(figure.group);
  }
  setSpec(spec);

  let t = 0;
  function update(dt, level) {
    t += dt;
    figure.setVoice(level || 0, dt);
    holder.position.y = Math.sin(t * 1.8) * 0.015;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    renderer.setRenderTarget(prev);
  }

  return { group, glass, update, setSpec };
}
