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

  /* No readouts. They were kept in the first cut as proof the room is live,
     but at phone size they're small, they sit in the strip TikTok and Reels
     cover with their own chrome, and the current formatting looks like a
     screenshot of a game rather than a place. The flight strip is the one
     with real information on it, so the narration says what it says instead
     of the frame trying to. Recording only; the site is untouched. */
  // toasts too. the room narrates itself in the corner of the screen — "the
  // food bowl is still pretty full", "vacuuming, walk to clean the carpet" —
  // which is right when you're playing and is a caption fighting the voiceover
  // when you're watching. one of them landed in the middle of the vacuum gag.
  await page.addStyleTag({ content: `#hud, #toast { display: none !important; }` });

  /* Re-asserted at the top of EVERY beat, not once at the start. The room
     is a shared world: its blinds, its dimmer and its lava lamp are room
     flags that arrive from the database a moment after you enter and can be
     changed by anyone who happens to be standing in it. The first cut of
     this tour opened the blinds and then had them shut again by the loaded
     flag two seconds later, which put slats over the one shot the whole
     video is for. Setting it per beat costs nothing and cannot lose. */
  const setDressing = (beat) => page.evaluate((light, fov, pinTime) => {
    const D = window.METRO_DEBUG;
    // 21:40 in Los Angeles. pinned, so the sky, the window light, the beam
    // and the star projector all agree and all STAY — updateSky runs every
    // 60 seconds and would otherwise walk the sun back up mid-render.
    // NOT re-pinned on a beat that sweeps the clock itself, or the dressing
    // would drag the sun back to night on every frame of the sunset.
    if (pinTime) D.world.setWorldTime(new Date("2026-08-23T04:40:00Z"));
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
  }, beat && beat.light != null ? beat.light : 0.26, (beat && beat.fov) || 92,
     !(beat && beat.timeSweep));
  await setDressing(null);
  await new Promise(r => setTimeout(r, 1200));   // the blinds take a second to gather

  let n = 0;
  const t0 = Date.now();
  for (const b of beats) {
    await setDressing(b);
    const frames = Math.max(1, Math.round((b.dur + (b.hold || 0)) * FPS));
    // she moves at the START of a beat, so she's flying to the next thing
    // while the camera is still arriving — that's what makes her lead it
    await page.evaluate((beat, ms) => {
      const D = window.METRO_DEBUG;
      if (beat.trinity) D.guide.relocate(beat.trinity[0], beat.trinity[1]);
      D.guide.speak(beat.say, ms);      // mouth and glow for exactly the line
      if (beat.open === "synth") { D.synth.open(true); D.synth.state().arp = true; }
      // the wall opens on whichever month the beat wants — June has 53 notes
      // on it and this month has five, and a bare wall is a bad advert
      if (beat.month) D.wall.set(beat.month);
      // the vacuum is what makes the cat bolt, and it only frightens her
      // within 2.3 m — so the beat before this one has to be the close orbit
      /* Block the cat like an actor. Orbiting her wherever she happened to
         wander put the camera inside a wall twice — she is a small animal
         with her own plans and a 1.35 m orbit around her is only clear if
         she's standing somewhere clear. Setting her mark is what a shoot
         does; she goes back to her own business the moment it's over. */
      if (beat.catAt) { D.cat.pos.x = beat.catAt[0]; D.cat.pos.z = beat.catAt[1]; D.cat.target = null; }
      if (beat.vacuum) D.vacuum(true);
      if (beat.vacuumOff) D.vacuum(false);
      /* Somebody else in the room. The multiplayer beat claiming other people
         turn up, over an empty room, is the one shot that would read as a
         lie. ghosts.syncPeers builds a real peer figure with its real name
         label — the same code path a live visitor goes through. */
      if (beat.peer) {
        /* The outfit MATTERS: ghosts.js falls back to a glow blob when a peer
           has none, and at a metre and a half that is a featureless pale egg
           rather than a person. Borrowing the local figure's spec builds a
           real avatar through the real builder. */
        const peers = new Map([[beat.peer.uid, { uid: beat.peer.uid, name: beat.peer.name,
          color: beat.peer.color || "#7ec8ff",
          outfit: beat.peer.outfit || D.vrui.outfit() || null }]]);
        D.ghosts.syncPeers(peers);
        D.ghosts.setPose(beat.peer.uid, { x: beat.peer.x, z: beat.peer.z, yaw: beat.peer.yaw || 0 });
      }
      if (beat.pc) D.vrui.pc();
    }, b, b.dur * 1000);
    // the in-world window places itself relative to where you're standing,
    // so the camera has to be there BEFORE it opens
    if (b.pc) await new Promise(r => setTimeout(r, 400));

    for (let i = 0; i < frames; i++) {
      await page.evaluate(async (beat, kk, k2) => {
        const k = kk;
        const D = window.METRO_DEBUG, c = D.controls;
        // a beat either dollies from A to B or orbits a moving subject —
        // the orbit ones carry no from/to at all
        if (beat.cam.from) {
          const [fx, fz] = beat.cam.from, [tx2, tz2] = beat.cam.to;
          c.pos.x = fx + (tx2 - fx) * k;
          c.pos.z = fz + (tz2 - fz) * k;
        }
        /* A day rolling into night, inside one shot. setWorldTime repaints
           the sky, so it runs every third frame rather than every one — at
           30fps that's still ten sky updates a second, which is smoother
           than any sunset, and a third of the cost. */
        if (beat.timeSweep && k2 % 3 === 0) {
          const a = Date.parse(beat.timeSweep[0]), b2 = Date.parse(beat.timeSweep[1]);
          D.world.setWorldTime(new Date(a + (b2 - a) * k));
        }
        // walking the wall back through its months while she talks about it
        if (beat.monthSweep) {
          const i2 = Math.min(beat.monthSweep.length - 1, Math.floor(k * beat.monthSweep.length));
          D.wall.set(beat.monthSweep[i2]);
        }
        // aim at the thing, not at an angle somebody solved by hand.
        // `atTo` pans the aim across the shot, so one move can start on a
        // person and end on a doorway without cutting.
        let target = beat.cam.at;
        if (beat.cam.atTo && Array.isArray(target)) {
          const t2 = beat.cam.atTo;
          /* The aim can WAIT before it travels. Panning straight off the
             first subject means nobody sees it — the peer in the last beat
             was gone before the sentence naming her had finished. */
          const h = beat.cam.atHold || 0;
          const k = kk <= h ? 0 : (kk - h) / (1 - h);
          target = [target[0] + (t2[0] - target[0]) * k,
                    target[1] + (t2[1] - target[1]) * k,
                    target[2] + (t2[2] - target[2]) * k];
        }
        // the in-world METRO OS window hangs where you were standing when it
        // opened, so the shot has to ask it where that was
        if (beat.cam.at === "pcwin") {
          const m = D.vrui.ui.mesh();
          const v = new D.THREE.Vector3();
          if (m) { m.getWorldPosition(v); target = [v.x, v.y, v.z]; }
        }
        // a fixed camera PANNING to follow something that moves — which is
        // what you'd do with a real camera and a cat running away from a
        // vacuum cleaner
        if (beat.cam.track === "cat") target = [D.cat.pos.x, 0.34, D.cat.pos.z];
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
      }, b, ease(frames === 1 ? 1 : i / (frames - 1)), i);
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
