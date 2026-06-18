/* ============================================================
   THE METRO — on-device DEBUG PANEL
   For chasing the "I can see through the walls into the other
   rooms" reports — almost always a mobile depth-precision thing
   (the rooms sit far apart but inside the camera's far plane, so
   the walls have to fully occlude them; a low-precision depth
   buffer lets the far room bleed through).

   Turn it on by visiting the site with #debug (or ?debug) in the
   URL — e.g. whoisthemetro.com/#debug. Then read it to me, hit
   COPY to grab the whole report, and — the useful bit — tap NEAR
   to raise the camera near-plane LIVE on the actual phone. If the
   see-through stops when NEAR goes up, we've found it and I ship
   that value as the fix. No build step, no extra deploy.
   ============================================================ */

export function initDebug(ctx) {
  const { renderer, camera, controls, room } = ctx;
  const gl = renderer.getContext();

  const param = (name) => { try { return gl.getParameter(gl[name]); } catch (e) { return "?"; } };

  // GPU vendor/renderer — THE single most useful datum for a mobile bug
  let vendor = "?", rend = "?";
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (ext) { vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL); rend = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL); }
  } catch (e) {}
  const attrs = gl.getContextAttributes() || {};
  const isGL2 = (typeof WebGL2RenderingContext !== "undefined") && (gl instanceof WebGL2RenderingContext);
  let frag = "?";
  try {
    const f = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    if (f) frag = `${f.precision}-bit (range ±${f.rangeMax})`;
  } catch (e) {}

  const staticLines = [
    `time: ${new Date().toISOString()}`,
    `UA: ${navigator.userAgent}`,
    `GPU: ${vendor} / ${rend}`,
    `WebGL${isGL2 ? "2" : "1"}  depth:${attrs.depth}  aa:${attrs.antialias}  alpha:${attrs.alpha}  stencil:${attrs.stencil}`,
    `DEPTH_BITS:${param("DEPTH_BITS")}  maxTex:${param("MAX_TEXTURE_SIZE")}  frag-highp:${frag}`,
    `devicePixelRatio:${(window.devicePixelRatio || 1).toFixed(2)}  renderer.pixelRatio:${renderer.getPixelRatio()}`,
    `screen:${innerWidth}x${innerHeight}`,
    `cam: fov ${camera.fov}  near ${camera.near}  far ${camera.far}`,
  ];
  // one-shot to the real console too, in case remote console is hooked up
  try { console.log("[METRO DEBUG]\n" + staticLines.join("\n")); } catch (e) {}

  /* ---- panel ---- */
  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;left:0;top:0;z-index:99999;max-width:97vw;max-height:64vh;overflow:auto;" +
    "font:11px/1.35 ui-monospace,monospace;color:#8effa0;background:rgba(2,6,10,.86);" +
    "padding:8px 10px 10px;white-space:pre-wrap;word-break:break-word;border:1px solid #1d5a2a;" +
    "border-top:0;border-left:0;border-bottom-right-radius:9px;pointer-events:auto;-webkit-user-select:text;user-select:text";
  const head = document.createElement("div");
  head.textContent = staticLines.join("\n");
  const live = document.createElement("div");
  live.style.cssText = "margin-top:6px;color:#cfe9ff";
  const errBox = document.createElement("div");
  errBox.style.cssText = "margin-top:6px;color:#ff9a9a;max-height:22vh;overflow:auto";
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "margin-top:8px;display:flex;gap:6px;flex-wrap:wrap";
  box.appendChild(head); box.appendChild(live); box.appendChild(errBox); box.appendChild(btnRow);
  document.body.appendChild(box);

  const mkBtn = (label, fn) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText =
      "font:700 12px ui-monospace,monospace;color:#06140a;background:#5ce07e;border:0;" +
      "border-radius:6px;padding:7px 10px;touch-action:manipulation";
    b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); fn(b); });
    btnRow.appendChild(b);
    return b;
  };

  // THE experiment: walk the near-plane up. far/near ratio is what kills mobile
  // depth precision; a bigger near tightens it dramatically. if see-through
  // stops at some step, that's the fix value.
  const NEARS = [0.05, 0.1, 0.2, 0.35, 0.5, 0.8];
  let ni = NEARS.indexOf(camera.near); if (ni < 0) ni = 0;
  const nearBtn = mkBtn("", () => {
    ni = (ni + 1) % NEARS.length;
    camera.near = NEARS[ni];
    camera.updateProjectionMatrix();
    syncNearLabel();
  });
  function syncNearLabel() { nearBtn.textContent = `NEAR ${camera.near}  (tap to raise)`; }
  syncNearLabel();

  mkBtn("COPY REPORT", async (b) => {
    const txt = [head.textContent, "", live.textContent, "", "errors:", errBox.textContent || "(none)"].join("\n");
    try { await navigator.clipboard.writeText(txt); b.textContent = "COPIED ✓"; }
    catch (e) { b.textContent = "select+copy ↑"; }
    setTimeout(() => { b.textContent = "COPY REPORT"; }, 1800);
  });
  mkBtn("HIDE", () => { box.style.display = box.style.display === "none" ? "block" : "none"; });

  /* ---- capture errors/warns live so the phone can show them ---- */
  const errs = [];
  const pushErr = (tag, msg) => {
    errs.push(`[${tag}] ${String(msg).slice(0, 240)}`);
    if (errs.length > 12) errs.shift();
    errBox.textContent = errs.join("\n");
  };
  const wrap = (name, tag) => {
    const orig = console[name];
    console[name] = function (...a) { try { pushErr(tag, a.join(" ")); } catch (e) {} return orig.apply(this, a); };
  };
  wrap("error", "err"); wrap("warn", "warn");
  window.addEventListener("error", (e) => pushErr("window", (e && e.message) || "error"));
  window.addEventListener("unhandledrejection", (e) => pushErr("promise", (e && e.reason && e.reason.message) || e.reason || "rejection"));

  /* ---- live readout, ~5x/sec ---- */
  let acc = 0, frames = 0, fps = 0;
  function tick(dt) {
    acc += dt; frames++;
    if (acc < 0.2) return;
    fps = Math.round(frames / acc); acc = 0; frames = 0;
    const p = controls.pos || { x: 0, y: 0, z: 0 };
    const info = renderer.info ? renderer.info.render : { calls: "?", triangles: "?" };
    live.textContent =
      `fps:${fps}  draws:${info.calls}  tris:${info.triangles}\n` +
      `room:${room ? room() : "?"}  pos: x ${p.x.toFixed(1)} y ${(p.y || 0).toFixed(1)} z ${p.z.toFixed(1)}\n` +
      `look: yaw ${(controls.yaw || 0).toFixed(2)} pitch ${(controls.pitch || 0).toFixed(2)}  near:${camera.near}`;
  }

  return { tick, box };
}
