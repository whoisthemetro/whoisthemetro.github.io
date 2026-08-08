// THE METRO x Mutable Instruments — wasm wrapper
//
// Wraps two of Émilie Gillet's designs (MIT license, github.com/pichenettes/eurorack)
// for the studio: Plaits (the 24-engine macro-oscillator, firmware 1.2) as a
// polyphonic synth voice, and Clouds (the granular processor) as an insert on
// the master bus. Everything is statically allocated — the audio thread never
// touches malloc.

#include <cstring>
#include <cmath>

#include "plaits/dsp/voice.h"
#include "stmlib/utils/buffer_allocator.h"
#include "clouds/dsp/granular_processor.h"

#define NUM_VOICES 6
#define RENDER_MAX 128     // one browser quantum
#define CL_BLOCK 32        // clouds' native block size

/* ================= Plaits: six of them ================= */

struct PVoice {
  plaits::Voice voice;
  plaits::Patch patch;
  plaits::Modulations mods;
  char buffer[16384];
  float level;
  bool active;
};

static PVoice voices[NUM_VOICES];
static plaits::Voice::Frame frames[24];
static float pl_mix[RENDER_MAX];

// shared patch settings — one panel, six voices wearing it
static float g_harmonics = 0.5f, g_timbre = 0.5f, g_morph = 0.5f;
static float g_decay = 0.5f, g_lpg = 0.5f;
static int g_engine = 8;   // classic virtual analog

extern "C" {

void mi_init() {
  for (int i = 0; i < NUM_VOICES; i++) {
    PVoice& v = voices[i];
    memset(v.buffer, 0, sizeof(v.buffer));
    stmlib::BufferAllocator allocator(v.buffer, sizeof(v.buffer));
    v.voice.Init(&allocator);
    memset(&v.patch, 0, sizeof(v.patch));
    memset(&v.mods, 0, sizeof(v.mods));
    v.patch.engine = g_engine;
    v.patch.note = 48.0f;
    v.patch.harmonics = 0.5f; v.patch.timbre = 0.5f; v.patch.morph = 0.5f;
    v.patch.decay = 0.5f; v.patch.lpg_colour = 0.5f;
    v.mods.trigger_patched = true;    // the sequencer is the trigger input
    v.mods.level_patched = false;     // so the internal envelope drives the LPG
    v.level = 0.0f;
    v.active = false;
  }
}

void pl_set(float harmonics, float timbre, float morph,
            float decay, float lpg, int engine) {
  g_harmonics = harmonics; g_timbre = timbre; g_morph = morph;
  g_decay = decay; g_lpg = lpg;
  if (engine < 0) engine = 0;
  if (engine > 23) engine = 23;
  g_engine = engine;
}

void pl_note_on(int slot, float note, float level) {
  if (slot < 0 || slot >= NUM_VOICES) return;
  PVoice& v = voices[slot];
  v.patch.note = note;
  v.level = level;
  v.mods.trigger = 1.0f;
  v.active = true;
}

void pl_note_off(int slot) {
  if (slot < 0 || slot >= NUM_VOICES) return;
  voices[slot].mods.trigger = 0.0f;
}

// renders every live voice, mixed to mono, n <= RENDER_MAX frames at 48kHz
float* pl_render(int n) {
  if (n > RENDER_MAX) n = RENDER_MAX;
  memset(pl_mix, 0, n * sizeof(float));
  for (int i = 0; i < NUM_VOICES; i++) {
    PVoice& v = voices[i];
    if (!v.active) continue;
    v.patch.harmonics = g_harmonics;
    v.patch.timbre = g_timbre;
    v.patch.morph = g_morph;
    v.patch.decay = g_decay;
    v.patch.lpg_colour = g_lpg;
    v.patch.engine = g_engine;
    float peak = 0.0f;
    int done = 0;
    while (done < n) {
      int chunk = n - done;
      if (chunk > 16) chunk = 16;   // the voice renders 24 max; 16 divides 128
      v.voice.Render(v.patch, v.mods, frames, chunk);
      for (int s = 0; s < chunk; s++) {
        float x = frames[s].out * (1.0f / 32768.0f) * v.level;
        pl_mix[done + s] += x;
        float a = fabsf(x);
        if (a > peak) peak = a;
      }
      done += chunk;
    }
    // a voice whose gate fell and whose tail died frees its slot
    if (v.mods.trigger <= 0.0f && peak < 0.0004f) v.active = false;
  }
  return pl_mix;
}

int pl_active() {
  int n = 0;
  for (int i = 0; i < NUM_VOICES; i++) if (voices[i].active) n++;
  return n;
}

/* ================= Clouds, across the whole mix ================= */

static clouds::GranularProcessor processor;
static uint8_t cl_large[118784];
static uint8_t cl_small[65536 - 128];
static clouds::ShortFrame cl_in_buf[RENDER_MAX];
static clouds::ShortFrame cl_out_buf[RENDER_MAX];
static float cl_io[4][RENDER_MAX];   // inL inR outL outR, shared with JS

float* cl_ptr(int which) { return cl_io[which]; }

void cl_init() {
  memset(cl_large, 0, sizeof(cl_large));
  memset(cl_small, 0, sizeof(cl_small));
  processor.Init(cl_large, sizeof(cl_large), cl_small, sizeof(cl_small));
  processor.set_playback_mode(clouds::PLAYBACK_MODE_GRANULAR);
  processor.set_num_channels(2);
  processor.set_low_fidelity(false);
  clouds::Parameters* p = processor.mutable_parameters();
  p->dry_wet = 0.0f;                 // dry until somebody reaches for it
  p->position = 0.0f; p->size = 0.5f; p->pitch = 0.0f;
  p->density = 0.5f; p->texture = 0.5f;
  p->stereo_spread = 0.5f; p->feedback = 0.0f; p->reverb = 0.0f;
  p->freeze = false;
}

void cl_set(float pos, float size, float pitch, float dens, float tex,
            float wet, float spread, float fb, float verb,
            int freeze, int mode) {
  clouds::Parameters* p = processor.mutable_parameters();
  p->position = pos;
  p->size = size;
  p->pitch = pitch;        // semitones, -48..48 on hardware CV; knob is -24..24
  p->density = dens;
  p->texture = tex;
  p->dry_wet = wet;
  p->stereo_spread = spread;
  p->feedback = fb;
  p->reverb = verb;
  p->freeze = freeze != 0;
  clouds::PlaybackMode m = (clouds::PlaybackMode)(mode & 3);
  if (m != processor.playback_mode()) processor.set_playback_mode(m);
}

// stereo in -> stereo out, n a multiple of 32 (the browser's 128 is)
void cl_process(int n) {
  if (n > RENDER_MAX) n = RENDER_MAX;
  for (int s = 0; s < n; s++) {
    float l = cl_io[0][s], r = cl_io[1][s];
    if (l > 1.0f) l = 1.0f; if (l < -1.0f) l = -1.0f;
    if (r > 1.0f) r = 1.0f; if (r < -1.0f) r = -1.0f;
    cl_in_buf[s].l = (short)(l * 32000.0f);
    cl_in_buf[s].r = (short)(r * 32000.0f);
  }
  for (int done = 0; done < n; done += CL_BLOCK) {
    processor.Process(cl_in_buf + done, cl_out_buf + done, CL_BLOCK);
    processor.Prepare();   // the buffer housekeeping the firmware does in its main loop
  }
  for (int s = 0; s < n; s++) {
    cl_io[2][s] = cl_out_buf[s].l * (1.0f / 32768.0f);
    cl_io[3][s] = cl_out_buf[s].r * (1.0f / 32768.0f);
  }
}

}  // extern "C"
