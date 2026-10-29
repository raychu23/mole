# Start building Mole in a new chat

## Overnight (2026-10-29 05:05): 3 builders + a tool trial, watched, then a wrap-up

Raymond, 10-29 05:01: "can you continue with exisintg agents or new agents if needed to finish work … also i want another agent dedicated to again further understaning trying out diff tools … ill leaving comupter several hours so just keep running until all tasks done got it loops same metrics vverify make sure stuff changed eval all that loop keep going in seuequence or try options" (full: `context/product-plan/systems/overnight/ask 2026-10-29.txt`).

- D32 (launch a4) and D33 (T19: try options, then merge at the real number) are answered by that message. D29, D30, D31 and D34 stay OPEN as product choices; the message is the go to build their free tasks (`decisions.jsonl` field `build_go`).
- Not built tonight: T17's full paid A/B (API spend), T23 (model calls + Slack), T26 (replaced by T30), T31 and T33 (need people and a pilot). They are listed as needs-you.
- A no-agent watchdog (`~/.hermes/scripts/mole-overnight-watch.py`, cron every 15 min, plan in `~/.hermes/cache/scratch/mole-overnight/plan.json`) rebuilds the agents board. When a builder gives its final answer while its queue still has open tasks, the watchdog resumes it (at most 2 times). When every agent has finished, or 7 h have passed, it starts a8, the wrap-up chat (`context/product-plan/systems/overnight/wrap-up brief.md`).

| agent | owner | queue | prompt |
|---|---|---|---|
| a4 | mole-builder-3 | T21 integrate → T19 options (D33) → T17 harness + dry run | below |
| a5 | (no ledger tasks) | tool trial round 2: `context/product-plan/systems/tool-trials/round 2/0 start.md` | its brief |
| a6 | mole-builder-4 | T29 → T27 ∥ T30 ∥ T32 | below |
| a7 | mole-builder-5 | T22 ∥ T24 ∥ T28 → T25 | below |
| a8 | wrap-up | fold results into the pages and startup files, overnight report, PDFs | `context/product-plan/systems/overnight/wrap-up brief.md` |

Prompt for a4 (mole-builder-3):

```text
You are Mole builder 3 (ledger owner mole-builder-3, agent a4 in context/agents/registry.json, main file context/agents/a4-mole-builder-3.md). Raymond is away for several hours and said (10-29 05:01): "just keep running until all tasks done got it loops same metrics vverify make sure stuff changed eval all that loop keep going in seuequence or try options". Other chats work in this repo right now: builder 4 (a6: T29, T27, T30, T32), builder 5 (a7: T22, T24, T25, T28) and the tool trial (a5, context/product-plan/systems/tool-trials/round 2/ only). Never touch their tasks.
1. Read AGENTS.md, context/0 start.md, context/1 takeaways.md (startup packet), then tasks/loop-goals.json (your metrics, loop rules R1-R7, never-list), each of your tasks' tasks/<T>/0 start.md (goal, done-when, boundary, checks, non-goals, proof, stop) and tasks/HANDOFF.md section 'Now (2026-10-28 21:10)' steps a-g (the loop). Run python3 -B tasks/loop_status.py.
2. Load skills: ledger, metric-gated-build-loop, test-driven-development, verify-pyramid, code-work.
3. Your queue, in order:
   a. T21-parallel-agent-collisions is verified (reviewed under mole-builder-2): in its worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T21-parallel-agent-collisions merge main into ledger/t21-parallel-agent-collisions, rerun its checks, then integrate it. Do this first: builder 5's T25 needs it.
   b. T19-rename-proof-anchors (D33, Raymond: "try options"): claim with --worktree "/Users/a1/Desktop/CS Code/Project/Mole-worktrees/T19-rename-proof-anchors" --owner mole-builder-3 (existing branch; merge main into it first). Read its 2 insights.md and 4 log/key-ruling-1.md. Before scoring anything new, build a NEW held-out key (another repo or other history, labelled before any score, like bench/m9-heldout-key.json). Try up to 3 options, each scored on the frozen key AND both held-out keys, for example: caller evidence only when the caller switched in a LATER commit; similarity over normalized TypeScript AST node kinds instead of token bigrams; import/export-site evidence; a decline band that answers 'ambiguous' instead of guessing. An option counts only with >= 95% right and 0 wrong on the frozen key and 0 wrong on both held-out keys. If none passes: keep the 0-wrong body-only version, log M9's real number, get it reviewed and integrated, and write in loop-report.md that the resume phrase needs rewording to the real number (the planning chat does that).
   c. T17-agent-eval-inspect: harness + scorer tests + a 2-sample dry run ONLY (Inspect AI + Inspect SWE's claude_code() in Docker; check docker runs first). The full paid A/B waits for Raymond's go. If even the dry run needs a Claude login or API spend, stop at harness + scorer tests, log 'needs Raymond: <what>', and hand in what is built.
4. Per task, the loop exactly as in HANDOFF 'Now' a-g: claim (cd "/Users/a1/Desktop/CS Code" && python3 systems/ledger --root Project/Mole --no-orca move tasks/<T> running --owner mole-builder-3 --git-worktree); FIRST commit = bench + key dated now + failing tests, nothing else (the key's truth comes from a different method than the code under test; if a write gate blocks test files, create them with a terminal heredoc and note it in the task's 2 insights.md); produce → run the checks → correct, at most 6 rounds; append every run to tasks/<T>/4 log/runs.jsonl with the metric id as key ({"metrics":{"M21":...}}); never edit the step-1 keys or tests (R2: tasks/<T>/4 log/key-changes.md + a fresh-subagent ruling); review by a FRESH subagent given only the contract + the diff (test diff first, P0-P2 each with a reproducer, at most 2 rounds); integrate: merge main into the task branch first, rerun the checks, then ledger move <T> integrated --merge <sha> --checks-result "npm run check on main → …". Independent tasks run in parallel, one worktree + one subagent each; integrate one at a time.
5. Shared files (packages/daemon/src/cli.ts, the MCP tool list in packages/mcp/src, root package.json + package-lock.json): one import + one call each, tests assert with toContain, never an exact set. git index.lock → wait 10 s and retry. Disk is ~21 GB free: npm ci only where needed, delete node_modules in a worktree once its task is integrated. Never push, publish, use Raymond's accounts or spend on paid APIs.
6. At every transition (claimed, submitted, verified, integrated, blocked) append one dated line to tasks/loop-report.md (append only) and run python3 context/agents/build_agents.py. After each integration also run: cd context/product-plan && python3 systems/resume/render_resume.py (don't edit that page or claims.json by hand). Write under '## Handoff notes' in context/agents/a4-mole-builder-3.md at each integration and before you stop: what you did, what's next, anything odd.
7. A miss is not a stop: log the real number, move that task to blocked with the cause (--cause … --decision-owner raymond) and go to the next task. Never loosen a check to go green (R7). Don't touch context/product-plan/*.md pages (the planning chat owns them).
8. Raymond is away: make reasonable choices and write assumptions in the task's 0 start.md or 2 insights.md. Final answer, 6 lines max: each task's state + metric vs target, and the path tasks/loop-report.md.
```

Prompt for a6 (mole-builder-4):

```text
You are Mole builder 4 (ledger owner mole-builder-4, agent a6 in context/agents/registry.json, main file context/agents/a6-mole-builder-4.md). Raymond is away for several hours and said (10-29 05:01): "just keep running until all tasks done got it loops same metrics vverify make sure stuff changed eval all that loop keep going in seuequence or try options". Other chats work in this repo right now: builder 3 (a4: T21, T19, T17), builder 5 (a7: T22, T24, T25, T28) and the tool trial (a5). Never touch their tasks.
1. Read AGENTS.md, context/0 start.md, context/1 takeaways.md (startup packet), then tasks/loop-goals.json (your metrics, loop rules R1-R7, never-list), each of your tasks' tasks/<T>/0 start.md (goal, done-when, boundary, checks, non-goals, proof, stop) and tasks/HANDOFF.md section 'Now (2026-10-28 21:10)' steps a-g (the loop). Run python3 -B tasks/loop_status.py.
2. Load skills: ledger, metric-gated-build-loop, test-driven-development, verify-pyramid, code-work.
3. Your queue (the decision graph, D31 + team phase A, D34; Raymond gave the go to build, the product choice stays OPEN):
   a. T29-decision-graph-core first, alone: it defines .mole/decisions (MADR front matter) and packages/decisions, which the other three build on. Public decision folders for the bench: clone shallow + sparse under ~/.hermes/cache/scratch/mole-builder-4 (backstage/backstage docs/architecture-decisions, alphagov/govuk-aws docs/architecture/decisions, plus the history the key needs).
   b. once T29 is integrated: T27-decisions-as-rules, T30-annotated-file-tree and T32-team-pr-check in parallel worktrees, integrated one at a time. T27 uses dependency-cruiser for real. T30: decorations computed in packages/decisions/src/tree (pure), the VS Code FileDecorationProvider stays thin; M22 tonight is the proxy (fresh subagents with vs without the tree's output), and the junior study kit is left for Raymond. T32: never push; prove the workflow by running its steps locally, as T16 did.
4. Per task, the loop exactly as in HANDOFF 'Now' a-g: claim (cd "/Users/a1/Desktop/CS Code" && python3 systems/ledger --root Project/Mole --no-orca move tasks/<T> running --owner mole-builder-4 --git-worktree); FIRST commit = bench + key dated now + failing tests, nothing else (the key's truth comes from a different method than the code under test; if a write gate blocks test files, create them with a terminal heredoc and note it in the task's 2 insights.md); produce → run the checks → correct, at most 6 rounds; append every run to tasks/<T>/4 log/runs.jsonl with the metric id as key ({"metrics":{"M21":...}}); never edit the step-1 keys or tests (R2: tasks/<T>/4 log/key-changes.md + a fresh-subagent ruling); review by a FRESH subagent given only the contract + the diff (test diff first, P0-P2 each with a reproducer, at most 2 rounds); integrate: merge main into the task branch first, rerun the checks, then ledger move <T> integrated --merge <sha> --checks-result "npm run check on main → …". Independent tasks run in parallel, one worktree + one subagent each; integrate one at a time.
5. Shared files (packages/daemon/src/cli.ts, the MCP tool list in packages/mcp/src, root package.json + package-lock.json): one import + one call each, tests assert with toContain, never an exact set. git index.lock → wait 10 s and retry. Disk is ~21 GB free: npm ci only where needed, delete node_modules in a worktree once its task is integrated. Never push, publish, use Raymond's accounts or spend on paid APIs.
6. At every transition (claimed, submitted, verified, integrated, blocked) append one dated line to tasks/loop-report.md (append only) and run python3 context/agents/build_agents.py. After each integration also run: cd context/product-plan && python3 systems/resume/render_resume.py (don't edit that page or claims.json by hand). Write under '## Handoff notes' in context/agents/a6-mole-builder-4.md at each integration and before you stop: what you did, what's next, anything odd.
7. A miss is not a stop: log the real number, move that task to blocked with the cause (--cause … --decision-owner raymond) and go to the next task. Never loosen a check to go green (R7). Don't touch context/product-plan/*.md pages (the planning chat owns them).
8. Raymond is away: make reasonable choices and write assumptions in the task's 0 start.md or 2 insights.md. Final answer, 6 lines max: each task's state + metric vs target, and the path tasks/loop-report.md.
```

Prompt for a7 (mole-builder-5):

```text
You are Mole builder 5 (ledger owner mole-builder-5, agent a7 in context/agents/registry.json, main file context/agents/a7-mole-builder-5.md). Raymond is away for several hours and said (10-29 05:01): "just keep running until all tasks done got it loops same metrics vverify make sure stuff changed eval all that loop keep going in seuequence or try options". Other chats work in this repo right now: builder 3 (a4: T21, T19, T17), builder 4 (a6: T29, T27, T30, T32) and the tool trial (a5). Never touch their tasks.
1. Read AGENTS.md, context/0 start.md, context/1 takeaways.md (startup packet), then tasks/loop-goals.json (your metrics, loop rules R1-R7, never-list), each of your tasks' tasks/<T>/0 start.md (goal, done-when, boundary, checks, non-goals, proof, stop) and tasks/HANDOFF.md section 'Now (2026-10-28 21:10)' steps a-g (the loop). Run python3 -B tasks/loop_status.py.
2. Load skills: ledger, metric-gated-build-loop, test-driven-development, verify-pyramid, code-work.
3. Your queue (verify at the hand-back, D29 + D30; Raymond gave the go to build, the product choices stay OPEN):
   a. now, in parallel: T22-hand-back-test-selection (new packages/verify), T24-agent-claim-check (packages/agentstate/src/claims; deterministic claim splitting only, no model calls) and T28-runtime-flows-from-tests (new packages/flows; V8 coverage / OpenTelemetry spans while vitest runs, overhead <= 2x).
   b. T25-hand-back-verify-gate once T22, T24 and T21 are integrated (builder 3 integrates T21 first; check python3 -B tasks/loop_status.py and keep working on a. while you wait).
4. Per task, the loop exactly as in HANDOFF 'Now' a-g: claim (cd "/Users/a1/Desktop/CS Code" && python3 systems/ledger --root Project/Mole --no-orca move tasks/<T> running --owner mole-builder-5 --git-worktree); FIRST commit = bench + key dated now + failing tests, nothing else (the key's truth comes from a different method than the code under test; if a write gate blocks test files, create them with a terminal heredoc and note it in the task's 2 insights.md); produce → run the checks → correct, at most 6 rounds; append every run to tasks/<T>/4 log/runs.jsonl with the metric id as key ({"metrics":{"M21":...}}); never edit the step-1 keys or tests (R2: tasks/<T>/4 log/key-changes.md + a fresh-subagent ruling); review by a FRESH subagent given only the contract + the diff (test diff first, P0-P2 each with a reproducer, at most 2 rounds); integrate: merge main into the task branch first, rerun the checks, then ledger move <T> integrated --merge <sha> --checks-result "npm run check on main → …". Independent tasks run in parallel, one worktree + one subagent each; integrate one at a time.
5. Shared files (packages/daemon/src/cli.ts, the MCP tool list in packages/mcp/src, root package.json + package-lock.json): one import + one call each, tests assert with toContain, never an exact set. git index.lock → wait 10 s and retry. Disk is ~21 GB free: npm ci only where needed, delete node_modules in a worktree once its task is integrated. Never push, publish, use Raymond's accounts or spend on paid APIs.
6. At every transition (claimed, submitted, verified, integrated, blocked) append one dated line to tasks/loop-report.md (append only) and run python3 context/agents/build_agents.py. After each integration also run: cd context/product-plan && python3 systems/resume/render_resume.py (don't edit that page or claims.json by hand). Write under '## Handoff notes' in context/agents/a7-mole-builder-5.md at each integration and before you stop: what you did, what's next, anything odd.
7. A miss is not a stop: log the real number, move that task to blocked with the cause (--cause … --decision-owner raymond) and go to the next task. Never loosen a check to go green (R7). Don't touch context/product-plan/*.md pages (the planning chat owns them).
8. Raymond is away: make reasonable choices and write assumptions in the task's 0 start.md or 2 insights.md. Final answer, 6 lines max: each task's state + metric vs target, and the path tasks/loop-report.md.
```

### Added 10:05 (Raymond's answers, 10-29 10:00)

Raymond: "make sure future agent spawns use sonnet. at least for now" · "sure t30 harder questions whatever. uh ok use better ways. again dont just make shit up pls for any given issue search up all th ebest resources alaready availble before you start building" · "for the decisions 31 to 34 just do it right as ive priorly instructed".

- Every new spawn: `-m claude-sonnet-5 --provider anthropic`; subagents follow `delegation.model: claude-sonnet-5` in `~/.hermes/config.yaml`.
- New loop rule R0 (prior art first, `prior-art-first` skill, auto-loaded): `tasks/<T>/4 log/prior-art.md` before the checks-first commit.
- D31 and D34 are now USER (the recs). T19 / T30 / T32 → ready for a9; the resume lines → a10 (`context/product-plan/systems/resume/industry-metrics brief.md`).

Prompt for a9 (mole-builder-6):

```text
You are Mole builder 6 (ledger owner mole-builder-6, agent a9 in context/agents/registry.json, main file context/agents/a9-mole-builder-6.md), running on Sonnet. Raymond said (10-29 10:00): "sure t30 harder questions whatever. uh ok use better ways. again dont just make shit up pls for any given issue search up all th ebest resources alaready availble before you start building". Other chats work in this repo right now: builder 5 (a7: T22, T24, T25) and the resume-metrics chat (a10, context/product-plan/systems/resume/ only). Never touch their tasks.
1. Read AGENTS.md, context/0 start.md, context/1 takeaways.md (startup packet), then tasks/loop-goals.json (your metrics, loop rules R1-R7, never-list), each of your tasks' tasks/<T>/0 start.md (goal, done-when, boundary, checks, non-goals, proof, stop) and tasks/HANDOFF.md section 'Now (2026-10-28 21:10)' steps a-g (the loop). Run python3 -B tasks/loop_status.py.
2. Load skills: prior-art-first, ledger, metric-gated-build-loop, test-driven-development, verify-pyramid, code-work.
3. Your queue (all three were blocked; Raymond answered 10-29 10:00):
   a. T19-rename-proof-anchors: D33's fallback, confirmed. Claim with --worktree "/Users/a1/Desktop/CS Code/Project/Mole-worktrees/T19-rename-proof-anchors" --owner mole-builder-6; merge main into the branch; keep the 0-wrong body-only version (frozen 88.9%, 0 wrong), log M9's real number, fresh review, integrate. No new options.
   b. T30-annotated-file-tree: done-when 2 is now M22b (harder questions, tool calls + time per arm; read its 0 start.md). Claim with --worktree "/Users/a1/Desktop/CS Code/Project/Mole-worktrees/T30-annotated-file-tree" --owner mole-builder-6 (review 1 already verified the build). Prior art first: how program-comprehension studies and code question-answering benchmarks choose and score questions. New key (m22b) labelled before any score, fresh subagents, >= 3 runs per arm.
   c. T32-team-pr-check: an options round on record → lines matching (precision 0.63, recall 0.52 vs 0.9 / 0.8). Claim with --worktree "/Users/a1/Desktop/CS Code/Project/Mole-worktrees/T32-team-pr-check" --owner mole-builder-6. Prior art first: traceability link recovery (information retrieval and embedding methods and how they're scored), co-change mining (e.g. Zimmermann's ROSE), scope globs as in CODEOWNERS, symbol anchors. Up to 3 options on the frozen key, targets unchanged; none passes → block again with the best real number.
   R0 for every task: tasks/<T>/4 log/prior-art.md (load the prior-art-first skill) before the checks-first commit or any new option.
4. Per task, the loop exactly as in HANDOFF 'Now' a-g: claim (cd "/Users/a1/Desktop/CS Code" && python3 systems/ledger --root Project/Mole --no-orca move tasks/<T> running --owner mole-builder-6 --git-worktree); FIRST commit = bench + key dated now + failing tests, nothing else (the key's truth comes from a different method than the code under test; if a write gate blocks test files, create them with a terminal heredoc and note it in the task's 2 insights.md); produce → run the checks → correct, at most 6 rounds; append every run to tasks/<T>/4 log/runs.jsonl with the metric id as key ({"metrics":{"M21":...}}); never edit the step-1 keys or tests (R2: tasks/<T>/4 log/key-changes.md + a fresh-subagent ruling); review by a FRESH subagent given only the contract + the diff (test diff first, P0-P2 each with a reproducer, at most 2 rounds); integrate: merge main into the task branch first, rerun the checks, then ledger move <T> integrated --merge <sha> --checks-result "npm run check on main → …". Independent tasks run in parallel, one worktree + one subagent each; integrate one at a time.
5. Shared files (packages/daemon/src/cli.ts, the MCP tool list in packages/mcp/src, root package.json + package-lock.json): one import + one call each, tests assert with toContain, never an exact set. git index.lock → wait 10 s and retry. Disk is ~21 GB free: npm ci only where needed, delete node_modules in a worktree once its task is integrated. Never push, publish, use Raymond's accounts or spend on paid APIs.
6. At every transition (claimed, submitted, verified, integrated, blocked) append one dated line to tasks/loop-report.md (append only) and run python3 context/agents/build_agents.py. After each integration also run: cd context/product-plan && python3 systems/resume/render_resume.py (don't edit that page or claims.json by hand). Write under '## Handoff notes' in context/agents/a9-mole-builder-6.md at each integration and before you stop: what you did, what's next, anything odd.
7. A miss is not a stop: log the real number, move that task to blocked with the cause (--cause … --decision-owner raymond) and go to the next task. Never loosen a check to go green (R7). Don't touch context/product-plan/*.md pages (the planning chat owns them).
8. Raymond is away: make reasonable choices and write assumptions in the task's 0 start.md or 2 insights.md. Final answer, 6 lines max: each task's state + metric vs target, and the path tasks/loop-report.md.
```

## Every builder chat has a main file (2026-10-29)

Raymond, 10-29: "is thre a page managing all the different executing worker agents active or upcoming. and also for each to have their own main file at least with sections including a main info/handoff, progress timeline, further work".

- Before launch, the launching chat adds the agent to `context/agents/registry.json` (chat id, ledger owner name, job, queue) and runs `python3 context/agents/build_agents.py`. The script fails if a running, submitted, verified or blocked task has an owner missing from the registry.
- The script writes `context/agents/<id>-<name>.md`. Sections 1-7 (main info + handoff, progress timeline, results, further work, needs you, helpers, Raymond's messages) are rebuilt from the Hermes chat store, the ledger and `tasks/loop_status.py`.
- As the builder, write your own notes under `## Handoff notes` at each checkpoint and before you stop: what you did, what's next and anything odd. The script keeps that part.
- Raymond sees every agent on `context/product-plan/5 Agents.html` and in the "Who's building" table of `0 Start here.html`. A task still marked 'running' after its chat stops shows as stale there.
- Overnight 10-29: a4-a7 are running and a8 wraps up; see the next section.

## Now (2026-10-28 21:10): build loop for L1–L3 (T11–T15)

Raymond, 10-28: "can we pls get started on building. lets say l2 l3 at least or anything before … keeping end goals checkpoints metrics benchamrs in midn as the loop goals, which the twitter articles describes". His note 3C1 line 672: "verificatn: sure thing u tell it to do actually done". The center is your understanding kept current as agents change code (D24, `context/product-plan/1 Mole start to finish.md`, "Your focus").

Prompt for a fresh builder chat opened on `/Users/a1/Desktop/CS Code/Project/Mole`:

```text
You are the Mole builder. Build T11–T15 through the ledger, as loops with goals you can't move.
1. Read AGENTS.md, context/0 start.md, context/1 takeaways.md (startup packet). Then tasks/loop-goals.json: end goals E1–E4, metrics M1–M5 with targets, benchmarks B1–B4, the task graph, checkpoints C1–C5, loop rules R1–R7, never-list. Run python3 tasks/loop_status.py.
2. Load skills: ledger, ledger-task-workflow, test-driven-development, verify-pyramid, code-work.
3. Order (graph): T11 and T12 in parallel (each in its own ledger worktree, one subagent each) → T13 and T14 → T15. Each task's contract is tasks/<T>/0 start.md (goal, done-when, boundary, checks, non-goals, proof, stop).
4. Per task, the loop (R1–R7):
   a. claim: cd "/Users/a1/Desktop/CS Code" && python3 systems/ledger --root Project/Mole --no-orca move tasks/<T> running --owner mole-builder --git-worktree
   b. FIRST commit = the check: bench script + key (dated now) + failing tests; nothing else. Benchmarks under context/ are in the main checkout only (/Users/a1/Desktop/CS Code/Project/Mole/context/...): copy what the bench needs into the package's bench/ in this commit.
   c. produce → run the checks → correct → repeat until green; append each run to tasks/<T>/4 log/runs.jsonl as {"time","commit","cmd","exit","metrics":{"M1":...}}; max 6 rounds; same failure 3 rounds → ledger blocked.
   d. never edit the keys/tests from step b (R2); log a needed change in tasks/<T>/4 log/key-changes.md.
   e. hand in: ledger move <T> submitted --report … --checks-result "<cmd> → <last runs.jsonl line>".
   f. review by a FRESH subagent (delegate_task with only the contract + the diff, not your transcript): test diff first, then code, P0–P2 with a reproducer each; it runs ledger move <T> verified --reviewer <its id> … or back to running with findings. Max 2 review rounds.
   g. integrate: ledger move <T> integrated --merge <sha> --checks-result "npm run check on main → …".
5. Checkpoints: after C2 and after C3, write tasks/loop-report.md (each metric's latest value vs target, what missed, what's next) and run python3 tasks/loop_status.py. C4: run mole check on Mole's last 13 changes and add the result to the report.
6. Never: PR comments/bot, structure-map work, a wiki generator, prototype/, publishing or pushing, Raymond's accounts. Don't touch context/product-plan/*.md pages (the planning chat owns them); report through tasks/ only.
7. Raymond may not be watching: make reasonable choices, state assumptions in the task's 0 start.md, stop on the task's stop rows. Final answer: 5 lines max = each task's state + metric vs target, and the path tasks/loop-report.md.
```

Live status: `python3 tasks/loop_status.py` · board: `cd "/Users/a1/Desktop/CS Code" && python3 systems/ledger --root Project/Mole --no-orca board`

## Earlier (2026-10-19): T1–T10, done or integrated

> 2026-10-19: T1 (engine, no UI) is GO. prototype/ is rejected; don't use it. The UI is an always-on ~half-screen split panel, not a sidebar; what else it covers is still open (context/1 takeaways §13), so T2 waits for T1 and for that answer.

Paste this into a fresh agent (Hermes, Claude Code or Codex) opened on `/Users/a1/Desktop/CS Code/Project/Mole`:

```text
You are building Mole, task T1 (M0 engine spike).
1. Read AGENTS.md, then context/0 start.md and context/1 takeaways.md (Mole startup packet).
2. Read tasks/T1-m0-engine-spike/0 start.md: goal, done-when, boundary, checks, non-goals, proof, stop. That file is the contract.
3. Background only if needed: context/product-plan/Sequence.html (build order, feature table) and context/product-plan/systems/plan.json (backend, review fixes).
4. Claim it: cd "/Users/a1/Desktop/CS Code" && python3 systems/ledger --root Project/Mole --no-orca move tasks/T1-m0-engine-spike running --owner <your name> --git-worktree
   Work only in that worktree. Setup: npm install. Check: npm run check (build + vitest; passes on main as of 2026-10-19).
5. Do not use prototype/ (rejected).
6. Fixture repo (read-only): ~/.hermes/hermes-agent/ui-tui (362 .ts/.tsx files under src).
7. Hand in: python3 systems/ledger --root Project/Mole --no-orca move tasks/T1-m0-engine-spike submitted --report "<diff summary>" --checks-result "npm run check → <result>"
   A different agent reviews (never review your own task).
Raymond may not be watching: make reasonable choices, state assumptions, stop on the task's stop rows.
```

## Build order (from context/product-plan/Sequence.html §6)

| task | milestone | state |
|---|---|---|
| T1-m0-engine-spike | M0 engine + indexer | ready |
| T2-m1-per-file-map | M1 daemon + wide map panel following the open file + mole_map | proposed (after T1) |
| — | M1.5 learner + token go/no-go gate | create after T2 |
| — | M2 anchors, bootstrap, layered canvas + drift, import diagrams | later |
| — | M3 edit + propagate, explanations, badges | later |
| — | M4 Claude plugin, MCP tools, hooks, agent panel, LangGraph flows | later |
| — | M5 activity capture + coverage map | later |
| — | M6 CI shared graph + PR architecture diff | later |

Board: `cd "/Users/a1/Desktop/CS Code" && python3 systems/ledger --root Project/Mole --no-orca board`
