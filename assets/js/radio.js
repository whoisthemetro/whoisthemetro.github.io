// radio.js — real radios you can scan through.
//
// Unlike everything else in the world, these aren't synthesized: they stream
// live broadcast over a bare <audio> element (no WebAudio routing — a plain
// element can't be tainted by the stream's redirect hops, and the broadcast is
// already mastered; volume is ridden by hand so main.js can fade it with
// distance and silence it when you leave the room). There are two of them —
// Desi's cabin runs Swedish radio, the bedroom runs Los Angeles — so the module
// is a FACTORY: createRadio() hands back an independent tuner with its own
// element, dial position and volume. "Scan through" is the whole point; each
// band is ordered low → high like a real FM dial.
//
// All stream URLs are https (the site is https — http streams are mixed-content
// blocked) and progressive mp3/aac (Chrome's <audio> can't play HLS .m3u8). The
// frequencies are real; everything was reachability-checked before shipping.

import { radioStatic } from "./ambience.js";

const SR = (id) => `https://www.sverigesradio.se/topsy/direkt/srapi/${id}.mp3`;

// THE DESI — Sveriges Radio, ordered like a dial. ids are real (api.sr.se).
export const SR_STATIONS = [
  { hz: "87.9",  name: "P1",            tag: "news & talk",            url: SR(132) },
  { hz: "89.6",  name: "P2",            tag: "classical · world",      url: SR(163) },
  { hz: "92.4",  name: "P3",            tag: "pop & new music",        url: SR(164) },
  { hz: "94.0",  name: "P3 Din Gata",   tag: "hip-hop",                url: SR(2576) },
  { hz: "98.2",  name: "P2 Musik",      tag: "all music, no talk",     url: SR(2562) },
  { hz: "100.2", name: "P4 Gotland",    tag: "the island outside",     url: SR(205) },
  { hz: "103.3", name: "P4 Stockholm",  tag: "the city",               url: SR(701) },
  { hz: "104.5", name: "SR Sápmi",      tag: "Sámi radio",             url: SR(224) },
  { hz: "106.1", name: "SR Finska",     tag: "in Finnish",             url: SR(226) },
  { hz: "107.9", name: "Radioapan",     tag: "the kids' channel 🐒",   url: SR(2755) },
];

// THE BEDROOM — Los Angeles. The college stations really do cluster at the
// bottom of the dial, so 88–89 is all student radio, same as the real band.
export const LA_STATIONS = [
  { hz: "88.1",  name: "KJazz",        tag: "jazz & blues · CSU Long Beach", url: "https://streaming.live365.com/a49833" },
  { hz: "88.5",  name: "SoCal Sound",  tag: "adult alternative · CSUN",      url: "https://stream.thesocalsound.org/1" },
  { hz: "88.7",  name: "KSPC",         tag: "freeform · Pomona College",     url: "https://kspc.radioca.st/stream" },
  { hz: "88.9",  name: "KXLU",         tag: "underground · Loyola Marymount", url: "https://kxlu.streamguys1.com/kxlu-hi" },
  { hz: "89.9",  name: "KCRW",         tag: "eclectic public radio",         url: "https://streams.kcrw.com/kcrw_mp3" },
  { hz: "91.5",  name: "KUSC",         tag: "classical · USC",               url: "https://playerservices.streamtheworld.com/api/livestream-redirect/KUSCAAC64.aac" },
  { hz: "92.3",  name: "Real 92.3",    tag: "hip-hop & R&B",                 url: "https://stream.revma.ihrhls.com/zc181" },
  { hz: "93.1",  name: "Jack FM",      tag: "we play anything",              url: "https://live.amperwave.net/direct/audacy-kcbsfmaac-imc" },
  { hz: "93.5",  name: "KDAY",         tag: "throwback hip-hop",             url: "https://playerservices.streamtheworld.com/api/livestream-redirect/KDAYFMAAC.aac" },
  { hz: "93.9",  name: "Cali 93.9",    tag: "Spanish hits",                  url: "https://playerservices.streamtheworld.com/api/livestream-redirect/KLLI_FMAAC.aac" },
  { hz: "94.7",  name: "The Wave",     tag: "smooth R&B",                    url: "https://live.amperwave.net/direct/audacy-ktwvfmaac-imc" },
  { hz: "95.5",  name: "KLOS",         tag: "classic rock",                  url: "https://playerservices.streamtheworld.com/api/livestream-redirect/KLOSFMAAC.aac" },
  { hz: "97.1",  name: "KNX",          tag: "all news",                      url: "https://live.amperwave.net/direct/audacy-knxfmaac-imc" },
  { hz: "98.7",  name: "ALT 98.7",     tag: "alternative",                   url: "https://stream.revma.ihrhls.com/zc201" },
  { hz: "102.7", name: "KIIS FM",      tag: "top 40 hits",                   url: "https://stream.revma.ihrhls.com/zc185" },
  { hz: "103.5", name: "KOST",         tag: "adult contemporary",            url: "https://stream.revma.ihrhls.com/zc193" },
  { hz: "106.7", name: "KROQ",         tag: "world famous · alt rock",       url: "https://live.amperwave.net/direct/audacy-kroqfmaac-imc" },
];

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Build one independent tuner. storeKey namespaces its persisted dial+volume;
// onStatus(info) fires on every change (button, dial, or a stream event) so the
// UI and the 3D prop stay in lockstep.
export function createRadio({ stations, storeKey, onStatus }) {
  let el = null;
  let wantOn = false;      // the user pressed power
  let idx = 0;             // which station the dial sits on
  let userVol = 0.82;      // the volume knob, 0..1
  let gain = 1;            // distance/room multiplier, set from main.js each frame
  let state = "off";       // off · tuning · live · error

  try {
    const sv = parseInt(localStorage.getItem(storeKey + ".idx"), 10);
    if (sv >= 0 && sv < stations.length) idx = sv;
    const vv = parseFloat(localStorage.getItem(storeKey + ".vol"));
    if (vv >= 0 && vv <= 1) userVol = vv;
  } catch (e) {}

  const info = () => ({ idx, total: stations.length, station: stations[idx], on: wantOn, state, vol: userVol });
  const status = () => { if (onStatus) onStatus(info()); };
  const applyVol = () => { if (el) el.volume = clamp01(userVol * gain); };

  // the element only pulls bytes when the user wants it AND it'd be audible —
  // walking off / leaving the room (gain→0) pauses the live feed so we aren't
  // streaming to nobody; coming back rejoins at the live edge.
  function sync() {
    if (!el) return;
    const shouldPlay = wantOn && gain > 0.0005;
    applyVol();
    if (shouldPlay && el.paused) el.play().catch(() => {});
    else if (!shouldPlay && !el.paused) el.pause();
  }

  function loadStation(i, withStatic) {
    idx = (i % stations.length + stations.length) % stations.length;
    try { localStorage.setItem(storeKey + ".idx", String(idx)); } catch (e) {}
    if (withStatic) radioStatic();
    if (el) { state = "tuning"; el.src = stations[idx].url; el.load(); sync(); }
    status();
  }

  return {
    stations,
    info,

    init() {
      if (el) { status(); return; }
      el = new Audio();
      el.preload = "none";            // nothing streams until power-on
      el.volume = userVol;
      el.addEventListener("playing", () => { state = "live"; status(); });
      el.addEventListener("waiting", () => { if (wantOn) { state = "tuning"; status(); } });
      el.addEventListener("error", () => { if (wantOn) { state = "error"; status(); } });
      el.addEventListener("stalled", () => { if (wantOn && el.paused) sync(); });
      status();
    },

    power(on) {
      wantOn = on;
      if (on) {
        if (el && !el.src) loadStation(idx, false);
        else { state = "tuning"; sync(); status(); }
      } else {
        if (el) el.pause();
        state = "off";
        status();
      }
    },
    toggle() { this.power(!wantOn); return wantOn; },

    tune(i) { loadStation(i, wantOn); },
    scan(dir) { loadStation(idx + (dir < 0 ? -1 : 1), wantOn); },

    volume(v) {
      userVol = clamp01(v);
      try { localStorage.setItem(storeKey + ".vol", String(userVol)); } catch (e) {}
      applyVol();
    },

    // main.js feeds this every frame from the camera↔radio distance (0 when
    // you're off in another room).
    setGain(g) {
      const ng = clamp01(g);
      if (Math.abs(ng - gain) < 0.001) return;
      gain = ng;
      sync();
    },

    // adopt the room's shared station + power (a presence "radio" act arrived).
    // no static, no re-broadcast — this is us following someone else. volume
    // stays whatever this listener set it to.
    applyRemote(on, i) {
      const ni = (i % stations.length + stations.length) % stations.length;
      const stationChanged = ni !== idx;
      idx = ni;
      try { localStorage.setItem(storeKey + ".idx", String(idx)); } catch (e) {}
      wantOn = !!on;
      if (el) {
        if (wantOn && (stationChanged || !el.src)) { el.src = stations[idx].url; el.load(); }
        state = wantOn ? "tuning" : "off";
        if (!wantOn) el.pause();
      }
      sync();
      status();
    },
  };
}
