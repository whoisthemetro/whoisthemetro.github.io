/* ============================================================
   THE METRO — venue screen-share (WebRTC, host → room)

   The host shares a tab/screen (getDisplayMedia) and we send that one
   MediaStream to everyone in the venue over WebRTC, peer-to-peer — no media
   server. Each viewer holds ONE connection to the host, so:
     • a walk-in is dialed the moment they arrive (host re-announces "live"),
       which is what makes someone already in the room update in real time;
     • a viewer leaving closes only THEIR connection — everyone else keeps
       watching (one person leaving never cuts the room off).

   Roles are fixed — the host always offers, viewers always answer — so there's
   no negotiation glare to handle. Signaling rides the presence channel
   (offer/answer/ice/hello/bye/live), which already works in supabase + local.
   ============================================================ */
import { presence } from "./presence.js";

// STUN finds your public address; TURN *relays* media when a direct peer path
// can't be made. two devices on the SAME wifi often still can't connect P2P:
// browsers hide local IPs behind mDNS .local candidates, and when those don't
// resolve the only fallback is both devices' shared public IP via NAT hairpin,
// which most home routers refuse — so the stream never arrives (classic "works
// on one machine, dead across two devices"). a TURN relay is the cure. the
// openrelay creds are a free best-effort default; for a real event drop a
// dedicated TURN in config.js as METRO_CONFIG.ICE_SERVERS (overrides all of this).
const DEFAULT_ICE = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:80?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];
function iceServers() {
  const cfg = (typeof window !== "undefined" && window.METRO_CONFIG && window.METRO_CONFIG.ICE_SERVERS);
  return (Array.isArray(cfg) && cfg.length) ? cfg : DEFAULT_ICE;
}

let myUid = null;
let mode = "off";                 // off | host | viewer
let inVenue = false;
let localStream = null;           // host: the captured tab/screen
let liveTimer = null;             // host: re-announce "live" so late arrivals connect
let hostUid = null;               // viewer: who we're watching
let lastLiveHost = null;          // viewer: last host seen announcing "live"
const pcs = new Map();            // uid -> RTCPeerConnection
let onRemoteStream = null;        // viewer cb(stream)
let onRemoteEnd = null;           // viewer cb()
let onHostEnded = null;           // host cb() when the browser's "stop sharing" fires
let onStatus = null;              // viewer cb(state) — connecting/connected/failed to the host

function newPc(uid) {
  const pc = new RTCPeerConnection({ iceServers: iceServers() });
  // signaling rides presence — which uses BroadcastChannel in local mode, and
  // BroadcastChannel's structured clone CANNOT clone live RTC* objects
  // (RTCSessionDescription / RTCIceCandidate throw "could not be cloned"). so we
  // only ever put PLAIN json on the wire. candidate.toJSON() gives a plain dict.
  pc.onicecandidate = (e) => { if (e.candidate) presence.sendSignal({ kind: "ice", to: uid, data: e.candidate.toJSON() }); };
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    // tell the viewer how the connection to the host is going (so they know it's
    // working / why it isn't). only the viewer's host pc reports.
    if (mode === "viewer" && uid === hostUid && onStatus) { try { onStatus(s); } catch (e) {} }
    // "disconnected" is transient (an ICE hiccup) and usually self-recovers — only
    // tear down on a terminal state, or we'd needlessly drop a live stream.
    if (["failed", "closed"].includes(s)) closePc(uid);
  };
  pcs.set(uid, pc);
  return pc;
}
function closePc(uid) {
  const pc = pcs.get(uid);
  if (!pc) return;
  pcs.delete(uid);
  try { pc.onicecandidate = pc.ontrack = pc.onconnectionstatechange = null; pc.close(); } catch (e) {}
  if (mode === "viewer" && uid === hostUid) { hostUid = null; if (onRemoteEnd) try { onRemoteEnd(); } catch (e) {} }
}

async function dialViewer(uid) {
  if (mode !== "host" || !localStream) return;
  if (pcs.has(uid)) closePc(uid);              // fresh connection if they reconnected
  const pc = newPc(uid);
  for (const t of localStream.getTracks()) pc.addTrack(t, localStream);
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    presence.sendSignal({ kind: "offer", to: uid, data: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
  } catch (e) { closePc(uid); }
}

async function acceptOffer(uid, sdp) {
  hostUid = uid;
  if (pcs.has(uid)) closePc(uid);
  const pc = newPc(uid);
  pc.ontrack = (e) => { if (onRemoteStream && e.streams[0]) onRemoteStream(e.streams[0]); };
  try {
    await pc.setRemoteDescription(sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    presence.sendSignal({ kind: "answer", to: uid, data: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
  } catch (e) { closePc(uid); }
}

async function handle(p) {
  if (p.to && p.to !== myUid) return;          // addressed to someone else
  try {
    if (p.kind === "live") {                   // a host is sharing (re-announced every 3s)
      if (mode === "host") return;
      lastLiveHost = p.from;
      // only dial in if we're not already connected to this host — otherwise the
      // 3s re-announce would rebuild every viewer's connection over and over. a
      // walk-in, a reloaded viewer, or a dropped connection all have no pc here,
      // so they still get (re)dialed; a steady viewer stays silent.
      if (inVenue && !pcs.has(p.from)) presence.sendSignal({ kind: "hello", to: p.from });
    } else if (p.kind === "off") {
      if (p.from === hostUid) closePc(p.from);
      if (p.from === lastLiveHost) lastLiveHost = null;
    } else if (p.kind === "hello") {
      if (mode === "host") dialViewer(p.from);
    } else if (p.kind === "offer") {
      acceptOffer(p.from, p.data);
    } else if (p.kind === "answer") {
      await pcs.get(p.from)?.setRemoteDescription(p.data);
    } else if (p.kind === "ice") {
      try { await pcs.get(p.from)?.addIceCandidate(p.data); } catch (e) {}
    } else if (p.kind === "bye") {
      closePc(p.from);                          // a viewer left — drop just their pc
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
  hostLive: () => mode === "host" || !!lastLiveHost,
  localStream: () => localStream,
  // smoke-test peek
  _state: () => ({ mode, inVenue, hostUid, lastLiveHost, pcs: [...pcs.entries()].map(([u, pc]) => ({ u, cs: pc.connectionState, ice: pc.iceConnectionState })) }),

  // HOST: start sharing a captured stream to the room
  startShare(captured) {
    if (!captured) return false;
    mode = "host";
    localStream = captured;
    // if the user hits the browser's "Stop sharing" pill, end cleanly
    const vt = captured.getVideoTracks()[0];
    if (vt) vt.addEventListener("ended", () => { this.stopShare(); if (onHostEnded) try { onHostEnded(); } catch (e) {} });
    presence.sendSignal({ kind: "live" });     // tell the room; viewers reply "hello" → we dial them
    if (liveTimer) clearInterval(liveTimer);
    liveTimer = setInterval(() => { if (mode === "host") presence.sendSignal({ kind: "live" }); }, 3000);
    return true;
  },
  stopShare() {
    if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
    if (mode === "host") presence.sendSignal({ kind: "off" });
    for (const uid of [...pcs.keys()]) closePc(uid);
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    mode = "off";
  },

  // VIEWER: in/out of the venue. on entry we say hello to any live host so we
  // get dialed immediately; on exit we close our own connection only.
  enterVenue() {
    inVenue = true;
    if (mode !== "host") { mode = "viewer"; if (lastLiveHost) presence.sendSignal({ kind: "hello", to: lastLiveHost }); }
  },
  leaveVenue() {
    inVenue = false;
    if (mode === "host") return;               // the host leaving is handled by stopShare elsewhere
    if (hostUid) presence.sendSignal({ kind: "bye", to: hostUid });
    for (const uid of [...pcs.keys()]) closePc(uid);
    hostUid = null;
    mode = "off";
  },
};
