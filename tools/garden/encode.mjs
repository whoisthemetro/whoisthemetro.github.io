#!/usr/bin/env node
/* ============================================================
   THE GARDEN — the encode pipeline

   Masters in, web audio out. One pass does all four things a track
   needs before it can be planted:

     1. loudness-match it (two-pass EBU R128 → -16 LUFS), so walking
        the path doesn't mean riding a volume knob. A sound-design
        archive is the worst case for this: a field recording and a
        mastered mix are 20 dB apart and both are "correct".
     2. encode it to AAC (.m4a) — see docs for why not Opus.
     3. read its PEAKS, 256 buckets of them, which is what the plant
        in the bed is SHAPED like. The waveform is the real track.
     4. write it into assets/js/garden-catalog.js.

   The .m4a files go to assets/audio/garden/ which is GITIGNORED, and
   from there to R2. They are never committed — git keeps every version
   of every file forever, and audio is exactly the thing you re-master.
   The catalog IS committed: it's a couple of KB and the room needs the
   peaks to build the beds before a single byte of audio loads.

   usage
     node tools/garden/encode.mjs ~/masters/*.wav      # encode + plant
     node tools/garden/encode.mjs --demo               # 8 placeholder pieces
     node tools/garden/encode.mjs --list               # what's planted
     node tools/garden/encode.mjs --rm <id>            # dig one up

   flags
     --bitrate 128k   AAC bitrate (default 128k)
     --raw            skip loudness matching (already mastered to spec)
     --bed a|b        which side of the path (default: alternates)
     --reshape        recompute every planted track's waveform from the
                      encode that's already on disk (no re-encoding)
   ============================================================ */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const exec = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT_DIR = path.join(ROOT, "assets/audio/garden");
const CATALOG = path.join(ROOT, "assets/js/garden-catalog.js");
const TITLES = path.join(import.meta.dirname, "titles.json");

const BINS = 256;          // peak buckets per track = how many teeth the blade has
const TARGET_LUFS = -16;   // web-standard-ish; podcasts sit here, so do most streams
const args = process.argv.slice(2);
const flag = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = args[i + 1];
  return (v && !v.startsWith("--")) ? v : true;
};
const has = (name) => args.includes(`--${name}`);
const files = args.filter((a, i) =>
  !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && flag(args[i - 1].slice(2)) === a));

const BITRATE = flag("bitrate", "128k");

/* ---------------- the catalog ---------------- */
// read the committed catalog back by importing it — it's a real module, so
// there's no parser to keep in sync with it
async function readCatalog() {
  try {
    const mod = await import(`file://${CATALOG}?t=${Date.now()}`);
    return { base: mod.GARDEN_BASE, tracks: [...(mod.GARDEN_TRACKS || [])] };
  } catch (e) {
    return { base: "", tracks: [] };
  }
}

async function writeCatalog(base, tracks) {
  // beds alternate down the path in catalog order unless a track asks for a side
  const body = tracks.map((t) => {
    const peaks = t.peaks.join(",");
    return `  {
    id: ${JSON.stringify(t.id)},
    title: ${JSON.stringify(t.title)},
    file: ${JSON.stringify(t.file)},
    dur: ${t.dur},${t.bed ? `\n    bed: ${JSON.stringify(t.bed)},` : ""}${t.note ? `\n    note: ${JSON.stringify(t.note)},` : ""}
    peaks: [${peaks}],
  },`;
  }).join("\n");

  const out = `/* ============================================================
   THE GARDEN — the catalog. GENERATED, do not hand-edit.

   Written by tools/garden/encode.mjs. Each entry is one plant in a
   bed: its title is on the stake, and \`peaks\` (256 buckets, 0-100)
   is the shape of the blade that grows out of the soil. That's the
   real waveform of the real track, which is why every plant in there
   looks like different music.

   The audio itself is NOT in this repo — \`file\` hangs off GARDEN_BASE,
   which points at R2 in production and at a local folder when you're
   working offline (see tools/garden/README.md).
   ============================================================ */

// where the audio lives. an empty string means "next to the site", i.e.
// assets/audio/garden/ — which is gitignored, so that's the local-only case.
export const GARDEN_BASE = ${JSON.stringify(base)};

export const GARDEN_TRACKS = [
${body}
];
`;
  await fs.writeFile(CATALOG, out);
}

/* ---------------- ffmpeg ---------------- */
async function probeDur(file) {
  const { stdout } = await exec("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", file,
  ]);
  return Math.round(parseFloat(stdout.trim()) * 10) / 10;
}

// pass one of loudnorm: measure. ffmpeg prints the numbers to STDERR as JSON —
// and it exits 0 while doing it, so the stderr has to be read off the SUCCESS
// path too. Reading it only from the catch block silently skipped every
// loudness match and left a garden of knee-high plants.
async function measure(file) {
  let err = "";
  try {
    const r = await exec("ffmpeg", ["-hide_banner", "-nostats", "-i", file,
      "-af", `loudnorm=I=${TARGET_LUFS}:TP=-1.5:LRA=11:print_format=json`,
      "-f", "null", "-"], { maxBuffer: 1 << 24 });
    err = String(r.stderr || "");
  } catch (e) { err = String(e.stderr || ""); }
  if (!err) return null;
  const m = err.match(/\{[\s\S]*?\}/g);
  if (!m) return null;
  try { return JSON.parse(m[m.length - 1]); } catch (e) { return null; }
}

async function encode(file, dest) {
  // AudioToolbox's AAC encoder if we have it (we're on a mac; it's the best
  // AAC around), plain ffmpeg aac otherwise
  const { stdout: encList } = await exec("ffmpeg", ["-hide_banner", "-encoders"]);
  const codec = encList.includes("aac_at") ? "aac_at" : "aac";

  let filter = "aresample=48000";
  if (!has("raw")) {
    const m = await measure(file);
    if (m) {
      // pass two: apply the measured numbers. linear mode is the transparent
      // one — it's a single gain change, not a compressor riding the track.
      filter = `loudnorm=I=${TARGET_LUFS}:TP=-1.5:LRA=11:linear=true:` +
        `measured_I=${m.input_i}:measured_TP=${m.input_tp}:` +
        `measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:` +
        `offset=${m.target_offset},aresample=48000`;
    }
  }

  await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", file,
    "-map", "a:0", "-af", filter, "-ac", "2", "-c:a", codec, "-b:a", BITRATE,
    "-movflags", "+faststart",   // moov atom first, so it can stream before it's finished downloading
    dest]);
}

/* the shape of the plant: decode to cheap mono, bucket into BINS, and measure
   each bucket. Three decisions here, and all three came from looking at ten
   real mastered tracks and finding ten identical hedges.

   1. PEAK ALONE IS A RECTANGLE. A peak envelope of anything mastered pins to
      the ceiling in nearly every bucket, so the plant shows the limiter's work
      and not the music's. RMS shows where a piece actually breathes. The blend
      keeps transients readable (a percussive hit still spikes) while letting
      dynamics drive the silhouette.
   2. NORMALIZED PER TRACK. Every track has already been loudness-matched to
      the same -16 LUFS, so absolute height across plants encodes crest factor
      — not loudness, and nothing a listener cares about. Scaling each plant to
      its own maximum spends the full height on the thing that IS informative:
      this piece's own shape. A silent intro reads as bare soil; a swell reads
      as a hill.
   3. A GAMMA LIFT. Quiet passages sit so far down a linear scale that they
      vanish into the 22 cm floor. ^0.72 pulls them up without flattening the
      loud half. */
async function peaks(file) {
  const { stdout } = await exec("ffmpeg", ["-hide_banner", "-loglevel", "error",
    "-i", file, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"],
    { encoding: "buffer", maxBuffer: 1 << 28 });
  const n = Math.floor(stdout.length / 2);
  const out = new Array(BINS).fill(0);
  if (!n) return out;
  const per = n / BINS;
  const raw = new Array(BINS).fill(0);
  for (let b = 0; b < BINS; b++) {
    const i0 = Math.floor(b * per), i1 = Math.min(n, Math.floor((b + 1) * per));
    let mx = 0, sum = 0, cnt = 0;
    for (let i = i0; i < i1; i++) {
      const v = stdout.readInt16LE(i * 2) / 32768;
      const a = Math.abs(v);
      if (a > mx) mx = a;
      sum += v * v; cnt++;
    }
    const rms = cnt ? Math.sqrt(sum / cnt) : 0;
    raw[b] = mx * 0.4 + rms * 0.6;
  }
  const top = Math.max(...raw);
  if (top <= 0) return out;
  for (let b = 0; b < BINS; b++) {
    out[b] = Math.round(Math.pow(raw[b] / top, 0.72) * 100);
  }
  return out;
}

/* ---------------- demo pieces ----------------
   Eight placeholder tracks so the room can be built and walked before
   Metro has picked a single real one. They are deliberately DIFFERENT
   SHAPES — a drone is a flat blade, a pulse is a comb, sparse hits are
   a row of spikes — because the whole point of the beds is that you can
   see what a track is before you hear it. Delete them the day the real
   ones land: `--rm demo-<name>`. */
const DEMO = [
  { id: "demo-drone", title: "test · drone", dur: 75,
    a: "sine=f=110:d=75,volume=0.5[a];sine=f=110.7:d=75,volume=0.4[b];[a][b]amix=inputs=2,lowpass=f=1800" },
  { id: "demo-pulse", title: "test · pulse", dur: 60,
    a: "sine=f=220:d=60,tremolo=f=2:d=0.95,lowpass=f=2400" },
  { id: "demo-swell", title: "test · swell", dur: 55,
    a: "anoisesrc=c=pink:d=55:a=0.5,lowpass=f=900,afade=t=in:st=0:d=40,afade=t=out:st=45:d=10" },
  { id: "demo-rain", title: "test · static bed", dur: 90,
    a: "anoisesrc=c=pink:d=90:a=0.35,highpass=f=400,lowpass=f=6000" },
  { id: "demo-perc", title: "test · hits", dur: 48,
    a: "sine=f=90:d=48,tremolo=f=0.75:d=1,lowpass=f=700" },
  { id: "demo-riser", title: "test · riser", dur: 40,
    a: "sine=f=80:d=40,asetrate=48000,volume='0.15+0.6*t/40':eval=frame,lowpass=f=3000" },
  { id: "demo-sparse", title: "test · sparse", dur: 70,
    a: "sine=f=330:d=70,tremolo=f=0.2:d=1,highpass=f=200" },
  // one long one on purpose: 6 minutes is what actually proves the room
  // streams instead of downloading a track before it plays
  { id: "demo-long", title: "test · the long one", dur: 360,
    a: "sine=f=55:d=360,volume=0.5[a];anoisesrc=c=brown:d=360:a=0.3,lowpass=f=500[b];[a][b]amix=inputs=2,tremolo=f=0.12:d=0.5" },
];

async function makeDemo(spec, tmp) {
  const wav = path.join(tmp, `${spec.id}.wav`);
  await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
    "-filter_complex", `${spec.a},aformat=sample_fmts=s16:channel_layouts=stereo`,
    "-t", String(spec.dur), wav]);
  return wav;
}

/* ---------------- titles ----------------
   The catalog is generated, so a name hand-typed into it dies the next time
   that track is re-encoded. titles.json is where a name survives. */
async function readTitles() {
  try { return JSON.parse(await fs.readFile(TITLES, "utf8")); }
  catch (e) { return {}; }
}

/* ---------------- main ---------------- */
const slug = (s) => path.basename(s).replace(/\.[^.]+$/, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "track";
const titleOf = (s) => path.basename(s).replace(/\.[^.]+$/, "")
  .replace(/[_-]+/g, " ").trim().toLowerCase();

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const cat = await readCatalog();
  const titles = await readTitles();

  if (has("list")) {
    if (!cat.tracks.length) return console.log("nothing planted yet.");
    console.log(`base: ${cat.base || "(local assets/audio/garden/)"}`);
    for (const t of cat.tracks) {
      const m = Math.floor(t.dur / 60), s = Math.round(t.dur % 60);
      console.log(`  ${t.id.padEnd(22)} ${String(m)}:${String(s).padStart(2, "0")}  ${t.title}`);
    }
    return;
  }

  if (has("reshape")) {
    for (const t of cat.tracks) {
      const f = path.join(OUT_DIR, t.file);
      try { await fs.access(f); } catch (e) { console.log(`  ${t.id} … no local encode, skipped`); continue; }
      t.peaks = await peaks(f);
      if (titles[t.id]) t.title = titles[t.id];
      console.log(`  ${t.id} … reshaped`);
    }
    await writeCatalog(cat.base, cat.tracks);
    return console.log(`\n${cat.tracks.length} plants re-shaped`);
  }

  if (has("rm")) {
    const id = flag("rm");
    const before = cat.tracks.length;
    cat.tracks = cat.tracks.filter((t) => t.id !== id);
    if (cat.tracks.length === before) return console.log(`no such plant: ${id}`);
    await writeCatalog(cat.base, cat.tracks);
    try { await fs.unlink(path.join(OUT_DIR, `${id}.m4a`)); } catch (e) {}
    return console.log(`dug up ${id}`);
  }

  let jobs = [];
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "garden-"));
  if (has("demo")) {
    for (const d of DEMO) jobs.push({ id: d.id, title: d.title, src: await makeDemo(d, tmp), demo: true });
  } else {
    if (!files.length) {
      console.log("nothing to plant. pass some audio files, or --demo for placeholders.");
      return;
    }
    jobs = files.map((f) => {
      const id = slug(f);
      return { id, title: titles[id] || titleOf(f), src: path.resolve(f) };
    });
  }

  for (const j of jobs) {
    const dest = path.join(OUT_DIR, `${j.id}.m4a`);
    process.stdout.write(`  ${j.id} … `);
    // the demo pieces go through loudnorm too. They're synthesized 20-30 dB
    // down, and a garden where the placeholder plants are all knee-high tells
    // you nothing about how a real one will look.
    await encode(j.src, dest);

    const dur = await probeDur(dest);
    const pk = await peaks(dest);
    const size = (await fs.stat(dest)).size;

    const entry = {
      id: j.id, title: j.title, file: `${j.id}.m4a`, dur, peaks: pk,
      ...(flag("bed") && flag("bed") !== true ? { bed: flag("bed") } : {}),
    };
    const at = cat.tracks.findIndex((t) => t.id === j.id);
    if (at >= 0) cat.tracks[at] = { ...cat.tracks[at], ...entry };
    else cat.tracks.push(entry);

    const m = Math.floor(dur / 60), s = Math.round(dur % 60);
    console.log(`${m}:${String(s).padStart(2, "0")}  ${(size / 1048576).toFixed(1)} MB`);
  }

  for (const t of cat.tracks) if (titles[t.id]) t.title = titles[t.id];
  await writeCatalog(cat.base, cat.tracks);
  await fs.rm(tmp, { recursive: true, force: true });

  const total = cat.tracks.reduce((a, t) => a + t.dur, 0);
  console.log(`\n${cat.tracks.length} planted · ${Math.round(total / 60)} min of garden`);
  console.log(`audio → ${path.relative(ROOT, OUT_DIR)}/ (gitignored — push it to R2)`);
  console.log(`catalog → ${path.relative(ROOT, CATALOG)} (commit this)`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
