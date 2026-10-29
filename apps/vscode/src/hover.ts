// T15: hover + gutter mark on the lines a working-tree change touched. No vscode import, so it is unit-testable.
import type { CheckResult, Hunk } from '@mole/history';
import type { Question } from '@mole/questions';

/** What `mole check --worktree --json` prints: T12's CheckResult + T14's questions. */
export type CheckJson = Omit<CheckResult, 'ms'> & { ms?: number; questions: Question[] };

/** A T11 note (from `mole memory --json`) placed on the current file: startLine/endLine are 1-based, inclusive. */
export interface HoverNote {
  file: string;
  symbol: string;
  path: string;
  status: string;
  changed?: boolean;
  text: string;
  startLine: number;
  endLine?: number;
}

/** A hunk's NEW-side lines (1-based, inclusive) that get a gutter mark and a hover. */
export interface TouchedRange {
  file: string;
  startLine: number;
  endLine: number;
  hunk: Hunk;
}

/** The only commands a Mole hover may link to (MarkdownString.isTrusted.enabledCommands). */
export const HOVER_COMMANDS = ['mole.showCommit', 'mole.openAt'] as const;

export function touchedRanges(_check: CheckJson | undefined, _notes: HoverNote[], _file: string): TouchedRange[] {
  throw new Error('not implemented');
}

export function buildHover(_check: CheckJson | undefined, _notes: HoverNote[], _file: string, _line: number): string | undefined {
  throw new Error('not implemented');
}

export interface TouchedDeps {
  /** is the repo's Mole daemon answering? (ping on its socket) */
  daemonUp(): Promise<boolean>;
  check(): Promise<CheckJson>;
  notes(file: string): Promise<HoverNote[]>;
  log?(m: string): void;
}

/** Cache of the working-tree check; everything is empty while the daemon is down (done-when 6). Never throws. */
export class Touched {
  constructor(private readonly deps: TouchedDeps) {}
  async refresh(): Promise<boolean> {
    void this.deps;
    throw new Error('not implemented');
  }
  ranges(_file: string): TouchedRange[] {
    throw new Error('not implemented');
  }
  async hover(_file: string, _line: number): Promise<string | undefined> {
    throw new Error('not implemented');
  }
}
