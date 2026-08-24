/* ============================================================
   THE BEDROOM — the module panels, as a sheet of glass

   PLAITS and RINGS both hang in the room on a canvas, which is right on
   a desktop and in a headset: you aim the crosshair or the laser, and
   the instrument underneath stays playable. On a phone it is the wrong
   shape entirely. A knob is 17 css pixels across at arm's length, it
   moves when you turn your head, and setting it means landing a tap on
   an exact point of a ring — which is the complaint that produced this
   file.

   So on touch the SAME panel is also drawn onto a canvas locked to the
   bottom of the screen. Not a second UI: the same `draw()`, the same
   `hit()`, the same layout in the same canvas pixels. One drawing, two
   surfaces. A second implementation would be two things to keep in step
   and they would stop being in step the first week.

   THE ONE THING THAT IS DIFFERENT is how a knob moves. In the room a
   tap sets it by where you land on the sweep, because a crosshair has
   no drag. Here a knob LATCHES and then follows your finger anywhere on
   the screen — a real drag, the way the desktop one works, which is the
   thing that was actually being asked for. Once it is latched the whole
   sheet is the drag surface, so your thumb leaving the knob doesn't
   drop the value.

   It sits at the BOTTOM and only as tall as it needs to be, so the
   instrument is still on screen above it. A panel that covers the room
   is a panel you can't play under.
   ============================================================ */

const SHEET_ID = "panel-sheet";

/* How far a finger travels for the whole 270° sweep, in CSS pixels. 180 is
   about a thumb's reach on a phone held one-handed: short enough to get
   from 0 to 100 without re-gripping, long enough that you can still land a
   value in the middle. The in-world drag uses 320 because a mouse has a
   whole desk. */
const SWEEP_PX = 180;

export function createPanelSheet() {
  let host = null, canvas = null, ctx = null;
  let open = null;          // the panel spec while one is up
  let drag = null;          // { key, start, x0, y0, moved }

  function build() {
    host = document.createElement("div");
    host.id = SHEET_ID;
    canvas = document.createElement("canvas");
    host.appendChild(canvas);
    document.body.appendChild(host);
    ctx = canvas.getContext("2d");

    // pointer events, not touch events: one code path for a finger and for
    // a stylus, and it still works if somebody opens this on a tablet
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    // the sheet is a control surface, not the room: a drag across it must
    // not also walk you, and a long press must not offer to copy an image
    for (const ev of ["touchstart", "touchmove", "touchend", "contextmenu"])
      host.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  }

  // where a pointer landed, in the panel's OWN canvas pixels
  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return {
      px: ((e.clientX - r.left) / r.width) * open.size.w,
      py: ((e.clientY - r.top) / r.height) * open.size.h,
    };
  }
  // hit() speaks u,v like a raycast does, with v flipped
  const hitAt = (px, py) => open.mod.hit(px / open.size.w, 1 - py / open.size.h, ...(open.hitArgs || []));

  function onDown(e) {
    if (!open) return;
    canvas.setPointerCapture?.(e.pointerId);
    const { px, py } = toCanvas(e);
    const h = hitAt(px, py);
    if (h && h.type === "knob") {
      drag = { key: h.key, start: open.mod.knobFrac(open.state(), h.key),
               x0: e.clientX, y0: e.clientY, moved: false };
    } else {
      drag = { tap: h, x0: e.clientX, y0: e.clientY, moved: false };
    }
  }

  function onMove(e) {
    if (!open || !drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    if (drag.key == null || !drag.moved) return;
    // right or up turns it clockwise, same sense as the desktop drag
    open.mod.knobWrite(open.state(), drag.key, drag.start + (dx - dy) / SWEEP_PX);
    open.apply();
    paint();
  }

  function onUp(e) {
    if (!open || !drag) return;
    const d = drag;
    drag = null;
    if (d.key != null) {
      if (d.moved) open.save();       // a real turn is one saved edit
      return;
    }
    // a tap that never became a drag works the button it started on
    if (!d.moved && d.tap) open.tap(d.tap);
    paint();
  }

  function paint() {
    if (!open) return;
    open.mod.draw(ctx, open.state(), open.live ? open.live() : null);
  }

  return {
    /* spec: { mod, size, state(), apply(), save(), tap(hit), live?, hitArgs? }
       mod is the panel MODULE — draw/hit/knobFrac/knobWrite — so this file
       never learns what a Rings model or a Plaits engine is. */
    show(spec) {
      if (!host) build();
      open = spec;
      canvas.width = spec.size.w;
      canvas.height = spec.size.h;
      host.style.setProperty("--sheet-aspect", `${spec.size.w} / ${spec.size.h}`);
      host.classList.add("show");
      paint();
    },
    hide() {
      open = null; drag = null;
      host && host.classList.remove("show");
    },
    isOpen: () => !!open,
    // the room changed something (an arp step, the wasm finishing) — repaint
    refresh: paint,
  };
}
