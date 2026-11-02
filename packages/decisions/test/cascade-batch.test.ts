// T49 red tests: batched escalation + routing output (verifier.md finding #4 shape, FrugalGPT/PR-Agent prompt
// compression). The M2 v2 61-case run showed cascade costing MORE per check than the LLM reviewer ($0.0050 vs
// $0.0039) because several decisions governed by scope-only anchors each escalated with their OWN separate LLM
// call (`arm2_cascade_results.json`: 24/61 cases made >1 llm call, one case made 4). Fix: when a check has MULTIPLE
// decisions escalating at once, cascadeCheck now makes exactly ONE LLM call carrying every escalating decision's
// own text (nothing else -- not the whole decision graph, not ADRs that didn't govern this diff: the realistic
// non-Mole baseline, RAG, pays for that; Mole's value is routing only the governing decisions into one cheap call).
// Also: `routing` on the result reports which decisions govern a change and how (zero-LLM: scope + anchors + rules),
// computed with no LLM call at all, so routing accuracy can be measured independent of the cascade's verdict.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cascadeCheck, decisionTextFromRecords, loadGraph, type LlmClient } from '../src/index.js';

const git = (root: string, ...args: string[]) =>
  execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();

let root = '';
let base = '';
const heads: Record<string, string> = {};

function write(rel: string, text: string) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}
function pr(name: string, edit: () => void): string {
  git(root, 'checkout', '-q', '-b', name, base);
  edit();
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', name);
  const sha = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '-q', base);
  return sha;
}

// Two AMBIGUOUS decisions (scope anchor only, no content anchor) whose scopes overlap the SAME file, plus one
// CRISP decision (content anchor) that also hits -- mirrors the real M2 backstage shape (adr011 scope + adr014
// scope both firing alongside a crisp decision on the same diff).
const CRISP = `---\nid: D-crisp\ntitle: No default exports\nstatus: accepted\nscope: []\nmatch:\n  - pattern: '\\bexport\\s+default\\b'\n    in: 'lib/**'\n    why: 'no default exports'\n---\n\n## Decision\n\nNo default exports anywhere.\n`;
const AMBIG_A = `---\nid: D-ambig-a\ntitle: Catalog format A\nstatus: accepted\nscope:\n  - lib/catalog.ts\n---\n\n## Decision\n\nThe catalog file format must follow entity schema A (full text for the LLM tier, decision A).\n`;
const AMBIG_B = `---\nid: D-ambig-b\ntitle: Catalog format B\nstatus: accepted\nscope:\n  - lib/catalog.ts\n---\n\n## Decision\n\nThe catalog file format must also follow naming rule B (full text for the LLM tier, decision B).\n`;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'mole-cascade-batch-'));
  git(root, 'init', '-q', '-b', 'main');
  write('lib/catalog.ts', 'export const cat = 1;\n');
  write('.mole/decisions/D-crisp.md', CRISP);
  write('.mole/decisions/D-ambig-a.md', AMBIG_A);
  write('.mole/decisions/D-ambig-b.md', AMBIG_B);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  base = git(root, 'rev-parse', 'HEAD');
  heads.multi = pr('multi-escalate', () => write('lib/catalog.ts', 'export const cat = 1;\nexport const cat2 = 2;\n'));
  heads.crispAndMulti = pr('crisp-and-multi', () => write('lib/catalog.ts', 'export default 1;\nexport const cat2 = 2;\n'));
});
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

function fakeLlm(response: string | ((prompt: string) => string)): { client: LlmClient; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    client: {
      complete: async (prompt: string) => {
        calls.push(prompt);
        const text = typeof response === 'function' ? response(prompt) : response;
        return { text, usage: { inputTokens: 300, outputTokens: 40, costUsd: 0.002 } };
      },
    },
  };
}

const BATCH_RESPONSE = ['### D-ambig-a', 'VERDICT: VIOLATES', 'adds a field not in schema A.', '', '### D-ambig-b', 'VERDICT: COMPLIANT', 'naming rule B is unaffected.'].join('\n');

describe('cascadeCheck: multiple escalating decisions on one check batch into exactly ONE LLM call', () => {
  it('two scope-only decisions escalate together in one call, each getting its own parsed verdict', async () => {
    const { client, calls } = fakeLlm(BATCH_RESPONSE);
    const graph = loadGraph(root);
    const r = await cascadeCheck({ root, base, head: heads.multi!, llm: client, decisionText: decisionTextFromRecords(root, graph.nodes) });
    expect(calls).toHaveLength(1); // THE fix: was 2 separate calls before batching
    expect(calls[0]).toContain('entity schema A');
    expect(calls[0]).toContain('naming rule B');
    const a = r.verdicts.find((v) => v.decision === 'D-ambig-a');
    const b = r.verdicts.find((v) => v.decision === 'D-ambig-b');
    expect(a).toMatchObject({ tier: 'llm', flag: 'violates' });
    expect(b).toMatchObject({ tier: 'llm', flag: 'compliant' });
  });

  it('a crisp hit decides zero-llm and is excluded from the batched call; only the ambiguous ones escalate together', async () => {
    const { client, calls } = fakeLlm(BATCH_RESPONSE);
    const graph = loadGraph(root);
    const r = await cascadeCheck({ root, base, head: heads.crispAndMulti!, llm: client, decisionText: decisionTextFromRecords(root, graph.nodes) });
    expect(calls).toHaveLength(1);
    const crisp = r.verdicts.find((v) => v.decision === 'D-crisp');
    expect(crisp).toMatchObject({ tier: 'zero-llm', flag: 'violates' });
    expect(crisp!.usage).toBeUndefined();
  });

  it('reports a `routing` list: which decisions govern this change, computed with zero LLM calls', async () => {
    const { client } = fakeLlm(BATCH_RESPONSE);
    const graph = loadGraph(root);
    const r = await cascadeCheck({ root, base, head: heads.multi!, llm: client, decisionText: decisionTextFromRecords(root, graph.nodes) });
    expect(r.routing.map((x) => x.decision).sort()).toEqual(['D-ambig-a', 'D-ambig-b']);
    for (const route of r.routing) expect(route.hitKinds.length).toBeGreaterThan(0);
  });

  it('routing is populated even with NO llm configured at all (zero-LLM routing never needs a model call)', async () => {
    const graph = loadGraph(root);
    const r = await cascadeCheck({ root, base, head: heads.multi!, decisionText: decisionTextFromRecords(root, graph.nodes) });
    expect(r.routing.map((x) => x.decision).sort()).toEqual(['D-ambig-a', 'D-ambig-b']);
  });
});
