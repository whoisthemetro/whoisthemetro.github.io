#!/usr/bin/env node
/* ============================================================
   THE GARDEN — move the audio to Cloudflare R2

   What "moving to R2" is: the same ten files, in a different place,
   and one string changed in the catalog so the room looks there. No
   re-encoding, no quality change, nothing about the garden itself is
   touched. A visitor cannot tell.

   Why: R2 charges nothing for egress. Supabase's free tier allows 5 GB
   a month — about 200 complete listens of a 25 MB catalog — and it
   serves everything `no-cache` regardless of what the object says, so a
   repeat listen re-downloads the whole track. R2 has no such ceiling and
   honours Cache-Control, so the second listen is free in both senses.

   This talks to R2's S3-compatible API and signs with SigV4 out of
   node:crypto. No wrangler, no rclone, no aws-cli, nothing to install.

   ---- what it needs ----
   ~/.config/metro/r2.env  (mkdir -m 700, file chmod 600 — secrets never
   live in this repo; see the secrets note in CLAUDE.md):

     R2_ACCOUNT_ID=...          # Cloudflare dashboard → R2 → the hex id
     R2_ACCESS_KEY_ID=...       # R2 → Manage API Tokens → Object Read & Write
     R2_SECRET_ACCESS_KEY=...
     R2_BUCKET=metro-garden
     R2_PUBLIC_BASE=https://audio.whoisthemetro.com    # or the r2.dev URL

   ---- usage ----
     node tools/garden/to-r2.mjs            # upload, verify, print the base
     node tools/garden/to-r2.mjs --commit   # ...and rewrite GARDEN_BASE too
     node tools/garden/to-r2.mjs --check    # just verify what's already up
     node tools/garden/to-r2.mjs --selftest # check the signing, no creds needed
   ============================================================ */

import { createHash, createHmac } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const ROOT = path.resolve(import.meta.dirname, "../..");
const AUDIO = path.join(ROOT, "assets/audio/garden");
const CATALOG = path.join(ROOT, "assets/js/garden-catalog.js");
const ENVFILE = path.join(os.homedir(), ".config/metro/r2.env");
const args = process.argv.slice(2);
const has = (f) => args.includes(`--${f}`);

// a year, immutable: the encoder writes a new FILENAME when a track changes
// (the id is the slug), so a cached object is never stale
const CACHE = "public, max-age=31536000, immutable";

async function loadEnv() {
  let txt;
  try { txt = await fs.readFile(ENVFILE, "utf8"); }
  catch (e) {
    console.error(`no ${ENVFILE}\n\nCreate it with:\n` +
      `  mkdir -p -m 700 ~/.config/metro\n` +
      `  cat > ~/.config/metro/r2.env <<'EOF'\n` +
      `  R2_ACCOUNT_ID=\n  R2_ACCESS_KEY_ID=\n  R2_SECRET_ACCESS_KEY=\n` +
      `  R2_BUCKET=metro-garden\n  R2_PUBLIC_BASE=https://audio.whoisthemetro.com\n  EOF\n` +
      `  chmod 600 ~/.config/metro/r2.env\n`);
    process.exit(1);
  }
  const env = {};
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const need = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE"];
  const missing = need.filter((k) => !env[k]);
  if (missing.length) { console.error(`r2.env is missing: ${missing.join(", ")}`); process.exit(1); }
  if (!env.R2_PUBLIC_BASE.endsWith("/")) env.R2_PUBLIC_BASE += "/";
  return env;
}

/* ---------------- AWS SigV4, the small honest version ----------------
   R2 speaks S3, and S3 wants every request signed. Four derivations and a
   canonical string; nothing here needs a dependency. */
const sha256hex = (b) => createHash("sha256").update(b).digest("hex");
const hmac = (key, s) => createHmac("sha256", key).update(s).digest();

function signedHeaders({ env, method, key, body, contentType }) {
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const region = "auto", service = "s3";
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");   // 20260819T101530Z
  const date = amzDate.slice(0, 8);
  const payloadHash = sha256hex(body || "");

  // header names must be lower-case and SORTED in the canonical request
  const hdrs = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) hdrs["content-type"] = contentType;
  if (method === "PUT") hdrs["cache-control"] = CACHE;
  const names = Object.keys(hdrs).sort();
  const canonicalHeaders = names.map((n) => `${n}:${hdrs[n]}\n`).join("");
  const signedList = names.join(";");

  // the key is already a safe slug, but encode it properly anyway
  const canonicalUri = "/" + `${env.R2_BUCKET}/${key}`.split("/").map(encodeURIComponent).join("/");
  const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedList, payloadHash].join("\n");
  const scope = `${date}/${region}/${service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonicalRequest)].join("\n");

  let k = hmac(`AWS4${env.R2_SECRET_ACCESS_KEY}`, date);
  k = hmac(k, region); k = hmac(k, service); k = hmac(k, "aws4_request");
  const signature = createHmac("sha256", k).update(toSign).digest("hex");

  return {
    url: `https://${host}${canonicalUri}`,
    headers: {
      ...hdrs,
      Authorization: `AWS4-HMAC-SHA256 Credential=${env.R2_ACCESS_KEY_ID}/${scope}, ` +
        `SignedHeaders=${signedList}, Signature=${signature}`,
    },
  };
}

async function putObject(env, key, body, contentType) {
  const { url, headers } = signedHeaders({ env, method: "PUT", key, body, contentType });
  const r = await fetch(url, { method: "PUT", headers, body });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${(await r.text()).slice(0, 300)}`);
}

/* ---------------- verify ----------------
   A 200 proves nothing about whether the room can USE the file. Two headers
   decide that: Access-Control-Allow-Origin (without it a cross-origin media
   element is tainted — it plays and feeds the audio graph pure silence, no
   error anywhere), and Accept-Ranges (without it a long track downloads whole
   before making a sound). Check both, per file. */
async function verify(base, file) {
  const url = base + file;
  const r = await fetch(url, { method: "GET", headers: { Range: "bytes=0-1023", Origin: "https://whoisthemetro.com" } });
  const h = (n) => r.headers.get(n) || "";
  return {
    file,
    status: r.status,
    ranges: r.status === 206 || h("accept-ranges").includes("bytes"),
    cors: h("access-control-allow-origin"),
    cache: h("cache-control"),
    type: h("content-type"),
  };
}

/* ---------------- selftest ----------------
   The signing is the one part of this that can be silently, completely wrong:
   a bad signature just gets a 403 and no clue which of the four derivations or
   the canonical request was at fault. So the chain is checked against AWS's own
   published SigV4 example, which needs no credentials and no network. Run it
   before blaming the bucket. (Getting this test wrong is easy too — in that
   example the query string belongs in the canonical QUERY field and the payload
   is empty; putting the query in the payload produces a plausible-looking
   mismatch that sends you hunting a bug that isn't there.) */
function selftest() {
  const SECRET = "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY";
  const amzDate = "20150830T123600Z", date = "20150830";
  const region = "us-east-1", service = "iam";
  const hdrs = {
    "content-type": "application/x-www-form-urlencoded; charset=utf-8",
    host: "iam.amazonaws.com",
    "x-amz-date": amzDate,
  };
  const names = Object.keys(hdrs).sort();
  const canonicalHeaders = names.map((n) => `${n}:${hdrs[n]}\n`).join("");
  const canonicalRequest = ["GET", "/", "Action=ListUsers&Version=2010-05-08",
    canonicalHeaders, names.join(";"), sha256hex("")].join("\n");
  const scope = `${date}/${region}/${service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonicalRequest)].join("\n");
  let k = hmac(`AWS4${SECRET}`, date);
  k = hmac(k, region); k = hmac(k, service); k = hmac(k, "aws4_request");
  const sig = createHmac("sha256", k).update(toSign).digest("hex");
  const want = "5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7";
  console.log(sig === want
    ? "sigv4 chain matches AWS's published vector — signing is good"
    : `sigv4 MISMATCH\n  got  ${sig}\n  want ${want}`);
  return sig === want;
}

async function main() {
  if (has("selftest")) process.exit(selftest() ? 0 : 1);
  const env = await loadEnv();
  const mod = await import(`file://${CATALOG}?t=${Date.now()}`);
  const tracks = mod.GARDEN_TRACKS || [];
  if (!tracks.length) { console.error("nothing planted — the catalog is empty."); process.exit(1); }

  if (!has("check")) {
    console.log(`uploading ${tracks.length} tracks to r2://${env.R2_BUCKET}/`);
    for (const t of tracks) {
      const local = path.join(AUDIO, t.file);
      let body;
      try { body = await fs.readFile(local); }
      catch (e) {
        console.error(`  ${t.file} … MISSING locally. Re-encode it from the master first.`);
        process.exit(1);
      }
      process.stdout.write(`  ${t.file} … `);
      await putObject(env, t.file, body, "audio/mp4");
      console.log(`${(body.length / 1048576).toFixed(1)} MB`);
    }
  }

  console.log("\nverifying over the public URL:");
  let bad = 0;
  for (const t of tracks) {
    const v = await verify(env.R2_PUBLIC_BASE, t.file);
    const okCors = !!v.cors, okRange = v.ranges, okStatus = v.status === 200 || v.status === 206;
    if (!(okCors && okRange && okStatus)) bad++;
    console.log(`  ${okStatus && okCors && okRange ? "ok  " : "BAD "} ${t.file.padEnd(38)}` +
      `${v.status}  cors=${v.cors || "MISSING"}  ranges=${okRange ? "yes" : "NO"}  cache=${v.cache || "-"}`);
  }

  if (bad) {
    console.error(`\n${bad} object(s) not usable by the room.\n` +
      `  cors MISSING  → add the CORS policy to the bucket (tools/garden/README.md).\n` +
      `                  Without it the garden plays SILENCE with no error at all.\n` +
      `  ranges NO     → allow the Range header + expose Content-Range in that policy.`);
    process.exit(1);
  }

  console.log(`\nall good. GARDEN_BASE should be:\n  ${env.R2_PUBLIC_BASE}`);

  if (has("commit")) {
    let src = await fs.readFile(CATALOG, "utf8");
    const line = /^export const GARDEN_BASE = ".*";$/m;
    if (!line.test(src)) { console.error("couldn't find the GARDEN_BASE line to rewrite."); process.exit(1); }
    src = src.replace(line, `export const GARDEN_BASE = ${JSON.stringify(env.R2_PUBLIC_BASE)};`);
    await fs.writeFile(CATALOG, src);
    console.log("catalog updated. commit it and push — that's the move done.");
  } else {
    console.log("re-run with --commit to write that into the catalog.");
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
