/* ============================================================
   THE METRO — persistence layer
   Two modes, same API:
     supabase — permanent shared wall (Postgres + Storage + Realtime)
     local    — localStorage fallback when config.js is empty;
                BroadcastChannel keeps multiple tabs in sync so the
                room is fully testable offline.

   A note row:
     { id, created_at, kind: 'note'|'photo'|'link',
       text, url, image_path, author, color, uid,
       wall, x, y, rot }            // x,y are 0..1 across the wall
                                    // uid = who posted it; lets people
                                    // re-hang their OWN note later
   ============================================================ */

import { blobToDataUrl } from "./util.js";

const LS_KEY = "metro.notes";

let mode = "local";
let sb = null;                  // supabase client
let bc = null;                  // BroadcastChannel (local mode + delete events)
const newListeners = new Set();
const removedListeners = new Set();
const movedListeners = new Set();

function emitNew(n)    { newListeners.forEach(fn => { try { fn(n); } catch (e) {} }); }
function emitRemoved(id) { removedListeners.forEach(fn => { try { fn(id); } catch (e) {} }); }
function emitMoved(m)  { movedListeners.forEach(fn => { try { fn(m); } catch (e) {} }); }

async function init() {
  const cfg = window.METRO_CONFIG || {};
  bc = "BroadcastChannel" in window ? new BroadcastChannel("metro-room") : null;

  if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
    try {
      const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
      sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
      // Live inserts from everyone else in the world.
      sb.channel("notes-feed")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notes" },
            payload => { if (payload.new && !payload.new.deleted) emitNew(payload.new); })
        .subscribe();
      mode = "supabase";
    } catch (e) {
      console.warn("[metro] supabase unavailable, falling back to local:", e);
      sb = null;
      mode = "local";
    }
  }

  if (bc) {
    bc.onmessage = (ev) => {
      const m = ev.data || {};
      if (m.type === "new" && mode === "local") emitNew(m.note);
      if (m.type === "del") emitRemoved(m.id);
      if (m.type === "move") emitMoved(m.move);
      if (m.type === "cat" && mode === "local") {
        catListeners.forEach(fn => { try { fn(m.state); } catch (e) {} });
      }
      if (m.type === "dj" && mode === "local") {
        djListeners.forEach(fn => { try { fn(m.dj || null); } catch (e) {} });
      }
    };
  }
  subscribeCat();
  subscribeScores();
  subscribeRoomLight();
  return mode;
}

/* ---------------- local helpers ---------------- */
function lsRead() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch (e) { return []; }
}
function lsWrite(arr) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch (e) {}
}

/* ---------------- API ---------------- */

async function list() {
  if (mode === "supabase") {
    const { data, error } = await sb.from("notes")
      .select("*").order("created_at", { ascending: true }).limit(2000);
    if (error) throw error;
    return data || [];
  }
  return lsRead();
}

// note: fields minus id/created_at/image_path; imageBlob optional (kind 'photo')
async function add(note, imageBlob) {
  if (mode === "supabase") {
    let image_path = null;
    if (imageBlob) {
      const name = `p/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await sb.storage.from("photos")
        .upload(name, imageBlob, { contentType: "image/jpeg" });
      if (upErr) throw upErr;
      image_path = name;
    }
    const { data, error } = await sb.from("notes")
      .insert({ ...note, image_path }).select().single();
    if (error) throw error;
    return data;
  }

  // local mode — images become data URLs (small ones only)
  const saved = {
    ...note,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    image_path: imageBlob ? await blobToDataUrl(imageBlob) : null,
  };
  const all = lsRead();
  all.push(saved);
  lsWrite(all);
  bc?.postMessage({ type: "new", note: saved });
  return saved;
}

function imageUrl(image_path) {
  if (!image_path) return null;
  if (image_path.startsWith("data:")) return image_path;
  if (mode === "supabase") {
    return sb.storage.from("photos").getPublicUrl(image_path).data.publicUrl;
  }
  return null;
}

async function adminDelete(id, pass) {
  if (mode === "supabase") {
    const { data, error } = await sb.rpc("admin_delete_note", { note_id: id, pass });
    if (error) throw error;
    if (!data) throw new Error("wrong passphrase");
  } else {
    lsWrite(lsRead().filter(n => n.id !== id));
  }
  bc?.postMessage({ type: "del", id });
  emitRemoved(id);
}

// re-hang a note you posted. only the original poster's uid is allowed —
// going forward only (old notes carry no uid, so nobody can move them).
// returns the moved row (or the place we wrote in local mode).
async function moveNote(id, uid, place) {
  if (!uid) throw new Error("no uid");
  if (mode === "supabase") {
    const { data, error } = await sb.rpc("move_note", {
      note_id: id, note_uid: uid,
      new_wall: place.wall, new_x: place.x, new_y: place.y, new_rot: place.rot ?? 0,
    });
    if (error) throw error;
    if (!data) throw new Error("not yours");
  } else {
    const all = lsRead();
    const n = all.find(x => x.id === id);
    if (!n || n.uid !== uid) throw new Error("not yours");
    n.wall = place.wall; n.x = place.x; n.y = place.y; n.rot = place.rot ?? 0;
    lsWrite(all);
  }
  const moved = { id, wall: place.wall, x: place.x, y: place.y, rot: place.rot ?? 0 };
  bc?.postMessage({ type: "move", move: moved });
  return moved;
}

/* ---- cat needs: shared in real time across every visitor ----
   Bowls only go down because the cat actually eats and drinks; the
   litter only dirties because the cat actually uses it. The cat runs
   on shared timers (hungry_at / thirsty_at / bathroom_at) so every
   visitor's cat gets hungry at the same moment, and whoever's cat
   acts first writes the result — everyone else syncs over realtime. */
const catListeners = new Set();
const clamp01 = (v) => Math.max(0, Math.min(1, v ?? 0));

// No passive decay. The cat feeds itself on its timers, so it stays
// FED as long as the bowls have anything in them. "fed"/"hydrated"
// are 1.0 while it can take care of itself and only drain while a
// meal is overdue AND the bowl is empty — i.e. the room let it down.
function decayCat(s) {
  if (!s) return { food: 1, water: 1, litter: 0, pets: 0, hungry: false, thirsty: false, bathroom: false, fed: 1, hydrated: 1 };
  const now = Date.now();
  const due = (k) => !s[k] || now >= new Date(s[k]).getTime();
  // starvation builds over hours past the missed meal
  const starve = (k, level, hours) => {
    if (!due(k) || level > 0.05) return 1;
    const overdueMs = now - new Date(s[k]).getTime();
    return Math.max(0, 1 - overdueMs / (hours * 3600000));
  };
  const food = clamp01(s.food ?? 1);
  const water = clamp01(s.water ?? 1);
  return {
    food, water,
    litter: clamp01(s.litter ?? 0),
    pets: s.pets ?? 0,
    hungry: due("hungry_at"),
    thirsty: due("thirsty_at"),
    bathroom: due("bathroom_at"),
    fed: starve("hungry_at", food, 6),
    hydrated: starve("thirsty_at", water, 4),
  };
}

function lsCat() {
  const fresh = {
    food: 1, water: 1, litter: 0, pets: 0, treats: [],
    hungry_at: new Date().toISOString(),
    thirsty_at: new Date().toISOString(),
    bathroom_at: new Date(Date.now() + 3600000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  try {
    return JSON.parse(localStorage.getItem("metro.catstate") || "null") || fresh;
  } catch (e) {
    return fresh;
  }
}
function lsCatWrite(s) {
  try { localStorage.setItem("metro.catstate", JSON.stringify(s)); } catch (e) {}
  bc?.postMessage({ type: "cat", state: s });
  catListeners.forEach(fn => { try { fn(s); } catch (e) {} });
}

async function getCatState() {
  if (mode === "supabase") {
    const { data, error } = await sb.from("cat_state").select("*").eq("id", 1).single();
    if (error) throw error;
    return data;
  }
  return lsCat();
}

// human actions: feed | water | clean | treat | pet
// cat actions:   eat | drink | bathroom  (guarded by the shared timers)
async function catCare(action) {
  if (mode === "supabase") {
    const { data, error } = await sb.rpc("cat_care", { action });
    if (error) throw error;
    return data;
  }
  const s = lsCat();
  const now = Date.now();
  const due = (k) => !s[k] || now >= new Date(s[k]).getTime();
  const inHrs = (lo, hi) => new Date(now + (lo + Math.random() * (hi - lo)) * 3600000).toISOString();
  let ok = true, reason = "";
  s.treats = (s.treats || []).filter(t => now - t < 6 * 3600000);

  if (action === "feed") { if (s.food < 0.6) s.food = 1; else { ok = false; reason = "food still full"; } }
  else if (action === "water") { if (s.water < 0.7) s.water = 1; else { ok = false; reason = "water still full"; } }
  else if (action === "clean") s.litter = 0;
  else if (action === "treat") {
    if (s.treats.length >= 6) { ok = false; reason = "cat is full"; }
    else { s.treats.push(now); s.food = Math.min(1, (s.food ?? 1) + 0.06); }
  }
  else if (action === "pet") s.pets = (s.pets ?? 0) + 1;
  else if (action === "eat") {
    if (!due("hungry_at")) { ok = false; reason = "not hungry"; }
    // empty bowl: hungry_at stays in the past so starvation accumulates
    // until somebody refills — then the next eat instantly succeeds
    else if ((s.food ?? 0) <= 0.05) { ok = false; reason = "bowl empty"; }
    else { s.food = Math.max(0, s.food - 0.15); s.hungry_at = inHrs(0.75, 1.67); }
  }
  else if (action === "drink") {
    if (!due("thirsty_at")) { ok = false; reason = "not thirsty"; }
    else if ((s.water ?? 0) <= 0.05) { ok = false; reason = "bowl empty"; }
    else { s.water = Math.max(0, s.water - 0.18); s.thirsty_at = inHrs(0.58, 1.33); }
  }
  else if (action === "bathroom") {
    if (!due("bathroom_at")) { ok = false; reason = "no need"; }
    else { s.litter = Math.min(1, (s.litter ?? 0) + 0.15); s.bathroom_at = inHrs(1.67, 3.67); }
  }

  s.updated_at = new Date().toISOString();
  lsCatWrite(s);
  return { ...s, ok, reason };
}

function subscribeCat() {
  if (mode === "supabase" && sb) {
    sb.channel("cat-state")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "cat_state" },
        payload => { if (payload.new) catListeners.forEach(fn => { try { fn(payload.new); } catch (e) {} }); })
      .subscribe();
  }
}

/* ---- private messages: straight to Metro's computer ---- */
async function sendDM({ name, text, url }, file = null) {
  if (mode === "supabase") {
    let file_path = null;
    if (file) {
      const safe = (file.name || "audio").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
      file_path = `d/${crypto.randomUUID()}-${safe}`;
      const { error: upErr } = await sb.storage.from("demos")
        .upload(file_path, file, { contentType: file.type || "audio/mpeg" });
      if (upErr) throw upErr;
    }
    const { error } = await sb.from("private_messages").insert({ name, text, url, file_path });
    if (error) throw error;
    return true;
  }
  try {
    const all = JSON.parse(localStorage.getItem("metro.dms") || "[]");
    all.push({ name, text, url, created_at: new Date().toISOString() });
    localStorage.setItem("metro.dms", JSON.stringify(all.slice(-50)));
  } catch (e) {}
  return true;
}

function demoUrl(file_path) {
  if (!file_path || mode !== "supabase") return null;
  return sb.storage.from("demos").getPublicUrl(file_path).data.publicUrl;
}

async function readInbox(pass) {
  if (mode === "supabase") {
    const { data, error } = await sb.rpc("read_inbox", { pass });
    if (error) throw error;
    return data;   // null = wrong passphrase
  }
  try { return JSON.parse(localStorage.getItem("metro.dms") || "[]").reverse(); } catch (e) { return []; }
}

/* ---- the room light: persists for everyone, survives refresh ---- */
const roomLightListeners = new Set();
const djListeners = new Set();          // who's on the decks (rides room_state)
async function getRoomLight() {
  if (mode === "supabase") {
    const { data, error } = await sb.from("room_state").select("*").eq("id", 1).single();
    if (error) throw error;
    return data;
  }
  try { return JSON.parse(localStorage.getItem("metro.roomlight") || "null"); } catch (e) { return null; }
}
async function saveRoomLight(level, color) {
  if (mode === "supabase") {
    const { error } = await sb.rpc("set_room_light", { level, color });
    if (error) throw error;
    return;
  }
  try { localStorage.setItem("metro.roomlight", JSON.stringify({ light_level: level, light_color: color })); } catch (e) {}
}
function subscribeRoomLight() {
  if (mode === "supabase" && sb) {
    sb.channel("room-state")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "room_state" },
        payload => {
          if (!payload.new) return;
          roomLightListeners.forEach(fn => { try { fn(payload.new); } catch (e) {} });
          djListeners.forEach(fn => { try { fn(payload.new.dj || null); } catch (e) {} });
        })
      .subscribe();
  }
}

/* ---- the booth: who's been handed the decks (admin-gated, persists) ---- */
async function getDJ() {
  if (mode === "supabase") {
    const { data, error } = await sb.from("room_state").select("dj").eq("id", 1).single();
    if (error) return null;
    return data?.dj || null;
  }
  try { return JSON.parse(localStorage.getItem("metro.dj") || "null"); } catch (e) { return null; }
}
async function saveDJ(dj, pass) {
  if (mode === "supabase") {
    const { data, error } = await sb.rpc("set_dj", { p_dj: dj, pass });
    if (error) throw error;
    if (!data) throw new Error("wrong passphrase");
    return;
  }
  try { localStorage.setItem("metro.dj", JSON.stringify(dj)); } catch (e) {}
  bc?.postMessage({ type: "dj", dj });
}

/* ---- lightweight metrics: what the room gets up to ---- */
function logEvent(type) {
  if (mode !== "supabase") return;
  // fire-and-forget; failures are nobody's problem
  sb.from("events").insert({ type }).then(() => {}, () => {});
}

/* ---- messages in bottles: one washes up per reader ---- */
async function castBottle(text) {
  if (mode === "supabase") {
    const { error } = await sb.from("bottles").insert({ text });
    if (error) throw error;
    return;
  }
  try {
    const all = JSON.parse(localStorage.getItem("metro.bottles") || "[]");
    all.push({ text, created_at: new Date().toISOString() });
    localStorage.setItem("metro.bottles", JSON.stringify(all.slice(-40)));
  } catch (e) {}
}
async function readBottle() {
  if (mode === "supabase") {
    const { data, error } = await sb.rpc("bottle_random");
    if (error) throw error;
    return data;   // { text, created_at } or null
  }
  try {
    const all = JSON.parse(localStorage.getItem("metro.bottles") || "[]");
    return all.length ? all[Math.floor(Math.random() * all.length)] : null;
  } catch (e) { return null; }
}

/* ---- arcade high scores: shared, all-time ---- */
const scoreListeners = new Set();
async function submitScore(game, name, score, uid) {
  if (mode === "supabase") {
    // one row per player per game — their best survives
    const { error } = await sb.rpc("submit_score", { p_game: game, p_uid: uid || null, p_name: name, p_score: score });
    if (error) throw error;
    return;
  }
  try {
    let all = JSON.parse(localStorage.getItem("metro.scores") || "[]");
    const i = all.findIndex(s2 => s2.game === game && s2.uid === uid);
    if (i >= 0) { all[i].score = Math.max(all[i].score, score); all[i].name = name; }
    else all.push({ game, name, score, uid, created_at: new Date().toISOString() });
    localStorage.setItem("metro.scores", JSON.stringify(all.slice(-100)));
  } catch (e) {}
}
async function listScores(game, limit = 10) {
  if (mode === "supabase") {
    const { data, error } = await sb.from("scores")
      .select("name,score").eq("game", game)
      .order("score", { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  }
  try {
    return JSON.parse(localStorage.getItem("metro.scores") || "[]")
      .filter(s => s.game === game)
      .sort((a, b) => b.score - a.score).slice(0, limit);
  } catch (e) { return []; }
}
function subscribeScores() {
  if (mode === "supabase" && sb) {
    sb.channel("scores-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "scores" },
        () => scoreListeners.forEach(fn => { try { fn(); } catch (e) {} }))
      .subscribe();
  }
}

export const store = {
  getRoomLight, saveRoomLight, logEvent,
  castBottle, readBottle,
  onRoomLight: fn => { roomLightListeners.add(fn); return () => roomLightListeners.delete(fn); },
  getDJ, saveDJ,
  onDJ: fn => { djListeners.add(fn); return () => djListeners.delete(fn); },
  submitScore, listScores,
  onNewScore: fn => { scoreListeners.add(fn); return () => scoreListeners.delete(fn); },
  _subscribeScores: subscribeScores,
  init, list, add, imageUrl, adminDelete, moveNote,
  sendDM, readInbox, demoUrl,
  getCatState, catCare, decayCat,
  onCatState: fn => { catListeners.add(fn); return () => catListeners.delete(fn); },
  get mode() { return mode; },
  get client() { return sb; },
  onNew: fn => { newListeners.add(fn); return () => newListeners.delete(fn); },
  onRemoved: fn => { removedListeners.add(fn); return () => removedListeners.delete(fn); },
  onMoved: fn => { movedListeners.add(fn); return () => movedListeners.delete(fn); },
};
