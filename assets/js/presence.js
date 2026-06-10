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

let me = null;
let getPose = null;
let chan = null;            // supabase channel
let bc = null;              // local channel
let lastSent = "";

function emitPeers() {
  peerListeners.forEach(fn => { try { fn(peers); } catch (e) {} });
}
function emitPose(uid, pose) {
  poseListeners.forEach(fn => { try { fn(uid, pose); } catch (e) {} });
}

function sendPoseLoop() {
  setInterval(() => {
    if (!getPose) return;
    const p = getPose();
    const key = `${p.x.toFixed(2)},${p.z.toFixed(2)},${p.yaw.toFixed(2)}`;
    if (key === lastSent) return;     // idle — save bandwidth
    lastSent = key;
    const msg = { uid: me.uid, x: p.x, z: p.z, yaw: p.yaw };
    if (chan) chan.send({ type: "broadcast", event: "pose", payload: msg });
    else bc?.postMessage({ type: "pose", ...msg });
  }, 1000 / POSE_HZ);
}

async function join(identity, poseFn) {
  me = identity;
  getPose = poseFn;

  if (store.mode === "supabase" && store.client) {
    chan = store.client.channel("metro-presence", {
      config: { presence: { key: me.uid }, broadcast: { self: false } },
    });
    chan
      .on("presence", { event: "sync" }, () => {
        const state = chan.presenceState();
        peers.clear();
        for (const uid of Object.keys(state)) {
          if (uid === me.uid) continue;
          const meta = state[uid][0] || {};
          peers.set(uid, { name: meta.name || "", color: meta.color || "#ffb347" });
        }
        emitPeers();
      })
      .on("broadcast", { event: "pose" }, ({ payload }) => {
        if (payload.uid !== me.uid) emitPose(payload.uid, payload);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await chan.track({ name: me.name, color: me.color });
        }
      });
  } else if ("BroadcastChannel" in window) {
    // local mode: heartbeat every 2s, expire after 5s
    bc = new BroadcastChannel("metro-presence");
    bc.onmessage = (ev) => {
      const m = ev.data || {};
      if (m.uid === me.uid) return;
      if (m.type === "hb") {
        const known = peers.has(m.uid);
        peers.set(m.uid, { name: m.name, color: m.color, lastSeen: Date.now() });
        if (!known) emitPeers();
      } else if (m.type === "pose") {
        emitPose(m.uid, m);
      } else if (m.type === "bye") {
        if (peers.delete(m.uid)) emitPeers();
      }
    };
    const hb = () => bc.postMessage({ type: "hb", uid: me.uid, name: me.name, color: me.color });
    hb();
    setInterval(() => {
      hb();
      const cutoff = Date.now() - 5000;
      let changed = false;
      for (const [uid, p] of peers) {
        if (p.lastSeen && p.lastSeen < cutoff) { peers.delete(uid); changed = true; }
      }
      if (changed) emitPeers();
    }, 2000);
    addEventListener("beforeunload", () => bc.postMessage({ type: "bye", uid: me.uid }));
  }

  sendPoseLoop();
}

export const presence = {
  join,
  count: () => peers.size + 1,
  onPeers: fn => { peerListeners.add(fn); return () => peerListeners.delete(fn); },
  onPose:  fn => { poseListeners.add(fn); return () => poseListeners.delete(fn); },
};
