// L1 (T13) recorder logic, no vscode import so it is unit-testable: which symbols you looked at (visible >= 5 s, hovered).

export const DWELL_MS = 5000;

/** A symbol's line span in the editor (0-based, inclusive, like vscode.Range lines). tail = 'Class.method' as in @mole/memory. */
export interface SymbolSpan {
  tail: string;
  startLine: number;
  endLine: number;
}

/** What the active editor shows: its repo-relative path, its symbols and its visible line ranges (0-based, inclusive). */
export interface View {
  path: string;
  symbols: SymbolSpan[];
  ranges: Array<{ start: number; end: number }>;
}

export interface SeenHit {
  path: string;
  tail: string;
  how: 'visible' | 'hover';
}

/** The subset of vscode.DocumentSymbol this module reads. */
export interface DocSymbol {
  name: string;
  kind: number; // vscode.SymbolKind
  range: { start: { line: number }; end: { line: number } };
  children?: DocSymbol[];
}

/** Top-level functions/classes/consts and class methods/constructors, named like @mole/memory's tails. */
export function documentSymbolTails(_nodes: DocSymbol[]): SymbolSpan[] {
  throw new Error('not implemented');
}

/** Per-symbol continuous-visibility timers: a symbol is seen once it stays in view for dwellMs; once per visibility period. */
export class DwellTracker {
  constructor(readonly dwellMs = DWELL_MS) {}

  /** The editor now shows `view` (undefined = nothing / window unfocused). Returns hits already due at `now`. */
  view(_now: number, _view: View | undefined): SeenHit[] {
    throw new Error('not implemented');
  }

  /** Hits whose dwell completed by `now`. */
  tick(_now: number): SeenHit[] {
    throw new Error('not implemented');
  }

  /** Earliest time a pending symbol becomes due, if any. */
  nextDue(): number | undefined {
    throw new Error('not implemented');
  }

  /** Forget completed periods for a path (after a save, so looking at the new body counts again). */
  reset(_path: string): void {
    throw new Error('not implemented');
  }
}

export interface RecorderOptions {
  enabled: () => boolean; // the mole.recordSeen setting
  write: (hits: SeenHit[]) => void;
  dwellMs?: number;
  now?: () => number;
}

/** DwellTracker + hover events + batching, gated by the setting. */
export class SeenRecorder {
  constructor(_opts: RecorderOptions) {}

  view(_view: View | undefined): void {
    throw new Error('not implemented');
  }

  hover(_path: string, _tail: string): void {
    throw new Error('not implemented');
  }

  /** Collect due dwell hits into the batch. */
  tick(): void {
    throw new Error('not implemented');
  }

  /** Hand the batch to write (nothing when disabled or empty). */
  flush(): void {
    throw new Error('not implemented');
  }
}
