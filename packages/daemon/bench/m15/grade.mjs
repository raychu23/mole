// Grades the M1.5 runs against the answer keys and joins Hermes' own per-session accounting (state.db) for tokens/cost/time.
//   node packages/daemon/bench/m15/grade.mjs   ->  generated data/m15-agent-cost.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = dirname(fileURLToPath(import.meta.url));
const S = process.env.SCRATCH ?? join(homedir(), '.hermes/cache/scratch/m15');
const TICKETS = process.env.TICKETS ?? resolve(here, '../../../../generated data/m15-tickets.json');
const OUT = process.env.OUT ?? resolve(here, '../../../../generated data/m15-agent-cost.json');
const tk = JSON.parse(readFileSync(TICKETS, 'utf8'));
const byId = new Map(tk.tickets.map((t) => [t.id, t]));
const db = new DatabaseSync(join(homedir(), '.hermes/state.db'), { readOnly: true });

const sessions = db.prepare(`SELECT id, title, model, started_at, ended_at, api_call_count, tool_call_count, message_count, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, estimated_cost_usd, actual_cost_usd, end_reason FROM sessions WHERE title LIKE 'Subagent: m15 %'`).all();
const rows = new Map(); // run id -> latest session for it
for (const s of sessions) {
  const m = /m15 ([ABC]-T\d\d-r\d+)/.exec(String(s.title));
  if (!m) continue;
  const prev = rows.get(m[1]);
  if (!prev || Number(s.started_at) > Number(prev.started_at)) rows.set(m[1], s);
}

const norm = (x) => String(x).replace(/^\.?\//, '').trim();
function parse(file) {
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}
const prf = (got, want) => {
  const g = new Set(got.map(norm));
  const k = new Set(want.map(norm));
  const tp = [...g].filter((x) => k.has(x)).length;
  const p = g.size ? tp / g.size : 0;
  const r = k.size ? tp / k.size : 0;
  return { precision: +p.toFixed(3), recall: +r.toFixed(3), f1: p + r ? +((2 * p * r) / (p + r)).toFixed(3) : 0, exact: g.size === k.size && tp === k.size, missing: [...k].filter((x) => !g.has(x)), extra: [...g].filter((x) => !k.has(x)) };
};
// Post-hoc key audit (insights, 2026-10-22): the language-service key drops JSX renders and callbacks-as-arguments, which agents correctly report as 2-level references.
const ACCEPT = { T06: ['src/components/messageLine.tsx'], T07: ['src/components/streamingAssistant.tsx'] };
// T09/T10 ('defined elsewhere' is ambiguous about same-file helpers) are excluded from the correctness subset.
const DROP = new Set(['T09', 'T10']);
function gradeLenient(t, ans) {
  if (t.key.kind !== 'set' || !ACCEPT[t.id] || !Array.isArray(ans)) return grade(t, ans).score;
  return prf(ans, [...t.key.items, ...ACCEPT[t.id]]).f1;
}
function grade(t, ans) {
  if (ans === undefined) return { answered: false, score: 0 };
  const k = t.key;
  if (k.kind === 'set') {
    if (!Array.isArray(ans)) return { answered: true, score: 0, error: 'not an array' };
    const g = prf(ans, k.items);
    return { answered: true, score: g.f1, ...g };
  }
  if (k.kind === 'file+set') {
    const g = prf(Array.isArray(ans?.callees) ? ans.callees : [], k.items);
    const fileOk = norm(ans?.file ?? '') === k.file;
    return { answered: true, score: +(fileOk ? g.f1 : g.f1 * 0.5).toFixed(3), fileOk, ...g };
  }
  if (k.kind === 'path') {
    const names = Array.isArray(ans) ? ans.map(String) : [];
    const graph = tk.callGraph;
    const edgesOk = names.slice(0, -1).filter((a, i) => (graph[a] ?? []).includes(names[i + 1])).length;
    const valid = names.length === k.length && names[0] === k.start && names[names.length - 1] === k.end && edgesOk === names.length - 1 && new Set(names).size === names.length;
    return { answered: true, score: valid ? 1 : 0, valid, edgesVerified: `${edgesOk}/${Math.max(0, names.length - 1)}` };
  }
  return { answered: true, score: 0 };
}

const runs = [];
for (const [id, s] of rows) {
  const [cond, tid, rep] = id.split('-');
  const t = byId.get(tid);
  const ansObj = parse(join(S, 'answers', `${id}.json`));
  const g = grade(t, ansObj);
  g.scoreLenient = gradeLenient(t, ansObj);
  const usedMole = (() => { try { const row = db.prepare("SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND (tool_calls LIKE '%daemon/dist/cli.js%')").get(s.id); return Number(row?.n ?? 0) > 0; } catch { return null; } })();
  runs.push({
    id, usedMole, condition: cond, ticket: tid, type: t.type, difficulty: t.difficulty, rep: Number(rep.slice(1)),
    ...g,
    wallS: s.ended_at ? +(Number(s.ended_at) - Number(s.started_at)).toFixed(1) : null,
    apiCalls: s.api_call_count, toolCalls: s.tool_call_count, messages: s.message_count,
    inputTokens: s.input_tokens, outputTokens: s.output_tokens, cacheReadTokens: s.cache_read_tokens, cacheWriteTokens: s.cache_write_tokens, reasoningTokens: s.reasoning_tokens,
    costUsd: +Number(s.actual_cost_usd ?? s.estimated_cost_usd ?? 0).toFixed(4), model: s.model, endReason: s.end_reason, sessionId: s.id,
  });
}
runs.sort((a, b) => a.ticket.localeCompare(b.ticket) || a.condition.localeCompare(b.condition) || a.rep - b.rep);

const med = (xs) => {
  const s = xs.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r2 = (x) => (x === null ? null : +x.toFixed(3));
const metrics = ['costUsd', 'apiCalls', 'toolCalls', 'wallS', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'score'];
const perCond = {};
for (const c of ['A', 'B', 'C']) {
  const rs = runs.filter((r) => r.condition === c);
  perCond[c] = { runs: rs.length, answered: rs.filter((r) => r.answered).length, totals: { costUsd: r2(rs.reduce((a, r) => a + r.costUsd, 0)) }, ...Object.fromEntries(metrics.map((m) => [m, { median: r2(med(rs.map((r) => r[m]))), mean: r2(mean(rs.map((r) => r[m]).filter((x) => typeof x === 'number'))) }])) };
}
// paired: same ticket + rep, X minus A (X = B natural use of the tool, C = told to start with the tool)
const pairsOf = (X) => {
  const out = [];
  for (const r of runs.filter((x) => x.condition === 'A')) {
    const b = runs.find((x) => x.condition === X && x.ticket === r.ticket && x.rep === r.rep);
    if (b) out.push({ ticket: r.ticket, rep: r.rep, type: r.type, ...Object.fromEntries(metrics.map((m) => [m, b[m] === null || r[m] === null ? null : r2(b[m] - r[m])])), pctCost: r.costUsd ? r2((b.costUsd - r.costUsd) / r.costUsd) : null, pctToolCalls: r.toolCalls ? r2((b.toolCalls - r.toolCalls) / r.toolCalls) : null });
  }
  return out;
};
const summarise = (pairs) => {
  const pd = (m) => pairs.map((p) => p[m]).filter((x) => x !== null);
  const wins = (m, lowerBetter) => pairs.filter((p) => p[m] !== null && (lowerBetter ? p[m] < 0 : p[m] > 0)).length;
  return {
    n: pairs.length,
    medianDiff: Object.fromEntries(metrics.map((m) => [m, r2(med(pd(m)))])),
    medianPctCost: r2(med(pairs.map((p) => p.pctCost))),
    medianPctToolCalls: r2(med(pairs.map((p) => p.pctToolCalls))),
    cheaperIn: `${wins('costUsd', true)}/${pairs.length}`,
    fewerToolCallsIn: `${wins('toolCalls', true)}/${pairs.length}`,
    fasterIn: `${wins('wallS', true)}/${pairs.length}`,
    moreCorrectIn: `${wins('score', false)}/${pairs.length}`, lessCorrectIn: `${wins('score', true)}/${pairs.length}`,
    diffRangeCostUsd: pairs.length ? [Math.min(...pd('costUsd')), Math.max(...pd('costUsd'))] : null,
  };
};
const pairsB = pairsOf('B');
const pairsC = pairsOf('C');
const paired = { B_vs_A: summarise(pairsB), C_vs_A: summarise(pairsC) };
const pairs = [...pairsB.map((p) => ({ vs: 'B', ...p })), ...pairsC.map((p) => ({ vs: 'C', ...p }))];
const toolUse = {};
for (const c of ['B', 'C']) {
  const rs = runs.filter((r) => r.condition === c);
  toolUse[c] = { runs: rs.length, usedMoleTool: rs.filter((r) => r.usedMole).length };
}

// 11-ticket subset (T09/T10 dropped), lenient scoring: the numbers quoted in the write-up
const subset = {};
for (const c of ['A', 'B', 'C']) {
  const rs = runs.filter((r) => r.condition === c && !DROP.has(r.ticket));
  subset[c] = { runs: rs.length, scoreLenientMean: r2(mean(rs.map((r) => r.scoreLenient))), strictScoreMean: r2(mean(rs.map((r) => r.score))), costUsdMedian: r2(med(rs.map((r) => r.costUsd))), wallSMedian: r2(med(rs.map((r) => r.wallS))), toolCallsMedian: med(rs.map((r) => r.toolCalls)), apiCallsMedian: med(rs.map((r) => r.apiCalls)), usedMoleTool: rs.filter((r) => r.usedMole).length };
}
const impactRows = {};
for (const c of ['A', 'B', 'C']) {
  const rs = runs.filter((r) => r.condition === c && r.type === 'impact');
  impactRows[c] = { runs: rs.length, tickets: new Set(rs.map((r) => r.ticket)).size, costUsdMedian: r2(med(rs.map((r) => r.costUsd))), toolCallsMedian: med(rs.map((r) => r.toolCalls)), wallSMedian: r2(med(rs.map((r) => r.wallS))) };
}
const totalCostUsd = r2(runs.reduce((a, r) => a + r.costUsd, 0));
const byType = {};
for (const ty of [...new Set(runs.map((r) => r.type))]) {
  const ps = pairsB.filter((p) => p.type === ty);
  byType[ty] = { pairs: ps.length, medianCostDiffUsd: r2(med(ps.map((p) => p.costUsd))), medianToolCallDiff: r2(med(ps.map((p) => p.toolCalls))), medianScoreDiff: r2(med(ps.map((p) => p.score))) };
}
const report = { subset11Tickets: subset, impactTickets: impactRows, totalCostUsdEstimated: totalCostUsd, limits: 'Hermes list-price ESTIMATES not billed; ui-tui only; one model; CLI not MCP; index prebuilt (--no-start) so Mole indexing cost excluded; no fixed turn/budget cap; system_prompt not recorded so isolation from user memory/AGENTS.md not provable; reps are 2 per cell, impact = 2 tickets x 2 reps', toolUse, generatedAt: new Date().toISOString(), what: 'M1.5 agent half: same agent (Hermes subagent, model from state.db), same question, with vs without the Mole code-map tool (CLI over the daemon; MCP schema overhead NOT measured)', fixture: tk.fixture, fixtureCommit: tk.fixtureCommit, groundTruth: tk.groundTruth, tickets: tk.tickets.length, accounting: 'Hermes state.db per-session tokens, estimated cost, api/tool call counts, start/end time; correctness = F1 against the language-service key (path ticket: every edge verified)', perCondition: perCond, paired, byType, runs, pairs };
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ runs: runs.length, subset, impactRows, totalCostUsd, toolUse }, null, 1));
