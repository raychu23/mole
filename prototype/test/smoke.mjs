#!/usr/bin/env node
// Browser smoke test: opens the prototype, drives every setting, fails on console/page errors,
// saves screenshots. Uses an existing playwright-core (MOLE_PW=<path to playwright-core>).
// usage: node test/smoke.mjs [outDir]
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const pwPath = [process.env.MOLE_PW, 'playwright-core', '/Users/a1/.hermes/hermes-agent/node_modules/playwright-core'].filter(Boolean);
let pw; for (const p of pwPath) { try { pw = require(p); break; } catch { /* next */ } }
if (!pw) { console.error('playwright-core not found: set MOLE_PW'); process.exit(1); }

const out = path.resolve(process.argv[2] || path.join(process.env.TMPDIR || '/tmp', 'mole-shots'));
fs.mkdirSync(out, { recursive: true });
const url = pathToFileURL(path.join(here, '..', 'app', 'index.html')).href;

// prefer an installed Chrome (playwright's bundled build may not match playwright-core's version)
const chrome = [process.env.MOLE_CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && fs.existsSync(p));
const browser = await pw.chromium.launch(chrome ? { executablePath: chrome, headless: true } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };
const shot = async (n) => page.screenshot({ path: path.join(out, n + '.png') });
const S = () => page.evaluate(() => ({ step: window.__mole.S.step, file: window.__mole.S.file, level: window.__mole.S.level, tab: window.__mole.S.tab }));

await page.goto(url);
await page.waitForFunction(() => !!window.__mole);
check('boots', true);
await shot('1-how');

// stage 1: editor sidebar
await page.click('#tabs button[data-tab="vscode"]');
await page.waitForSelector('#mole .canvas svg');
const pills = await page.$$eval('#mole .canvas svg g.pill', (g) => g.length);
check('sidebar renders neighbourhood pills', pills > 3, pills);
const footer = await page.textContent('#mole .foot');
check('render time shown', /rendered in [\d.]+ ms/.test(footer), footer.slice(0, 60));
await shot('2-sidebar-file');
// click a neighbour → map follows
const before = (await S()).file;
await page.click('#mole .canvas svg g.pill[data-file]');
const after = (await S()).file;
check('clicking a node opens that file', before !== after, `${before} -> ${after}`);
// keyboard nav with debounce
await page.click('#tabs button[data-tab="vscode"]');
await page.focus('#explorer');
for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
await page.waitForTimeout(400);
const skipped = await page.evaluate(() => window.__mole.S.skipped);
check('debounce skips intermediate renders', skipped >= 3, skipped);
// map level
await page.evaluate(() => window.__mole.go({ tab: 'vscode', level: 'map' }));
check('map level shows 6 roadmap boxes', (await page.$$eval('#mole .canvas svg g[data-box]', (g) => g.length)) === 6);
await shot('3-sidebar-map');
// symbol impact
await page.evaluate(() => window.__mole.go({ tab: 'vscode', file: 'src/app/uiStore.ts', level: 'symbol', sym: 'src/app/uiStore.ts#patchUiState', impact: true }));
const imp = await page.textContent('#impact');
check('impact lists callers', /\d+ callers \(3 hops\)/.test(imp), imp.slice(0, 80));
await shot('4-sidebar-impact');
// drift file
await page.evaluate(() => window.__mole.go({ tab: 'vscode', file: 'src/components/appLayout.tsx', level: 'file' }));
const drift = await page.textContent('#drifthere');
check('drift on appLayout (R3) shown', /R3/.test(drift), drift.slice(0, 80));
await shot('5-sidebar-drift');
// edit roadmap → propagate
await page.evaluate(() => window.__mole.go({ tab: 'vscode', edit: true }));
await page.selectOption('#rb', 'foundation');
await page.fill('#rl', 'core libs');
await page.click('button[data-act="rename"]');
await page.click('.etabs button[data-etab="readme"]');
const readme = await page.textContent('#code');
check('rename propagates into README managed block', readme.includes('core libs'), '');
await shot('6-propagated-readme');
await page.click('.etabs button[data-etab="curated"]');
check('curated importer shows anchors', /inferred|ambiguous/.test(await page.textContent('#code')));
await shot('7-curated');
// explain with consent
await page.evaluate(() => window.__mole.go({ tab: 'vscode', etab: 'file', file: 'src/app/slash/registry.ts', explain: 'src/app/slash/registry.ts' }));
await page.click('button[data-act="consent"]');
check('explanation card after consent', /EXPLANATION/.test(await page.textContent('#explain')));
// full view
await page.click('button[data-act="full"]');
check('full view modal', await page.isVisible('#modal .mbox svg'));
await shot('8-fullview');
await page.keyboard.press('Escape');

// stage 2: terminal
await page.evaluate(() => window.__mole.go({ tab: 'cli', reset: true, step: 'end' }));
const term = await page.textContent('#term');
check('terminal shows SessionStart + mole_map + deny + Stop', ['SessionStart:mole', 'mole_map', 'PreToolUse:mole denied', 'Stop:mole'].every((k) => term.includes(k)));
check('new drift R1 from agent edit', term.includes('R1 src/lib/text.ts:3'));
await page.evaluate(() => window.__mole.go({ tab: 'cli', step: 11 }));
await shot('9-terminal');

// stage 2: agent panel in 4 hosts
for (const h of ['vscode', 'hermes', 'claude', 'local']) {
  await page.evaluate((host) => window.__mole.go({ tab: 'panel', step: 'end', host }), h);
  check(`panel renders in host ${h}`, await page.isVisible('.ap'));
  await shot(`10-panel-${h}`);
}
const cov = await page.textContent('#cov');
check('coverage counts untouched files', /\d+ of \d+ untouched/.test(cov), cov.slice(0, 80));
// approve proposal → R3 drift resolved
await page.click('button[data-prop="P-17"][data-v="approved"]');
const d3 = await page.evaluate(() => window.__mole.D.violations.filter((v) => v.rule === 'R3').length);
check('approving P-17 removes R3 drift everywhere', d3 === 0, d3);

// stage 3: PR
await page.click('#tabs button[data-tab="pr"]');
const pr = await page.textContent('#tab-pr');
check('PR shows new drift + resolved + checks', pr.includes('New drift (1)') && pr.includes('Resolved by roadmap change (3)') && pr.includes('CODEOWNERS'));
await shot('11-pr');

// settings: guard block changes Stop hook
await page.click('#tabs button[data-tab="settings"]');
await page.selectOption('#cfg-guard', 'block');
await page.evaluate(() => window.__mole.go({ tab: 'cli', step: 'end' }));
check('guard=block changes Stop hook', (await page.textContent('#term')).includes('"decision":"block"'));
await page.click('#tabs button[data-tab="settings"]');
await page.click('button[data-preset="senior"]');
await shot('12-settings');

check('no console/page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail !== undefined && r.detail !== '' ? '  · ' + r.detail : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} passed · screenshots: ${out}`);
process.exit(failed.length ? 1 : 0);
