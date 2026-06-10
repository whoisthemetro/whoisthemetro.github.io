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

/* ---------------- echoes + the cat ---------------- */

async function saveEcho(color, path) {
  if (mode === "supabase") {
    const { error } = await sb.from("echoes").insert({ color, path });
    if (error) throw error;
    return;
  }
  try {
    const all = JSON.parse(localStorage.getItem("metro.echoes") || "[]");
    all.push(path);
    localStorage.setItem("metro.echoes", JSON.stringify(all.slice(-20)));
  } catch (e) {}
}

async function listEchoes() {
  if (mode === "supabase") {
    const { data, error } = await sb.from("echoes")
      .select("path").order("created_at", { ascending: false }).limit(40);
    if (error) throw error;
    return (data || []).map(r => r.path);
  }
  try { return JSON.parse(localStorage.getItem("metro.echoes") || "[]"); } catch (e) { return []; }
}

/* ---- cat needs: shared in real time across every visitor ---- */
// decay rates (hours to go from full to empty / clean to dirty)
const CAT_RATES = { food: 36, water: 24, litter: 48 };
const catListeners = new Set();

function decayCat(s) {
  if (!s) return { food: 1, water: 1, litter: 0, pets: 0 };
  const hrs = Math.max(0, (Date.now() - new Date(s.updated_at || Date.now()).getTime()) / 3600000);
  return {
    food: Math.max(0, (s.food ?? 1) - hrs / CAT_RATES.food),
    water: Math.max(0, (s.water ?? 1) - hrs / CAT_RATES.water),
    litter: Math.min(1, (s.litter ?? 0) + hrs / CAT_RATES.litter),
    pets: s.pets ?? 0,
  };
}

function lsCat() {
  try {
    return JSON.parse(localStorage.getItem("metro.catstate") || "null")
      || { food: 1, water: 1, litter: 0, pets: 0, treats: [], updated_at: new Date().toISOString() };
  } catch (e) {
    return { food: 1, water: 1, litter: 0, pets: 0, treats: [], updated_at: new Date().toISOString() };
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

// actions: feed | water | clean | treat | pet → { food, water, litter, pets, ok, reason }
async function catCare(action) {
  if (mode === "supabase") {
    const { data, error } = await sb.rpc("cat_care", { action });
    if (error) throw error;
    return data;
  }
  const s = lsCat();
  const d = decayCat(s);
  const now = Date.now();
  let ok = true, reason = "";
  s.treats = (s.treats || []).filter(t => now - t < 6 * 3600000);
  if (action === "feed") { if (d.food < 0.6) d.food = 1; else { ok = false; reason = "food still full"; } }
  else if (action === "water") { if (d.water < 0.7) d.water = 1; else { ok = false; reason = "water still full"; } }
  else if (action === "clean") d.litter = 0;
  else if (action === "treat") {
    if (s.treats.length >= 6) { ok = false; reason = "cat is full"; }
    else { s.treats.push(now); d.food = Math.min(1, d.food + 0.06); }
  }
  else if (action === "pet") d.pets += 1;
  Object.assign(s, d, { updated_at: new Date().toISOString() });
  lsCatWrite(s);
  return { ...d, ok, reason };
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
  saveEcho, listEchoes,
  getCatState, catCare, decayCat,
  onCatState: fn => { catListeners.add(fn); return () => catListeners.delete(fn); },
  get mode() { return mode; },
  get client() { return sb; },
  onNew: fn => { newListeners.add(fn); return () => newListeners.delete(fn); },
  onRemoved: fn => { removedListeners.add(fn); return () => removedListeners.delete(fn); },
};
