/* ============================================================
   THE STUDIO — the room

   A dark box with four machines standing in a ring, facing in. You
   spawn in the middle, so every device is a turn away and none of them
   is the "main" one — which is the point. Four people can stand at
   four machines and never queue for anything.

   Everything is procedural, same as the rest of the site: no models,
   no textures except the canvases the panels wear.
   ============================================================ */

import * as THREE from "three";
import { drawPanel, PANEL_W, PANEL_H } from "./panels.js";
import { onStep } from "./devices.js";

const ACCENT = { drums: 0xff4d2e, arp: 0x5db8ff, clips: 0x7ef5e0, mixer: 0xffb347 };
const ORDER = ["drums", "arp", "clips", "mixer"];

export const ROOM_HALF = 8.4;       // walkable half-extent
const RING = 4.6;                    // how far out the consoles stand
const CONSOLE_R = 1.25;              // how close you can get before you bump it

export function buildRoom() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07090b);
  scene.fog = new THREE.Fog(0x07090b, 12, 30);

  /* ---------- shell ---------- */

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.MeshStandardMaterial({ color: 0x141b23, roughness: 0.55, metalness: 0.2 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // a faint grid so movement reads — without it a dark floor is a void and
  // you can't tell you're walking
  const grid = new THREE.GridHelper(24, 24, 0x1b2229, 0x141a20);
  grid.position.y = 0.01;
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  scene.add(grid);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x101720, roughness: 0.9, side: THREE.BackSide });
  const shell = new THREE.Mesh(new THREE.BoxGeometry(24, 7, 24), wallMat);
  shell.position.y = 3.5;
  scene.add(shell);

  /* ---------- light ---------- */

  // enough fill that the consoles read as objects. this is a dark room by
  // design, but "moody" and "you cannot see the furniture" are different things.
  scene.add(new THREE.AmbientLight(0x2b3d4e, 1.15));

  const key = new THREE.SpotLight(0xcfe0ff, 48, 24, Math.PI / 2.6, 0.7, 1.2);
  key.position.set(0, 6.4, 0);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key, key.target);

  /* ---------- the machines ---------- */

  const panels = [];
  const bodies = [];

  ORDER.forEach((kind, i) => {
    // + PI puts the first machine dead ahead of the spawn (the camera starts
    // looking down -Z). land it on the diagonal instead and you walk in facing
    // the gap between two of them, which reads as an empty room.
    const angle = (i / ORDER.length) * Math.PI * 2 + Math.PI;
    const x = Math.sin(angle) * RING;
    const z = Math.cos(angle) * RING;

    const rig = new THREE.Group();
    rig.position.set(x, 0, z);
    rig.lookAt(0, 0, 0);              // every machine faces whoever's in the middle
    scene.add(rig);

    // stand
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 0.9, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x2a333f, roughness: 0.7, metalness: 0.35 })
    );
    leg.position.y = 0.45;
    leg.castShadow = true; leg.receiveShadow = true;
    rig.add(leg);

    // the console shell the screen sits in
    const shellMesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.62, 1.42, 0.34),
      new THREE.MeshStandardMaterial({ color: 0x39465a, roughness: 0.55, metalness: 0.45 })
    );
    shellMesh.position.set(0, 1.55, -0.06);
    shellMesh.rotation.x = -0.30;
    shellMesh.castShadow = true;
    rig.add(shellMesh);

    // the face
    const canvas = document.createElement("canvas");
    canvas.width = PANEL_W; canvas.height = PANEL_H;
    const g = canvas.getContext("2d");
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(2.44, 1.22),
      // basic: a screen emits, it isn't lit. toneMapped off as well, or ACES
      // pulls the whole panel down toward the darkness of the room around it
      // and the grid stops being readable from across the floor.
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
    );
    // parented to the shell, not the rig. tilting the shell swings its front
    // face up and forward, so a screen positioned in the rig's frame has to
    // account for that swing — get it slightly wrong and the box eats the
    // screen. as a child, "0.20 along the shell's own Z" is 3cm proud of a
    // 0.34-deep box no matter how the console is angled. (same 3cm rule the
    // bedroom uses for anything hung on a wall.)
    screen.position.set(0, 0, 0.20);
    screen.userData.kind = kind;
    shellMesh.add(screen);

    // its own colored spill onto the floor, so each station has a presence
    const glow = new THREE.PointLight(ACCENT[kind], 3.2, 7, 2);
    glow.position.set(0, 1.7, 0.7);
    rig.add(glow);

    const nameplate = new THREE.Mesh(
      new THREE.PlaneGeometry(2.44, 0.05),
      new THREE.MeshBasicMaterial({ color: ACCENT[kind], toneMapped: false })
    );
    nameplate.position.set(0, 0.92, 0.36);
    nameplate.rotation.x = -Math.PI / 2.6;
    rig.add(nameplate);

    panels.push({ kind, mesh: screen, canvas, g, tex, glow, dirty: true, lastStep: -2, base: 3.2 });
    bodies.push({ x, z });
  });

  /* ---------- the downbeat ---------- */

  // one ring on the floor that flashes on the "one". it is the only thing in
  // the room that tells you, at a glance, that you and the stranger across the
  // room are on the same bar.
  const pulse = new THREE.Mesh(
    new THREE.RingGeometry(1.5, 1.72, 64),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.05, side: THREE.DoubleSide })
  );
  pulse.rotation.x = -Math.PI / 2;
  pulse.position.y = 0.02;
  scene.add(pulse);

  let pulseT = 0;
  onStep((pos) => {
    if (pos === 0) pulseT = 1;
    else if (pos % 4 === 0) pulseT = Math.max(pulseT, 0.45);
  });

  /* ---------- other people ---------- */

  const ghosts = new Map();   // uid -> group

  function makeGhost(color) {
    const gr = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.72, 4, 12), mat);
    body.position.y = 0.95;
    body.castShadow = true;
    gr.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 18, 14), mat);
    head.position.y = 1.62;
    head.castShadow = true;
    gr.add(head);
    // a nose, purely so you can tell which way someone is facing
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 8), mat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.62, 0.22);
    gr.add(nose);
    return gr;
  }

  function setGhost(uid, pose, color) {
    let gr = ghosts.get(uid);
    if (!gr) { gr = makeGhost(color || 0x7ef5e0); scene.add(gr); ghosts.set(uid, gr); }
    gr.userData.target = { x: pose.x, z: pose.z, yaw: pose.yaw };
    if (gr.userData.target && gr.position.lengthSq() === 0) gr.position.set(pose.x, 0, pose.z);
  }

  function dropGhosts(keep) {
    for (const [uid, gr] of ghosts) {
      if (keep.has(uid)) continue;
      scene.remove(gr);
      ghosts.delete(uid);
    }
  }

  /* ---------- per-frame ---------- */

  function update(dt, playStep) {
    for (const p of panels) {
      // redraw only when something actually changed — repainting four 1024px
      // canvases every frame is the fastest way to make a music app stutter,
      // and a stuttering music app is a broken one
      if (p.dirty || p.lastStep !== playStep) {
        drawPanel(p.kind, p.g, playStep);
        p.tex.needsUpdate = true;
        p.dirty = false;
        p.lastStep = playStep;
      }
      p.glow.intensity += (p.base - p.glow.intensity) * Math.min(1, dt * 8);
    }

    pulseT = Math.max(0, pulseT - dt * 2.6);
    pulse.material.opacity = 0.05 + pulseT * 0.5;
    pulse.scale.setScalar(1 + (1 - pulseT) * 0.05);

    for (const gr of ghosts.values()) {
      const t = gr.userData.target;
      if (!t) continue;
      // smooth toward the last pose we heard — at 10Hz, raw positions teleport
      const k = Math.min(1, dt * 9);
      gr.position.x += (t.x - gr.position.x) * k;
      gr.position.z += (t.z - gr.position.z) * k;
      let d = t.yaw - gr.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      gr.rotation.y += d * k;
    }
  }

  // walls, plus a no-go disc around each console so you can't stand inside one
  function clampWalk(x, z) {
    const lim = ROOM_HALF;
    let nx = Math.max(-lim, Math.min(lim, x));
    let nz = Math.max(-lim, Math.min(lim, z));
    for (const b of bodies) {
      const dx = nx - b.x, dz = nz - b.z;
      const d = Math.hypot(dx, dz);
      if (d < CONSOLE_R && d > 0.0001) {
        nx = b.x + (dx / d) * CONSOLE_R;
        nz = b.z + (dz / d) * CONSOLE_R;
      }
    }
    return { x: nx, z: nz };
  }

  function markDirty(kind) {
    for (const p of panels) if (kind === "*" || p.kind === kind) { p.dirty = true; p.glow.intensity = p.base + 3.5; }
  }

  return {
    scene, key, panels, update, clampWalk, markDirty, setGhost, dropGhosts,
    screens: panels.map(p => p.mesh),
  };
}
