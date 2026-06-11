/* ============================================================
   THE METRO — persistence layer
   Two modes, same API:
     supabase — permanent shared wall (Postgres + Storage + Realtime)
     local    — localStorage fallback when config.js is empty;
                BroadcastChannel keeps multiple tabs in sync so the
                room is fully testable offline.

   A note row:
     { id, created_at, kind: 'note'|'photo'|'link',
       text, url, image_path, author, color,
       wall, x, y, rot }            // x,y are 0..1 across the wall
   ============================================================ */

import { blobToDataUrl } from "./util.js";

const LS_KEY = "metro.notes";

let mode = "local";
let sb = null;                  // supabase client
let bc = null;                  // BroadcastChannel (local mode + delete events)
const newListeners = new Set();
const removedListeners = new Set();

function emitNew(n)    { newListeners.forEach(fn => { try { fn(n); } catch (e) {} }); }
function emitRemoved(id) { removedListeners.forEach(fn => { try { fn(id); } catch (e) {} }); }

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
      if (m.type === "cat" && mode === "local") {
        catListeners.forEach(fn => { try { fn(m.state); } catch (e) {} });
      }
    };
  }
  subscribeCat();
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

/* ---- cat needs: shared in real time across every visitor ----
   Bowls only go down because the cat actually eats and drinks; the
   litter only dirties because the cat actually uses it. The cat runs
   on shared timers (hungry_at / thirsty_at / bathroom_at) so every
   visitor's cat gets hungry at the same moment, and whoever's cat
   acts first writes the result — everyone else syncs over realtime. */
const catListeners = new Set();
const clamp01 = (v) => Math.max(0, Math.min(1, v ?? 0));

// no passive decay — levels, "is it time yet?" flags, plus 0..1 meters
// showing how close each need is (1 = the cat needs it right now)
function decayCat(s) {
  if (!s) return { food: 1, water: 1, litter: 0, pets: 0, hungry: false, thirsty: false, bathroom: false, hunger: 0, thirst: 0, bladder: 0 };
  const now = Date.now();
  const due = (k) => !s[k] || now >= new Date(s[k]).getTime();
  const meter = (k, avgMin) => !s[k] ? 1
    : Math.max(0, Math.min(1, 1 - (new Date(s[k]).getTime() - now) / (avgMin * 60000)));
  return {
    food: clamp01(s.food ?? 1),
    water: clamp01(s.water ?? 1),
    litter: clamp01(s.litter ?? 0),
    pets: s.pets ?? 0,
    hungry: due("hungry_at"),
    thirsty: due("thirsty_at"),
    bathroom: due("bathroom_at"),
    hunger: meter("hungry_at", 72),
    thirst: meter("thirsty_at", 57),
    bladder: meter("bathroom_at", 160),
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
    else if ((s.food ?? 0) <= 0.05) { s.hungry_at = new Date(now + 15 * 60000).toISOString(); ok = false; reason = "bowl empty"; }
    else { s.food = Math.max(0, s.food - 0.15); s.hungry_at = inHrs(0.75, 1.67); }
  }
  else if (action === "drink") {
    if (!due("thirsty_at")) { ok = false; reason = "not thirsty"; }
    else if ((s.water ?? 0) <= 0.05) { s.thirsty_at = new Date(now + 12 * 60000).toISOString(); ok = false; reason = "bowl empty"; }
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

export const store = {
  init, list, add, imageUrl, adminDelete,
  getCatState, catCare, decayCat,
  onCatState: fn => { catListeners.add(fn); return () => catListeners.delete(fn); },
  get mode() { return mode; },
  get client() { return sb; },
  onNew: fn => { newListeners.add(fn); return () => newListeners.delete(fn); },
  onRemoved: fn => { removedListeners.add(fn); return () => removedListeners.delete(fn); },
};
