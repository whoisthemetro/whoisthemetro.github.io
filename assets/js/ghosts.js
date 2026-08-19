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

// build a peer's visual from their meta: their block outfit if they've built
// one, the glow-blob if they haven't. There is no third tier — everybody in
// here is made of the same primitives, which is the look.
function buildPeerVisual(meta) {
  if (!meta.outfit) return makeBlob(meta.color || "#ffb347");
  const a = buildAvatarFigure(meta.outfit);
  // arms/headPivot/lift are the joints a headset visitor drives. the blob has
  // none of them, and everything below checks before reaching for one.
  return { node: a.group, setVoice: a.setVoice, dispose: a.dispose,
           arms: a.arms, headPivot: a.headPivot, lift: a.lift, bones: a.bones };
}

/* --- driving a headset visitor's joints ---------------------------------
   Their pose carries the head's angles off the chest and both hands, already
   in this figure's own frame (xr.js undid the ghost's yaw before sending).

   The arms REACH, with two-bone IK across the shoulder and the elbow. Simply
   aiming the whole limb at the hand was the first cut and it reads fine while
   your arm is straight — but the hand then sits at full stretch always, so a
   controller held near your chest drove a hand through the middle of your own
   torso. Solving both bones puts the hand where the hand really is, which is
   what makes pointing at something mean anything.

   Standard planar solve: `a` swings the upper bone off the line to the target,
   the elbow closes by pi minus its interior angle, and the elbow bends about
   the arm's local X so it tracks forward like a real one. The reach is clamped
   just inside full extension — at exactly straight the triangle degenerates
   and the joint snaps.

   Everything eases, and everything falls back to its rest pose, so a peer who
   takes the headset off relaxes instead of freezing mid-gesture. --- */
const AIM_DOWN = new THREE.Vector3(0, -1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _bend = new THREE.Quaternion();
const _e = new THREE.Euler();
const clamp1 = (v) => Math.min(1, Math.max(-1, v));

function driveJoints(g, dt) {
  const vis = g.vis, t = g.target || {};
  if (!vis || !vis.arms) return;                 // a blob has no joints
  const k = Math.min(1, dt * 9);
  const vr = t.hy !== undefined;

  if (vis.headPivot) {
    _e.set(vr ? (t.hp || 0) : 0, vr ? t.hy : 0, vr ? (t.hr || 0) : 0, "YXZ");
    _q.setFromEuler(_e);
    vis.headPivot.quaternion.slerp(_q, k);
  }
  for (const side of ["l", "r"]) {
    const arm = vis.arms[side];
    if (!arm) continue;
    const elbow = arm.userData.elbow;
    const hand = vr ? t[side === "l" ? "lh" : "rh"] : null;
    if (hand && vis.bones) {
      // the hand arrives measured from the FEET; the shoulder lives in the
      // body group, which the shoes raised by `lift`
      _dir.set(hand[0] - arm.position.x,
               hand[1] - (vis.lift || 0) - arm.position.y,
               hand[2] - arm.position.z);
      const L1 = vis.bones.upper, L2 = vis.bones.fore;
      const d = Math.min(Math.max(_dir.length(), Math.abs(L1 - L2) + 0.02), L1 + L2 - 0.01);
      if (d > 1e-3) {
        _dir.normalize();
        const a = Math.acos(clamp1((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
        const th = Math.acos(clamp1((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2)));
        _q.setFromUnitVectors(AIM_DOWN, _dir);      // point the limb at the hand
        _q.multiply(_bend.setFromAxisAngle(AXIS_X, a));   // swing the upper bone off it
        arm.quaternion.slerp(_q, k);
        if (elbow) elbow.quaternion.slerp(_bend.setFromAxisAngle(AXIS_X, -(Math.PI - th)), k);
        continue;
      }
    }
    arm.quaternion.slerp(arm.userData.rest, k);   // nobody driving: hang
    if (elbow) elbow.quaternion.slerp(arm.userData.elbowRest, k);
  }
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
        grp, vis, dispose: vis.dispose, lookKey: lookKey(meta),
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
      if (g.vis && g.vis.setVoice) g.vis.setVoice(levelFn ? (levelFn(uid) || 0) : 0, dt);
      driveJoints(g, dt);
      const px = g.grp.position.x, py = g.grp.position.y, pz = g.grp.position.z;
      g.grp.position.x += (g.target.x - g.grp.position.x) * k;
      g.grp.position.z += (g.target.z - g.grp.position.z) * k;
      g.floatY = (g.floatY ?? 0) + ((g.target.y || 0) - (g.floatY ?? 0)) * k;
      // avatars are modelled facing +Z (face/chest on +Z), but a player at yaw=0
      // looks toward -Z — so a peer's figure has to be turned 180° from their raw
      // yaw or you'd only ever see the back of their head while they face you.
      let dy = (g.target.yaw + Math.PI) - g.grp.rotation.y;
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

  // where everyone is right now — the voice reverb needs to know which of
  // them is standing in the bathroom, and this is already the only place
  // that knows
  poses() {
    const out = [];
    for (const [uid, g] of this.byUid) if (g.target) out.push({ uid, x: g.target.x, z: g.target.z });
    return out;
  }
}
