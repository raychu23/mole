// `mole runs | run <id> | tried <run|file#Symbol> | agents <file[#Symbol]>` (registered in packages/daemon/src/cli.ts).
// --json prints the library result unchanged; without it a short human view. Missing sources are listed, exit 0.
import { agents, getRun, listRuns, tried } from './index.js';
import { claimsCli } from './claims/cli.js';
import { exportLangGraph } from './langgraph.js';
import { defaultSources } from './sources.js';
import type { RunGraph, Skipped, Step, TriedItem } from './types.js';

const USAGE =
  'usage: mole runs [--all] [--json] | mole run <id> [--json] [--export langgraph <file.sqlite>] | mole tried <run | file#Symbol> [--json] | mole agents <file[#Symbol]> [--json] | mole claims <run> [--at ROW] [--json]   [--root DIR]\n' +
  '  claims: each claim in the run\'s last answer (tests pass, committed <sha>, exit 0, merged, pushed, wrote <file>, fixed) checked against the run\'s own tool calls + git: supported / unsupported / contradicted\n' +
  '  --export langgraph <file.sqlite>: write the run as a LangGraph thread (one checkpoint per step) with LangGraph\'s SqliteSaver; the file quotes commands, keep it local\n' +
  '  sources: MOLE_HERMES_DB, MOLE_CLAUDE_DIR, MOLE_CODEX_DIR (default ~/.hermes/state.db, ~/.claude/projects, ~/.codex/sessions), opened read-only';

const short = (s: string, n: number): string => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};
/** local time, as the transcripts' owner reads it */
const when = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const zone = (): string => {
  const m = -new Date().getTimezoneOffset();
  return `UTC${m >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(m) / 60)).padStart(2, '0')}:${String(Math.abs(m) % 60).padStart(2, '0')}`;
};
const skippedLines = (s: Skipped[]): string[] => s.map((x) => `skipped ${x.harness} ${x.path}: ${x.reason}`);
const seg = (k: number | null): string => (k === null ? 'after last compaction' : `before compaction ${k}`);

function stepLine(s: Step): string {
  if (s.kind === 'compaction') return `──── compaction ${s.segment} at ${when(s.time)} ────`;
  const what = s.command ?? (s.files.edited.length ? s.files.edited.join(' ') : s.files.read.join(' ')) ?? '';
  const out = s.outcome && s.kind !== 'read' && s.kind !== 'other' ? ` [${s.outcome}]` : '';
  const extra = [s.commits.length ? `commit ${s.commits.join(' ')}` : '', s.child ? `→ subagent ${s.child}` : ''].filter(Boolean).join(' ');
  const flags = s.flags.map((f) => `\n      ⚠ ${f.kind}: ${f.detail}`).join('');
  return `  ${String(s.index).padStart(4)} ${when(s.time)} ${s.operation.padEnd(12)} ${(s.tool ?? '').padEnd(14)} ${short(what, 90)}${out}${extra ? `  ${extra}` : ''}${flags}`;
}

function formatRun(g: RunGraph): string {
  const r = g.run;
  const head = [
    `${r.harness} run ${r.id}${r.title ? `  "${r.title}"` : ''}  (times ${zone()})`,
    `  cwd ${r.cwd ?? '?'} · ${when(r.start)} → ${r.end ? when(r.end) : '?'} · ${r.steps} steps · ${g.compactions.length} compaction${g.compactions.length === 1 ? '' : 's'}${r.parent ? ` · parent ${r.parent}` : ''}`,
  ];
  const last = g.checkpoints.at(-1)?.values.context;
  if (last?.gitSha) head.push(`  context at the last step: ${last.repo} @ ${last.gitSha.slice(0, 7)}  AGENTS.md ${last.files['AGENTS.md']?.slice(0, 7) ?? '-'}  .mole ${last.files['.mole']?.slice(0, 7) ?? '-'}`);
  const flagged = g.steps.filter((s) => s.flags.length).length;
  if (flagged) head.push(`  ⚠ ${flagged} step${flagged === 1 ? '' : 's'} relied on context that is now stale or changed`);
  for (const c of g.children) head.push(`  subagent ${c.run.id} (${c.run.steps} steps) spawned by ${c.spawnedBy ?? '?'}${c.mergedAt ? `, result back ${when(c.mergedAt)}` : ''}`);
  return [...head, '', ...g.steps.map(stepLine), ...skippedLines(g.skipped)].join('\n');
}

function formatTried(items: TriedItem[]): string {
  if (items.length === 0) return 'mole: nothing tried';
  const out: string[] = [];
  let cur: string | undefined;
  for (const i of items) {
    const head = `${i.run} · ${seg(i.segment)}`;
    if (head !== cur) out.push(`${out.length ? '\n' : ''}${head}`);
    cur = head;
    out.push(`  ${i.outcome.padEnd(7)} ${i.kind.padEnd(7)} ${when(i.at)}  ${short(i.command, 110)}`);
  }
  return out.join('\n');
}

export async function agentCli(cmd: string, pos: string[], flags: Record<string, string | true>, root: string): Promise<number> {
  const src = defaultSources();
  const json = flags.json === true;
  const print = (v: unknown, text: () => string): void => console.log(json ? JSON.stringify(v, null, 2) : text());
  if (cmd === 'runs') {
    const r = listRuns({ ...src, root, all: flags.all === true });
    print(r, () =>
      [
        `times ${zone()}`,
        ...(r.runs.length ? r.runs.map((x) => `${x.harness.padEnd(11)} ${x.id}  ${when(x.start)}  steps ${String(x.steps).padStart(4)}  compactions ${x.compactions}${x.parent ? `  parent ${x.parent}` : ''}  ${x.cwd ?? ''}`) : [`mole: no runs${flags.all ? '' : ` in ${root} (try --all)`}`]),
        ...skippedLines(r.skipped),
      ].join('\n'),
    );
    return 0;
  }
  const target = pos[0];
  if (!target) {
    console.error(USAGE);
    return 2;
  }
  if (cmd === 'run') {
    const exp = flags.export;
    const out = pos[1];
    if (exp !== undefined && (exp !== 'langgraph' || !out)) {
      console.error(`mole run: --export takes 'langgraph <file.sqlite>'\n${USAGE}`);
      return 2;
    }
    const g = getRun(target, { ...src, root });
    if (!g) {
      console.error(`mole: no run ${target} (or the prefix is not unique)`);
      return 1;
    }
    if (exp !== undefined) {
      const r = await exportLangGraph(g, out!);
      print(r, () => [`exported ${g.run.harness} run ${r.thread_id} to ${r.file}: thread ${r.thread_id}, ${r.checkpoints} checkpoint${r.checkpoints === 1 ? '' : 's'} (LangGraph SqliteSaver)`, ...(r.note ? [`note: ${r.note}`] : []), ...skippedLines(g.skipped)].join('\n'));
      return 0;
    }
    print(g, () => formatRun(g));
    return 0;
  }
  if (cmd === 'tried') {
    const r = tried(target, { ...src, root });
    print(r, () => [formatTried(r.items), ...skippedLines(r.skipped)].join('\n'));
    return 0;
  }
  if (cmd === 'claims') return claimsCli(pos, flags);
  if (cmd === 'agents') {
    const r = agents(target, { ...src, root });
    print(r, () =>
      [
        ...(r.edits.length ? r.edits.map((e) => `${when(e.time)}  ${e.harness.padEnd(11)} ${e.run}  ${e.via === 'commit' ? `commit ${e.commit}` : e.tool ?? ''}  step ${e.step}`) : [`mole: no agent run edited ${target}`]),
        ...skippedLines(r.skipped),
      ].join('\n'),
    );
    return 0;
  }
  console.error(USAGE);
  return 2;
}
