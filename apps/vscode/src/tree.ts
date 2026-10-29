// T30 (stub for the red commit): the Explorer's decision badges, colors and folder cards over @mole/decisions' tree core.
// No vscode import, so it is unit-testable; src/tree-provider.ts adapts it to vscode.FileDecorationProvider.
import type { TreeIndex } from '@mole/decisions';

export const FLAG_COLORS = { green: 'charts.green', yellow: 'charts.yellow', red: 'charts.red' } as const;

export interface DecorationOut {
  badge?: string;
  tooltip?: string;
  color?: (typeof FLAG_COLORS)[keyof typeof FLAG_COLORS];
  propagate: boolean;
}

export class FolderTree {
  constructor(
    readonly root: string,
    private readonly load: (root: string) => TreeIndex | Promise<TreeIndex>,
    private readonly onError: (e: Error) => void = () => {},
  ) {}
  onChange(_listener: () => void): { dispose(): void } {
    throw new Error('T30: not implemented');
  }
  async refresh(): Promise<void> {
    throw new Error('T30: not implemented');
  }
  decorate(_fsPath: string): DecorationOut | undefined {
    throw new Error('T30: not implemented');
  }
}
