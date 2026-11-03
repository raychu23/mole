# T68 insights — incident suggestions and proposal comparison under the phase in force

## Summary
`suggestRevivals`/`acceptIncident`/`incidentSummary` and `evaluateProposal`/`compareProposals`/`summarizeProposals`
now take `{ phase?, at? }`; absent both, they use the T60 phase in force TODAY (D93), not plain Dung — every
candidate/report still carries the plain-Dung reading beside the phase-resolved one (`plainLabel`/`plainDung`), so a
phase-driven result is never silently substituted. Measured on the T61 replay case (best-effort #tenet-focus <->
parallel #tenet-users mutual attack): under plain Dung the cycle is undecided on both sides (no 'out' candidate at
all); under `--phase launch` the loser is 'out' — a revival plain Dung never shows. On a proposal that adds an
untagged attacker, under `--phase scale` the decision was already defeated, so the phase-resolved `changes` is a
no-op while `plainDung` still reports contested->defeated — exactly the "looks real under plain Dung, not real under
the phase" case the task named. Open: `mole priorities`'s own default (sel={} → no audience) was left untouched
(narrower blast radius; not required by done-when); D93 is recorded here and in code comments only — the
`context/product-plan/systems/decisions.py` registry is outside this worktree/boundary, so no decision id was
separately allocated (see prior-art.md fit check and NOT RUN below).

```notes
design          phase = T60's existing audience (phaseInForce, priorities.ts); incident/proposals call it with the
                same selector, default = phaseAt(phases, today) — the project's own pre-existing mole_priorities
                doc comment, which evaluatePhase's own default never implemented (left as-is, out of boundary)
freeze (D93)    accept still writes an unvalued attack (attacks: [...]); Dung/Bench-Capon's own rule (no value on
                either side = unfiltered) makes it succeed in EVERY phase automatically — no new freeze logic
show-both       RevivalCandidate: label (phase-resolved, admits the candidate) + plainLabel (always plain Dung) +
                phase (name, if any) · ProposalReport: changes (phase-resolved) + plainDung (always plain) + phase
                ({before?, after?}, each side's own .mole/priorities.md resolved independently)
boundary        packages/decisions/src/priorities.ts (+selectPhase, tenetValues, phaseInForce, today — exported,
                reused, no 2nd tag reader) · src/incidents/revive.ts · src/cli.ts (incident suggest/accept flags) ·
                packages/proposals/src/{proposals,list,cli}.ts · packages/mcp/src/reasoning-tools.ts
tests           decisions 51 (incident-revive.test.ts +7 T68 cases, red 5/6 new assertions before the change) ·
                proposals 26 (new test/phase.test.ts, 6 cases, the T61 replay scenario direct) · mcp
                reasoning-tools.test.ts 11 (2 new T68 cases + 2 existing assertions updated for the new schema
                keys/default) — 88 targeted tests total, all green; no existing test's assertion value changed,
                only two input-schema key-list literals grew (names→[names,phase,at], similarly incident_suggest)
replay          tasks/T68.../4 log/{red.txt, t68-green-decisions.txt, t68-green-proposals.txt, t68-green-mcp.txt};
                fixture modelled on /Users/a1/.hermes/cache/scratch/t61-replay/r (not run from there directly — the
                scratch repo's git history committed the incident file at a fixed past date, so its "default =
                today" behaviour isn't reproducible verbatim in a replay; the SAME best-effort/parallel/tenet shape
                was rebuilt as temp-repo fixtures per AGENTS.md rule 4, which both prove the point deterministically)
STOP            T58/T62 reconciled generically (not case-by-case): every candidate/report always carries both
                readings; no caller had to choose one
NOT RUN         context/product-plan/systems/decisions.py D93 registration -- not present in this worktree/outside
                the packages-only boundary; D93's substance (selector + freeze invariance) is recorded in
                prior-art.md's fit check and in the code comments it's cited from (priorities.ts phaseInForce,
                revive.ts evaluated, proposals.ts evaluateProposal) instead
limits          INFERENCE: mole priorities's own bare default (sel={}) was left as plain Dung, unchanged, even
                though its MCP doc comment says "none = today's phase" — fixing that pre-existing discrepancy was
                not requested by this task's done-when and risks tests outside this task's boundary · a proposal's
                baseline and worktree resolve `--at`/`--phase` against their OWN priorities.md independently
                (INFERENCE: no prior art decides a merge rule for a proposal that itself edits priorities.md)
```

## 11-03 prior art + tests-first
- prior-art.md: composition of T58 (Dung reinstatement)/T60 (Bench-Capon VAF, audience)/T56-T62 (proposal diff);
  re-fetched Bench-Capon 2003 (jcl03.pdf) and Dung 1995 (via Wikipedia's reinstatement-labelling summary) 2026-11-03;
  no new method invented.
- Tests written first in `packages/decisions/test/incident-revive.test.ts` (+7 cases) and the new
  `packages/proposals/test/phase.test.ts` (6 cases); red captured (`4 log/red.txt`: 5 failing on the incidents
  suite before any source change — `phaseRepo` fixture's "plain Dung finds nothing" case was accidentally already
  green by construction, the other 5 failed as expected).
- Implemented `priorities.ts` (`selectPhase`, `tenetValues` export, `phaseInForce`, `today`), `incidents/revive.ts`
  (`Evaluated.plainLabels`/`phase`, `RevivalCandidate.plainLabel`/`phase`, `PhaseSelector` on
  suggest/accept/incidentSummary), `cli.ts` (`--phase`/`--at` on `mole incident suggest|accept`),
  `proposals.ts` (`Evaluated.plainLabels`/`phase`, `diffLabels` extracted and called twice, `ProposalReport.
  plainDung`/`phase`, `PhaseSelector` threaded through `evaluateProposal`/`compareProposals`), `list.ts`
  (`summarizeProposals` sel), proposals `cli.ts` (`--phase`/`--at` on evaluate/compare), `reasoning-tools.ts`
  (`phase`/`at` on `mole_incident_suggest` and `mole_proposals_compare`).
- Updated two pre-existing MCP tests whose assumptions the task explicitly changes: `mole_incident_suggest`'s
  default-candidate assertion (now passes `phase: 'launch'` explicitly, since the fixture's real "today",
  2026-11, resolves to `scale` where the one candidate is no longer 'out') and the two input-schema key-list
  literals (`['names']` → `['at','names','phase']`, similarly incident_suggest).
- Green: decisions 51 / proposals 26 / mcp reasoning-tools 11 = 88 tests, `npx tsc -b` clean, no unrelated test
  touched beyond those two pre-existing assertions.

## Review 1 (deleg_34eee310 #3) PASS + 1 MED fixed
```notes
verified   real T61 replay: --phase launch finds the parallel revival plain Dung misses (cycle undecided); scale/default none · single resolver
           (priorities.ts) · acceptIncident unchanged · MCP annotations ok · apps/vscode 480 pass
MED fixed  `mole proposals` (daemon CLI, used by the VS Code panel) dropped --phase/--at → now forwarded; proof 4 log/review-fix-daemon-proposals.txt
           (launch vs scale differ: best-effort in→out, parallel out→in under launch). INFERENCE: no unit test (needs proposal worktrees); replay is the proof
follow-up  mole_priorities bare default = plain Dung while its doc says today's phase (pre-T68) → backlog priorities-default
```
