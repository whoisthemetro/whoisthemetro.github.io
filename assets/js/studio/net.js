/* ============================================================
   THE STUDIO — the wire

   Its own Realtime channel, deliberately separate from the bedroom's.
   The main world broadcasts poses at 8Hz for everyone in it; none of
   that traffic has any business being parsed on the main thread of a
   browser that is trying to keep a sequencer in time.

   What crosses the wire is small and rare: pattern edits, transport
   changes, and poses. No audio, no notes, no clock ticks.

   Local mode (no backend) mirrors the identical protocol over a
   BroadcastChannel, so two tabs on one laptop behave exactly like two
   people in two cities. That's not a toy path — it's how you test this
   without deploying.
   ============================================================ */

import { store } from "../store.js";

const CHANNEL = "metro-studio";
const POSE_HZ = 10;

let me = null;
let chan = null;          // supabase realtime
let bc = null;            // local-mode mirror
let getPose = null;

const peers = new Map();  // uid -> { name, color, lastSeen }
const listeners = { patch: new Set(), snapshot: new Set(), want: new Set(), pose: new Set(), peers: new Set() };

let lastPose = "";
let localTimer = null;
const pending = new Map();   // id -> live device object, coalesced before send
let flushTimer = null;

function emit(kind, ...args) {
  listeners[kind].forEach(fn => { try { fn(...args); } catch (e) {} });
}

function send(event, payload) {
  const msg = { ...payload, uid: me.uid };
  if (chan) chan.send({ type: "broadcast", event, payload: msg });
  else bc?.postMessage({ event, payload: msg });
}

function handle(event, p) {
  if (!p || p.uid === me.uid) return;      // never talk to yourself
  if (event === "patch")    emit("patch", p.id, p.data);
  else if (event === "pose") emit("pose", p.uid, p);
  else if (event === "snap") { if (p.to === me.uid) emit("snapshot", p.snap); }
  else if (event === "hello") {
    // exactly one person should answer, and it should be decidable without
    // any negotiation: lowest uid in the room that isn't the one asking.
    // no host, no election round trip — everyone can work it out alone.
    const candidates = [me.uid, ...peers.keys()].filter(u => u !== p.uid).sort();
    if (candidates[0] === me.uid) emit("want", p.uid);
  }
}

/* ---------- transports ---------- */

function wireSupabase() {
  const ch = store.client.channel(CHANNEL, {
    config: { presence: { key: me.uid }, broadcast: { self: false } },
  });
  ch.on("presence", { event: "sync" }, () => {
    const st = ch.presenceState();
    peers.clear();
    for (const uid of Object.keys(st)) {
      if (uid === me.uid) continue;
      const m = st[uid][0] || {};
      peers.set(uid, { name: m.name || "", color: m.color || "#7ef5e0" });
    }
    emit("peers", peers);
  });
  for (const ev of ["patch", "pose", "snap", "hello"]) {
    ch.on("broadcast", { event: ev }, ({ payload }) => handle(ev, payload));
  }
  ch.subscribe((status) => {
    if (status !== "SUBSCRIBED") return;
    try { ch.track({ name: me.name || "", color: me.color }); } catch (e) {}
    send("hello", {});                       // "what's playing?"
  });
  return ch;
}

function wireLocal() {
  const b = new BroadcastChannel(CHANNEL);
  b.onmessage = (e) => {
    const m = e.data || {};
    if (m.event === "hb") {
      if (m.payload.uid === me.uid) return;
      const known = peers.has(m.payload.uid);
      peers.set(m.payload.uid, { ...m.payload, lastSeen: Date.now() });
      if (!known) emit("peers", peers);
      return;
    }
    if (m.event === "bye") { if (peers.delete(m.payload?.uid)) emit("peers", peers); return; }
    handle(m.event, m.payload);
  };
  const hb = () => b.postMessage({ event: "hb", payload: { uid: me.uid, name: me.name || "", color: me.color } });
  hb();
  clearInterval(localTimer);
  localTimer = setInterval(() => {
    hb();
    const cutoff = Date.now() - 5000;
    let changed = false;
    for (const [uid, p] of peers) if (p.lastSeen < cutoff) { peers.delete(uid); changed = true; }
    if (changed) emit("peers", peers);
  }, 2000);
  addEventListener("beforeunload", () => { try { b.postMessage({ event: "bye", payload: { uid: me.uid } }); } catch (e) {} });
  setTimeout(() => send("hello", {}), 120);   // let the heartbeats land first
  return b;
}

/* ---------- pose ---------- */

function posePump() {
  setInterval(() => {
    if (!getPose) return;
    const p = getPose();
    const key = `${p.x.toFixed(2)},${p.z.toFixed(2)},${p.yaw.toFixed(2)}`;
    if (key === lastPose) return;             // standing still costs nothing
    lastPose = key;
    send("pose", { x: p.x, y: p.y || 0, z: p.z, yaw: p.yaw });
  }, 1000 / POSE_HZ);
}

/* ---------- api ---------- */

export const net = {
  async join(identity, poseFn) {
    me = identity;
    getPose = poseFn;
    if (store.mode === "supabase" && store.client) chan = wireSupabase();
    else if ("BroadcastChannel" in window) bc = wireLocal();
    posePump();
  },
  // dragging a fader fires an edit per frame. we hold the newest state for
  // each device and flush on a short timer instead — the object is live, so
  // whatever we send is current, and a 60-frame drag costs three messages
  // rather than sixty.
  pushPatch(id, data) {
    if (!me) return;
    pending.set(id, data);
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      for (const [k, v] of pending) send("patch", { id: k, data: v });
      pending.clear();
    }, 55);
  },
  sendSnapshot(to, snap) { if (me) send("snap", { to, snap }); },
  peers: () => peers,
  count: () => peers.size + 1,
  online: () => (chan ? "live" : "local"),

  onPatch:    fn => listeners.patch.add(fn),
  onSnapshot: fn => listeners.snapshot.add(fn),
  onWant:     fn => listeners.want.add(fn),     // someone asked for the room state
  onPose:     fn => listeners.pose.add(fn),
  onPeers:    fn => listeners.peers.add(fn),
};
