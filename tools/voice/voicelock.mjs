#!/usr/bin/env node
/* ============================================================
   THE METRO — the voice lock

     node tools/voice/voicelock.mjs      (exits non-zero if she can be
                                          made to speak in a stranger's voice)

   Does the browser synth EVER get to speak for Trinity?
   Stubs the browser things say.js touches and runs the failure modes a phone
   actually produces — a blocked element, a dead fetch, a line edited without
   re-rendering. Any speechSynthesis.speak() at all is a fail.

   No dependencies and no browser, so it runs in a second and belongs in the
   repo rather than in a scratch folder that dies with a chat. The other half
   of this lives in a real headless Chrome (see CHANGELOG 2026-08-19); this is
   the half worth keeping.
   ============================================================ */
const synthCalls = [];
globalThis.speechSynthesis = {
  getVoices: () => [{ name: "Samantha", lang: "en-US", localService: true }],
  speak: (u) => { synthCalls.push(u.text); setTimeout(() => u.onend && u.onend(), 5); },
  cancel: () => {}, addEventListener: () => {},
};
globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
globalThis.window = globalThis;
globalThis.performance = globalThis.performance || { now: () => Date.now() };

let audioCalls = 0;
globalThis.Audio = class { constructor(src) { this.src = src; audioCalls++; setTimeout(() => this.onerror && this.onerror(), 5); } play() { return Promise.reject(new Error("NotAllowedError")); } pause() {} };

let started = [];
const gains = [];
let resumes = 0;
const fakeCtx = {
  state: "running",
  resume: async () => { resumes++; fakeCtx.state = "running"; },
  createBufferSource: () => ({ connect() {}, start() { started.push(1); setTimeout(() => this.onended && this.onended(), 5); }, stop() {} }),
  createGain: () => { const g = { connect() {} }; Object.defineProperty(g, "gain", { value: { set value(v) { gains.push(v); } } }); return g; },
  createAnalyser: () => ({ fftSize: 512, connect() {}, getByteTimeDomainData() {} }),
  createMediaElementSource: () => ({ connect() {} }),
  decodeAudioData: (buf, ok) => ok({ duration: 1 }),
};

let FETCH_MODE = "ok";
const MANIFEST = { clips: ["aaaa1111", "bbbb2222", "dddd4444"] };
globalThis.fetch = async (url) => {
  if (url.endsWith("manifest.json")) return { ok: true, json: async () => MANIFEST };
  if (FETCH_MODE === "fail") return { ok: false, status: 503 };
  return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
};

const say = await import(new URL("../../assets/js/say.js", import.meta.url).href);
say.useAudioGraph(() => ({ ctx: fakeCtx, master: { connect() {} } }));

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, pass, note = "") => { results.push([pass, name, note]); };

// 1. the happy path: her recording plays, synth silent
await say.loadClips();
say.speak("hello there.", { clip: "aaaa1111" });
await wait(120);
check("clip plays through web audio", started.length === 1 && synthCalls.length === 0, `started=${started.length} synth=${synthCalls.length}`);

// 2. the mobile failure: every fetch for the clip fails (gesture gone, network blinked)
say.stopSpeaking(); started = []; synthCalls.length = 0; audioCalls = 0;
FETCH_MODE = "fail";
let ended = false;
const ms = say.speak("this take will not load. at all.", { clip: "bbbb2222", onEnd: () => { ended = true; } });
await wait(4000);
check("failed fetch never reaches the synth", synthCalls.length === 0, `synth=${synthCalls.length}`);
check("failed fetch tried the element too", audioCalls > 0, `audio=${audioCalls}`);
check("failed fetch still ends the line", ended === true, `after ${ms}ms budget`);

// 3. a line edited but not re-rendered
say.stopSpeaking(); synthCalls.length = 0;
FETCH_MODE = "ok";
say.speak("unrendered line.", { clip: "cccc3333" });
await wait(200);
check("unrendered clip mimes, does not synth", synthCalls.length === 0, `synth=${synthCalls.length}`);

// 4. iOS interrupted the context (a call, another app, the screen locking).
// this is NOT "suspended", and only checking for that is how she went mute
// for the rest of a visit after one interruption.
say.stopSpeaking(); started = []; synthCalls.length = 0; resumes = 0;
fakeCtx.state = "interrupted";
say.speak("after the interruption.", { clip: "aaaa1111" });
await wait(200);
check("an interrupted context is woken, not ignored", resumes > 0 && started.length === 1,
      `resumes=${resumes} started=${started.length}`);
check("and she is not mimed after it", say.wasMimed() === false);

// 5. a mimed line tells the room it needs the card
say.stopSpeaking(); FETCH_MODE = "fail";
say.speak("nobody will hear this.", { clip: "dddd4444" });   // uncached, so the dead fetch bites
await wait(1500);
check("a mimed line asks for the card", say.wasMimed() === true, JSON.stringify(say.voiceDiag()));
FETCH_MODE = "ok";

// 6. the headset asks for a quieter Trinity, and the gain actually gets it —
// she sits a few centimetres from your ears in a Quest, not across the room
say.stopSpeaking(); gains.length = 0;
say.speak("quieter in here.", { clip: "aaaa1111", volume: 0.78 });
await wait(200);
check("volume reaches the gain node", gains.length === 1 && gains[0] === 0.78, `gains=${JSON.stringify(gains)}`);

// 7. a caller with no clip at all still gets the synth (unchanged)
say.stopSpeaking(); synthCalls.length = 0;
say.speak("no clip for this one.");
await wait(60);
check("clipless caller still uses the synth", synthCalls.length > 0, `synth=${synthCalls.length}`);

say.stopSpeaking();
let bad = 0;
for (const [pass, name, note] of results) { if (!pass) bad++; console.log(`${pass ? "PASS" : "FAIL"}  ${name}  ${note}`); }
process.exit(bad ? 1 : 0);
