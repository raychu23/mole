// T54 red tests: cascade.ts's escalation tier now builds its judge prompt from the engine's labels for the
// decision's OWN derived argument chain (deriveAdrArgumentFramework + packages/reasoning's evaluate()), not the
// decision's raw text alone -- done-when #3. Rejected alternatives the decision's own stated reasons defeat are
// named as settled; an alternative with NO stated reason defeating it is flagged as a standing, unresolved
// objection so the judge knows the record's own argument chain is incomplete there, rather than silently
// presenting the raw prose as if it were uncontested.
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

// DEFENDED: Considered Options lists one rejected alternative, and Decision Outcome gives a stated reason ->
// the engine should label the alternative 'out' (defeated) and the claim 'in' (defended).
const DEFENDED = [
  '---', 'id: D-defended', 'title: Catalog format (defended)', 'status: accepted', 'scope:', '  - lib/catalog.ts', '---', '',
  '## Considered Options', '', '- Plain JSON with no schema', '', '## Decision Outcome', '',
  'Chosen option: "entity schema", because', '', '- the entity schema is already validated elsewhere in this repo.', '',
].join('\n');

// UNRESOLVED: Considered Options lists a rejected alternative, but Decision Outcome gives NO bullets at all ->
// nothing defeats the alternative, so it stays 'in' (standing objection) and the claim is 'out' (undefended).
const UNRESOLVED = [
  '---', 'id: D-unresolved', 'title: Catalog format (unresolved)', 'status: accepted', 'scope:', '  - lib/other.ts', '---', '',
  '## Considered Options', '', '- Plain JSON with no schema', '', '## Decision Outcome', '',
  'Chosen option: "entity schema".', '',
].join('\n');

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'mole-cascade-argue-'));
  git(root, 'init', '-q', '-b', 'main');
  write('lib/catalog.ts', 'export const cat = 1;\n');
  write('lib/other.ts', 'export const o = 1;\n');
  write('.mole/decisions/D-defended.md', DEFENDED);
  write('.mole/decisions/D-unresolved.md', UNRESOLVED);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  base = git(root, 'rev-parse', 'HEAD');
  heads.defended = pr('defended-edit', () => write('lib/catalog.ts', 'export const cat = 1;\nexport const cat2 = 2;\n'));
  heads.unresolved = pr('unresolved-edit', () => write('lib/other.ts', 'export const o = 1;\nexport const o2 = 2;\n'));
});
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

function fakeLlm(response: string): { client: LlmClient; calls: string[] } {
  const calls: string[] = [];
  return { calls, client: { complete: async (p: string) => { calls.push(p); return { text: response, usage: { inputTokens: 10, outputTokens: 2, costUsd: 0.0001 } }; } } };
}

describe('cascadeCheck escalation prompt carries the engine\'s argument-chain labels (T54)', () => {
  it('a rejected option defeated by a stated reason is named settled, not raised as live doubt', async () => {
    const { client, calls } = fakeLlm('VERDICT: COMPLIANT\nfine.');
    const graph = loadGraph(root);
    await cascadeCheck({ root, base, head: heads.defended!, llm: client, decisionText: decisionTextFromRecords(root, graph.nodes) });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/entity schema is already validated/); // the defeating reason is present
    expect(calls[0]).toMatch(/REJECTED ALTERNATIVE/i);
    expect(calls[0]).not.toMatch(/UNRESOLVED/i);
  });

  it('a rejected option with no stated defeating reason is flagged as a standing, unresolved objection', async () => {
    const { client, calls } = fakeLlm('VERDICT: COMPLIANT\nfine.');
    const graph = loadGraph(root);
    await cascadeCheck({ root, base, head: heads.unresolved!, llm: client, decisionText: decisionTextFromRecords(root, graph.nodes) });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/UNRESOLVED ALTERNATIVE/i);
    expect(calls[0]).toMatch(/Plain JSON with no schema/);
  });

  it('a record with no Considered Options at all still carries its plain decision text unchanged (no spurious engine noise)', async () => {
    const { client, calls } = fakeLlm('VERDICT: COMPLIANT\nfine.');
    const plainRoot = mkdtempSync(join(tmpdir(), 'mole-cascade-argue-plain-'));
    try {
      const plainWrite = (rel: string, text: string) => {
        mkdirSync(dirname(join(plainRoot, rel)), { recursive: true });
        writeFileSync(join(plainRoot, rel), text);
      };
      git(plainRoot, 'init', '-q', '-b', 'main');
      plainWrite('lib/catalog.ts', 'export const cat = 1;\n');
      plainWrite(
        '.mole/decisions/D-plain.md',
        '---\nid: D-plain\ntitle: Catalog format\nstatus: accepted\nscope:\n  - lib/catalog.ts\n---\n\n## Decision\n\nThe catalog file format must follow the entity schema (full text for the LLM tier).\n',
      );
      git(plainRoot, 'add', '-A');
      git(plainRoot, 'commit', '-q', '-m', 'base');
      const b = git(plainRoot, 'rev-parse', 'HEAD');
      git(plainRoot, 'checkout', '-q', '-b', 'edit', b);
      plainWrite('lib/catalog.ts', 'export const cat = 1;\nexport const cat2 = 2;\n');
      git(plainRoot, 'add', '-A');
      git(plainRoot, 'commit', '-q', '-m', 'edit');
      const h = git(plainRoot, 'rev-parse', 'HEAD');
      git(plainRoot, 'checkout', '-q', b);
      const plainGraph = loadGraph(plainRoot);
      await cascadeCheck({ root: plainRoot, base: b, head: h, llm: client, decisionText: decisionTextFromRecords(plainRoot, plainGraph.nodes) });
      expect(calls[calls.length - 1]).toContain('The catalog file format must follow the entity schema');
      expect(calls[calls.length - 1]).not.toMatch(/REJECTED ALTERNATIVE|UNRESOLVED ALTERNATIVE/i);
    } finally {
      rmSync(plainRoot, { recursive: true, force: true });
    }
  });
});
