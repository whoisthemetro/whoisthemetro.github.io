/* ============================================================
   THE METRO — songs for the self-playing studio

   Four originals in the mood of the early-2000s rock Metro grew up on —
   named after the tracks they evoke (In the End, The Messenger, Crawling,
   Breaking the Habit) but composed for this room, not lifted from anyone's
   sheet music. Each one now arranges across the room's three instruments
   and lives in its OWN key, tempo and groove, so they stop blurring into
   one another:

     · piano  → the MIDI keybed   (chromatic — see pianoNote, 0..24 from C4)
     · guitar → the telecaster    (guitarNote, real pitches, goes low)
     · drums  → the e-kit pads     (0 kick · 1 snare · 2 hat · 3 tomHi · 4 tomLo · 5 crash)

   Pitches are semitones from C4 (C4 = 0), written with N("Eb5") so the key
   stays legible; the guitar uses negatives for its low strings.
   ============================================================ */

const PC = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
// note name ("Eb5", "F#2", "A4") → semitones from C4 (octave 4 is the ref)
function N(name) { const m = /^([A-G][#b]?)(-?\d)$/.exec(name); return PC[m[1]] + (+m[2] - 4) * 12; }
// shift a phrase by `db` beats (pitches/velocities untouched) so a 4-bar
// motif can fill 8 bars without retyping it
const shift = (evs, db) => evs.map(([b, x, v = 1]) => [b + db, x, v]);
// closed hats across one bar, every `step` beats — pad 2
function hats(bar, step, vel = 0.3) { const e = []; for (let b = 0; b < 4; b += step) e.push([bar * 4 + b, 2, vel]); return e; }
// the plain backbeat: kick on 1 & the "and" of 3, snare on 2 & 4
const back = (bar, kv = 0.85, sv = 0.8) => [[bar * 4, 0, kv], [bar * 4 + 1, 1, sv], [bar * 4 + 2.5, 0, kv * 0.85], [bar * 4 + 3, 1, sv]];

export const SONGS = [
  {
    // boom-bap beat under a descending Eb-minor piano hook, low palm-mute
    // guitar tracking the roots — the down-tuned, head-nod mood
    id: "wires",
    title: "In the End",
    bpm: 105,
    beats: 32,
    piano: (() => {
      const m = [
        [0, N("Bb5"), 1.0], [0.75, N("Ab5"), 0.7], [1, N("Gb5"), 0.9], [1.5, N("F5"), 0.7],
        [2, N("Eb5"), 0.95], [3, N("Gb5"), 0.8], [3.5, N("F5"), 0.7],
        [4, N("Db5"), 0.95], [4.75, N("Eb5"), 0.7], [5, N("Gb5"), 0.9],
        [6, N("F5"), 0.85], [6.75, N("Eb5"), 0.7], [7, N("Db5"), 0.8],
        [8, N("B4"), 0.95], [9, N("Db5"), 0.85], [9.5, N("Eb5"), 0.8],
        [10, N("Gb5"), 0.9], [11, N("F5"), 0.8],
        [12, N("Eb5"), 1.0], [12.75, N("F5"), 0.7], [13, N("Gb5"), 0.9],
        [14, N("Bb5"), 0.95], [15, N("Ab5"), 0.8],
      ];
      return [...m, ...shift(m, 16)];
    })(),
    guitar: (() => {
      // Ebm · Cb · Db · Bb roots, mid-low, two hits a bar
      const m = [
        [0, N("Eb3"), 0.9], [2, N("Eb3"), 0.6],
        [4, N("B2"), 0.9], [6, N("B2"), 0.6],
        [8, N("Db3"), 0.9], [10, N("Db3"), 0.6],
        [12, N("Bb2"), 0.9], [14, N("Bb2"), 0.6],
      ];
      return [...m, ...shift(m, 16)];
    })(),
    drums: (() => {
      const d = [[0, 5, 0.6], [16, 5, 0.5]];   // crash atop each half
      for (let bar = 0; bar < 8; bar++) { d.push(...hats(bar, 0.5, 0.3), ...back(bar, 0.9, 0.8)); }
      return d;
    })(),
  },
  {
    // the quiet one: fingerpicked G-major guitar leads, sparse piano
    // answers, no drums at all — pure contrast to the other three
    id: "lasttrain",
    title: "The Messenger",
    bpm: 70,
    beats: 32,
    guitar: (() => {
      // bass-then-arpeggio Travis pattern, one chord per bar
      const chord = (bass, lo, mid, hi, midBass) => [
        [0, bass, 0.8], [0.5, hi, 0.5], [1, mid, 0.55], [1.5, lo, 0.5],
        [2, midBass, 0.6], [2.5, mid, 0.5], [3, hi, 0.55], [3.5, lo, 0.5],
      ];
      const G = chord(N("G2"), N("G4"), N("B3"), N("D4"), N("D3"));
      const D = chord(N("D2"), N("D4"), N("F#4"), N("A3"), N("A2"));
      const Em = chord(N("E2"), N("E4"), N("G3"), N("B3"), N("B2"));
      const C = chord(N("C2"), N("C4"), N("E3"), N("G3"), N("G2"));
      const bars = [G, D, Em, C, G, D, C, D];
      return bars.flatMap((c, i) => shift(c, i * 4));
    })(),
    // a high, hesitant melody that only lands a few notes a phrase
    piano: [
      [2, N("D5"), 0.7], [3.5, N("B4"), 0.6],
      [6, N("E5"), 0.7], [7, N("D5"), 0.6],
      [10, N("G5"), 0.7], [11, N("F#5"), 0.6],
      [14, N("E5"), 0.75], [15, N("D5"), 0.6],
      [18, N("B4"), 0.6], [22, N("G4"), 0.7],
      [26, N("C5"), 0.7], [27, N("E5"), 0.6], [30, N("D5"), 0.7],
    ],
  },
  {
    // a B-minor build: four bars of soft arpeggio intro, then the chorus
    // kicks in — crashes, driving backbeat, low power-chord guitar
    id: "skincrawler",
    title: "Crawling",
    bpm: 108,
    beats: 32,
    piano: [
      // intro: rising Bm · Bm · G · A arpeggios, quiet (kept inside C4..C6
      // so the keybed plays the real pitches instead of clamping low notes)
      [0, N("F#4"), 0.55], [1, N("B4"), 0.55], [2, N("D5"), 0.6], [3, N("F#5"), 0.55],
      [4, N("B4"), 0.55], [5, N("D5"), 0.55], [6, N("F#5"), 0.6], [7, N("B5"), 0.55],
      [8, N("G4"), 0.55], [9, N("B4"), 0.55], [10, N("D5"), 0.6], [11, N("G5"), 0.55],
      [12, N("A4"), 0.55], [13, N("C#5"), 0.55], [14, N("E5"), 0.6], [15, N("A5"), 0.55],
      // chorus: high chord stabs on the downbeats
      [16, N("B4"), 0.95], [16, N("D5"), 0.9], [16, N("F#5"), 0.95], [17.5, N("D5"), 0.7],
      [20, N("G4"), 0.95], [20, N("B4"), 0.9], [20, N("D5"), 0.95], [21.5, N("B4"), 0.7],
      [24, N("D5"), 0.95], [24, N("F#5"), 0.9], [24, N("A5"), 0.95], [25.5, N("F#5"), 0.7],
      [28, N("A4"), 0.95], [28, N("C#5"), 0.9], [28, N("E5"), 0.95], [29.5, N("E5"), 0.7],
    ],
    guitar: [
      // chorus only — Bm · G · D · A low roots, ringing
      [16, N("B2"), 0.9], [18, N("B2"), 0.6],
      [20, N("G2"), 0.9], [22, N("G2"), 0.6],
      [24, N("D3"), 0.9], [26, N("D3"), 0.6],
      [28, N("A2"), 0.9], [30, N("A2"), 0.6],
    ],
    drums: (() => {
      const d = [];
      for (let bar = 0; bar < 4; bar++) { d.push(...hats(bar, 1, 0.22), [bar * 4, 0, 0.5]); }  // intro: soft pulse
      d.push([12, 1, 0.4], [14, 1, 0.45]);                                                     // a fill into the drop
      d.push([16, 5, 0.7]);                                                                    // crash on the drop
      for (let bar = 4; bar < 8; bar++) { d.push(...hats(bar, 0.5, 0.34), ...back(bar, 0.9, 0.85)); }
      d.push([30, 3, 0.55], [30.5, 4, 0.55], [31, 4, 0.6]);                                    // tom fill back to the top
      return d;
    })(),
  },
  {
    // F#-minor driver: busy 16th-note hats, a relentless piano ostinato
    // and sustained power chords — the urgent, electronic one
    id: "ghost105",
    title: "Breaking the Habit",
    bpm: 100,
    beats: 16,
    piano: (() => {
      const m = [
        [0, N("F#4"), 0.9], [0.5, N("C#5"), 0.7], [1, N("F#5"), 0.85], [1.5, N("C#5"), 0.7],
        [2, N("A4"), 0.8], [2.5, N("C#5"), 0.7], [3, N("F#4"), 0.8], [3.5, N("A4"), 0.7],
        [4, N("D5"), 0.85], [4.5, N("F#5"), 0.7], [5, N("D5"), 0.85], [5.5, N("B4"), 0.7],
        [6, N("A4"), 0.8], [6.5, N("C#5"), 0.7], [7, N("D5"), 0.8], [7.5, N("B4"), 0.7],
      ];
      return [...m, ...shift(m, 8)];
    })(),
    guitar: [
      // F#m · D · A · E sustained roots, one per bar
      [0, N("F#2"), 0.85], [2, N("F#2"), 0.5],
      [4, N("D2"), 0.85], [6, N("D2"), 0.5],
      [8, N("A2"), 0.85], [10, N("A2"), 0.5],
      [12, N("E2"), 0.85], [14, N("E2"), 0.5],
    ],
    drums: (() => {
      const d = [[0, 5, 0.5]];
      for (let bar = 0; bar < 4; bar++) {
        d.push(...hats(bar, 0.25, 0.24));                                  // 16th-note hats = the engine
        d.push([bar * 4, 0, 0.85], [bar * 4 + 1.5, 0, 0.7], [bar * 4 + 2, 0, 0.8]);  // driving kick
        d.push([bar * 4 + 1, 1, 0.8], [bar * 4 + 3, 1, 0.8]);             // backbeat snare
      }
      return d;
    })(),
  },
];

/* ---------------- the player ----------------
   Lookahead scheduler: every 90 ms, schedule whatever falls in the next
   quarter second across ALL three tracks, merged into one timeline. hooks = {
     now()                       — current audio-clock seconds
     play(track, value, vel, when) — sound it; track ∈ piano|guitar|drum,
                                     value = semitone (piano/guitar) or pad (drum)
     press(track, value, delayMs)  — fire the 3D instrument when it sounds
     ended()                     — the song was stopped or replaced
   } */
let cur = null;

export function currentSongId() { return cur ? cur.song.id : null; }

export function stopSong() {
  if (!cur) return;
  clearInterval(cur.timer);
  const ended = cur.hooks.ended;
  cur = null;
  if (ended) try { ended(); } catch (e) {}
}

export function playSong(id, hooks) {
  stopSong();
  const song = SONGS.find(s => s.id === id);
  if (!song) return false;
  const beat = 60 / song.bpm;
  // one sorted timeline, every event tagged with its instrument
  const ev = [];
  for (const [b, s, v = 1] of song.piano || []) ev.push([b, "piano", s, v]);
  for (const [b, s, v = 1] of song.guitar || []) ev.push([b, "guitar", s, v]);
  for (const [b, p, v = 1] of song.drums || []) ev.push([b, "drum", p, v]);
  ev.sort((a, b) => a[0] - b[0]);
  const state = { song, hooks, t0: hooks.now() + 0.2, idx: 0, timer: 0, ev };
  state.timer = setInterval(() => {
    const now = hooks.now();
    const horizon = now + 0.25;
    while (true) {
      if (state.idx >= ev.length) {                // loop around
        state.idx = 0;
        state.t0 += song.beats * beat;
      }
      const [b, track, value, vel] = ev[state.idx];
      const when = state.t0 + b * beat;
      if (when > horizon) break;
      state.idx++;
      if (when < now - 0.05) continue;             // missed (tab slept) — skip
      hooks.play(track, value, vel, when);
      hooks.press(track, value, Math.max(0, (when - now) * 1000));
    }
  }, 90);
  cur = state;
  return true;
}
