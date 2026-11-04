## Summary

Extended `scripts/export-public.mjs` to publish today's product (packages, apps/vscode, plugins/claude-code,
release/mole-code, docs, site) and pass its own private-string scan (0 hits for /Users/a1, raymond, .hermes,
tasks/, context/, ledger, AGENTS.md); excluded `agentstate`/`coverage` (built around the author's private
Hermes/ledger workflow, not an end-user feature) and all bench/test dirs; added comment-only redaction for
stray task-slug/context citations, verified it doesn't break TS/JSON syntax (247 files parsed clean).
Implemented `mole demo` (one lazy import in `packages/daemon/src/cli.ts`) using the real `rules:` enforcement
mechanism; verified end-to-end through a packed `mole-code` tarball in a clean install dir (transcript in
`4 log/demo-transcript.txt`). Wrote the public README (pitch, demo, install for every surface, verified
numbers with honesty caveats including the T63 no-productivity-gain result, a dated competitor table), 5
docs/ pages, and a static `site/index.html` with an animated terminal replay of the real transcript (no
fabricated output; screenshot not run — no `playwright` in this repo, per the task's fallback).
