/* ============================================================
   THE METRO — baking the wall art

   The acoustic slabs wear hand-written Shadertoy pieces, and they
   were being evaluated the expensive way: as materials on the slabs
   themselves, so every piece ran once per SCREEN PIXEL it covered,
   every frame. Stand near the gallery wall on a Retina display and a
   single panel is a million-pixel raymarch. Measured at the spawn
   view, dpr 2: a frame cost 19.4 ms (about 51 fps) and 47% of it was
   these panels.

   The cost had nothing to do with how much detail you can actually
   see. A slab is half a metre wide. So each piece now renders once
   into its own small offscreen texture, and the slab just wears that
   texture — the same trick the KuKo rug already uses. Cost stops
   scaling with your resolution or how close you stand, and becomes a
   fixed, tiny, known number.

   Three things keep it honest:
     - RATE. A piece of generative art at 20 fps looks exactly as
       alive as one at 120, so it steps at its own clock, not the
       room's.
     - BUDGET. Only a couple of panels are allowed to redraw on any
       one frame, round-robin, so fourteen panels can never land on
       the same frame and spike it.
     - RELEVANCE. A panel behind you doesn't redraw at all. It keeps
       its last frame and catches up within about a frame of coming
       back into view, which nobody can see.

   Every panel is baked once at build time, so none of them is ever
   black — including ones you haven't looked at yet.

   NOTE the render-target save/restore. Inside a WebXR session three.js
   binds the headset's framebuffer before the frame callback, so
   setRenderTarget(null) would send the room to the canvas and black
   out the headset. Always restore what was bound. (Same rule as the
   bathroom mirrors and the rug — see CLAUDE.md.)
   ============================================================ */

import * as THREE from "three";

export function makeShaderBake(renderer, { px = 288, hz = 20, perFrame = 2, near = 18 } = {}) {
  const scene = new THREE.Scene();
  // the three.js full-screen-quad idiom: plane at the origin, ortho 0..1 depth
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  scene.add(quad);

  const items = [];
  const camPos = new THREE.Vector3();
  const frustum = new THREE.Frustum();
  const pmv = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  let cursor = 0;

  /* hand it the ShaderMaterial and the slab's proportions; it hands back a
     plain textured material to hang on the slab instead. `setTime` lets a
     piece with its own uniform names (the neuro pair pack time into u_scene)
     say what "now" means to it. */
  function add(mat, w, h, setTime) {
    const H = px;
    const W = Math.max(16, Math.round(px * (w / h)));
    const rt = new THREE.WebGLRenderTarget(W, H, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    /* the piece writes display-ready colour. Tagging the target sRGB makes
       three.js encode on the way in and decode on the way out, so the round
       trip through a texture lands on the same pixels as drawing it direct. */
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const faceMat = new THREE.MeshBasicMaterial({ map: rt.texture, toneMapped: false });
    const it = { mat, rt, faceMat, mesh: null, setTime, due: 0, fresh: false };
    items.push(it);
    return it;
  }

  function draw(it, elapsed, dt) {
    if (it.setTime) it.setTime(elapsed, dt);
    else {
      const u = it.mat.uniforms;
      if (u.iTime) u.iTime.value = elapsed;
      if (u.iTimeDelta) u.iTimeDelta.value = dt || 1 / 60;
    }
    quad.material = it.mat;
    const prev = renderer.getRenderTarget();     // never null — see the note above
    /* and the CAMERA needs the same care as the framebuffer: while a session
       is presenting, renderer.render() ignores the camera you pass and
       substitutes the headset's eyes. the bake was being drawn from the
       visitor's HEAD POSE — so the art slid around with every head turn, and
       went black whenever the quad fell out of the head's frustum. switch xr
       off for the pass so the ortho quad camera actually gets used. */
    const xrWas = renderer.xr.enabled;
    renderer.xr.enabled = false;
    renderer.setRenderTarget(it.rt);
    renderer.render(scene, cam);
    renderer.setRenderTarget(prev);
    renderer.xr.enabled = xrWas;
    it.fresh = true;
  }

  // paint every panel once so nothing is ever blank, even unseen
  function warm(elapsed = 0) { for (const it of items) draw(it, elapsed, 1 / 60); }

  function visible(it) {
    if (!it.mesh) return true;                   // unplaced: always keep it current
    for (let c = it.mesh; c; c = c.parent) if (!c.visible) return false;
    const g = it.mesh.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    sphere.copy(g.boundingSphere).applyMatrix4(it.mesh.matrixWorld);
    if (camPos.distanceTo(sphere.center) > near) return false;
    return frustum.intersectsSphere(sphere);
  }

  function tick(dt, elapsed, camera) {
    if (!items.length) return;
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    pmv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pmv);
    camera.getWorldPosition(camPos);

    const step = 1 / hz;
    for (const it of items) it.due += dt;
    let budget = perFrame;
    for (let n = 0; n < items.length && budget > 0; n++) {
      const it = items[(cursor + n) % items.length];
      if (it.due < step) continue;
      if (!visible(it)) continue;                // stays due; redraws the moment you look
      it.due = 0;
      draw(it, elapsed, dt);
      budget--;
    }
    cursor = (cursor + 1) % items.length;
  }

  return { add, tick, warm, get count() { return items.length; }, _items: items };
}
