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
    };
  }
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

async function petCat() {
  if (mode === "supabase") {
    const { data, error } = await sb.rpc("pet_cat");
    if (error) throw error;
    return data;
  }
  let n = 0;
  try {
    n = (parseInt(localStorage.getItem("metro.catpets") || "0", 10) || 0) + 1;
    localStorage.setItem("metro.catpets", String(n));
  } catch (e) {}
  return n;
}

export const store = {
  init, list, add, imageUrl, adminDelete,
  saveEcho, listEchoes, petCat,
  get mode() { return mode; },
  get client() { return sb; },
  onNew: fn => { newListeners.add(fn); return () => newListeners.delete(fn); },
  onRemoved: fn => { removedListeners.add(fn); return () => removedListeners.delete(fn); },
};
