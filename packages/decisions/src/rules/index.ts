// Decisions as rules (T27): a decision record's front matter `rules:` compiled to dependency-cruiser `forbidden` rules
// (imports) and Mole's own TS-compiler call scan (calls). RED-COMMIT STUB: the types are the contract, the functions throw.
import type { Flag, Problem } from '../types.js';

export type RuleKind = 'import' | 'call';

/** One rule item of a record, normalized. file:line = the rule item in the record. */
export interface RuleSpec {
  name: string; // mole-<decision id>-<n>, n = 1-based index in the record's rules list
  kind: RuleKind;
  decision: string; // record id
  from: string; // repo path prefix or glob
  to: string[]; // import: module names (typescript, @scope/pkg, @scope/) or repo path prefixes (packages/x/)
  callee: string[]; // call: fetch | writeFileSync | fs.rmSync | Math.random
  except: string[];
  dynamic?: boolean; // import: false = static imports only, true = dynamic only, unset = both
  types: boolean; // import: type-only imports count too (default false: they are erased)
  why?: string;
  file: string;
  line: number;
}

export interface RuleDecision {
  id: string;
  title: string;
  status: string;
  flag?: Flag;
  why?: string;
  file: string; // the record
  line: number; // the rule item's line in the record
}

export interface Violation {
  file: string;
  line: number;
  rule: string;
  kind: RuleKind;
  target: string; // the imported module specifier or the matched callee text
  decision: RuleDecision;
}

export interface SkippedRules {
  decision: string;
  reason: string;
  file: string;
  line: number;
}

export interface RulesLoad {
  rules: RuleSpec[];
  errors: Problem[];
  skipped: SkippedRules[];
}

export interface RulesResult extends RulesLoad {
  root: string;
  violations: Violation[];
  ms: number;
}

export interface RulesOptions {
  /** tsconfig passed to dependency-cruiser (paths/baseUrl); repo-relative or absolute */
  tsConfig?: string;
}

export const DEPCRUISE_FILE = '.dependency-cruiser.mole.cjs';
export const CALL_RULES_FILE = '.mole-call-rules.json';

const todo = (): never => {
  throw new Error('T27: not implemented');
};
export function loadRules(_root: string): RulesLoad {
  return todo();
}
export function depcruiseRuleSet(_rules: RuleSpec[]): { forbidden: Array<Record<string, unknown>> } {
  return todo();
}
export function emitConfig(_root: string, _rules: RuleSpec[]): string[] {
  return todo();
}
export async function checkRules(_root: string, _opts: RulesOptions = {}): Promise<RulesResult> {
  return todo();
}
export function formatRules(_r: RulesResult): string {
  return todo();
}
export async function rulesCli(_pos: string[], _flags: Record<string, string | true>, _root: string): Promise<number> {
  return todo();
}
