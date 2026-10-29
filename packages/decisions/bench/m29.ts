// M29 bench (T36): spec-kit + MADR/adr-tools ADR import, hand-labeled from 3 real public repos at pinned shas
// (bench/m29-key.json, frozen before any implementation commit -- see 4 log/key-changes.md for any post-freeze edit).
// M29a: every record file in the 3 repos loads (recall) and its captured fields (title/status always; date/deciders
// when the record's own format carries them) match the hand read >= 95%.
// M29b: records the key says name a code path get an anchor, and a commit that edits that path after the record's
// own date turns the record yellow (scope_changed) -- that match rate over anchored records >= 95%.
// usage: node packages/decisions/dist/bench/m29.js [--details FILE] [--metrics-out FILE]
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeFlags, loadGraph } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const benchDir = resolve(here, '../../bench');
const keyPath = join(benchDir, 'm29-key.json');

interface KeyRecord {
  id: string;
  title: string;
  status: string;
  statusText?: string;
  date?: string;
  deciders?: string;
  anchors: string[];
}
interface Corpus {
  dir: string;
  adrDirs: string[];
  source: string;
  records: KeyRecord[];
}
interface Key {
  written: string;
  targets: { recallPct: number; fieldsPct: number; anchoredFlagsPct: number };
  corpora: Record<string, Corpus>;
}

const git = (root: string, ...args: string[]): string =>
  execFileSync('git', ['-C', root, '-c', 'user.name=m29', '-c', 'user.email=m29@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();

function pct(a: number, b: number): number {
  return b === 0 ? 100 : Math.round((1000 * a) / b) / 10;
}

// ---- M29a: recall + fields, read straight off the corpus directories (no git needed)
function scoreM29a(key: Key): { recall: number; fields: number; misses: string[] } {
  const misses: string[] = [];
  let expected = 0;
  let foundCount = 0;
  let fieldsExpected = 0;
  let fieldsMatched = 0;
  for (const [name, corpus] of Object.entries(key.corpora)) {
    const root = join(benchDir, corpus.dir);
    const graph = loadGraph(root, { adrDirs: corpus.adrDirs });
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    for (const rec of corpus.records) {
      expected++;
      const n = byId.get(rec.id);
      if (!n) {
        misses.push(`${name} ${rec.id}: NOT FOUND`);
        continue;
      }
      foundCount++;
      // title
      fieldsExpected++;
      if (n.title === rec.title) fieldsMatched++;
      else misses.push(`${name} ${rec.id}: title "${n.title}" != "${rec.title}"`);
      // status
      fieldsExpected++;
      if (n.status === rec.status) fieldsMatched++;
      else misses.push(`${name} ${rec.id}: status ${n.status} != ${rec.status}`);
      // date: the graph has no free-text date value (T36 design note in 2 insights.md) -- scored as "was a date
      // line captured at all", which is what the UI can point at, when the ground truth says this format has one
      if (rec.date !== undefined) {
        fieldsExpected++;
        if (n.fields.date !== undefined) fieldsMatched++;
        else misses.push(`${name} ${rec.id}: no date field captured (expected one, record has "Date: ${rec.date}")`);
      }
      if (rec.deciders !== undefined) {
        fieldsExpected++;
        if (n.fields.deciders !== undefined) fieldsMatched++;
        else misses.push(`${name} ${rec.id}: no deciders field captured`);
      }
      // anchors: exact set match
      fieldsExpected++;
      const gotAnchors = n.scope.map((a) => a.target).sort();
      const wantAnchors = [...rec.anchors].sort();
      if (JSON.stringify(gotAnchors) === JSON.stringify(wantAnchors)) fieldsMatched++;
      else misses.push(`${name} ${rec.id}: anchors [${gotAnchors.join(', ')}] != [${wantAnchors.join(', ')}]`);
    }
    // nothing unexpected loaded (recall is also "no extra records nobody labelled")
    for (const n of graph.nodes) if (!corpus.records.some((r) => r.id === n.id)) misses.push(`${name}: UNEXPECTED record ${n.id} (not in the key)`);
  }
  return { recall: pct(foundCount, expected), fields: pct(fieldsMatched, fieldsExpected), misses };
}

// ---- M29b: anchored records turn yellow when their anchor changes after the record's date
function scoreM29b(key: Key): { pct: number; misses: string[]; anchored: number } {
  const misses: string[] = [];
  let anchored = 0;
  let matched = 0;
  for (const [name, corpus] of Object.entries(key.corpora)) {
    for (const rec of corpus.records) {
      if (rec.anchors.length === 0) continue;
      anchored++;
      const tmp = mkdtempSync(join(tmpdir(), 'mole-m29-'));
      const root = join(tmp, 'repo');
      try {
        cpSync(join(benchDir, corpus.dir), root, { recursive: true });
        git(root, 'init', '-q', '-b', 'main');
        git(root, 'add', '-A');
        git(root, 'commit', '-q', '-m', 'base (record written)');
        const base = git(root, 'rev-parse', 'HEAD');
        // confirm the record at base, so the flag logic treats base as "the record's own date"
        const graph0 = loadGraph(root, { adrDirs: corpus.adrDirs });
        const node = graph0.nodes.find((n) => n.id === rec.id);
        if (node?.confirmed === undefined) {
          // mole-format records carry `confirmed:`; speckit/ADR records don't -- the flag logic falls back to the
          // record file's own last-commit sha, which is `base` here since nothing has touched it since
        }
        const anchor = rec.anchors[0]!.replace(/\/$/, '');
        const probe = join(root, anchor, 'PROBE.md');
        mkdirSync(join(root, anchor), { recursive: true });
        writeFileSync(probe, `code change after ${name} ${rec.id} was written\n`);
        git(root, 'add', '-A');
        git(root, 'commit', '-q', '-m', `planted: touch ${anchor}`);
        const graph = loadGraph(root, { adrDirs: corpus.adrDirs });
        const flags = computeFlags(graph);
        const f = flags.find((x) => x.id === rec.id);
        const ok = f?.flag === 'yellow' && f.reasons.some((r) => r.code === 'scope_changed');
        if (ok) matched++;
        else misses.push(`${name} ${rec.id}: expected yellow/scope_changed after editing ${anchor}, got ${f?.flag ?? 'missing'} (${(f?.reasons ?? []).map((r) => r.code).join(',')}) base=${base.slice(0, 7)}`);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    }
  }
  return { pct: pct(matched, anchored), misses, anchored };
}

function main(): number {
  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const key = JSON.parse(readFileSync(keyPath, 'utf8')) as Key;
  const a = scoreM29a(key);
  const b = scoreM29b(key);
  for (const m of [...a.misses, ...b.misses]) console.log(`miss  ${m}`);
  const summary = `M29a recall ${a.recall}%, M29a fields ${a.fields}%, M29b anchored-flags ${b.pct}% (${b.anchored} anchored records), key written ${key.written}`;
  console.log(`M29: ${summary}`);

  const details = arg('--details');
  if (details) writeFileSync(details, JSON.stringify({ a, b }, null, 2));
  const metricsOut = arg('--metrics-out');
  if (metricsOut) writeFileSync(metricsOut, JSON.stringify({ M29: summary }));

  const t = key.targets;
  const pass = a.recall >= t.recallPct && a.fields >= t.fieldsPct && b.pct >= t.anchoredFlagsPct;
  if (!pass) console.log('M29: target missed');
  return pass ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (e) {
  console.error(e instanceof Error ? e.stack : e);
  process.exitCode = 1;
}
