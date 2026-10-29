// T17 guarding test for case B3 (fix 9e19c51: "editing counts as use: a person typing in one file for an hour must not lose
// the map"). The scorer copies this file into packages/daemon/test/ AFTER the agent has finished, so the agent never sees it.
// Pass = the fix holds. Fail = the planted regression (the file watcher no longer resets the idle clock) is back.
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Daemon, MoleClient } from '../src/index.js';

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

const FILES: Record<string, string> = {
  'src/util.ts': 'export function clamp(n: number) {\n  return n;\n}\n',
  'src/app.ts': "import { clamp } from './util.js';\nexport function main() {\n  return clamp(1);\n}\n",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('T17 guard: editing keeps the daemon alive (fix 9e19c51)', () => {
  it('a daemon whose sources are being edited, with no client requests, does not stop for idleness', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mole-t17-guard-'));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    for (const [p, body] of Object.entries(FILES)) {
      mkdirSync(dirname(join(root, p)), { recursive: true });
      writeFileSync(join(root, p), body);
    }
    const stateDir = join(root, '.state');
    const d = new Daemon({ root, stateDir, watch: true, idleMs: 1000 });
    await d.start();
    cleanups.push(() => d.stop());
    const c = new MoleClient({ root, stateDir });
    // one request until the index is ready, then no more requests
    const end0 = Date.now() + 20000;
    while ((await c.map('src/app.ts')).state !== 'ok' && Date.now() < end0) await sleep(100);
    let stopped = false;
    void d.closed.then(() => (stopped = true));
    // "typing": an edit every 50 ms for 3.5 s (> 3 x idleMs); the 200 ms update debounce never fires while typing
    const end = Date.now() + 3500;
    for (let i = 0; Date.now() < end; i++) {
      appendFileSync(join(root, 'src/util.ts'), `// edit ${i}\n`);
      await sleep(50);
    }
    expect(stopped, 'the daemon stopped for idleness while its sources were being edited').toBe(false);
  }, 60000);
});
