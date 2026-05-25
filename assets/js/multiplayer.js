/* ============================================================
   METRO — MULTIPLAYER (PeerJS WebRTC DataChannel)
   - One person creates a room → gets a 4-char code
   - Other person joins with that code
   - Sends: instrument trigger events + pose (position/yaw) at 10Hz
   - No audio streaming — each side plays its own sounds locally
   ============================================================ */

window.METRO_MP = (function () {
  // exposes:
  //   init() — loads PeerJS lazily
  //   host() → Promise<code>  starts a session and returns the join code
  //   join(code) → Promise<void>  joins an existing session
  //   leave() — disconnect
  //   sendDrum(name, vel)
  //   sendNote(midi, dur, vel)
  //   sendPose({x, z, yaw})
  //   onConnected(fn), onDisconnected(fn), onRemoteState(fn)
  //   isConnected()
  //   remotePose() — last known partner pose

  const PEERJS_SRC = "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js";
  let peer = null;
  let conn = null;
  let isHost = false;
  let myCode = null;
  let _remotePose = { x: 0, z: 0, yaw: 0, valid: false };
  const listeners = {
    connected: new Set(),
    disconnected: new Set(),
    remoteDrum: new Set(),
    remoteNote: new Set(),
    remotePose: new Set(),
    status: new Set(),
  };

  function emit(kind, payload) { listeners[kind]?.forEach(fn => { try { fn(payload); } catch (e) {} }); }

  function loadPeerJS() {
    return new Promise((resolve, reject) => {
      if (window.Peer) return resolve();
      const s = document.createElement("script");
      s.src = PEERJS_SRC;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("PeerJS failed to load"));
      document.head.appendChild(s);
    });
  }

  function makeCode(len = 4) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // omit 0/O/1/I
    let s = "";
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  const ID_PREFIX = "metro-jam-";

  async function host() {
    await loadPeerJS();
    if (peer) peer.destroy();
    isHost = true;
    myCode = makeCode();
    peer = new window.Peer(ID_PREFIX + myCode, { debug: 0 });
    return new Promise((resolve, reject) => {
      peer.on("open", () => {
        emit("status", { kind: "hosted", code: myCode });
        resolve(myCode);
      });
      peer.on("error", (err) => {
        if (String(err).includes("is taken")) {
          // very rare collision; retry once
          myCode = makeCode();
          peer.destroy();
          peer = new window.Peer(ID_PREFIX + myCode, { debug: 0 });
          peer.on("open", () => { emit("status", { kind: "hosted", code: myCode }); resolve(myCode); });
          peer.on("connection", handleIncoming);
        } else {
          emit("status", { kind: "error", error: String(err) });
          reject(err);
        }
      });
      peer.on("connection", handleIncoming);
    });
  }

  function handleIncoming(c) {
    if (conn) { c.close(); return; } // only 1 partner at a time
    conn = c;
    wireConn();
  }

  async function join(code) {
    await loadPeerJS();
    if (peer) peer.destroy();
    isHost = false;
    const myEphemeral = makeCode() + makeCode(); // unique
    peer = new window.Peer(ID_PREFIX + "g-" + myEphemeral, { debug: 0 });
    return new Promise((resolve, reject) => {
      const code4 = code.toUpperCase().trim();
      peer.on("open", () => {
        conn = peer.connect(ID_PREFIX + code4, { reliable: false }); // unreliable = lowest latency
        // PeerJS connect doesn't actually take a reliable param for the data channel
        // but we set ordered:false through `serialization: "json"` default. For lowest
        // latency we rely on WebRTC DataChannel default unordered+reliable=false isn't possible.
        // We just use default ordered/reliable; events are tiny and rare, latency is fine.
        wireConn();
        conn.on("open", () => {
          emit("status", { kind: "joined", code: code4 });
          resolve();
        });
        conn.on("error", (e) => { reject(e); });
      });
      peer.on("error", (err) => {
        emit("status", { kind: "error", error: String(err) });
        reject(err);
      });
    });
  }

  function wireConn() {
    conn.on("open", () => {
      emit("connected", { code: myCode || "remote" });
    });
    conn.on("data", (msg) => {
      const A = window.METRO_AUDIO;
      if (!A || !msg || !msg.t) return;
      if (msg.t === "drum") {
        A.remote.drum(msg.n, msg.v || 100);
        emit("remoteDrum", { name: msg.n, velocity: msg.v || 100 });
      } else if (msg.t === "note") {
        A.remote.note(msg.m, msg.d || 0.5, msg.v || 100);
        emit("remoteNote", { midi: msg.m, velocity: msg.v || 100 });
      } else if (msg.t === "pose") {
        _remotePose = { x: msg.x, z: msg.z, yaw: msg.yaw, valid: true };
        emit("remotePose", _remotePose);
      }
    });
    conn.on("close", () => {
      _remotePose.valid = false;
      conn = null;
      emit("disconnected", {});
    });
    conn.on("error", (e) => { console.warn("[MP] conn error", e); });
  }

  function leave() {
    if (conn) { conn.close(); conn = null; }
    if (peer) { peer.destroy(); peer = null; }
    _remotePose.valid = false;
    emit("disconnected", {});
  }

  function send(obj) {
    if (!conn || !conn.open) return;
    try { conn.send(obj); } catch (e) {}
  }

  return {
    init: () => loadPeerJS(),
    host, join, leave,
    sendDrum: (name, vel = 100) => send({ t: "drum", n: name, v: vel }),
    sendNote: (midi, dur = 0.5, vel = 100) => send({ t: "note", m: midi, d: dur, v: vel }),
    sendPose: (x, z, yaw) => send({ t: "pose", x, z, yaw }),
    onConnected: (fn) => { listeners.connected.add(fn); return () => listeners.connected.delete(fn); },
    onDisconnected: (fn) => { listeners.disconnected.add(fn); return () => listeners.disconnected.delete(fn); },
    onStatus: (fn) => { listeners.status.add(fn); return () => listeners.status.delete(fn); },
    onRemotePose: (fn) => { listeners.remotePose.add(fn); return () => listeners.remotePose.delete(fn); },
    isConnected: () => !!(conn && conn.open),
    remotePose: () => _remotePose,
  };
})();
