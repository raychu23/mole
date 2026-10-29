// M19 bench: decisions as rules. 10 planted violations (5 on Mole at fb240ab, 5 on Excalidraw at e7b5346), each one line
// inserted after a stated line, must be caught at exactly the key's file:line, citing the key's decision and the rule's
// record file:line. 5 controls (type-only, dynamic, except path, comment) must add nothing. The base trees and the live
// repo must be clean. Then Mole's CURRENT rules run on each of Mole's last 13 changes (tasks/c4-dogfood.json b2): a
// violation on a line that change added or modified is a false positive. Key: m19-key.json, frozen in the red commit.
// usage: node packages/decisions/dist/bench/m19.js [--details FILE] [--metrics-out FILE]
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRules, type RulesResult, type Violation } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const benchDir = resolve(here, '../../bench');
const repoRoot = resolve(here, '../../../..');
const key = JSON.parse(readFileSync(join(benchDir, 'm19-key.json'), 'utf8')) as Key;

interface Patch {
  id: string;
  tree: 'mole' | 'excalidraw';
  file: string;
  after: number;
  text: string;
  why: string;
  expect?: { decision: string; file: string; line: number; ruleAt: string };
}
interface Key {
  written: string;
  targets: Record<string, number>;
  trees: Record<'mole' | 'excalidraw', { sha: string }>;
  planted: Patch[];
  controls: Patch[];
  c4: { changes: string[]; realViolations: Array<{ sha: string; file: string; line: number; decision: string }> };
}

// ---- R6: count every network call made while the bench runs (rules are pure code: expected 0)
let fetchCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (...args: Parameters<typeof realFetch>) => {
  fetchCalls++;
  return realFetch(...args);
}) as typeof realFetch;

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

/** git archive <sha> of the source folders into dest (local object store only: no fetch, no network). */
function exportTree(gitDir: string, sha: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  // apps/ only when the tree has one: tasks/T27-decisions-as-rules/4 log/key-ruling-1.md #2
  const tar = execFileSync('git', ['-C', gitDir, 'archive', '--format=tar', sha, '--', ':(glob)packages/*/src/**', ...(execFileSync('git', ['-C', gitDir, 'ls-tree', '-d', '--name-only', sha, 'apps'], { encoding: 'utf8' }).trim() ? [':(glob)apps/*/src/**'] : [])], {
    maxBuffer: 1 << 30,
  });
  execFileSync('tar', ['-x', '-C', dest], { input: tar });
}

function copyDecisions(fromDotMole: string, root: string): void {
  rmSync(join(root, '.mole'), { recursive: true, force: true });
  cpSync(join(fromDotMole, 'decisions'), join(root, '.mole/decisions'), { recursive: true });
  if (existsSync(join(fromDotMole, 'tenets.md'))) cpSync(join(fromDotMole, 'tenets.md'), join(root, '.mole/tenets.md'));
}

/** insert one line after line `after` (1-based; 0 = before the first line) */
function insert(text: string, after: number, line: string): string {
  const lines = text.split('\n');
  lines.splice(after, 0, line);
  return lines.join('\n');
}

const vKey = (v: Violation) => `${v.file}:${v.line}:${v.decision.id}`;
const cites = (v: Violation, e: NonNullable<Patch['expect']>) =>
  v.file === e.file && v.line === e.line && v.decision.id === e.decision && v.decision.title.trim() !== '' && `${v.decision.file}:${v.decision.line}` === e.ruleAt;

/** lines a change added or modified (new side of git diff -U0 sha^ sha), as file -> set of lines */
function touched(sha: string): Map<string, Set<number>> {
  const diff = execFileSync('git', ['-C', repoRoot, 'diff', '-U0', '--no-color', '--no-ext-diff', `${sha}^`, sha], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const out = new Map<string, Set<number>>();
  let file: string | undefined;
  for (const l of diff.split('\n')) {
    if (l.startsWith('+++ ')) file = l === '+++ /dev/null' ? undefined : l.slice(6);
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(l);
    if (m && file) {
      const start = Number(m[1]);
      const n = m[2] === undefined ? 1 : Number(m[2]);
      const set = out.get(file) ?? new Set<number>();
      for (let i = 0; i < n; i++) set.add(start + i);
      out.set(file, set);
    }
  }
  return out;
}

async function main(): Promise<number> {
  const t0 = Date.now();
  const scratch = mkdtempSync(join(tmpdir(), 'mole-m19-'));
  const details: Record<string, unknown> = { written: key.written };
  const fails: string[] = [];
  try {
    const exc = process.env.MOLE_EXCALIDRAW ?? join(homedir(), '.hermes/cache/scratch/impact/excalidraw');
    if (!existsSync(join(exc, '.git'))) {
      console.error(`m19: Excalidraw clone not found at ${exc} (B4; set MOLE_EXCALIDRAW)`);
      return 2;
    }
    const gitDirs = { mole: repoRoot, excalidraw: exc };
    const overlays = { mole: join(repoRoot, '.mole'), excalidraw: join(benchDir, 'm19-excalidraw/.mole') };
    const bases: Record<string, string> = {};
    const baseRuns: Record<string, RulesResult> = {};
    for (const tree of ['mole', 'excalidraw'] as const) {
      const root = join(scratch, `base-${tree}`);
      exportTree(gitDirs[tree], key.trees[tree].sha, root);
      copyDecisions(overlays[tree], root);
      bases[tree] = root;
      const r = await checkRules(root);
      baseRuns[tree] = r;
      if (r.errors.length) fails.push(`${tree} base: rule errors ${r.errors.map((e) => `${e.file}:${e.line} ${e.message}`).join('; ')}`);
      if (r.violations.length) fails.push(`${tree} base ${key.trees[tree].sha.slice(0, 7)}: ${r.violations.length} violations ${r.violations.map(vKey).join(', ')}`);
      console.log(`base ${tree} ${key.trees[tree].sha.slice(0, 7)}: ${r.rules.length} rules, ${r.violations.length} violations, ${r.ms} ms`);
    }
    const live = await checkRules(repoRoot);
    console.log(`live repo: ${live.rules.length} rules, ${live.violations.length} violations, ${live.errors.length} errors, ${live.ms} ms`);
    if (live.errors.length || live.violations.length) fails.push(`live repo: ${live.errors.length} errors, ${live.violations.map(vKey).join(', ')}`);
    const baseViolations = Object.values(baseRuns).reduce((n, r) => n + r.violations.length, 0) + live.violations.length;

    const runPatch = async (p: Patch): Promise<RulesResult> => {
      const f = join(bases[p.tree]!, p.file);
      const orig = readFileSync(f, 'utf8');
      writeFileSync(f, insert(orig, p.after, p.text));
      try {
        return await checkRules(bases[p.tree]!);
      } finally {
        writeFileSync(f, orig);
      }
    };

    let caught = 0;
    let plantedFP = 0;
    const planted: unknown[] = [];
    for (const p of key.planted) {
      const r = await runPatch(p);
      const e = p.expect!;
      const hit = r.violations.find((v) => cites(v, e));
      const extra = r.violations.filter((v) => !(v.file === e.file && v.line === e.line && v.decision.id === e.decision));
      if (hit) caught++;
      else fails.push(`${p.id} missed: want ${e.file}:${e.line} ${e.decision} @ ${e.ruleAt}; got ${r.violations.map((v) => `${vKey(v)} @ ${v.decision.file}:${v.decision.line}`).join(', ') || 'nothing'}`);
      plantedFP += extra.length;
      if (extra.length) fails.push(`${p.id} extra: ${extra.map(vKey).join(', ')}`);
      planted.push({ id: p.id, caught: !!hit, got: r.violations, ms: r.ms });
      console.log(`${p.id} ${hit ? 'caught' : 'MISSED'} ${e.file}:${e.line} ${e.decision}${extra.length ? ` +${extra.length} extra` : ''} (${r.ms} ms)`);
    }

    let controlViolations = 0;
    const controls: unknown[] = [];
    for (const c of key.controls) {
      const r = await runPatch(c);
      controlViolations += r.violations.length;
      if (r.violations.length) fails.push(`${c.id} control flagged: ${r.violations.map(vKey).join(', ')}`);
      controls.push({ id: c.id, got: r.violations });
      console.log(`${c.id} control ${r.violations.length ? `FLAGGED ${r.violations.map(vKey).join(', ')}` : 'clean'} (${c.why})`);
    }

    let c4FP = 0;
    let c4Violations = 0;
    const c4: unknown[] = [];
    const real = new Set(key.c4.realViolations.map((x) => `${x.sha}:${x.file}:${x.line}:${x.decision}`));
    for (const sha of key.c4.changes) {
      const root = join(scratch, `c4-${sha.slice(0, 10)}`);
      exportTree(repoRoot, sha, root);
      copyDecisions(join(repoRoot, '.mole'), root);
      const r = await checkRules(root);
      const lines = touched(sha);
      const unexpected = r.violations.filter((v) => !real.has(`${sha}:${vKey(v)}`));
      const fp = unexpected.filter((v) => lines.get(v.file)?.has(v.line));
      c4FP += fp.length;
      c4Violations += unexpected.length;
      if (r.errors.length) fails.push(`c4 ${sha.slice(0, 7)}: rule errors`);
      if (unexpected.length) fails.push(`c4 ${sha.slice(0, 7)}: ${unexpected.map(vKey).join(', ')}${fp.length ? ` (${fp.length} on changed lines)` : ''}`);
      c4.push({ sha, violations: r.violations, falsePositives: fp, ms: r.ms });
      console.log(`c4 ${sha.slice(0, 7)}: ${r.violations.length} violations, ${fp.length} false positives on changed lines (${r.ms} ms)`);
      rmSync(root, { recursive: true, force: true });
    }

    const t = key.targets;
    const metrics = {
      caught,
      planted: key.planted.length,
      plantedFalsePositives: plantedFP,
      controlViolations,
      c4FalsePositives: c4FP,
      c4Violations,
      c4Changes: key.c4.changes.length,
      baseViolations,
      modelCalls: fetchCalls,
      ms: Date.now() - t0,
    };
    if (caught < t.caught!) fails.push(`caught ${caught} < ${t.caught}`);
    if (fetchCalls > t.modelCalls!) fails.push(`${fetchCalls} network calls`);
    if (plantedFP > t.plantedFalsePositives! || controlViolations > t.controlViolations! || c4FP > t.c4FalsePositives! || c4Violations > t.c4Violations! || baseViolations > t.baseViolations!)
      fails.push('false positive targets missed');
    const line = `M19: caught ${caught}/${key.planted.length} citing decision, false positives ${c4FP} on ${key.c4.changes.length} changes (planted extras ${plantedFP}, controls ${controlViolations}, c4 violations ${c4Violations}, base ${baseViolations}, network calls ${fetchCalls}, ${metrics.ms} ms)`;
    console.log(line);
    for (const f of [...new Set(fails)]) console.log(`FAIL ${f}`);
    Object.assign(details, { metrics, planted, controls, c4, fails });
    const d = arg('--details');
    if (d) writeFileSync(d, JSON.stringify(details, null, 2));
    const mo = arg('--metrics-out');
    if (mo) writeFileSync(mo, JSON.stringify({ M19: `caught ${caught}/${key.planted.length} citing decision, false positives ${c4FP} on ${key.c4.changes.length} changes`, ...metrics }));
    return fails.length ? 1 : 0;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof Error ? e.stack : e);
    process.exit(2);
  },
);
