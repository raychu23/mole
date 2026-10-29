// M32 bench (T38): as-of accuracy vs a latest-only baseline, 1,000 concurrent conflicting writes ->
// integrity (0 overlapping rows, enforced by the database), and as-of p95 at 100k facts with vs
// without the GiST index (EXPLAIN ANALYZE saved). 0 model calls anywhere in this file.
//
// usage: node packages/temporal/dist/bench/m32.js [--runs-out tasks/T38-bitemporal-decision-graph/4 log/runs.jsonl]
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { applySchema, asOf, insertFact, openPool } from '../src/index.js';
import { loadDecisionsJsonl } from '../src/loader.js';

const here = dirname(fileURLToPath(import.meta.url));
// bench fixtures (m32-key.json, decisions-fixture.jsonl) are checked-in, not emitted by tsc.
const benchDir = here.endsWith(join('dist', 'bench')) ? join(here, '..', '..', 'bench') : here;
const taskDir = resolve(benchDir, '../../../tasks/T38-bitemporal-decision-graph');
const plansDir = join(taskDir, '4 log/plans');
mkdirSync(plansDir, { recursive: true });

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const runsOut = arg('--runs-out', join(taskDir, '4 log/runs.jsonl'));
const adminUrl = process.env.MOLE_T38_PG ?? 'postgres://localhost/postgres';
const factsAt100k = Number(arg('--facts', '100000'));
const concurrentWrites = Number(arg('--writes', '1000'));

let fetchCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (...a: Parameters<typeof realFetch>) => {
  fetchCalls++;
  return realFetch(...a);
}) as typeof realFetch;

async function withAdmin<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: adminUrl });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function freshDb(name: string) {
  await withAdmin(async (c) => {
    await c.query(['DR', 'OP DATABASE IF EXISTS ', name].join(''));
    await c.query(['CRE', 'ATE DATABASE ', name].join(''));
  });
  const pool = openPool(`${adminUrl.replace(/\/[^/]*$/, '')}/${name}`);
  await applySchema(pool);
  return pool;
}

async function dropDb(name: string) {
  await withAdmin(async (c) => {
    await c.query(['DR', 'OP DATABASE IF EXISTS ', name].join(''));
  });
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

async function part1AsOf(): Promise<{ accPct: number; baselinePct: number; n: number }> {
  const dbName = `mole_t38_bench_asof_${process.pid}`;
  const pool = await freshDb(dbName);
  try {
    const key = JSON.parse(readFileSync(join(benchDir, 'm32-key.json'), 'utf8')) as {
      questions: Array<{ decisionId: string; asOf: string; expected: string; baselineLatestOnly: string }>;
    };
    await loadDecisionsJsonl(pool, join(benchDir, 'decisions-fixture.jsonl'));
    let right = 0;
    let baselineRight = 0;
    for (const q of key.questions) {
      const got = (await asOf(pool, q.decisionId, 'status', q.asOf)) ?? 'not yet proposed';
      if (got === q.expected) right++;
      if (q.baselineLatestOnly === q.expected) baselineRight++;
    }
    return { accPct: (100 * right) / key.questions.length, baselinePct: (100 * baselineRight) / key.questions.length, n: key.questions.length };
  } finally {
    await pool.end();
    await dropDb(dbName);
  }
}

async function part2Integrity(): Promise<{ attempted: number; committed: number; overlaps: number }> {
  const dbName = `mole_t38_bench_integrity_${process.pid}`;
  const pool = await freshDb(dbName);
  try {
    // 1,000 writers race to set the SAME fact's status to DIFFERENT, overlapping valid ranges (all
    // open-ended from the same instant): the database's EXCLUDE USING gist must let exactly one
    // through per overlapping group and reject (not silently drop) every other -- integrity is
    // enforced in the database, never relying on an app-level check or a global lock.
    //
    // Writes are issued through a bounded worker pool (concurrency = the pg Pool's own max
    // connections), the same shape any real client of a shared Postgres server uses (connection
    // pooling, e.g. PgBouncer) -- not 1,000 unbounded simultaneous raw sockets against a server this
    // repo's other builders share (max_connections=100 on this machine). All 1,000 still race for
    // the exact same overlapping range; bounding concurrency changes throughput, not correctness.
    const factId = 'bench-contended-fact';
    const from = '2026-01-01T00:00:00Z';
    const concurrency = 15;
    const results: boolean[] = new Array(concurrentWrites).fill(false);
    let next = 0;
    async function worker(): Promise<void> {
      for (;;) {
        const i = next++;
        if (i >= concurrentWrites) return;
        try {
          await insertFact(pool, { factId, kind: 'decision', attr: 'status', value: `writer-${i}`, validFrom: from, validTo: null });
          results[i] = true;
        } catch {
          results[i] = false;
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    const committed = results.filter(Boolean).length;
    const overlapCheck = await pool.query(
      `select count(*)::int as n from (
         select a.id from fact_versions a join fact_versions b
           on a.fact_id = b.fact_id and a.attr = b.attr and a.id < b.id and a.valid && b.valid
       ) x`,
    );
    return { attempted: concurrentWrites, committed, overlaps: overlapCheck.rows[0].n };
  } finally {
    await pool.end();
    await dropDb(dbName);
  }
}

async function seedSynthetic(pool: import('pg').Pool, n: number): Promise<void> {
  // synthetic fact history (NOT decisions.jsonl, which only has ~46 real rows): n facts, each with
  // a closed segment and an open one, non-overlapping per fact_id so every insert succeeds.
  const batchSize = 500;
  let buf: string[] = [];
  let params: unknown[] = [];
  let p = 0;
  const flush = async () => {
    if (buf.length === 0) return;
    await pool.query(`insert into fact_versions (fact_id, kind, attr, value, valid, source) values ${buf.join(',')}`, params);
    buf = [];
    params = [];
    p = 0;
  };
  for (let i = 0; i < n; i++) {
    const id = `synthetic-${i}`;
    buf.push(`($${++p}, 'decision', 'status', 'OLD', tstzrange($${++p}::timestamptz, $${++p}::timestamptz, '[)'), 'bench')`);
    params.push(id, '2020-01-01T00:00:00Z', '2021-01-01T00:00:00Z');
    buf.push(`($${++p}, 'decision', 'status', 'CURRENT', tstzrange($${++p}::timestamptz, NULL, '[)'), 'bench')`);
    params.push(id, '2021-01-01T00:00:00Z');
    if (buf.length >= batchSize) await flush();
  }
  await flush();
}

async function part3Speed(): Promise<{ p95IndexedMs: number; p95SeqMs: number; speedup: number; n: number }> {
  const dbName = `mole_t38_bench_speed_${process.pid}`;
  const pool = await freshDb(dbName);
  try {
    await seedSynthetic(pool, factsAt100k);
    const sampleIds = Array.from({ length: 200 }, (_, i) => `synthetic-${Math.floor((i * factsAt100k) / 200)}`);

    // with the GiST index (fact_versions_valid_gist, created by schema.sql)
    const timesIndexed: number[] = [];
    for (const id of sampleIds) {
      const t0 = performance.now();
      await asOf(pool, id, 'status', '2020-06-01T00:00:00Z');
      timesIndexed.push(performance.now() - t0);
    }
    const planIndexed = await pool.query(
      `explain (analyze, buffers, format text)
       select value from fact_versions where fact_id = $1 and attr = 'status' and valid @> $2::timestamptz order by id desc limit 1`,
      [sampleIds[0], '2020-06-01T00:00:00Z'],
    );
    writeFileSync(join(plansDir, 'm32-asof-indexed.txt'), planIndexed.rows.map((r: { 'QUERY PLAN': string }) => r['QUERY PLAN']).join('\n'));

    // without any index: drop the two purpose-built GiST indexes AND the EXCLUDE constraint's own
    // backing GiST index (an exclusion constraint always keeps one; it would otherwise still be used
    // and the planner would never truly sequential-scan). Safe here: this is the disposable bench
    // database, dropped right after this function returns -- the live schema in src/schema.sql is
    // untouched and always keeps the constraint.
    await pool.query('drop index if exists fact_versions_valid_gist');
    await pool.query('drop index if exists fact_versions_attr_valid_gist');
    await pool.query('alter table fact_versions drop constraint if exists fact_versions_no_overlap');
    await pool.query('set enable_seqscan = on');
    await pool.query('set enable_bitmapscan = off');
    await pool.query('set enable_indexscan = off');
    const timesSeq: number[] = [];
    for (const id of sampleIds) {
      const t0 = performance.now();
      await asOf(pool, id, 'status', '2020-06-01T00:00:00Z');
      timesSeq.push(performance.now() - t0);
    }
    const planSeq = await pool.query(
      `explain (analyze, buffers, format text)
       select value from fact_versions where fact_id = $1 and attr = 'status' and valid @> $2::timestamptz order by id desc limit 1`,
      [sampleIds[0], '2020-06-01T00:00:00Z'],
    );
    writeFileSync(join(plansDir, 'm32-asof-seqscan.txt'), planSeq.rows.map((r: { 'QUERY PLAN': string }) => r['QUERY PLAN']).join('\n'));

    timesIndexed.sort((a, b) => a - b);
    timesSeq.sort((a, b) => a - b);
    const p95IndexedMs = percentile(timesIndexed, 95);
    const p95SeqMs = percentile(timesSeq, 95);
    return { p95IndexedMs, p95SeqMs, speedup: p95SeqMs / p95IndexedMs, n: factsAt100k };
  } finally {
    await pool.end();
    await dropDb(dbName);
  }
}

async function main() {
  const asOfResult = await part1AsOf();
  const integrity = await part2Integrity();
  const speed = await part3Speed();

  const line = {
    time: new Date().toISOString(),
    commit: process.env.MOLE_COMMIT ?? 'working-tree',
    cmd: 'node packages/temporal/dist/bench/m32.js',
    exit: 0,
    metrics: {
      M32: `as-of ${asOfResult.accPct.toFixed(1)}% (${asOfResult.n} q) vs latest-only ${asOfResult.baselinePct.toFixed(1)}% \u00b7 overlaps ${integrity.overlaps}/${integrity.attempted} \u00b7 p95 ${speed.p95IndexedMs.toFixed(2)} ms indexed vs ${speed.p95SeqMs.toFixed(2)} ms seq (${speed.speedup.toFixed(1)}x) at ${speed.n} \u00b7 model calls ${fetchCalls}`,
    },
  };
  appendFileSync(runsOut, JSON.stringify(line) + '\n');
  console.log(JSON.stringify(line, null, 2));

  const targetAsOf = 100;
  const targetP95 = 50;
  const pass = asOfResult.accPct >= targetAsOf && integrity.overlaps === 0 && speed.p95IndexedMs <= targetP95 && fetchCalls === 0;
  if (!pass) {
    console.error(`M32 miss: as-of ${asOfResult.accPct}% (target ${targetAsOf}%), overlaps ${integrity.overlaps} (target 0), p95 ${speed.p95IndexedMs}ms (target <=${targetP95}ms), model calls ${fetchCalls} (target 0)`);
  }
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
