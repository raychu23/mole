// M1 measurements on the read-only ui-tui fixture (state kept in a scratch dir, nothing written to the fixture):
//  1. query latency of `map` over the daemon socket + layout, for N file switches (no VS Code: pure core path)
//  2. layout stability over a 10-switch walk: how far a node that stays on the map moves
//   node packages/daemon/bench/m1.mjs   (after npm run build)   -> generated data/m1-stability.json
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Daemon, MoleClient } from '../dist/index.js';
import { layoutNeighborhood, newHome, ROW_H } from '../../layout/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = process.env.FIXTURE ?? join(homedir(), '.hermes/hermes-agent/ui-tui');
const OUT = process.env.OUT ?? resolve(here, '../../../generated data/m1-stability.json');
const SWITCHES = Number(process.env.SWITCHES ?? 10);
const state = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'mole-m1-'));

const d = new Daemon({ root: FIX, stateDir: state, tsconfig: 'tsconfig.build.json', srcDir: 'src', watch: false });
await d.start();
const c = new MoleClient({ root: FIX, stateDir: state });
for (let i = 0; i < 300; i++) if ((await c.status()).state === 'ready') break; else await new Promise((r) => setTimeout(r, 200));

const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)];

// 1. latency over many different files
const first = await c.map('src/gatewayClient.ts');
const files = [...new Set([first.focus.path, ...first.nodes.map((n) => n.path)])];
const lat = [];
const home = newHome();
for (const f of files.slice(0, 80)) {
  const t0 = performance.now();
  const m = await c.map(f);
  const t1 = performance.now();
  if (m.state === 'ok') layoutNeighborhood(m, home);
  lat.push({ rpc: t1 - t0, server: m.ms ?? 0, layout: performance.now() - t1 });
}

// 2. a 10-switch walk: each next file is a neighbour of the current one (what a developer does: follow a call/import)
const walkHome = newHome();
let cur = 'src/gatewayClient.ts';
const seen = new Set();
const steps = [];
let prev; // id -> { x, y, role }
for (let i = 0; i < SWITCHES + 1; i++) {
  const m = await c.map(cur);
  const l = layoutNeighborhood(m, walkHome);
  const now = new Map(l.nodes.map((n) => [n.id, { x: n.x, y: n.y, role: n.role }]));
  const moved = { sameRole: [], roleChanged: [] };
  if (prev) for (const [id, p] of now) {
    const q = prev.get(id);
    if (!q) continue;
    const dist = Math.hypot(p.x - q.x, p.y - q.y);
    (q.role === p.role || (q.role === 'own' && p.role === 'own') ? moved.sameRole : moved.roleChanged).push({ id, dist, from: q.role, to: p.role });
  }
  steps.push({ focus: cur, nodes: m.nodes.length, shared: moved.sameRole.length + moved.roleChanged.length, sameRoleShared: moved.sameRole.length, sameRoleMaxPx: Math.max(0, ...moved.sameRole.map((x) => x.dist)), roleChanged: moved.roleChanged.length, roleChangedMaxPx: Math.max(0, ...moved.roleChanged.map((x) => x.dist)) });
  seen.add(cur);
  prev = now;
  const next = m.nodes.filter((n) => n.role !== 'focus' && n.kind !== 'file' ? false : n.role === 'imported' || n.role === 'importer' || n.role === 'caller' || n.role === 'callee').map((n) => n.path).find((p) => !seen.has(p) && !p.includes('__tests__'))
    ?? m.nodes.map((n) => n.path).find((p) => !seen.has(p));
  if (!next) break;
  cur = next;
}
const same = steps.flatMap((s) => (s.sameRoleMaxPx !== undefined ? [s.sameRoleMaxPx] : []));
const report = {
  generatedAt: new Date().toISOString(),
  fixture: FIX,
  latency: {
    files: lat.length,
    note: 'daemon map round trip over the unix socket + column layout; the webview DOM time is measured separately in the real editor (m1-latency.json)',
    rpcMs: { p50: +pct(lat.map((x) => x.rpc), 50).toFixed(2), p95: +pct(lat.map((x) => x.rpc), 95).toFixed(2), max: +Math.max(...lat.map((x) => x.rpc)).toFixed(2) },
    serverQueryMs: { p50: +pct(lat.map((x) => x.server), 50).toFixed(2), p95: +pct(lat.map((x) => x.server), 95).toFixed(2) },
    layoutMs: { p50: +pct(lat.map((x) => x.layout), 50).toFixed(3), p95: +pct(lat.map((x) => x.layout), 95).toFixed(3) },
  },
  stability: {
    rule: 'a node that stays on the map in the same role must not move; a node that changes role (column) takes the nearest free row',
    setDistancePx: ROW_H,
    switches: steps.length - 1,
    sameRoleNodesChecked: steps.reduce((a, s) => a + s.sameRoleShared, 0),
    sameRoleMaxMovePx: Math.max(0, ...same),
    sameRoleWithinSetDistance: Math.max(0, ...same) <= ROW_H,
    totalRoleChanges: steps.reduce((a, s) => a + s.roleChanged, 0),
    steps,
  },
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ latency: report.latency, stability: { ...report.stability, steps: undefined } }, null, 1));
await d.stop();
rmSync(state, { recursive: true, force: true });
