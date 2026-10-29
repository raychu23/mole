// T13 red tests, done-when 1: the extension records a symbol visible >= 5 s or hovered, behind the mole.recordSeen setting.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { documentSymbolTails, DwellTracker, SeenRecorder, type SeenHit, type View } from '../src/seen.js';

const here = dirname(fileURLToPath(import.meta.url));
const span = (tail: string, startLine: number, endLine: number) => ({ tail, startLine, endLine });
const SYMS = [span('alpha', 0, 2), span('beta', 4, 6), span('Box', 8, 20), span('Box.open', 9, 11), span('Box.shut', 15, 19)];
const view = (start: number, end: number): View => ({ path: 'src/a.ts', symbols: SYMS, ranges: [{ start, end }] });
const tails = (h: SeenHit[]) => h.map((x) => x.tail).sort();

describe('DwellTracker: visible >= 5 s', () => {
  it('fires once per symbol after 5 s of continuous visibility, not before, not again', () => {
    const t = new DwellTracker();
    expect(t.dwellMs).toBe(5000);
    expect(t.view(0, view(0, 6))).toEqual([]);
    expect(t.tick(4999)).toEqual([]);
    expect(t.nextDue()).toBe(5000);
    const hits = t.tick(5000);
    expect(tails(hits)).toEqual(['alpha', 'beta']);
    expect(hits.every((h) => h.how === 'visible' && h.path === 'src/a.ts')).toBe(true);
    expect(t.tick(60_000)).toEqual([]);
  });

  it('a symbol partly in view counts; scrolling it out before 5 s resets its timer', () => {
    const t = new DwellTracker();
    t.view(0, view(0, 1)); // alpha only (partly)
    t.view(3000, view(10, 12)); // alpha gone; Box + Box.open in view
    expect(t.tick(5000)).toEqual([]);
    expect(tails(t.tick(8000))).toEqual(['Box', 'Box.open']);
    t.view(8000, view(0, 1));
    expect(t.tick(12_999)).toEqual([]);
    expect(tails(t.tick(13_000))).toEqual(['alpha']);
  });

  it('no editor / window unfocused stops every timer; coming back starts a new period', () => {
    const t = new DwellTracker();
    t.view(0, view(0, 2));
    t.view(4000, undefined);
    expect(t.tick(9000)).toEqual([]);
    expect(t.nextDue()).toBeUndefined();
    t.view(9000, view(0, 2));
    expect(tails(t.tick(14_000))).toEqual(['alpha']);
  });

  it('reset(path) after a save lets the same symbol count again', () => {
    const t = new DwellTracker();
    t.view(0, view(0, 2));
    expect(tails(t.tick(5000))).toEqual(['alpha']);
    t.reset('src/a.ts');
    t.view(6000, view(0, 2));
    expect(tails(t.tick(11_000))).toEqual(['alpha']);
  });
});

describe('documentSymbolTails: VS Code document symbols -> @mole/memory tails', () => {
  it('maps classes, methods, constructors, functions, consts; skips interfaces and nested locals', () => {
    const r = (start: number, end: number) => ({ start: { line: start }, end: { line: end } });
    // vscode.SymbolKind: Class 4, Method 5, Property 6, Constructor 8, Interface 10, Function 11, Variable 12, Constant 13
    const out = documentSymbolTails([
      { name: 'Box', kind: 4, range: r(0, 10), children: [
        { name: 'constructor', kind: 8, range: r(1, 2) },
        { name: 'open', kind: 5, range: r(3, 5) },
        { name: 'size', kind: 6, range: r(6, 6) },
      ] },
      { name: 'alpha', kind: 11, range: r(12, 15), children: [{ name: 'inner', kind: 11, range: r(13, 14) }] },
      { name: 'greet', kind: 13, range: r(17, 17) },
      { name: 'Shape', kind: 10, range: r(19, 22) },
    ]);
    expect(out).toEqual([
      span('Box', 0, 10),
      span('Box.constructor', 1, 2),
      span('Box.open', 3, 5),
      span('alpha', 12, 15),
      span('greet', 17, 17),
    ]);
  });
});

describe('SeenRecorder: hover + batching behind the mole.recordSeen setting', () => {
  it('hover is recorded at once; dwell hits join the batch; flush writes them', () => {
    let now = 0;
    const writes: SeenHit[][] = [];
    const rec = new SeenRecorder({ enabled: () => true, write: (h) => writes.push(h), now: () => now });
    rec.hover('src/a.ts', 'Box.open');
    rec.view(view(0, 2));
    now = 5000;
    rec.tick();
    rec.flush();
    expect(writes).toHaveLength(1);
    expect(writes[0]!.map((h) => [h.tail, h.how])).toEqual([
      ['Box.open', 'hover'],
      ['alpha', 'visible'],
    ]);
    rec.flush();
    expect(writes).toHaveLength(1); // empty batch: nothing written
  });

  it('with the setting off nothing is written', () => {
    let now = 0;
    const writes: SeenHit[][] = [];
    const rec = new SeenRecorder({ enabled: () => false, write: (h) => writes.push(h), now: () => now });
    rec.hover('src/a.ts', 'alpha');
    rec.view(view(0, 6));
    now = 10_000;
    rec.tick();
    rec.flush();
    expect(writes).toEqual([]);
  });

  it('the setting is declared (default on) and the extension wires recorder, hover and setting', () => {
    const pkg = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8'));
    expect(pkg.contributes.configuration.properties['mole.recordSeen']).toMatchObject({ type: 'boolean', default: true });
    const ext = readFileSync(resolve(here, '../src/extension.ts'), 'utf8');
    expect(ext).toContain('SeenRecorder');
    expect(ext).toContain('recordSeen');
    expect(ext).toContain('registerHoverProvider');
    expect(ext).toContain('executeDocumentSymbolProvider');
  });
});
