// @mole/agentstate (T18): agent runs that already exist on this Mac (Hermes state.db, Claude Code + Codex JSONL
// transcripts) read into one state graph per run. Checkpoints use LangGraph's checkpoint shape
// (thread_id, checkpoint_id, parent_checkpoint_id, values); steps use OpenTelemetry GenAI operation names.
// Sources are opened read-only; nothing here writes outside .mole/local/.

export type Harness = 'hermes' | 'claude-code' | 'codex';
/** OpenTelemetry GenAI operation names (gen_ai.operation.name) + 'compaction' for a context compaction point. */
export type Operation = 'invoke_agent' | 'execute_tool' | 'plan' | 'compaction';
export type Outcome = 'pass' | 'fail' | 'unknown';
export type StepKind = 'command' | 'test' | 'edit' | 'read' | 'subagent' | 'compaction' | 'other';

/** Where the local transcripts live. Defaults: ~/.hermes/state.db, ~/.claude/projects, ~/.codex/sessions
 * (env MOLE_HERMES_DB, MOLE_CLAUDE_DIR, MOLE_CODEX_DIR override). */
export interface Sources {
  hermesDb?: string;
  claudeDir?: string;
  codexDir?: string;
}

export interface RunsOptions extends Sources {
  /** repo root: runs are limited to those whose cwd (or edited files) are inside it or its git worktrees, unless all */
  root?: string;
  all?: boolean;
}

/** A source that could not be read: listed, never fatal. */
export interface Skipped {
  harness: Harness;
  path: string;
  reason: string;
}

/** Where a step came from, so anyone can re-read the raw record. hermes: messages.id; JSONL: 1-based line number. */
export interface SourceRef {
  harness: Harness;
  file: string;
  row: number;
  /** the row/line holding the tool result, when there is one */
  resultRow?: number;
}

export interface RunSummary {
  id: string;
  harness: Harness;
  cwd: string | null;
  start: string; // ISO
  end: string | null;
  steps: number;
  compactions: number;
  parent: string | null; // parent run id (subagent fan-out)
  title: string | null;
}

export interface StepFlag {
  kind: 'stale-note' | 'context-changed';
  file: string;
  detail: string;
}

export interface Step {
  id: string; // stable: '<run>:<tool call id or row>'
  run: string;
  index: number;
  time: string; // ISO
  operation: Operation;
  kind: StepKind;
  tool: string | null;
  command: string | null; // shell command / code text for command + test steps
  outcome: Outcome | null;
  files: { read: string[]; edited: string[] }; // absolute paths as the agent named them
  commits: string[]; // short shas this step created (git commit / merge / ledger output)
  child: string | null; // subagent run id this step spawned
  /** 1-based index of the compaction that came after this step (it was compacted away by it); null = after the last one */
  segment: number | null;
  ref: SourceRef;
  flags: StepFlag[];
}

/** The context an agent had at a checkpoint: repo HEAD at that time + git object ids of the guidance files. */
export interface ContextVersion {
  repo: string | null;
  gitSha: string | null;
  /** 'AGENTS.md' | 'CLAUDE.md' | '.mole' -> git blob/tree id at gitSha, null when absent */
  files: Record<string, string | null>;
  read: string[]; // files read so far in the run
}

export interface TriedItem {
  command: string;
  kind: 'command' | 'test' | 'edit';
  outcome: Outcome;
  at: string; // ISO
  segment: number | null;
  run: string;
  step: string;
}

/** LangGraph checkpoint shape (thread_id = run, one checkpoint per step, chained by parent_checkpoint_id). */
export interface Checkpoint {
  thread_id: string;
  checkpoint_ns: string;
  checkpoint_id: string;
  parent_checkpoint_id: string | null;
  ts: string;
  metadata: { source: Harness; step: number; operation: Operation; kind: StepKind };
  values: {
    context: ContextVersion;
    tried: TriedItem[]; // cumulative: everything tried up to and including this step
    changed: { files: string[]; commits: string[] };
  };
}

export interface RunGraph {
  run: RunSummary;
  steps: Step[];
  /** subagent fan-out: child runs spawned by a step, and the step that received their result (merge) */
  children: Array<{ run: RunSummary; spawnedBy: string | null; mergedAt: string | null }>;
  compactions: Array<{ index: number; time: string; step: string }>;
  checkpoints: Checkpoint[];
  skipped: Skipped[];
}

export interface TriedResult {
  target: string;
  runs: string[];
  items: TriedItem[];
  skipped: Skipped[];
}

export interface AgentEdit {
  run: string;
  harness: Harness;
  step: string;
  time: string;
  tool: string | null;
  via: 'edit' | 'commit';
  commit: string | null;
}

export interface AgentsResult {
  target: string;
  edits: AgentEdit[]; // newest first
  skipped: Skipped[];
}

/** One file edit of one commit, linked to the run step that made it (edit tool call) or committed it. */
export interface Attribution {
  commit: string;
  path: string;
  link: { kind: 'edit' | 'commit'; run: string; step: string; ref: SourceRef } | null;
}

const NOT_YET = (what: string): never => {
  throw new Error(`@mole/agentstate: ${what} not implemented (T18)`);
};

export function defaultSources(env: NodeJS.ProcessEnv = process.env): Required<Sources> {
  void env;
  return NOT_YET('defaultSources');
}

/** `mole runs`: every run in the 3 local sources (limited to root unless all), newest first. */
export function listRuns(opts: RunsOptions = {}): { runs: RunSummary[]; skipped: Skipped[] } {
  void opts;
  return NOT_YET('listRuns');
}

/** `mole run <id>`: the state graph of one run (id or unique prefix). null when no source has it. */
export function getRun(id: string, opts: RunsOptions = {}): RunGraph | null {
  void id;
  void opts;
  return NOT_YET('getRun');
}

/** `mole tried <run | file#Symbol>`: commands/tests/fixes already tried, with outcome and the compaction they preceded. */
export function tried(target: string, opts: RunsOptions = {}): TriedResult {
  void target;
  void opts;
  return NOT_YET('tried');
}

/** `mole agents <file[#Symbol]>`: runs + steps that edited it, newest first. */
export function agents(target: string, opts: RunsOptions & { root: string }): AgentsResult {
  void target;
  void opts;
  return NOT_YET('agents');
}

/** M6: every file edit of every non-merge commit in range, linked to a run step (or null). */
export function attribute(root: string, range: string, opts: Sources = {}): Attribution[] {
  void root;
  void range;
  void opts;
  return NOT_YET('attribute');
}

/** CLI entry used by `mole runs|run|tried|agents` (packages/daemon/src/cli.ts). Returns the exit code. */
export async function agentCli(cmd: string, pos: string[], flags: Record<string, string | true>, root: string): Promise<number> {
  void cmd;
  void pos;
  void flags;
  void root;
  return NOT_YET('agentCli');
}
