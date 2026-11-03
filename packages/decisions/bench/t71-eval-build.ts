// T71 review-1 fix: rebuild the frozen eval set from EVERY relation Mole's own loadGraph models (graph.ts's
// RELATIONS/ADR_RELATIONS tables), across every vendored corpus named in the review finding -- not a grep
// sample, not 2 corpora. Reuses the SHIPPED loadGraph (packages/decisions/src/graph.ts) unmodified: the gold
// labels are whatever the production parser itself extracts, so "exhaustive" means "every edge the parser
// finds", not "every edge a human happened to grep for".
//
// Two relevance signals, kept separate and separately labelled (review finding #1):
//   - 'strong': a decision/incident-to-decision/incident edge Mole models as a named relation (supersedes,
//     amends, overrides, conflicts_with, alternative_to, subsumes, cites, traces_to, evidence_for) -- an
//     explicit authored link between two case records.
//   - 'weak': two decision nodes in the same .mole-format corpus whose `scope:` front matter shares at least
//     one anchor target (same file/dir) -- same-scope, no authored relation. Weaker signal, reported and
//     scored separately, never merged into the strong count.
//
// Corpora covered (every one named in the review finding, plus the task's own corpora/* boundary):
//   packages/decisions/bench/corpora/{govuk-aws,backstage,m29-adrtools,m29-madr,m29-speckit}
//   packages/decisions/bench/m24/{govuk-infrastructure,backstage}
//   packages/decisions/bench/m24v2/{govuk-infrastructure,backstage}
// (bench/corpora/mole is Mole's own source tree, not a decision corpus -- not a relevance source, skipped.
//  The *-<hash> corpora variants are parent/child diff fixtures for a different benchmark (T56), not a second
//  independent ADR set -- including them would double-count the same supersede/amends links already counted
//  once from govuk-aws/backstage, so they are read for sanity only, not added to the frozen set.)
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { loadGraph } from '../src/graph.js';
import { indexTextOf } from '../src/route/index-text.js';
import type { GraphNode } from '../src/types.js';

// import.meta.dirname is dist/bench when compiled (tsc -b; this package's data-only bench/ dir is not copied
// into dist) -- resolve back to the SOURCE bench/ dir where the corpora actually live.
const BENCH = resolve(import.meta.dirname, '../../bench');
const EVAL_DIR = resolve(import.meta.dirname, '../../../../context/product-plan/systems/metrics-proof/case-recall');
const EVAL_PATH = resolve(EVAL_DIR, 'eval-set-v2.json');
const SHA_PATH = resolve(EVAL_DIR, 'eval-set-v2.sha256');

interface CorpusSpec {
  prefix: string;
  root: string;
  adrDirs?: string[];
}

// Every corpus named in the review finding. adrDirs=[] (or omitted) means .mole-format / spec-kit, read by
// loadGraph's own default scan (loadMoleDecisions / loadSpecKit) with no extra flag.
const CORPORA: CorpusSpec[] = [
  { prefix: 'govuk-aws', root: resolve(BENCH, 'corpora/govuk-aws'), adrDirs: ['docs/architecture/decisions'] },
  { prefix: 'backstage', root: resolve(BENCH, 'corpora/backstage'), adrDirs: ['docs/architecture-decisions'] },
  { prefix: 'm29-adrtools', root: resolve(BENCH, 'corpora/m29-adrtools'), adrDirs: ['doc/adr'] },
  { prefix: 'm29-madr', root: resolve(BENCH, 'corpora/m29-madr'), adrDirs: ['docs/decisions'] },
  { prefix: 'm29-speckit', root: resolve(BENCH, 'corpora/m29-speckit') }, // loadSpecKit's own scan
  { prefix: 'm24-govuk-infrastructure', root: resolve(BENCH, 'm24/govuk-infrastructure') }, // .mole/decisions
  { prefix: 'm24-backstage', root: resolve(BENCH, 'm24/backstage') },
  { prefix: 'm24v2-govuk-infrastructure', root: resolve(BENCH, 'm24v2/govuk-infrastructure') },
  { prefix: 'm24v2-backstage', root: resolve(BENCH, 'm24v2/backstage') },
];

// Which EdgeTypes are a "resembles" signal between two case records (decision/incident), i.e. an authored
// link saying these two records are about the same matter -- not a scope/tenet/argument-graph edge.
const STRONG_RELATION_TYPES = new Set([
  'supersedes', 'amends', 'overrides', 'conflicts_with', 'alternative_to', 'subsumes', 'cites', 'traces_to', 'evidence_for',
]);

const LINK_RE = /\]\(([^)\s]+)\)/g;

interface CorpusDoc {
  id: string;
  title: string;
  text: string;
}
interface Pair {
  query: string;
  relevant: string;
  evidence: string;
  signal: 'strong' | 'weak';
  relation: string;
  corpus: string;
}

const corpus: Record<string, CorpusDoc> = {};
const pairs: Pair[] = [];
const seenPairKeys = new Set<string>();
const countsByRelation = new Map<string, number>();
let weakCount = 0;

function readFileOrEmpty(abs: string): string {
  try {
    return readFileSync(abs, 'utf8');
  } catch {
    return '';
  }
}

function addPair(p: Pair): void {
  // undirected de-dup: a<->b counted once, not twice (the 'reverse' edge graph.ts itself builds for e.g.
  // superseded_by is already the same logical pair as the forward supersedes edge)
  const key = [p.corpus, [p.query, p.relevant].sort().join('\u0000'), p.relation, p.signal].join('\u0001');
  if (seenPairKeys.has(key)) return;
  seenPairKeys.add(key);
  pairs.push(p);
  if (p.signal === 'strong') countsByRelation.set(p.relation, (countsByRelation.get(p.relation) ?? 0) + 1);
  else weakCount++;
}

for (const spec of CORPORA) {
  const graph = loadGraph(spec.root, { adrDirs: spec.adrDirs });
  const byId = new Map<string, GraphNode>(graph.nodes.map((n) => [n.id, n]));
  const caseNodes = graph.nodes.filter((n) => n.kind === 'decision' || n.kind === 'incident');

  for (const n of caseNodes) {
    corpus[`${spec.prefix}:${n.id}`] = { id: `${spec.prefix}:${n.id}`, title: n.title, text: readFileOrEmpty(resolve(spec.root, n.file)) };
  }

  // strong signal: every modeled relation edge between two case records, both ends resolved
  for (const e of graph.edges) {
    if (!STRONG_RELATION_TYPES.has(e.type)) continue;
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    if (!from || !to) continue;
    if (!(from.kind === 'decision' || from.kind === 'incident')) continue;
    if (!(to.kind === 'decision' || to.kind === 'incident')) continue;
    addPair({ query: `${spec.prefix}:${from.id}`, relevant: `${spec.prefix}:${to.id}`, evidence: `${e.file}:${e.line} (${e.type})`, signal: 'strong', relation: e.type, corpus: spec.prefix });
  }

  // Supplementary full-text scan (plain ADR-dir corpora only): graph.ts's ADR_RELATIONS regex is anchored to
  // the FIRST line of a "## Status" section and to the start of that line (Nygard-convention "Superseded by
  // X" as the whole status sentence). Some real ADRs say the same thing differently -- mid-sentence ("**These
  // IP ranges have been superseded by [ADR #0033]**", govuk-aws/0003) or hedged ("This ADR in part supersedes
  // [0003]", govuk-aws/0033) -- and the shipped parser does not catch those (a separate, pre-existing parser
  // gap, out of this task's boundary to fix). The eval set's job is to measure recall against every REAL
  // relation in the corpus text, not just the subset the current parser's regex happens to catch, so this
  // scans full file text for the same relation vocabulary graph.ts itself models, anywhere in the file, and
  // resolves the markdown link the same way graph.ts's `idOfName` does (digit-prefix match within the corpus).
  if (spec.adrDirs && spec.adrDirs.length > 0) {
    const idOfName = (name: string): string | undefined => /^(adr[-_]?\d+|\d+)/i.exec(name)?.[1]?.toLowerCase().replace(/[-_]/, '');
    const byPrefix = new Map<string, GraphNode>();
    for (const n of caseNodes) {
      const pref = idOfName(n.file.split('/').pop() ?? '');
      if (pref) byPrefix.set(pref, n);
    }
    const TEXT_SCAN: Array<{ re: RegExp; type: 'supersedes' | 'amends' | 'overrides' | 'conflicts_with'; reverse: boolean }> = [
      { re: /supersed(ed|es)\s+by/i, type: 'supersedes', reverse: true },
      { re: /\bsupersedes\b/i, type: 'supersedes', reverse: false },
      { re: /amended\s+by/i, type: 'amends', reverse: true },
      { re: /\bamends\b/i, type: 'amends', reverse: false },
      { re: /overridden\s+by/i, type: 'overrides', reverse: true },
      { re: /\boverrides\b/i, type: 'overrides', reverse: false },
      { re: /conflicts\s+with/i, type: 'conflicts_with', reverse: false },
    ];
    for (const n of caseNodes) {
      const abs = resolve(spec.root, n.file);
      const text = readFileOrEmpty(abs);
      for (const m of text.matchAll(LINK_RE)) {
        const href = m[1]!;
        const name = (href.split('#')[0] ?? '').split('/').pop() ?? '';
        if (!name.endsWith('.md')) continue;
        const pref = idOfName(name);
        const other = pref ? byPrefix.get(pref) : undefined;
        if (!other || other.id === n.id) continue;
        const windowStart = Math.max(0, m.index! - 80);
        const windowText = text.slice(windowStart, m.index!);
        for (const rule of TEXT_SCAN) {
          if (!rule.re.test(windowText)) continue;
          const from = rule.reverse ? other : n;
          const to = rule.reverse ? n : other;
          addPair({ query: `${spec.prefix}:${from.id}`, relevant: `${spec.prefix}:${to.id}`, evidence: `text-scan ${n.file} (${rule.type}, link to ${name})`, signal: 'strong', relation: rule.type, corpus: spec.prefix });
          break;
        }
      }
    }
  }

  // weak signal: same-scope decision pairs (scope anchor overlap), .mole-format corpora only (scope is a
  // mole front-matter field; plain ADR-dir records never carry one)
  const byScope = new Map<string, GraphNode[]>();
  for (const n of caseNodes) {
    if (n.kind !== 'decision') continue;
    for (const a of n.scope ?? []) {
      const arr = byScope.get(a.target) ?? [];
      arr.push(n);
      byScope.set(a.target, arr);
    }
  }
  for (const [target, nodes] of byScope) {
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        addPair({ query: `${spec.prefix}:${a.id}`, relevant: `${spec.prefix}:${b.id}`, evidence: `shared scope ${target}`, signal: 'weak', relation: 'same-scope', corpus: spec.prefix });
      }
  }
}

// Freeze the split BEFORE scoring: deterministic, alphabetical by (corpus, query, relevant) pair key, 70/30.
// Strong and weak are split independently, so held-out always has both signals represented (not just whichever
// signal happens to sort last).
function splitFrozen(ps: Pair[]): { dev: Pair[]; held_out: Pair[] } {
  const sorted = [...ps].sort((x, y) => (x.corpus + x.query + x.relevant < y.corpus + y.query + y.relevant ? -1 : 1));
  const cut = Math.ceil(sorted.length * 0.7);
  return { dev: sorted.slice(0, cut), held_out: sorted.slice(cut) };
}
const strongPairs = pairs.filter((p) => p.signal === 'strong');
const weakPairs = pairs.filter((p) => p.signal === 'weak');
const strongSplit = splitFrozen(strongPairs);
const weakSplit = splitFrozen(weakPairs);

const evalSet = {
  corpus,
  pairs,
  split: {
    dev: [...strongSplit.dev, ...weakSplit.dev].map((p) => p.query),
    held_out: [...strongSplit.held_out, ...weakSplit.held_out].map((p) => p.query),
  },
};

writeFileSync(EVAL_PATH, JSON.stringify(evalSet, null, 2) + '\n');
const sha = createHash('sha256').update(readFileSync(EVAL_PATH)).digest('hex');
writeFileSync(SHA_PATH, `${sha}  eval-set-v2.json\n`);

const relationLines = [...countsByRelation.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([t, c]) => `  - ${t}: ${c}`).join('\n');
const report = [
  '## eval-set-v2 build report (review-1 fix, rebuilt from every modeled relation, not a 2-corpus grep sample)',
  '',
  `Corpora loaded (via the SHIPPED loadGraph, unmodified): ${CORPORA.map((c) => c.prefix).join(', ')}`,
  `Total case-record docs in corpus pool: ${Object.keys(corpus).length}`,
  '',
  `Strong signal (authored relation edge between two case records): ${strongPairs.length} pairs`,
  relationLines,
  '',
  `Weak signal (same-scope, no authored relation): ${weakPairs.length} pairs`,
  '',
  `Split (frozen before scoring, 70/30 by corpus+query+relevant, strong/weak split independently): dev=${evalSet.split.dev.length}, held_out=${evalSet.split.held_out.length}`,
  `sha256 (eval-set-v2.json, written before any scoring): ${sha}`,
].join('\n');
console.log(report);
