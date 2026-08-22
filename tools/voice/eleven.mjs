/* ============================================================
   THE METRO — the ElevenLabs bits, in one place

   Three tools talk to ElevenLabs now — Trinity's script, the bathroom
   DJ, and the tour narration — and all three were carrying their own
   copy of the same forty lines: find the key, POST the text, shrink the
   mp3. Two copies is a coincidence; three is a decision, and the wrong
   one. The KEY lookup especially: that is the thing you least want
   three subtly different versions of.

   What is NOT here is the voice id or the voice settings. Those belong
   to whoever is speaking — Trinity is explaining a room and gets style
   0 so she doesn't put a performance on, the DJ IS a performance — and
   a shared default is how a later session renders half of somebody's
   lines as somebody else.
   ============================================================ */

import { readFile, writeFile, unlink } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

/* The key finds ITSELF. It used to be pasted into a session scratchpad,
   which is scoped to one chat and deleted with it — so the key vanished and
   no other chat knew one had ever existed. It lives at ~/.config/metro/
   voice.env now: OUTSIDE the repo (this one is public, so a key inside it is
   one `git add -A` away from being published) and outside any one session.

   To set or rotate it, in a terminal:
     mkdir -p ~/.config/metro && chmod 700 ~/.config/metro
     printf 'ELEVENLABS_API_KEY=sk_your_key_here\n' > ~/.config/metro/voice.env
     chmod 600 ~/.config/metro/voice.env
*/
export const SECRETS = path.join(os.homedir(), ".config", "metro", "voice.env");

export function keyFromFile() {
  try {
    for (const line of readFileSync(SECRETS, "utf8").split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?ELEVENLABS_API_KEY\s*=\s*(.+?)\s*$/.exec(line);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  } catch (e) {}
  return null;
}

export function apiKey() { return process.env.ELEVENLABS_API_KEY || keyFromFile(); }

export function requireKey(dry = false) {
  const key = apiKey();
  if (key || dry) return key;
  console.error(
    `no ElevenLabs key. looked in $ELEVENLABS_API_KEY and ${SECRETS}\n\n` +
    "it must be the KEY, not the key id — real ones start with sk_ and are\n" +
    "only shown when the key is created or rotated. to store it once, for good:\n\n" +
    "  mkdir -p ~/.config/metro && chmod 700 ~/.config/metro\n" +
    "  printf 'ELEVENLABS_API_KEY=sk_your_key_here\\n' > ~/.config/metro/voice.env\n" +
    "  chmod 600 ~/.config/metro/voice.env\n");
  process.exit(1);
}

// one line of speech → an mp3 buffer. voice + settings are the caller's.
export async function speak(text, { key, voice, model = "eleven_multilingual_v2", settings }) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: model, voice_settings: settings }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 240)}`);
  return Buffer.from(await res.arrayBuffer());
}

/* ElevenLabs hands back a 44.1 kHz stereo mp3, which is a music format for
   something that is one person talking. Re-encoding it lives in the tools
   rather than in a one-off command, or the next re-render quietly puts the
   full-fat file back. Skipped without complaint if ffmpeg isn't installed —
   the original is already a working mp3. */
export async function shrink(file, { rate = 24000, bitrate = "48k" } = {}) {
  try {
    const tmp = file + ".tmp.mp3";
    await new Promise((res, rej) => {
      const ff = spawn("ffmpeg", ["-loglevel", "error", "-y", "-i", file,
        "-ac", "1", "-ar", String(rate), "-b:a", bitrate, tmp]);
      ff.on("error", rej);
      ff.on("close", c => (c === 0 ? res() : rej(new Error("ffmpeg " + c))));
    });
    const buf = await readFile(tmp);
    await writeFile(file, buf);
    await unlink(tmp);
    return buf.length;
  } catch (e) { return 0; }
}

// how long an mp3 actually runs, in seconds. the tour needs this to hold a
// shot for exactly as long as the sentence over it, and guessing from the
// character count drifts by a second over a minute of narration.
export async function durationOf(file) {
  return new Promise((res) => {
    const ff = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration",
      "-of", "default=nw=1:nk=1", file]);
    let out = "";
    ff.stdout.on("data", d => (out += d));
    ff.on("error", () => res(0));
    ff.on("close", () => res(parseFloat(out.trim()) || 0));
  });
}
