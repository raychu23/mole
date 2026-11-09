// T120c RED tests: cascade.ts never passed embedBoost/changeEmbedding through to routeDecisions (B2 Q13 NEW-repo
// review finding) -- route.ts's own embedBoost signal (T120, see route-embed-governs.test.ts) was unreachable
// from a real `mole cascade-check` run. This wires it: SemanticRouteOptions.embedBoost + an injectable Embedder
// (same posture as `llm?: LlmClient` -- cascade.ts has no model/network dependency of its own), computed ONCE per
// check in a single batched call (every routing candidate's own index text, plus the change text).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cascadeCheck } from '../src/index.js';
import type { Embedder } from '../src/cascade/types.js';
import type { RouteDoc } from '../src/route/types.js';

const git = (root: string, ...args: string[]) =>
  execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();

let root = '';
let base = '';
let head = '';

function write(rel: string, text: string) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

// Same shape as route-embed-governs.test.ts's DOC_SINGLETON/DIFF_TEXT: zero lexical overlap with the decision's
// own prose (BM25 alone routes nothing), but a change that a real embedder would place near it.
const SINGLETON_DECISION = '---\nid: adr-singleton\ntitle: Avoid the Singleton Pattern for Service Clients\nstatus: accepted\nscope: []\n---\n\n## Decision\n\nService clients must be constructed via dependency injection, never a module-level singleton.\n';
const DOCS: RouteDoc[] = [{ id: 'adr-singleton', title: 'Avoid the Singleton Pattern for Service Clients', summary: 'DI only, never a module-level singleton.', text: 'avoid singleton pattern service clients dependency injection module level instance', embedding: [1, 0, 0] }];

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'mole-cascade-embed-'));
  git(root, 'init', '-q', '-b', 'main');
  write('src/a.ts', 'export const a = 1;\n');
  write('.mole/decisions/adr-singleton.md', SINGLETON_DECISION);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  base = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '-q', '-b', 'pr1', base);
  write('src/db.ts', 'export const db = new Pool(); // app boot grabs one shared connection for the whole program lifetime\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'add module-level db singleton');
  head = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '-q', base);
});
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

function stubEmbedder(vectorFor: (text: string) => number[]): { embedder: Embedder; calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    embedder: {
      async embed(texts: string[]): Promise<number[][]> {
        calls.push(texts);
        return texts.map(vectorFor);
      },
    },
  };
}
const vectorFor = (text: string): number[] => (text.includes('singleton') ? [1, 0, 0] : text.includes('db =') ? [0.98, 0.1, 0.05] : [0, 0, 1]);

describe('cascadeCheck: embedBoost wiring (T120c)', () => {
  it('without embedBoost/embedder, a lexically-dissimilar true decision is still unrouted (documents the gap this fixes)', async () => {
    const r = await cascadeCheck({ root, base, head, semanticRoute: { decisions: DOCS } });
    expect(r.routing).toEqual([]);
  });

  it('embedBoost:true with no embedder given is a no-op (same as without, never throws)', async () => {
    const r = await cascadeCheck({ root, base, head, semanticRoute: { decisions: DOCS, embedBoost: true } });
    expect(r.routing).toEqual([]);
  });

  it('embedBoost + embedder: cascadeCheck computes embeddings and passes them through, recovering the decision', async () => {
    const { embedder, calls } = stubEmbedder(vectorFor);
    const r = await cascadeCheck({ root, base, head, semanticRoute: { decisions: DOCS, embedBoost: true, embedder } });
    expect(r.routing.map((x) => x.decision)).toEqual(['adr-singleton']);
    expect(r.routing[0]!.hitKinds).toEqual(['semantic']);
    // ONE batched embed() call (every candidate's text + the change text), never one call per candidate.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(2); // 1 candidate + 1 change text
  });

  it('embedBoost never calls the embedder when there are zero routing candidates left to embed', async () => {
    const { embedder, calls } = stubEmbedder(vectorFor);
    // every decision already governed by a scope/content anchor -- semanticRoute has nothing left to route.
    const r = await cascadeCheck({ root, base, head, semanticRoute: { decisions: [], embedBoost: true, embedder } });
    expect(calls).toHaveLength(0);
    expect(r.routing).toEqual([]);
  });
});
