// M30 bench (loop rule R4): seeded-flaw recall + real-record false-flag rate (M30a) and evidence-link precision
// (M30b). Key is hand-labeled in m30-key.json, dated before this script runs against real code (R1/R2: this file
// may change; m30-key.json and bench/seeded/*.md may not, once reviewed — see 4 log/key-changes.md for exceptions).
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAllRecords } from '../src/record-check.js';
import type { Finding } from '../src/types.js';

const here = dirname(fileURLToPath(import.meta.url));
// this file runs from dist/bench; the source tree (bench/seeded, bench/m30-key.json) sits one level up from dist
const srcBench = resolve(here, '../../bench');
const root = resolve(here, '../../../../'); // packages/intake/dist/bench -> repo root

interface Key {
  targets: { seededRecallMin: number; realFalseFlagsMax: number; evidencePrecisionPct: number };
  seeded: Record<string, { expect: string[] }>;
  real: Record<string, { expect: string[] }>;
}

function gitObjectExists(sha: string): boolean {
  try {
    execFileSync('git', ['-C', root, 'cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function evidenceIsReal(f: Finding): { total: number; real: number } {
  let real = 0;
  for (const e of f.evidence) {
    if (e.kind === 'commit' && e.commit && gitObjectExists(e.commit)) real++;
    else if (e.kind === 'file_line' && e.file && existsSync(join(root, e.file)) && (e.line ?? 0) >= 1) real++;
    else if (e.kind === 'transcript' && e.transcriptId) real++;
  }
  return { total: f.evidence.length, real };
}

async function main(): Promise<number> {
  const key: Key = JSON.parse(readFileSync(join(srcBench, 'm30-key.json'), 'utf8'));
  const seededDir = join(srcBench, 'seeded');
  const realDecisionsDir = join(root, '.mole', 'decisions');
  const seededFiles = readdirSync(seededDir).filter((f) => f.endsWith('.md'));
  const copied: string[] = [];
  let findings: Finding[] = [];
  let evTotal = 0;
  let evReal = 0;
  try {
    for (const f of seededFiles) {
      const dest = join(realDecisionsDir, f);
      copyFileSync(join(seededDir, f), dest);
      copied.push(dest);
    }
    findings = checkAllRecords(root);
    for (const f of findings) {
      const r = evidenceIsReal(f);
      evTotal += r.total;
      evReal += r.real;
    }
  } finally {
    for (const p of copied) if (existsSync(p)) unlinkSync(p);
  }

  const byRecord = new Map<string, Finding[]>();
  for (const f of findings) byRecord.set(f.recordId, [...(byRecord.get(f.recordId) ?? []), f]);

  const seededIds = Object.keys(key.seeded);
  const caughtSeeded = seededIds.filter((id) => {
    const expect = new Set(key.seeded[id]!.expect);
    const got = byRecord.get(id) ?? [];
    return got.some((f) => expect.has(f.check));
  });
  const missedSeeded = seededIds.filter((id) => !caughtSeeded.includes(id));

  const realIds = Object.keys(key.real);
  const falseFlagged = realIds.filter((id) => (byRecord.get(id) ?? []).length > 0);

  const evidencePrecisionPct = evTotal === 0 ? 100 : Math.round((evReal / evTotal) * 10000) / 100;

  const metrics = {
    seededCaught: caughtSeeded.length,
    seededTotal: seededIds.length,
    seededMissed: missedSeeded,
    realFalseFlags: falseFlagged.length,
    realFalseFlaggedIds: falseFlagged,
    evidencePrecisionPct,
    evidenceTotal: evTotal,
    evidenceReal: evReal,
  };

  const ok = metrics.seededCaught >= key.targets.seededRecallMin && metrics.realFalseFlags <= key.targets.realFalseFlagsMax && evidencePrecisionPct >= key.targets.evidencePrecisionPct;

  console.log(JSON.stringify({ metric: 'M30', ok, metrics, targets: key.targets }, null, 2));

  // R4: append one run line (time, commit, cmd, exit, metrics)
  try {
    const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const runsDir = join(root, 'tasks', 'T23-decision-traces-intake', '4 log');
    mkdirSync(runsDir, { recursive: true });
    const line = JSON.stringify({ time: new Date().toISOString(), commit, cmd: 'node packages/intake/dist/bench/m30.js', exit: ok ? 0 : 1, metrics: { M30: metrics } });
    writeFileSync(join(runsDir, 'runs.jsonl'), `${line}\n`, { flag: 'a' });
  } catch (e) {
    console.error(`m30: could not append runs.jsonl: ${(e as Error).message}`);
  }

  return ok ? 0 : 1;
}

main().then((code) => process.exit(code));
