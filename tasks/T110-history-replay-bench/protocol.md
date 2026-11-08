# T110 / Q4: H2-style real-history benchmark -- protocol (pre-registered, frozen BEFORE any arm runs)

Mines REAL merged PRs in repos that keep ADRs, where a REAL HUMAN signal (not a model label) ties the PR to
a decision, plus a matched set of same-file PRs with no such signal as negatives. Answers "19 Can it stand
up.md" fix 1 ("is your benchmark real history?") and Q4's own instruction: **label = the real human signal,
no model ever assigns a label here.**

## What counts as a positive (violate) case

A merged PR where a human (not a bot, not an LLM reviewer) review/issue comment explicitly cites an ADR by
id or by its doc URL as the reason a change is wrong, needs rework, or must follow a named pattern -- OR a
revert/follow-up commit that cites an ADR -- OR a PR description that states it supersedes an ADR. Comments
from accounts ending in `[bot]` (CodeRabbit, cubic-dev-ai, changeset-bot, etc.) are EXCLUDED even when they
correctly cite an ADR id -- Q4's goal line is explicit: "no model labels," and an AI review bot's output is
a model label, not a human signal, however accurate.

## What counts as a negative (compliant) case

A different merged PR that touches the SAME file(s) as a positive case, searched (issue comments + inline
review comments, same bot-exclusion filter) for any mention of "adr" (case-insensitive): zero hits.
"No signal found" is the negative label -- an absence-of-evidence proxy for compliance, not a model's
compliant verdict and not a human saying "this complies." That limit is stated here, not discovered later.

## Search (logged, reproducible -- full log: `4 log/search_log.txt`)

```notes
repos tried    the v3 five (backstage/backstage, thomvaill/log4brains, theupdateframework/python-tuf,
               cms-enterprise/easi-app, aws-powertools/powertools-lambda-python) + RocketChat/Rocket.Chat
               (has docs/adr/, 11 real ADRs, not in v3 -- found via the same `gh api .../contents/docs/adr`
               check v3 used) + one global (no repo:) GitHub code-search pass.
tool           `gh api search/issues` with `repo:<r> type:pr <terms> in:body,comments`, `gh search commits`
               for revert messages, `gh api repos/<r>/issues/<n>/comments` and `.../pulls/<n>/comments` to
               fetch and bot-filter comment bodies. Secondary rate limit hit once (logged), recovered with
               a 70s backoff + 3-5s spacing between calls after.
terms          "ADR violat*", "ADR revert", "supersedes ADR", "violates ADR", "architecture decision",
               "against ADR", "breaks ADR", "goes against the decision", "superseded by ADR" (unquoted,
               i.e. matches all terms independently, then quoted exact phrases "violates adr" /
               "supersedes adr" / "against adr" for precision), each in:body,comments.
hit counts     per repo/term, `4 log/search_log.txt` (every query + its total_count, run before any
               manual read). ~45 queries total across 6 repos + 1 global pass.
found, rejected  RocketChat/Rocket.Chat PR #43115 and #42501 matched "violates adr"/"supersedes adr" with
               HIGH-confidence hits -- both were CodeRabbit ("This violates ADR 0005...") and cubic-dev-ai
               bot comments, zero human comments on either PR. REJECTED per the bot-exclusion rule above --
               logged as a finding, not silently dropped: AI review bots now routinely cite ADRs in PR
               review comments on repos that have them, and a search that doesn't filter bot authorship
               will overcount "human signal" by counting the model doing exactly what this benchmark is
               trying to measure Mole against.
found, accepted  backstage/backstage PRs #18540, #20007, #17875, #6882 -- 4 distinct human maintainer
               review comments (freben x1, Rugvip x3, both are long-time backstage maintainers) citing
               ADR003 (avoid default exports) or ADR004 (module export structure) by doc URL, in a normal
               code-review reply, none from a bot account. Full quotes in `cases_h2.json` (`signal_text`).
               easi-app PR #3527 ("removed references to cedar-proxy") thematically matches ADR0040's real
               supersession event (the same decommissioning v3's synthetic trap referenced) but its PR body
               and comments never cite "ADR" by name -- REJECTED, no explicit human citation, logged not to
               overstate a thematic match as a citation signal.
global pass    a repo-unscoped search for "violates adr"/"against our adr"/"this adr is superseded" in
               merged PRs returned ~1,000-2,900 hits, almost entirely small/solo repos where an AI coding
               agent authors both the ADR and the PR against it (titles like "feat(orchestration)!: ...
               (ADR-0349 step 3)") -- not real teams reviewing real human work, and not pursued further;
               logged as a dead end, not quietly dropped.
stopped because  diminishing returns (4 confirmed positives found, several more candidates checked came
               back bot-only or thematic-not-cited) against the task's time budget; this is a SMALL,
               reproducible, fully logged search, not an exhaustive one -- see Limits.
```

## Case set (7: 4 positive / 3 negative, all from backstage/backstage)

```notes
positives  h2-bs-18540 (ADR004, freben), h2-bs-20007 (ADR004, Rugvip), h2-bs-17875 (ADR003, Rugvip),
           h2-bs-6882 (ADR004, Rugvip) -- each diff = the real `gh pr diff <n>` unified diff, decision text
           = the real ADR003/ADR004 markdown fetched from the repo (current content; both ADRs are
           long-standing accepted decisions unchanged since authored, per `git log --follow`).
negatives  h2-bs-23449-neg (same file as 18540: plugins/org/.../OwnershipCard/types.ts), h2-bs-28578-neg and
           h2-bs-6993-neg (same files as 20007/17875 resp. 6882: packages/backend-openapi-utils/src/index.ts,
           packages/backend-common/src/reading/index.ts) -- each confirmed to have ZERO human "adr" mentions
           in its comments before being accepted as a negative.
dropped    h2-bs-23610-neg (same file as 20007/17875, also zero-signal, so a valid negative by the label
           rule) was DROPPED, not relabeled: its diff is 209KB, almost entirely generated OpenAPI client
           model files (`packages/catalog-client/src/generated/...`) that would make its LLM-arm calls
           disproportionately expensive and slow without adding a new distinct signal case. n=7, not n=8 --
           reported honestly rather than padding the matched set with a case not worth the run cost.
source     every row's `source` field states plainly: real PR, real human signal (or confirmed absence),
           never model-labeled. No labeler model is called anywhere in this task -- the human signal IS
           the label, mechanically transcribed, never adjudicated by an LLM.
```

## Power note -- target n for >= the v3 effect (written BEFORE any arm runs)

```notes
v3's own effect   T53 vs RAG on v3's 89-case held-out split (results.md): discordant=10 (b=7 T53-only-right,
                  c=3 RAG-only-right), psi = b/(b+c) = 7/10 = 0.70, discordant rate 10/89 = 11.24%.
McNemar formula   same Connor (1987) sample-size formula protocol_v3.md used: discordant pairs needed for
                  80% power at alpha=0.05 to detect psi=0.70 is m = (z_a/2 + z_b*sqrt(1-(2*psi-1)^2))^2 /
                  (2*psi-1)^2 = (1.9600 + 0.8416*sqrt(1-0.16))^2 / 0.16 ~= 46.6 discordant pairs.
target n          dividing by v3's own discordant rate (11.24%): target total n ~= 46.6 / 0.1124 ~= 415. A
                  simpler common approximation ((z_a/2+z_b)^2/(4*(psi-0.5)^2)/p_disc) gives ~= 437. Target
                  band for "power for >= the v3 effect": ~415-440.
does 7 suffice?   NO, by two orders of magnitude. n=7 is ~1.7% of the ~415-440 target. This is stated here,
                  before any arm runs, exactly as protocol_v3.md stated 151/89 was short of its own
                  155-175 target before its arms ran -- not a post-hoc excuse for a small or weak result.
decision rule     per Q4's own instruction ("if fewer real cases exist than needed for power, say so with
                  the count and run descriptively"): run all 4 arms once on the 7 cases, report recall /
                  false-alarm with Wilson 95% CIs (correct at any n, just wide), SKIP any McNemar
                  significance claim (a McNemar test at n=7 with <=7 discordant pairs possible is not a
                  meaningful significance test and reporting a p-value here would invite exactly the kind
                  of "n=7, significant!" misread this benchmark exists to prevent) -- descriptive only.
```

## Arms (run ONCE, no re-tuning, same scoring code as v3)

```notes
T53 Mole          packages/decisions/dist/src/index.js cascadeCheck, v2/v3's already-frozen hyperparameters
(semantic-routed)  (k=5, minScore=0, confidenceRatio=1.01, claude-haiku-4-5 router, claude-sonnet-5 escalate).
                  recordsRoot = backstage's real v3 `.mole` decision corpus (15 live ADRs, copied verbatim
                  from v3's `records_arm2/backstage`, not rebuilt) -- same realistic "team's whole decision
                  store is visible" setup v3 used.
RAG (reads all)   claude-sonnet-5 given every live ADR's full text + the diff, asked to pick the relevant
                  one (or none) then verdict; same prompt shape as v3's `run_arms_v3.py` RAG_PROMPT.
reviewer          claude-sonnet-5 given ONLY the one real decision's text (oracle: told which ADR applies)
(given decision)   + the diff; same prompt shape as v3's REVIEWER_PROMPT.
linter-only       v3's `linter_arm_v3.py` compile_rule() verbatim (deterministic regex extraction from the
                  decision text, zero model calls, mechanically applied to the diff's added lines).
```

## Freeze

```notes
frozen now   this file (protocol.md), cases_h2.json (7 cases: diff, decision_text, signal_text, label_final,
             base/head/merge_commit_sha, split=eval), `4 log/search_log.txt`. sha256 in frozen.sha256,
             written BEFORE any arm call (`run/run_*` scripts below) executes.
scope        no dev/heldout split -- every case here is new and none was used to tune T53's parameters
             (those stay v2/v3's frozen values) or to pick search terms after the fact.
```
