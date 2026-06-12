/* ============================================================
   THE METRO — songs for the self-playing piano

   Original pieces in the mood of the early-2000s rock-piano
   ballads Metro grew up on — composed for this room, not copied
   from anyone's sheet music. The MIDI keybed is 15 keys of
   C major (C4..C6), so everything here lives in A minor.

   key map: 0 C4 · 1 D4 · 2 E4 · 3 F4 · 4 G4 · 5 A4 · 6 B4
            7 C5 · 8 D5 · 9 E5 · 10 F5 · 11 G5 · 12 A5 · 13 B5 · 14 C6
   ============================================================ */

// a bar of eighth-note ostinato: [top, mid, low] chord tones
function osti(bar, [t, m, l], accent = 1, soft = 0.7) {
  const ev = [];
  const seq = [t, m, l, m, t, m, l, m];
  for (let i = 0; i < 8; i++) ev.push([bar * 4 + i * 0.5, seq[i], i % 4 === 0 ? accent : soft]);
  return ev;
}
// a bar of quarter-note broken chord
function broken(bar, seq, vel = 0.8) {
  return seq.map((k, i) => [bar * 4 + i, k, i === 0 ? 1 : vel]);
}
// bass hits on beats 0 and 2
function bass(bar, root, vel = 0.9) {
  return [[bar * 4, root, vel], [bar * 4 + 2, root, vel * 0.8]];
}

export const SONGS = [
  {
    id: "wires",
    title: "in the wires",
    bpm: 86,
    beats: 32,
    notes: [
      // Am Am F F C C G G — the dark ostinato carries it
      ...osti(0, [12, 9, 7]), ...osti(1, [12, 9, 7]),
      ...osti(2, [10, 7, 5]), ...osti(3, [10, 7, 5]),
      ...osti(4, [11, 9, 7]), ...osti(5, [11, 9, 7]),
      ...osti(6, [11, 8, 6]), ...osti(7, [11, 8, 6]),
      ...bass(0, 5), ...bass(1, 5), ...bass(2, 3), ...bass(3, 3),
      ...bass(4, 0), ...bass(5, 0), ...bass(6, 4), ...bass(7, 4),
      // a thin voice over the back half
      [16, 14, 1.1], [19, 13, 1.0], [20, 12, 1.1],
      [24, 11, 1.0], [26, 12, 1.0], [27, 13, 1.0], [28, 12, 1.1],
    ],
  },
  {
    id: "lasttrain",
    title: "last train home",
    bpm: 72,
    beats: 32,
    notes: [
      // C G Am F, twice — slow broken chords, streetlight tempo
      ...broken(0, [7, 9, 11, 9]), ...broken(1, [6, 8, 11, 8]),
      ...broken(2, [7, 9, 12, 9]), ...broken(3, [5, 7, 10, 7]),
      ...broken(4, [7, 9, 11, 9]), ...broken(5, [6, 8, 11, 8]),
      ...broken(6, [7, 9, 12, 9]), ...broken(7, [5, 7, 10, 7]),
      ...bass(0, 0), ...bass(1, 4), ...bass(2, 5), ...bass(3, 3),
      ...bass(4, 0), ...bass(5, 4), ...bass(6, 5), ...bass(7, 3),
      // the melody only shows up on the way out
      [16.5, 14, 1.1], [18, 13, 1.0], [20.5, 12, 1.1], [22, 11, 1.0],
      [24.5, 9, 1.0], [26, 11, 1.0], [28, 8, 1.1], [30, 7, 1.0],
    ],
  },
  {
    id: "ghost105",
    title: "ghost of the 105",
    bpm: 100,
    beats: 32,
    notes: [
      // Dm Dm Am Am Em Em Am Am — broodier, faster
      ...osti(0, [12, 10, 8], 1, 0.65), ...osti(1, [12, 10, 8], 1, 0.65),
      ...osti(2, [12, 9, 7], 1, 0.65), ...osti(3, [12, 9, 7], 1, 0.65),
      ...osti(4, [13, 11, 9], 1, 0.65), ...osti(5, [13, 11, 9], 1, 0.65),
      ...osti(6, [12, 9, 7], 1, 0.65), ...osti(7, [12, 9, 7], 1, 0.65),
      ...bass(0, 1), ...bass(1, 1), ...bass(2, 5), ...bass(3, 5),
      ...bass(4, 2), ...bass(5, 2), ...bass(6, 5), ...bass(7, 5),
    ],
  },
];

/* ---------------- the player ----------------
   Lookahead scheduler: every 90 ms, schedule whatever falls in the
   next quarter second. hooks = {
     now()                — current audio-clock seconds
     note(key, vel, when) — schedule a piano note at audio time `when`
     visual(key, delayMs) — press the 3D key when the note sounds
     ended()              — the song was stopped or replaced
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
  const events = [...song.notes].sort((a, b) => a[0] - b[0]);
  const state = { song, hooks, t0: hooks.now() + 0.2, idx: 0, timer: 0 };
  state.timer = setInterval(() => {
    const now = hooks.now();
    const horizon = now + 0.25;
    while (true) {
      if (state.idx >= events.length) {           // loop around
        state.idx = 0;
        state.t0 += song.beats * beat;
      }
      const [b, key, vel = 1] = events[state.idx];
      const when = state.t0 + b * beat;
      if (when > horizon) break;
      state.idx++;
      if (when < now - 0.05) continue;            // missed (tab slept) — skip
      hooks.note(key, vel, when);
      hooks.visual(key, Math.max(0, (when - now) * 1000));
    }
  }, 90);
  cur = state;
  return true;
}
