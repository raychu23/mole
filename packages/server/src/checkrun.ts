// Check-run computation per push (M25 "check-run compute < 60s"): which decisions the push
// touches, any obvious violation (a changed-scope file with no governing decision at all is
// reported as informational, never blocking — Mole's own rule is "flags, not gates").
import { execFileSync } from 'node:child_process';
import type { Pool } from './db.js';
import { getGoverningDecisions } from './graph.js';
import { writeOutboxInTx } from './outbox.js';

export interface CheckRunResult {
  ref: string;
  conclusion: 'success' | 'neutral';
  summary: string;
  governedFiles: number;
  ungovernedFiles: number;
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
    const result: CheckRunResult = {
      ref,
      conclusion: 'success',
      summary: `${governed} file(s) governed by a decision, ${ungoverned} not`,
      governedFiles: governed,
      ungovernedFiles: ungoverned,
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
