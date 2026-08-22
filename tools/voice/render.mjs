#!/usr/bin/env node
/* ============================================================
   THE METRO — render Trinity's voice

   Her script is FIXED, so there's no reason to synthesise it live. This
   renders every line once to an mp3, and the room plays files. The result:
   one voice for everybody instead of whatever the visitor's device happens
   to have installed, no key in the client, no per-visit cost, and nothing
   to go wrong at runtime.

     node tools/voice/render.mjs          (--dry to list, --prune to tidy)

   The key finds itself — see below. Options (env): EL_VOICE_ID, EL_MODEL,
   plus --force to re-render everything.

   Change-detection is the filename: a clip is named for a hash of its own
   spoken text (clipId in assets/js/lines.js), so editing one line orphans
   one file and mints one new name. Re-running only pays for what changed.
   ============================================================ */

import { writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { allSpoken, clipId } from "../../assets/js/lines.js";
import { SECRETS, requireKey, speak, shrink } from "./eleven.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../../assets/audio/trinity");

// the key, the POST and the mp3 shrink are shared — see eleven.mjs

// Rachel — a long-standing stock voice, warm and unfussy. Swap via
// EL_VOICE_ID once you've picked one from your own account.
/* Lily, a PREMADE ElevenLabs voice. She used to be Janet, which is a
   `professional` library voice, and on 2026-08-18 ElevenLabs began refusing
   those over the API on the free tier (402 paid_plan_required) — credits had
   nothing to do with it, the account had 9,000 sitting unused. Premade voices
   have no such restriction, so her whole script moved here and re-rendered.
   Keep this ID in the code rather than an env var: a hidden override is how a
   later session renders half her lines in a different person's voice. */
const VOICE = process.env.EL_VOICE_ID || "pFZP5JQG7iQjIQuC4Bku";
const MODEL = process.env.EL_MODEL || "eleven_multilingual_v2";
const FORCE = process.argv.includes("--force");
const DRY = process.argv.includes("--dry");

const KEY = requireKey(DRY);

// steady rather than theatrical: she's explaining a room, not acting.
// style 0 keeps her from putting a performance on the longer lines.
const SETTINGS = { stability: 0.45, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true };
const render = (text) => speak(text, { key: KEY, voice: VOICE, model: MODEL, settings: SETTINGS });

const lines = allSpoken();
// the same sentence appearing in two places should cost one file, not two
const uniq = [...new Set(lines.map(l => l.trim()))];
await mkdir(OUT, { recursive: true });

const manifest = {};
let made = 0, kept = 0, spent = 0;
for (const text of uniq) {
  const id = clipId(text);
  manifest[id] = text;
  const file = path.join(OUT, `${id}.mp3`);
  if (existsSync(file) && !FORCE) { kept++; continue; }
  if (DRY) { console.log(`would render ${id}  ${text.slice(0, 62)}…`); made++; spent += text.length; continue; }
  process.stdout.write(`${id}  ${text.slice(0, 54)}… `);
  const buf = await render(text);
  await writeFile(file, buf);
  const raw = buf.length;
  const small = await shrink(file);
  made++; spent += text.length;
  console.log(small ? `${(raw / 1024).toFixed(0)}kb → ${(small / 1024).toFixed(0)}kb` : `${(raw / 1024).toFixed(0)}kb`);
}

if (!DRY) {
  /* The room reads this to know what exists. Without it every line would
     have to discover its audio by 404, and a missing file would cost a
     round trip before she could fall back to the synth. */
  await writeFile(path.join(OUT, "manifest.json"), JSON.stringify({ voice: VOICE, model: MODEL, clips: Object.keys(manifest) }, null, 0));

  // a line that got edited leaves its old take behind — say so, don't guess
  const onDisk = (await readdir(OUT)).filter(f => f.endsWith(".mp3")).map(f => f.replace(/\.mp3$/, ""));
  const orphans = onDisk.filter(id => !manifest[id]);
  if (orphans.length) {
    console.log(`\n${orphans.length} orphaned clip(s) from edited lines:`);
    for (const o of orphans) console.log(`  assets/audio/trinity/${o}.mp3`);
    if (process.argv.includes("--prune")) {
      for (const o of orphans) await unlink(path.join(OUT, `${o}.mp3`));
      console.log("pruned.");
    } else console.log("re-run with --prune to delete them.");
  }
}

console.log(`\n${uniq.length} lines · ${made} rendered · ${kept} already there · ~${spent} characters this run`);
