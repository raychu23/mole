# T78 prior art — door inference reliability check (required before building assurance)

## 1. How Mole currently handles one-way vs two-way doors — there is no inference

Grep for `door` in `packages/decisions` (2026-11-03):

- `packages/decisions/src/types.ts:65` — `door?: string` on `GraphNode`. A free-text passthrough field, no enum, no validation.
- `packages/decisions/src/graph.ts:244` — `door: str(f.get('door'))` inside `loadMoleDecisions()`. This reads the literal `door:` YAML front-matter key from a `.mole/decisions/*.md` record and copies the string straight onto the node. Nothing computes, scores, or guesses it.
- `packages/decisions/src/graph.ts:489` — the plain-ADR-folder loader (`loadAdrDir`, the path used for `--adr-dir`, i.e. the vendored real corpora) builds its `GraphNode` **without a `door` field at all**. Backstage/Nygard/MADR/KEP records never carry `door`, inferred or otherwise.
- No file under `packages/decisions/src/compile`, `src/rules`, `src/check`, `src/route`, `src/cascade`, `src/recall`, or `src/tree` mentions `door`, `one-way`, `two-way`, `reversib*`, or any heuristic keyword list.
- T46 (`tasks/T46-decision-check-compiler`, F39 in the inventory) is the "decision check compiler" — it compiles objections/why-answers (`mole_compile_draft`, `mole_compile_review`, `mole_cascade_check`); its own contract and code never touch door classification.
- Inventory (`context/product-plan/systems/full-build/inventory 11-02.json` F39, F67) already flags this precisely: F67's `stop_condition` is "If one-way-door classification (F39) itself isn't reliable yet, don't scope assurance fields to it — fix door inference first" — and F39's own description is the compiler pass, not a classifier.

**Conclusion: there is no door inference to measure.** `door` is a human-authored, opt-in front-matter string that only exists for Mole's own record format, and the vendored benches (m22 overlay fixtures) show it being set by hand (`door: two-way` in `adr003..adr014` test fixtures) or by the m21 generator (which always writes `door: two-way` as its planted default) — never derived from content.

## 2. Does the field exist on real ADRs at all?

```
$ grep -rl 'door' packages/decisions/bench/corpora        # real vendored corpora
(0 matches)
$ grep -rl 'door' packages/decisions/bench/corpora | wc -l
0
```

0 of 146 real markdown files across `m29-adrtools`, `m29-madr`, `m29-speckit`, `govuk-aws`, `backstage`, `mole` carry a `door` field of any kind (checked 2026-11-03). The only files anywhere in the repo with `door:` front matter are synthetic test fixtures (`bench/m22/overlay/.mole/decisions/adr0*.md`, `bench/m22-key.json`, `bench/m21.ts`'s generator) — none of them real-world ADRs.

## 3. Hand-labelled sample, 21 real ADRs, with reasons (Bezos reversibility test: cost/effort/scope to reverse, lock-in, external dependents)

Primary source for the test itself: Bezos 2015 Amazon shareholder letter (reproduced in multiple secondary write-ups, e.g. https://www.businessinsider.com/jeff-bezos-on-type-1-and-type-2-decisions-2016-4, original filed with SEC 2016-04-06 as exhibit 99.1 to 8-K, https://www.sec.gov/Archives/edgar/data/1018724/000119312516530910/d168744dex991.htm) — "Some decisions are consequential and irreversible or nearly irreversible — one-way doors... most decisions aren't like that — they are changeable, reversible — they're two-way doors."

| # | Record | Door | Reason |
|---|---|---|---|
| 1 | backstage adr002 default-catalog-file-format | one-way | Public schema consumed by hand-authored YAML files across many repos; changing it breaks every existing descriptor file already committed by users. |
| 2 | backstage adr003 avoid-default-exports | two-way | Pure coding-style convention, mechanically reversible file-by-file with a codemod, no external contract. |
| 3 | backstage adr005 catalog-core-entities | two-way | Doc itself: "This can later be extended to APIs, Resources..." — explicitly staged/incremental, not locked in. |
| 4 | backstage adr009 entity-references | one-way | Textual reference syntax used in URLs and hand-written YAML by end users; a public wire format, costly to change once adopted. |
| 5 | backstage adr010 use-luxon | two-way | Encapsulated library choice behind imports; empirically reversed later in the same corpus (adr013/adr014 swap fetch libraries the same way). |
| 6 | govuk-aws 0002 hosting-platforms | one-way | Full infrastructure migration to AWS as the org's hosting provider; consequences doc: "migrate our infrastructure... in the near-term" — large sunk cost to reverse. |
| 7 | govuk-aws 0005 terraform-module-location | two-way | Doc: "Once we feel our modules 'ready' we will consider moving them" — explicit staged reversible plan. |
| 8 | govuk-aws 0018 use-rds-instead-of-ec2-db | one-way | Production database migration with a new permanent ops class ("db_admin"); reversing means re-provisioning and re-migrating live data. |
| 9 | govuk-aws 0022 remove-elasticsearch-proxy | two-way | Config/puppet cleanup; consequences admit it's a "slight difference," trivially redeployable. |
| 10 | govuk-aws 0038 mongo-to-documentdb | one-way | Live data migration with auth, cert and FQDN changes called out as consequences; re-created clusters get new FQDNs that must re-propagate — expensive to reverse. |
| 11 | m29-adrtools 0002 implement-as-shell-scripts | two-way | Internal tool implementation; consequences note only "won't support Windows" — rewrite cost, no external lock-in. |
| 12 | m29-adrtools 0004 markdown-format | two-way | Storage format for the team's own text records; reformattable without external dependents. |
| 13 | m29-adrtools 0008 iso-8601-dates | two-way | Doc explicitly offers a reversible migration path ("accept mixed formatting" or run `adr upgrade-repository`). |
| 14 | m29-madr 0001 dual-license-cc0-mit | one-way | Content already published under a license grant cannot be un-licensed for prior recipients — classic irreversible legal decision. |
| 15 | m29-madr 0005 dashes-in-filenames | two-way | Cosmetic file-naming convention, reversible via rename. |
| 16 | m29-madr 0013 yaml-front-matter | two-way | Internal metadata format, reversible via reformat, no external contract. |
| 17 | govuk-aws 0023 separate-data-repository | two-way | Internal repo split for secrets management; reversible by merging back, no external dependents. |
| 18 | govuk-aws 0026 remove-load-balancer-tier | two-way | Consequences doc explicitly says they'll run "more ELBs... for a period of time" — an incremental, reversible infra change. |
| 19 | govuk-aws 0033 ip-ranges | one-way | Changes VPN-peered IP ranges with an external party (Carrenza); reversing requires re-coordinating live cross-org VPNs, and the doc shows it already superseded an earlier ADR for the same reason. |
| 20 | backstage adr006 avoid-react-fc | two-way | Coding-style convention, codemod-reversible, "we will gradually remove" per the doc. |
| 21 | backstage adr011 plugin-package-structure | two-way | Doc explicitly: "If additional packages are required, we will revisit this decision and extend the pattern" — self-declared revisable. |

(Full text of each ADR read from `packages/decisions/bench/corpora/**`, 2026-11-03; reasons above are the actual basis for each label, not a template.)

## 4. Conclusion / stop condition triggered

There is nothing to measure "agreement" against: Mole has **zero lines of door-classification code**, and real ADRs carry **zero door fields** (0/146). The task's stop condition ("if agreement < 80%, scope assurance to an explicit `door: one-way` front-matter field instead") is triggered trivially and by the strongest possible margin — not "below 80%" but "undefined, because nothing exists to infer it." This matches the inventory's own pre-registered stop condition for F67.

**Decision: assurance fields are scoped to an explicit, human-authored `door: one-way` front-matter field only.** No classifier, heuristic, or model call infers door-ness. A record with no `door: one-way` field is simply outside assurance's scope (not an error, not assumed two-way by any new code path).

## 5. Sources for the field vocabulary (primary, fetched/dated 2026-11-03)

1. **FDA, "Data Integrity and Compliance With Drug CGMP — Questions and Answers Guidance for Industry," Dec 2018** (https://www.fda.gov/media/119267/download). §III.1.a: "data integrity refers to the completeness, consistency, and accuracy of data. Complete, consistent, and accurate data should be attributable, legible, contemporaneously recorded, original or a true copy, and accurate (ALCOA)."
2. **MHRA, "'GXP' Data Integrity Guidance and Definitions," Revision 1, March 2018** (https://assets.publishing.service.gov.uk/media/5aa2b9ede5274a3e391e37f3/MHRA_GxP_data_integrity_guide_March_edited_Final.pdf). Glossary: "ALCOA+ — Acronym referring to Attributable, Legible, Contemporaneous, Original and Accurate 'plus' Complete, Consistent, Enduring, and Available." This is the exact 9-attribute set T78 records per link.
3. **Modgil, S. & Prakken, H., "The ASPIC+ framework for structured argumentation: a tutorial," Argument & Computation, 2014** (https://doi.org/10.1080/19462166.2013.869766; working paper https://webspace.science.uu.nl/~prakk101/pubs/comma12reb.pdf). §3.3.1: "arguments can be attacked on a conclusion of a defeasible inference (rebutting attack), on a defeasible inference step itself (undercutting attack), or on an ordinary premise (undermining attack)." Same reading Mole's own `types.ts` already cites for `EdgeType`'s `undercuts` (ASPIC+/Pollock, not Carneades).
4. **Bezos, J., 2015 Amazon shareholder letter**, filed as Exhibit 99.1 to an 8-K, 2016-04-06 (https://www.sec.gov/Archives/edgar/data/1018724/000119312516530910/d168744dex991.htm): "Some decisions are consequential and irreversible or nearly irreversible — one-way doors... most decisions aren't like that — they are changeable, reversible — they're two-way doors." Source of the `door: one-way|two-way` vocabulary this field reuses verbatim (already Mole's convention in `types.ts:65`).

## 6. What this task does NOT do (boundary)

- Does not add any door classifier, keyword heuristic, or model call.
- Does not change `loadAdrDir` (plain ADR folders stay without a `door` field — consistent with finding #2).
- Does not retrofit `door` onto real corpus records; the hand-labelled table above is evidence for this prior-art note, not a write into the corpora.
