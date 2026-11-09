# T110 (Q4) results -- H2-style real-history benchmark, run once on 7 real backstage PRs

7 real merged `backstage/backstage` PRs (4 positive / 3 negative), human-signal labels only (no model ever
assigned a label -- see `protocol.md`), frozen by sha256 BEFORE any arm ran (`frozen.sha256`). Search logged
in full (`4 log/search_log.txt`). Scripts: `run/run_t53_h2.mjs`, `run/run_arms_h2.py`, `run/run_linter_h2.py`.

## Losses first

```notes
T53 Mole misses ALL  0/4 recall (Wilson 95% CI [0.000, 0.490]) on the 4 real, human-cited violations --
4 real violations     zero overlap with v3's 0.966 recall on 89 CONSTRUCTED held-out cases. 2 of the 4
                      misses are ROUTING failures (adr004 never appeared in the top-k for h2-bs-18540; the
                      TARGET adr003 never appeared for h2-bs-17875, which only routed adr004 instead -- the
                      wrong ADR in the same two-decision family). The other 2 (h2-bs-20007, h2-bs-6882)
                      routed the correct decision, escalated to claude-sonnet-5, and the ESCALATION itself
                      said compliant where a human maintainer said violate. This is a materially different,
                      and worse, failure mode than anything v3 measured: v3's constructed diffs were built
                      to make a clear textual pattern match (a new file picking the ADR-rejected
                      alternative); these real diffs are ordinary PRs where the violation is about missing
                      structure (an export placed in the wrong file) that a model has to infer, not read.
reviewer and RAG     both match recall 0.500 (Wilson 95% CI [0.150, 0.850]) -- right on h2-bs-18540 and
only half, too           h2-bs-17875, wrong on h2-bs-20007 and h2-bs-6882 (the SAME two cases T53's
                      escalation also missed -- this is not an arm-specific weakness, it is these two real
                      cases being hard for claude-sonnet-5 regardless of how the decision is surfaced).
                      RAG additionally has 1 false positive (h2-bs-23449-neg, correctly picked adr004 as
                      relevant, wrongly called it a violation) that neither T53 nor reviewer made --
                      false-alarm 0.333 (Wilson 95% CI [0.061, 0.792]), a wide, inconclusive interval, not a
                      finding that RAG is "worse" at n=3 negatives.
linter abstains on    v3's deterministic compile_rule() regex patterns ("instead of X", "rather than X",
6 of 7 cases          "must not use X", "Considered Alternatives" lists) were extracted FROM A SYNTHETIC
                      corpus of prose ADRs written to contain those exact phrasings. ADR003 and ADR004's
                      REAL text uses different phrasing ("We will stop using default exports except when
                      absolutely necessary", "only index files will have re-exports") that none of the
                      patterns catch -- 6/7 cases abstain (no extractable term), and the 1 case it does
                      score (h2-bs-17875) it gets WRONG (predicts compliant on a real violation). This is a
                      genuine, not cherry-picked, limit of the v3 linter baseline carried over unmodified:
                      it was built once against synthetic-ADR phrasing and was never re-validated against
                      real ADR prose before this task ran it here.
n=7 is far below the  pre-registered BEFORE any arm ran (protocol.md): target n ~415-440 (McNemar power for
pre-registered target  v3's own observed effect, psi=0.70 on its 89-case held-out split). n=7 is ~1.7% of
                      that target -- no significance claim is made anywhere in this file, only Wilson CIs
                      (correct at any n, visibly wide here) and the 4 arms' point estimates read side by
                      side, exactly as the pre-registered decision rule said to do.
```

## Case set (frozen before any arm ran -- see `protocol.md` for the full search log and matching rule)

```notes
positives (4)   h2-bs-18540 (ADR004, backstage maintainer freben), h2-bs-20007 (ADR004, maintainer Rugvip),
                h2-bs-17875 (ADR003, maintainer Rugvip), h2-bs-6882 (ADR004, maintainer Rugvip) -- each a
                real human code-review comment citing the ADR by doc URL as the reason the PR's code needs
                to change. All 4 are from backstage/backstage; no other repo of the 6 searched (the v3
                five + RocketChat/Rocket.Chat) produced a confirmed HUMAN (non-bot) citation -- see
                "rejected" rows in protocol.md's search log (2 RocketChat PRs had bot-authored ADR
                citations from CodeRabbit/cubic-dev-ai, excluded per the bot-filter rule).
negatives (3)   h2-bs-23449-neg, h2-bs-28578-neg, h2-bs-6993-neg -- each a different merged PR touching the
                SAME file as one of the 4 positives, confirmed to have zero human "adr" mentions in its
                comments before being accepted.
label source    the human signal itself (quoted verbatim in cases_h2.json's signal_text field), never a
                model. No labeler model was called anywhere in this task.
```

## Numbers -- recall / false-alarm (Wilson 95% CI), cost, latency (n=7: 4 positive / 3 negative)

```notes
arm                          recall (95% CI)         false-alarm (95% CI)     mean cost/check   p50 latency
T53 Mole (semantic-routed)   0.000 (0.000-0.490)     0.000 (0.000-0.561)      $0.0256           10.1s
reviewer (given decision)    0.500 (0.150-0.850)     0.000 (0.000-0.561)      $0.0413           10.1s
RAG (reads all live ADRs)    0.500 (0.150-0.850)     0.333 (0.061-0.792)      n/a (not logged)  18.3s
linter-only (deterministic)  0.000 (0.000-0.793)*    n/a (0 negatives scored) $0                instant
```

\* linter recall is over n=1 scored positive (3 of 4 positives abstained, no extractable term); the CI is
correspondingly almost the full [0,1] range and should not be read as a real estimate.

## Per-case table

```notes
id               label       T53 pred   reviewer pred   RAG pred (picked)      linter (abstain/pred)
h2-bs-18540      violate     False      True  (right)   True  (right, adr004)  abstain
h2-bs-20007      violate     False      False (wrong)   False (wrong, adr004)  abstain
h2-bs-17875      violate     False      True  (right)   True  (right, adr003) False (wrong)
h2-bs-6882       violate     False      False (wrong)   False (wrong, adr004)  abstain
h2-bs-23449-neg  compliant   False      False (right)   True  (wrong, adr004) abstain
h2-bs-28578-neg  compliant   False      False (right)   False (right, NONE)   abstain
h2-bs-6993-neg   compliant   False      False (right)   False (right, adr004) abstain
```

## Reading this plainly

T53's synthetic-case strength (v3: 0.966 recall) does not transfer to real, human-flagged violations in
this small sample: it missed all 4, split evenly between a routing failure (the decision never surfaced)
and an escalation failure (the right decision surfaced, the LLM still said compliant). Reviewer and RAG,
given the SAME diffs, did no better than a coin flip (0.500 recall) and RAG additionally hallucinated one
violation a human never flagged. The deterministic linter, which looked strong on v3's synthetic prose,
abstains on 6 of 7 real cases and is wrong on the 1 it scores. No arm here looks good; that is the honest
headline Wealthfront's "is this real history?" question was asking for, and the pre-registered power note
said plainly, before any of this ran, that n=7 cannot settle which of these four null results is "really"
worse than another -- only that none of the four handled real human-cited violations well.

## Limits

```notes
power          n=7 (4 positive/3 negative) vs a pre-registered target of ~415-440 (McNemar power for >= v3's
               own observed effect, psi=0.70). No significance test is reported; every number above is a
               point estimate + Wilson CI, explicitly wide at this n. Q6 (T112-b2-powered) is the queue's
               next lever for a bigger real-history or constructed set, not this task.
single repo    all 7 cases are backstage/backstage (2 ADRs: adr003, adr004) -- the search (protocol.md)
               found zero confirmed human-citation signal in the other 4 v3 repos or in RocketChat/
               Rocket.Chat after bot-filtering; this result cannot be read as "backstage-specific" vs
               "general" because no other repo contributed a real case to compare against.
bot contamination risk  this task's own search turned up AI review bots (CodeRabbit, cubic-dev-ai) citing
               ADRs on RocketChat/Rocket.Chat PRs with the same confidence and phrasing a human maintainer
               would use. Every "human signal" claim in this file was checked against the commenting
               account ending in `[bot]`; a future mining pass that skips this filter will silently count
               AI-generated citations as ground truth.
negative label is an absence proxy  "compliant" here means "no human flagged a violation in this PR's
               comments," not "a human confirmed this complies." A real violation that nobody happened to
               comment on would be mislabeled compliant; this is the same limit any real-history mining
               method has (nobody can review a PR for every decision it might touch), stated here rather
               than discovered by a reader.
single run     one run per arm, no repeat-run variance measurement (same as v1-v3/T53's own convention).
T53 recordsRoot reused v3's already-built `.mole` records for backstage's 14 other live ADRs (not rebuilt);
               decision text for adr003/adr004 is the REAL repo markdown, read directly, not reconstructed.
```
