# T110 / Q4 v2: H2-style real-history benchmark -- protocol (pre-registered, frozen BEFORE any arm runs)

v2 fixes a review FAIL in v1 (see `DEFECT.md`): v1 scored its 4 "violate" positives against the FINAL
MERGED (already-fixed) PR diff instead of the diff at the commit the human's ADR comment was actually
made on. v1's files are kept unchanged under `v1-failed-attempt/` as a recorded failed attempt.

## What counts as a positive (violate) case -- CHANGED from v1

A merged PR where a human (not a bot, not an LLM reviewer) review comment explicitly cites an ADR by id or
doc URL as the reason a change is wrong -- SAME as v1 -- but the scored diff is now
`base...original_commit_id` (GitHub's `original_commit_id` field on the review comment: the commit the
comment's diff position was anchored to, which does not change even if later commits amend/rebase/merge),
not `base...head` of the final merge. This is the commit the human was actually looking at when they wrote
the comment.

## Paired "fixed" negative -- NEW in v2

For each of the 4 positives, the SAME PR's final merged diff (`base...head`, i.e. v1's old diff) is kept as
a second case, relabeled `compliant` with signal_kind `paired_fixed_same_pr`: the author incorporated the
maintainer's ADR-citing comment and the PR merged in a fixed state. This is the strongest pairing design
available here -- identical code/files/ADR, the only thing that differs is whether the fix landed -- and is
explicitly preferred by this task's instructions over an unrelated same-file negative.

## Negatives carried from v1 (unchanged)

v1's 3 same-file negatives (`h2v2-bs-23449-neg`, `h2v2-bs-28578-neg`, `h2v2-bs-6993-neg`) are carried
forward verbatim: a different merged PR touching the same file as a positive, confirmed zero human "adr"
mentions in its comments. These were never affected by the defect (the defect was specifically about
scoring a POSITIVE against the wrong commit); carried forward rather than re-derived to avoid re-doing work
that passed review implicitly (the reviewer's FAIL was about the 4 positives only).

## Widen search: method and HONEST yield (target >=30 positives, NOT met)

```notes
method        (1) code search (gh api search/code, 10 req/min respected, 7s spacing) for repos with an ADR
              folder: path:docs/adr, path:doc/adr, path:docs/decisions, path:architecture/decisions,
              path:adr filename:0001, path:docs/architecture/decisions, filename:adr-template.md,
              path:docs/adrs -- 8 queries, full log in `4 log/search_log_v2.txt`. First-page repo names
              collected as candidates (each query's total_count was 1,274-894,976 -- far too broad to
              enumerate exhaustively; this is a SAMPLE of repos with ADR folders, not every one).
              (2) per candidate repo: gh api search/issues -f q='repo:<r> type:pr "<term>" in:comments' for
              terms {"ADR violat","violates ADR","ADR revert","supersedes ADR"}, 30 req/min respected
              (2.2s spacing) -- same term set v1 used, so results are comparable.
repos tried   41 total: the v1 six (backstage/backstage, thomvaill/log4brains, theupdateframework/
              python-tuf, cms-enterprise/easi-app, aws-powertools/powertools-lambda-python,
              RocketChat/Rocket.Chat) + 35 new: quarkusio/quarkus, cloudfoundry/cli, softwaremill/tapir,
              weaveworks/weave-gitops, Apicurio/apicurio-registry, elastic/cloud-on-k8s, rancher/rke2,
              percona/percona-xtradb-cluster-operator, home-assistant/architecture, zarf-dev/zarf,
              smithy-lang/smithy, defenseunicorns/pepr, igniterealtime/Openfire, TryGhost/ActivityPub,
              k8gb-io/k8gb, babashka/babashka, island-is/handbook, mozilla-services/merino-py,
              hmrc/hmrc-frontend, contentful/contentful-management.js, hashicorp/terraform,
              hashicorp/vault, envoyproxy/envoy, grafana/grafana, cockroachdb/cockroach, apache/apisix,
              gitlabhq/gitlabhq, nodejs/node, redis/redis, scylladb/scylladb, chef/chef,
              spinnaker/spinnaker, opensearch-project/OpenSearch, ory/kratos, dapr/dapr,
              temporalio/temporal, pulumi/pulumi, argoproj/argo-cd, fluxcd/flux2,
              open-telemetry/opentelemetry-collector.
queries       ~128 this pass (8 code-search + ~120 issue-comment-search), every one logged with its
              total_count BEFORE any manual read, in `4 log/search_log_v2.txt` (v1's own ~45 queries are
              still in `v1-failed-attempt/search_log.txt`, not duplicated here).
non-zero hits followed up  TryGhost/ActivityPub (#1804, #1462: "violates ADR"/ADR-0009 -- ALL
              coderabbitai[bot] inline comments, REJECTED, bot-exclusion rule, same shape as v1's
              RocketChat finding -- this repo's ADR-citation culture is now entirely AI-bot-driven);
              TryGhost/ActivityPub #1500/#1067/#1377/#1649, quarkusio/quarkus #48688/#53038/#45769/#43148,
              Apicurio/apicurio-registry #7829/#10753, weaveworks/weave-gitops #882, zarf-dev/zarf #2600,
              defenseunicorns/pepr #3126, cloudfoundry/cli #2320 -- all either PRs that themselves PROPOSE
              or AMEND an ADR (not citing an already-accepted one against someone else's unrelated code),
              or (quarkus #43148) a maintainer nudge toward an internal doc with no fetchable adr_id/URL --
              REJECTED, logged with the specific reason per case in `4 log/search_log_v2.txt`, not silently
              dropped.
yield         0 additional confirmed positives beyond the original 4 backstage/backstage PRs. Reported
              HONESTLY per this task's own instruction ("report the yield honestly"): the >=30 target is
              NOT met. n stays 4 positive (now correctly labeled) + 7 compliant (4 paired-fixed + 3
              same-file) = 11, not 30+.
reading       Two things compound here, both logged as findings, not excuses: (a) AI review bots
              (CodeRabbit, cubic-dev-ai, now also seen generically across the wider sample) have taken over
              a large share of what would, a few years ago, have been a human's "this violates ADR-N"
              comment on the most ADR-active repos this search found (TryGhost/ActivityPub, RocketChat/
              Rocket.Chat); (b) most other repos that keep an ADR folder (the majority of this pass's 35
              new repos) have near-zero EXPLICIT "cites an existing ADR as violated in someone else's PR"
              review comments at all, human or bot -- ADR folders mostly get touched by PRs that propose or
              amend the ADR itself, not by later PRs failing to follow it and getting called out for it in
              words a keyword search can find. This matches v1's own "global pass" finding (thematic
              matches are common, explicit citations against someone else's code are rare) and extends it
              to a far larger repo sample without changing the conclusion.
```

## Case set (11: 4 positive / 7 negative, all from backstage/backstage)

```notes
positives (4)  h2v2-bs-18540-prefix, h2v2-bs-20007-prefix, h2v2-bs-17875-prefix, h2v2-bs-6882-prefix --
               same 4 real human maintainer comments v1 found, now scored against base...original_commit_id
               (pre-fix), manually confirmed the flagged pattern is present at that commit.
negatives (7)  h2v2-bs-18540-fixed, h2v2-bs-20007-fixed, h2v2-bs-17875-fixed, h2v2-bs-6882-fixed (NEW:
               paired fixed version of each positive, same PR/files/ADR) + h2v2-bs-23449-neg,
               h2v2-bs-28578-neg, h2v2-bs-6993-neg (carried from v1 unchanged: different PR, same file,
               zero human "adr" mention).
```

## Power note -- target n for >= the v3 effect (unchanged reasoning from v1, n still far short)

Same Connor (1987) McNemar sample-size formula and same v3 observed effect (psi=0.70, discordant rate
11.24% on v3's 89-case held-out split) as v1's power note -- see `v1-failed-attempt/protocol.md` for the
full derivation (target band ~415-440). n=11 is ~2.6% of that target, slightly better than v1's n=7 (~1.7%)
but still two orders of magnitude short. **Decision rule, unchanged**: run all arms once, report recall /
false-alarm with Wilson 95% CIs, attempt McNemar only where there are enough discordant pairs for the test
to mean anything (see `results-v2.md`), descriptive otherwise.

## Arms (run ONCE, no re-tuning, same scoring code as v1/v3)

```notes
T53 Mole          packages/decisions/dist/src/index.js cascadeCheck, v1/v2/v3's already-frozen
(semantic-routed)  hyperparameters (k=5, minScore=0, confidenceRatio=1.01, claude-haiku-4-5 router,
                   claude-sonnet-5 escalate). recordsRoot = backstage's real v3 `.mole` decision corpus (15
                   live ADRs, copied verbatim from v1's run/records_backstage, not rebuilt).
RAG (reads all)    claude-sonnet-5 given every live ADR's full text + the diff, picks the relevant one (or
                   none) then verdict; same prompt shape as v1/v3.
reviewer           claude-sonnet-5 given ONLY the one real decision's text (oracle) + the diff; same
(given decision)   prompt shape as v1/v3.
T46 cascade        NEW this task (not in v1): Mole's own T46 compile-at-capture, zero-LLM-at-check-time
(compile+check)    baseline, same pattern as `tasks/T109-b2-baselines/4 log/scripts/t46_cascade_arm_v3.mjs`
                   -- draftChecksFor() compiles each unique ADR ONCE (amortized, 2 real ADRs here: adr003,
                   adr004), then the compiled match: patterns are applied deterministically to each case's
                   added lines, zero model calls at check time. Added per the task's own arm list.
linter-only        DROPPED from v2 (was in v1): the task's arm list for this review round names T53, RAG,
                   reviewer, T46 cascade -- not the v3 linter_arm_v3.py regex baseline. Not re-run; v1's
                   result (6/7 abstain on real ADR prose) stands as the prior finding and is not contradicted
                   or repeated here.
```

## Freeze

```notes
frozen now   this file (protocol_v2.md), cases_h2_v2.json (11 cases: diff, decision_text, signal_text,
             label_final, base/head shas, split=eval), `4 log/search_log_v2.txt`, `DEFECT.md`. sha256 in
             frozen_v2.sha256, written BEFORE any arm call (`run/run_*_v2.*` scripts) executes.
scope        no dev/heldout split -- same convention as v1. T53's hyperparameters and the semantic router
             stay v1/v2/v3's frozen values (never re-tuned on this or any real-history set).
```
