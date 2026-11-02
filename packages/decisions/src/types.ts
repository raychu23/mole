// Types of the decision graph (T29).

export type Flag = 'red' | 'yellow' | 'green' | 'grey';
// 'argument' (T48): an Argdown statement or argument title, loaded by src/argdown/*.
export type NodeKind = 'tenet' | 'decision' | 'intent' | 'incident' | 'argument';
export type RecordFormat = 'mole' | 'tenets' | 'nygard' | 'backstage' | 'speckit' | 'argdown';
// T48 (core-audit capture-records-schema.md rank 1; Argdown RelationType + AIF RA/CA split):
// 'supports' | 'attacks' | 'undercuts' are argumentation relations between 'argument' nodes,
// borrowed from Argdown's model.ts RelationType (SUPPORT/ATTACK/UNDERCUT). Two readings are
// pinned deliberately, per the consolidation-semantics memo (context/product-plan/systems/
// system-design/research/consolidation-semantics/memo.md):
//   - 'undercuts' uses the general Pollock/ASPIC+ reading (an edge attacks the inference link,
//     not the narrower Carneades/CAES "argument pro an exception" reading, memo §4.2) -- Mole's
//     reasoning engine (packages/reasoning) has no structured-argument/inference-step model, so
//     at evaluation time an 'undercuts' edge is collapsed to a plain Dung 'attack' between the
//     two abstract arguments (memo §4.1: "a graph fed to a Dung reasoner must already be
//     collapsed to single attack edges" -- this is that collapse, done once, here).
//   - 'supports' is recorded in the graph (for display and for the Argdown round trip) but is
//     NOT fed into packages/reasoning's evaluate(): plain Dung AFs have no support relation at
//     all (memo §4.3; Framework only takes `attacks`), and building a bipolar semantics
//     (Cayrol/Lagasquie-Schiex's supported/mediated attack, or any of TweetyProject's bipolar
//     readings) is out of this task's scope (T48 boundary) and memo §6 step 5/8's own flagged
//     follow-up -- grounded evaluation of Mole's reasoning graphs ignores 'supports' edges.
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
  | 'evidence_for'
  | 'supports'
  | 'attacks'
  | 'undercuts';

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
