# T71 frozen eval set — build record

## v1 (SUPERSEDED 2026-11-03, see review-1 fix below — kept for history, not deleted)

Built 2026-11-03, before any scoring. File: `context/product-plan/systems/metrics-proof/case-recall/eval-set.json`
sha256 (written before scoring, see `eval-set.sha256`):
`06074cff2be6492d900eb8afdcf31bc3ca1c3ae82a0131811cac96f659ac30dc`

### Corpus (v1 — incomplete, see review-1 fix)
53 real ADR documents (title/index/template files excluded), from two public ADR corpora already vendored in
this repo for T53/T56 benchmarking:
- `packages/decisions/bench/corpora/govuk-aws/docs/architecture/decisions/*.md` (GOV.UK AWS migration ADRs, Nygard format)
- `packages/decisions/bench/corpora/backstage/docs/architecture-decisions/*.md` (Backstage ADRs)

### Relevance labels (v1 — WRONG, not actually exhaustive; corrected by review-1, see below)
v1 claimed "exhaustive, not sampled" for a hand-grep of `superseded by|supersedes|in part supersedes|partly
superseded` across only 2 corpora. Review-1 (2026-11-03) found this claim false: it missed real Amends/
Amended-by pairs in those same two corpora (the grep pattern never included "amend"), missed the same relation
in a corpus it never touched (m29-adrtools), never used m29-madr or m29-speckit (both already vendored in this
repo), and never used the `.mole-format` corpora under `bench/m24*` where same-scope pairs exist. "Exhaustively
grepped" was true of the narrow pattern used, over the narrow corpus set used — it was not exhaustive over
every relation Mole models, over every vendored corpus. See "eval-set-v2 build report" below for the fix.

### Split (v1, frozen before scoring)
Deterministic, not cherry-picked after seeing scores: pairs sorted alphabetically by query doc id.
- dev (2 pairs, alpha-tuning the one custom-matcher parameter below): `backstage/adr014-use-fetch.md`,
  `govuk-aws/0015-dns-infrastructure.md`
- held-out (1 pair, scored exactly once, after the split and the eval file were frozen): `govuk-aws/0033-ip-ranges.md`

This ordering was chosen before any scoring ran, specifically to avoid picking whichever single pair happens to
look best for the custom matcher after the fact.

## v2 (review-1 fix, current) — rebuilt from every relation Mole itself models, across every vendored corpus

Built and scored 2026-11-03 by `packages/decisions/bench/t71-eval-build.ts`, reusing the SHIPPED `loadGraph`
(packages/decisions/src/graph.ts) unmodified, across every corpus the review finding named:
`bench/corpora/{govuk-aws,backstage,m29-adrtools,m29-madr,m29-speckit}` and `bench/{m24,m24v2}/{govuk-infrastructure,backstage}`.
(`bench/corpora/mole` is Mole's own source tree, not a decision corpus, and is not a relevance source. The
`*-<hash>` corpora variants are parent/child diff fixtures for a different benchmark (T56) — the same corpus
content as govuk-aws/backstage, so including them would double-count the same links already counted once;
read for sanity only, not added.)

Two relevance signals, kept separate and separately scored (never merged into one number):
- **strong**: an authored relation edge between two case records -- every `EdgeType` graph.ts models that is a
  decision/incident-to-decision/incident link (`supersedes`, `amends`, `overrides`, `conflicts_with`,
  `alternative_to`, `subsumes`, `cites`, `traces_to`, `evidence_for`), taken from loadGraph's own edges, PLUS a
  supplementary full-text scan (same script, not graph.ts) for the same relation vocabulary written in a
  phrasing graph.ts's line-anchored ADR_RELATIONS regex does not catch (mid-sentence "**...have been superseded
  by [ADR #0033]**", hedged "This ADR in part supersedes [0003]") -- graph.ts itself is unmodified; this scan
  exists only to build honest gold labels, not as a second production parser.
- **weak**: two decision nodes in the same `.mole-format` corpus whose `scope:` front matter shares at least
  one anchor target (same file/dir) -- no authored relation, a materially weaker signal, reported and scored
  separately per the review finding.

```
## eval-set-v2 build report (review-1 fix, rebuilt from every modeled relation, not a 2-corpus grep sample)

Corpora loaded (via the SHIPPED loadGraph, unmodified): govuk-aws, backstage, m29-adrtools, m29-madr, m29-speckit, m24-govuk-infrastructure, m24-backstage, m24v2-govuk-infrastructure, m24v2-backstage
Total case-record docs in corpus pool: 173

Strong signal (authored relation edge between two case records): 7 pairs
  - amends: 2
  - supersedes: 5

Weak signal (same-scope, no authored relation): 11 pairs

Split (frozen before scoring, 70/30 by corpus+query+relevant, strong/weak split independently): dev=13, held_out=5
sha256 (eval-set-v2.json, written before any scoring): bc52bf619d5428fae81e6983f9f997bf9972ebb3b3312fa37c116cb582dc9012
```

m29-speckit contributes 0 pairs: it was loaded (loadSpecKit's own `## D-NNN:` research-block importer ran over
it) but its decisions carry no supersede/amends/overrides/etc. vocabulary and no `scope:` overlap in this
particular feature folder — checked, not skipped, zero is the honest count, not an omission.

**Limit (stated plainly): 7 strong + 11 weak = 18 pairs total, split 13 dev / 5 held-out (2 strong + 3 weak).**
This is the complete set of real relevance labels loadGraph's own relation model finds (plus the two
text-scan-only phrasings) across every vendored corpus named in the review — not a convenience subsample, and
materially larger / broader than v1's 3 pairs from 2 corpora. It is still a small-n held-out set; see
results.md's Wilson-CI caveat for why that result is reported as directional, not a strong statistical claim.

