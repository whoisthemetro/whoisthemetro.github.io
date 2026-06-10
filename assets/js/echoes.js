/* ============================================================
   THE METRO — echoes of past visitors
   Every visit quietly records an anonymous movement trail
   (positions only — no name, nothing typed). When the room is
   quiet, old trails replay as faint translucent figures: the
   room is haunted, gently, by everyone who ever walked it.
   ============================================================ */

import * as THREE from "three";
import { store } from "./store.js";
import { rand } from "./util.js";

const SAMPLE_MS = 400;          // one point per 0.4 s
const MIN_POINTS = 40;          // ~16 s of movement before it's worth keeping
const MAX_POINTS = 280;         // ~2 min, then we save and stop
const MAX_ACTIVE = 2;           // echoes wandering at once

/* ---------------- recording ---------------- */

export function startEchoRecording(getPose, color) {
  const path = [];
  let last = null;
  let saved = false;

  async function flush() {
    if (saved || path.length < MIN_POINTS) return;
    saved = true;
    try { await store.saveEcho(color, path); } catch (e) { /* table missing or offline — fine */ }
  }

  setInterval(() => {
    if (saved) return;
    const p = getPose();
    const moved = !last || Math.hypot(p.x - last.x, p.z - last.z) > 0.04
                || Math.abs(p.yaw - last.yaw) > 0.15;
    if (!moved) return;
    last = { x: p.x, z: p.z, yaw: p.yaw };
    path.push([+p.x.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(2)]);
    if (path.length >= MAX_POINTS) flush();
  }, SAMPLE_MS);

  // best effort on the way out
  addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

/* ---------------- playback ---------------- */

function makeEchoFigure() {
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xaab4c2, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.82, 6, 12), mat);
  body.position.y = 0.83;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), mat);
  head.position.y = 1.58;
  grp.add(body, head);
  grp.userData.mat = mat;
  return grp;
}

export class EchoPlayer {
  constructor(group) {
    this.group = group;
    this.paths = [];        // available recorded trails
    this.active = [];       // { grp, path, t }
    this.cooldown = 12;     // first echo appears soon after you arrive
    this.loaded = false;
  }

  async load() {
    try {
      this.paths = (await store.listEchoes()).filter(p => p.length >= MIN_POINTS);
    } catch (e) { this.paths = []; }
    this.loaded = true;
  }

  spawn() {
    if (!this.paths.length) return;
    const path = this.paths[Math.floor(Math.random() * this.paths.length)];
    const grp = makeEchoFigure();
    const [x, z, yaw] = path[0];
    grp.position.set(x, 0, z);
    grp.rotation.y = yaw;
    this.group.add(grp);
    this.active.push({ grp, path, t: 0 });
  }

  tick(dt) {
    if (!this.loaded) return;

    this.cooldown -= dt;
    if (this.cooldown <= 0 && this.active.length < MAX_ACTIVE) {
      this.spawn();
      this.cooldown = rand(25, 75);
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      e.t += dt;
      const total = e.path.length * (SAMPLE_MS / 1000);
      if (e.t >= total) {
        this.group.remove(e.grp);
        this.active.splice(i, 1);
        continue;
      }
      // position along the trail
      const f = e.t / (SAMPLE_MS / 1000);
      const i0 = Math.min(e.path.length - 1, Math.floor(f));
      const i1 = Math.min(e.path.length - 1, i0 + 1);
      const k = f - i0;
      const a = e.path[i0], b = e.path[i1];
      e.grp.position.x = a[0] + (b[0] - a[0]) * k;
      e.grp.position.z = a[1] + (b[1] - a[1]) * k;
      let dy = (b[2] - a[2]);
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      e.grp.rotation.y = a[2] + dy * k;
      // fade in for 3 s, out for the last 3 s, whisper-faint in between
      const fadeIn = Math.min(1, e.t / 3);
      const fadeOut = Math.min(1, (total - e.t) / 3);
      e.grp.userData.mat.opacity = 0.09 * Math.min(fadeIn, fadeOut);
    }
  }
}
