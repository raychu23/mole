// T105 (I2): drives a REAL VS Code Extension Development Host against a small DEDICATED fixture repo (not
// this repo's own dogfood decisions, whose scope anchors are symbol-only on server.ts and can never prove a
// file-level lens — the gate miscalibration a review caught). Fixture has one file-scoped decision, one
// symbol-scoped decision, and one crisp rule violation (forbid: import), same idiom as
// packages/decisions/test/rules-check.test.ts's fixture shape. No @vscode/test-electron (disk-tight wave
// brief): reuses the system `code` binary with --extensionDevelopmentPath, same as scripts/m26.mjs.
//
// Screenshot: `osascript`/`screencapture` need Accessibility permission this sandbox does not grant (a prior
// run's shot was blank desktop wallpaper). Instead this launches `code` with
// --remote-debugging-port=<port> and captures the real workbench page over Chrome DevTools Protocol
// (fetch http://127.0.0.1:<port>/json for the target, then Page.captureScreenshot over its websocket) — no
// window-focus step needed at all.
//
// IMPORTANT (this sandbox only): spawning `code` and later touching network/child_process APIs in the SAME
// node process crashes with "The process has forked and you cannot use this CoreFoundation functionality
// safely" when the node process itself runs in a FOREGROUND shell call here. It does not happen when the
// whole script runs as one BACKGROUNDED process (confirmed empirically: identical code, foreground segfaults,
// background completes clean). Always invoke this script backgrounded, e.g. the terminal tool's
// `background=true`, or `nohup node apps/vscode/scripts/t105-check.mjs & wait`. Not an extension bug.
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
const PORT = Number(process.env.CDP_PORT ?? 29323);
const SHOT = process.env.OUT ?? join(taskLog, 'codelens.png');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(taskLog, { recursive: true });
const SCRATCH = join(process.env.TMPDIR ?? tmpdir(), `mole-t105-${Date.now()}`);
const ud = join(SCRATCH, 'ud');
const extDir = join(SCRATCH, 'ext');
const fixture = join(SCRATCH, 'fixture');
const cfgPath = join(SCRATCH, 't105-check.json');
const resultPath = join(SCRATCH, 'result.json');
const shotBase = join(SCRATCH, 'shot');
for (const d of [ud, extDir, join(fixture, '.mole/decisions'), join(fixture, 'src/db'), join(fixture, 'src/ui')]) mkdirSync(d, { recursive: true });

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

// ---- build the fixture repo: one file-scoped decision, one symbol-scoped decision, one crisp rule violation
writeFileSync(join(fixture, '.mole/decisions/D-file.md'), [
  '---',
  'id: D-file',
  'title: file-scoped.ts only ever holds pure constants',
  'status: accepted',
  'door: two-way',
  'scope:',
  '  - src/file-scoped.ts',
  'approver: raymond',
  'source: T105 gate fixture (review finding 1 - the real repo has only symbol-scoped decisions on server.ts)',
  '---',
  '',
  '## Decision',
  '',
  'Keep this file to plain exported constants (no side effects).',
  '',
].join('\n'));
writeFileSync(join(fixture, '.mole/decisions/D-symbol.md'), [
  '---',
  'id: D-symbol',
  'title: governedFunction must stay pure',
  'status: accepted',
  'door: two-way',
  'scope:',
  '  - src/symbol-scoped.ts#governedFunction',
  'approver: raymond',
  'source: T105 gate fixture',
  '---',
  '',
  '## Decision',
  '',
  '`governedFunction` must not read external state; `otherFunction` in the same file is NOT governed.',
  '',
].join('\n'));
writeFileSync(join(fixture, '.mole/decisions/D-rule.md'), [
  '---',
  'id: D-rule',
  'title: UI never imports the database layer',
  'status: accepted',
  'rules:',
  '  - forbid: import',
  '    from: src/ui/',
  '    to: src/db/',
  '    why: the UI goes through the API so the db can move',
  '---',
  '',
  '## Decision',
  '',
  'src/ui never imports src/db directly.',
  '',
].join('\n'));
writeFileSync(join(fixture, 'src/file-scoped.ts'), 'export const FILE_SCOPED_CONST = 1;\n');
const SYMBOL_SCOPED = 'export function governedFunction(): number {\n  return 1;\n}\n\nexport function otherFunction(): number {\n  return 2;\n}\n';
writeFileSync(join(fixture, 'src/symbol-scoped.ts'), SYMBOL_SCOPED);
writeFileSync(join(fixture, 'src/db/query.ts'), 'export const q = 1;\n');
writeFileSync(join(fixture, 'src/ui/view.ts'), "import { q } from '../db/query.js';\nexport const v = q;\n"); // the planted crisp rule violation
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: fixture });
execFileSync('git', ['-c', 'user.name=t105-check', '-c', 'user.email=t105@example.com', '-c', 'commit.gpgsign=false', 'add', '-A'], { cwd: fixture });
execFileSync('git', ['-c', 'user.name=t105-check', '-c', 'user.email=t105@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'T105 gate fixture'], { cwd: fixture });

// 0-based lines of governedFunction/otherFunction's declarations in SYMBOL_SCOPED, for the extension-host check
const GOVERNED_LINE = SYMBOL_SCOPED.split('\n').findIndex((l) => l.includes('function governedFunction'));
const OTHER_LINE = SYMBOL_SCOPED.split('\n').findIndex((l) => l.includes('function otherFunction'));

execFileSync('node', ['esbuild.mjs'], { cwd: extRoot, stdio: 'inherit' });
writeFileSync(cfgPath, JSON.stringify({
  out: resultPath,
  fileScopedFile: 'src/file-scoped.ts',
  symbolScopedFile: 'src/symbol-scoped.ts',
  governedSymbolLine: GOVERNED_LINE,
  otherSymbolLine: OTHER_LINE,
  ruleViolationFile: 'src/ui/view.ts',
  shot: shotBase,
}));
const env = { ...process.env, MOLE_T105_CHECK: cfgPath, MOLE_STATE_DIR: join(SCRATCH, 'state') };
const child = spawn(CODE, [
  '--new-window', '--user-data-dir', ud, '--extensions-dir', extDir, '--extensionDevelopmentPath', extRoot,
  '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', `--remote-debugging-port=${PORT}`, fixture,
], { env, stdio: 'ignore' });

// ---- CDP screenshot: find the workbench page target, capture it once the extension signals ready
async function cdpScreenshot(outPath) {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await r.json();
      target = list.find((t) => t.type === 'page' && /workbench/i.test(t.url ?? ''));
    } catch {
      // CDP endpoint not up yet
    }
    if (!target) await sleep(500);
  }
  if (!target) throw new Error(`no workbench page target on CDP port ${PORT}`);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const result = await new Promise((res, rej) => {
    ws.onmessage = (ev) => { const msg = JSON.parse(ev.data); if (msg.id === 1) res(msg.result); };
    ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } }));
    setTimeout(() => rej(new Error('Page.captureScreenshot timed out')), 15_000);
  });
  writeFileSync(outPath, Buffer.from(result.data, 'base64'));
  ws.close();
}

const deadline = Date.now() + 180_000; // generous: decisions-CLI cold start can be slow under shared-machine CPU contention
let shot = false;
let shotError;
while (Date.now() < deadline) {
  if (!shot && existsSync(`${shotBase}.ready`)) {
    shot = true;
    try {
      await cdpScreenshot(SHOT);
      console.log(`screenshot (CDP) -> ${SHOT}`);
    } catch (e) {
      shotError = e.message;
      console.error('CDP screenshot failed:', e.message);
    }
  }
  if (shot && existsSync(resultPath)) break;
  await sleep(500);
}
try {
  process.kill(child.pid, 'SIGTERM');
} catch {
  // already exited
}
await sleep(1500);
let result = { error: 'no result written' };
if (existsSync(resultPath)) result = JSON.parse(readFileSync(resultPath, 'utf8'));
try {
  if (!process.env.KEEP_SCRATCH) rmSync(SCRATCH, { recursive: true, force: true });
  else console.log('KEEP_SCRATCH set: left', SCRATCH);
} catch {
  // lingering handle; harmless
}

const hasFileLens = Boolean(result.hasFileLevelCodeLens);
const hasSymbolLens = Boolean(result.symbolLensOnGovernedLine) && !result.symbolLensOnOtherLine;
const fileClickOpened = Boolean(result.openedDecisionRecordFromFileLens?.uri?.includes('.mole/decisions/') && result.openedDecisionRecordFromFileLens.headSnippet?.includes('id:'));
const symbolClickOpened = Boolean(result.openedDecisionRecord?.uri?.includes('.mole/decisions/') && result.openedDecisionRecord.headSnippet?.includes('id:'));
const ruleDiags = result.ruleDiagnostics ?? [];
const diagnosticLinksToRecord = ruleDiags.some((d) => d.relatedInformation?.some((ri) => ri.uri?.includes('.mole/decisions/D-rule.md')));
const hasPaletteCommand = (result.commands ?? []).includes('mole.openDecisionRecord');

const report = {
  hasFileLevelCodeLens: hasFileLens,
  hasSymbolLevelCodeLens: hasSymbolLens,
  clickThroughOpensDecisionRecord: fileClickOpened && symbolClickOpened,
  clickThroughFileLens: fileClickOpened,
  clickThroughSymbolLens: symbolClickOpened,
  ruleDiagnostics: ruleDiags,
  diagnosticRelatedInfoLinksToRecord: diagnosticLinksToRecord,
  paletteCommandRegistered: hasPaletteCommand,
  diagnosticsCollectionNames: result.diagnosticsCollectionNames,
  fileLenses: result.fileLenses,
  symbolLenses: result.symbolLenses,
  screenshot: shot ? SHOT : null,
  screenshotMethod: 'cdp (Page.captureScreenshot)',
  screenshotError: shotError,
  error: result.error,
};
console.log(JSON.stringify(report, null, 2));
mkdirSync(taskLog, { recursive: true });
writeFileSync(join(taskLog, 't105-check-result.json'), JSON.stringify(report, null, 2));
const exit = hasFileLens && hasSymbolLens && fileClickOpened && symbolClickOpened && diagnosticLinksToRecord && hasPaletteCommand ? 0 : 1;
writeFileSync(join(taskLog, 'runs.jsonl'), `${JSON.stringify({ time: new Date().toISOString(), commit: gitSha(), cmd: 'node apps/vscode/scripts/t105-check.mjs', exit })}\n`, { flag: 'a' });
process.exit(exit);
