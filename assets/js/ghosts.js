/* ============================================================
   THE METRO — other people, rendered
   Each live visitor is their chosen avatar (built from the outfit
   spec they broadcast) with their name floating overhead, or a soft
   glow-blob if they haven't picked a look yet. Poses arrive over
   presence and get smoothed here so movement looks human. Each
   figure's face glows + flaps to that person's live mic level.
   ============================================================ */

import * as THREE from "three";
import { makeFace } from "./face.js";
import { buildAvatarFigure } from "./avatar-builder.js";

function nameSprite(name, color) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const g = c.getContext("2d");
  g.font = "600 30px Archivo, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = "rgba(0,0,0,0.9)"; g.shadowBlur = 8;
  g.fillStyle = color;
  g.fillText(name || "someone", 128, 32, 240);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(1.15, 0.29, 1);
  return sp;
}

// the fallback look for someone who hasn't built an avatar: a glow-blob with the
// 8-bit face. returns { node, setVoice, dispose } like buildAvatarFigure.
function makeBlob(color) {
  const node = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.32,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.85, 6, 14), mat);
  body.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), mat);
  head.position.y = 1.62;
  const face = makeFace(0.22, "#9fe6ff");
  face.mesh.position.set(0, 1.62, 0.135);
  node.add(body, head, face.mesh);
  let op = 0.32;
  return {
    node,
    setVoice(lvl, dt = 0.016) {
      op += (0.32 + lvl * 0.5 - op) * Math.min(1, dt * 12);
      mat.opacity = op;
      face.draw({ mouth: Math.min(1, lvl * 1.3) });
    },
    dispose() { body.geometry.dispose(); head.geometry.dispose(); mat.dispose(); },
  };
}

// build a peer's visual from their meta: their outfit if they've set one,
// otherwise the glow-blob fallback
function buildPeerVisual(meta) {
  if (meta.outfit) {
    const a = buildAvatarFigure(meta.outfit);
    return { node: a.group, setVoice: a.setVoice, dispose: a.dispose };
  }
  return makeBlob(meta.color || "#ffb347");
}

// a key that changes when someone's look changes, so we rebuild only then
function lookKey(meta) {
  return meta.outfit ? "o:" + JSON.stringify(meta.outfit) : "c:" + (meta.color || "");
}

export class Ghosts {
  constructor(group) {
    this.group = group;
    this.byUid = new Map();   // uid -> { grp, setVoice, dispose, lookKey, target, bobSeed }
  }

  syncPeers(peers) {
    // remove the departed
    for (const [uid, g] of this.byUid) {
      if (!peers.has(uid)) {
        this.group.remove(g.grp); g.dispose && g.dispose(); this.byUid.delete(uid);
      }
    }
    // look changed mid-session → rebuild that figure (keep its place so it
    // doesn't teleport)
    const carry = new Map();
    for (const [uid, meta] of peers) {
      const rec = this.byUid.get(uid);
      if (rec && rec.lookKey !== lookKey(meta)) {
        carry.set(uid, { pos: rec.grp.position.clone(), target: rec.target });
        this.group.remove(rec.grp); rec.dispose && rec.dispose(); this.byUid.delete(uid);
      }
    }
    // add the newly arrived (or just-rebuilt)
    for (const [uid, meta] of peers) {
      if (this.byUid.has(uid)) continue;
      const vis = buildPeerVisual(meta);
      const grp = new THREE.Group();
      grp.add(vis.node);
      const label = nameSprite(meta.name, meta.color || "#ffb347");
      label.position.y = 2.05; grp.add(label);
      const kept = carry.get(uid);
      grp.position.copy(kept ? kept.pos : new THREE.Vector3(0, 0, 2.5));
      this.group.add(grp);
      this.byUid.set(uid, {
        grp, setVoice: vis.setVoice, dispose: vis.dispose, lookKey: lookKey(meta),
        target: kept ? kept.target : { x: 0, z: 2.5, yaw: 0 },
        bobSeed: Math.random() * 10,
      });
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

  // levelFn(uid) -> 0..1 live voice level; drives each figure's glow + mouth
  tick(dt, t, levelFn) {
    const k = Math.min(1, dt * 7);   // smoothing
    for (const [uid, g] of this.byUid) {
      if (g.setVoice) g.setVoice(levelFn ? (levelFn(uid) || 0) : 0, dt);
      const px = g.grp.position.x, py = g.grp.position.y, pz = g.grp.position.z;
      g.grp.position.x += (g.target.x - g.grp.position.x) * k;
      g.grp.position.z += (g.target.z - g.grp.position.z) * k;
      g.floatY = (g.floatY ?? 0) + ((g.target.y || 0) - (g.floatY ?? 0)) * k;
      let dy = g.target.yaw - g.grp.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      g.grp.rotation.y += dy * k;
      g.grp.position.y = (g.floatY || 0) + Math.sin(t * 1.8 + g.bobSeed) * 0.025;
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
