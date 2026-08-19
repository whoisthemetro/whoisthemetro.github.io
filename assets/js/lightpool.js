/* ============================================================
   THE METRO — the light pool

   three.js compiles every material's fragment shader against the
   TOTAL number of lights in the scene, and every lit pixel then
   loops over all of them. The bedroom+arcade ("home") carries 44
   point/spot lights between them, and at a Retina pixel ratio that
   measured as 95% of all GPU time — 46 ms a frame, about 21 fps, on
   an M1 Max. The room was never geometry-bound; it was light-bound.

   The obvious fix — switch lights off when they're out of view —
   is the one thing you cannot do, because CHANGING THE COUNT
   recompiles every shader in the scene. Turning your head would
   stutter.

   So the count never changes. There is one fixed bank of slots, and
   every frame the lights that actually matter are copied INTO those
   slots: position, colour, distance, decay, cone. A slot nobody
   wants fades to zero and waits. The shader always sees the same
   small number of lights, so it is compiled exactly once, while the
   room behaves as if all 44 were lit.

   What makes this honest rather than a cheat: a light with a finite
   `distance` physically cannot touch a fragment outside its own
   sphere, so any light whose sphere misses the view frustum is
   contributing nothing and dropping it is EXACT, not an
   approximation. Only when more lights than slots survive that test
   do we start choosing, and then we choose on how much of the
   screen each one can actually reach.

   Slots are sticky and fade. A light that keeps its slot never
   moves; one that loses it dims out over FADE seconds instead of
   vanishing, because a lamp popping off in your peripheral vision
   is more noticeable than a lamp that is slightly too dim for a
   fifth of a second.
   ============================================================ */

import * as THREE from "three";

const FADE = 0.18;        // seconds to dim a light out of its slot
const HIJACK = 0.3;       // a retiring slot this faint can be taken early

export function makeLightPool(scene, { points = 12, spots = 8 } = {}) {
  const src = [];                       // every light we've taken over
  const slots = { point: [], spot: [] };

  const mk = (kind) => {
    const l = kind === "point"
      ? new THREE.PointLight(0xffffff, 0, 1, 2)
      : new THREE.SpotLight(0xffffff, 0, 1, 0.5, 0.5, 2);
    l.visible = true;
    l.castShadow = false;
    l.userData.poolSlot = true;         // never bucketed, never culled
    scene.add(l);
    const s = { light: l, src: null, fade: 0 };
    if (kind === "spot") { l.target = new THREE.Object3D(); scene.add(l.target); }
    return s;
  };
  for (let i = 0; i < points; i++) slots.point.push(mk("point"));
  for (let i = 0; i < spots; i++) slots.spot.push(mk("spot"));

  /* take a light over: it stays in the scene graph (so whatever animates
     its intensity or drags it around still works) but is never drawn. */
  function adopt(light) {
    if (light.userData.poolSlot || light.userData.pooled) return false;
    if (light.castShadow) return false;                       // shadow casters keep their own slot
    if (!light.isPointLight && !light.isSpotLight) return false;
    if (!(light.distance > 0)) return false;                  // no throw = no sphere = can't be culled
    light.userData.pooled = true;
    light.userData.poolOn = true;                             // room scope, set by applyLightCull
    light.visible = false;
    src.push(light);
    return true;
  }

  const frustum = new THREE.Frustum();
  const pm = new THREE.Matrix4();
  const wp = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const sphere = new THREE.Sphere();
  const tgt = new THREE.Vector3();
  const want = { point: [], spot: [] };

  function update(camera, dt) {
    if (!src.length) return;
    /* the renderer refreshes these itself, but not until AFTER this runs, so
       a frustum built from them would be one frame behind the camera — which
       is exactly long enough to see a lamp catch up as you turn. */
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    camera.getWorldPosition(camPos);
    pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pm);

    want.point.length = 0; want.spot.length = 0;
    for (const l of src) {
      if (l.userData.poolOn === false) continue;
      if (l.intensity <= 0.001) continue;
      l.getWorldPosition(wp);
      sphere.set(wp, l.distance);
      if (!frustum.intersectsSphere(sphere)) continue;        // exact: cannot reach a visible pixel
      /* how much of the view can this one actually paint? roughly its apparent
         size: a bright wide lamp overhead beats a dim pinpoint across the hall.
         The floor under max() is what stops this saturating — without it, any
         light you are STANDING INSIDE divides by ~0 and scores off the scale,
         and the arcade's twelve wide ceiling lamps then take every slot and
         starve the feature lights (the podium spot went out; the figure on it
         went flat grey). Being inside a lamp is worth about 3x, not 16x. */
      const D2 = camPos.distanceTo(wp);
      const reach = l.distance;
      (l.isPointLight ? want.point : want.spot).push({
        l, score: l.intensity * reach / Math.max(reach * 0.35, D2),
      });
    }
    want.point.sort((a, b) => b.score - a.score);
    want.spot.sort((a, b) => b.score - a.score);

    fill(slots.point, want.point, dt);
    fill(slots.spot, want.spot, dt);
  }

  function fill(bank, wanted, dt) {
    const chosen = wanted.slice(0, bank.length).map((c) => c.l);
    const chosenSet = new Set(chosen);

    // 1. a slot already holding a light we still want does not move at all
    const held = new Set();
    const free = [];
    for (const s of bank) {
      if (s.src && chosenSet.has(s.src)) { held.add(s.src); continue; }
      free.push(s);                                            // empty, or retiring
    }

    // 2. everyone else needs a slot. emptiest first, so we interrupt the
    //    dimmest fade-out rather than one still visibly lit.
    const incoming = chosen.filter((l) => !held.has(l));
    free.sort((a, b) => a.fade - b.fade);
    for (const s of free) {
      if (!incoming.length) break;
      if (s.src && s.fade > HIJACK) continue;                  // still bright; let it finish
      s.src = incoming.shift();
      s.fade = 0;                                              // always fade in from black
    }

    // 3. drive every slot
    const step = dt > 0 ? dt / FADE : 1;
    for (const s of bank) {
      const L = s.light;
      if (!s.src) { s.fade = 0; L.intensity = 0; continue; }
      const rising = chosenSet.has(s.src);
      s.fade = Math.max(0, Math.min(1, s.fade + (rising ? step : -step)));
      if (!rising && s.fade <= 0) { s.src = null; L.intensity = 0; continue; }
      const o = s.src;
      o.getWorldPosition(wp);
      L.position.copy(wp);
      L.color.copy(o.color);
      L.distance = o.distance;
      L.decay = o.decay;
      L.intensity = o.intensity * s.fade;
      if (L.isSpotLight) {
        L.angle = o.angle;
        L.penumbra = o.penumbra;
        o.target.getWorldPosition(tgt);
        L.target.position.copy(tgt);
        L.target.updateMatrixWorld();
      }
    }
  }

  return {
    adopt, update,
    get size() { return { points, spots }; },
    get adopted() { return src.length; },
    _debug: { src, slots },
  };
}
