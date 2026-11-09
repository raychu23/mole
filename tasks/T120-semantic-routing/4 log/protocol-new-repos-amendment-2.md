# T120 — Amendment 2 to protocol-new-repos.md: harness correction + case-set rejection and rebuild

**Status: FROZEN before any case in this document's own rebuild is constructed (see
`4 log/amendment-2.sha256` for this file's own sha256, added immediately after this file is
written and before any new case-building code runs).**

This amendment corrects two defects found on review of the run committed under Amendment 1
(`ledger/t120b-new-repo-eval`, commit `a7b746c`, `4 log/results-new-repos.md`): a harness
definition bug in Amendment 1 itself (section 1 below), and a REJECTED case set (section 2
below), per `constructed-benchmark-leak-gates`'s own gate contract ("a failing gate REJECTS the
set; never run arms on it"). Protocol text and Amendment 1 are unchanged by this file (ADDs,
never edits); `protocol-new-repos.md` stays frozen at `4fdb3e5e7a30c84c6269948206ff5c7d71c1a234`,
Amendment 1 at its own frozen sha256.

## 1. Harness correction: Amendment 1's "T53-baseline" arm definition contradicted B2 v4.3

Amendment 1 section (c) arm 1 defined `T53-baseline` as `cascadeCheck` with `semanticRoute`
**OMITTED ENTIRELY** (pre-T120 T49 scope/content-anchor-only routing). Running that definition
produced **0/23 recall and 0/18 false alarms** (`4 log/new-repos-data/arm_A_t53_baseline.json`:
every one of the 64 cases shows `governed=0 pred=false`, with ZERO exceptions, independent of
label) -- no signal in either direction.

This contradicts B2 v4.3's own measured result: `T53` (the semantic-routing feature) scored
**0.667 recall on foreign ADRs** in `v4.3/run/run_t53_semantic_route_v4_3.mjs`'s own held-out run
(`t53_semantic_route_v4_3_heldout_claude-haiku-4-5_k5_m0_c1.01_CORRECTED.json`). Reading that
script line-by-line (`run_t53_semantic_route_v4_3.mjs:82-86`): it ALWAYS calls `cascadeCheck` with
`semanticRoute: { decisions, topK: 5, minScore: 0, confidenceRatio: 1.01, llm: routeLlm }`
configured -- "T53" in that script's own name and every B2 version since v2 refers to the
semantic-routing feature itself (BM25 + haiku stage-2 router), never a no-routing control. Amendment
1 misnamed its own control arm: it called T49's PRE-T53 routing (scope/content anchors only, zero
BM25) "`T53-baseline`", which is not what any B2 version has ever measured as "T53".

**Root cause of the 0/0**: `feast-dev/feast`'s and `pledger-io/android-app`'s real ADRs (both
confirmed via Amendment 1's own `loadGraph` gate) carry **no authored `scope:` anchors** (neither
repo's ADR frontmatter declares one) and no `match:`/`rule:`/export-convention content anchors
either -- real-world ADR prose, not Mole's own authored-anchor convention. With `semanticRoute`
omitted, `cascadeCheck`'s `pr.governed` list (T49's zero-LLM routing) is empty for every single
case, by construction, regardless of the diff's content or label. This is not a crash or a
silent-drop bug; it is Amendment 1's own arm definition asking for a check that structurally
cannot find anything on either of these two repos -- the fix is correcting what "T53-baseline"
means, not a code fix.

**Correction**: `T53-baseline` (arm 1) is redefined to match `run_t53_semantic_route_v4_3.mjs`
exactly: `cascadeCheck` with `semanticRoute: { decisions, topK: 5, minScore: 0,
confidenceRatio: 1.01, llm: <claude-haiku-4-5> }` configured, **`embedBoost` absent/off**. `T53+
embedBoost` (arm 2) is the same call with `semanticRoute.embedBoost: true` and
`semanticRoute.embedder` set to the real, now-wired MiniLM adapter (`ledger/t120c-wire-embed`,
`packages/decisions/src/cascade/embedder-minilm.ts`, `all-MiniLM-L6-v2`, local, no paid API) --
previously (Amendment 1's run) this arm computed embeddings out-of-band and called
`routeDecisions` directly (bypassing `cascadeCheck`/the real `--embed-route` CLI path entirely,
the PRODUCT GAP a parallel task fixed); this re-run uses the real wired `cascadeCheck` call, the
same code path `mole cascade-check --embed-route` itself takes. Arm 3 (`RAG-reads-all`) is
unchanged. Amendment 1's decision rule (section (d)) is unchanged: it is written against
baseline-vs-embedBoost deltas, which this correction does not touch.

## 2. Gate rejection: the no-context LLM gate FAILED on the violate class

Per `constructed-benchmark-leak-gates`: "no-context LLM: sees only the case (+ path + repo), not
the rule/decision -> each class within its own chance CI" and "a gate before labels ... every one
of these on held-out, PER CLASS ... a gate failure REJECTS the set".

Result on the 64-case set built under Amendment 1 (`4 log/new-repos-data/gate_nocontext_llm.json`,
a `hermes -z --safe-mode` call per case given ONLY the diff + file path + repo name, never the
governing ADR's text):

| class | n | correct guesses | rate | 95% Wilson CI | chance (3-way) |
|---|---|---|---|---|---|
| violate | 23 | 18 | **78.3%** | [0.581, 0.903] | 33.3% |
| compliant | 23 | 9 | 39.1% | [0.222, 0.592] | 33.3% |
| no_decision | 18 | 4 | 22.2% | [0.090, 0.452] | 33.3% |

The violate class's CI (0.581-0.903) sits entirely ABOVE chance (0.333) -- a no-context model,
reading nothing but the diff, correctly guesses "this violates something" 78.3% of the time with
no access to any decision's text. **Per the frozen gate contract this REJECTS the entire 64-case
set** (pooled accuracy is not reported as a substitute -- the skill's own lesson from B2 v4.1: "a
one-class leak" hides under pooled numbers). The compliant and no_decision classes pass (both
CIs include 0.333); only violate fails, but a per-class gate fails on ANY one class failing, not a
majority vote across classes.

**Diagnosis (not cue-word leakage -- the keyword gate already passed clean on this set, see
`4 log/results-new-repos.md`'s build notes)**: the violate cases built under Amendment 1 broke
each repo's decision using GENERICALLY RECOGNIZABLE architecture anti-patterns (a module-level
singleton service client, a hand-rolled bypass of an established abstraction, a standalone script
duplicating a documented integration point) -- patterns an LLM recognizes as "probably wrong" from
general software-engineering training, independent of ever reading feast's or pledger-android's
own ADR. The construction method itself, not any single leaked word, is the leak.

**Rebuild rule (applied before any new case is built):** every violate case must break the
decision in a way that is undetectable without the decision's own text -- e.g. picking the
SPECIFIC alternative the ADR's own "Considered Options" section named and rejected (not a
generic smell), using a specific version/default/threshold/identifier the ADR pins that an
unrelated piece of ordinary code would have no reason to avoid, or reintroducing something the
ADR's own text says was removed/superseded -- while remaining ordinary-looking code that would
not, on its own, read as suspicious to a reviewer unfamiliar with the project's own decision
history. Compliant cases must be constructed to look EQUALLY unremarkable (same file shapes, same
code register) so no structural or stylistic tell distinguishes classes. The rebuilt set is
re-run through all four gates (keyword, structural, no-context LLM, scope-harness) before any
label is trusted or any arm is run on it, same as before -- re-gating is not a one-time check, it
repeats after every fix per the skill's own "after a fix: the old held-out is 'seen'" rule (the
OLD 64-case set is retired entirely, not reused as a partial basis, since its violate-class
construction method itself is what leaked).

---
Written 2026-11-09, before any case for the rebuild was constructed or any arm re-run (verified by
this file's own git history: the commit adding this amendment predates the commit adding any
rebuilt case file).
