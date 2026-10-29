// T30 annotated file tree (stub for the red commit): folder -> flag, badge, tooltip + an intent card per folder.
import type { DecisionGraph, Flag, FlagContext, FlagResult, LoadOptions } from '../types.js';

export type TreeFlag = 'green' | 'yellow' | 'red';
export type EvidenceState = 'tested' | 'test missing' | 'test failing' | 'incident' | 'no test';

export interface ReadState {
  lastRead?: string;
  explainedBack?: boolean;
}

export interface IntentRecord {
  folder: string;
  file: string;
  purpose?: string;
  endState?: string;
  risk?: string;
  ask: string[];
  tenets: string[];
}

export interface CardDecision {
  id: string;
  title: string;
  status: string;
  flag: Flag;
  anchors: string[];
  evidence: EvidenceState;
  exceptions: string[];
  replacedBy: string[];
  reasons: string[];
  summary?: string;
  approver?: string;
  file: string;
  line: number;
}

export interface IntentCard {
  folder: string;
  purpose?: string;
  endState?: string;
  risk?: string;
  ask: string[];
  tenets: Array<{ id: string; title: string; flag: Flag }>;
  decisions: CardDecision[];
  proposed: CardDecision[];
  replaced: CardDecision[];
  intentFile?: string;
  read?: ReadState;
}

export interface Decoration {
  path: string;
  flag?: TreeFlag;
  badge?: string;
  count: number;
  tooltip: string;
}

export interface TreeInput {
  graph: DecisionGraph;
  flags: FlagResult[];
  intents?: IntentRecord[];
  summaries?: Record<string, string>;
  reads?: Record<string, ReadState>;
}

export interface TreeIndex {
  root: string;
  /** every folder that has a decoration or a card (repo-relative, '' = root) */
  folders: string[];
}

export type TreeOptions = LoadOptions & FlagContext & { reads?: Record<string, ReadState> };

const todo = (): never => {
  throw new Error('T30: not implemented');
};

export function buildTree(_input: TreeInput): TreeIndex {
  return todo();
}
export function decorationFor(_t: TreeIndex, _path: string): Decoration | undefined {
  return todo();
}
export function intentCard(_t: TreeIndex, _folder: string): IntentCard | undefined {
  return todo();
}
export function formatCard(_card: IntentCard): string {
  return todo();
}
export function treeText(_t: TreeIndex, _folder: string, _opts: { descendants?: boolean } = {}): string {
  return todo();
}
export function readTreeRecords(_root: string, _graph: DecisionGraph): { intents: IntentRecord[]; summaries: Record<string, string> } {
  return todo();
}
export function loadTree(_root: string, _opts: TreeOptions = {}): TreeIndex {
  return todo();
}
