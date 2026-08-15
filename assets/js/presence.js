/* ============================================================
   THE METRO — live presence
   Lets visitors see each other in the room in real time.

   supabase mode — Realtime channel: presence (who's here) +
                   broadcast (where they're standing), ~8Hz.
   local mode    — BroadcastChannel heartbeats, so two tabs on
                   one machine still see each other. Good for
                   feeling it out before the backend exists.
   ============================================================ */

import { store } from "./store.js";

const POSE_HZ = 8;
const peers = new Map();    // uid -> { name, color, lastSeen }
const peerListeners = new Set();
const poseListeners = new Set();
const noteListeners = new Set();
const gameListeners = new Set();
const actListeners = new Set();
const chatListeners = new Set();
const voiceListeners = new Set();
const signalListeners = new Set();   // webrtc offer/answer/ice for the venue screen-share

let me = null;
let getPose = null;
let chan = null;            // supabase channel
let bc = null;              // local channel
let lastSent = "";
let currentSpace = "world"; // which presence channel we're on (venue is separate)
let localTimer = null;      // local-mode heartbeat/expiry interval

// a PER-TAB id for webrtc signaling. the user's identity uid is shared across
// tabs (localStorage), so two tabs of the same person collide — and the screen-
// share self-filter (from !== me) would then drop every signal between them, so
// they'd never connect. this id is unique per tab/load, so each tab is its own
// webrtc peer. (only the screen-share uses it; presence identity stays the uid.)
const clientId = "c" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function emitPeers() {
  peerListeners.forEach(fn => { try { fn(peers); } catch (e) {} });
}
function emitPose(uid, pose) {
  poseListeners.forEach(fn => { try { fn(uid, pose); } catch (e) {} });
}

let lastSentAt = 0;
function sendPoseLoop() {
  setInterval(() => {
    if (!getPose) return;
    const p = getPose();
    const key = `${p.x.toFixed(2)},${(p.y || 0).toFixed(2)},${p.z.toFixed(2)},${p.yaw.toFixed(2)}`;
    // idle still saves bandwidth — but not FOREVER. ghosts only render a peer
    // once a live pose arrives (the phantom filter), so someone standing
    // still has to keep whispering "I'm here" or every late joiner walks
    // into what looks like an empty room. one pose per 2.5s of stillness.
    const now = Date.now();
    if (key === lastSent && now - lastSentAt < 2500) return;
    lastSent = key;
    lastSentAt = now;
    const msg = { uid: me.uid, x: p.x, y: p.y || 0, z: p.z, yaw: p.yaw };
    if (chan) chan.send({ type: "broadcast", event: "pose", payload: msg });
    else bc?.postMessage({ type: "pose", ...msg });
  }, 1000 / POSE_HZ);
}

// the venue rides its OWN realtime channel, fully separate from the main world,
// so a bedroom visitor's presence + 8Hz pose firehose is never even DELIVERED to
// people watching the DJ screen (it was the cross-room traffic, parsed on the
// main thread, that hitched the venue video). everything else shares one channel.
function channelName(space) { return space === "venue" ? "metro-venue" : "metro-presence"; }

function trackSelf(ch) {
  try { ch.track({ name: me.name, color: me.color, outfit: me.outfit || null }); } catch (e) {}
}

function wireSupabase(name) {
  const ch = store.client.channel(name, { config: { presence: { key: me.uid }, broadcast: { self: false } } });
  ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      const before = new Set(peers.keys());
      peers.clear();
      for (const uid of Object.keys(state)) {
        if (uid === me.uid) continue;
        const meta = state[uid][0] || {};
        peers.set(uid, { name: meta.name || "", color: meta.color || "#ffb347", outfit: meta.outfit || null });
      }
      // someone NEW walked in → they've heard nothing about where anyone
      // stands. break the idle dedupe so our next tick tells them at once.
      for (const uid of peers.keys()) if (!before.has(uid)) { lastSent = ""; break; }
      emitPeers();
    })
    .on("broadcast", { event: "pose" }, ({ payload }) => { if (payload.uid !== me.uid) emitPose(payload.uid, payload); })
    .on("broadcast", { event: "note" }, ({ payload }) => { if (payload.uid !== me.uid) noteListeners.forEach(fn => { try { fn(payload.uid, payload.i, payload.v); } catch (e) {} }); })
    .on("broadcast", { event: "act" }, ({ payload }) => { if (payload.uid !== me.uid) actListeners.forEach(fn => { try { fn(payload); } catch (e) {} }); })
    .on("broadcast", { event: "chat" }, ({ payload }) => { if (payload.uid !== me.uid) chatListeners.forEach(fn => { try { fn(payload); } catch (e) {} }); })
    .on("broadcast", { event: "arcade" }, ({ payload }) => { if (payload.uid !== me.uid) gameListeners.forEach(fn => { try { fn(payload); } catch (e) {} }); })
    .on("broadcast", { event: "voice" }, ({ payload }) => { if (payload.uid !== me.uid) voiceListeners.forEach(fn => { try { fn(payload); } catch (e) {} }); })
    .on("broadcast", { event: "signal" }, ({ payload }) => { if (payload.from !== clientId) signalListeners.forEach(fn => { try { fn(payload); } catch (e) {} }); })
    .subscribe((status) => { if (status === "SUBSCRIBED") trackSelf(ch); });
  return ch;
}

function wireLocal(name) {
  const channel = new BroadcastChannel(name);
  channel.onmessage = (ev) => {
    const m = ev.data || {};
    if (m.uid === me.uid) return;
    if (m.type === "hb") {
      const known = peers.has(m.uid);
      peers.set(m.uid, { name: m.name, color: m.color, outfit: m.outfit || null, lastSeen: Date.now() });
      if (!known) { lastSent = ""; emitPeers(); }   // a newcomer needs our pose now, not when we next move
    } else if (m.type === "pose") { emitPose(m.uid, m); }
    else if (m.type === "note") { noteListeners.forEach(fn => { try { fn(m.uid, m.i, m.v); } catch (e) {} }); }
    else if (m.type === "act") { actListeners.forEach(fn => { try { fn(m.payload); } catch (e) {} }); }
    else if (m.type === "chat") { chatListeners.forEach(fn => { try { fn(m.payload); } catch (e) {} }); }
    else if (m.type === "arcade") { gameListeners.forEach(fn => { try { fn(m.payload); } catch (e) {} }); }
    else if (m.type === "voice") { voiceListeners.forEach(fn => { try { fn(m.payload); } catch (e) {} }); }
    else if (m.type === "signal") { if (m.payload.from !== clientId) signalListeners.forEach(fn => { try { fn(m.payload); } catch (e) {} }); }
    else if (m.type === "bye") { if (peers.delete(m.uid)) emitPeers(); }
  };
  const hb = () => channel.postMessage({ type: "hb", uid: me.uid, name: me.name, color: me.color, outfit: me.outfit || null });
  hb();
  if (localTimer) clearInterval(localTimer);
  localTimer = setInterval(() => {
    hb();
    const cutoff = Date.now() - 5000;
    let changed = false;
    for (const [uid, p] of peers) { if (p.lastSeen && p.lastSeen < cutoff) { peers.delete(uid); changed = true; } }
    if (changed) emitPeers();
  }, 2000);
  return channel;
}

async function join(identity, poseFn, space) {
  me = identity;
  getPose = poseFn;
  currentSpace = space === "venue" ? "venue" : "world";

  if (store.mode === "supabase" && store.client) {
    chan = wireSupabase(channelName(currentSpace));
    // iOS suspends a backgrounded tab (its heartbeat stops, the server drops it);
    // re-announce on focus so a resumed device reappears at once. (one listener,
    // always re-tracks the CURRENT channel.)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && chan && me) trackSelf(chan);
    });
  } else if ("BroadcastChannel" in window) {
    bc = wireLocal(channelName(currentSpace));
    addEventListener("beforeunload", () => { try { bc && bc.postMessage({ type: "bye", uid: me.uid }); } catch (e) {} });
  }

  sendPoseLoop();
}

// move to another presence space (e.g. into / out of the venue). tears down the
// old channel and joins the new one; peers from the space you left clear out.
async function setSpace(space) {
  const next = space === "venue" ? "venue" : "world";
  if (!me || next === currentSpace) return;
  currentSpace = next;
  if (store.mode === "supabase" && store.client) {
    const old = chan;
    chan = wireSupabase(channelName(next));
    if (old) { try { old.untrack(); } catch (e) {} try { store.client.removeChannel(old); } catch (e) {} }
  } else if ("BroadcastChannel" in window) {
    if (bc) { try { bc.postMessage({ type: "bye", uid: me.uid }); bc.close(); } catch (e) {} }
    bc = wireLocal(channelName(next));
  }
  peers.clear(); emitPeers();         // the space you left is no longer yours
}

export const presence = {
  join,
  setSpace,
  space: () => currentSpace,
  count: () => peers.size + 1,
  onPeers: fn => { peerListeners.add(fn); return () => peerListeners.delete(fn); },
  onPose:  fn => { poseListeners.add(fn); return () => poseListeners.delete(fn); },
  onNote:  fn => { noteListeners.add(fn); return () => noteListeners.delete(fn); },
  // a key someone pressed — everyone in the room hears it, same voice
  sendNote(i, v = 0) {
    if (!me) return;
    const msg = { uid: me.uid, i, v };
    if (chan) chan.send({ type: "broadcast", event: "note", payload: msg });
    else bc?.postMessage({ type: "note", ...msg });
  },
  // shared physical actions: curtains, closet, petting the cat —
  // when someone touches the room, everyone sees it move
  onAct: fn => { actListeners.add(fn); return () => actListeners.delete(fn); },
  // room chat: live, ephemeral, for whoever is here right now
  onChat: fn => { chatListeners.add(fn); return () => chatListeners.delete(fn); },
  sendChat(text) {
    if (!me) return;
    const payload = { uid: me.uid, name: me.name || "", color: me.color, text: String(text).slice(0, 200) };
    if (chan) chan.send({ type: "broadcast", event: "chat", payload });
    else bc?.postMessage({ type: "chat", payload });
  },
  // re-announce yourself (e.g. after saving a new look) without rejoining
  updateMeta(patch) {
    if (!me) return;
    Object.assign(me, patch);
    if (chan) chan.track({ name: me.name, color: me.color, outfit: me.outfit || null });
    else bc?.postMessage({ type: "hb", uid: me.uid, name: me.name, color: me.color, outfit: me.outfit || null });
  },
  sendAct(payload) {
    if (!me) return;
    const msg = { ...payload, uid: me.uid };
    if (chan) chan.send({ type: "broadcast", event: "act", payload: msg });
    else bc?.postMessage({ type: "act", payload: msg });
  },
  // voice chunks — small base64 opus blobs, walkie-talkie cadence
  onVoice: fn => { voiceListeners.add(fn); return () => voiceListeners.delete(fn); },
  sendVoice(payload) {
    if (!me) return;
    const msg = { ...payload, uid: me.uid };
    if (chan) chan.send({ type: "broadcast", event: "voice", payload: msg });
    else bc?.postMessage({ type: "voice", payload: msg });
  },
  // webrtc signaling for the venue screen-share (offer/answer/ice/hello/bye/live)
  onSignal: fn => { signalListeners.add(fn); return () => signalListeners.delete(fn); },
  sendSignal(payload) {
    if (!me) return;
    const msg = { ...payload, from: clientId };   // per-tab, not the shared uid
    if (chan) chan.send({ type: "broadcast", event: "signal", payload: msg });
    else bc?.postMessage({ type: "signal", payload: msg });
  },
  // the per-tab webrtc id (stream.js uses it as its peer identity)
  clientId,
  // 2-player arcade traffic (sit / join / input / state / leave)
  onGame: fn => { gameListeners.add(fn); return () => gameListeners.delete(fn); },
  sendGame(payload) {
    if (!me) return;
    const msg = { ...payload, uid: me.uid };
    if (chan) chan.send({ type: "broadcast", event: "arcade", payload: msg });
    else bc?.postMessage({ type: "arcade", payload: msg });
  },
  uid: () => me?.uid,
};
