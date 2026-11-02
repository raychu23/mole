// T46 red tests: the cascade. Zero-LLM tier decides a crisp content-anchor hit outright, no LLM call; a decision
// governed only by a path/folder scope anchor (no content anchor fired) is "governed but no rule decides" and
// escalates to exactly ONE fake LLM call with that decision's own text; tokens/cost and tier are reported per
// decision. A silent file (no decision's scope touches it) produces no verdict and no LLM call at all.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cascadeCheck, decisionTextFromRecords, type LlmClient } from '../src/index.js';
import { loadGraph } from '../src/index.js';

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

// CRISP: has a `match:` content anchor -> zero-LLM decides outright, any match fires "violates"
const CRISP = `---\nid: D-crisp\ntitle: No default exports\nstatus: accepted\nscope: []\nmatch:\n  - pattern: '\\bexport\\s+default\\b'\n    in: 'src/**'\n    why: 'the decision text says no default exports'\n---\n\n## Decision\n\nNo default exports anywhere in src/.\n`;
// AMBIGUOUS: scope anchor only, no content anchor -> any added line in scope is "governed but no rule decides"
const AMBIGUOUS = `---\nid: D-ambiguous\ntitle: Catalog format\nstatus: accepted\nscope:\n  - lib/catalog.ts\n---\n\n## Decision\n\nThe catalog file format must follow the entity schema (full text for the LLM tier).\n`;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'mole-cascade-'));
  git(root, 'init', '-q', '-b', 'main');
  write('src/a.ts', 'export const a = 1;\n');
  write('lib/catalog.ts', 'export const cat = 1;\n');
  write('lib/untouched.ts', 'export const u = 1;\n');
  write('.mole/decisions/D-crisp.md', CRISP);
  write('.mole/decisions/D-ambiguous.md', AMBIGUOUS);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  base = git(root, 'rev-parse', 'HEAD');
  heads.crispHit = pr('crisp-hit', () => write('src/a.ts', 'export const a = 1;\nexport default a;\n'));
  heads.ambiguous = pr('ambiguous-edit', () => write('lib/catalog.ts', 'export const cat = 1;\nexport const cat2 = 2;\n'));
  heads.silent = pr('silent-edit', () => write('lib/untouched.ts', 'export const u = 2;\n'));
});
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

function fakeLlm(response: string): { client: LlmClient; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    client: {
      complete: async (prompt: string) => {
        calls.push(prompt);
        return { text: response, usage: { inputTokens: 200, outputTokens: 20, costUsd: 0.0012 } };
      },
    },
  };
}

describe('cascadeCheck: zero-LLM tier decides a crisp content anchor, no escalation', () => {
  it('a `match:` hit is tier zero-llm, flag violates, and makes no LLM call', async () => {
    const { client, calls } = fakeLlm('VERDICT: VIOLATES\nshould never be reached');
    const graph = loadGraph(root);
    const r = await cascadeCheck({ root, base, head: heads.crispHit!, llm: client, decisionText: decisionTextFromRecords(root, graph.nodes) });
    expect(r.verdicts).toHaveLength(1);
    expect(r.verdicts[0]).toMatchObject({ decision: 'D-crisp', tier: 'zero-llm', flag: 'violates' });
    expect(r.verdicts[0]!.usage).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('a silent file (no decision scope touches it) produces no verdict at all', async () => {
    const { client, calls } = fakeLlm('VERDICT: COMPLIANT\nunrelated');
    const graph = loadGraph(root);
    const r = await cascadeCheck({ root, base, head: heads.silent!, llm: client, decisionText: decisionTextFromRecords(root, graph.nodes) });
    expect(r.verdicts).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });
});

describe('cascadeCheck: scope-anchor-only governance escalates to exactly one LLM call', () => {
  it('escalates with the decision\'s own text, parses VERDICT, reports tier llm + tokens/cost', async () => {
    const { client, calls } = fakeLlm('VERDICT: VIOLATES\nadds a new field not in the entity schema.');
    const graph = loadGraph(root);
    const r = await cascadeCheck({ root, base, head: heads.ambiguous!, llm: client, decisionText: decisionTextFromRecords(root, graph.nodes) });
    expect(r.verdicts).toHaveLength(1);
    expect(r.verdicts[0]).toMatchObject({ decision: 'D-ambiguous', tier: 'llm', flag: 'violates' });
    expect(r.verdicts[0]!.usage).toEqual({ inputTokens: 200, outputTokens: 20, costUsd: 0.0012 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('The catalog file format must follow the entity schema');
    expect(calls[0]).toContain('cat2');
  });

  it('a COMPLIANT LLM verdict is reported as flag compliant, still tier llm', async () => {
    const { client } = fakeLlm('VERDICT: COMPLIANT\nthe added field matches the schema.');
    const graph = loadGraph(root);
    const r = await cascadeCheck({ root, base, head: heads.ambiguous!, llm: client, decisionText: decisionTextFromRecords(root, graph.nodes) });
    expect(r.verdicts[0]).toMatchObject({ tier: 'llm', flag: 'compliant' });
  });

  it('with no llm configured, an ambiguous case reports zero-llm and says why it did not escalate', async () => {
    const r = await cascadeCheck({ root, base, head: heads.ambiguous! });
    expect(r.verdicts[0]).toMatchObject({ decision: 'D-ambiguous', tier: 'zero-llm', flag: 'violates' });
    expect(r.verdicts[0]!.reason).toMatch(/no LLM tier configured/);
  });
});
