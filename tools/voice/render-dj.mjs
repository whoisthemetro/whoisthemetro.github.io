#!/usr/bin/env node
/* ============================================================
   THE METRO — render the bathroom radio DJ

   Same idea as render.mjs (Trinity), deliberately a SEPARATE script rather
   than a second mode of that one: he's a different voice with different
   settings going to a different folder, and Trinity's pipeline is not a
   thing to put at risk for a gag on a ceiling speaker.

     node tools/voice/render-dj.mjs      (--dry to list, --prune to tidy)

   The key finds itself, same as render.mjs — ~/.config/metro/voice.env,
   outside the repo and outside any one session. Options (env): DJ_VOICE_ID,
   DJ_MODEL. Flags: --force, --dry, --prune.
   ============================================================ */

import { writeFile, readFile, mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { djClips } from "../../assets/js/djlines.js";
import { SECRETS, requireKey, speak, shrink } from "./eleven.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../../assets/audio/dj");

// the key, the POST and the mp3 shrink are shared — see eleven.mjs
// Adam — the closest stock voice to a station ident. Swap via DJ_VOICE_ID.
const VOICE = process.env.DJ_VOICE_ID || "pNInz6obpgDQGcFmaJgB";
const MODEL = process.env.DJ_MODEL || "eleven_multilingual_v2";
const FORCE = process.argv.includes("--force");
const DRY = process.argv.includes("--dry");

const KEY = requireKey(DRY);

/* The opposite of Trinity's settings. She's explaining a room and gets style
   0 so she doesn't put a performance on. He IS a performance: style up,
   stability down, so he lands the exclamation marks. */
const SETTINGS = { stability: 0.30, similarity_boost: 0.80, style: 0.65, use_speaker_boost: true };
const render = (text) => speak(text, { key: KEY, voice: VOICE, model: MODEL, settings: SETTINGS });

/* Everything he says goes through a 3.6 kHz lowpass at the far end anyway,
   so shipping a 44.1 kHz stereo mp3 would be paying to send detail the room
   throws away. 22 kHz mono at 40k is already past what survives. */
const shrinkDj = (file) => shrink(file, { rate: 22050, bitrate: "40k" });

const clips = djClips();
await mkdir(OUT, { recursive: true });

const known = {};
let made = 0, kept = 0;
for (const { id, text } of clips) {
  known[id] = text;
  const file = path.join(OUT, `${id}.mp3`);
  if (existsSync(file) && !FORCE) { kept++; continue; }
  if (DRY) { console.log(`would render ${id}  ${text.slice(0, 62)}…`); made++; continue; }
  process.stdout.write(`${id}  ${text.slice(0, 54)}… `);
  const buf = await render(text);
  await writeFile(file, buf);
  const raw = buf.length;
  const small = await shrinkDj(file);
  made++;
  console.log(small ? `${(raw / 1024).toFixed(0)}kb → ${(small / 1024).toFixed(0)}kb` : `${(raw / 1024).toFixed(0)}kb`);
}

if (!DRY) {
  // the room reads this to know what exists; no manifest = he stays quiet
  await writeFile(path.join(OUT, "manifest.json"),
    JSON.stringify({ voice: VOICE, model: MODEL, clips: Object.keys(known) }, null, 0));
  const onDisk = (await readdir(OUT)).filter(f => f.endsWith(".mp3")).map(f => f.replace(/\.mp3$/, ""));
  const orphans = onDisk.filter(id => !known[id]);
  if (orphans.length) {
    console.log(`\n${orphans.length} orphaned clip(s) from edited lines:`);
    for (const o of orphans) console.log(`  assets/audio/dj/${o}.mp3`);
    if (process.argv.includes("--prune")) {
      for (const o of orphans) await unlink(path.join(OUT, `${o}.mp3`));
      console.log("pruned.");
    } else console.log("re-run with --prune to delete them.");
  }
}
console.log(`\n${made} rendered, ${kept} already there.`);
