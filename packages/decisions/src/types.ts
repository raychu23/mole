// Types of the decision graph (T29).

export type Flag = 'red' | 'yellow' | 'green' | 'grey';
export type NodeKind = 'tenet' | 'decision' | 'intent' | 'incident';
export type RecordFormat = 'mole' | 'tenets' | 'nygard' | 'backstage' | 'speckit';
export type EdgeType =
  | 'traces_to'
  | 'supersedes'
  | 'overrides'
  | 'amends'
  | 'constrains'
  | 'forbids'
  | 'enables'
  | 'subsumes'
  | 'conflicts_with'
  | 'comprises'
  | 'alternative_to'
  | 'cites'
  | 'applies_to'
  | 'evidence_for';

/** Where something is written: repo-relative file + 1-based line. */
export interface Loc {
  file: string;
  line: number;
}

export interface Anchor extends Loc {
  target: string; // 'path', 'path#Symbol' or 'folder/'
}

export interface EvidenceRef extends Loc {
  test?: string; // 'path#test name'
  incident?: string;
}

export interface GraphNode extends Loc {
  id: string;
  kind: NodeKind;
  title: string;
  status: string; // normalized: accepted | proposed | superseded | deprecated | rejected | partly-superseded | unknown
  statusText?: string;
  format: RecordFormat;
  door?: string;
  approver?: string;
  confirmed?: string;
  source?: string;
  retired?: boolean;
  scope: Anchor[];
  evidence: EvidenceRef[];
  /** 1-based line of each front matter key (or Status section) in the record file */
  fields: Record<string, number>;
}

export interface GraphEdge extends Loc {
  from: string;
  to: string;
  type: EdgeType;
}

export interface Problem extends Loc {
  message: string;
}

export interface DecisionGraph {
  root: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  problems: Problem[];
}

export interface LoadOptions {
  /** plain ADR folders (Nygard / adr-tools / backstage), repo-relative or absolute */
  adrDirs?: string[];
}

export interface Reason extends Loc {
  flag: 'red' | 'yellow';
  code: string;
  text: string;
  by?: string; // the record that caused it, when another record did
}

export interface FlagResult extends Loc {
  id: string;
  kind: NodeKind;
  title: string;
  status: string;
  flag: Flag;
  reasons: Reason[];
}

export interface FlagContext {
  /** vitest JSON report file (path) or its parsed content */
  testReport?: string | unknown;
}

export interface DecisionsResult {
  root: string;
  decisions: FlagResult[];
  problems: Problem[];
}
