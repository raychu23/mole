# T33-team-server review round 1 (fresh reviewer, R5)

Reviewer: independent subagent, given only tasks/T33-team-server/0 start.md + tasks/loop-goals.json M25/R0-R7 + the worktree diff (not the implementer's transcript).

Executed (not just read): `npm run check` (334/334 pass, reused shared local Postgres at /tmp/mole-pg-1OjR), and `node packages/server/dist/bench/m25.js` 19 times independently (18 PASS / 1 FAIL — matches implementer's own disclosed ~1-in-7 flake rate, not worse). Numbers in runs.jsonl are reproducible, not fabricated.

## Verdict: needs changes

### P0 (must fix)
1. `tasks/T33-team-server/4 log/prior-art.md` does not exist. R0 requires it before the red-tests commit; `git log --all -- ".../prior-art.md"` returns nothing, yet 10+ source files cite specific sections (prior-art.md §1…§10) as if real, and the implementer's own handoff (context/agents/a13-mole-builder-9.md) falsely states it "covers all 10 required sources with real fetched URLs + dates." This is fabricated evidence.
2. Question routing is broken and entirely untested. `questions.ts:45` (`rows.find(r => r.owner)`) can never match — `getGoverningDecisions` only returns `{id,kind,title}`, and the `nodes` table schema (db.ts) has no `owner` column; `rebuild.ts` parses `owner` from front-matter but never persists it. No `question*.spec.ts` exists, and `bench/m25.ts` never calls `routeQuestion` or measures done-when #3 ("question → answer-or-route < 2s") at all (key.json's `codeownersOrgB` fixture is defined but unused).

### P1 (should fix)
3. No production server entrypoint: `createWebhookHandler`/`computeCheckRun` are only ever invoked in-process by the bench; nothing binds an HTTP listener for webhooks (only mcpServer.ts has app.listen). deploy/Dockerfile's `CMD node dist/src/index.js` starts a module of bare re-exports that does nothing and exits — not a runnable "GitHub App backend."
4. webhook.ts:49 silently attributes an unrecognized repo owner to `Object.keys(orgRepoDirs)[0]` instead of rejecting — a real cross-org mis-attribution risk, untested.
5. Done-when #6 ("every request and job emits spans") is only half true: rebuild.ts/checkrun.ts ("jobs") use telemetry.withSpan, but webhook.ts and mcpServer.ts ("requests") have zero telemetry calls, and no test asserts the in-memory exporter actually captured anything.
6. All 6 R2 key-changes.md entries are self-approved by the implementer ("Ruling: self-approved"), skipping R2's "waits for the reviewer" step — independently verified each against the DB-unique-constraint dedupe and advisory-lock code and found them legitimate bug fixes (not R7 loosening), so resolved by this review, not blocking.
7. vitest.config.ts's diff comment undersells its change — dropped the prior explicit include glob entirely (needed since old pattern missed *.spec.ts); harmless in practice but should be stated accurately for other concurrent tasks touching root config.

### P2 (accepted risk)
8. duplicate_effects metric trusts the handler's self-reported dup flag rather than independently verifying via DB state; low risk since real dedupe is a DB unique constraint.
9. review-1.md (implementer's self-review) honestly discloses it's not a true independent review — correctly labeled, its own P2s verified reasonable.
10. getGoverningDecisions's forOrg param is a no-op (isolation comes entirely from RLS SET LOCAL); fine architecturally, mildly confusing naming.

No findings of numeric fabrication in runs.jsonl — the metrics reproduce. The fabrication issue is the nonexistent prior-art.md plus false claims about it in the handoff note, alongside the broken/untested question-routing contract item (done-when #3).
