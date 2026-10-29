// T14 bench M4 (checks: `npm run check && node packages/questions/dist/bench/m4.js`).
// Scores questions() in code against bench/m4-key.json (written before the implementation; see its "scoring").
//   PAST-FIX TOP 3  every case whose key lists a past fix gets a matching past-fix question at rank <= 3
//   EMPTY           cases with no known facts get 0 questions
//   USELESS share   questions matching no key item of their case / all questions, target < 10%
//   CAP / GUARD     <= 3 questions per case; every guard-test key item is asked
//   model calls     0 (no model is configured or needed)
// Exit 0 only when every target is met. Writes dist/bench/metrics.json for the run log.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import type { Change } from '@mole/history';
import { MAX_QUESTIONS, questions, type Question, type QuestionKind } from '../src/index.js';

const distBench = dirname(fileURLToPath(import.meta.url));
const benchDir = resolve(distBench, '../../bench');
const moleRoot = execFileSync('git', ['-C', benchDir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const excalidraw = process.env.MOLE_BENCH_EXCALIDRAW ?? join(homedir(), '.hermes/cache/scratch/impact/excalidraw');

interface KeyItem { kind: QuestionKind; cites: string; mustMention?: string[] }
interface KeyCase {
  id: string;
  repo: 'excalidraw' | 'mole';
  change: { sha: string } | { diffFile: string; base: string };
  fixRule: string;
  notesRoot: string | null;
  expect: KeyItem[];
}
const key = JSON.parse(readFileSync(join(benchDir, 'm4-key.json'), 'utf8')) as { written: string; cases: KeyCase[] };

const samePrefix = (a: string | undefined, b: string): boolean => !!a && a.length >= 7 && (a.startsWith(b) || b.startsWith(a));
const clickable = (q: Question): boolean => typeof q.source?.file === 'string' && q.source.file.length > 0 && Number.isInteger(q.source.line) && q.source.line > 0;

function matches(q: Question, k: KeyItem): boolean {
  if (q.kind !== k.kind || !clickable(q)) return false;
  if (!(k.mustMention ?? []).every((w) => q.text.includes(w))) return false;
  if (k.kind === 'past-fix') return samePrefix(q.cites.sha, k.cites) && samePrefix(q.source.sha, k.cites);
  if (k.kind === 'note') return q.cites.note === k.cites;
  if (k.kind === 'guard-test') return q.cites.testFile === k.cites;
  return false;
}

const ORDER: Record<QuestionKind, number> = { 'past-fix': 0, note: 1, 'guard-test': 2, seen: 3 };

async function main(): Promise<number> {
  const out: string[] = [`M4 key written ${key.written}, ${key.cases.length} cases`];
  const fails: string[] = [];
  const emptyNotes = mkdtempSync(join(tmpdir(), 'mole-m4-nonotes-'));
  let total = 0;
  let useless = 0;
  let pfCases = 0;
  let pfTop3 = 0;
  let pfItems = 0;
  let pfItemsHit = 0;
  let emptyQuestions = 0;
  let modelCalls = 0;
  const orderBad: string[] = [];
  try {
    for (const c of key.cases) {
      const repo = c.repo === 'excalidraw' ? excalidraw : moleRoot;
      const change: Change = 'sha' in c.change ? { sha: c.change.sha } : { diffFile: resolve(benchDir, c.change.diffFile), base: c.change.base };
      const notesRoot = c.notesRoot ? resolve(benchDir, c.notesRoot) : emptyNotes;
      let qs: Question[] = [];
      let err = '';
      try {
        const r = await questions(repo, change, { fixRule: c.fixRule, notesRoot });
        qs = r.questions;
        modelCalls += r.modelCalls;
      } catch (e) {
        err = e instanceof Error ? e.message.split('\n')[0]! : String(e);
        fails.push(`${c.id}: error ${err}`);
      }
      // match each question to an unused key item
      const used = new Set<number>();
      const hit: boolean[] = qs.map((q) => {
        const i = c.expect.findIndex((k, j) => !used.has(j) && matches(q, k));
        if (i < 0) return false;
        used.add(i);
        return true;
      });
      total += qs.length;
      useless += hit.filter((h) => !h).length;
      if (qs.length > MAX_QUESTIONS) fails.push(`${c.id}: ${qs.length} questions > ${MAX_QUESTIONS}`);
      const pfKeys = c.expect.map((k, i) => ({ k, i })).filter((x) => x.k.kind === 'past-fix');
      if (pfKeys.length) {
        pfCases++;
        const top = qs.slice(0, 3).some((q, i) => hit[i] && q.kind === 'past-fix' && q.rank <= 3);
        if (top) pfTop3++;
        else fails.push(`${c.id}: no key past-fix question in the top 3`);
        pfItems += pfKeys.length;
        pfItemsHit += pfKeys.filter((x) => used.has(x.i)).length;
      }
      if (c.expect.length === 0) {
        emptyQuestions += qs.length;
        if (qs.length) fails.push(`${c.id}: ${qs.length} questions on a change touching nothing known`);
      }
      for (const [i, k] of c.expect.entries()) if (k.kind === 'guard-test' && !used.has(i)) fails.push(`${c.id}: guard-test ${k.cites} not asked`);
      for (const k of c.expect.filter((x) => x.kind === 'note')) if (!qs.some((q) => matches(q, k))) out.push(`  (${c.id}: note ${k.cites} not asked)`);
      // order diagnostic: kinds non-decreasing, except a guard-test that took the last slot
      const kinds = qs.map((q) => ORDER[q.kind]);
      const okOrder = kinds.every((v, i) => i === 0 || v >= kinds[i - 1]! || (i === kinds.length - 1 && qs[i]!.kind === 'guard-test'));
      if (!okOrder) orderBad.push(c.id);
      out.push(`${c.id}: ${qs.length} q${err ? `  ERROR ${err}` : ''}`);
      qs.forEach((q, i) => out.push(`  ${hit[i] ? 'ok ' : 'XX '}#${q.rank} [${q.kind}] ${q.text}  (source ${q.source.sha ? `${q.source.sha.slice(0, 10)} ` : ''}${q.source.file}:${q.source.line})`));
    }
  } finally {
    rmSync(emptyNotes, { recursive: true, force: true });
  }
  const share = total ? useless / total : 0;
  if (share >= 0.1) fails.push(`useless share ${(share * 100).toFixed(1)}% >= 10%`);
  if (modelCalls !== 0) fails.push(`model calls ${modelCalls}`);
  if (total === 0) fails.push('no questions at all');
  const m4 = `past-fix in top3 ${pfTop3}/${pfCases}, empty-case questions ${emptyQuestions}, useless share ${(share * 100).toFixed(1)}% (${useless}/${total})`;
  out.push(`M4 ${m4}; key past-fix items asked ${pfItemsHit}/${pfItems}; order ok ${key.cases.length - orderBad.length}/${key.cases.length}${orderBad.length ? ` (bad: ${orderBad.join(', ')})` : ''}; model calls ${modelCalls}`);
  console.log(out.join('\n'));
  writeFileSync(join(distBench, 'metrics.json'), JSON.stringify({ M4: m4, pastFixItems: `${pfItemsHit}/${pfItems}`, order: orderBad.length ? `bad ${orderBad.join(',')}` : 'ok', modelCalls }) + '\n');
  console.log(fails.length ? `bench: FAIL (${fails.join('; ')})` : 'bench: all targets met');
  return fails.length ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(2);
  },
);
