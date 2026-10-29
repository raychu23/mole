// T20 M10 key generator (run ONCE, before the exporter exists; R1). Uses only T18's reader (getRun from @mole/agentstate)
// to fix, per sampled run: the checkpoint count and a sha256 of the canonical per-step values. No chat text is written:
// the key holds run ids, counts and hashes only, so it is committed (packages/agentstate/bench/m10-key.json).
// usage (from the worktree root, after npm run build): node "tasks/T20-langgraph-checkpoint-export/4 log/m10-keygen.mjs"
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { defaultSources, getRun } from '@mole/agentstate';

const sample = {
  // T18's M7 sessions minus the 3 still being resumed on 2026-10-29 (last message that day: 20261013_231752_0135ee,
  // 20261015_064949_38dbe5, 20261017_092042_a6584e): a growing run would make the key drift, not the exporter fail.
  'm7 (T18 M7 sessions, finished)': [
    '20261013_171309_0d3665', '20261015_061241_8d76d5', '20261015_093703_d0be16',
    '20261019_180211_ec7893', '20261027_165516_e608ed', '20261027_165516_e6ae5f', '940c0cc7-4804-4a75-9a43-6388e8312e4f',
  ],
  'harness coverage (finished before 2026-10-28)': [
    'local-9982f80bb24af4df83978288a29efe37787059dc551f460777cee252ae666045',
    '310207f1-103f-4eaa-93ac-f16cb30830a1', 'agent-a343760986d5b1c6c', '39f30d8f-2c96-44bc-be28-395ba06f4518',
    '01a178d6-672a-70e3-ae0e-21119dab5650', '01a178cd-b8c7-7623-af1d-aeb45edf627b', '01a10c9a-5c46-7523-9adf-f9f539bb6a77', '01a0c9f2-03b5-7080-9810-83e355e1130a',
  ],
};
const empty = ['e6d2803f-bac4-4d53-ae46-df97087e86cd', '01a17e6e-42bd-77f1-86be-18e7d02d248b'];
const forkRuns = ['20261015_093703_d0be16', '940c0cc7-4804-4a75-9a43-6388e8312e4f', '01a10c9a-5c46-7523-9adf-f9f539bb6a77'];

const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
/** the M10 values of checkpoint i, straight from T18's RunGraph */
const valuesOf = (g, i) => {
  const c = g.checkpoints[i], s = g.steps[i];
  const { repo, gitSha, files, read } = c.values.context;
  return { step: { id: s.id, index: s.index, kind: s.kind }, contextVersion: { repo, gitSha, files }, filesRead: read, tried: c.values.tried, changed: c.values.changed };
};
const hashOf = (g) => createHash('sha256').update(JSON.stringify(g.checkpoints.map((_, i) => sortKeys(valuesOf(g, i))))).digest('hex');

const src = defaultSources();
const runs = [];
for (const [group, ids] of Object.entries(sample))
  for (const id of ids) {
    const g = getRun(id, { ...src, all: true });
    if (!g) throw new Error(`no run ${id}`);
    runs.push({ id, harness: g.run.harness, group, checkpoints: g.checkpoints.length, sha256: hashOf(g) });
  }
const emptyCases = empty.map((id) => {
  const g = getRun(id, { ...src, all: true });
  if (!g) throw new Error(`no run ${id}`);
  if (g.checkpoints.length !== 0) throw new Error(`${id} is not empty`);
  return { id, harness: g.run.harness, checkpoints: 0 };
});
const forks = forkRuns.map((id) => {
  const r = runs.find((x) => x.id === id);
  return { id, harness: r.harness, step: Math.floor(r.checkpoints / 2) };
});
const p = (n) => String(n).padStart(2, '0');
const d = new Date();
const off = -d.getTimezoneOffset();
const written = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${off >= 0 ? '+' : '-'}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`;
const key = {
  written,
  by: 'tasks/T20-langgraph-checkpoint-export/4 log/m10-keygen.mjs with T18 getRun (no exporter existed)',
  values: 'per checkpoint i: {step:{id,index,kind}, contextVersion:{repo,gitSha,files}, filesRead: context.read, tried, changed}; sha256 of JSON of the array with keys sorted recursively',
  target: 'every run: getStateHistory on the exported file = same count, order (oldest->newest by parent links) and sha256; every fork ok; every empty case = empty thread + note',
  runs,
  forks,
  empty: emptyCases,
};
writeFileSync('packages/agentstate/bench/m10-key.json', JSON.stringify(key, null, 1) + '\n');
console.log(`wrote ${runs.length} runs (${runs.reduce((a, r) => a + r.checkpoints, 0)} checkpoints), ${forks.length} forks, ${emptyCases.length} empty`);
