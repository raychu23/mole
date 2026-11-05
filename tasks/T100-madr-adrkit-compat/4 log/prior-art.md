## Summary
MADR 4's optional metadata fields and adrkit's `affects` field, fetched and dated 2026-11-05, used to
implement T100 (D71: "MADR + adrkit's typed `affects` ... any ADR tool reads them").

## MADR 4 template (fetched 2026-11-05)
https://github.com/adr/madr/blob/4.0.0/template/adr-template.md
Optional YAML front matter: `status` (`proposed | rejected | accepted | deprecated | ... | superseded by
ADR-0123`), `date` (`YYYY-MM-DD when the decision was last updated`), `decision-makers` ("list everyone
involved in the decision" -- renamed from MADR <=3's `deciders`), `consulted` ("list everyone whose
opinions are sought ... two-way communication"), `informed` ("list everyone who is kept up-to-date on
progress ... one-way communication"). No required fields; MADR's own front matter ADR
(https://adr.github.io/madr/decisions/0013-use-yaml-front-matter-for-meta-data.html) explains the choice
to carry status/deciders/date as YAML metadata rather than body prose.

## log4brains (fetched 2026-11-05)
https://github.com/thomvaill/log4brains (README) -- ships MADR as its default template, "no enforced
markdown structure", reads `* Status:` / `* Date:` / `* Deciders:` (or `Decision makers:`) list items under
the title for its own MADR 2.x dialect, OR MADR 3/4 YAML front matter directly
(useinkan.dev/cli/adr/0006-import-from-log4brains-madr-and-adr-tools.md, a third-party importer's dialect
table, consulted for the field-name mapping since log4brains' own docs do not table it directly). npm
`log4brains@1.1.0` installs without Docker (`npm view log4brains version`, verified).

## adrkit (fetched 2026-11-05)
Repo: https://github.com/mbeacom/adrkit (Apache-2.0, matches "7 Build vs take.md" D71's "2.6k MADR / 22
Apache" sourcing for the `affects` field). Docs: https://adrkit.dev/quickstart, https://adrkit.dev/backfill,
https://adrkit.dev/. npm `@adrkit/cli@0.20.0` installs without Docker (verified). adrkit treats a record as
"typed data with a markdown body" and adds one field, `affects`, naming what the decision governs: a list of
`{ type: path|package|api|resource|entity|data, pattern: <glob> }`. Required fields for `adr lint`: `id`
(4+-digit numeric or ULID), `title`, `status`, `date`. `adr migrate --from madr --dir DIR [--dry-run]`
"reads common MADR and Nygard status forms ... is additive and in place ... idempotent" (adrkit.dev/backfill).

## Interop test (this task, 2026-11-05)
scratch/mole-build/t100-adrkit-interop/repo: `mole init` (T100 build) wrote a MADR 4 + `affects` + `rules:`
file; copied to `docs/adr/0001-example-decision.md` (adrkit's own `NNNN-slug.md` convention).
- `npx @adrkit/cli@0.20.0 lint --dir docs/adr` on the UNMIGRATED file: 4 errors --
  `accepted-requires-decider-unless-imported` (deciders empty), `invalid-format` on `id`
  (`D001-example-decision` doesn't match adrkit's `^([0-9]{4,}|ULID)$`), `strict-unknown-key` on
  `decision-makers` and on `rules` (adrkit's strict schema doesn't know either key).
- `npx @adrkit/cli@0.20.0 migrate --from madr --dir docs/adr` (no `--dry-run`, applied): summary "migrated 1,
  updated 0, unchanged 0, diverged 0, skipped 0". Resulting file: `id: "0001"` (from the filename, not
  Mole's `D001-...`), `title`/`status`/`date` carried over correctly, `affects:` carried over with the same
  `type`/`pattern` plus adrkit's own `negate: false` added, but `deciders: []` (empty, despite
  `decision-makers: [your-name]` being present in the source -- adrkit's own `madr` importer reads the
  legacy `deciders:` key, not MADR 4's renamed `decision-makers:`), and Mole's `rules:` block is gone
  entirely from the migrated file (adrkit's schema has no such field; migrate does not preserve unknown
  keys). Full before/after text: this file's directory is not committed (scratch), command transcript above
  is the evidence; docs/decisions-and-rules.md "MADR 4 and adrkit compatibility" section states the same
  three gaps for a reader.
