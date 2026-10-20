// Shared helpers for the M0 engine benchmark: file listing, edge normalisation, metrics.
import { existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

export const TS_EXT = /\.(?:ts|tsx|mts|cts)$/;

export function listSources(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) listSources(p, out);
    else if (TS_EXT.test(e.name)) out.push(p);
  }
  return out.sort();
}

export const relTo = (root, f) => relative(root, resolve(f)).split(sep).join('/');

/** A call edge every engine adapter must produce: caller line -> definition (file + leaf name). */
export const edgeKey = (e) => `${e.file}:${e.line}:${e.tfile}:${e.tleaf}`;
export const lineKey = (e) => `${e.file}:${e.line}`;

/** Leaf name of a declaration; constructors count as their class. */
export function leaf(name, owner) {
  const n = name.replace(/^#/, '');
  return n === 'constructor' || n === '<constructor>' ? (owner ?? n) : n;
}

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rnd) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Score one engine's call edges against the sampled truth sites. */
export function score(engineEdges, sites, truthByLine) {
  const keys = new Set(engineEdges.map(edgeKey));
  const sampledLines = new Set(sites.map(lineKey));
  const onLines = [...new Map(engineEdges.filter((e) => sampledLines.has(lineKey(e))).map((e) => [edgeKey(e), e])).values()];
  let tp = 0;
  for (const e of onLines) if ((truthByLine.get(lineKey(e)) ?? new Set()).has(edgeKey(e))) tp++;
  const strata = {};
  for (const s of sites) {
    const hit = s.targets.some((t) => keys.has(`${s.file}:${s.line}:${t.tfile}:${t.tleaf}`));
    const st = (strata[s.stratum] ??= { sampled: 0, found: 0 });
    st.sampled++;
    if (hit) st.found++;
  }
  const tot = Object.values(strata).reduce((a, s) => ({ sampled: a.sampled + s.sampled, found: a.found + s.found }), { sampled: 0, found: 0 });
  const stat = Object.entries(strata).filter(([k]) => k !== 'dynamic').reduce((a, [, s]) => ({ sampled: a.sampled + s.sampled, found: a.found + s.found }), { sampled: 0, found: 0 });
  const examples = { falsePositives: onLines.filter((e) => !(truthByLine.get(lineKey(e)) ?? new Set()).has(edgeKey(e))).slice(0, 8).map((e) => `${e.file}:${e.line} -> ${e.tfile}#${e.tleaf}`), misses: {} };
  for (const s of sites) {
    if (s.targets.some((t) => keys.has(`${s.file}:${s.line}:${t.tfile}:${t.tleaf}`))) continue;
    const a = (examples.misses[s.stratum] ??= []);
    if (a.length < 3) a.push(`${s.file}:${s.line} ${s.callee} -> ${s.targets[0].tfile}#${s.targets[0].tleaf}`);
  }
  const r = (f, s) => (s ? +(f / s).toFixed(3) : null);
  return {
    totalCallEdges: new Set(engineEdges.map(edgeKey)).size,
    edgesOnSampledLines: onLines.length,
    truePositivesOnSampledLines: tp,
    precision: r(tp, onLines.length),
    recallAll: r(tot.found, tot.sampled),
    recallStatic: r(stat.found, stat.sampled),
    examples,
    recallByStratum: Object.fromEntries(Object.entries(strata).map(([k, s]) => [k, { sampled: s.sampled, found: s.found, recall: r(s.found, s.sampled) }])),
  };
}
