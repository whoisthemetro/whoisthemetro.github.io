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

// a fresh instance for one ghost. returns a node ready to drop into the
// ghost group: feet at y=0, facing +Z, real-world scale. `flip` turns a
// backwards model around; on top of the VRM auto-flip it's an XOR, so the
// manual switch can also UNDO a wrong guess.
export function instanceGlbAvatar(gltf, { flip = false } = {}) {
  if (!gltf || !gltf.scene) return null;
  const node = skeletonClone(gltf.scene);
  if (flip !== looksLikeVrm0(gltf)) node.rotation.y = Math.PI;

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
