# T71 frozen eval set — build record

Built 2026-11-03, before any scoring. File: `context/product-plan/systems/metrics-proof/case-recall/eval-set.json`
sha256 (written before scoring, see `eval-set.sha256`):
`06074cff2be6492d900eb8afdcf31bc3ca1c3ae82a0131811cac96f659ac30dc`

## Corpus
53 real ADR documents (title/index/template files excluded), from two public ADR corpora already vendored in
this repo for T53/T56 benchmarking:
- `packages/decisions/bench/corpora/govuk-aws/docs/architecture/decisions/*.md` (GOV.UK AWS migration ADRs, Nygard format)
- `packages/decisions/bench/corpora/backstage/docs/architecture-decisions/*.md` (Backstage ADRs)

## Relevance labels (superseded/related ADR pairs) — exhaustive, not sampled
Grepped both corpora for `superseded by|supersedes|in part supersedes|partly superseded` (case-insensitive) and
hand-read every hit. This is the full set found — 3 pairs, no others exist in either corpus:

1. `backstage/adr014-use-fetch.md` → `backstage/adr013-use-node-fetch.md`
   (adr013: "This ADR has been superseded by [ADR014](./adr014-use-fetch.md) and no longer applies.")
2. `govuk-aws/0015-dns-infrastructure.md` → `govuk-aws/0004-dns-definitions-for-hosts-and-services.md`
   (0004: "## Status / Superseded by [DNS Infrastructure](0015-dns-infrastructure.md)")
3. `govuk-aws/0033-ip-ranges.md` → `govuk-aws/0003-aws-networking-outline.md`
   (0003: "**These IP ranges have been superseded by [ADR #0033](0033-ip-ranges.md).**"; 0033: "This ADR in
   part supersedes [0003]")

A "related" (non-superseded) link convention was also grepped for (`related\b` outside "unrelated") across both
corpora — no ADR-to-ADR relation hits, only prose uses of the word "related". So the frozen set's only
relevance signal is the superseded/supersedes relation, exactly as the ledger task names it.

**Limit (stated plainly, not glossed over)**: 3 pairs is a very small frozen eval set. It is the complete set of
real relevance labels available in the two ADR corpora already in this repo — not a convenience subsample. A
larger set would need either more vendored ADR corpora with explicit supersede links, or treating a weaker
signal (e.g. ADRs on the same topic without an explicit supersede link) as "related", which the task did not
ask for and which would require inventing a method not grounded in the source text.

## Split (frozen before scoring)
Deterministic, not cherry-picked after seeing scores: pairs sorted alphabetically by query doc id.
- dev (2 pairs, alpha-tuning the one custom-matcher parameter below): `backstage/adr014-use-fetch.md`,
  `govuk-aws/0015-dns-infrastructure.md`
- held-out (1 pair, scored exactly once, after the split and the eval file were frozen): `govuk-aws/0033-ip-ranges.md`

This ordering was chosen before any scoring ran, specifically to avoid picking whichever single pair happens to
look best for the custom matcher after the fact.
