status (2026-11-08)  Step A (self-check of 0642187): reviewed, no bug found, confirmed correct (specificity
                      floor math, RRF k=60 standard, flag default-off end-to-end incl. CLI, no FA regression).
                      Step B (new signal): BUILT, tests first, self-review found AND FIXED two real bugs before
                      shipping (see "found (step B)"). Dev-measured: net-neutral on recall (no regression after
                      fixes), 1/4 real v4.2 miss types is the kind it addresses (claw-0018, path-mention), the
                      other 3 are not (new/unmentioned files/identifiers by construction). Frozen held-out
                      comparison NOT RUN (pre-registered instead, protocol + hash below).
owner: queue-agent-q11
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t118-router-recall
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T118-router-recall
base: main (00a2620, post-T117 merge)

```notes
T118-router-recall   Q11 continued (queue/brief.md "Added 11-08")
    goal              Step A: fresh-eyes self-check of 0642187 (specificity floor, RRF k, flag default off, no
                      FA regression), fix anything found. Step B: scopeBoost is a no-op on real ADRs (0/54 v4.1
                      decisions declare scope) -- add a routing signal that works on real ADRs (path/identifier
                      mentions in the ADR's own TEXT), tests first, measure dev-only, report whether the real
                      B2 v4.2 miss types are the kind it addresses, pre-register (don't run) the held-out eval.

    step A self-check  Reviewed route.ts/types.ts/semantic-docs.ts/cascade.ts/cli.ts line by line. (1)
                      literalPrefixDepth/MIN_SCOPE_SPECIFICITY=2 math correct for the catch-all-glob fix. (2)
                      RRF_K=60 is the standard Cormack et al. constant, correctly applied. (3) scopeBoost
                      defaults to undefined/off at EVERY layer incl. cli.ts's SEMANTIC_ROUTE_DEFAULTS (never
                      set there) -- confirmed end-to-end, not just at routeDecisions(). (4) RRF math: when a
                      candidate has zero matches on a signal, its signal-rank is a CONSTANT tie
                      (bm25Candidates.length+1) across all zero-match candidates, so sorting by the fused RRF
                      score reduces exactly to the original BM25 order among them -- proved the recall-ceiling
                      claim algebraically, not just by the existing tests passing. (5) re-ran build + the
                      existing 569 tests: all green, no drift. No bug found; nothing changed by step A alone.

    step B prior-art  4 log/prior-art.md, step-B addendum: Antoniol et al. 2002 (IR-based doc<->code
                      traceability from shared vocabulary), SWE-agent's ACI (NeurIPS 2024, explicit path/
                      identifier search before any patch), BLUiR + BM25F (structured/field-weighted IR, and
                      IDF's own common-term down-weighting -- directly used to fix a self-found bug, below).

    implement          packages/decisions/src/route/mentions.ts (new): extractMentionedPaths (path-shaped
                      substrings in ADR prose, kept ONLY if they resolve against the real repo file list --
                      never a guess), extractMentionedIdentifiers (backtick-coded symbols, code-SHAPE filtered:
                      camelCase/PascalCase-with-transition/snake_case/SCREAMING_SNAKE/call-parens only -- an
                      ordinary English word in backticks like `provider`/`domain`/`merge` is prose emphasis,
                      not a symbol, and is dropped), dropCommonMentions (corpus document-frequency filter, see
                      "found" below). route.ts: `mentionBoost` (RouteOptions, opt-in, default off), fused into
                      the SAME RRF pass as scopeBoost (generalized applyScopeBoost -> applyBoosts/rrfFuse so N
                      signals combine in one pass, not sequential re-ranking). A path match is unconditional
                      evidence (mentionPaths already resolved against real files); an identifier match needs
                      >=2 distinct identifiers to count (MIN_IDENTIFIER_MATCHES, see "found" below). Wired
                      through cascade/types.ts, cascade.ts, semantic-docs.ts (repoFiles param + listRepoFiles
                      via `git ls-files`, same shell-out posture as cascade.ts's gitDiffFor), cli.ts (always
                      computes mentionPaths/Identifiers at load time; mentionBoost itself stays opt-in/off,
                      never auto-enabled).

    tests first        Red saved: 4 log/red2.txt (mentionBoost tests fail before the route.ts change exists).
                      packages/decisions/test/mentions.test.ts (9 cases) + route.test.ts mentionBoost describe
                      block (5 cases, incl. the two self-review regression tests below).

    found (step B)     Measuring dev recall WITH mentionBoost on (before shipping) found TWO real bugs, both
                      fixed before this commit (not reported as "it works" until verified clean a second time):
                      (1) extractMentionedIdentifiers's first cut kept any backtick-fenced word >=4 chars --
                      ordinary English words like `provider`/`domain`/`merge`/`token` (wrapped in backticks for
                      emphasis, not real symbols) appear across MANY claw-operator ADRs and tanked v4.1 dev
                      recall@1 0.75->0.594. Fixed: require a code SHAPE (camelCase transition / underscore /
                      call-parens), not just length+backticks. (2) Even after that fix, ONE case still
                      regressed: ADR-0001 mentions `OpenClaw` (the repo's own product name, PascalCase, passes
                      every code-shape check) once in its own prose; that same word, unremarkably, also
                      appeared in an UNRELATED diff's code comment (v4-claw-0002-violate) and outranked the
                      true decision on a single coincidental match. Fixed with a document-frequency filter
                      (dropCommonMentions, BM25-IDF-motivated: a term appearing in too many of the corpus's OWN
                      decisions carries no discriminating power) PLUS a floor requiring >=2 distinct identifier
                      matches to count at all (a single shared word/name is not enough corroborating evidence;
                      a resolved REAL file PATH match stays unconditional -- it can't be this kind of coincidence
                      by construction). Re-measured after both fixes: v4.1 dev recall@1/3/5 back to EXACTLY the
                      scopeBoost-only baseline (.750/.875/.9688, see 4 log/mentionboost_recall.json) -- net
                      NEUTRAL on dev, no regression, zero false alarms introduced (4 log/
                      false_alarm_check_v41dev_none.mjs: 8/8 v4.1 dev 'none' cases route identically;
                      4 log/fa_check_v3dev_none_with_mentionboost.json: 21/22 v3 dev 'none' cases unchanged,
                      same single residual as scopeBoost alone).

    miss-type check    Of B2 v4.2's 4 real misses (claw-0001-violate, claw-0005-violate, claw-0005-compliant,
                      claw-0018-violate -- results-v4.2a.md line ~127), inspected each ADR + diff directly
                      (not tuned on): ONLY claw-0018-violate is the kind mentionBoost addresses -- its ADR's
                      own "Key files" section literally names `internal/controller/claw_providers.go`, the
                      diff's EXACT touched file (confirmed: mentionPaths extraction finds it, resolved against
                      the real repo). The other 3 (claw-0001-violate: brand-new file, never mentioned anywhere;
                      claw-0005-violate/compliant: existing files the ADR's own text never names) are semantic/
                      conceptual routing misses -- the violating code deliberately bypasses a pattern the ADR
                      describes IN WORDS, without ever naming the specific file/identifier it bypasses. No
                      path/identifier-mention signal, however built, can fix those by construction: they are
                      exactly the harder "does this new code conceptually belong to this governed area" problem
                      BM25/mention-matching cannot solve, only a semantic/LLM read of the actual diff can.

    tested             npm run build (clean) + npx vitest run inside packages/decisions: 584/584 tests pass
                      (mentions.test.ts 9/9 new, route.test.ts 22/22 incl. 5 new mentionBoost cases). npm run
                      check NOT run (repo-wide, orchestrator's job per queue/brief.md).

    pre-registered     4 log/protocol_step_b_heldout.md: exact comparison plan for B2 v4.2's EXISTING frozen
                      held-out set (baseline vs scopeBoost vs mentionBoost vs both; recall@1/3/5, the 4 known
                      miss cases by id with a WRITTEN-DOWN prediction before running, FA routing-set stability,
                      optional end-to-end cost/McNemar run) + 4 log/frozen_step_b_code.sha256 (sha256 of every
                      file this task's Step B changed, so a later run can verify it's testing the same code).
                      NOT RUN by this task per instruction. Verified the pre-existing v4.2 label-file freeze
                      (cases_with_labels_v4_2_new.json) is unchanged by this task (sha256 matches
                      frozen_final_v4_2.sha256's own entry).

    boundary          packages/decisions/src/{route,cascade}/** + tests; did not touch check/, rules/.
    harness           hermes
```
