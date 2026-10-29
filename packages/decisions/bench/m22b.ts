// M22b bench (T30, harder questions, Raymond 10-29 "sure t30 harder questions"): does the annotated file tree save
// search effort when BOTH arms already have the same repo + the same decision records on disk? M22's proxy hid the
// backstage ADRs from the without arm entirely, which tied 15/15 vs 15/15 at the ceiling (4 log/ledger.md 07:19).
// M22b gives both arms the full docs/architecture-decisions folder (16 ADRs, 9 of them actually governing
// plugins/notifications) and asks 9 "why" questions whose answers sit only in those ADR texts (checked against the
// code: no ADR id or its reasoning appears in any source file's comments, see bench/m22b-key.json "how"). The WITH
// arm additionally gets the tree's badges + intent cards (pre-filtered to the governing ADRs). Target: more correct
// with the tree, OR the same correct in <= half the tool calls (loop-goals.json M22, T30 done-when 2).
//
//   --emit-prompts         write bench/m22b/prompt-without.md and prompt-with.md from prompt-task.md
//   --run N                run N fresh `hermes chat --oneshot` subagents per arm (2N total, claude-sonnet-5), save
//                           bench/m22b/answers/{arm}-i.json
//   --score DIR            grade DIR/{with,without}-N.json by code (reuses m22.ts's mentionsAdr/gradeAnswer, R2)
//   (no flag)               --score bench/m22b/answers if answers exist, else report what's missing
//   --metrics-out FILE     also write the metrics JSON
// No model or network call happens in the grading path (R6): the `hermes chat` subagents are the thing under test,
// not part of the score; the score is plain substring/ID matching, same as M22.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeAnswer, mentionsAdr } from './m22.js';
import { loadTree, treeText } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const benchDir = resolve(here, '../../bench');
const m22bDir = join(benchDir, 'm22b');
const keyPath = join(benchDir, 'm22b-key.json');
const overlayMole = join(benchDir, 'm22', 'overlay', '.mole'); // reused as-is (R2: the m22 overlay is untouched)
const clonePath = resolve(process.env.HOME ?? '', '.hermes/cache/scratch/mole-builder-4/backstage');

interface Question {
  id: string;
  folder: string;
  expect: string;
  phrases: string[];
  text: string;
}
interface Key {
  written: string;
  clone: { path: string; commit: string };
  questions: Question[];
}
const key = JSON.parse(readFileSync(keyPath, 'utf8')) as Key;

function emitTreeText(): string {
  // the badges + intent cards for plugins/notifications and its governing subfolders, built from the same overlay
  // .mole records m22.ts already maintains (adr003/004/006/007/010/011/012/013/014), laid over an empty skeleton of
  // the scoped paths so no second clone is needed.
  const base = join(process.env.TMPDIR ?? tmpdir(), '');
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, 'mole-m22b-'));
  try {
    cpSync(overlayMole, join(root, '.mole'), { recursive: true });
    const paths = [
      'plugins/notifications',
      'plugins/notifications/src',
      'plugins/notifications/src/api',
      'plugins/notifications/src/components',
      'plugins/notifications/src/hooks',
      'plugins/notifications/src/utils',
      'plugins/notifications/dev',
    ];
    for (const p of paths) mkdirSync(join(root, p), { recursive: true });
    const t = loadTree(root);
    const body = treeText(t, 'plugins/notifications', { descendants: true });
    return `Annotated file tree (Backstage) for plugins/notifications: each folder's badge counts the decisions in force on it or below; [green] in force + checked, [yellow] needs a look, [red] replaced or broken. Cards list each folder's decisions (ADRs mapped 1:1 from docs/architecture-decisions).\n\n${body}\n`;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function emitPrompts(): void {
  const task = readFileSync(join(m22bDir, 'prompt-task.md'), 'utf8');
  let base = task;
  for (const q of key.questions) base = base.replace(`{{${q.id}}}`, q.text);
  const without = base.replace('{{TREE_HINT}}', '').replace('{{TREE}}', '');
  const tree = emitTreeText();
  const withTree = base
    .replace('{{TREE_HINT}}', ' and the annotated file tree below')
    .replace('{{TREE}}', `\n## The annotated file tree for plugins/notifications\n\n\`\`\`text\n${tree.trimEnd()}\n\`\`\`\n`);
  mkdirSync(m22bDir, { recursive: true });
  writeFileSync(join(m22bDir, 'prompt-without.md'), without);
  writeFileSync(join(m22bDir, 'prompt-with.md'), withTree);
  console.log(`wrote ${join(m22bDir, 'prompt-without.md')} and prompt-with.md (tree: ${tree.split('\n').length} lines)`);
}

// ---- running real fresh subagents: one `hermes chat --oneshot` call per run, in the read-only backstage clone, no
// --resume/--continue so each is a genuinely fresh session (R6: toolCalls/durationMs below come from the CLI's own
// stream-json events -- a count of tool_use events and the result event's own duration_ms, not a model self-report).
// Model pinned to claude-sonnet-5 (the project's default for spawned/delegated subagents). -t terminal restricts the
// session to the shell tool only: no browser/web-search toolset is offered, backing the prompt's "no network" rule.
function runOne(arm: 'with' | 'without', n: number): { ok: boolean; file: string; error?: string } {
  const promptFile = join(m22bDir, `prompt-${arm}.md`);
  if (!existsSync(promptFile)) throw new Error(`missing ${promptFile}; run --emit-prompts first`);
  const promptTmp = join(m22bDir, `.prompt-${arm}-${n}.txt`);
  mkdirSync(dirname(promptTmp), { recursive: true });
  writeFileSync(promptTmp, readFileSync(promptFile, 'utf8'));
  const outFile = join(m22bDir, 'answers', `${arm}-${n}.json`);
  mkdirSync(dirname(outFile), { recursive: true });
  try {
    const raw = execFileSync(
      'hermes',
      ['chat', '--query-file', promptTmp, '--in', clonePath, '-m', 'claude-sonnet-5', '--provider', 'anthropic', '-Q', '--oneshot', '-t', 'terminal', '--format', 'stream-json'],
      { cwd: clonePath, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: 15 * 60 * 1000 },
    );
    const lines = raw.split('\n').filter((l) => l.trim().startsWith('{'));
    let toolCalls = 0;
    let text = '';
    let durationMs = 0;
    for (const line of lines) {
      let ev: { type?: string; text?: string; duration_ms?: number } = {};
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.type === 'tool_use') toolCalls++;
      if (ev.type === 'result') {
        text = ev.text ?? text;
        durationMs = ev.duration_ms ?? durationMs;
      }
    }
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const answers = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    writeFileSync(outFile, JSON.stringify({ answers, meta: { arm, run: n, numTurns: toolCalls, durationMs } }, null, 2));
    return { ok: true, file: outFile };
  } catch (e) {
    const msg = (e as Error).message;
    writeFileSync(outFile, JSON.stringify({ answers: {}, meta: { arm, run: n, error: msg } }, null, 2));
    return { ok: false, file: outFile, error: msg };
  }
}

function runAll(n: number): void {
  if (!existsSync(clonePath)) throw new Error(`backstage clone missing at ${clonePath}; it is read-only input, not rebuilt by this bench`);
  for (const arm of ['with', 'without'] as const) {
    for (let i = 1; i <= n; i++) {
      console.log(`running ${arm}-${i} ...`);
      const r = runOne(arm, i);
      console.log(r.ok ? `  wrote ${r.file}` : `  FAILED ${r.file}: ${r.error}`);
    }
  }
}

// ---- scoring (reuses m22.ts's gradeAnswer/mentionsAdr unchanged, R2)
interface ArmResult {
  runs: Record<string, { correct: number; numTurns: number; durationMs: number }>;
  correct: number;
  total: number;
  numTurns: number;
  durationMs: number;
  n: number;
}

function score(dir: string): { ok: boolean; metrics: Record<string, unknown> } {
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^(with|without)-\d+\.json$/.test(f)).sort() : [];
  const arms: Record<string, ArmResult> = {};
  const problems: string[] = [];
  for (const f of files) {
    const arm = f.startsWith('without') ? 'without' : 'with';
    const a = (arms[arm] ??= { runs: {}, correct: 0, total: 0, numTurns: 0, durationMs: 0, n: 0 });
    let doc: { answers?: Record<string, { answer?: unknown; source?: unknown }>; meta?: { numTurns?: number; durationMs?: number; error?: string } } = {};
    try {
      doc = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    } catch (e) {
      problems.push(`${f}: not JSON (${(e as Error).message}); scored 0`);
    }
    if (doc.meta?.error) problems.push(`${f}: run error: ${doc.meta.error}`);
    let n = 0;
    for (const q of key.questions) {
      const g = gradeAnswer(q, doc.answers?.[q.id]);
      if (g.correct) n++;
    }
    const numTurns = doc.meta?.numTurns ?? 0;
    const durationMs = doc.meta?.durationMs ?? 0;
    a.runs[f.replace(/\.json$/, '')] = { correct: n, numTurns, durationMs };
    a.correct += n;
    a.total += key.questions.length;
    a.numTurns += numTurns;
    a.durationMs += durationMs;
    a.n += 1;
  }
  console.log(`M22b score (${dir}) -- ${key.questions.length} questions/run`);
  const fmtArm = (name: string) => {
    const a = arms[name];
    if (!a) {
      console.log(`  ${name.padEnd(8)} no answers`);
      return;
    }
    const avgTurns = a.n ? (a.numTurns / a.n).toFixed(1) : '0';
    const avgMs = a.n ? Math.round(a.durationMs / a.n) : 0;
    console.log(
      `  ${name.padEnd(8)} ${a.correct}/${a.total} correct (${a.n} runs) · avg tool calls (num_turns) ${avgTurns} · avg time ${avgMs} ms · ` +
        `per run ${Object.entries(a.runs).map(([k, v]) => `${k}:${v.correct}/${key.questions.length}(${v.numTurns}t,${v.durationMs}ms)`).join(' ')}`,
    );
  };
  fmtArm('with');
  fmtArm('without');
  for (const p of problems) console.log(`  ${p}`);
  const withA = arms.with;
  const withoutA = arms.without;
  let verdict = 'not enough runs to judge';
  let targetMet = false;
  if (withA && withoutA && withA.n >= 3 && withoutA.n >= 3) {
    const moreCorrect = withA.correct > withoutA.correct;
    const sameCorrectFewerCalls = Boolean(withA.correct >= withoutA.correct && withA.n && withoutA.n && withA.numTurns / withA.n <= withoutA.numTurns / withoutA.n / 2);
    targetMet = moreCorrect || sameCorrectFewerCalls;
    verdict = moreCorrect
      ? `PASS: more correct with the tree (${withA.correct}/${withA.total} vs ${withoutA.correct}/${withoutA.total})`
      : sameCorrectFewerCalls
        ? `PASS: same/better correctness (${withA.correct}/${withA.total} vs ${withoutA.correct}/${withoutA.total}) in <= half the tool calls (${(withA.numTurns / withA.n).toFixed(1)} vs ${(withoutA.numTurns / withoutA.n).toFixed(1)})`
        : `MISS: with ${withA.correct}/${withA.total} (${(withA.numTurns / withA.n).toFixed(1)} avg calls) vs without ${withoutA.correct}/${withoutA.total} (${(withoutA.numTurns / withoutA.n).toFixed(1)} avg calls) -- neither more correct nor <= half the calls`;
  }
  console.log(`  ${verdict}`);
  const ok = Boolean(withA && withoutA && withA.n >= 3 && withoutA.n >= 3 && targetMet);
  return {
    ok,
    metrics: {
      M22b: verdict,
      arms: Object.fromEntries(
        Object.entries(arms).map(([k, v]) => [
          k,
          { correct: v.correct, total: v.total, runs: v.n, avgToolCalls: v.n ? v.numTurns / v.n : 0, avgTimeMs: v.n ? v.durationMs / v.n : 0, perRun: v.runs },
        ]),
      ),
      targetMet,
      problems,
    },
  };
}

function main(argv: string[]): number {
  const arg = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const metricsOut = arg('--metrics-out');
  let metrics: Record<string, unknown> = {};
  let ok = true;
  if (argv.includes('--emit-prompts')) {
    emitPrompts();
    return 0;
  }
  if (argv.includes('--run')) {
    const n = Number(arg('--run') ?? '3');
    if (!Number.isFinite(n) || n < 1) throw new Error('--run needs a positive integer');
    if (!existsSync(join(m22bDir, 'prompt-with.md'))) emitPrompts();
    runAll(n);
    const r = score(join(m22bDir, 'answers'));
    metrics = r.metrics;
    ok = r.ok;
  } else if (argv.includes('--score')) {
    const r = score(resolve(arg('--score') ?? join(m22bDir, 'answers')));
    metrics = r.metrics;
    ok = r.ok;
  } else {
    const dir = join(m22bDir, 'answers');
    if (existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.json'))) {
      const r = score(dir);
      metrics = r.metrics;
      ok = r.ok;
    } else {
      console.log('M22b: no answers yet. Run with --emit-prompts then --run N, or --score DIR.');
      ok = false;
    }
  }
  if (metricsOut) writeFileSync(metricsOut, JSON.stringify(metrics, null, 2));
  return ok ? 0 : 1;
}

void mentionsAdr;
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
