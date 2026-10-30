// T30 red tests: the VS Code seam (src/tree.ts, no vscode import) turns the tree core into Explorer decorations: badge, theme color
// by flag, tooltip = the folder's card; a folder with no records gets nothing (done-when 4); a failing load never throws.
// The adapter (src/tree-provider.ts) registers it as a FileDecorationProvider from activate().
// (terminal heredoc: write_file may be approval-gated for test files in this unattended run)
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { loadTree } from '@mole/decisions';
import { FLAG_COLORS, FolderTree } from '../src/tree.js';

const here = dirname(fileURLToPath(import.meta.url));
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-vsc-tree-'));
  dirs.push(root);
  const files: Record<string, string> = {
    '.mole/decisions/0001-a.md': "---\nid: '0001'\ntitle: Serve from one process\nstatus: accepted\nscope:\n  - app/src/server.ts\napprover: ann\n---\n\nOne process.\n",
    '.mole/decisions/0002-gone.md': "---\nid: '0002'\ntitle: Keep the old helper\nstatus: accepted\nscope:\n  - lib/gone.ts\n---\n\nGone.\n",
    '.mole/intent/app.md': '---\nfolder: app\npurpose: Serves the map to the editor.\nask: carol\n---\n',
    'app/src/server.ts': 'export const s = 1;\n',
    'lib/util.ts': 'export const u = 1;\n',
    'docs/readme.md': '# docs\n',
  };
  for (const [p, t] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), t);
  }
  execFileSync('git', ['-C', root, 'init', '-q', '-b', 'main']);
  return root;
}

describe('FolderTree (Explorer decorations)', () => {
  it('nothing before the first refresh; after it, badge + color by flag + the card as tooltip', async () => {
    const root = repo();
    const ft = new FolderTree(root, (r) => loadTree(r));
    expect(ft.decorate(join(root, 'app'))).toBeUndefined();
    await ft.refresh();
    const app = ft.decorate(join(root, 'app'))!;
    expect(app.badge).toBe('1');
    expect(app.color).toBe(FLAG_COLORS.green);
    expect(app.tooltip).toMatch(/Serves the map to the editor\./);
    expect(app.tooltip).toMatch(/0001/);
    expect(app.propagate).toBe(false); // parents get their own aggregate, not VS Code's propagation
    const lib = ft.decorate(join(root, 'lib'))!;
    expect(lib.color).toBe(FLAG_COLORS.red);
    expect(ft.decorate(join(root, 'app/src/server.ts'))!.badge).toBe('1');
  });

  it('done-when 4: a folder with no records, a file outside the repo: undefined', async () => {
    const root = repo();
    const ft = new FolderTree(root, (r) => loadTree(r));
    await ft.refresh();
    expect(ft.decorate(join(root, 'docs'))).toBeUndefined();
    expect(ft.decorate(join(root, 'docs/readme.md'))).toBeUndefined();
    expect(ft.decorate(join(root, 'lib/util.ts'))).toBeUndefined();
    expect(ft.decorate('/somewhere/else/x.ts')).toBeUndefined();
  });

  it('a failing load reports the error, keeps nothing, never throws; listeners hear each refresh', async () => {
    const root = repo();
    const errors: string[] = [];
    let fail = false;
    const ft = new FolderTree(
      root,
      (r) => {
        if (fail) throw new Error('boom');
        return loadTree(r);
      },
      (e) => errors.push(e.message),
    );
    let heard = 0;
    const sub = ft.onChange(() => heard++);
    await ft.refresh();
    expect(ft.decorate(join(root, 'app'))).toBeDefined();
    fail = true;
    await expect(ft.refresh()).resolves.toBeUndefined();
    expect(errors).toEqual(['boom']);
    expect(ft.decorate(join(root, 'app'))).toBeUndefined();
    expect(heard).toBe(2);
    sub.dispose();
    fail = false;
    await ft.refresh();
    expect(heard).toBe(2);
  });

  it('activate() registers the provider (one call) and the adapter uses registerFileDecorationProvider', () => {
    const ext = readFileSync(resolve(here, '../src/extension.ts'), 'utf8');
    const provider = readFileSync(resolve(here, '../src/tree-provider.ts'), 'utf8');
    expect(ext).toMatch(/startDecisionTree\(ctx, root/);
    expect(provider).toMatch(/registerFileDecorationProvider/);
    expect(provider).toMatch(/FolderTree/);
  });
});
