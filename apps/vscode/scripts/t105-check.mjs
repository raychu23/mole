// T105 (I2): drives a REAL VS Code Extension Development Host (same idiom as scripts/m26.mjs /
// scripts/panel-screenshot.mjs: `code --extensionDevelopmentPath` + one env var the extension answers via a
// JSON file, no @vscode/test-electron, no second Electron download — disk is tight, see G-wave brief).
// Opens packages/daemon/src/server.ts, which this repo's own live `.mole/decisions/0007-idle-shutdown.md` and
// `0008-indexing-never-idle.md` scope-anchor to `Daemon.startIdleWatch` / `Daemon.onWorker` (dogfooding, no
// fixture needed), reads the real CodeLenses, clicks through the whole-file one, and screenshots the window.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const extRoot = resolve(here, '..');
const repoRoot = resolve(extRoot, '../..');
const taskLog = join(repoRoot, 'tasks/T105-vscode-reasoning-surface/4 log');
const CODE = process.env.CODE_BIN ?? 'code';
const FILE = process.env.T105_FILE ?? 'packages/daemon/src/server.ts';
const SHOT = process.env.OUT ?? join(taskLog, 'codelens.png');

mkdirSync(taskLog, { recursive: true });
const SCRATCH = join(process.env.TMPDIR ?? tmpdir(), `mole-t105-${Date.now()}`);
mkdirSync(SCRATCH, { recursive: true });
const ud = join(SCRATCH, 'ud');
const extDir = join(SCRATCH, 'ext');
const cfgPath = join(SCRATCH, 't105-check.json');
const resultPath = join(SCRATCH, 'result.json');
const shotBase = join(SCRATCH, 'shot');

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

execFileSync('node', ['esbuild.mjs'], { cwd: extRoot, stdio: 'inherit' });
writeFileSync(cfgPath, JSON.stringify({ out: resultPath, file: FILE, shot: shotBase }));
const env = { ...process.env, MOLE_T105_CHECK: cfgPath, MOLE_STATE_DIR: join(SCRATCH, 'state') };
const child = spawn(CODE, ['--new-window', '--user-data-dir', ud, '--extensions-dir', extDir, '--extensionDevelopmentPath', extRoot, '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', repoRoot], { env, stdio: 'ignore' });

const deadline = Date.now() + 120_000;
let shot = false;
while (Date.now() < deadline) {
  if (!shot && existsSync(`${shotBase}.ready`)) {
    shot = true;
    try {
      execFileSync('screencapture', ['-x', SHOT]);
      console.log(`screenshot -> ${SHOT}`);
    } catch (e) {
      console.error('screencapture failed:', e.message);
    }
  }
  if (shot && existsSync(resultPath)) break;
  await new Promise((r) => setTimeout(r, 500));
}
try {
  process.kill(child.pid, 'SIGTERM');
} catch {
  // already exited
}
await new Promise((r) => setTimeout(r, 1500));
let result = { error: 'no result written' };
if (existsSync(resultPath)) result = JSON.parse(readFileSync(resultPath, 'utf8'));
try {
  rmSync(SCRATCH, { recursive: true, force: true });
} catch {
  // lingering handle; harmless
}

const lenses = result.lenses ?? [];
const hasFileLens = lenses.some((l) => l.line === 0 && /decision.*governs this file/i.test(l.title ?? ''));
const hasSymbolLens = lenses.some((l) => l.line > 0 && /decision .* governs this/i.test(l.title ?? ''));
const openedRecord = result.openedDecisionRecord;
const opensRecord = Boolean(openedRecord?.uri?.includes('.mole/decisions/') && openedRecord.firstLine?.includes('id:'));
const hasPaletteCommand = (result.commands ?? []).includes('mole.openDecisionRecord');
const report = {
  file: FILE,
  lenses,
  hasFileLevelCodeLens: hasFileLens,
  hasSymbolLevelCodeLens: hasSymbolLens,
  clickThroughOpensDecisionRecord: opensRecord,
  openedDecisionRecord: openedRecord,
  paletteCommandRegistered: hasPaletteCommand,
  diagnosticsCollectionNames: result.diagnosticsCollectionNames,
  diagnosticsCountSource_mole: result.diagnosticsCount,
  screenshot: shot ? SHOT : null,
  error: result.error,
};
console.log(JSON.stringify(report, null, 2));
mkdirSync(taskLog, { recursive: true });
writeFileSync(join(taskLog, 't105-check-result.json'), JSON.stringify(report, null, 2));
const exit = hasFileLens && hasSymbolLens && opensRecord && hasPaletteCommand ? 0 : 1;
writeFileSync(join(taskLog, 'runs.jsonl'), `${JSON.stringify({ time: new Date().toISOString(), commit: gitSha(), cmd: 'node apps/vscode/scripts/t105-check.mjs', exit })}\n`, { flag: 'a' });
process.exit(exit);
