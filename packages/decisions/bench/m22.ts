// M22 bench (T30): the annotated file tree.
//   --decorations-only   time decorations + intent cards for every folder of the Mole repo and of the backstage overlay (p95 <= 50 ms
//                        per folder from cached flags) and check done-when 4 (a folder with no records: no decoration, no card) plus the
//                        hand-labeled expectations in m22-key.json
//   --emit-tree FILE     write the tree's text (badges + intent cards) for the key's folder, its parents and decorated subfolders
//   --emit-prompts       write bench/m22/prompt-without.md and prompt-with.md from prompt-task.md (identical text; "with" adds the tree)
//   --score DIR          grade DIR/{with,without}-N.json by code: correct = cites the expected ADR id OR contains >= 2 key phrases
//   (no flag)            --decorations-only, then --score bench/m22/answers when answers exist
//   --metrics-out FILE   also write the metrics JSON
// The backstage overlay (bench/m22/overlay/.mole) is laid over an empty skeleton of the paths its records name, in a temp folder,
// so no clone is needed and the run is deterministic. No model or network calls (R6).
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decorationFor, intentCard, loadGraph, loadTree, treeText, type TreeIndex } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const benchDir = resolve(here, '../../bench');
const srcTreeDir = resolve(here, '../../src/tree');
const repoRoot = resolve(here, '../../../..');
const m22Dir = join(benchDir, 'm22');
const keyPath = join(benchDir, 'm22-key.json');

interface Question {
  id: string;
  expect: string;
  phrases: string[];
  text: string;
}
interface Recorded {
  folder: string;
  decisions: string[];
  exceptions?: Record<string, string[]>;
  replaced?: string[];
  purposeStartsWith: string | null;
  ask?: string[];
}
interface Side {
  recorded: Recorded[];
  noRecords: string[];
}
interface Key {
  written: string;
  folder: string;
  clone: { path: string; commit: string };
  questions: Question[];
  decorations: { targets: { p95MsPerFolder: number }; mole: Side; backstage: Side };
}
const key = JSON.parse(readFileSync(keyPath, 'utf8')) as Key;

// ---- R6: count fetch calls during the run; src/tree may not import a network client
let fetchCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
  fetchCalls++;
  return realFetch(...args);
}) as typeof fetch;

function networkImports(dir: string): string[] {
  const bad = /\bfetch\s*\(|from\s+['"](?:node:)?(?:http|https|http2|net|tls|dgram|undici)['"]|openai|anthropic|@ai-sdk|XMLHttpRequest|WebSocket/;
  const hits: string[] = [];
  if (!existsSync(dir)) return hits;
  for (const e of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!e.isFile() || !/\.[jt]s$/.test(e.name)) continue;
    const p = join(e.parentPath, e.name);
    if (bad.test(readFileSync(p, 'utf8'))) hits.push(p);
  }
  return hits;
}

// ---- the backstage overlay over an empty skeleton
function overlayRoot(): string {
  const base = join(process.env.TMPDIR ?? tmpdir(), '');
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, 'mole-m22-'));
  cpSync(join(m22Dir, 'overlay', '.mole'), join(root, '.mole'), { recursive: true });
  const g = loadGraph(root);
  const paths = new Set<string>();
  for (const n of g.nodes) for (const a of n.scope) paths.add(a.target.split('#')[0]!);
  for (const f of key.decorations.backstage.noRecords) paths.add(`${f}/`);
  for (const r of key.decorations.backstage.recorded) paths.add(`${r.folder}/`);
  for (const p of paths) {
    const abs = join(root, p);
    if (p.endsWith('/')) mkdirSync(abs, { recursive: true });
    else {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, '');
    }
  }
  return root;
}

function walkFolders(root: string, skip: (rel: string, name: string) => boolean): string[] {
  const out: string[] = [''];
  const walk = (rel: string) => {
    for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (skip(r, e.name)) continue;
      out.push(r);
      walk(r);
    }
  };
  walk('');
  return out;
}

/** Mole: every folder that holds a tracked file (git ls-files), plus its parents. */
function moleFolders(): string[] {
  const files = execFileSync('git', ['-C', repoRoot, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).split('\0').filter(Boolean);
  const set = new Set<string>(['']);
  for (const f of files) {
    const parts = f.split('/');
    for (let i = 1; i < parts.length; i++) set.add(parts.slice(0, i).join('/'));
  }
  return [...set].sort();
}

const pct = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
};

interface SideResult {
  folders: number;
  decorated: number;
  cards: number;
  flagsMs: number;
  buildMs: number;
  p50: number;
  p95: number;
  max: number;
  failures: string[];
}

function timeSide(name: string, root: string, folders: string[], side: Side): SideResult {
  const t0 = performance.now();
  const tree: TreeIndex = loadTree(root); // records + flags (git, files) + the index: done once, then cached
  const loadMs = performance.now() - t0;
  // warm-up pass (JIT), then the timed pass: decoration + card per folder, from the cached index
  for (const f of folders) {
    decorationFor(tree, f);
    intentCard(tree, f);
  }
  const times: number[] = [];
  let decorated = 0;
  let cards = 0;
  for (const f of folders) {
    const a = performance.now();
    const d = decorationFor(tree, f);
    const c = intentCard(tree, f);
    times.push(performance.now() - a);
    if (d) decorated++;
    if (c) cards++;
  }
  const failures: string[] = [];
  for (const f of side.noRecords) {
    if (!folders.includes(f)) failures.push(`${name}: no-records folder ${f} is not in the walked folders`);
    if (decorationFor(tree, f)) failures.push(`${name}: ${f} has no records but got a decoration`);
    if (intentCard(tree, f)) failures.push(`${name}: ${f} has no records but got a card`);
    const line = treeText(tree, f)
      .split('\n')
      .find((l) => new RegExp(`(^|[\\s/])${f.split('/').pop()!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?(\\s|$)`).test(l) && !/^\s*(Purpose|End state|Risk|Ask|Tenets|You)\b/.test(l));
    if (line) failures.push(`${name}: ${f} has no records but the tree text shows it: ${line.trim()}`);
  }
  for (const r of side.recorded) {
    const c = intentCard(tree, r.folder);
    const d = decorationFor(tree, r.folder);
    if (!c || !d) {
      failures.push(`${name}: ${r.folder} should have a card and a decoration`);
      continue;
    }
    const ids = c.decisions.map((x) => x.id);
    for (const id of r.decisions) if (!ids.includes(id)) failures.push(`${name}: ${r.folder} card lacks decision ${id} (has ${ids.join(', ')})`);
    for (const [id, exc] of Object.entries(r.exceptions ?? {})) {
      const got = [...(c.decisions.find((x) => x.id === id)?.exceptions ?? [])].sort();
      if (got.join() !== [...exc].sort().join()) failures.push(`${name}: ${r.folder} ${id} exceptions ${got.join(',')} != ${exc.join(',')}`);
    }
    for (const id of r.replaced ?? []) if (!c.replaced.some((x) => x.id === id)) failures.push(`${name}: ${r.folder} card should list ${id} as replaced`);
    if (r.purposeStartsWith === null && c.purpose !== undefined) failures.push(`${name}: ${r.folder} has no intent record but the card shows a purpose: ${c.purpose}`);
    if (r.purposeStartsWith !== null && !(c.purpose ?? '').startsWith(r.purposeStartsWith)) failures.push(`${name}: ${r.folder} purpose '${c.purpose}' does not start with '${r.purposeStartsWith}'`);
    for (const who of r.ask ?? []) if (!c.ask.includes(who)) failures.push(`${name}: ${r.folder} who-to-ask lacks ${who}`);
  }
  return { folders: folders.length, decorated, cards, flagsMs: Math.round(loadMs), buildMs: Math.round(loadMs), p50: pct(times, 50), p95: pct(times, 95), max: Math.max(0, ...times), failures };
}

function decorations(): { ok: boolean; metrics: Record<string, unknown> } {
  const target = key.decorations.targets.p95MsPerFolder;
  const mole = timeSide('mole', repoRoot, moleFolders(), key.decorations.mole);
  const oroot = overlayRoot();
  let back: SideResult;
  try {
    back = timeSide('backstage', oroot, walkFolders(oroot, (_r, n) => n === '.mole'), key.decorations.backstage);
  } finally {
    rmSync(oroot, { recursive: true, force: true });
  }
  const net = networkImports(srcTreeDir);
  const failures = [...mole.failures, ...back.failures];
  if (mole.p95 > target) failures.push(`mole: decorations p95 ${mole.p95.toFixed(3)} ms > ${target} ms`);
  if (back.p95 > target) failures.push(`backstage: decorations p95 ${back.p95.toFixed(3)} ms > ${target} ms`);
  if (net.length > 0) failures.push(`network/model client in src/tree: ${net.join(', ')}`);
  if (fetchCalls > 0) failures.push(`${fetchCalls} fetch calls during the bench`);
  const fmt = (s: SideResult) => `${s.folders} folders (${s.decorated} decorated, ${s.cards} cards) · load+flags+index ${s.flagsMs} ms once · per folder p50 ${s.p50.toFixed(3)} / p95 ${s.p95.toFixed(3)} / max ${s.max.toFixed(3)} ms`;
  console.log(`M22 decorations (target p95 <= ${target} ms per folder from cached flags)`);
  console.log(`  mole       ${fmt(mole)}`);
  console.log(`  backstage  ${fmt(back)} (overlay over an empty skeleton)`);
  console.log(`  done-when 4: ${key.decorations.mole.noRecords.length + key.decorations.backstage.noRecords.length} no-record folders checked · model/network calls ${fetchCalls}`);
  for (const f of failures) console.log(`  FAIL ${f}`);
  console.log(failures.length === 0 ? '  PASS' : `  ${failures.length} failure(s)`);
  const p95 = Math.max(mole.p95, back.p95);
  return {
    ok: failures.length === 0,
    metrics: {
      M22: `decorations p95 ${p95.toFixed(3)} ms per folder (mole ${mole.p95.toFixed(3)}, backstage ${back.p95.toFixed(3)}; target <= ${target}); proxy not run yet`,
      decorationsP95Ms: Number(p95.toFixed(3)),
      mole: { ...mole, failures: mole.failures.length },
      backstage: { ...back, failures: back.failures.length },
      failures,
      modelCalls: fetchCalls,
    },
  };
}

// ---- tree text + prompts
function emitTreeText(): string {
  const root = overlayRoot();
  try {
    const t = loadTree(root);
    const body = treeText(t, key.folder, { descendants: true });
    return `Annotated file tree (Mole) for ${key.folder}: each folder's badge counts the decisions in force on it or below; [green] in force + checked, [yellow] needs a look, [red] replaced or broken. Cards list each folder's decisions (records in .mole/, mapped to Backstage's ADRs in docs/architecture-decisions).\n\n${body}\n`;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function emitPrompts(): void {
  const task = readFileSync(join(m22Dir, 'prompt-task.md'), 'utf8');
  let base = task;
  for (const q of key.questions) base = base.replace(`{{${q.id}}}`, q.text);
  const without = base.replace('{{TREE_HINT}}', '').replace('{{TREE}}', '');
  const tree = emitTreeText();
  const withTree = base
    .replace('{{TREE_HINT}}', ' and the annotated file tree below')
    .replace('{{TREE}}', `\n## The annotated file tree for this folder\n\n\`\`\`text\n${tree.trimEnd()}\n\`\`\`\n`);
  writeFileSync(join(m22Dir, 'prompt-without.md'), without);
  writeFileSync(join(m22Dir, 'prompt-with.md'), withTree);
  console.log(`wrote ${join(m22Dir, 'prompt-without.md')} and prompt-with.md (tree: ${tree.split('\n').length} lines); {{ANSWER_FILE}} is left for the coordinator`);
}

// ---- scoring
export function mentionsAdr(text: string, id: string): boolean {
  const num = Number(/(\d+)$/.exec(id)?.[1] ?? NaN);
  if (!Number.isFinite(num)) return text.toLowerCase().includes(id.toLowerCase());
  return new RegExp(`\\badr[\\s_-]?0*${num}(?!\\d)`, 'i').test(text);
}

export function gradeAnswer(q: Question, a: { answer?: unknown; source?: unknown } | undefined): { correct: boolean; byId: boolean; phrases: string[] } {
  const text = `${String(a?.answer ?? '')} ${String(a?.source ?? '')}`;
  const low = text.toLowerCase();
  const phrases = q.phrases.filter((p) => low.includes(p.toLowerCase()));
  const byId = mentionsAdr(text, q.expect);
  return { correct: byId || phrases.length >= 2, byId, phrases };
}

function score(dir: string): { ok: boolean; metrics: Record<string, unknown> } {
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^(with|without)-\d+\.json$/.test(f)).sort() : [];
  const arms: Record<string, { runs: Record<string, number>; correct: number; total: number; perQuestion: Record<string, number> }> = {};
  const problems: string[] = [];
  for (const f of files) {
    const arm = f.startsWith('without') ? 'without' : 'with';
    const a = (arms[arm] ??= { runs: {}, correct: 0, total: 0, perQuestion: {} });
    let ans: Record<string, { answer?: unknown; source?: unknown }> = {};
    try {
      ans = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    } catch (e) {
      problems.push(`${f}: not JSON (${(e as Error).message}); scored 0`);
    }
    let n = 0;
    for (const q of key.questions) {
      const g = gradeAnswer(q, ans[q.id]);
      if (g.correct) n++;
      a.perQuestion[q.id] = (a.perQuestion[q.id] ?? 0) + (g.correct ? 1 : 0);
    }
    a.runs[f.replace(/\.json$/, '')] = n;
    a.correct += n;
    a.total += key.questions.length;
  }
  console.log(`M22 proxy score (${dir})`);
  for (const arm of ['with', 'without']) {
    const a = arms[arm];
    if (!a) {
      console.log(`  ${arm.padEnd(8)} no answers`);
      continue;
    }
    console.log(`  ${arm.padEnd(8)} ${a.correct}/${a.total} correct · runs ${Object.entries(a.runs).map(([k, v]) => `${k} ${v}/5`).join(', ')} · per question ${Object.entries(a.perQuestion).map(([k, v]) => `${k} ${v}`).join(' ')}`);
  }
  for (const p of problems) console.log(`  ${p}`);
  const ok = Boolean(arms.with && arms.without);
  return { ok, metrics: { M22proxy: Object.fromEntries(Object.entries(arms).map(([k, v]) => [k, `${v.correct}/${v.total}`])), arms, problems } };
}

function main(argv: string[]): number {
  const arg = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const metricsOut = arg('--metrics-out');
  let metrics: Record<string, unknown> = {};
  let ok = true;
  if (argv.includes('--emit-tree')) {
    const file = arg('--emit-tree');
    if (!file) throw new Error('--emit-tree needs a file');
    writeFileSync(file, emitTreeText());
    console.log(`wrote ${file}`);
    return 0;
  }
  if (argv.includes('--emit-prompts')) {
    emitPrompts();
    return 0;
  }
  if (argv.includes('--score')) {
    const r = score(resolve(arg('--score') ?? join(m22Dir, 'answers')));
    metrics = r.metrics;
    ok = r.ok;
  } else {
    const d = decorations();
    metrics = d.metrics;
    ok = d.ok;
    const answers = join(m22Dir, 'answers');
    if (!argv.includes('--decorations-only') && existsSync(answers) && readdirSync(answers).some((f) => f.endsWith('.json'))) {
      const s = score(answers);
      metrics = { ...metrics, ...s.metrics };
    }
  }
  if (metricsOut) writeFileSync(metricsOut, JSON.stringify(metrics, null, 2));
  return ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
