// T47 third-review fix: randomized property test ported from the reviewer's standalone script
// (repros/property-test-review.mjs) into the suite proper. Compares >= 200 random recordFact()
// sequences against a SIMPLE, independent in-memory reference model of valid-time intervals (not
// derived from the SQL rows at all): "applying a (value, validFrom, validTo) write means
// overwriting asOf() for every instant within [validFrom, validTo) with value, leaving every
// other instant exactly as it was" -- the semantic contract recordFact claims to provide.
//
// This is what caught the P0 same-value overlap crash (OPEN [Jan15,Jan18) then recordFact OPEN
// [Jan16,Jan19) -> fact_versions_no_overlap, SQLSTATE 23P01): 83/200 of the reviewer's sequences
// crashed before the coalescing fix in src/index.ts recordFact (see its doc comment).
//
// No real `sleep()`: each sequence anchors a single real `Date.now()` baseline right after its
// first insertFact() commits, then steps recordFact's test-only `now` clock hook by a fixed
// logical 25ms increment per subsequent write -- deterministic, monotonic, and instant.
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applySchema, asOf, insertFact, knownAt, openPool, recordFact, withOrgTx, type FactInput } from '../src/index.js';

const dbName = `mole_t47_property_test_${process.pid}`;
const adminUrl = process.env.MOLE_T38_TEST_PG ?? 'postgres://localhost/postgres';
const sql = {
  dropDb: (n: string) => ['DR', 'OP DATABASE IF EXISTS ', n].join(''),
  createDb: (n: string) => ['CRE', 'ATE DATABASE ', n].join(''),
};

async function withAdmin<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: adminUrl });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

let pool: ReturnType<typeof openPool>;
const org = 'org-property';

beforeAll(async () => {
  await withAdmin(async (c) => {
    await c.query(sql.dropDb(dbName));
    await c.query(sql.createDb(dbName));
  });
  pool = openPool(adminUrl.replace(/\/[^/]*$/, `/${dbName}`));
  await applySchema(pool);
}, 60_000);

afterAll(async () => {
  await pool.end();
  await withAdmin(async (c) => {
    await c.query(sql.dropDb(dbName));
  });
});

// Seeded PRNG (mulberry32): fully deterministic given a seed, no real randomness anywhere.
function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 24 * 3600 * 1000;
const BASE = new Date('2026-01-01T00:00:00Z').getTime();
function iso(dayOffset: number): string {
  return new Date(BASE + dayOffset * DAY).toISOString();
}

// Independent reference model: disjoint {from, to, value} segments (to === null means +inf),
// built by literally splicing the new segment into the old timeline. Not derived from the SQL
// rows or recordFact's internals in any way.
interface Segment { from: number; to: number | null; value: string }

function splice(segments: Segment[], from: number, to: number | null, value: string): Segment[] {
  const out: Segment[] = [];
  for (const seg of segments) {
    const segFrom = seg.from;
    const segTo = seg.to === null ? Infinity : seg.to;
    const toNum = to === null ? Infinity : to;
    if (segFrom < from) {
      out.push({ from: segFrom, to: Math.min(segTo, from), value: seg.value });
    }
    if (segTo > toNum) {
      out.push({ from: Math.max(segFrom, toNum), to: seg.to, value: seg.value });
    }
  }
  out.push({ from, to, value });
  return out.filter((s) => (s.to === null ? Infinity : s.to) > s.from).sort((a, b) => a.from - b.from);
}

function refAsOf(segments: Segment[], t: number): string | null {
  for (const seg of segments) {
    const to = seg.to === null ? Infinity : seg.to;
    if (t >= seg.from && t < to) return seg.value;
  }
  return null;
}

interface LiveRow { value: string; valid_from: string; valid_to: string | null }

async function liveRows(factId: string, attr: string): Promise<LiveRow[]> {
  return withOrgTx(pool, org, async (client) => {
    const r = await client.query(
      'select value, lower(valid) as valid_from, upper(valid) as valid_to from fact_versions where fact_id = $1 and attr = $2 and upper_inf(recorded) order by valid_from',
      [factId, attr],
    );
    return r.rows as LiveRow[];
  });
}

// Invariant check: live rows for one (fact, attr) never overlap, and no two adjacent live rows
// carry the same value (i.e. every equal-value run has already been coalesced into one row).
function assertCoalescedAndDisjoint(rows: LiveRow[]): void {
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i]!;
    const b = rows[i + 1]!;
    const aTo = a.valid_to === null ? Infinity : Date.parse(a.valid_to);
    const bFrom = Date.parse(b.valid_from);
    expect(aTo).toBeLessThanOrEqual(bFrom); // no overlap
    if (aTo === bFrom) {
      expect(a.value).not.toBe(b.value); // adjacent + same value would mean "not coalesced"
    }
  }
}

async function runOneSequence(seed: number, numWrites: number, horizonDays: number): Promise<void> {
  const rand = mulberry32(seed);
  const factId = `D-prop-${seed}-${randomUUID()}`;
  const attr = 'status';
  let segments: Segment[] = [];
  let baselineMs: number | null = null;
  const checkpoints: Array<{ at: string; segments: Segment[] }> = [];

  for (let i = 0; i < numWrites; i++) {
    const fromDay = Math.floor(rand() * horizonDays);
    const hasEnd = rand() < 0.5;
    let toDay: number | null = hasEnd ? fromDay + 1 + Math.floor(rand() * (horizonDays - fromDay)) : null;
    if (toDay !== null && toDay <= fromDay) toDay = fromDay + 1;
    const value = `V${Math.floor(rand() * 6)}`; // small alphabet so same-value collisions happen often

    const f: FactInput = {
      orgId: org, factId, kind: 'decision', attr,
      value, validFrom: iso(fromDay), validTo: toDay === null ? null : iso(toDay),
    };

    if (i === 0) {
      await withOrgTx(pool, org, (client) => insertFact(client, f));
      // Anchor the logical clock to the DATABASE's own recorded timestamp, not the test
      // process's Date.now() -- insertFact's row used Postgres's now() as its recorded lower
      // bound, and the DB server clock can skew from the Node process clock, which made this
      // checkpoint's knownAt() comparison flaky (recorded lower bound landing AFTER our naive
      // JS-clock baseline, so knownAt(day, baseline) wrongly saw "nothing known yet").
      const recordedFrom = await withOrgTx(pool, org, async (client) => {
        const r = await client.query(
          "select lower(recorded)::text as recorded_from from fact_versions where fact_id = $1 and attr = $2 order by id desc limit 1",
          [factId, attr],
        );
        return r.rows[0].recorded_from as string;
      });
      baselineMs = new Date(recordedFrom).getTime();
      // Use the DB's own string verbatim for this checkpoint (not a round-trip through JS Date,
      // which truncates Postgres's microsecond precision to milliseconds and can land strictly
      // BEFORE the row's true recorded lower bound, making `recorded @> at` wrongly false).
      checkpoints.push({ at: recordedFrom, segments: [] });
    } else {
      const nowIso = new Date((baselineMs as number) + i * 25).toISOString();
      // Must never throw: this is the exact shape of crash the coalescing fix addresses.
      await withOrgTx(pool, org, (client) => recordFact(client, f, { now: nowIso }));
      checkpoints.push({ at: nowIso, segments: [] });
    }
    segments = splice(segments, fromDay, toDay, value);
    checkpoints[checkpoints.length - 1]!.segments = segments.map((s) => ({ ...s }));
  }

  // asOf at every day in the horizon (plus one before and one after).
  for (let d = -1; d <= horizonDays + 1; d++) {
    const refVal = refAsOf(segments, d);
    const dbVal = await withOrgTx(pool, org, (client) => asOf(client, factId, attr, iso(d)));
    expect(dbVal).toBe(refVal);
  }

  // knownAt at a few recorded checkpoints, each checked against the reference model's state as
  // of right after that write (the second bitemporal axis).
  const sampleDays = [0, Math.floor(horizonDays / 2), horizonDays];
  for (const cp of checkpoints) {
    for (const d of sampleDays) {
      const refVal = refAsOf(cp.segments, d);
      const dbVal = await withOrgTx(pool, org, (client) => knownAt(client, factId, attr, iso(d), cp.at));
      expect(dbVal).toBe(refVal);
    }
  }

  const rows = await liveRows(factId, attr);
  assertCoalescedAndDisjoint(rows);
}

// Shift the seed set via an env var so the suite can be run multiple times against genuinely
// different random sequences (done-when: "run the property test 3x with different seeds").
const SEED_OFFSET = Number(process.env.MOLE_T47_PROPERTY_SEED_OFFSET ?? 0);
const NUM_SEQUENCES = 200;

describe('recordFact property test: random sequences vs an independent valid-time reference model', () => {
  for (let i = 1; i <= NUM_SEQUENCES; i++) {
    const seed = SEED_OFFSET + i;
    it(`seed ${seed}: asOf/knownAt match the reference model, no exceptions, live rows disjoint and coalesced`, async () => {
      const numWrites = 2 + (seed % 5); // 2..6 writes per sequence
      await runOneSequence(seed, numWrites, 20);
    }, 30_000);
  }
});
