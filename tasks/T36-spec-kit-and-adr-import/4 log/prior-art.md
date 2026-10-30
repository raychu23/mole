# T36 prior art (R0)

Read before writing any importer code. >=5 real, fetched sources, URL + fetch date.

1. **github/spec-kit** (github.com/github/spec-kit) -- the GitHub spec-kit project itself: `.specify/memory/constitution.md`,
   `specs/NNN-feature/{spec,plan,research,tasks}.md`, templates under `.specify/templates/`. Fetched 2026-10-29 via GitHub
   search + raw file fetch of `templates/constitution-template.md` and `docs/quickstart.md`. Confirms: constitution has a
   `## Core Principles` section with `### [NAME]` headings and a `**Version**: X | **Ratified**: D | **Last Amended**: D`
   trailer; a feature folder is `specs/NNN-slug/` with `spec.md` (Status/Created/Feature Branch header fields), `plan.md`,
   `research.md`; active feature tracked by `.specify/feature.json` (not used by this importer -- the importer scans every
   `specs/*` folder, not just the "active" one, since Mole's flags should cover every recorded feature, not just the one
   currently open).
2. **MADR** (adr.github.io/madr, github.com/adr/madr) -- the Markdown Architectural Decision Records format spec. Fetched
   2026-10-29. MADR 3.0/4.0 moved metadata (status, date, deciders, consulted, informed) into YAML front matter instead of
   a body "## Status" section; MADR's own repo (see #4 below) in fact mostly omits that front matter and instead uses
   `parent`/`nav_order` (Jekyll site keys) with no status at all -- real-world MADR usage is messier than the spec, which
   is exactly why the key (below) is hand-read from the real files, not inferred from the spec.
3. **npryce/adr-tools** (github.com/npryce/adr-tools) -- the reference CLI for the Nygard/"adr-tools" ADR format: `adr init`,
   `adr new`, `adr new -s N` (supersedes). Fetched 2026-10-29 (README + `doc/adr/*.md`). Confirms the classic Nygard
   template: `# N. Title`, a body `Date: YYYY-MM-DD` line, then `## Status` / `## Context` / `## Decision` /
   `## Consequences`; Mole's graph.ts (T29) already parses the `## Status` section and relation lines -- this task adds the
   `Date:` line (not previously captured) since M29a scores a date field for this format.
4. **adr/madr @ docs/decisions/** (github.com/adr/madr, develop branch) -- MADR's own decision log, used verbatim (pinned
   sha, see bench/m29-key.json) as one of the 3 hand-labeled corpora. Fetched 2026-10-29 (19 decision files via GitHub
   contents + raw API). Real-world finding: only 1 of 19 files (`0003-provide-own-madr-tools.md`) carries a front-matter
   `status:` key at all ("on hold", not one of MADR's five canonical statuses) -- graph.ts's existing `normStatus` maps it
   to `unknown`, which is correct (flagging an unrecognized status, not silently accepting it, per the T29 P2-1 review fix).
5. **Kubernetes Enhancement Proposals (KEP)** (github.com/kubernetes/enhancements, `keps/NNNN-kep-template/{kep.yaml,README.md}`).
   Fetched 2026-10-29 (raw `kep.yaml` + `README.md` templates). Confirms KEPs keep `status` (`provisional|implementable|
   implemented|deferred|rejected|withdrawn|replaced`) and `replaces` (a list of other KEP paths, e.g.
   `/keps/sig-ccc/3456-replaced-kep`) in a **separate `kep.yaml`** sibling file next to the record's `README.md`, not in the
   README's own front matter (which KEPs don't use) -- a materially different storage location from MADR's inline front
   matter, so the importer reads a `kep.yaml` sibling when present and lets it override the markdown's own fields.
6. **log4brains** (github.com/thomvaill/log4brains) -- "no enforced markdown structure" ADR tool shipping MADR as its
   default template, metadata "automatically guessed from its raw text and git logs". Fetched 2026-10-29 (README). Confirms
   log4brains itself does not introduce a new on-disk format Mole needs to special-case: it is MADR/Nygard files in a
   folder, which graph.ts's existing ADR-folder loader (+ this task's front-matter patch) already covers; no separate
   log4brains importer is needed, logged here so that choice is visible rather than silently assumed.
7. **Backstage ADR plugin** (github.com/backstage/backstage, `plugins/adr/README.md`; and the community-plugins fork).
   Already used as one of M21's bench corpora (T29); re-read 2026-10-29 to confirm it parses MADR 2.x/3.x plus a
   `:::note[Superseded]` callout and a `backstage.io/adr-location` catalog annotation -- both already covered by graph.ts's
   existing `loadAdrDir` (format `'backstage'`), so no new work needed for Backstage specifically in this task.

## 3 repos picked for the hand-labeled key (M29a/M29b), pinned shas

| # | repo | sha | fetched | why |
|---|---|---|---|---|
| 1 | github.com/mnriem/spec-kit-spring-react-demo | 8ec8841a66c80b284d0053ba5f236154471bf5e2 | 2026-10-29 | a real project actually scaffolded and built with GitHub spec-kit's own `.specify`/`specs` layout (not a toy fixture): has a real `.specify/memory/constitution.md` (4 principles) and `specs/001-llm-perf-analytics/{spec,plan,research}.md` (14 D-NNN decisions), with real committed code paths (`frontend/`, `src/main/resources/db/migration/`) the decisions name, so anchoring can be checked against real code, not invented paths. |
| 2 | github.com/adr/madr (develop) | ba75bb1b20d42af5746b246ad348c202419ae681 | 2026-10-29 | MADR's own `docs/decisions/` -- the canonical real-world MADR corpus (19 records), already surfaced the front-matter-status gap above. |
| 3 | github.com/npryce/adr-tools (master) | b3279baf9be2207d1a4f4bbd608fd0b591c72aee | 2026-10-29 | adr-tools' own `doc/adr/` -- the canonical real-world Nygard corpus (9 records), surfaced the missing `Date:` field capture. |

(KEP + malformed-front-matter are covered by dedicated unit tests with small synthetic fixtures, `packages/decisions/test/import-t36.test.ts`,
since none of the 3 picked repos happen to use the KEP format or ship a broken-YAML record -- a 4th/5th public repo search for a
real, intentionally-broken-front-matter ADR file turned up nothing usable (nobody commits a file they know is broken), so this is
labelled an INFERENCE-from-spec case per the prior-art-first skill, not a 4th hand-labeled corpus.)
