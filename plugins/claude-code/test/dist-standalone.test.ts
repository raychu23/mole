// T86: the plugin must work as a plain directory COPY with no repo checkout and no `npm install`. This test
// builds the plugin (plugins/claude-code/scripts/build.mjs, esbuild -- same bundler as apps/vscode/esbuild.mjs),
// copies ONLY the files a marketplace relative-path install would fetch (dist/, hooks/, scripts/, .mcp.json,
// .claude-plugin/plugin.json -- never bench/ or test/, see scripts/export-public.mjs's allowlist) into a fresh
// temp directory OUTSIDE this repo, then runs each hook script there against documented sample stdin
// (https://code.claude.com/docs/en/hooks, fetched 2026-11-03; see tasks/T86-claude-code-plugin-dist/4 log/prior-art.md)
// over a tiny standalone git repo carrying a .mole decision, with no MOLE_BIN override -- so scripts/lib.mjs's
// findMole() must resolve the BUNDLED dist/cli.js on its own. It also runs the bundled MCP server's
// initialize + tools/list handshake (https://modelcontextprotocol.io, the same JSON-RPC any MCP client speaks).
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const pluginSrc = join(dirname(fileURLToPath(import.meta.url)), '..'); // plugins/claude-code (this repo)
let standalone = ''; // fresh dir OUTSIDE the repo, holding ONLY the distributable plugin files
let fixtureRepo = ''; // tiny git repo with a .mole decision, standing in for a user's project
let pluginData = ''; // CLAUDE_PLUGIN_DATA

const g = (...args: string[]) => execFileSync('git', ['-C', fixtureRepo, '-c', 'user.name=Fixture', '-c', 'user.email=f@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' });

function runHook(script: string, input: Record<string, unknown>): { code: number; stdout: string; stderr: string; json?: Record<string, any> } {
  const r = spawnSync(process.execPath, [join(standalone, 'scripts', `${script}.mjs`)], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 60_000,
    env: { PATH: process.env.PATH ?? '', CLAUDE_PLUGIN_ROOT: standalone, CLAUDE_PLUGIN_DATA: pluginData }, // no MOLE_BIN: must self-resolve the bundled CLI
  });
  const stdout = r.stdout ?? '';
  return { code: r.status ?? -1, stdout, stderr: r.stderr ?? '', json: stdout.trim() ? JSON.parse(stdout) : undefined };
}

beforeAll(() => {
  // 1. build: esbuild-bundle the daemon CLI + worker + MCP server into plugins/claude-code/dist/ (assumes
  //    `npx tsc -b` has already built the workspace packages this reads from -- same precondition as
  //    apps/vscode/esbuild.mjs's own daemon bundling).
  execFileSync(process.execPath, [join(pluginSrc, 'scripts/build.mjs')], { encoding: 'utf8', timeout: 120_000 });

  // 2. copy ONLY the distributable files (mirrors export-public.mjs's plugin allowlist) to a fresh dir OUTSIDE this repo
  standalone = mkdtempSync(join(tmpdir(), 'mole-plugin-standalone-'));
  for (const rel of ['dist', 'hooks', 'scripts', '.mcp.json', '.claude-plugin']) cpSync(join(pluginSrc, rel), join(standalone, rel), { recursive: true });

  // 3. a tiny standalone git repo (not this repo, not a worktree of it) carrying one .mole decision scoped to src/a.ts
  fixtureRepo = mkdtempSync(join(tmpdir(), 'mole-plugin-fixture-'));
  pluginData = mkdtempSync(join(tmpdir(), 'mole-plugin-data-'));
  g('init', '-q', '-b', 'main');
  mkdirSync(join(fixtureRepo, 'src'));
  mkdirSync(join(fixtureRepo, '.mole/decisions'), { recursive: true });
  writeFileSync(join(fixtureRepo, 'src/a.ts'), 'export function a() {\n  return 1;\n}\n');
  writeFileSync(
    join(fixtureRepo, '.mole/decisions/d1.md'),
    "---\nid: D1\ntitle: 'a() stays synchronous'\nstatus: accepted\napprover: fixture-owner\nscope:\n  - src/a.ts\n---\n## Decision\nKeep a() synchronous.\n",
  );
  g('add', '.');
  g('commit', '-q', '-m', 'init with decision D1');
});

afterAll(() => {
  for (const d of [standalone, fixtureRepo, pluginData]) if (d) rmSync(d, { recursive: true, force: true });
});

describe('T86: the plugin as a standalone directory copy (no repo checkout, no npm install)', () => {
  it('SessionStart surfaces the governing decision for files in play (sample stdin per docs)', () => {
    // sample shape from https://code.claude.com/docs/en/hooks#sessionstart (session_id, transcript_path, cwd, hook_event_name, source)
    const r = runHook('session-start', { session_id: 'sess-1', transcript_path: join(pluginData, 'sess-1.jsonl'), cwd: fixtureRepo, hook_event_name: 'SessionStart', source: 'startup' });
    expect(r.code).toBe(0);
    expect(r.json?.hookSpecificOutput?.hookEventName).toBe('SessionStart');
    expect(r.json?.hookSpecificOutput?.additionalContext).toContain('D1');
  });

  it('PreToolUse (Edit) names the decision governing the edited file (sample stdin per docs)', () => {
    // sample shape from https://code.claude.com/docs/en/hooks#pretooluse (hook_event_name, tool_name, tool_input.file_path absolute)
    const r = runHook('pre-tool-use', {
      session_id: 'sess-2',
      cwd: fixtureRepo,
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: join(fixtureRepo, 'src/a.ts'), old_string: 'return 1', new_string: 'return 2' },
    });
    expect(r.code).toBe(0);
    expect(r.json?.hookSpecificOutput?.hookEventName).toBe('PreToolUse');
    expect(r.json?.hookSpecificOutput?.additionalContext).toContain('D1');
  });

  it('UserPromptSubmit never blocks on a prompt naming no file (sample stdin per docs)', () => {
    // sample shape from https://code.claude.com/docs/en/hooks#userpromptsubmit
    const r = runHook('user-prompt-submit', { session_id: 'sess-3', transcript_path: join(pluginData, 'sess-3.jsonl'), cwd: fixtureRepo, permission_mode: 'default', hook_event_name: 'UserPromptSubmit', prompt: 'Write a function to calculate the factorial of a number' });
    expect(r.code).toBe(0); // never blocks; may emit nothing (no decision/steer text matches this prompt) or additionalContext
    if (r.json) expect(r.json.hookSpecificOutput?.hookEventName).toBe('UserPromptSubmit');
  });

  it('Stop never blocks and degrades quietly with no session history (sample stdin per docs)', () => {
    // sample shape from https://code.claude.com/docs/en/hooks#stop
    const r = runHook('stop', { session_id: 'sess-4', transcript_path: join(pluginData, 'sess-4.jsonl'), cwd: fixtureRepo, permission_mode: 'default', hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'Done.' });
    expect(r.code).toBe(0); // the hard requirement (M31b/T15): never fails or blocks the session, even with no recorded SessionStart
  });

  it('the bundled MCP server answers initialize + tools/list over stdio (MCP JSON-RPC handshake)', () => {
    const child = spawnSync(process.execPath, [join(standalone, 'dist/mcp.cjs')], {
      encoding: 'utf8',
      timeout: 20_000,
      input:
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke-test', version: '0.0.0' } } }) +
        '\n' +
        JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'notifications/initialized' }) +
        '\n' +
        JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} }) +
        '\n',
      env: { PATH: process.env.PATH ?? '', MOLE_ROOT: fixtureRepo },
    });
    const lines = (child.stdout ?? '').split('\n').filter((l) => l.trim());
    const messages = lines.map((l) => JSON.parse(l));
    const init = messages.find((m) => m.id === 1);
    expect(init?.result?.serverInfo?.name).toBe('mole');
    const toolsList = messages.find((m) => m.id === 3);
    const names = (toolsList?.result?.tools ?? []).map((t: { name: string }) => t.name);
    expect(names).toContain('mole_map');
  });
});
