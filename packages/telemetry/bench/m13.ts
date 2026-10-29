// M13 bench (T16): observability coverage of the build loop.
//   1) OTel: `mole check <key commit>` on this repo with MOLE_OTEL=1 exports every expected stage span (parent + attributes)
//      to a local OTLP/HTTP receiver before the CLI exits; an MCP tools/call exports an `execute_tool mole_map` span with the
//      GenAI attributes and the daemon a `mole.daemon.rpc` span; with MOLE_OTEL unset the CLI sends 0 requests.
//   2) MLflow: scripts/mlflow/load_runs.py loads every tasks/*/4 log/runs.jsonl line as one run into a temp file store;
//      a second load adds 0; the metric parser matches the key's hand-written cases.
//   3) CI: .github/workflows/check.yml has the required steps; its "key guard" step's command is green on a temp worktree of
//      HEAD, red after a protected key is edited and committed, green with an approved hashed ruling, red with a wrong hash.
// usage: node packages/telemetry/dist/bench/m13.js [--metrics-out FILE] [--details FILE]
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { parse as parseYaml } from 'yaml';
import { startReceiver, type ReceivedSpan } from './otlp-receiver.js';

const here = dirname(fileURLToPath(import.meta.url));
const keyPath = resolve(here, '../../bench/m13-key.json');
const repoRoot = resolve(here, '../../../..');
const cli = join(repoRoot, 'packages/daemon/dist/cli.js');
const mcpCli = join(repoRoot, 'packages/mcp/dist/cli.js');

interface SpanSpec {
  name: string;
  parent: string | null;
  attributes: string[];
  values?: Record<string, unknown>;
  min?: Record<string, number>;
}
interface Key {
  written: string;
  otel: {
    check: { commit: string; service: string; spans: SpanSpec[] };
    mcp: { tool: string; service: string; span: SpanSpec };
    daemon: { service: string; span: SpanSpec };
    off: { requests: number; spans: number };
  };
  mlflow: { experiment: string; params: string[]; metric_prefixes: string[]; second_run_adds: number; parse_cases: Array<{ metric: string; raw: unknown; expect: Record<string, number> }> };
  ci: {
    workflow: string;
    events: string[];
    node: string;
    required_runs: string[];
    guard_step: string;
    protected_keys: string[];
    edit_for_red: string;
    expect: { green_exit: number; red_exit_nonzero: boolean; ruled_exit: number; wrong_hash_ruling_exit_nonzero: boolean };
  };
}

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const key = JSON.parse(readFileSync(keyPath, 'utf8')) as Key;
const scratch = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'mole-m13-'));
const errors: string[] = [];
const details: Record<string, unknown> = { key: keyPath, written: key.written, repoRoot };

/** does a received span satisfy the spec (service, parent by name in the same trace, attributes, values, minimums)? */
function matches(spec: SpanSpec, service: string, spans: ReceivedSpan[]): { ok: boolean; why: string } {
  const named = spans.filter((s) => s.name === spec.name);
  if (!named.length) return { ok: false, why: 'not exported' };
  let why = '';
  for (const s of named) {
    if (s.service !== service) {
      why = `service ${s.service}`;
      continue;
    }
    if (spec.parent === null) {
      if (s.parentSpanId) {
        why = 'has a parent';
        continue;
      }
    } else {
      const p = spans.find((x) => x.spanId === s.parentSpanId && x.traceId === s.traceId);
      if (!p || p.name !== spec.parent) {
        why = `parent ${p?.name ?? 'missing'}`;
        continue;
      }
    }
    const missing = spec.attributes.filter((a) => s.attributes[a] === undefined);
    if (missing.length) {
      why = `missing ${missing.join(', ')}`;
      continue;
    }
    const wrong = Object.entries(spec.values ?? {}).filter(([k, v]) => s.attributes[k] !== v);
    if (wrong.length) {
      why = `values ${wrong.map(([k]) => `${k}=${String(s.attributes[k])}`).join(', ')}`;
      continue;
    }
    const low = Object.entries(spec.min ?? {}).filter(([k, v]) => !(Number(s.attributes[k]) >= v));
    if (low.length) {
      why = `below min ${low.map(([k]) => `${k}=${String(s.attributes[k])}`).join(', ')}`;
      continue;
    }
    return { ok: true, why: '' };
  }
  return { ok: false, why };
}

const run = (cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string } = {}) =>
  spawnSync(cmd, args, { cwd: opts.cwd ?? repoRoot, env: opts.env ?? process.env, input: opts.input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 240_000 });
const runAsync = (cmd: string, args: string[], opts: { env?: NodeJS.ProcessEnv } = {}) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>((res) => {
    const c = spawn(cmd, args, { cwd: repoRoot, env: opts.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 240_000 });
    let stdout = '', stderr = '';
    c.stdout.setEncoding('utf8');
    c.stderr.setEncoding('utf8');
    c.stdout.on('data', (d: string) => (stdout += d));
    c.stderr.on('data', (d: string) => (stderr += d));
    c.on('close', (status) => res({ status, stdout, stderr }));
  });

// ---------- 1) OTel ----------
const stageResults: Array<{ span: string; ok: boolean; why: string }> = [];
let offRequests = -1;
let offSpans = -1;
const receiver = await startReceiver();
try {
  const onEnv = { ...process.env, MOLE_OTEL: '1', OTEL_EXPORTER_OTLP_ENDPOINT: receiver.url };
  const c = await runAsync(process.execPath, ['--no-warnings', cli, 'check', key.otel.check.commit, '--root', repoRoot, '--json'], { env: onEnv });
  details.checkExit = c.status;
  if (c.status !== 0) errors.push(`mole check exit ${c.status}: ${(c.stderr ?? '').slice(0, 300)}`);
  // no waiting: spans must already be flushed when the CLI has exited
  const checkSpans = [...receiver.spans];
  details.checkSpans = checkSpans.map((s) => ({ name: s.name, service: s.service, attributes: s.attributes }));
  for (const spec of key.otel.check.spans) stageResults.push({ span: spec.name, ...matches(spec, key.otel.check.service, checkSpans) });

  receiver.reset();
  const offEnv: NodeJS.ProcessEnv = { ...process.env, OTEL_EXPORTER_OTLP_ENDPOINT: receiver.url };
  delete offEnv.MOLE_OTEL;
  const off = await runAsync(process.execPath, ['--no-warnings', cli, 'check', key.otel.check.commit, '--root', repoRoot, '--json'], { env: offEnv });
  if (off.status !== 0) errors.push(`mole check (MOLE_OTEL unset) exit ${off.status}`);
  await new Promise((r) => setTimeout(r, 500));
  offRequests = receiver.requests;
  offSpans = receiver.spans.length;

  // MCP tools/call -> execute_tool span (mcp process) + mole.daemon.rpc span (daemon the MCP server starts)
  receiver.reset();
  const fx = join(scratch, 'mcp-repo');
  mkdirSync(join(fx, 'src'), { recursive: true });
  writeFileSync(join(fx, 'src/a.ts'), 'export function a() {\n  return 1;\n}\n');
  writeFileSync(join(fx, 'src/b.ts'), "import { a } from './a.js';\nexport function b() {\n  return a();\n}\n");
  const stateDir = join(scratch, 'mcp-state');
  const mcpEnv = { ...process.env, MOLE_OTEL: '1', OTEL_EXPORTER_OTLP_ENDPOINT: receiver.url, MOLE_ROOT: fx, MOLE_STATE_DIR: stateDir } as Record<string, string>;
  const client = new Client({ name: 'm13', version: '0' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: ['--no-warnings', mcpCli], env: mcpEnv }));
    const res = await client.callTool({ name: key.otel.mcp.tool, arguments: { target: 'src/a.ts' } });
    details.mcpText = ((res.content as Array<{ text?: string }>)[0]?.text ?? '').slice(0, 200);
    await receiver.waitFor((s) => s.some((x) => x.name === key.otel.mcp.span.name) && s.some((x) => x.name === key.otel.daemon.span.name && x.attributes['mole.rpc.method'] === 'map'), 15_000);
  } catch (e) {
    errors.push(`mcp: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await client.close().catch(() => undefined);
    run(process.execPath, ['--no-warnings', cli, 'stop', '--root', fx, '--state-dir', stateDir]);
  }
  details.mcpSpans = receiver.spans.map((s) => ({ name: s.name, service: s.service, attributes: s.attributes }));
  stageResults.push({ span: key.otel.mcp.span.name, ...matches(key.otel.mcp.span, key.otel.mcp.service, receiver.spans) });
  stageResults.push({ span: key.otel.daemon.span.name, ...matches(key.otel.daemon.span, key.otel.daemon.service, receiver.spans) });
  details.protobufRejected = receiver.rejected;
} catch (e) {
  errors.push(`otel: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await receiver.close();
}
const stagesSeen = stageResults.filter((s) => s.ok).length;
const stagesExpected = key.otel.check.spans.length + 2;
const coverage = Math.round((1000 * stagesSeen) / stagesExpected) / 10;
details.stages = stageResults;

// ---------- 2) MLflow ----------
const py = process.env.MOLE_MLFLOW_PYTHON ?? (existsSync(join(homedir(), '.hermes/cache/scratch/mole-mlflow-venv/bin/python')) ? join(homedir(), '.hermes/cache/scratch/mole-mlflow-venv/bin/python') : 'python3');
const loader = join(repoRoot, 'scripts/mlflow/load_runs.py');
let lines = 0;
const runsFiles: Record<string, number> = {};
const tasksDir = join(repoRoot, 'tasks');
for (const t of existsSync(tasksDir) ? readdirSync(tasksDir).sort() : []) {
  const f = join(tasksDir, t, '4 log', 'runs.jsonl');
  if (!existsSync(f)) continue;
  const n = readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).length;
  runsFiles[t] = n;
  lines += n;
}
let firstAdded = -1;
let secondAdded = -1;
let storeRuns = -1;
let paramsOk = false;
let prefixesOk = false;
let parsePass = 0;
const store = join(scratch, 'mlruns');
try {
  const load = () => {
    const r = run(py, [loader, '--repo', repoRoot, '--tracking-uri', `file:${store}`, '--json'], { env: { ...process.env, NO_PROXY: '*' } });
    if (r.status !== 0) throw new Error(`load_runs.py exit ${r.status}: ${(r.stderr ?? '').trim().split('\n').slice(-3).join(' | ')}`);
    return JSON.parse(r.stdout.trim().split('\n').at(-1) ?? '{}') as { lines: number; added: number; skipped: number };
  };
  const a = load();
  firstAdded = a.added;
  const b = load();
  secondAdded = b.added;
  details.mlflowLoads = [a, b];
  // count independently from the file store: <store>/<experiment id>/<run id>/meta.yaml
  const exps = readdirSync(store).filter((d) => existsSync(join(store, d, 'meta.yaml')) && new RegExp(`^name: ${key.mlflow.experiment}$`, 'm').test(readFileSync(join(store, d, 'meta.yaml'), 'utf8')));
  if (exps.length !== 1) throw new Error(`experiment ${key.mlflow.experiment}: ${exps.length} found`);
  const expDir = join(store, exps[0]!);
  const runs = readdirSync(expDir).filter((d) => existsSync(join(expDir, d, 'meta.yaml')));
  storeRuns = runs.length;
  paramsOk = runs.length > 0 && runs.every((r) => key.mlflow.params.every((p) => existsSync(join(expDir, r, 'params', p))));
  const metricNames = new Set(runs.flatMap((r) => (existsSync(join(expDir, r, 'metrics')) ? readdirSync(join(expDir, r, 'metrics')) : [])));
  const prefixes = key.mlflow.metric_prefixes.map((p) => [p, [...metricNames].some((m) => m === p || m.startsWith(`${p}.`))] as const);
  prefixesOk = prefixes.every(([, ok]) => ok);
  details.metricPrefixes = Object.fromEntries(prefixes);
  // parser cases
  const casesFile = join(scratch, 'parse-cases.json');
  writeFileSync(casesFile, JSON.stringify(key.mlflow.parse_cases.map((c) => ({ metric: c.metric, raw: c.raw }))));
  const p = run(py, [loader, '--parse-metrics', casesFile]);
  if (p.status !== 0) throw new Error(`load_runs.py --parse-metrics exit ${p.status}: ${(p.stderr ?? '').slice(-300)}`);
  const got = JSON.parse(p.stdout) as Array<Record<string, number>>;
  const parseResults = key.mlflow.parse_cases.map((c, i) => ({ raw: c.raw, ok: JSON.stringify(Object.entries(got[i] ?? {}).sort()) === JSON.stringify(Object.entries(c.expect).sort()), got: got[i] }));
  parsePass = parseResults.filter((r) => r.ok).length;
  details.parse = parseResults;
} catch (e) {
  errors.push(`mlflow: ${e instanceof Error ? e.message : String(e)}`);
}
details.runsFiles = runsFiles;

// ---------- 3) CI ----------
const ci: { workflowOk: boolean; why: string[]; green: number | null; red: number | null; ruled: number | null; wrongHash: number | null; keysListed: boolean } = {
  workflowOk: false,
  why: [],
  green: null,
  red: null,
  ruled: null,
  wrongHash: null,
  keysListed: false,
};
const wt = join(scratch, 'ci-worktree');
let wtAdded = false;
try {
  const wfPath = join(repoRoot, key.ci.workflow);
  if (!existsSync(wfPath)) throw new Error(`${key.ci.workflow} missing`);
  const wf = parseYaml(readFileSync(wfPath, 'utf8')) as { on?: unknown; true?: unknown; jobs?: Record<string, { steps?: Array<{ name?: string; uses?: string; run?: string; with?: Record<string, unknown> }> }> };
  const on = wf.on ?? wf.true; // YAML 1.1 readers turn a bare `on` into true
  const events = Array.isArray(on) ? on : typeof on === 'object' && on ? Object.keys(on) : typeof on === 'string' ? [on] : [];
  for (const e of key.ci.events) if (!events.includes(e)) ci.why.push(`event ${e} missing`);
  const steps = Object.values(wf.jobs ?? {}).flatMap((j) => j.steps ?? []);
  const checkout = steps.find((s) => s.uses?.startsWith('actions/checkout'));
  if (!checkout || Number(checkout.with?.['fetch-depth']) !== 0) ci.why.push('checkout with fetch-depth 0 missing');
  const node = steps.find((s) => s.uses?.startsWith('actions/setup-node'));
  if (!node || String(node.with?.['node-version']) !== key.ci.node) ci.why.push(`setup-node ${key.ci.node} missing`);
  const runs = steps.map((s) => s.run ?? '').join('\n');
  for (const r of key.ci.required_runs) if (!runs.includes(r)) ci.why.push(`run "${r}" missing`);
  const guard = steps.find((s) => s.name === key.ci.guard_step)?.run?.trim();
  if (!guard) ci.why.push(`step "${key.ci.guard_step}" missing`);
  ci.workflowOk = ci.why.length === 0;
  details.guardCommand = guard;
  if (guard) {
    execFileSync('git', ['-C', repoRoot, 'worktree', 'add', '--detach', '-q', wt, 'HEAD'], { stdio: 'pipe' });
    wtAdded = true;
    const git = (...a: string[]) => execFileSync('git', ['-C', wt, '-c', 'user.name=m13', '-c', 'user.email=m13@local', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...a], { stdio: 'pipe' });
    const guardRun = () => run('bash', ['-c', guard], { cwd: wt });
    const g = guardRun();
    ci.green = g.status;
    ci.keysListed = key.ci.protected_keys.every((k) => new RegExp(`^ok\\s+${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'm').test(g.stdout));
    details.guardGreen = g.stdout.slice(0, 3000);
    // red: edit one protected key and commit it
    const target = join(wt, key.ci.edit_for_red);
    const j = JSON.parse(readFileSync(target, 'utf8')) as Record<string, unknown>;
    j.about = `${String(j.about)} (edited by the M13 red proof)`;
    writeFileSync(target, `${JSON.stringify(j, null, 2)}\n`);
    git('commit', '-q', '-am', 'm13 proof: edit a frozen key');
    const r = guardRun();
    ci.red = r.status;
    details.guardRed = (r.stdout + r.stderr).slice(0, 2000);
    // ruled: an approved ruling naming the key and its new sha256 makes it green again
    const sha = createHash('sha256').update(readFileSync(target)).digest('hex');
    const rulingDir = join(wt, 'tasks/T99-m13-proof/4 log');
    mkdirSync(rulingDir, { recursive: true });
    const ruling = (h: string) => `# key ruling 1 (M13 proof)\n\nruling    APPROVE\nallowed key    ${key.ci.edit_for_red}    sha256 ${h}\n`;
    writeFileSync(join(rulingDir, 'key-ruling-1.md'), ruling(sha));
    git('add', '-A');
    git('commit', '-q', '-m', 'm13 proof: approved ruling');
    ci.ruled = guardRun().status;
    writeFileSync(join(rulingDir, 'key-ruling-1.md'), ruling('0'.repeat(64)));
    git('commit', '-q', '-am', 'm13 proof: ruling with a wrong hash');
    ci.wrongHash = guardRun().status;
  }
} catch (e) {
  errors.push(`ci: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  if (wtAdded) spawnSync('git', ['-C', repoRoot, 'worktree', 'remove', '--force', wt]);
  spawnSync('git', ['-C', repoRoot, 'worktree', 'prune']);
}
details.ci = ci;

// ---------- result ----------
const ciOk =
  ci.workflowOk &&
  ci.keysListed &&
  ci.green === key.ci.expect.green_exit &&
  ci.red !== null &&
  ci.red !== 0 &&
  ci.ruled === key.ci.expect.ruled_exit &&
  ci.wrongHash !== null &&
  ci.wrongHash !== 0;
const mlOk = lines > 0 && storeRuns === lines && firstAdded + secondAdded === lines && secondAdded === key.mlflow.second_run_adds && paramsOk && prefixesOk && parsePass === key.mlflow.parse_cases.length;
const atTarget = coverage === 100 && offRequests === key.otel.off.requests && offSpans === key.otel.off.spans && mlOk && ciOk && errors.length === 0;
const metrics = {
  M13: `stage coverage ${coverage}% (${stagesSeen}/${stagesExpected}), off requests ${offRequests}, mlflow runs ${storeRuns}/${lines} (second load ${secondAdded}), parse ${parsePass}/${key.mlflow.parse_cases.length}, ci green ${ci.green ?? 'none'} red ${ci.red ?? 'none'} ruled ${ci.ruled ?? 'none'}`,
  M13_detail: `stages missing: ${stageResults.filter((s) => !s.ok).map((s) => `${s.span} (${s.why})`).join('; ') || 'none'}; workflow ${ci.workflowOk ? 'ok' : ci.why.join(', ')}; keys listed ${ci.keysListed}; wrong-hash ruling exit ${ci.wrongHash}; params ${paramsOk}; M1-M5 metrics ${prefixesOk}${errors.length ? `; errors: ${errors.join(' | ')}` : ''}`,
  at_target: atTarget,
};
Object.assign(details, { metrics, errors });
console.log(`M13 key ${key.written}: ${metrics.M13}`);
console.log(`   ${metrics.M13_detail}`);
console.log(`   at target: ${atTarget}`);
const mOut = arg('--metrics-out');
if (mOut) writeFileSync(mOut, JSON.stringify(metrics, null, 2));
const dOut = arg('--details');
if (dOut) writeFileSync(dOut, JSON.stringify(details, null, 2));
rmSync(scratch, { recursive: true, force: true });
process.exit(atTarget ? 0 : 1);
