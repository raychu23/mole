// Check-run computation per push (M25 "check-run compute < 60s"): which decisions the push
// touches, any obvious violation (a changed-scope file with no governing decision at all is
// reported as informational, never blocking — Mole's own rule is "flags, not gates").
import { execFileSync } from 'node:child_process';
import type { CheckAnnotation } from '@mole/decisions';
import { prCheck } from '@mole/decisions';
import type { Pool } from './db.js';
import { getGoverningDecisions } from './graph.js';
import { writeOutboxInTx } from './outbox.js';

// git's well-known empty-tree object (present in every repository): used as prCheck's base
// when ref has no parent (the repo's root commit), so a push of the very first commit still
// gets a real diff (everything in it is "added") instead of prCheck failing on `ref^`.
const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export interface CheckRunResult {
  ref: string;
  // GitHub Checks API conclusion enum (success|failure|neutral|cancelled|timed_out|
  // action_required|stale|skipped — see Octokit's checks.create). Mole's own "flags, not
  // gates" rule (this file's own header comment, and packages/decisions/src/check/pr-check.ts's
  // buildCheckRun, which returns 'neutral' whether or not anything governs) means this is
  // ALWAYS 'neutral': a real content-anchor match is surfaced through annotations/summary, not
  // through a hard pass/fail verdict. T45 (2 insights.md): kept as a literal union of one value,
  // not widened to 'success' or 'action_required', because nothing in this codebase computes
  // those other than by a human editing a record's status — see this task's stop-rule note.
  conclusion: 'neutral';
  summary: string;
  governedFiles: number;
  ungovernedFiles: number;
  /** T45: prCheck's own per-decision-hit annotations (GitHub check-run annotation shape: path,
   *  start_line/end_line, annotation_level, title, message), carried through unmodified so the
   *  live push path surfaces exactly what `mole pr-check` already computes instead of discarding
   *  it before the check run is written. Empty when nothing governs this diff. (2 insights.md:
   *  minimal UX choice — title + per-decision annotation lines, not prCheck's full rich summary
   *  with owners/past-fixes/questions/record-changes sections, which stays CLI/PR-comment-only.) */
  annotations: CheckAnnotation[];
}

function changedFiles(repoDir: string, ref: string): string[] {
  try {
    return execFileSync('git', ['show', '--name-only', '--pretty=format:', ref], { cwd: repoDir, encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** ref's parent commit, or git's empty-tree sha when ref has no parent (a repo's root commit). */
function baseOf(repoDir: string, ref: string): string {
  try {
    return execFileSync('git', ['rev-parse', '--verify', `${ref}^`], { cwd: repoDir, encoding: 'utf8' }).trim();
  } catch {
    return EMPTY_TREE_SHA;
  }
}

export async function computeCheckRun(
  pool: Pool,
  orgId: string,
  repoDir: string,
  ref: string,
  telemetry: { withSpan: <T>(name: string, attrs: Record<string, unknown>, fn: () => Promise<T>) => Promise<T> } | undefined
): Promise<CheckRunResult> {
  const run = async () => {
  const files = changedFiles(repoDir, ref).filter((f) => f.startsWith('src/'));
    let governed = 0;
    let ungoverned = 0;
    for (const f of files) {
      const rows = await getGoverningDecisions(pool, orgId, f, { forOrg: orgId });
      if (rows.length > 0) governed++;
      else ungoverned++;
    }

    // T45: the live push path used to stop here and hardcode conclusion: 'success' — never
    // calling prCheck's governed/content-anchor computation, so a real match (T32) never
    // surfaced on the check run a team actually sees (context/product-plan/systems/metrics-proof/
    // m2-conflict/4 log/mole-capability-and-gap.md). Wire it in: same repo, same diff, prCheck's
    // own check-run title + annotations become this result's; a prCheck failure (e.g. an
    // unparseable ref) falls back to the file-count line and no annotations rather than losing
    // the push notification (M25 "0 lost notifications").
    let title = `${governed} file(s) governed by a decision, ${ungoverned} not`;
    let annotations: CheckAnnotation[] = [];
    try {
      const pr = await prCheck({ root: repoDir, base: baseOf(repoDir, ref), head: ref, history: false });
      title = pr.checkRun.output.title;
      annotations = pr.checkRun.output.annotations;
    } catch {
      // keep the file-count-only title and empty annotations computed above
    }

    const result: CheckRunResult = {
      ref,
      conclusion: 'neutral',
      summary: title,
      governedFiles: governed,
      ungovernedFiles: ungoverned,
      annotations,
    };
    const client = await pool.connect();
    try {
      await client.query('begin');
      await writeOutboxInTx(client, orgId, 'check_run', result, ref);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
    return result;
  };
  if (telemetry) return telemetry.withSpan('check_run.compute', { 'mole.org_id': orgId, 'mole.ref': ref }, run);
  return run();
}
