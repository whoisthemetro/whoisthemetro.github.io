// THE METRO x Mutable Instruments — Rings, in its own translation unit
//
// Rings is the voice of the bedroom's telecaster. It is a resonator rather
// than an oscillator: you hit it and it rings, which makes it the right
// module for a guitar rather than a clever substitution — a pluck IS its
// native input.
//
// WHY THIS IS A SEPARATE FILE. rings/resources.h and plaits/resources.h both
// define LUT_FM_FREQUENCY_QUANTIZER_SIZE, and they disagree: 129 against 130.
// Including both in one translation unit compiles with nothing worse than a
// warning, and whichever header lands second silently wins for every inline
// function in that file. Nothing we call happens to index that table today,
// which is the worst kind of safe — it is one upstream change away from being
// an off-by-one into a lookup table, in wasm, on the audio thread. Two files
// and the question never comes up.

#include <cstring>

#include "rings/dsp/part.h"
#include "rings/dsp/patch.h"
#include "rings/dsp/performance_state.h"

#define RENDER_MAX 128     // one browser quantum

extern "C" {

/* ================= Rings: the telecaster's voice =================

   Rings is a resonator, not an oscillator: you hit it and it rings. That
   makes it the right module for a guitar rather than a clever substitution
   — a pluck IS its native input.

   Driven the way rings_test.cc drives it, which is the only honest
   documentation for using Part outside the firmware:
     · note is a MIDI number MINUS 12, with tonic at 0
     · `strum` true for exactly ONE block starts a note
     · blocks are at most kMaxBlockSize (24), so a browser's 128-sample
       quantum gets chopped into six
   The Strummer is deliberately not used. It exists to find note onsets in an
   audio input; we know exactly when a string was plucked, because something
   in the room plucked it.

   internal_exciter is TRUE: nothing is patched into the module's input, so
   Rings supplies its own pluck — which is what the hardware does when the IN
   jack is empty. */

static rings::Part ri_part;
static uint16_t ri_reverb[32768];
static rings::Patch ri_patch;
static float ri_in[RENDER_MAX], ri_outbuf[RENDER_MAX], ri_auxbuf[RENDER_MAX], ri_mix[RENDER_MAX];
static float ri_note = 36.0f, ri_level = 0.7f;
static int ri_strum = 0;

void ri_init() {
  memset(ri_reverb, 0, sizeof(ri_reverb));
  memset(ri_in, 0, sizeof(ri_in));
  ri_part.Init(ri_reverb);
  ri_part.set_polyphony(4);
  ri_part.set_model(rings::RESONATOR_MODEL_STRING);
  ri_patch.structure = 0.35f;
  ri_patch.brightness = 0.5f;
  ri_patch.damping = 0.7f;
  ri_patch.position = 0.25f;
}

void ri_set(float structure, float brightness, float damping, float position,
            int model, int polyphony) {
  ri_patch.structure = structure;
  ri_patch.brightness = brightness;
  ri_patch.damping = damping;
  ri_patch.position = position;
  if (model < 0) model = 0;
  if (model > 5) model = 5;
  ri_part.set_model(static_cast<rings::ResonatorModel>(model));
  if (polyphony < 1) polyphony = 1;
  if (polyphony > 4) polyphony = 4;
  ri_part.set_polyphony(polyphony);
}

// one pluck. `note` is an ordinary MIDI note number; the -12 that Rings wants
// is applied here so the room never has to know about the module's convention.
void ri_note_on(float note, float level) {
  ri_note = note - 12.0f;
  ri_level = level;
  ri_strum = 1;
}

float* ri_render(int n) {
  if (n > RENDER_MAX) n = RENDER_MAX;
  int done = 0;
  while (done < n) {
    int chunk = n - done;
    if (chunk > (int)rings::kMaxBlockSize) chunk = (int)rings::kMaxBlockSize;
    rings::PerformanceState ps;
    ps.strum = ri_strum ? true : false;
    ps.internal_exciter = true;
    ps.internal_strum = false;
    ps.internal_note = false;
    ps.tonic = 0.0f;
    ps.note = ri_note;
    ps.fm = 0.0f;
    ps.chord = 0;
    ri_strum = 0;                      // one block only, or it re-plucks forever
    ri_part.Process(ps, ri_patch, ri_in + done, ri_outbuf + done, ri_auxbuf + done, chunk);
    done += chunk;
  }
  // the module has two outs; the room's guitar bus is one. odd + even, halved.
  for (int i = 0; i < n; i++) ri_mix[i] = (ri_outbuf[i] + ri_auxbuf[i]) * 0.5f * ri_level;
  return ri_mix;
}

}  // extern "C"
