// T34 one-panel (M26): checked by this script (R1: committed with the key + failing tests, before any
// implementation). Does two things, both over a REAL VS Code instance opened on the Mole repo itself:
//
// M26a — parses apps/vscode/package.json `contributes` and drives @vscode/test-electron to open the repo,
//   move the cursor through a few TypeScript files, and read back the sidebar view's last-rendered model
//   (exposed by the extension for this one purpose, see apps/vscode/test-e2e/m26-entry.cjs). A feature from
//   tasks/T34-one-panel/4 log/m26-key.json counts as covered if its id/cli text appears in contributes OR in
//   the rendered model OR among registered diagnostics. Target 14/14.
// M26b — the entry script also records, for 3 repeated cursor-move/file-switch refreshes, the ms from the
//   trigger to the view's postMessage update; this script computes p95. Target <= 300 ms.
//
// Usage: node apps/vscode/scripts/m26.mjs
// Writes tasks/T34-one-panel/4 log/runs.jsonl (R4) itself, so the evidence is produced by code, not prose (R6).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const extRoot = resolve(here, '..'); // apps/vscode
const repoRoot = resolve(extRoot, '../..'); // Mole repo
const taskLog = join(repoRoot, 'tasks/T34-one-panel/4 log');
const key = JSON.parse(readFileSync(join(taskLog, 'm26-key.json'), 'utf8'));

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function appendRun(cmd, exit, metrics) {
  appendFileSync(join(taskLog, 'runs.jsonl'), JSON.stringify({ time: new Date().toISOString(), commit: gitSha(), cmd, exit, metrics }) + '\n');
}

// --- M26a static half: contributes.json text -----------------------------------------------------------
const pkg = JSON.parse(readFileSync(join(extRoot, 'package.json'), 'utf8'));
const contributesText = JSON.stringify(pkg.contributes ?? {});

// --- real VS Code E2E -------------------------------------------------------------------------------------
async function findVSCodeExecutable() {
  if (process.env.CODE_BIN) return process.env.CODE_BIN;
  // resolve the `code` CLI's app bundle (avoids @vscode/test-electron downloading a second copy: disk budget)
  try {
    const link = execFileSync('which', ['code'], { encoding: 'utf8' }).trim();
    const real = execFileSync('python3', ['-c', `import os,sys;print(os.path.realpath(sys.argv[1]))`, link], { encoding: 'utf8' }).trim();
    // .../Visual Studio Code.app/Contents/Resources/app/bin/code -> the .app bundle itself
    const appIdx = real.indexOf('.app/');
    if (appIdx > -1) return real.slice(0, appIdx + 4);
  } catch {
    // fall through
  }
  return undefined;
}

async function runE2E() {
  let testElectron;
  try {
    testElectron = await import('@vscode/test-electron');
  } catch (e) {
    return { ok: false, reason: `@vscode/test-electron not installed: ${e.message}` };
  }
  const vscodeExecutablePath = await findVSCodeExecutable();
  if (!vscodeExecutablePath || !existsSync(vscodeExecutablePath)) {
    return { ok: false, reason: 'no installed VS Code app found (set CODE_BIN)' };
  }
  const outDir = mkdtempSync(join(tmpdir(), 'mole-m26-'));
  const outFile = join(outDir, 'result.json');
  const userDataDir = join(outDir, 'ud');
  const extensionsDir = join(outDir, 'ext');
  try {
    const { runTests, resolveCliArgsFromVSCodeExecutablePath } = testElectron;
    const [cliPath, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
    // make sure the extension is built (bundled dist/extension.cjs) before launching the dev host
    execFileSync('node', ['esbuild.mjs'], { cwd: extRoot, stdio: 'inherit' });
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath: extRoot,
      extensionTestsPath: join(extRoot, 'test-e2e', 'm26-entry.cjs'),
      launchArgs: [repoRoot, '--disable-extensions', '--user-data-dir', userDataDir, '--extensions-dir', extensionsDir, '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust'],
      extensionTestsEnv: { MOLE_M26_OUT: outFile, ELECTRON_RUN_AS_NODE: undefined },
    });
    if (!existsSync(outFile)) return { ok: false, reason: 'entry script did not write a result (host likely crashed before activation)' };
    return { ok: true, result: JSON.parse(readFileSync(outFile, 'utf8')) };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

const e2e = await runE2E();

const covered = {};
for (const f of key.features) {
  const inContributes = contributesText.toLowerCase().includes(f.id.replace(/-/g, '')) || contributesText.toLowerCase().includes(f.id);
  const inModel = e2e.ok ? JSON.stringify(e2e.result.model ?? {}).toLowerCase().includes(f.id.replace(/-/g, '')) : false;
  const inDiagnostics = e2e.ok ? (e2e.result.diagnosticsCollections ?? []).some((c) => c.toLowerCase().includes('rule')) && f.id === 'rules' : false;
  covered[f.id] = Boolean(inContributes || inModel || inDiagnostics);
}
const coveredCount = Object.values(covered).filter(Boolean).length;

const refreshMs = e2e.ok ? (e2e.result.refreshMs ?? []) : [];
const p95 = percentile(refreshMs, 95);

const report = {
  e2e: e2e.ok ? 'ran' : `did not run: ${e2e.reason}`,
  M26a: { coveredCount, of: key.features.length, covered, target: key.m26a_target },
  M26b: { refreshMsSamples: refreshMs, p95, target_max_ms: key.m26b_target.max_ms },
};
console.log(JSON.stringify(report, null, 2));

const exit = coveredCount === key.features.length && p95 !== null && p95 <= key.m26b_target.max_ms ? 0 : 1;
appendRun('node apps/vscode/scripts/m26.mjs', exit, { M26a: `${coveredCount}/${key.features.length}`, M26b_p95_ms: p95 });
process.exit(exit);
