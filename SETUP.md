# THE METRO — making the wall permanent

Right now the site runs in **local mode**: everything works, but notes
only persist in each visitor's own browser. To make the wall shared and
permanent for everyone, you connect it to a free Supabase project.
Takes about 3 minutes. No credit card.

## 1. Create the project

1. Go to [supabase.com](https://supabase.com) → **Start your project** → sign up
   (GitHub login is easiest).
2. **New project** → give it a name (`metro`), set a database password
   (save it somewhere, you won't need it day-to-day), pick the region
   closest to most of your visitors → **Create**.
3. Wait ~1 minute while it provisions.

## 2. Set up the database

1. Open `supabase/schema.sql` from this repo in a text editor.
2. Find the line with **`CHANGE_ME`** and replace it with a secret
   **admin passphrase** of your choosing — this is your kill switch for
   removing anything from the wall. Pick something long.
3. In the Supabase dashboard: **SQL Editor → New query**, paste the whole
   file, hit **Run**. You should see "Success. No rows returned".

> ⚠ Don't commit the edited schema.sql with your real passphrase in it —
> edit it, run it in the dashboard, then discard the edit. Only the
> hashed version lives in the database.

## 3. Connect the site

1. In the dashboard: **Project Settings → API**.
2. Copy the **Project URL** and the **anon public** key into
   `assets/js/config.js`:

```js
window.METRO_CONFIG = {
  SUPABASE_URL: "https://YOURPROJECT.supabase.co",
  SUPABASE_ANON_KEY: "eyJ…the long anon key…",
};
```

3. Commit and push. That's it — the intro screen will now say
   **"connected — what you leave here is permanent"**.

The anon key is *meant* to be public — everything visitors can do with it
is limited by the database policies you just installed: they can read the
wall and add to it, and that's all. Nobody can edit or delete anything
except you.

## Your admin kill switch

- Visit **whoisthemetro.com/#admin**
- Click any note/photo/link on the wall → a **"remove from the wall"**
  button appears → enter your passphrase once per session.
- The note is soft-deleted (hidden from everyone, kept in the database
  in case you ever want it back).

To change the passphrase, re-run just this line in the SQL Editor with a
new secret:

```sql
insert into private.admin (id, pass_hash)
values (1, crypt('your-new-passphrase', gen_salt('bf')))
on conflict (id) do update set pass_hash = excluded.pass_hash;
```

## Built-in guardrails

| Guardrail | Limit |
|---|---|
| Posts per visitor | 5 per minute (by IP, enforced in the database) |
| Posts total | 40 per minute across the whole site |
| Note length | 280 characters |
| Photo size | resized in-browser, hard 3 MB cap, images only |
| Links | http/https only, never auto-opened, `rel="noopener noreferrer nofollow"` |
| Editing/deleting | impossible for visitors at the database level |

## Free tier headroom

Supabase's free tier (as of mid-2026): 500 MB database, 1 GB file storage,
200 concurrent realtime connections. Notes are tiny (~300 bytes each — the
database holds over a million of them); photos at ~200 KB each fit roughly
5,000 in storage. If the wall ever outgrows that, the Pro tier is $25/mo —
a good problem to have.

## If something goes wrong

- **Posts failing with "wall is busy"** — that's the rate limiter doing
  its job during a rush; it clears within a minute.
- **Want to nuke everything and start over** — SQL Editor:
  `truncate public.notes;` (and empty the `photos` bucket under Storage).
- **See everything ever posted, including deleted** — Table Editor →
  `notes` table.
