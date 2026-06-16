/* ============================================================
   THE METRO — other people, rendered
   Each live visitor is a soft glowing figure with their name
   floating overhead. Poses arrive over presence broadcast and
   get smoothed here so movement looks human, not teleporty.
   ============================================================ */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { makeFace } from "./face.js";

const gltfLoader = new GLTFLoader();
const avatarCache = new Map();   // url -> Promise<THREE.Object3D template>

function loadAvatar(url) {
  if (!avatarCache.has(url)) {
    avatarCache.set(url, new Promise((resolve, reject) => {
      gltfLoader.load(url, (gltf) => {
        const model = gltf.scene;
        // Ready Player Me avatars arrive in A-pose — relax the arms
        model.traverse((o) => {
          if (o.isBone) {
            if (/LeftArm$/.test(o.name)) o.rotation.z = 1.15;
            if (/RightArm$/.test(o.name)) o.rotation.z = -1.15;
          }
          if (o.isMesh) { o.frustumCulled = false; }
        });
        resolve(model);
      }, undefined, reject);
    }));
  }
  return avatarCache.get(url);
}

function nameSprite(name, color) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const g = c.getContext("2d");
  g.font = "600 30px Archivo, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = "rgba(0,0,0,0.9)";
  g.shadowBlur = 8;
  g.fillStyle = color;
  g.fillText(name || "someone", 128, 32, 240);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(1.15, 0.29, 1);
  return sp;
}

function makeFigure(color) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.32,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.85, 6, 14), mat);
  body.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), mat);
  head.position.y = 1.62;
  grp.add(body, head);

  // 8-bit glowing face in front of the head
  const face = makeFace(0.22, "#9fe6ff");
  face.mesh.position.set(0, 1.62, 0.135);
  grp.add(face.mesh);

  grp.userData.glow = { mat, baseOpacity: 0.32, face };
  return grp;
}

export class Ghosts {
  constructor(group) {
    this.group = group;
    this.byUid = new Map();   // uid -> {grp, target:{x,z,yaw}, bobSeed}
  }

  syncPeers(peers) {
    // remove the departed
    for (const [uid, g] of this.byUid) {
      if (!peers.has(uid)) {
        this.group.remove(g.grp);
        this.byUid.delete(uid);
      }
    }
    // avatar changed mid-session → rebuild that figure
    for (const [uid, meta] of peers) {
      const rec = this.byUid.get(uid);
      if (rec && rec.avatarUrl !== (meta.avatar || null)) {
        this.group.remove(rec.grp);
        this.byUid.delete(uid);
      }
    }
    // add the newly arrived
    for (const [uid, meta] of peers) {
      if (this.byUid.has(uid)) continue;
      const grp = makeFigure(meta.color || "#ffb347");
      const label = nameSprite(meta.name, meta.color || "#ffb347");
      label.position.y = 2.0;
      grp.add(label);
      grp.position.set(0, 0, 2.5);
      this.group.add(grp);
      this.byUid.set(uid, {
        grp,
        avatarUrl: meta.avatar || null,
        target: { x: 0, z: 2.5, yaw: 0 },
        bobSeed: Math.random() * 10,
      });
      // if they made themselves a body, swap the ghost shell for it
      if (meta.avatar) {
        loadAvatar(meta.avatar).then((template) => {
          const rec = this.byUid.get(uid);
          if (!rec) return;                  // they left while loading
          const body = SkeletonUtils.clone(template);
          // hide the glow capsule + head, keep the name label
          rec.grp.children.forEach((c) => { if (!c.isSprite) c.visible = false; });
          rec.grp.add(body);
        }).catch(() => { /* bad url — ghost shell stays */ });
      }
    }
  }

  setPose(uid, pose) {
    const g = this.byUid.get(uid);
    if (g) g.target = pose;
  }

  // a quick full-body color pop — punches landing, shields ringing
  flash(uid, color = 0xff4040) {
    const g = this.byUid.get(uid);
    if (!g || g.flashing) return;
    g.flashing = true;
    const touched = [];
    g.grp.traverse((o) => {
      if (o.isMesh && o.material && o.material.color && !o.isSprite) {
        touched.push([o.material, o.material.color.getHex()]);
        o.material.color.setHex(color);
      }
    });
    setTimeout(() => {
      for (const [mat, hex] of touched) { try { mat.color.setHex(hex); } catch (e) {} }
      g.flashing = false;
    }, 260);
  }

  // levelFn(uid) -> 0..1 live voice level; drives each blob's glow + mouth
  tick(dt, t, levelFn) {
    const k = Math.min(1, dt * 7);   // smoothing
    for (const [uid, g] of this.byUid) {
      // voice-reactive glow + mouth (an envelope follower assigned to the glow)
      const gd = g.grp.userData.glow;
      if (gd) {
        const lvl = levelFn ? (levelFn(uid) || 0) : 0;
        const targetOp = gd.baseOpacity + lvl * 0.5;     // swell while they talk
        gd.mat.opacity += (targetOp - gd.mat.opacity) * Math.min(1, dt * 12);
        gd.face.draw({ mouth: Math.min(1, lvl * 1.3) });  // mouth flaps with voice

      }
    }
    for (const g of this.byUid.values()) {
      const px = g.grp.position.x, py = g.grp.position.y, pz = g.grp.position.z;
      g.grp.position.x += (g.target.x - g.grp.position.x) * k;
      g.grp.position.z += (g.target.z - g.grp.position.z) * k;
      g.floatY = (g.floatY ?? 0) + (((g.target.y || 0)) - (g.floatY ?? 0)) * k;
      let dy = g.target.yaw - g.grp.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      g.grp.rotation.y += dy * k;
      // gentle idle bob — they're alive (plus zero-g altitude)
      g.grp.position.y = (g.floatY || 0) + Math.sin(t * 1.8 + g.bobSeed) * 0.025;
      // velocity estimate, smoothed — teammates slingshot off this
      if (dt > 0) {
        const vx = (g.grp.position.x - px) / dt, vy = (g.grp.position.y - py) / dt, vz = (g.grp.position.z - pz) / dt;
        if (!g.vel) g.vel = { x: 0, y: 0, z: 0 };
        g.vel.x += (vx - g.vel.x) * 0.3;
        g.vel.y += (vy - g.vel.y) * 0.3;
        g.vel.z += (vz - g.vel.z) * 0.3;
      }
    }
  }

  count() { return this.byUid.size; }
}
