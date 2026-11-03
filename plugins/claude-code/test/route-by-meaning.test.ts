// T64: decisions with no file scope reach the agent BEFORE it edits, ranked by meaning (BM25, zero model calls).
// Found by T63 prep (dcbench's 15 unscoped decisions): SessionStart/PreToolUse printed nothing, and the T50 repo-wide
// fallback listed the first 5 by id, not the relevant ones. Tests first.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { Bm25Index } from '../../../packages/decisions/src/route/bm25.js';
import { bm25Rank, governingDecisions, REPO_WIDE_CAP } from '../scripts/lib.mjs';

const plugin = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(plugin, '../../packages/daemon/dist/cli.js');
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmp = (p: string) => {
  const d = mkdtempSync(join(tmpdir(), p));
  dirs.push(d);
  return d;
};

// generic fixtures written for this test (not dcbench text): 7 unscoped decisions + 1 file-scoped one
const DECISIONS: Array<[string, string, string, string?]> = [
  ['D-01', 'Audit every data export', 'All data exports must call withAuditLog() before streaming rows to the client.'],
  ['D-02', 'Cursor pagination for lists', 'List endpoints page with an opaque cursor, never offset and limit.'],
  ['D-03', 'Toasts use sonner', 'User notifications use the sonner toast library, not hand-rolled toasts.'],
  ['D-04', 'Env vars through the env module', 'Read configuration through the typed env module, never process.env directly.'],
  ['D-05', 'Validate request bodies with zod', 'API route handlers validate input with zod schemas before use.'],
  ['D-06', 'Feature flags in PostHog', 'Feature flags come from PostHog through useFeatureFlag, never booleans in code.'],
  ['D-07', 'Co-locate tests', 'Test files live next to the source file they test.'],
  ['D-08', 'Charts use the shared palette', 'Dashboard charts take colours from the shared palette.', 'src/charts/'],
];

function repo(): string {
  const root = tmp('mole-t64-');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  mkdirSync(join(root, '.mole/decisions'), { recursive: true });
  for (const [id, title, text, scope] of DECISIONS) {
    writeFileSync(join(root, `.mole/decisions/${id.toLowerCase()}.md`), ['---', `id: ${id}`, `title: ${title}`, 'status: accepted', ...(scope ? ['scope:', `  - ${scope}`] : []), '---', '', '## Decision', '', text, ''].join('\n'));
  }
  return root;
}

function hook(script: string, input: Record<string, unknown>, data: string): { stdout: string; json?: any } {
  const stdout = execFileSync(process.execPath, [join(plugin, 'scripts', `${script}.mjs`)], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, MOLE_BIN: cli, CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PLUGIN_DATA: data },
    timeout: 60_000,
  });
  return { stdout, json: stdout.trim() ? JSON.parse(stdout) : undefined };
}

describe('T64 bm25Rank (lib.mjs) mirrors packages/decisions route/bm25.ts', () => {
  it('same scores and order on a fixture corpus and several queries', () => {
    const docs = DECISIONS.map(([id, title, text]) => ({ id, text: `${title}\n${text}` }));
    const idx = new Bm25Index();
    for (const d of docs) idx.add(d.id, d.text);
    for (const q of ['add a CSV export button to the dashboard', 'paginate the users API', 'show a toast after saving', 'nothing related at all xyz', '']) {
      const want = idx.score(q).filter((h) => h.score > 0);
      const got = bm25Rank(docs, q);
      expect(got.map((h: { id: string }) => h.id)).toEqual(want.map((h) => h.id));
      got.forEach((h: { score: number }, i: number) => expect(h.score).toBeCloseTo(want[i]!.score, 10));
    }
  });
});

describe('T64 governingDecisions ranks unscoped decisions by the text of the moment', () => {
  it('with text: unscoped + repo-wide ranked by BM25, zero-score dropped, capped; file-scoped matches still first', () => {
    const root = repo();
    const got = governingDecisions(undefined, root, new Set(['src/charts/line.ts']), { text: 'Add a CSV export button that streams the analytics rows' });
    expect(got[0].id).toBe('D-08'); // file-scoped match stays
    const ranked = got.filter((d: { matchedTargets: string[] }) => d.matchedTargets.includes('by meaning'));
    expect(ranked[0].id).toBe('D-01');
    expect(ranked.length).toBeLessThanOrEqual(REPO_WIDE_CAP);
    expect(ranked.map((d: { id: string }) => d.id)).not.toContain('D-07'); // shares no term with the text
  });
  it('without text: unscoped records stay silent (old behaviour); only literal repo-wide ones, by id', () => {
    const root = repo();
    expect(governingDecisions(undefined, root, new Set(['src/other.ts'])).map((d: { id: string }) => d.id)).toEqual([]);
  });
});

describe('T64 UserPromptSubmit hook', () => {
  it('is registered in hooks.json', () => {
    const h = JSON.parse(readFileSync(join(plugin, 'hooks/hooks.json'), 'utf8'));
    expect(JSON.stringify(h.hooks.UserPromptSubmit)).toContain('user-prompt-submit.mjs');
  });
  it('injects the decisions the prompt is about, once per session; silent when nothing scores', () => {
    const root = repo();
    const data = tmp('mole-t64-data-');
    const base = { session_id: 's1', transcript_path: join(data, 's1.jsonl'), cwd: root, permission_mode: 'default', hook_event_name: 'UserPromptSubmit' };
    const first = hook('user-prompt-submit', { ...base, prompt: 'Add a CSV export of the analytics table' }, data);
    expect(first.json.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
    const ctx: string = first.json.hookSpecificOutput.additionalContext;
    expect(ctx).toContain('D-01');
    expect(ctx).toContain('withAuditLog');
    const again = hook('user-prompt-submit', { ...base, prompt: 'Add a CSV export of the analytics table' }, data);
    expect(again.stdout.trim()).toBe('');
    expect(hook('user-prompt-submit', { ...base, session_id: 's2', prompt: 'qqq zzz' }, data).stdout.trim()).toBe('');
  });
  it('never fails the session: bad stdin and a missing repo both exit 0 with no output', () => {
    const data = tmp('mole-t64-data-');
    const out = execFileSync(process.execPath, [join(plugin, 'scripts', 'user-prompt-submit.mjs')], { input: 'not json', encoding: 'utf8', env: { ...process.env, MOLE_BIN: cli, CLAUDE_PLUGIN_DATA: data } });
    expect(out.trim()).toBe('');
    expect(hook('user-prompt-submit', { session_id: 's3', cwd: tmp('mole-t64-norepo-'), prompt: 'export csv' }, data).stdout.trim()).toBe('');
  });
});

describe('T64 PreToolUse ranks unscoped decisions by the edited path + new text', () => {
  it('an edit that adds an export surfaces the audit decision', () => {
    const root = repo();
    const data = tmp('mole-t64-data-');
    const r = hook('pre-tool-use', { session_id: 'p1', transcript_path: join(data, 'p1.jsonl'), cwd: root, permission_mode: 'default', hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: join(root, 'src/app/api/export/route.ts'), content: 'export async function GET() { return streamCsvExport(rows) }' } }, data);
    expect(r.json.hookSpecificOutput.additionalContext).toContain('D-01');
  });
});
