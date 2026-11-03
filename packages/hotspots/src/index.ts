// @mole/hotspots: rank code areas to pay down (T70, D68) by combining four inputs Mole already
// computes elsewhere -- churn, indentation-based complexity, decision volatility and incident/fix
// density -- into one ranked list, each rank explained by its four inputs (never a bare score).
//
// Prior art (tasks/T70-investment-map/4 log/prior-art.md):
//   - hotspot = frequency-of-change x complexity (Tornhill, "Your Code as a Crime Scene"; code-maat
//     https://github.com/adamtornhill/code-maat)
//   - complexity = indentation-based ("whitespace") complexity, not a per-language AST walk
//     (Tornhill, same book p.25; Hindle/Godfrey/Holt ICPC 2008 "indentation as a proxy for complexity")
//   - churn = commits-per-file (code-maat's `revisions` analysis)
//   - normalize each input before combining (Nagappan & Ball ICSE 2005: relative churn measures beat
//     absolute ones as predictors)
//   - decision volatility and incident/fix density reuse Mole's own data: @mole/decisions'
//     loadGraph() (decision scope + overrides edges) and @mole/history's DEFAULT_FIX_RULE, rather than
//     a second implementation of either (AGENTS.md: one source of truth).
import { EMPTY_TREE, git } from '@mole/history/dist/src/git.js';
import { DEFAULT_FIX_RULE } from '@mole/history';
import { loadGraph } from '@mole/decisions';
import { indentComplexity } from './complexity.js';

export { indentComplexity } from './complexity.js';
export type { IndentComplexity } from './complexity.js';

export interface HotspotInputs {
  /** commits touching this file (code-maat `revisions`; Nagappan & Ball: churn, un-normalized) */
  churn: number;
  /** sum of per-line logical-indent depth over the file's current content (Tornhill) */
  complexity: number;
  /** decisions whose `scope` touches this file, plus `overrides` edges among them (revisions of the
   * team's stance on this code) -- read from @mole/decisions' loadGraph(), not @mole/temporal
   * (INFERENCE, see prior-art.md "Decisions taken": temporal's Postgres/RLS store is out of T70's
   * boundary; .mole/decisions/*.md is the lighter, already-read-only equivalent) */
  volatility: number;
  /** commits touching this file whose subject matches the fix rule (@mole/history's DEFAULT_FIX_RULE,
   * the same rule `mole check`/`mole_check` use for "this commit is a fix") */
  incidents: number;
}

export interface HotspotRank extends HotspotInputs {
  file: string;
  /** each raw input divided by the max of that input across every ranked file (0 when the file has
   * none; a file with the single largest raw value in some input scores 1 on that input) */
  normalized: { churn: number; complexity: number; volatility: number; incidents: number };
  /** product of the four normalized scores (Nagappan & Ball: normalize before combining).
   * 0 if ANY input is 0 for this file -- a hotspot by this definition needs all four signals
   * (a file nobody ever revised a decision about, or that never broke, is not ranked above one
   * that did, no matter how large its churn x complexity is). */
  score: number;
}

export interface HotspotsOptions {
  /** max files to return, ranked by score desc (default 10, per T70's done-when) */
  top?: number;
  /** restrict churn/incident history to commits since this date (ISO or any `git log --since` value) */
  since?: string;
  /** override @mole/history's DEFAULT_FIX_RULE */
  fixRule?: RegExp | string;
  /** spaces counted as one logical indent (Tornhill's indent-complexity-proxy default is 4; Mole's
   * own source is 2-space indented, so 2 is this package's default -- configurable, not hardcoded) */
  spacesPerIndent?: number;
}

export interface HotspotsResult {
  ranked: HotspotRank[];
  /** every file considered (tracked text files with >=1 commit), before truncating to `top` */
  filesConsidered: number;
  fixRule: string;
  ms: number;
}

function compileFixRule(rule: RegExp | string): RegExp {
  if (rule instanceof RegExp) return new RegExp(rule.source, rule.flags.replace(/[gy]/g, ''));
  return new RegExp(rule, 'i');
}

/** per file: commit count (churn) and fix-commit count (incidents), one `git log --name-only` walk */
async function churnAndIncidents(root: string, since: string | undefined, fixRule: RegExp): Promise<Map<string, { churn: number; incidents: number }>> {
  const args = ['log', '--name-only', '--format=%x01%H%x02%s'];
  if (since) args.push(`--since=${since}`);
  const raw = await git(root, args);
  const out = new Map<string, { churn: number; incidents: number }>();
  let isFix = false;
  for (const line of raw.split('\n')) {
    if (line.startsWith('\x01')) {
      const subject = line.slice(1).split('\x02')[1] ?? '';
      isFix = fixRule.test(subject);
      continue;
    }
    const file = line.trim();
    if (!file) continue;
    const e = out.get(file) ?? { churn: 0, incidents: 0 };
    e.churn += 1;
    if (isFix) e.incidents += 1;
    out.set(file, e);
  }
  return out;
}

/** decision volatility per file: decisions whose scope touches the file, plus `overrides` edges
 * between decisions that both touch it (each such edge is one recorded revision of the team's
 * stance on that code) */
function decisionVolatility(root: string): Map<string, number> {
  const graph = loadGraph(root);
  const decisionsByFile = new Map<string, Set<string>>();
  for (const n of graph.nodes) {
    if (n.kind !== 'decision') continue;
    for (const a of n.scope) {
      const file = a.target.split('#')[0]!.replace(/\/$/, '');
      (decisionsByFile.get(file) ?? decisionsByFile.set(file, new Set()).get(file)!).add(n.id);
    }
  }
  const out = new Map<string, number>();
  for (const [file, ids] of decisionsByFile) out.set(file, ids.size);
  for (const e of graph.edges) {
    if (e.type !== 'overrides') continue;
    for (const [file, ids] of decisionsByFile) {
      if (ids.has(e.from) && ids.has(e.to)) out.set(file, (out.get(file) ?? 0) + 1);
    }
  }
  return out;
}

/** every file git currently tracks (HEAD's tree): what `indentComplexity` can be computed for */
async function trackedFiles(root: string): Promise<string[]> {
  const raw = await git(root, ['ls-tree', '-r', '--name-only', 'HEAD']).catch(() => '');
  return raw.split('\n').filter(Boolean);
}

export async function computeHotspots(root: string, opts: HotspotsOptions = {}): Promise<HotspotsResult> {
  const t0 = performance.now();
  const fixRule = compileFixRule(opts.fixRule ?? DEFAULT_FIX_RULE);
  const spacesPerIndent = opts.spacesPerIndent ?? 2;

  const [ci, volatility, tracked] = await Promise.all([churnAndIncidents(root, opts.since, fixRule), Promise.resolve(decisionVolatility(root)), trackedFiles(root)]);
  const trackedSet = new Set(tracked);

  // only files that both exist now (so complexity is computable) and have >=1 commit (so churn is
  // meaningful) are ranked -- a file git never touched, or one history has but is since deleted, has
  // no complete four-input story and would need a fabricated 0 that this package refuses to invent.
  const files = [...ci.keys()].filter((f) => trackedSet.has(f));

  const rows: Array<{ file: string } & HotspotInputs> = [];
  for (const file of files) {
    const churnRow = ci.get(file)!;
    const complexity = await indentComplexity(root, file, spacesPerIndent).catch(() => 0);
    rows.push({ file, churn: churnRow.churn, complexity, volatility: volatility.get(file) ?? 0, incidents: churnRow.incidents });
  }

  const maxOf = (k: keyof HotspotInputs) => Math.max(1, ...rows.map((r) => r[k]));
  const maxChurn = maxOf('churn');
  const maxComplexity = maxOf('complexity');
  const maxVolatility = maxOf('volatility');
  const maxIncidents = maxOf('incidents');

  const ranked: HotspotRank[] = rows
    .map((r) => {
      const normalized = { churn: r.churn / maxChurn, complexity: r.complexity / maxComplexity, volatility: r.volatility / maxVolatility, incidents: r.incidents / maxIncidents };
      const score = normalized.churn * normalized.complexity * normalized.volatility * normalized.incidents;
      return { ...r, normalized, score };
    })
    .sort((a, b) => b.score - a.score || b.churn - a.churn || a.file.localeCompare(b.file));

  return { ranked: ranked.slice(0, opts.top ?? 10), filesConsidered: rows.length, fixRule: fixRule.source, ms: Math.round(performance.now() - t0) };
}

export function formatHotspots(r: HotspotsResult): string {
  if (r.ranked.length === 0) return `mole hotspots: no file has all four inputs (churn, complexity, decision volatility, a fix commit) -- nothing ranked (${r.filesConsidered} file(s) considered)`;
  const out = [`mole hotspots (fix rule /${r.fixRule}/i, ${r.filesConsidered} file(s) considered)`];
  r.ranked.forEach((h, i) => {
    out.push(`${i + 1}. ${h.file}  score=${h.score.toFixed(3)}`);
    out.push(`   churn=${h.churn} (${h.normalized.churn.toFixed(2)})  complexity=${h.complexity} (${h.normalized.complexity.toFixed(2)})  decision volatility=${h.volatility} (${h.normalized.volatility.toFixed(2)})  fix commits=${h.incidents} (${h.normalized.incidents.toFixed(2)})`);
  });
  return out.join('\n');
}
