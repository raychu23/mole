// T105 (I2): decisions/rules that govern the open file, surfaced the way VS Code users already expect.
// Research (fetched 2026-11-05, cited in tasks/T105-vscode-reasoning-surface/4 log/prior-art.md):
//   - GitLens "Current Line Blame" + recent-changes/authorship CodeLens sits ABOVE a symbol, always visible,
//     one click opens detail (commit) — https://help.gitkraken.com/gitlens/gitlens-features/#codelens (2026
//     docs page, "Git CodeLens").
//   - SonarLint and Error Lens put *violations* as Problems-panel diagnostics / inline decorations on the
//     offending line, not CodeLens — https://docs.sonarsource.com/sonarqube-for-ide/vs-code/ (SonarLint),
//     https://marketplace.visualstudio.com/items?itemName=usernamehw.errorlens (Error Lens): a rule break is
//     a point-in-time fact about a line, which is exactly VS Code's Diagnostic model (panelView.ts already
//     reuses it — @mole/decisions rules(), no new logic here).
//   - adr-tools / adr-viewer-style extensions and VS Code's own "N references" CodeLens use the same idiom
//     for "governance, not a defect": an annotation above the declaration that opens the record on click
//     (https://marketplace.visualstudio.com/items?itemName=rvdbreemen.adr-tools, "ADR Tools" extension, 2025).
// Conclusion: decisions GOVERN code (not a defect) -> CodeLens above the governed declaration/file, click
// opens the record (mole.openDecisionRecord), reusing the existing hover.ts "why one click away" style of a
// trusted command link. Crisp rule VIOLATIONS stay Problems-panel diagnostics (already built, panelView.ts).
import { join } from 'node:path';
import * as vscode from 'vscode';
import { documentSymbolTails, type DocSymbol, type SymbolSpan } from './seen.js';
import { decisionsForFile, type DecisionHit, type DecisionLike } from './decisions-for-file.js';
export type { DecisionLike } from './decisions-for-file.js';
import { toRepoPath } from './paths.js';

export const OPEN_DECISION_COMMAND = 'mole.openDecisionRecord';

/** `mole decisions --json`'s FlagResult shape, trimmed to what decisionsForFile needs. */
export interface DecisionsJson {
  decisions?: DecisionLike[];
}

export class DecisionsCodeLensProvider implements vscode.CodeLensProvider {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.emitter.event;
  private decisions: DecisionLike[] = [];

  constructor(private readonly root: string) {}

  /** Called after each `mole decisions` refresh (panelView.ts's per-commit cache); a no-op decision list just clears lenses. */
  setDecisions(decisions: DecisionLike[]): void {
    this.decisions = decisions;
    this.emitter.fire();
  }

  /** `mole.decisionsCodeLens.enabled` (default on, like GitLens's per-feature CodeLens toggles —
   *  https://github.com/gitkraken/vscode-gitlens docs on `gitlens.codeLens.enabled`, fetched 2026-11-05):
   *  re-check on every provide call (cheap, config is cached by VS Code) so a live setting change takes
   *  effect on the next lens recompute, which `configChanged()` below triggers immediately. */
  private enabled(): boolean {
    return vscode.workspace.getConfiguration('mole').get<boolean>('decisionsCodeLens.enabled', true);
  }

  /** Call from the extension's `onDidChangeConfiguration` handler: forces VS Code to recompute lenses now,
   *  instead of waiting for the next unrelated trigger (file switch, decisions refresh). */
  configChanged(): void {
    this.emitter.fire();
  }

  async provideCodeLenses(doc: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    if (!this.enabled()) return [];
    const file = toRepoPath(this.root, doc.uri.fsPath);
    if (!file || this.decisions.length === 0) return [];
    let symbols: SymbolSpan[] = [];
    try {
      const nodes = (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', doc.uri)) ?? [];
      symbols = documentSymbolTails(nodes as unknown as DocSymbol[]);
    } catch {
      // no symbol provider: file/folder-scoped decisions still show, at line 0
    }
    const hits = decisionsForFile(this.decisions, file, symbols, Math.max(0, doc.lineCount - 1));
    return [this.wholeFileLens(hits), ...this.symbolLenses(hits)].filter((l): l is vscode.CodeLens => l !== undefined);
  }

  private wholeFileLens(hits: DecisionHit[]): vscode.CodeLens | undefined {
    const wide = hits.filter((h) => h.matchKind !== 'symbol');
    if (wide.length === 0) return undefined;
    const range = new vscode.Range(0, 0, 0, 0);
    const title = wide.length === 1 ? `Mole: 1 decision governs this file — ${wide[0]!.decision.title}` : `Mole: ${wide.length} decisions govern this file`;
    return this.lens(range, title, wide[0]!.decision);
  }

  private symbolLenses(hits: DecisionHit[]): vscode.CodeLens[] {
    return hits
      .filter((h) => h.matchKind === 'symbol')
      .map((h) => this.lens(new vscode.Range(h.startLine, 0, h.startLine, 0), `Mole: decision ${h.decision.id} governs this — ${h.decision.title}`, h.decision));
  }

  private lens(range: vscode.Range, title: string, decision: DecisionLike): vscode.CodeLens {
    return new vscode.CodeLens(range, { title, command: OPEN_DECISION_COMMAND, arguments: [decision.id, decision.file, decision.line] });
  }
}

/** `mole.openDecisionRecord` command handler: open `.mole/decisions/<id>.md` (or the ADR-dir record) at its line. */
export async function openDecisionRecord(root: string, _id: string, file: string, line: number): Promise<void> {
  const uri = vscode.Uri.file(join(root, file));
  const pos = new vscode.Position(Math.max(0, line - 1), 0);
  await vscode.window.showTextDocument(uri, { selection: new vscode.Range(pos, pos), preview: true });
}
