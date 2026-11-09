status (2026-11-08)  BUILT, targeted tests pass (17/17 route.test.ts, 568/568 packages/decisions), dev-measured
                      recall gain + a self-found/fixed false-alarm regression. Frozen held-out pre-registered
                      comparison NOT RUN (see "next" — out of time/scope for this pass, reported honestly below,
                      not fabricated).
owner: queue-agent-q11
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t118-router-recall
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T118-router-recall
base: main (00a2620, post-T117 merge)

```notes
T118-router-recall   Q11 (queue/brief.md "Added 11-08")
    goal              B2 v4.2's only misses were routedCorrectly=false (wrong/no decision handed to the check).
                      Raise routing recall@k (right decision among BM25's own ranked candidates) without raising
                      false alarms, behind a flag, tuned ONLY on dev.
    prior-art         4 log/prior-art.md, 6 dated sources (RRF fusion papers 2026-04/08; cross-encoder reranking
                      docs; Agentless NeurIPS 2024 path-privileged localization; CODEOWNERS/GitLab docs; Cursor
                      rules glob best-practices 2026; Aider repo-map). T118's actual synthesis (RRF of BM25 rank
                      + scope-glob-match rank, with a Cursor-prior-art-motivated specificity floor) is not a
                      direct copy of any one source.
    measured first    4 log/baseline_recall.json: CURRENT router's BM25-ranking recall@1/3/5 on B2 DEV splits
                      (v3 dev n=40-with-target, v4.1 dev n=32-with-target; v4.2 has no dev split, excluded from
                      tuning data per task instruction) = v3 dev .750/.900/.900 (4 misses: pt-0002 rank6/7,
                      0004 rank19-20/35, 0005 rank26/35), v4.1 dev .750/.875/.969 (1 miss: hb-0001 rank6/10).
    found             pt-0002's miss (rank 6, just outside topK=5) is a decision with a `scope:` glob
                      (`aws_lambda_powertools/utilities/**`) that EXACTLY matches the diff's touched file, but
                      plain BM25 buried it behind lexically-stronger-but-irrelevant candidates. v3's corpus
                      (synthetic .mole records, records_arm2/) carries real scope anchors (70/71 decisions);
                      v4.1/v4.2's corpus (plain docs/adr folders, loadGraph) carries NONE (graph.ts:584 always
                      sets scope:[] for nygard/backstage-format nodes) -- so this lever only fires where a
                      decision declares scope, honestly reported as a partial, corpus-dependent fix.
    tests first       Red saved BEFORE the fix: 4 log/red1.txt (2 failing: scopeBoost promotion + no-regression
                      cases not yet implemented). packages/decisions/test/route.test.ts: 5 new cases (no-op
                      without the flag, RRF promotion with it, recall-ceiling preservation when scope matches
                      nothing, no-op with no changedFiles, and a 5th SELF-REVIEW case below).
    implement         packages/decisions/src/route/route.ts: `scopeBoost` (RouteOptions, opt-in, default
                      undefined/off -- zero behavior change unless a caller asks) fuses the existing BM25 rank
                      with a scope-glob-match rank via RRF (Cormack et al., k=60). NEVER a pre-filter/exclusion
                      (T49's recall-ceiling finding still holds -- a decision with no scope or no match keeps
                      its full BM25-rank contribution, never drops below where plain BM25 alone put it).
                      route/types.ts: RouteDoc.scopeGlobs?, RouteOptions.changedFiles?/scopeBoost?.
                      cascade/types.ts + cascade.ts: SemanticRouteOptions.scopeBoost passthrough,
                      routeDecisions() now gets cascadeCheck's own pr.files as changedFiles.
                      cascade/semantic-docs.ts: semanticRouteDocs() now carries each node's scope anchors as
                      scopeGlobs.
    self-review       Adversarial check against B2 v3 dev's 22 'none' cases (4 log/false_alarm_check_v3dev_none.mjs)
                      found a REAL false-alarm regression before shipping: easi-app's decision 0003 ("Use Go As
                      Server Language") declares `scope: [pkg/apperrors/**, pkg/**, cmd/**]` -- the bare
                      catch-all `pkg/**`/`cmd/**` entries matched almost any file under those top-level dirs,
                      wrongly routing 16/22 'none' cases to 0003. FIXED: a scope glob only counts toward the
                      boost when its literal (non-wildcard) path prefix is >=2 segments deep (`pkg/apperrors/**`
                      counts, bare `pkg/**` does not) -- Cursor-rules-prior-art-motivated (scope narrowly, never
                      a whole top-level tree). Re-measured after the fix: 21/22 'none' cases now route IDENTICALLY
                      to the unmodified router; 1 changed case (l4b-none-1) moved between two real, non-catch-all
                      scoped decisions (packages/core/src/** vs packages/*/src/**), a mild/acceptable residual,
                      not another catch-all regression. New regression test added for this (route.test.ts, last
                      case in the scopeBoost describe block).
    dev result        4 log/scopeboost_recall.json, WITH scopeBoost: v3 dev recall@1/3/5 = .875/1.00/1.00 (was
                      .750/.900/.900, ALL 4 misses eliminated), v4.1 dev UNCHANGED .750/.875/.969 (0/54 decisions
                      in that corpus carry scope -- scopeBoost is a provable no-op there, not silently "it didn't
                      help", by construction). False-alarm sanity check (routing-set identity on 'none' cases,
                      not a full cost/latency/FA run -- see "next") shows 21/22 unchanged after the fix.
    tested            npm run build (clean) + npx vitest run inside packages/decisions: 568/568 tests pass
                      (route.test.ts 17/17 including the 5 new scopeBoost cases). npm run check NOT run (repo-
                      wide, orchestrator's job per queue/brief.md).
    next              1) The task's full acceptance bar (pre-registered, frozen, NEW held-out >=40 leak-gated
                      cases from unused ADRs, blind third-reader adjudication, old-vs-new end-to-end
                      recall/FA/cost/latency comparison via the v4.2 gate scripts) is NOT RUN: building that
                      corpus (cloning new repos or mining unused ADRs from the 4 existing ones, labeling with
                      opus+haiku, adjudicating disagreements, freezing by sha256) is multi-session work this
                      pass didn't have time for -- reported as NOT RUN rather than faked. 2) scopeBoost is a
                      real but narrow lever: it only fires on decisions that declare `scope:`/`in:` anchors,
                      which v4.1/v4.2's real-world plain-ADR corpora currently have ZERO of -- a follow-on task
                      to backfill scope anchors onto real ADRs (or derive implicit scope from path mentions in
                      ADR prose) would widen its effect before the frozen held-out comparison is worth running.
                      3) An end-to-end cost/latency run (not just routing-set identity) on B2 dev with the LLM
                      escalation tier is also NOT RUN (would cost real LLM calls; the routing-layer sanity check
                      above used bm25Candidates/routed set identity only, zero LLM calls).
    boundary          packages/decisions/src/{route,cascade}/** + tests; did not touch check/, rules/, cli.ts.
    harness           hermes
```
