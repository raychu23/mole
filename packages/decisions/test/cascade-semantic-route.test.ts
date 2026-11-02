// T53 red tests: cascade wiring. `semanticRoute` runs BM25 (+ optional LLM) routing over decisions that
// scope/content anchors found NOTHING for (additive -- never removes or overrides a scope/content hit), and adds
// any decision it finds to `routing` + escalates it like any other governed-but-not-crisp hit.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cascadeCheck, type LlmClient } from '../src/index.js';
import type { RouteDoc } from '../src/route/types.js';

const git = (root: string, ...args: string[]) =>
  execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();

let root = '';
let base = '';
let headNoScope = '';

function write(rel: string, text: string) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

// NO-SCOPE: scope: [] AND no content/export-convention anchor -- never reaches prCheck's own `candidates` filter
// at all (the T49-diagnosed recall ceiling: a decision with no authored anchor can never govern, zero-LLM or not).
const NO_SCOPE = `---\nid: D-noscope\ntitle: Avoid Default Exports\nstatus: accepted\nscope: []\n---\n\n## Decision\n\nUse named exports only, never a default export, anywhere in this codebase.\n`;

beforeAll(() => {
  root = mktempRoot();
  git(root, 'init', '-q', '-b', 'main');
  write('src/a.ts', 'export const a = 1;\n');
  write('.mole/decisions/D-noscope.md', NO_SCOPE);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  base = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '-q', '-b', 'pr1', base);
  write('src/a.ts', 'export const a = 1;\nexport default a;\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'add default export');
  headNoScope = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '-q', base);
});
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});
function mktempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'mole-cascade-semantic-'));
}

function fakeLlm(response: string): { client: LlmClient; calls: string[] } {
  const calls: string[] = [];
  return { calls, client: { complete: async (p: string) => { calls.push(p); return { text: response, usage: { inputTokens: 10, outputTokens: 2, costUsd: 0.0001 } }; } } };
}

const DOCS: RouteDoc[] = [{ id: 'D-noscope', title: 'Avoid Default Exports', summary: 'Named exports only.', text: 'avoid default exports prefer named exports barrel' }];

describe('cascadeCheck: semanticRoute finds a decision scope-anchor routing never could', () => {
  it('without semanticRoute, a scope:[] decision with no content anchor never appears in routing at all', async () => {
    const r = await cascadeCheck({ root, base, head: headNoScope });
    expect(r.routing).toEqual([]);
    expect(r.verdicts).toEqual([]);
  });

  it('with semanticRoute, the same decision is added to routing and escalates (no crisp anchor fired)', async () => {
    const { client: escalateLlm } = fakeLlm('VERDICT: VIOLATES\nadds a default export.');
    const r = await cascadeCheck({ root, base, head: headNoScope, llm: escalateLlm, decisionText: () => NO_SCOPE, semanticRoute: { decisions: DOCS } });
    expect(r.routing.map((x) => x.decision)).toEqual(['D-noscope']);
    expect(r.routing[0]!.hitKinds).toEqual(['semantic']);
    expect(r.verdicts).toHaveLength(1);
    expect(r.verdicts[0]).toMatchObject({ decision: 'D-noscope', tier: 'llm', flag: 'violates' });
  });

  it('semanticRoute never duplicates a decision scope/content anchors already routed', async () => {
    // same decision, but now WITH a scope anchor that already governs: semanticRoute must not add it twice
    const root2 = mktempRoot();
    try {
      git(root2, 'init', '-q', '-b', 'main');
      mkdirSync(join(root2, 'src'), { recursive: true });
      writeFileSync(join(root2, 'src/a.ts'), 'export const a = 1;\n');
      mkdirSync(join(root2, '.mole/decisions'), { recursive: true });
      writeFileSync(join(root2, '.mole/decisions/D-scoped.md'), '---\nid: D-scoped\ntitle: Avoid Default Exports\nstatus: accepted\nscope:\n  - src/a.ts\n---\n\n## Decision\n\nUse named exports only.\n');
      git(root2, 'add', '-A');
      git(root2, 'commit', '-q', '-m', 'base');
      const b2 = git(root2, 'rev-parse', 'HEAD');
      git(root2, 'checkout', '-q', '-b', 'pr2', b2);
      writeFileSync(join(root2, 'src/a.ts'), 'export const a = 1;\nexport default a;\n');
      git(root2, 'add', '-A');
      git(root2, 'commit', '-q', '-m', 'edit');
      const h2 = git(root2, 'rev-parse', 'HEAD');
      git(root2, 'checkout', '-q', b2);
      const r = await cascadeCheck({ root: root2, base: b2, head: h2, semanticRoute: { decisions: [{ id: 'D-scoped', title: 'Avoid Default Exports', summary: 'Named exports only.', text: 'avoid default exports prefer named exports' }] } });
      expect(r.routing).toHaveLength(1); // not 2 -- the scope-anchor hit, not duplicated by semanticRoute
      expect(r.routing[0]!.hitKinds).toEqual(['src/a.ts']); // the scope anchor's own target, not a semantic hit
    } finally {
      rmSync(root2, { recursive: true, force: true });
    }
  });
});
