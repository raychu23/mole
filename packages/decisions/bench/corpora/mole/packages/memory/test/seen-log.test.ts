// T13 (after red): the seen log tolerates a torn line; `mole seen <file#Symbol>` records by hand.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { appendSeen, readSeen, SEEN_LOG, since } from '../src/index.js';

const cli = resolve(dirname(fileURLToPath(import.meta.url)), '../../daemon/dist/cli.js');
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-seenlog-'));
  dirs.push(root);
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/a.ts'), 'export function f(): number {\n  return 1;\n}\n');
  return root;
}

describe('seen log robustness', () => {
  it('skips a torn or foreign line and still lists the rest (no git repo needed)', () => {
    const root = repo();
    appendSeen(root, [{ path: 'src/a.ts', tail: 'f', how: 'visible' }]);
    appendFileSync(join(root, SEEN_LOG), '{"symbol": "src/a.ts#f", "ha\nnot json\n');
    expect(readSeen(root)).toHaveLength(1);
    writeFileSync(join(root, 'src/a.ts'), 'export function f(): number {\n  return 2;\n}\n');
    const s = since(root).files.flatMap((x) => x.symbols);
    expect(s.map((e) => [e.symbol, e.status])).toEqual([['src/a.ts#f', 'changed']]);
    expect(execFileSync('ls', ['-a', join(root, '.mole/local')], { encoding: 'utf8' })).toContain('.gitignore');
  });

  it('`mole seen file#Symbol --how hover` records; an unknown symbol exits 1', () => {
    const root = repo();
    const ok = spawnSync(process.execPath, [cli, 'seen', 'src/a.ts#f', '--how', 'hover', '--root', root], { encoding: 'utf8' });
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toContain('recorded 1 look');
    expect(readSeen(root)?.map((e) => [e.symbol, e.how])).toEqual([['src/a.ts#f', 'hover']]);
    const bad = spawnSync(process.execPath, [cli, 'seen', 'src/a.ts#nope', '--root', root], { encoding: 'utf8' });
    expect(bad.status).toBe(1);
  }, 60_000);
});
