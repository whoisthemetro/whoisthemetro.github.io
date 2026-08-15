/* ============================================================
   THE METRO — the outfit picker
   A side panel you open by clicking the mirror. Pick a build, hair,
   top/bottom, beard, colors, a name + chest logo — every change
   updates the mirror live (the mirror IS the preview). Inclusive +
   curated; the option lists live in avatar-builder.js.

   openOutfitPicker(spec, { onChange, onSave, onClose }) -> { close }
   ============================================================ */

import { OPTIONS } from "./avatar-builder.js";

const LABELS = {
  build: "Build", hair: "Hair", shoe: "Shoes", beard: "Beard",
  // the colour rows say what the colour is ON, not what it's called
  skin: "Skin", hairColor: "Hair colour", topColor: "Shirt", bottomColor: "Trousers",
  shoeColor: "Shoe colour", faceColor: "Face glow",
};
const TITLE = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function openOutfitPicker(spec, { onChange, onSave, onClose } = {}) {
  const work = { ...spec };
  document.getElementById("outfit-picker")?.remove();

  const panel = document.createElement("div");
  panel.id = "outfit-picker";
  panel.style.cssText = [
    "position:fixed", "top:0", "left:0", "bottom:0", "width:286px", "z-index:60",
    "background:rgba(12,11,18,0.94)", "backdrop-filter:blur(6px)",
    "border-right:1px solid #2a2535", "box-shadow:4px 0 24px rgba(0,0,0,.5)",
    "overflow-y:auto", "padding:16px 16px 24px", "color:#eaf3ff",
    "font:13px/1.4 Archivo,system-ui,sans-serif",
  ].join(";");

  const h = document.createElement("div");
  h.textContent = "YOUR LOOK";
  h.style.cssText = "font:800 16px monospace;letter-spacing:.12em;color:#ffd9a0;margin-bottom:12px";
  panel.appendChild(h);

  const emit = () => onChange && onChange({ ...work });

  // a labelled row of choice chips
  function chips(key, opts, render = TITLE) {
    const wrap = document.createElement("div"); wrap.style.cssText = "margin:0 0 14px";
    const lab = document.createElement("div");
    lab.textContent = LABELS[key] || TITLE(key);
    lab.style.cssText = "font:700 11px monospace;letter-spacing:.1em;color:#8aa;margin-bottom:6px;text-transform:uppercase";
    wrap.appendChild(lab);
    const row = document.createElement("div"); row.style.cssText = "display:flex;flex-wrap:wrap;gap:6px";
    const btns = [];
    for (const o of opts) {
      const b = document.createElement("button");
      b.textContent = render(o);
      b.style.cssText = "padding:5px 9px;border-radius:8px;border:1px solid #333;cursor:pointer;font:600 12px Archivo;background:#1a1822;color:#cdd";
      b.onclick = () => { work[key] = o; paint(); emit(); };
      b._val = o; row.appendChild(b); btns.push(b);
    }
    wrap.appendChild(row); panel.appendChild(wrap);
    const paint = () => btns.forEach(b => {
      const on = b._val === work[key];
      b.style.background = on ? "#2a6fb0" : "#1a1822";
      b.style.color = on ? "#fff" : "#cdd";
      b.style.borderColor = on ? "#5aa6e8" : "#333";
    });
    paint();
    return { wrap };
  }

  // a labelled row of color swatches
  function swatches(key, colors) {
    const wrap = document.createElement("div"); wrap.style.cssText = "margin:0 0 14px";
    const lab = document.createElement("div");
    lab.textContent = LABELS[key] || TITLE(key);
    lab.style.cssText = "font:700 11px monospace;letter-spacing:.1em;color:#8aa;margin-bottom:6px;text-transform:uppercase";
    wrap.appendChild(lab);
    const row = document.createElement("div"); row.style.cssText = "display:flex;flex-wrap:wrap;gap:7px";
    const dots = [];
    for (const c of colors) {
      const d = document.createElement("button");
      d.style.cssText = `width:24px;height:24px;border-radius:50%;cursor:pointer;background:${c};border:2px solid #333`;
      d.onclick = () => { work[key] = c; paint(); emit(); };
      d._c = c; row.appendChild(d); dots.push(d);
    }
    wrap.appendChild(row); panel.appendChild(wrap);
    const paint = () => dots.forEach(d => { d.style.borderColor = d._c === work[key] ? "#fff" : "#333"; });
    paint();
  }

  // a labelled text input
  function textField(key, placeholder, max) {
    const wrap = document.createElement("div"); wrap.style.cssText = "margin:0 0 14px";
    const lab = document.createElement("div");
    lab.textContent = key === "logo" ? "Chest text" : TITLE(key);
    lab.style.cssText = "font:700 11px monospace;letter-spacing:.1em;color:#8aa;margin-bottom:6px;text-transform:uppercase";
    wrap.appendChild(lab);
    const inp = document.createElement("input");
    inp.value = work[key] || ""; inp.maxLength = max; inp.placeholder = placeholder;
    inp.style.cssText = "width:100%;box-sizing:border-box;padding:7px 9px;border-radius:8px;border:1px solid #333;background:#1a1822;color:#eaf3ff;font:600 13px Archivo";
    inp.oninput = () => { work[key] = inp.value; emit(); };
    wrap.appendChild(inp); panel.appendChild(wrap);
  }

  chips("build", OPTIONS.build);
  swatches("skin", OPTIONS.skinTones);
  chips("hair", OPTIONS.hair);
  swatches("hairColor", OPTIONS.hairColors);
  chips("beard", OPTIONS.beard);
  swatches("topColor", OPTIONS.swatches);
  swatches("bottomColor", OPTIONS.swatches);
  chips("shoe", OPTIONS.shoe);
  swatches("shoeColor", OPTIONS.shoeColors);
  swatches("faceColor", OPTIONS.faceColors);
  textField("logo", "METRO", 8);

  // a line, not a button: bringing your own .glb is a thing you do at the
  // podium's stanchion now, so this panel stays about the blocks
  const note = document.createElement("div");
  note.textContent = "drag the view to turn yourself round";
  note.style.cssText = "margin:2px 0 10px;font:600 11px monospace;letter-spacing:.06em;color:#6b7a8a;text-align:center";
  panel.appendChild(note);

  // SAVE sticks to the bottom of the panel: there are eleven rows above it now
  // and on a laptop it was scrolling off the end of a list you can't finish
  const foot = document.createElement("div");
  foot.style.cssText = [
    "position:sticky", "bottom:-24px", "margin:4px -16px -24px", "padding:12px 16px 18px",
    "background:linear-gradient(180deg,rgba(12,11,18,0) 0%,rgba(12,11,18,0.96) 30%)",
  ].join(";");
  const done = document.createElement("button");
  done.textContent = "✓ Save look";
  done.style.cssText = "width:100%;padding:11px;border-radius:10px;border:none;cursor:pointer;font:800 15px Archivo;background:#2f6b4a;color:#fff";
  done.onclick = () => { onSave && onSave({ ...work }); close(); };
  foot.appendChild(done);
  panel.appendChild(foot);

  const x = document.createElement("button");
  x.textContent = "✕";
  x.style.cssText = "position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:8px;border:1px solid #333;background:#1a1822;color:#cdd;cursor:pointer;font:700 14px Archivo";
  x.onclick = () => close();
  panel.appendChild(x);

  document.body.appendChild(panel);
  emit();

  function close() { panel.remove(); onClose && onClose(); }
  return { close };
}
