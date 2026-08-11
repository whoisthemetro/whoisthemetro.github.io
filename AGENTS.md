# AGENTS.md

**Read [CLAUDE.md](CLAUDE.md) — it is the single source of truth for this
repository, and it is kept current.**

This file used to be a copy of it, aimed at a different assistant. A copy is
worse than useless the moment it drifts: an out-of-date duplicate will
confidently tell you the arcade runs DOOM through js-dos, that the world has
four spaces, and that the window is a painted plane. All three were true once
and none of them are now. So this is a pointer instead.

Everything an agent needs is in CLAUDE.md: what the project is, the commands
(there is no build step and no test framework — `node --check` is the lint,
and smoke tests are ad-hoc Puppeteer scripts), the architecture of every room,
and a long list of hard-won three.js and WebXR rules that are cheaper to read
than to rediscover.

For orientation beyond that:

| file | what it is |
| --- | --- |
| [README.md](README.md) | what the site is, for a human |
| [CHANGELOG.md](CHANGELOG.md) | what shipped, newest first |
| [SETUP.md](SETUP.md) | connecting your own Supabase project |
| [docs/studio.md](docs/studio.md) | the shared sequencer room in depth |
| [docs/analytics.md](docs/analytics.md) | the optional PostHog event spec |
| [tools/mi/README.md](tools/mi/README.md) | rebuilding `assets/wasm/mi.wasm` |
