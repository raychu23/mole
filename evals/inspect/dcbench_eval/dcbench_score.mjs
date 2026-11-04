// T90 v2 scorer adapter (follow-up to the FAIL review; renamed from the T63 score.mjs it is copied from,
// which is left untouched at its original path): scores ONE finished dcbench worktree with dcbench's own
// scorer (benchmark/scorer.ts, unchanged, pinned 9f507ce).
//
// DISCLOSED DEVIATION from the T63 harness (orchestrator-verified 2026-11-04, error-analysis-72.md):
// dcbench's own `grep_diff` check (benchmark/scorer.ts's evaluateGrepDiff) reads `context.diff`, which is
// plain `git diff` -- this NEVER shows the content of files the agent newly created (git only diffs
// tracked content; a new path is invisible to `git diff` until it is staged). 60/111 (54%) of T63's 72
// failed gotchas were this artefact alone, evenly split across arms (error-analysis-72.md, finding #1).
// Fix: `git add --intent-to-add --all` (`git add -N`) before computing the diff. Per git-add(1): "Record
// only the fact that the path will be added later... This is used to, among other things, show the
// unstaged content of such files with `git diff`." After `-N`, a brand-new file's full content appears as
// an addition in plain `git diff`, exactly as if it had been `git add`-ed, without staging its actual
// bytes (https://git-scm.com/docs/git-add, "--intent-to-add"). This also fixes scorer.ts's own internal
// `git diff -- <target>` calls for scoped `grep_diff` checks (evaluateGrepDiff), since they run against
// the same now-intent-to-added worktree. scorer.ts ITSELF is not modified; only this adapter's
// pre-diff step changes, which is why this is a disclosed harness deviation, not an upstream patch.
//
// Diff capture + expected-files gate follow benchmark/runner.ts:284-307 and :227-253 (runner.ts itself
// can't be imported here: its value imports have no file extensions). globToRegex is not exported by
// scorer.ts, so a byte copy of scorer.ts with one appended `export { globToRegex }` line is written next
// to it at runtime (never edited).
//
// Usage: node --experimental-strip-types --no-warnings dcbench_score.mjs <dcbench repo> <worktree> <TASK-id> -> JSON on stdout.
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [repo, wt, taskId] = process.argv.slice(2);
const tmp = mkdtempSync(join(tmpdir(), 'dcb-score-'));
writeFileSync(join(tmp, 'scorer.ts'), readFileSync(join(repo, 'benchmark/scorer.ts'), 'utf8') + '\nexport { globToRegex };\n');
const { scoreTask, globToRegex } = await import(join(tmp, 'scorer.ts'));
const { BENCHMARK_TASKS } = await import(join(repo, 'benchmark/tasks.ts'));
const task = BENCHMARK_TASKS.find((t) => t.taskId === taskId);
if (!task) throw new Error(`no task ${taskId}`);
// v2 fix: stage new paths as intent-to-add BEFORE any diffing, so grep_diff sees new-file content too.
try { execSync(`git -C "${wt}" add --intent-to-add --all`, { stdio: 'pipe' }); } catch {}
let diff = '';
let diffFileList = [];
try {
  diff = execSync(`git -C "${wt}" diff`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, stdio: 'pipe' });
  diffFileList = execSync(`git -C "${wt}" diff --name-only`, { encoding: 'utf-8', stdio: 'pipe' }).trim().split('\n').filter(Boolean);
} catch {}
let untracked = [];
try { untracked = execSync(`git -C "${wt}" ls-files --others --exclude-standard`, { encoding: 'utf-8', stdio: 'pipe' }).trim().split('\n').filter(Boolean); } catch {}
const all = [...diffFileList, ...untracked];
const expectedFilesMatched = task.expectedFiles.some((p) => all.some((f) => globToRegex(p).test(f)));
const gotchaResults = scoreTask(task, { diff, diffFileList, worktreePath: wt });
const earned = gotchaResults.filter((g) => g.passed).reduce((s, g) => s + g.weight, 0);
console.log(JSON.stringify({ taskId, earned, max: task.maxScore, percentage: task.maxScore ? (earned / task.maxScore) * 100 : 0, expectedFilesMatched,
  mergeReady: expectedFilesMatched && earned === task.maxScore, blockingViolations: gotchaResults.filter((g) => !g.passed && g.weight === 3).length,
  gotchaResults, diffFiles: diffFileList, untracked, fullDiff: diff }));
