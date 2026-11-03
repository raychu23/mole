// @mole/decisions: the decision graph behind the code (.mole tenets, decisions, intent, incidents + plain ADR folders)
// with citator-style flags computed by code (T29). Pure API: loadGraph(root, opts) -> computeFlags(graph, ctx).
export type * from './types.js';
export { frontMatter, loadGraph, MOLE_DIR, normStatus } from './graph.js';
export { formatSections, RATIONALE_BUDGET, sectionsOf, type DecisionSections } from './rationale.js';
export { computeFlags } from './flags.js';
export { contentHash } from './anchors.js';
export { decisions, decisionsCli, decisionCli, formatDecisions, incidentCli } from './cli.js';
export { applyRecordTransaction, CaptureError, ID_PATTERN, linkDecisions, newDecision, recoverTransactions, supersedeDecision } from './capture/records.js';
export type { CaptureResult, NewDecisionInput, TransactionEntry } from './capture/records.js';
export { suggestDuplicates } from './capture/dedupe.js';
export type { DuplicateRecord, DuplicateSuggestion } from './capture/dedupe.js';
export * from './check/index.js';
export * from './compile/index.js';
export * from './cascade/index.js';
export * from './route/index.js';
// T30: the annotated file tree (badges, colors, intent cards per folder)
export * from './tree/index.js';
export { CALL_RULES_FILE, checkRules, DEPCRUISE_FILE, depcruiseRuleSet, emitConfig, formatRules, loadRules, rulesCli } from './rules/index.js';
export type { RuleDecision, RuleKind, RuleSpec, RulesLoad, RulesOptions, RulesResult, SkippedRules, Violation } from './rules/index.js';
// T48: Argdown-sourced argument relations (supports/attacks/undercuts) + the packages/reasoning adapter
export { argumentFramework } from './argdown/framework.js';
export type { ArgumentFramework } from './argdown/framework.js';
export { parseArgdown } from './argdown/parser.js';
export type { ArgdownItem, ArgdownItemKind, ArgdownRelation, ArgdownRelationType, ParsedArgdown } from './argdown/parser.js';
export { loadArgdown } from './argdown/loader.js';
// T54: derive a Dung framework from an ADR's own MADR/Nygard sections (no hand-authored Argdown file)
export { deriveAdrArgumentFramework } from './argdown/derive-adr.js';
export type { AdrArgument, AdrArgumentFramework, AdrArgumentRole } from './argdown/derive-adr.js';
export { acceptIncident, dismissIncident, IncidentError, incidentArgumentId, suggestRevivals } from './incidents/revive.js';
export type { IncidentWrite, RevivalCandidate, RevivalEvidence } from './incidents/revive.js';
