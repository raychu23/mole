# T118 step B — pre-registered held-out comparison (NOT RUN by this task)

Per task instruction: "Do NOT run the held-out evaluation; leave it pre-registered (protocol file + frozen
hash) for the orchestrator." This file is that pre-registration, written BEFORE any held-out number was looked
at for scopeBoost/mentionBoost. B2 v4.2 held-out is frozen and is NOT for tuning (queue/brief.md); everything in
this file was decided from dev-only measurements (`measure_scopeboost_recall.mjs`, `measure_mentionboost_recall.mjs`,
`false_alarm_check_v3dev_none.mjs`, `false_alarm_check_v41dev_none.mjs` in this same `4 log/` dir).

## What to run

Using B2 v4.2's existing frozen held-out set (`v4.2/cases_with_labels_v4_2_new.json`, 60 cases, already frozen
pre-task -- see "frozen label file" hash below, UNCHANGED by this task), compute T53's semantic-routing
recall@1/3/5 (BM25-candidate-ranking recall, same definition `measure_baseline_recall.mjs`/
`measure_scopeboost_recall.mjs` use: does the true `adr_id` appear in `bm25Candidates` top-k?) under FOUR
conditions, all zero-LLM (no spend, no network):

1. baseline -- no flags (what the original T118 commit, `0642187`, already measured as the status quo)
2. `scopeBoost: true` only
3. `mentionBoost: true` only
4. `scopeBoost: true, mentionBoost: true` together (the shipped default-caller posture once this merges --
   cli.ts's own call site, once wired, would pass both; see cascade/cli.ts's `SEMANTIC_ROUTE_DEFAULTS` comment)

For each condition, also report:
- **the 4 known miss types** by case id (`v42-claw-0001-violate`, `v42-claw-0005-violate`,
  `v42-claw-0005-compliant`, `v42-claw-0018-violate` -- see `results-v4.2a.md` line ~127-133, and this task's
  own `0 start.md` "found" section for the per-case ADR/diff analysis) -- for EACH, report its `routedCorrectly`
  flag and `bm25Candidates` rank of the true `adr_id` under each condition. **Pre-registered prediction** (write
  down BEFORE running, so a later "it worked" claim is falsifiable): condition 4 fixes `claw-0018-violate`'s
  routing (its ADR's own "Key files" section literally names `internal/controller/claw_providers.go`, the
  diff's exact touched file -- `mentionPaths` match, unconditional per-match evidence, no floor needed) and
  leaves the other 3 cases (`claw-0001-violate`, `claw-0005-violate`, `claw-0005-compliant`) UNCHANGED misses
  (all three touch/add a file the ADR's own text never names at all -- new, unmentioned files/identifiers by
  construction of the synthetic violation; neither scopeBoost nor mentionBoost can route to a decision whose
  text contains zero signal about the governed file). If this prediction is wrong, say so plainly -- do not
  quietly revise it after seeing the run.
- **false-alarm/routing stability on the held-out set's `not_applicable` cases**: routed-set identity (same
  method as `false_alarm_check_v41dev_none.mjs`) between baseline and condition 4, zero-LLM tier only.
- **end-to-end cost/latency/McNemar** (optional, costs real LLM calls): re-run `v4.2/run/run_arms_v4_2.py`'s
  T53 arm with `scopeBoost`/`mentionBoost` wired into `cascadeCheckCli`'s `semanticRoute` options (NOT currently
  wired there by default -- this task left them opt-in flags on `routeDecisions`/`cascadeCheck`, see
  `0 start.md` boundary) and compare against the existing frozen `arm_cascade_heldout_v4_2_new.json` /
  `t53_semantic_route_v4_2_new_heldout_claude-haiku-4-5_k5_m0_c1.01.json` results via the same McNemar machinery
  `v4.2a/rescore_arms_v42a.py` already uses.

## Reporting rule

Report this as an **added, descriptive comparison on the already-seen v4.2 set** (same posture queue/brief.md
already allows for the v3 held-out set: "a new arm may be run on it as a descriptive addition... reported as
added after the fact"), never as a new pre-registered "better" claim -- the set is not fresh/unseen (T53's own
v4.2 numbers from the original run already exist and were read before this task started).

## Frozen hashes (verify before running; a mismatch means re-derive the comparison, don't just proceed)

**Code** (this task's changed/added source files, sha256, computed BEFORE this comparison was run --
`tasks/T118-router-recall/4 log/frozen_step_b_code.sha256`): verifies the orchestrator runs the SAME
`scopeBoost`/`mentionBoost` implementation this task measured on dev, not a modified one.

```
ddfe5b7c6cb429be319c88e10085d9318ad6853ee25a295f5b4f6af8c887f478  packages/decisions/src/route/route.ts
507a2881959836ece9e57f5faba20b864f52297dd0f68119818eb799c919ccd7  packages/decisions/src/route/types.ts
4b1bf59712f4626cfcbb31dab7c1a85bf93e33bcb9c7e55a2a493d742057290d  packages/decisions/src/route/mentions.ts
5f04a2df581482d3bde3a11bcd49906850d2d970ff18ac3ce15a758cdc72d100  packages/decisions/src/cascade/semantic-docs.ts
79f3da083cfaadc0b52990f1eee66d2038a3442ec6f2f80d7288e65013aedd3e  packages/decisions/src/cascade/cascade.ts
7f085d2fe1c7700515a30c8ba6c98564d3721c6a648203db57d723224e8747a3  packages/decisions/src/cascade/types.ts
3e05985c4f291fd8ae45b8d0c93961725d11551090b0f8d3e7285e7e9e775d6b  packages/decisions/src/cascade/cli.ts
```

**Frozen label file** (pre-existing, UNCHANGED by this task -- `v4.2/cases_with_labels_v4_2_new.json`):

```
576cac5d241fa585909ca6998e34f294b23a1c2a78af23c2c9d4cc4f531713a9  cases_with_labels_v4_2_new.json
```

(matches `v4.2/frozen_final_v4_2.sha256`'s own entry for this file -- confirmed identical by direct
`shasum -a 256` re-run during this task, 2026-11-08; this task did not touch that file or its freeze.)
