/* ============================================================
   THE METRO — real avatars, loaded

   A peer whose meta carries an `avatar` URL is wearing a scanned/
   configured 3D avatar (a glTF binary — today that means MetaPerson;
   tomorrow, anything that exports a humanoid GLB). This module fetches,
   caches and clones them for the ghost system.

   Rules learned from the ecosystem:
   - models are cached per URL and CLONED per ghost (SkeletonUtils —
     skinned meshes can't be shared between scenes naively)
   - clones share geometry and textures with the cache, so disposing a
     ghost never disposes the cached model
   - anything that fails (dead URL, CORS, not a glTF) resolves null and
     the ghost keeps its procedural look. an avatar is never worth an
     error dialog.
   ============================================================ */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";

const cache = new Map();   // url -> Promise<GLTF|null>
const loader = new GLTFLoader();

export function loadGlbAvatar(url) {
  if (!url || typeof url !== "string") return Promise.resolve(null);
  let p = cache.get(url);
  if (p) return p;
  p = loader.loadAsync(url)
    .then((gltf) => gltf)
    .catch(() => { cache.delete(url); return null; });
  cache.set(url, p);
  return p;
}

// VRM 0.x files (VRoid and friends) face -Z, opposite the glTF spec's +Z.
// the extension block tells us which world the file comes from, so those
// flip themselves without anyone having to know why.
function looksLikeVrm0(gltf) {
  try {
    const ext = gltf.parser.json.extensions || {};
    return !!ext.VRM;                      // 0.x; VRMC_vrm (1.0) already faces +Z
  } catch (e) { return false; }
}

// Which way does this body actually face? The spec says +Z, but files come
// from everywhere (Sketchfab FBX conversions, exporters with baked roots)
// and lie freely. So ask the geometry: on a standing humanoid the TOES stick
// out in front — take every vertex in the bottom slice of the model (the
// feet) and see whether that mass leans +Z or -Z. Hair, capes and backpacks
// live too high to vote. Returns +1 (faces +Z), -1 (faces -Z), or 0 (can't
// tell — trust the spec).
// the most trustworthy witnesses are the BONES: on every humanoid rig the
// ankle→toe vector points where the feet point, and the head→eyes vector
// points where the face looks. coats, bases and hair can't fool a skeleton.
function boneForward(node, height) {
  const toes = [], eyes = [];
  let head = null;
  node.traverse((o) => {
    const nm = o.name || "";
    if (/eye/i.test(nm)) { if (o.isBone) eyes.push(o); return; }   // guards "Eyeball" from the toe test too
    if (/toe|ball/i.test(nm) && o.parent && /foot|ankle/i.test(o.parent.name || "")) toes.push(o);
    if (!head && o.isBone && /head/i.test(nm)) head = o;
  });
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  let z = 0, n = 0;
  for (const t of toes) {
    t.getWorldPosition(a); t.parent.getWorldPosition(b);
    z += a.z - b.z; n++;
  }
  if (n && Math.abs(z / n) > height * 0.004) return z > 0 ? 1 : -1;
  if (eyes.length >= 2 && head) {
    a.set(0, 0, 0);
    for (const e of eyes) { e.getWorldPosition(b); a.add(b); }
    a.divideScalar(eyes.length);
    head.getWorldPosition(b);
    const dz = a.z - b.z;
    if (Math.abs(dz) > height * 0.003) return dz > 0 ? 1 : -1;
  }
  return 0;
}

export function detectFacing(node) {
  node.updateMatrixWorld(true);
  {
    const box = new THREE.Box3().setFromObject(node);
    const bones = boneForward(node, Math.max(0.1, box.max.y - box.min.y));
    if (bones !== 0) return bones;
  }
  // the vertex BUFFER holds the bind pose, but bones can turn the rendered
  // body any way they like (Sketchfab FBX conversions do this constantly).
  // so read each vertex the way the renderer will: skinning applied.
  const v = new THREE.Vector3();
  const samples = [];
  node.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    const pos = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
    if (!pos) return;
    if (o.isSkinnedMesh && o.skeleton && o.skeleton.update) o.skeleton.update();
    const step = Math.max(1, Math.floor(pos.count / 4000));   // sampling is plenty
    for (let i = 0; i < pos.count; i += step) {
      if (o.isSkinnedMesh) { o.boneTransform(i, v); v.applyMatrix4(o.matrixWorld); }
      else v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      samples.push([v.y, v.z]);
    }
  });
  if (samples.length < 60) return 0;
  let minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [y, z] of samples) {
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const h = maxY - minY;
  if (h < 0.1) return 0;
  const footTop = minY + h * 0.12, centerZ = (maxZ + minZ) / 2;
  let sum = 0, n = 0;
  for (const [y, z] of samples) if (y <= footTop) { sum += z - centerZ; n++; }
  if (n < 30) return 0;                       // no feet to read (floating orb, etc)
  const lean = sum / n / h;                   // normalized: toes are ~2-6% of height
  if (lean > 0.008) return 1;
  if (lean < -0.008) return -1;
  return 0;
}

// Sketchfab-style character models often ship an ARTISTIC pose — head
// turned, eyes off to the side. In a room where the figure stands for a
// real person's gaze, that reads as "looking away from whoever they're
// talking to". So: find the eyes, measure how far off the body's forward
// they point, and turn the head bone until the gaze lines up. Yaw only —
// a slight up/down tilt is character, a sideways stare is a bug.
function straightenGaze(node) {
  node.updateMatrixWorld(true);
  const eyes = [];
  node.traverse((o) => { if (o.isBone && /eye/i.test(o.name || "")) eyes.push(o); });
  if (eyes.length < 2) return;
  // the head is the nearest ancestor of an eye that calls itself one —
  // matching by name alone can pick a sibling rig the eyes don't follow
  let head = null;
  for (let a = eyes[0].parent; a; a = a.parent) {
    if (/head/i.test(a.name || "")) { head = a; break; }
  }
  if (!head) return;
  const hp = new THREE.Vector3(); head.getWorldPosition(hp);
  const em = new THREE.Vector3(), t = new THREE.Vector3();
  for (const e of eyes) { e.getWorldPosition(t); em.add(t); }
  em.divideScalar(eyes.length);
  const fwd = em.sub(hp);
  const yawErr = Math.atan2(fwd.x, fwd.z);
  const deg = Math.abs(yawErr) * 180 / Math.PI;
  if (deg < 4 || deg > 75) return;          // straight enough — or nonsense; leave it
  // turn the head about the WORLD up axis, expressed in its parent's space
  // so the bone's own bind axes never enter into it
  const parentQ = new THREE.Quaternion();
  head.parent.getWorldQuaternion(parentQ);
  const fix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yawErr);
  head.quaternion.premultiply(parentQ.clone().invert().multiply(fix).multiply(parentQ));
  node.updateMatrixWorld(true);
}

// a fresh instance for one ghost. returns a node ready to drop into the
// ghost group: feet at y=0, facing +Z, real-world scale. `flip` turns a
// backwards model around; on top of the VRM auto-flip it's an XOR, so the
// manual switch can also UNDO a wrong guess.
export function instanceGlbAvatar(gltf, { flip = false } = {}) {
  if (!gltf || !gltf.scene) return null;
  const node = skeletonClone(gltf.scene);
  // who do we believe about which way is forward? the geometry first (toes
  // don't lie), then the VRM convention, then the spec. the manual flip
  // XORs on top so a person can always override a wrong guess.
  const toes = detectFacing(node);
  const backwards = toes !== 0 ? toes < 0 : looksLikeVrm0(gltf);
  if (flip !== backwards) node.rotation.y = Math.PI;
  straightenGaze(node);

  node.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true;
      o.frustumCulled = false;   // skinned bounds lie; a peer must never blink out mid-glide
    }
  });

  // normalize height: whatever the export ships, a person in the room is
  // people-sized. measure the model and scale it to ~1.72m.
  const box = new THREE.Box3().setFromObject(node);
  const h = box.max.y - box.min.y;
  if (h > 0.1) {
    const s = 1.72 / h;
    if (Math.abs(1 - s) > 0.08) node.scale.setScalar(s);
  }
  const box2 = new THREE.Box3().setFromObject(node);
  node.position.y -= box2.min.y;             // feet on the floor, wherever the origin was

  return node;
}
