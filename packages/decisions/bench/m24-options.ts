// M24 options round (T32): score every combination of option 1 (content anchors, `match:`) and option 2 (version-bump
// rule) on (a) the frozen key + frozen overlay, (b) the frozen key + the v2 overlay (post-hoc: the v2 `match:` patterns were
// written after the round-1 misses were known), (c) the held-out key (m24-heldout-key.json, committed before scoring) + v2.
// The official check stays bench/m24.ts. In-process prCheck, history off (governed/owners/silent don't depend on it).
// usage: node packages/decisions/dist/bench/m24-options.js [--json FILE]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prCheck } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const benchDir = resolve(here, '../../bench');
const repoRoot = resolve(here, '../../../..');
interface KeyPr { repo: string; pr: number; base: string; head: string; governs: string[]; owners: string[]; silent: boolean }
interface Key { repos: Record<string, { clone: string; records: string }>; prs: KeyPr[] }
const load = (f: string) => JSON.parse(readFileSync(join(benchDir, f), 'utf8')) as Key;
const frozen = load('m24-key.json');
const heldout = load('m24-heldout-key.json');
const tilde = (p: string) => (p.startsWith('~/') ? join(homedir(), p.slice(2)) : p);
const cloneOf = (k: Key, repo: string) => resolve(process.env.MOLE_BENCH_T32_DIR ? join(process.env.MOLE_BENCH_T32_DIR, repo) : tilde(k.repos[repo]!.clone));
const overlay = (k: Key, repo: string, v2: boolean) => resolve(repoRoot, v2 ? k.repos[repo]!.records.replace('/bench/m24/', '/bench/m24v2/') : k.repos[repo]!.records);

const combos = [
  { name: 'none', contentAnchors: false, versionBumpRule: false, titleBumpGate: false, exportConventionGate: false, scopeNoiseFilter: false, tfBareBlockTitleGate: false },
  { name: '1', contentAnchors: true, versionBumpRule: false, titleBumpGate: false, exportConventionGate: false, scopeNoiseFilter: false, tfBareBlockTitleGate: false },
  { name: '2', contentAnchors: false, versionBumpRule: true, titleBumpGate: false, exportConventionGate: false, scopeNoiseFilter: false, tfBareBlockTitleGate: false },
  { name: '3', contentAnchors: false, versionBumpRule: false, titleBumpGate: true, exportConventionGate: false, scopeNoiseFilter: false, tfBareBlockTitleGate: false },
  { name: '1+3', contentAnchors: true, versionBumpRule: false, titleBumpGate: true, exportConventionGate: false, scopeNoiseFilter: false, tfBareBlockTitleGate: false },
  { name: '4 (export)', contentAnchors: false, versionBumpRule: false, titleBumpGate: true, exportConventionGate: true, scopeNoiseFilter: false, tfBareBlockTitleGate: false },
  { name: '5 (noise filter)', contentAnchors: false, versionBumpRule: false, titleBumpGate: true, exportConventionGate: false, scopeNoiseFilter: true, tfBareBlockTitleGate: false },
  { name: '6 (tf bare block)', contentAnchors: false, versionBumpRule: false, titleBumpGate: true, exportConventionGate: false, scopeNoiseFilter: false, tfBareBlockTitleGate: true },
  { name: '4+5+6 (round3)', contentAnchors: false, versionBumpRule: false, titleBumpGate: true, exportConventionGate: true, scopeNoiseFilter: true, tfBareBlockTitleGate: true },
  { name: '1+3+4+5+6 (all)', contentAnchors: true, versionBumpRule: false, titleBumpGate: true, exportConventionGate: true, scopeNoiseFilter: true, tfBareBlockTitleGate: true },
];
const sets = [
  { name: 'frozen key, frozen overlay', key: frozen, v2: false },
  { name: 'frozen key, v2 overlay (post-hoc)', key: frozen, v2: true },
  { name: 'held-out key, v2 overlay', key: heldout, v2: true },
];
const r2 = (x: number) => Math.round(x * 100) / 100;
const rows: Array<Record<string, unknown>> = [];
for (const s of sets)
  for (const c of combos) {
    let tp = 0, fp = 0, fn = 0, silentOk = 0, ownersOk = 0, n = 0;
    const errs: string[] = [];
    const per: Array<{ repo: string; pr: number; false_hits: string[]; misses: string[] }> = [];
    for (const p of s.key.prs) {
      const clone = cloneOf(s.key, p.repo);
      if (!existsSync(clone)) {
        errs.push(`missing clone ${clone}`);
        continue;
      }
      n++;
      try {
        const r = await prCheck({
          root: clone,
          recordsRoot: overlay(s.key, p.repo, s.v2),
          base: p.base,
          head: p.head,
          history: false,
          contentAnchors: c.contentAnchors,
          versionBumpRule: c.versionBumpRule,
          titleBumpGate: c.titleBumpGate,
          exportConventionGate: c.exportConventionGate,
          scopeNoiseFilter: c.scopeNoiseFilter,
          tfBareBlockTitleGate: c.tfBareBlockTitleGate,
        });
        const got = new Set(r.governed.map((g) => g.id));
        const want = new Set(p.governs);
        const fh = [...got].filter((x) => !want.has(x)).sort();
        const ms = [...want].filter((x) => !got.has(x)).sort();
        tp += [...got].filter((x) => want.has(x)).length;
        fp += fh.length;
        fn += ms.length;
        if (r.silent === p.silent) silentOk++;
        if (JSON.stringify([...r.owners].sort()) === JSON.stringify([...p.owners].sort())) ownersOk++;
        if (fh.length || ms.length) per.push({ repo: p.repo, pr: p.pr, false_hits: fh, misses: ms });
      } catch (e) {
        errs.push(`${p.repo}#${p.pr}: ${String(e).slice(0, 200)}`);
        fn += p.governs.length;
      }
    }
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    rows.push({ set: s.name, option: c.name, precision: r2(precision), recall: r2(recall), tp, fp, fn, silent: `${silentOk}/${n}`, owners: `${ownersOk}/${n}`, errors: errs, per });
  }
console.log('| key, overlay | option | precision | recall | tp/fp/fn | silent | owners |');
console.log('|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.set} | ${r.option} | ${r.precision} | ${r.recall} | ${r.tp}/${r.fp}/${r.fn} | ${r.silent} | ${r.owners} |`);
for (const r of rows) {
  const per = r.per as Array<{ repo: string; pr: number; false_hits: string[]; misses: string[] }>;
  if (per.length || (r.errors as string[]).length)
    console.log(`  [${r.set} / ${r.option}] ${per.map((p) => `${p.repo === 'backstage' ? 'bs' : 'gi'}#${p.pr}${p.false_hits.length ? ` +${p.false_hits.join(',')}` : ''}${p.misses.length ? ` -${p.misses.join(',')}` : ''}`).join(' ')}${(r.errors as string[]).length ? ` ERR ${(r.errors as string[]).join('; ')}` : ''}`);
}
const i = process.argv.indexOf('--json');
if (i > 0 && process.argv[i + 1]) writeFileSync(process.argv[i + 1]!, JSON.stringify(rows, null, 2));
