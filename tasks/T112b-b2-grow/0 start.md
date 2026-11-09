# T112b-b2-grow (Q6b) -- grow B2 to >=155 never-seen held-out cases (v4.3)

**Goal:** per queue brief Q6b: grow B2 (v4.2/v4.2a, 60 held-out cases) to >=155 never-seen held-out
cases using 3-6 NEW public repos (>=10 real ADRs each, not used in v1-v4.2), >=95 new held-out cases,
pre-registering the pool-vs-standalone design AND a power analysis from v4.2's observed discordance in
`protocol_v4.3.md` BEFORE building. Then: pass the leak gate, label, blind re-adjudicate disputes
(Decision-Outcome-only instruction), freeze, run T53 (frozen params, flags off)/RAG/reviewer/judge once,
report McNemar (false alarms, T53 vs RAG, primary) and recall difference with Wilson CIs (co-primary),
losses first.

**Done-when:** >=95 new held-out cases built from the 4 selected repos, gated, labeled, disputes blind
re-adjudicated, frozen by sha256, all 4 arms run once each, pooled-or-standalone McNemar + Wilson CIs
reported per the pre-registered design, write-up states losses first.

**Status:** PARTIAL -- pre-registration + repo selection DONE; case build/gate/label/run NOT RUN this
session (see Next).

Done so far:
- Repo search logged (`4 log/prior-art.md`, dated 2026-11-08): grepped v2-v4.2's `REPOS` dicts for the
  9 already-used repos, then ~45 repo+path candidates checked via GitHub's contents API + web_search +
  one browser check, against the >=10-real-ADR / has-its-own-source-tree bar.
- 4 new repos selected (within the 3-6 range), each API-verified with real ADR file counts:
  `microsoft/semantic-kernel` (80), `jaegertracing/jaeger` (15), `alphagov/content-publisher` (16),
  `alphagov/email-alert-api` (10). 2 candidates with >=10 files were REJECTED for being docs-only repos
  with no source tree to diff against (`archivematica/archivematica-architectural-decisions`,
  `home-assistant/architecture`); several more rejected for <10 real ADRs (`openstatusHQ/openstatus`,
  `dotnet/reactive`, `alphagov/whitehall`, others -- full list in the prior-art log).
- `protocol_v4.3.md` written and committed BEFORE any case exists (`context/product-plan/systems/
  metrics-proof/m2-conflict/v4.3/protocol_v4.3.md`, gitignored/main-checkout, not tracked here):
  pre-registers POOLING with v4.2 (clean: same method, same gate design, same arms, same primary stat)
  as the primary design, with a pre-registered standalone fallback if the new repos' cases fail the
  leak gate; pre-registers the power analysis (section 2): v4.2's observed primary discordance (b=0,
  c=8, n_nonviolate=43) gives a POINT-ESTIMATE required n_nonviolate of ~40 (already met by v4.2 alone)
  but a CONSERVATIVE reading (true discordant split at the Wilson lower bound of the observed 8/8 split,
  0.676) requires ~340 -- this round's pooled projection (~111-125 non-violate) clears the optimistic
  bar by a wide margin and falls far short of the conservative one. Both numbers are in the protocol,
  not just the favorable one.

## Losses first

1. **The build/label/gate/run/stats pipeline is NOT RUN.** Building >=95 hand-authored cases (real ADR
   text + synthetic diff against real file paths, per repo, mixed new/append across all 3 classes, no
   cue words) across 4 repos, at the quality bar v4.2's own `build_cases_v4_2_new.py` demonstrates (each
   case hand-written, not templated), is itself the bulk of the work v4.2 needed a dedicated task+review
   cycle to do for 60 cases. This session produced the pre-registration and repo selection only.
   Reason: scope -- a single session's realistic tool/time budget does not cover hand-authoring ~95-115
   cases plus the per-class/structural leak gate, dual LLM labeling, blind re-adjudication of disputed
   cases, freezing, and 4 arm runs (T53, RAG, reviewer, judge) to the rigor this bench's history
   requires (v4.2's own run took a dedicated task + a fresh-reviewer FAIL + a fix round).
2. **Repo selection's own gate (leakage gate, per-class) has not been run on any of the 4 new repos'
   content yet** -- it is possible one or more of the 4 fails the gate once real cases exist, which
   would change the final repo count below 4 (still inside the 3-6 range, but worth flagging now rather
   than after the fact).
3. **No GitHub API auth token used** -- the unauthenticated 60/hr rate limit was hit once during the
   search; this slowed, but did not block, the search (switched to `web_search`/browser for a few
   checks). Not a defect in the result, but costs are disclosed.

## Next

1. For each of the 4 repos: clone shallow (`--depth 1`) to scratch, read the repo's own real ADR text
   (verbatim, like v4.2's `read_adr()`), hand-author violate/compliant pairs + no_decision distractors
   per `protocol_v4.3.md` section 4's class-mix rules, construct real diffs via `git` against the
   cloned tree (new-file vs append, mixed across all 3 classes), target >=95 across the 4 repos.
   Disk discipline: scratch budget is 500 MB per the queue brief; delete each repo's clone once its
   cases are extracted, `df -h` before/after each clone (disk was at 6.0-6.1 GB free at session start,
   near the 4 GB floor -- do not clone all 4 repos at once).
2. Run `leakage_gate_v4_2.py`'s per-class + structural checks (reused, not relaxed) on the new cases
   BEFORE labeling.
3. Dual-label (opus+haiku style, reusing `labeler_v4_2.py`'s shape) via `hermes -z --safe-mode` only.
4. Blind re-adjudicate every disputed case with a FRESH `hermes -z claude-sonnet-5 --safe-mode` call
   given ONLY the literal ADR text + diff + written rule, required to quote the ADR's **Decision
   Outcome** section verbatim (never "Considered Options", never constructor intent) -- this is a
   stricter instruction than v4.2a's own reaudit (which quoted "the ADR sentence" generically); make
   this explicit in the reaudit script's prompt.
5. Freeze by sha256 before scoring (cases, gate output, labels, reaudit output -- each its own frozen
   artifact, same posture as v4.2/v4.2a).
6. Run T53 (frozen params, flags off), RAG (reads all decisions), reviewer (given the decision), judge
   (once each) on the new held-out set.
7. Per `protocol_v4.3.md` section 3: if all 4 repos' cases pass the gate, compute the PRIMARY McNemar
   (T53 vs RAG, false alarms) on the POOLED (v4.2's 60 + new) non-violate set, under v4.2's original
   label set, with v4.2a's reaudited label set reported alongside as secondary; else report the
   standalone (new-only) result and say why pooling was dropped.
8. Report losses first, both McNemar and the recall-difference co-primary (with Wilson CIs) equally
   plainly, per the task instruction.

See `4 log/prior-art.md` for the full repo search log.
