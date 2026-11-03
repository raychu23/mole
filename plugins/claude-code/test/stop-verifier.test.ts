// T65: the Stop hook runs Mole's measured verifier (cascade + T53 semantic routing) on the session's uncommitted work
// and hands violations back so the agent fixes them before it finishes. Tests first.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { verifierParts } from '../scripts/verify.mjs';

const plugin = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(plugin, '../../packages/daemon/dist/cli.js');
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (root: string, ...a: string[]) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', env: ENV }).trim();
function write(root: string, file: string, text: string): void {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}
function repo(withRecords = true): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-t65-stop-'));
  dirs.push(root);
  git(root, 'init', '-q', '-b', 'main');
  write(root, 'src/api/report.ts', 'export function report() {\n  return [];\n}\n');
  if (withRecords) write(root, '.mole/decisions/d1.md', ['---', 'id: D1', 'title: Audit every data download', 'status: accepted', '---', '', '## Decision', '', 'Every data download endpoint must call withAuditLog() before it streams rows.', ''].join('\n'));
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'base');
  write(root, 'src/api/download/route.ts', 'export async function GET() {\n  return new Response(toCsv(await loadRows()));\n}\n');
  return root;
}
function stop(root: string, env: Record<string, string> = {}, extra: Record<string, unknown> = {}) {
  const data = mkdtempSync(join(tmpdir(), 'mole-t65-data-'));
  dirs.push(data);
  const out = execFileSync(process.execPath, [join(plugin, 'scripts/stop.mjs')], {
    input: JSON.stringify({ session_id: 's', cwd: root, hook_event_name: 'Stop', stop_hook_active: false, ...extra }),
    encoding: 'utf8',
    env: { ...process.env, MOLE_BIN: cli, CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PLUGIN_DATA: data, ...env },
    timeout: 120_000,
  });
  return out.trim() ? JSON.parse(out) : undefined;
}

const CASCADE = {
  base: 'a', head: 'b', files: ['src/api/download/route.ts'], ms: 900,
  routing: [{ decision: 'D1', title: 'Audit every data download', hitKinds: ['semantic'] }],
  verdicts: [
    { decision: 'D1', title: 'Audit every data download', tier: 'llm', flag: 'violates', reason: 'the route streams rows without withAuditLog()', ms: 800 },
    { decision: 'D2', title: 'Buttons use the design system', tier: 'llm', flag: 'compliant', reason: 'no button changed', ms: 1 },
  ],
};

describe('T65 verifierParts (verify.mjs) formats a cascade result', () => {
  it('a judged violation: decision id, title, reason, the word "violations" (harness + agent read it), continue text', () => {
    const p = verifierParts(CASCADE);
    expect(p.text).toContain('decision violations');
    expect(p.text).toContain('D1');
    expect(p.text).toContain('without withAuditLog()');
    expect(p.text).not.toContain('D2');
    expect(p.continueText).toMatch(/fix/i);
  });
  it('no-model run: routed decisions are listed as "not judged", never as violations, and do not ask to continue', () => {
    const p = verifierParts({ ...CASCADE, verdicts: [{ decision: 'D1', title: 'Audit every data download', tier: 'zero-llm', flag: 'violates', reason: 'scope anchor touched; no LLM tier configured for this call, reporting the raw governed hit', ms: 1 }] });
    expect(p.text).toContain('not judged');
    expect(p.text).not.toContain('decision violations');
    expect(p.continueText).toBe('');
  });
  it('nothing violated: empty', () => {
    expect(verifierParts({ ...CASCADE, verdicts: [CASCADE.verdicts[1]] })).toEqual({ text: '', continueText: '' });
    expect(verifierParts(undefined)).toEqual({ text: '', continueText: '' });
  });
});

describe('T65 stop.mjs runs the verifier on the session change', () => {
  it('no model (MOLE_STOP_VERIFY_LLM=0): the semantically routed decision shows as not judged; repo untouched', () => {
    const root = repo();
    const before = [git(root, 'status', '--porcelain', '--untracked-files=all'), git(root, 'show-ref'), readFileSync(join(root, '.git/index')).toString('base64')];
    const r = stop(root, { MOLE_STOP_VERIFY_LLM: '0' });
    expect(r.systemMessage).toContain('D1');
    expect(r.systemMessage).toContain('not judged');
    expect([git(root, 'status', '--porcelain', '--untracked-files=all'), git(root, 'show-ref'), readFileSync(join(root, '.git/index')).toString('base64')]).toEqual(before);
  });
  it('MOLE_STOP_VERIFY=0 turns it off; a repo with no records never runs it', () => {
    expect(JSON.stringify(stop(repo(), { MOLE_STOP_VERIFY: '0', MOLE_STOP_VERIFY_LLM: '0' }) ?? {})).not.toContain('not judged');
    expect(JSON.stringify(stop(repo(false), { MOLE_STOP_VERIFY_LLM: '0' }) ?? {})).not.toContain('Mole verifier');
  });
  it('hooks.json gives Stop enough time for one model-judged check', () => {
    const h = JSON.parse(readFileSync(join(plugin, 'hooks/hooks.json'), 'utf8'));
    expect(h.hooks.Stop[0].hooks[0].timeout).toBeGreaterThanOrEqual(120);
  });
});
