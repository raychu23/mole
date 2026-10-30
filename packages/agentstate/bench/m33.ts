// T39 bench M33 (checks: `npm run check && node packages/agentstate/dist/bench/m33.js`).
// Builds 3 fixture repos (one per format: Entire Checkpoints, git-ai Authorship Logs, Agent Trace v0.1.0),
// each hand-built straight from the documented wire format (see 4 log/prior-art.md for URLs), parses them with
// src/importers/*, anchors onto functions (src/importers/unify.ts), and scores against bench/m33-key.json
// (frozen before this file's implementation; written by a different method -- symbolsOfText, not unify.ts).
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentTraceToRawIntents, anchorIntents, entireToRawIntents, gitAiToRawIntents, parseAgentTrace, parseEntireCheckpoint, parseGitAiNote, recheckIntents, type RawIntent, type SessionIntent } from '../src/importers/index.js';

interface KeyFn {
  tail: string;
  start: number;
  end: number;
}
interface KeyRepo {
  dir: string;
  file: string;
  functions: KeyFn[];
  staleEdits: string[];
  whitespaceEdits: string[];
}
interface Key {
  repos: { entire: KeyRepo; 'git-ai': KeyRepo; 'agent-trace': KeyRepo };
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const keyPath = resolve(here, '../../bench/m33-key.json');
const key = JSON.parse(readFileSync(keyPath, 'utf8')) as Key;

const args = process.argv.slice(2);
const appendTo = (() => {
  const i = args.indexOf('--append-run');
  return i >= 0 ? args[i + 1] : undefined;
})();

function buildEntireRaw(repo: KeyRepo): RawIntent[] {
  const sessions = repo.functions.map((f, i) => ({
    sessionId: `entire-s${i}`,
    agentType: 'claude-code',
    model: 'claude-sonnet-5',
    prompt: `implement ${f.tail}`,
    fileRanges: [{ file: repo.file, startLine: f.start, endLine: f.end }],
  }));
  const meta = { checkpointId: 'ckpt-t39-fixture', commitSha: 'deadbeef', filesTouched: [repo.file], sessions };
  const text = JSON.stringify(meta); // entire/checkpoints/v1 metadata.json shape
  return entireToRawIntents(parseEntireCheckpoint(text));
}

function buildGitAiRaw(repo: KeyRepo): RawIntent[] {
  const tableLines = repo.functions.map((f, i) => `${repo.file}   gitai-s${i} ${f.start}-${f.end}`);
  const prompts: Record<string, unknown> = {};
  repo.functions.forEach((f, i) => {
    prompts[`gitai-s${i}`] = { agent: 'claude-code', model: 'claude-sonnet-5', author: 'raymond', messages_url: `https://store.local/cas/${f.tail}` };
  });
  const meta = { schema_version: 'authorship/3.0.0', git_ai_version: '0.1.4', base_commit_sha: 'deadbeef', prompts };
  const note = `${tableLines.join('\n')}\n---\n${JSON.stringify(meta)}`;
  return gitAiToRawIntents(parseGitAiNote(note));
}

function buildAgentTraceRaw(repo: KeyRepo): RawIntent[] {
  const conversations = repo.functions.map((f, i) => ({
    url: `https://api.example.com/v1/conversations/${f.tail}`,
    contributor: { type: 'ai' as const, model_id: 'anthropic/claude-sonnet-5' },
    ranges: [{ start_line: f.start, end_line: f.end }],
  }));
  const rec = {
    version: '0.1.0',
    id: `trace-${repo.file}`,
    timestamp: '2026-10-30T00:00:00Z',
    vcs: { type: 'git', revision: 'deadbeef' },
    tool: { name: 'claude-code', version: '2.0.0' },
    files: [{ path: repo.file, conversations }],
  };
  return agentTraceToRawIntents(parseAgentTrace(JSON.stringify(rec)));
}

function writeFixtureSource(repo: KeyRepo, abs: string): void {
  mkdirSync(abs, { recursive: true });
  let text = '';
  for (const f of repo.functions) {
    const idx = Number(f.tail.slice(1));
    text += `export function ${f.tail}(x: number): number {\n  return x + ${idx};\n}\n\n`;
  }
  writeFileSync(join(abs, repo.file), text);
}

function applyEdit(abs: string, file: string, tail: string, kind: 'stale' | 'whitespace'): void {
  const path = join(abs, file);
  let text = readFileSync(path, 'utf8');
  const idx = Number(tail.slice(1));
  if (kind === 'stale') {
    text = text.replace(`export function ${tail}(x: number): number {\n  return x + ${idx};\n}`, `export function ${tail}(x: number): number {\n  return x + ${idx} * 100;\n}`);
  } else {
    text = text.replace(`export function ${tail}(x: number): number {`, `// whitespace/comment-only edit, body unchanged\nexport function ${tail}(x: number): number {`);
  }
  writeFileSync(path, text);
}

function runRepo(formatKey: 'entire' | 'git-ai' | 'agent-trace', builder: (repo: KeyRepo) => RawIntent[]) {
  const repo = key.repos[formatKey];
  const abs = mkdtempSync(join(tmpdir(), `mole-t39-${formatKey}-`));
  writeFixtureSource(repo, abs);
  const raw = builder(repo);
  const { intents, misses } = anchorIntents(abs, raw);

  let correct = 0;
  const wrong: string[] = [];
  for (const f of repo.functions) {
    const found = intents.find((it) => it.sessionId === `${formatKey}-s${repo.functions.indexOf(f)}`);
    if (found && found.tail === f.tail) correct++;
    else if (found) wrong.push(`${f.tail} anchored to ${found.tail}`);
  }
  const expectedTotal = repo.functions.length;

  // plant stale + whitespace edits, then re-check
  for (const tail of repo.staleEdits) applyEdit(abs, repo.file, tail, 'stale');
  for (const tail of repo.whitespaceEdits) applyEdit(abs, repo.file, tail, 'whitespace');
  const statuses = recheckIntents(abs, intents);
  const staleCaught = repo.staleEdits.filter((tail) => statuses.find((s) => s.intent.tail === tail)?.status === 'stale').length;
  const falseFlags = repo.whitespaceEdits.filter((tail) => statuses.find((s) => s.intent.tail === tail)?.status === 'stale').length;

  rmSync(abs, { recursive: true, force: true });
  return { correct, expectedTotal, wrong, misses: misses.length, staleCaught, staleTotal: repo.staleEdits.length, falseFlags, falseTotal: repo.whitespaceEdits.length };
}

const results = {
  entire: runRepo('entire', buildEntireRaw),
  'git-ai': runRepo('git-ai', buildGitAiRaw),
  'agent-trace': runRepo('agent-trace', buildAgentTraceRaw),
};

const totalCorrect = results.entire.correct + results['git-ai'].correct + results['agent-trace'].correct;
const totalExpected = results.entire.expectedTotal + results['git-ai'].expectedTotal + results['agent-trace'].expectedTotal;
const totalWrong = results.entire.wrong.length + results['git-ai'].wrong.length + results['agent-trace'].wrong.length;
const totalMisses = results.entire.misses + results['git-ai'].misses + results['agent-trace'].misses;
const totalStaleCaught = results.entire.staleCaught + results['git-ai'].staleCaught + results['agent-trace'].staleCaught;
const totalStale = results.entire.staleTotal + results['git-ai'].staleTotal + results['agent-trace'].staleTotal;
const totalFalse = results.entire.falseFlags + results['git-ai'].falseFlags + results['agent-trace'].falseFlags;
const totalFalseTotal = results.entire.falseTotal + results['git-ai'].falseTotal + results['agent-trace'].falseTotal;

const recall = totalCorrect / totalExpected;
const staleRecall = totalStaleCaught / totalStale;
// 0 model calls: grep the importer sources for any client that would be a model call
let modelCalls = 0;
try {
  const grep = execFileSync('grep', ['-rliE', 'openai|anthropic|fetch\\(|axios|http\\.request', resolve(here, '../src/importers')], { encoding: 'utf8' });
  if (grep.trim()) modelCalls = grep.trim().split('\n').length;
} catch {
  modelCalls = 0; // grep exits 1 when no match, which is the pass case
}

const met = recall >= 0.95 && totalWrong === 0 && staleRecall === 1 && totalFalse === 0 && modelCalls === 0;
const summary = `M33: link recall ${(recall * 100).toFixed(1)}% (${totalCorrect}/${totalExpected}) wrong ${totalWrong}, misses ${totalMisses} · stale-flag recall ${(staleRecall * 100).toFixed(1)}% (${totalStaleCaught}/${totalStale}) false-on-whitespace ${totalFalse}/${totalFalseTotal} · model calls ${modelCalls} · target recall>=95% wrong=0, stale recall 100% false=0, model calls 0 ${met ? 'MET' : 'NOT MET'}`;
console.log(summary);
console.log(JSON.stringify({ entire: results.entire, 'git-ai': results['git-ai'], 'agent-trace': results['agent-trace'] }, null, 2));

if (appendTo) {
  appendFileSync(appendTo, JSON.stringify({ time: new Date().toISOString(), metrics: { M33: summary } }) + '\n');
}

process.exit(met ? 0 : 1);
