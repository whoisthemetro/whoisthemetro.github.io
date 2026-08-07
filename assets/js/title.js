/* ============================================================
   THE METRO — the door sign

   The intro title is a live shader wearing the hand-drawn METRO
   letterforms: a WebGL canvas renders the shader offscreen, and a 2D
   canvas draws the Caveat letters (each at its own jaunty angle) and
   composites the shader through them with source-in. Swap TITLE_FRAG
   for any Shadertoy-style mainImage shader to rebrand the sign.
   ============================================================ */

import { SHADER_ART } from "./shaderart.js";

// the placeholder art: the Balatro swirl from the gallery (GLSL1, vivid).
// when a different shader gets picked, point this at it — anything with
// mainImage(out vec4, in vec2) and no channels works.
const TITLE_FRAG = SHADER_ART.balatro.frag;

const LETTERS = [
  { ch: "M", rot: -4, dy: 4 },
  { ch: "E", rot: 2, dy: -5 },
  { ch: "T", rot: -2, dy: 2 },
  { ch: "R", rot: 3, dy: -3 },
  { ch: "O", rot: -3, dy: 4 },
];

export function startTitleFX(canvas) {
  const W = canvas.width, H = canvas.height;

  // --- the shader, on its own offscreen webgl canvas ---
  const glc = document.createElement("canvas");
  glc.width = W; glc.height = H;
  const gl = glc.getContext("webgl", { antialias: false, depth: false });
  const ctx = canvas.getContext("2d");
  if (!gl || !ctx) { fallback(canvas); return; }

  const vsrc = "attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }";
  const fsrc = "precision highp float;\nuniform vec3 iResolution;\nuniform float iTime;\nconst vec4 iMouse = vec4(0.0);\n"
    + TITLE_FRAG
    + "\nvoid main() { mainImage(gl_FragColor, gl_FragCoord.xy); }";
  const mk = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, vsrc));
    gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, fsrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) {
    console.warn("title shader failed, falling back:", e);
    fallback(canvas);
    return;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, "iResolution");
  const uTime = gl.getUniformLocation(prog, "iTime");
  gl.viewport(0, 0, W, H);
  gl.uniform3f(uRes, W, H, 1);

  // --- the letters ---
  const SIZE = 190;
  function drawLetters() {
    ctx.font = `700 ${SIZE}px Caveat, cursive`;
    ctx.textBaseline = "middle";
    const widths = LETTERS.map((l) => ctx.measureText(l.ch).width);
    const GAP = 10;
    const total = widths.reduce((a, b) => a + b, 0) + GAP * (LETTERS.length - 1);
    let x = (W - total) / 2;
    ctx.fillStyle = "#fff";
    LETTERS.forEach((l, i) => {
      ctx.save();
      ctx.translate(x + widths[i] / 2, H / 2 + l.dy);
      ctx.rotate((l.rot * Math.PI) / 180);
      ctx.fillText(l.ch, -widths[i] / 2, 0);
      ctx.restore();
      x += widths[i] + GAP;
    });
  }

  const t0 = performance.now();
  let raf = 0;
  function frame() {
    // the sign only lives while the door screen is up
    if (!canvas.isConnected || !canvas.closest(".overlay")?.classList.contains("show")) {
      cancelAnimationFrame(raf);
      return;
    }
    gl.uniform1f(uTime, (performance.now() - t0) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    drawLetters();
    ctx.globalCompositeOperation = "source-in";   // the shader only exists inside the ink
    ctx.drawImage(glc, 0, 0);
    raf = requestAnimationFrame(frame);
  }
  // Caveat has to be loaded or the mask draws in a serif fallback
  const kick = () => { frame(); };
  if (document.fonts?.load) {
    document.fonts.load(`700 ${SIZE}px Caveat`).then(kick, kick);
  } else kick();
}

// no WebGL (or a compile failure): plain warm letters, still hand-drawn
function fallback(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const draw = () => {
    ctx.font = "700 190px Caveat, cursive";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffb347";
    ctx.fillText("METRO", canvas.width / 2, canvas.height / 2);
  };
  if (document.fonts?.load) document.fonts.load("700 190px Caveat").then(draw, draw);
  else draw();
}
