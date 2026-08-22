#!/usr/bin/env node
/* ============================================================
   THE METRO — render the tour to an mp4

     node tools/tour/record.mjs            (--voice-only, --no-voice, --fast)

   Renders Trinity's narration, drives the room past a camera one frame
   at a time, and hands back a portrait mp4 you can put straight on a
   feed.

   WHY FRAME BY FRAME AND NOT A SCREEN RECORDING

   Chrome will screencast the page, but it delivers about 25 frames a
   second whatever the room is actually rendering at, and the interval
   wobbles. Stepping the camera and taking a still each time decouples
   render time from playback time: the motion is exactly as smooth as
   the frame rate you asked for, every frame is the one you meant, and
   the audio lines up by construction because frame N is always at
   N/FPS seconds. It costs about 200ms a frame, so a minute of video is
   six minutes of rendering, which for something you make once is
   nothing.

   WHY THE VOICE IS NEVER CAPTURED FROM THE PAGE

   It doesn't need to be. Her lines are rendered to mp3 up front, so the
   audio track is assembled from the files and muxed on at the end:
   clean speech, no room tone, and no fighting a headless browser for
   its audio device. The room still gets told how long each line is, so
   her mouth and her glow run for exactly as long as the sentence.

   WHAT YOU HAVE TO KNOW ABOUT HEADLESS GL

   The KuKo rug cannot render here — this backend has no linear
   filtering for half-float textures, so it comes out black (it's fine
   on real hardware; see CLAUDE.md). The tour keeps it out of frame. If
   you ever add a beat that looks at the floor by the bed, render with
   HEADFUL=1 and a real GPU instead.
   ============================================================ */

import { mkdir, writeFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { requireKey, speak, shrink, durationOf } from "../voice/eleven.mjs";
import { TOUR, tourLines } from "./script.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AUDIO = path.join(HERE, "audio");
const FRAMES = path.join(HERE, "frames");
const OUT = path.join(HERE, "out");

const CHROME = process.env.CHROME
  || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SITE = process.env.TOUR_SITE || "http://localhost:8123/";
const W = 1080, H = 1920;
const FPS = Number(process.env.TOUR_FPS || 30);
const FAST = process.argv.includes("--fast");     // quarter size, for checking a cut

// Trinity's voice, exactly as the room renders it — same id, same model,
// same settings. A tour in a different voice is a different person.
const VOICE = "pFZP5JQG7iQjIQuC4Bku";
const MODEL = "eleven_multilingual_v2";
const SETTINGS = { stability: 0.45, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true };

// a clip is named for a hash of its own text, so editing one line orphans
// one file and mints one new name — same trick as tools/voice/render.mjs
const clipId = (t) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
};

const sh = (cmd, args) => new Promise((res, rej) => {
  const c = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
  let err = "";
  c.stderr.on("data", d => (err += d));
  c.on("error", rej);
  c.on("close", code => (code === 0 ? res() : rej(new Error(`${cmd} ${code}: ${err.slice(-500)}`))));
});

/* ---------- 1. her voice ---------- */

async function renderVoice() {
  await mkdir(AUDIO, { recursive: true });
  const key = requireKey(false);
  const beats = [];
  for (const b of TOUR) {
    const id = clipId(b.say);
    const file = path.join(AUDIO, `${id}.mp3`);
    if (!existsSync(file)) {
      process.stdout.write(`  ${id}  ${b.say.slice(0, 52)}… `);
      const buf = await speak(b.say, { key, voice: VOICE, model: MODEL, settings: SETTINGS });
      await writeFile(file, buf);
      await shrink(file);
      console.log("ok");
    }
    const dur = await durationOf(file);
    beats.push({ ...b, file, dur });
  }
  return beats;
}

/* ---------- 2. the room, one frame at a time ---------- */

// ease in and out, so a move starts and stops like a camera on a head
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

async function capture(beats) {
  await rm(FRAMES, { recursive: true, force: true });
  await mkdir(FRAMES, { recursive: true });
  const scale = FAST ? 0.5 : 1;
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: process.env.HEADFUL ? false : "new",
    args: ["--no-sandbox", "--mute-audio", "--use-gl=angle", "--hide-scrollbars",
           `--window-size=${W * scale},${H * scale}`],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: Math.round(W * scale), height: Math.round(H * scale), deviceScaleFactor: 1 });
  await page.goto(SITE, { waitUntil: "networkidle2" });
  await page.evaluate(() => {
    const n = document.querySelector("#name-input") || document.querySelector("input");
    if (n) { n.value = "metro"; n.dispatchEvent(new Event("input", { bubbles: true })); }
    document.querySelector("#enter-btn")?.click();
  });
  await new Promise(r => setTimeout(r, 9000));

  /* The readouts stay — they're the cheapest proof the room is live, and
     a real callsign over LAX is worth more than a clean frame. But the top
     of a vertical video is where TikTok and Reels put their own chrome, so
     they move down out of it. Recording only; the site is untouched. */
  await page.addStyleTag({ content: `
    #crosshair, #aim-tip { display: none !important; }
    #cat-pill  { top: 190px !important; bottom: auto !important; }
    #online-pill { top: 190px !important; bottom: auto !important; }
    #flight-strip { top: 190px !important; }
  ` });

  /* Re-asserted at the top of EVERY beat, not once at the start. The room
     is a shared world: its blinds, its dimmer and its lava lamp are room
     flags that arrive from the database a moment after you enter and can be
     changed by anyone who happens to be standing in it. The first cut of
     this tour opened the blinds and then had them shut again by the loaded
     flag two seconds later, which put slats over the one shot the whole
     video is for. Setting it per beat costs nothing and cannot lose. */
  const setDressing = (beat) => page.evaluate((light, fov) => {
    const D = window.METRO_DEBUG;
    // 21:40 in Los Angeles. pinned, so the sky, the window light, the beam
    // and the star projector all agree and all STAY — updateSky runs every
    // 60 seconds and would otherwise walk the sun back up mid-render.
    D.world.setWorldTime(new Date("2026-08-23T04:40:00Z"));
    /* Practicals on, but LOW. The ceiling lamp runs to intensity 26 and the
       first pass had it at 0.72 of that, which washed the back wall and the
       ceiling to cream and put out the star projector entirely — the thing
       one of the beats is about. 0.26 is a lamp on in a dark room, which is
       what a bedroom at night looks like; beats that want less say so. */
    D.world.setRoomLight(light, 0xffd2a0);
    D.world.setBlinds(true);            // the city is the point
    D.world.setLava(true);
    /* Focal length per beat. The room solves a ~100 degree vertical FOV in
       portrait so that a PLAYER on a phone can see a whole wall, which is
       right for playing and far too wide for a detail shot — at 100 degrees
       a close-up of the keyboard has a third of the ceiling in it. Wide for
       the room, tighter for the things in it. */
    D.camera.fov = fov;
    D.camera.updateProjectionMatrix();
    /* No subtitle card beside her head. It's a FALLBACK for a device with
       no voice at all, and headless Chrome is exactly that — it has no
       speech synth, so she decided you couldn't hear her and printed the
       line. In a video with her real voice muxed on, that's a subtitle
       nobody asked for, and a 3D card in a portrait frame gets sliced in
       half by the edge. Recording only; the room is untouched. */
    D.guide.wantPanel = () => false;
  }, beat && beat.light != null ? beat.light : 0.26, (beat && beat.fov) || 92);
  await setDressing(null);
  await new Promise(r => setTimeout(r, 1200));   // the blinds take a second to gather

  let n = 0;
  const t0 = Date.now();
  for (const b of beats) {
    await setDressing(b);
    const frames = Math.max(1, Math.round((b.dur + (b.hold || 0)) * FPS));
    // she moves at the START of a beat, so she's flying to the next thing
    // while the camera is still arriving — that's what makes her lead it
    await page.evaluate((tx, tz, say, ms, open) => {
      const D = window.METRO_DEBUG;
      if (tx != null) D.guide.relocate(tx, tz);
      D.guide.speak(say, ms);           // mouth and glow for exactly the line
      if (open === "synth") { D.synth.open(true); D.synth.state().arp = true; }
    }, b.trinity ? b.trinity[0] : null, b.trinity ? b.trinity[1] : null, b.say, b.dur * 1000, b.open || null);

    for (let i = 0; i < frames; i++) {
      await page.evaluate(async (beat, k) => {
        const D = window.METRO_DEBUG, c = D.controls;
        // a beat either dollies from A to B or orbits a moving subject —
        // the orbit ones carry no from/to at all
        if (beat.cam.from) {
          const [fx, fz] = beat.cam.from, [tx2, tz2] = beat.cam.to;
          c.pos.x = fx + (tx2 - fx) * k;
          c.pos.z = fz + (tz2 - fz) * k;
        }
        // aim at the thing, not at an angle somebody solved by hand
        let target = beat.cam.at;
        /* The cat walks around, so a fixed camera path either loses her or
           frames the chair she isn't on. Orbit HER instead: the shot is
           defined relative to the subject, which is what you'd do with a
           real camera and a real cat. */
        if (beat.cam.follow === "cat") {
          target = [D.cat.pos.x, 0.34, D.cat.pos.z];
          const a = (beat.cam.orbit || 0) + k * (beat.cam.sweep || 0.5);
          const r = beat.cam.radius || 1.5;
          c.pos.x = target[0] + Math.sin(a) * r;
          c.pos.z = target[2] + Math.cos(a) * r;
        }
        if (target) {
          const eye = D.camera.position;
          c.yaw = Math.atan2(c.pos.x - target[0], c.pos.z - target[2]);
          c.pitch = Math.atan2(target[1] - eye.y, Math.hypot(target[0] - c.pos.x, target[2] - c.pos.z));
        }
        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => requestAnimationFrame(r));
      }, b, ease(frames === 1 ? 1 : i / (frames - 1)));
      await page.screenshot({ path: path.join(FRAMES, `f${String(n++).padStart(6, "0")}.png`),
                              type: "png", optimizeForSpeed: true });
    }
    console.log(`  ${b.id.padEnd(9)} ${b.dur.toFixed(2)}s + ${(b.hold || 0)}s  ${frames} frames`);
  }
  await browser.close();
  console.log(`  ${n} frames in ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min`);
  return n;
}

/* ---------- 3. put it together ---------- */

async function assemble(beats) {
  await mkdir(OUT, { recursive: true });
  // each beat's audio is padded to EXACTLY the length of its shot, so the
  // concatenation lines up with the frames without anyone tracking offsets
  const parts = [];
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    const wav = path.join(AUDIO, `beat${i}.wav`);
    await sh("ffmpeg", ["-y", "-loglevel", "error", "-i", b.file,
      "-af", `apad=whole_dur=${(b.dur + (b.hold || 0)).toFixed(3)}`,
      "-ar", "48000", "-ac", "2", "-t", (b.dur + (b.hold || 0)).toFixed(3), wav]);
    parts.push(wav);
  }
  const list = path.join(AUDIO, "concat.txt");
  await writeFile(list, parts.map(f => `file '${f}'`).join("\n"));
  const voice = path.join(AUDIO, "voice.wav");
  await sh("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", voice]);

  const mp4 = path.join(OUT, "metro-tour.mp4");
  await sh("ffmpeg", ["-y", "-loglevel", "error",
    "-framerate", String(FPS), "-i", path.join(FRAMES, "f%06d.png"),
    "-i", voice,
    "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", mp4]);
  return mp4;
}

/* ---------- go ---------- */

console.log("rendering her voice…");
const beats = await renderVoice();
const total = beats.reduce((a, b) => a + b.dur + (b.hold || 0), 0);
console.log(`  ${beats.length} lines, ${total.toFixed(1)}s of tour`);
if (process.argv.includes("--voice-only")) process.exit(0);

console.log("driving the room…");
await capture(beats);
console.log("assembling…");
const mp4 = await assemble(beats);
console.log("→ " + mp4);
