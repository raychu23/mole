// T86/D97: the "clean-dir" test for the mole-code npm package: `npm pack` it, install the tarball into a
// FRESH temp dir with no access to this repo's node_modules, then treat the INSTALLED package directory as
// a Claude Code plugin root (exactly what Claude Code's npm plugin source does -- the package IS the plugin
// now, not a separate build) and run every hook with documented sample stdin
// (https://code.claude.com/docs/en/hooks, fetched 2026-11-03) over a tiny standalone git repo carrying a
// .mole decision, plus the MCP initialize/tools-list handshake, `mole rules` against a planted violation, and
// a full daemon start/status/map/stop round trip. This is the one scenario dist-standalone.test.ts does not
// cover: an actual `npm install`, not a plain directory copy -- T86's review found a real bug only this
// round trip reproduces (dependency-cruiser's TypeScript-AST pass needs a real `typescript` package
// resolvable from the installed dist/, which an uninstalled dev checkout always has via the monorepo's own
// hoisted node_modules; see release/mole-code/tools/build.mjs's header and
// tasks/T86-claude-code-plugin-dist/2 insights.md).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../release/mole-code');
let isolated = ''; // fresh npm project OUTSIDE the repo, with mole-code installed from a real tarball
let pluginDir = ''; // isolated/node_modules/mole-code -- doubles as the Claude Code plugin root
let fixtureRepo = ''; // tiny git repo with a .mole decision + a planted rule violation
let pluginData = ''; // CLAUDE_PLUGIN_DATA
let tarball = '';
let binMole = '';

const g = (...args: string[]) => execFileSync('git', ['-C', fixtureRepo, '-c', 'user.name=Fixture', '-c', 'user.email=f@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' });

function runHook(script: string, input: Record<string, unknown>): { code: number; stdout: string; stderr: string; json?: Record<string, any> } {
  const r = spawnSync(process.execPath, [join(pluginDir, 'scripts', `${script}.mjs`)], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 60_000,
    env: { PATH: process.env.PATH ?? '', CLAUDE_PLUGIN_ROOT: pluginDir, CLAUDE_PLUGIN_DATA: pluginData }, // no MOLE_BIN: must self-resolve the installed dist/cli.js
  });
  const stdout = r.stdout ?? '';
  return { code: r.status ?? -1, stdout, stderr: r.stderr ?? '', json: stdout.trim() ? JSON.parse(stdout) : undefined };
}

beforeAll(() => {
  // 1. build + npm pack mole-code (release/mole-code/tools/build.mjs, then `npm pack`)
  execFileSync(process.execPath, [join(pkgDir, 'tools/build.mjs')], { encoding: 'utf8', timeout: 180_000 });
  const packOut = execFileSync('npm', ['pack', '--silent'], { cwd: pkgDir, encoding: 'utf8' }).trim();
  tarball = resolve(pkgDir, packOut.split('\n').pop()!);

  // 2. install the tarball into a FRESH npm project with no access to this repo's node_modules
  isolated = mkdtempSync(join(tmpdir(), 'mole-code-pack-'));
  writeFileSync(join(isolated, 'package.json'), JSON.stringify({ name: 'mole-code-pack-smoke', private: true, version: '0.0.0' }, null, 2));
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--no-workspaces', tarball], { cwd: isolated, encoding: 'utf8', env: { ...process.env, npm_config_workspaces: 'false' } });
  pluginDir = join(isolated, 'node_modules/mole-code');
  binMole = join(isolated, 'node_modules/.bin/mole');

  // 3. a tiny standalone git repo carrying one .mole decision AND a planted rule violation (src/a.ts -> src/b.ts)
  fixtureRepo = mkdtempSync(join(tmpdir(), 'mole-code-pack-fixture-'));
  pluginData = mkdtempSync(join(tmpdir(), 'mole-code-pack-data-'));
  g('init', '-q', '-b', 'main');
  mkdirSync(join(fixtureRepo, 'src'));
  mkdirSync(join(fixtureRepo, '.mole/decisions'), { recursive: true });
  writeFileSync(join(fixtureRepo, 'src/a.ts'), "import { b } from './b';\nexport function a() { return b(); }\n");
  writeFileSync(join(fixtureRepo, 'src/b.ts'), 'export function b() { return 1; }\n');
  writeFileSync(
    join(fixtureRepo, '.mole/decisions/d1.md'),
    ['---', 'id: D1', "title: 'a() stays synchronous'", 'status: accepted', 'approver: fixture-owner', 'scope:', '  - src/a.ts', 'rules:', '  - forbid: import', '    from: src/a.ts', '    to: src/b.ts', '    why: mole-code-pack planted violation', '---', '## Decision', 'Keep a() synchronous.', ''].join('\n'),
  );
  g('add', '.');
  g('commit', '-q', '-m', 'init with decision D1 + planted violation');
}, 180_000); // build + npm pack + npm install (fresh network-free tarball install) comfortably exceeds the 30s default

afterAll(() => {
  for (const d of [isolated, fixtureRepo, pluginData]) if (d) rmSync(d, { recursive: true, force: true });
  if (tarball && existsSync(tarball)) rmSync(tarball, { force: true });
});

describe('T86/D97: mole-code installed from a real npm tarball, used as the Claude Code plugin root', () => {
  it('npm pack --dry-run lists LICENSE (D97: copied into the package at build time)', () => {
    const out = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: pkgDir, encoding: 'utf8' });
    const [entry] = JSON.parse(out);
    expect(entry.files.map((f: { path: string }) => f.path)).toContain('LICENSE');
  }, 120_000); // npm pack --dry-run takes ~4 s idle but >20 s at load 40+ (ledger close flaked twice 11-04)

  it('every vendored dependency keeps its license file (MIT/Apache notices must ship with the code)', () => {
    const out = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: pkgDir, encoding: 'utf8' });
    const [entry] = JSON.parse(out);
    const paths: string[] = entry.files.map((f: { path: string }) => f.path);
    // each top-level vendored package dir (dist/node_modules/<name> or dist/node_modules/@scope/<name>, nested too)
    const pkgRoots = new Set(paths.filter((p) => /(^|\/)node_modules\/(@[^/]+\/)?[^/@]+\/package\.json$/.test(p)).map((p) => p.slice(0, -'/package.json'.length)));
    const missing = [...pkgRoots].filter((root) => !paths.some((p) => p.startsWith(root + '/') && /^(licen[cs]e|copying)([-.]|$)/i.test(p.slice(root.length + 1))));
    expect(missing).toEqual([]);
  }, 120_000);

  it('the installed package directory is a valid Claude Code plugin root', () => {
    for (const rel of ['.claude-plugin/plugin.json', 'hooks/hooks.json', '.mcp.json', 'scripts/lib.mjs', 'scripts/session-start.mjs', 'dist/cli.js']) {
      expect(existsSync(join(pluginDir, rel)), `missing ${rel}`).toBe(true);
    }
  });

  it('SessionStart surfaces the governing decision (sample stdin per docs)', () => {
    const r = runHook('session-start', { session_id: 'sess-1', transcript_path: join(pluginData, 'sess-1.jsonl'), cwd: fixtureRepo, hook_event_name: 'SessionStart', source: 'startup' });
    expect(r.code).toBe(0);
    expect(r.json?.hookSpecificOutput?.hookEventName).toBe('SessionStart');
    expect(r.json?.hookSpecificOutput?.additionalContext).toContain('D1');
  });

  it('PreToolUse (Edit) names the decision governing the edited file (sample stdin per docs)', () => {
    const r = runHook('pre-tool-use', {
      session_id: 'sess-2',
      cwd: fixtureRepo,
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: join(fixtureRepo, 'src/a.ts'), old_string: 'return b()', new_string: 'return b() + 1' },
    });
    expect(r.code).toBe(0);
    expect(r.json?.hookSpecificOutput?.hookEventName).toBe('PreToolUse');
    expect(r.json?.hookSpecificOutput?.additionalContext).toContain('D1');
  });

  it('UserPromptSubmit never blocks (sample stdin per docs)', () => {
    const r = runHook('user-prompt-submit', { session_id: 'sess-3', transcript_path: join(pluginData, 'sess-3.jsonl'), cwd: fixtureRepo, permission_mode: 'default', hook_event_name: 'UserPromptSubmit', prompt: 'Write a function to calculate the factorial of a number' });
    expect(r.code).toBe(0);
    if (r.json) expect(r.json.hookSpecificOutput?.hookEventName).toBe('UserPromptSubmit');
  });

  it('Stop never blocks and degrades quietly (sample stdin per docs)', () => {
    const r = runHook('stop', { session_id: 'sess-4', transcript_path: join(pluginData, 'sess-4.jsonl'), cwd: fixtureRepo, permission_mode: 'default', hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'Done.' });
    expect(r.code).toBe(0);
  });

  it('the bundled MCP server answers initialize + tools/list over stdio', () => {
    const child = spawnSync(process.execPath, [join(pluginDir, 'dist/mcp.cjs')], {
      encoding: 'utf8',
      timeout: 20_000,
      input:
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'mole-code-pack-test', version: '0.0.0' } } }) +
        '\n' +
        JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) +
        '\n',
      env: { PATH: process.env.PATH ?? '', MOLE_ROOT: fixtureRepo },
    });
    const messages = (child.stdout ?? '')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
    expect(messages.find((m) => m.id === 1)?.result?.serverInfo?.name).toBe('mole');
    const names = (messages.find((m) => m.id === 2)?.result?.tools ?? []).map((t: { name: string }) => t.name);
    expect(names).toContain('mole_map');
  });

  it('mole rules finds the planted violation (exit 1, cites the decision)', () => {
    const r = spawnSync(binMole, ['rules', '--root', fixtureRepo], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/breaks D1/);
  });

  it('daemon start (via `mole map`, auto-spawned) / status / stop round trip', () => {
    const run = (...args: string[]) => spawnSync(binMole, [...args, '--root', fixtureRepo], { encoding: 'utf8', timeout: 30_000 });
    try {
      // `mole map` auto-spawns the daemon (ensureDaemon()) if it is not already running for this root
      const map = run('map', 'src/a.ts');
      expect(map.status).toBe(0);
      expect(map.stdout).toContain('a.ts');
      const status = run('status');
      expect(status.status).toBe(0);
    } finally {
      expect(run('stop').status).toBe(0);
    }
  }, 45_000);
});
