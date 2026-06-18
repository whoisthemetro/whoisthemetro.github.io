/* ============================================================
   THE METRO — venue screen-share via Cloudflare Realtime SFU

   The host PUBLISHES its tab/screen to Cloudflare's SFU exactly ONCE; the SFU
   fans it out to every viewer from Cloudflare's edge. So the host's upload stays
   flat no matter how many people watch — the opposite of the old P2P mesh, where
   the host uploaded + encoded a separate copy per viewer (which choked at 2-3
   people and is why the iPad kept cutting out).

   Signalling is just Cloudflare's HTTPS session/track API, brokered by the `sfu`
   edge function (the App Secret stays server-side). The presence channel only
   carries a tiny "here's my SFU session + track names" announcement so viewers
   know what to subscribe to. Playback is unchanged: each side still yields a
   MediaStream that feeds screen.setMediaStream().
   ============================================================ */
import { presence } from "./presence.js";
import { store } from "./store.js";

// the SFU connects you straight to Cloudflare's edge (public), so its own STUN
// is all the ICE we need here.
const PC = { iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] };

let myUid = null;
let mode = "off";                 // off | host | viewer
let inVenue = false;
let localStream = null;           // host: the captured tab/screen
let liveTimer = null;             // host: re-announce so walk-ins subscribe

let pcPub = null;                 // host: the single uplink to the SFU
let hostSession = null;           // host: our SFU session id
let pubTracks = {};               // host: { video: trackName, audio: trackName }

let pcSub = null;                 // viewer: our downlink from the SFU
let subSession = null;            // viewer: our SFU session id
let watchingSession = null;       // viewer: which host SFU session we're pulling
let lastLive = null;              // viewer: last announced live host { session, video, audio }
let subbing = false;             // viewer: a subscribe is in flight

let onRemoteStream = null, onRemoteEnd = null, onHostEnded = null, onStatus = null;

function announceLive() {
  if (mode !== "host" || !hostSession) return;
  presence.sendSignal({ kind: "sfu-live", session: hostSession, video: pubTracks.video || null, audio: pubTracks.audio || null });
}

async function publish(captured) {
  // 1. a session, 2. push our tracks send-only, 3. swap offer/answer
  const s = await store.sfu("sessions/new");
  if (s.status >= 300 || !s.data.sessionId) throw new Error("sfu session failed");
  hostSession = s.data.sessionId;
  pcPub = new RTCPeerConnection(PC);
  pcPub.oniceconnectionstatechange = () => {
    if (["failed", "closed"].includes(pcPub.iceConnectionState) && mode === "host") { /* leave self-heal to re-share */ }
  };
  const infos = [];
  for (const track of captured.getTracks()) {
    const tr = pcPub.addTransceiver(track, { direction: "sendonly" });
    infos.push({ track, tr });
  }
  await pcPub.setLocalDescription(await pcPub.createOffer());
  capUplink(pcPub);                 // one upload, but keep it sane
  const tracks = infos.map(i => ({ location: "local", mid: i.tr.mid, trackName: i.track.id }));
  const r = await store.sfu(`sessions/${hostSession}/tracks/new`, {
    sessionDescription: { type: "offer", sdp: pcPub.localDescription.sdp }, tracks,
  });
  if (r.status >= 300 || !r.data.sessionDescription) throw new Error("sfu publish failed");
  await pcPub.setRemoteDescription(r.data.sessionDescription);
  pubTracks = {};
  for (const i of infos) pubTracks[i.track.kind] = i.track.id;
}

function capUplink(pc) {
  for (const sender of pc.getSenders()) {
    if (!sender.track || sender.track.kind !== "video") continue;
    try {
      const p = sender.getParameters();
      if (!p.encodings || !p.encodings.length) p.encodings = [{}];
      p.encodings[0].maxBitrate = 2_500_000;     // a single upload to the edge — plenty
      p.encodings[0].maxFramerate = 30;
      sender.setParameters(p).catch(() => {});
    } catch (e) {}
  }
}

async function subscribe(live) {
  if (subbing) return;
  if (subSession && watchingSession === live.session) return;   // already on this stream
  subbing = true;
  try {
    teardownSub();                  // drop any previous subscription first
    if (onStatus) try { onStatus("connecting"); } catch (e) {}
    const s = await store.sfu("sessions/new");
    if (s.status >= 300 || !s.data.sessionId) throw new Error("sfu session failed");
    subSession = s.data.sessionId;
    watchingSession = live.session;
    const stream = new MediaStream();
    pcSub = new RTCPeerConnection(PC);
    pcSub.ontrack = (e) => { stream.addTrack(e.track); if (onRemoteStream) try { onRemoteStream(stream); } catch (x) {} };
    pcSub.onconnectionstatechange = () => {
      const st = pcSub && pcSub.connectionState;
      if (onStatus && (st === "connected" || st === "failed")) { try { onStatus(st); } catch (e) {} }
      if (["failed", "closed"].includes(st)) teardownSub(true);     // allow re-subscribe on next announce
    };
    const tracks = [];
    if (live.video) tracks.push({ location: "remote", sessionId: live.session, trackName: live.video });
    if (live.audio) tracks.push({ location: "remote", sessionId: live.session, trackName: live.audio });
    const r = await store.sfu(`sessions/${subSession}/tracks/new`, { tracks });
    if (r.status >= 300 || !r.data.sessionDescription) throw new Error("sfu pull failed");
    await pcSub.setRemoteDescription(r.data.sessionDescription);   // an offer from the SFU
    await pcSub.setLocalDescription(await pcSub.createAnswer());
    if (r.data.requiresImmediateRenegotiation) {
      await store.sfu(`sessions/${subSession}/renegotiate`, { sessionDescription: { type: "answer", sdp: pcSub.localDescription.sdp } }, "PUT");
    }
  } catch (e) {
    teardownSub(true);
    if (onStatus) try { onStatus("failed"); } catch (x) {}
  } finally { subbing = false; }
}

function teardownSub(notify) {
  watchingSession = null; subSession = null;
  if (pcSub) { try { pcSub.ontrack = pcSub.onconnectionstatechange = null; pcSub.close(); } catch (e) {} pcSub = null; }
  if (notify && onRemoteEnd) try { onRemoteEnd(); } catch (e) {}
}

async function handle(p) {
  try {
    if (p.kind === "sfu-live") {
      if (mode === "host") return;
      lastLive = { session: p.session, video: p.video, audio: p.audio };
      if (inVenue) subscribe(lastLive);      // dedups on session id
    } else if (p.kind === "sfu-off") {
      if (watchingSession === p.session) teardownSub(true);
      if (lastLive && lastLive.session === p.session) lastLive = null;
    }
  } catch (e) {}
}

export const stream = {
  init(uid) { myUid = uid; presence.onSignal(handle); },
  onRemoteStream(fn) { onRemoteStream = fn; },
  onRemoteEnd(fn) { onRemoteEnd = fn; },
  onHostEnded(fn) { onHostEnded = fn; },
  onStatus(fn) { onStatus = fn; },
  isHosting: () => mode === "host",
  hostLive: () => mode === "host" || !!lastLive,
  localStream: () => localStream,
  // smoke-test peek
  _state: () => ({ mode, inVenue, hostSession, watchingSession, hasPub: !!pcPub, hasSub: !!pcSub,
    pub: pcPub ? pcPub.connectionState : null, sub: pcSub ? pcSub.connectionState : null, lastLive }),

  // HOST: publish a captured stream to the SFU
  async startShare(captured) {
    if (!captured) return false;
    mode = "host";
    localStream = captured;
    const vt = captured.getVideoTracks()[0];
    if (vt) vt.addEventListener("ended", () => { this.stopShare(); if (onHostEnded) try { onHostEnded(); } catch (e) {} });
    try {
      await publish(captured);
    } catch (e) {
      mode = "off"; localStream = null;
      return false;
    }
    announceLive();                          // tell the room what to subscribe to
    if (liveTimer) clearInterval(liveTimer);
    liveTimer = setInterval(announceLive, 3000);
    return true;
  },
  stopShare() {
    if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
    if (mode === "host" && hostSession) presence.sendSignal({ kind: "sfu-off", session: hostSession });
    if (pcPub) { try { pcPub.close(); } catch (e) {} pcPub = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    hostSession = null; pubTracks = {}; mode = "off";
  },

  // VIEWER: in/out of the venue. on entry, subscribe to any live host.
  enterVenue() {
    inVenue = true;
    if (mode !== "host" && lastLive) subscribe(lastLive);
  },
  leaveVenue() {
    inVenue = false;
    if (mode === "host") return;
    teardownSub();
  },
};
