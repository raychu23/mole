// T66 (found by T65 11-03): isExportConventionTitle matches ANY title term that merely starts with 'export'. A
// decision titled "Audit every data export" (a data/report export, not the JS module-export convention) still
// contains the token "export", so prCheck's option-4 AST fallback gives it an `export-convention` hit the moment a
// new TS `export` appears ANYWHERE in the diff, and cascade.ts's isCrisp treats that hit as crisp -- zero LLM,
// no judge, auto-'violates'. Written red first: this is the exact shape cascade-worktree.test.ts's own comment
// calls out ("Title avoids the word 'export': prCheck's export-convention title heuristic would claim it crisply
// (T66 owns that bug)").
//
// Fix direction (prior-art.md): keep isExportConventionTitle broad for ROUTING (the decision still becomes a
// candidate and still gets the AST anchor hit -- recall is unchanged), but cascade's isCrisp now additionally
// requires the title to use actual module-export vocabulary (default/named exports, module export structure,
// barrel/index) before treating an export-convention hit as a no-judge, auto-decide signal. The M24 bench's own
// two motivating ADRs (bs-adr003 "Avoid Default Exports and Prefer Named Exports", bs-adr004 "Module Export
// Structure") use exactly that vocabulary, so they stay crisp; a title that merely contains the substring "export"
// in an unrelated sense does not.
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

// the exact trap case: title names a DATA export, not a JS module export. scope: [] so the only possible hit is
// option 4's AST fallback (no path/folder anchor, no authored match: content anchor).
const DATA_EXPORT = `---\nid: D-data-export\ntitle: Audit every data export\nstatus: accepted\nscope: []\n---\n\n## Decision\n\nEvery data export endpoint must call withAuditLog() before it streams rows.\n`;
// the real M24-bench-shaped motivating case: title genuinely about the JS module-export convention.
const MODULE_EXPORT = `---\nid: D-module-export\ntitle: Avoid Default Exports and Prefer Named Exports\nstatus: accepted\nscope: []\n---\n\n## Decision\n\nWe will make each exported symbol traceable through index files; only index files have re-exports.\n`;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'mole-t66-'));
  git(root, 'init', '-q', '-b', 'main');
  write('pkg/src/widget.ts', 'export function existing(): number {\n  return 1;\n}\n');
  write('.mole/decisions/D-data-export.md', DATA_EXPORT);
  write('.mole/decisions/D-module-export.md', MODULE_EXPORT);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  base = git(root, 'rev-parse', 'HEAD');
  // a brand-new named export, unrelated to data/report export -- the only kind of hunk option 4's AST fallback fires on
  heads.newExport = pr('new-export', () => write('pkg/src/widget.ts', 'export function existing(): number {\n  return 1;\n}\n\nexport interface WidgetOptions {\n  size: number;\n}\n'));
});
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

function fakeLlm(response: string): { client: LlmClient; calls: string[] } {
  const calls: string[] = [];
  return { calls, client: { complete: async (p: string) => { calls.push(p); return { text: response, usage: { inputTokens: 10, outputTokens: 2, costUsd: 0.0001 } }; } } };
}

describe('T66: a title that merely contains an export-prefixed word is not a crisp module-export signal', () => {
  it('"Audit every data export" + a new TS export: NOT a crisp zero-llm violation when an LLM tier is configured -- escalates and lets the judge decide', async () => {
    const { client, calls } = fakeLlm('VERDICT: COMPLIANT\nunrelated new TS export, not a data-export change.');
    const graph = loadGraph(root);
    const r = await cascadeCheck({ root, base, head: heads.newExport!, llm: client, decisionText: decisionTextFromRecords(root, graph.nodes) });
    const v = r.verdicts.find((x) => x.decision === 'D-data-export');
    expect(v).toBeDefined();
    expect(v!.tier).toBe('llm'); // escalated to the judge, not auto-decided
    expect(calls.length).toBeGreaterThan(0); // the judge was actually asked
  });

  it('routing is unaffected: the data-export decision still becomes a candidate and still gets an export-convention hit', async () => {
    const graph = loadGraph(root);
    const r = await cascadeCheck({ root, base, head: heads.newExport!, decisionText: decisionTextFromRecords(root, graph.nodes) });
    const routed = r.routing.find((x) => x.decision === 'D-data-export');
    expect(routed).toBeDefined();
    expect(routed!.hitKinds).toContain('export-convention');
  });

  it('the real M24-shaped module-export decision ("Avoid Default Exports and Prefer Named Exports") stays crisp: zero-llm, no judge call needed', async () => {
    const graph = loadGraph(root);
    const r = await cascadeCheck({ root, base, head: heads.newExport!, decisionText: decisionTextFromRecords(root, graph.nodes) });
    const v = r.verdicts.find((x) => x.decision === 'D-module-export');
    expect(v).toMatchObject({ tier: 'zero-llm', flag: 'violates' });
  });
});
