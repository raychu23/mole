// @mole/decisions: the decision graph behind the code (.mole tenets, decisions, intent, incidents + plain ADR folders)
// with citator-style flags computed by code (T29). Pure API: loadGraph(root, opts) -> computeFlags(graph, ctx).
export type * from './types.js';
export { frontMatter, loadGraph, MOLE_DIR, normStatus } from './graph.js';
export { computeFlags } from './flags.js';
export { contentHash } from './anchors.js';
export { decisions, decisionsCli, formatDecisions } from './cli.js';
