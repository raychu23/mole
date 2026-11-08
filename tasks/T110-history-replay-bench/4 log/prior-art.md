# T110 prior art (dated, before the checks-first commit)

1. **protocol_v3.md / results.md** (this repo, `context/product-plan/systems/metrics-proof/m2-conflict/v3/`,
   2026-11-02) -- the method this task extends: v3's own limit, stated plainly in "19 Can it stand up.md"
   fix 1, is that its 151 cases pair REAL ADRs with CONSTRUCTED diffs, labelled by 2 models + a frozen rule.
   T110 keeps v3's scoring/arm-running machinery (stats.py wilson, the reviewer/RAG/linter prompt shapes)
   but replaces the construct-and-model-label step with real merged PRs and real human citations.
2. **GitHub code/issue search API docs** (docs.github.com/en/rest/search, fetched 2026-11-08) -- `in:body,
   comments` qualifier, unquoted multi-term AND semantics vs quoted exact-phrase matching, and the secondary
   rate-limit behavior (~30 req/min on `search/*`) this task hit once and logged.
3. **CodeRabbit / cubic-dev-ai PR review bots** (observed live on RocketChat/Rocket.Chat PRs #43115, #42501,
   2026-11-08) -- both products now auto-comment with ADR citations ("This violates ADR 0005...") on repos
   that keep ADRs. This is itself a finding worth recording: automated review bots have started doing a
   version of what Mole does, and any "real human signal" search must explicitly exclude `[bot]` authors or
   it silently measures bot output instead.
4. **Connor (1987) McNemar sample-size formula** -- same source protocol_v3.md cited for its own power note;
   reused here unchanged to compute the "power for >= the v3 effect" target against v3's own observed psi.
