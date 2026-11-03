// T63: build arm R (CLAUDE.md) and arm M (.mole/decisions/*.md) from dcbench's own seed-data.ts, same text in both.
// Fairness (protocol.md): scope = only paths written in the decision's own text; nothing hand-added.
// usage: node generate.mjs <dcbench repo> <out dir>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [repo, out] = process.argv.slice(2);
const src = readFileSync(join(repo, 'benchmark/seed-data.ts'), 'utf8');
const body = src.slice(src.indexOf('BENCHMARK_DECISIONS'), src.indexOf('BENCHMARK_PERSONAS') > 0 ? src.indexOf('BENCHMARK_PERSONAS') : undefined);
const field = (blk, k) => (new RegExp(`${k}:\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(blk)?.[1] ?? '').replace(/\\'/g, "'");
const blocks = body.split(/\n  \{\n/).slice(1);
const ds = blocks.map((b, i) => ({ id: `D-${String(i + 1).padStart(3, '0')}`, topic: field(b, 'topic'), decision: field(b, 'decision'), rationale: field(b, 'rationale'), severity: field(b, 'severity'), category: field(b, 'category') }));
if (ds.length !== 15 || ds.some((d) => !d.decision)) throw new Error(`expected 15 decisions, got ${ds.length}`);
const PATH = /(?:^|[\s(`'"])((?:src|app|lib|components)\/[\w./*{}@[\]-]+)/g;
const scope = (d) => [...new Set([...`${d.decision} ${d.rationale}`.matchAll(PATH)].map((m) => m[1].replace(/[.,;:)]+$/, '')))];
mkdirSync(join(out, 'R'), { recursive: true });
mkdirSync(join(out, 'M/.mole/decisions'), { recursive: true });
const text = (d) => `${d.decision}\n\nWhy: ${d.rationale}`;
writeFileSync(join(out, 'R/CLAUDE.md'), `# Team decisions\n\nThese are this team's recorded decisions. Follow them.\n\n${ds.map((d) => `## ${d.id} ${d.topic} (${d.severity})\n\n${text(d)}\n`).join('\n')}`);
for (const d of ds) {
  const sc = scope(d);
  writeFileSync(join(out, `M/.mole/decisions/${d.id.toLowerCase()}.md`), ['---', `id: ${d.id}`, `title: ${d.topic}`, 'status: accepted', `severity: ${d.severity}`, ...(sc.length ? [`scope: [${sc.join(', ')}]`] : []), '---', '', '## Decision', '', d.decision, '', '## Rationale', '', d.rationale, ''].join('\n'));
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(ds.map((d) => ({ id: d.id, topic: d.topic, scope: scope(d) })), null, 2));
console.log(JSON.stringify({ decisions: ds.length, scoped: ds.filter((d) => scope(d).length).length }));
