/* ============================================================
   THE METRO — rigged GLB avatars (shared loader)
   Loads a skinned glTF character, scales it to a target height,
   floors its feet at y=0, and drives its baked animation clips
   through an AnimationMixer with crossfades. Used by the arcade
   bartender now; the player-avatar picker + ghosts.js will share
   this same loader next.

   Stand-in models live in assets/avatars/ (Mixamo-format rigs).
   Swap the url for a styled Mixamo / Ready Player Me export and it
   just works — same rig, same clip names.
   ============================================================ */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const loader = new GLTFLoader();
const cache = new Map();   // url -> Promise<{ scene, animations }>

function load(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((resolve, reject) => {
      loader.load(url, (g) => resolve({ scene: g.scene, animations: g.animations }), undefined, reject);
    }));
  }
  return cache.get(url);
}

// returns { root, ready, play(name,fade), update(dt), loaded } — root is an empty
// group you parent immediately; the model pops in when the GLB resolves.
export function makeAvatar(url, { height = 1.7 } = {}) {
  const root = new THREE.Group();
  const api = { root, mixer: null, actions: {}, current: null, loaded: false };

  api.ready = load(url).then(({ scene, animations }) => {
    const model = SkeletonUtils.clone(scene);
    // scale to target height, then drop feet to y=0. Box3.setFromObject reads
    // matrixWorld, so we MUST update matrices first or the measured size is
    // garbage (and the model loads giant/tiny).
    model.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3(); box.getSize(size);
    const s = height / (size.y || 1);
    model.scale.setScalar(s);
    model.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(model);
    model.position.y -= box.min.y;
    model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } });
    root.add(model);

    api.mixer = new THREE.AnimationMixer(model);
    for (const clip of animations) api.actions[clip.name.toLowerCase()] = api.mixer.clipAction(clip);
    api.loaded = true;
    return api;
  }).catch((e) => { console.warn("avatar load failed:", url, e); return api; });

  // crossfade to a looping clip (ignored if missing or already current)
  api.play = (name, fade = 0.25) => {
    const a = api.actions[(name || "").toLowerCase()];
    if (!a || api.current === a) return;
    if (api.current) api.current.fadeOut(fade);
    a.reset().setLoop(THREE.LoopRepeat).fadeIn(fade).play();
    api.current = a;
  };
  // fire a one-shot clip (e.g. a wave), then hand back to the looping base
  api.once = (name, then, fade = 0.2) => {
    const a = api.actions[(name || "").toLowerCase()];
    if (!a) { if (then) api.play(then, fade); return; }
    if (api.current) api.current.fadeOut(fade);
    a.reset().setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
    a.fadeIn(fade).play(); api.current = a;
    const mixer = api.mixer;
    const onDone = (e) => { if (e.action === a) { mixer.removeEventListener("finished", onDone); if (then) api.play(then, fade); } };
    mixer.addEventListener("finished", onDone);
  };
  api.update = (dt) => { if (api.mixer) api.mixer.update(dt); };
  return api;
}
