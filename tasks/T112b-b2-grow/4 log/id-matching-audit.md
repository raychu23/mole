# T53 harness id-matching bug -- audit across all 13 repos (v3, v4.2, v4.3)

Dated 2026-11-08. Scope: part (1) of the id-matching-bug task (B2 v4.3, `results-v4.3.md` loss
#2). Audits the T53 arm runner's post-hoc id-match step (NOT `loadGraph`/`cascadeCheck`
themselves, which are unaffected) across every repo this bench has ever scored T53 on.

## The bug (as reported, confirmed)

`run_t53_semantic_route_v4_3.mjs` (inherited unmodified from v4.2's own script, which in turn
inherited it from earlier versions):

```js
const ourAdrNum = c.adr_id === 'none' ? null : c.adr_id.split('-').pop();
const target = verdicts.find((v) => v.decision === ourAdrNum || v.decision === c.adr_id);
```

This assumes one of two things always holds: (a) the case's own id convention is
`<prefix>-<zero-padded-number>` and `loadGraph`'s loaded id is the bare zero-padded number, or (b)
the loaded id is already byte-identical to the case's own `adr_id`. `email-alert-api`'s ADR files
are named `adr-NNN-title.md`; `loadGraph`'s `idOfName()` (`packages/decisions/src/graph.ts:404`)
derives `adrNNN` from that (letter prefix glued to the digits, NO dash). The case's own id is
`eaa-NNNN`. Neither (a) nor (b) holds: `ourAdrNum` strips to `'NNNN'` (zero-padded), which equals
neither `adrNNN` nor `eaa-NNNN`. Confirmed: **all 10** of email-alert-api's adr-bearing v4.3 cases
were match-impossible under the old matcher (zero were ever scorable as a hit against the right
decision, regardless of what the router or escalation tier actually decided).

## Method

For each repo, used the already-recorded T53 run output's `routing` field (the loaded decision ids
`loadGraph` actually produced, observed per-case) as that repo's loaded-id universe, and checked,
for every adr-bearing case, whether ANY id in that universe satisfies (a) the OLD matcher
(`===ourAdrNum` or `===adr_id`) and (b) the NEW matcher (`normalizeAdrId(loaded) ===
normalizeAdrId(adr_id)`, strip leading letters/dashes/underscores then leading zeros). This is
independent of whether the router actually routed to the right id for a given case (that's
`routedCorrectly`, a separate pre-existing field) -- it answers "could this case's id EVER match,
in principle, given what this repo's loader actually calls its decisions", repo by repo.
Script: `/Users/a1/.hermes/cache/scratch/m2v43/audit_id_matching.py` (scratch, not committed).

## Results (old-matcher-impossible count -> new-matcher-impossible count, per repo)

| version | repo | n adr-bearing cases | OLD impossible | NEW impossible | verdict |
|---|---|---|---|---|---|
| v4.3 | semantic-kernel | 16 | 4 | 4 | unaffected -- genuine router misses (see below) |
| v4.3 | jaeger | 14 | 0 | 0 | unaffected |
| v4.3 | content-publisher | 28 | 0 | 0 | unaffected |
| v4.3 | **email-alert-api** | 10 | **10** | **0** | **THE BUG -- fully fixed by the normalizer** |
| v4.2 | claw-operator | 22 | 2 | 2 | unaffected -- genuine router misses |
| v4.2 | handbook | 6 | 0 | 0 | unaffected |
| v4.2 | hmrc-frontend | 4 | 0 | 0 | unaffected |
| v4.2 | merino-py | -- (0 heldout cases; disclosed in protocol_v4.2.md: no untouched ADRs left) | -- | -- | n/a |
| v3 | backstage | 2 | 0 | 0 | unaffected (id already `adrNNN` both sides) |
| v3 | log4brains | 4 | 2 | 2 | unaffected -- genuine router misses (non-numeric slug ids) |
| v3 | python-tuf | 2 | 0 | 0 | unaffected (prefix kept on both sides: `tuf-0010`) |
| v3 | powertools-python | 8 | 0 | 0 | unaffected (prefix kept on both sides: `pt-0001`) |
| v3 | easi-app | 43 | 1 | 1 | unaffected -- genuine router miss |

**email-alert-api is the ONLY repo, across all 13 ever scored, where the id-matching bug caused a
real scoring error.** No regressions: re-ran the same audit checking the REVERSE direction (any
case where the OLD matcher succeeded but the NEW normalizer fails) across all 13 repos -- empty in
every repo. The normalizer is a strict superset fix (fixes the broken case, breaks nothing already
working).

## The "impossible both ways" cases (sk x4, claw-operator x2, log4brains x2, easi-app x1): routing, not id-format

For these 9 cases (4 repos), the true decision id never appears in ANY case's `routing` list for
that repo -- i.e. the semantic router never surfaced it for ANY case that references it, under
either the old OR the new matcher. This is a genuine ROUTING failure (or, for 2 of sk's 4, a
corpus-exclusion: the decision may be filtered by `cascadeCheck`'s own
`['superseded','deprecated','rejected','retired']` status exclusion), not a second instance of the
id-format bug. Verified by hand for semantic-kernel (the repo named explicitly in the task): of
sk's 5 false negatives, all 5 have `routedCorrectly=False` under BOTH matchers (ids `sk-0022`,
`sk-0009`, `sk-0026`, `sk-0043`, `sk-0011`) -- the router's own top-5 pick never contains the
right decision for any of them, regardless of id normalization. **Answer to the task's explicit
question: semantic-kernel's 0.375 T53 recall is a ROUTING issue, not an id/format issue** -- the
normalizer fix changes zero semantic-kernel numbers (confirmed: old=new=4 impossible, identical
case set).

## RAG / Reviewer / Judge: NOT affected

`run_arms_v4_3.py` (Reviewer, RAG) and `baselines/run_judge_arm_v4_3.py` (Judge) score
`predictedViolate` purely by regexing `VERDICT: VIOLATES`/`VERDICT: COMPLIANT` out of the model's
free-text response (`parse_verdict()`). They record `picked_adr`/`named_adr` for diagnostic
purposes only -- that field is NEVER used in the scoring logic. These 3 arms have no id-matching
step at all, so the T53 harness bug does not touch them in any way.

## Escalation verdict computed or skipped?

Computed, not skipped. `cascadeCheck()` runs the full escalation tier (`verdicts` array,
containing `{decision, flag, tier}` for every candidate the router routed to) regardless of the
runner's OWN post-hoc id-match step -- the bug is entirely in the SCORING code that reads
`verdicts` afterward, not in the check itself. This means the correct verdict almost always
EXISTED in the raw `r.verdicts` the first time cascadeCheck ran; the bug just failed to look it up.
However, the original run script only persisted the DERIVED summary row (`predictedViolate`,
`decidingTier`, `routing` ids) to disk, not the raw `verdicts` array itself -- so there was no way
to re-score from the already-saved JSON without re-running `cascadeCheck`. Per the task's
instruction ("if the runner skipped escalation ... otherwise re-score from raw outputs"): since
raw per-verdict output was NOT persisted, the only option was option (3)'s re-run path: re-run
T53 ONLY on the 10 affected email-alert-api cases, with the SAME frozen params (k5 m0 c1.01,
claude-haiku-4-5 router) and the fixed id-match step. See `run/run_t53_v4_3_CORRECTION_eaa.mjs`
and `analysis_v4_3_CORRECTION.py`.
