// T16 done-when 1 (on half): MOLE_OTEL=1 exports spans over OTLP/HTTP JSON; mole check emits one span per stage under a
// root mole.check span and flushes them before the CLI exits; tool calls follow the OTel GenAI execute_tool convention.
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { executeTool, sdkLoaded, shutdownTelemetry, startTelemetry, withSpan, withSpanSync } from '../src/index.js';
import { startReceiver, type ReceivedSpan, type Receiver } from '../bench/otlp-receiver.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const cli = join(repoRoot, 'packages/daemon/dist/cli.js');

let rec: Receiver;
beforeAll(async () => {
  rec = await startReceiver();
});
afterAll(async () => {
  await rec.close();
});

const byName = (spans: ReceivedSpan[], n: string) => spans.filter((s) => s.name === n);
const parentName = (spans: ReceivedSpan[], s: ReceivedSpan) => spans.find((x) => x.spanId === s.parentSpanId)?.name;

describe('telemetry on (MOLE_OTEL=1)', () => {
  it('nested spans, attributes, errors and an execute_tool span reach the OTLP endpoint after shutdown', async () => {
    process.env.MOLE_OTEL = '1';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = rec.url;
    try {
      expect(await startTelemetry('mole-test')).toBe(true);
      expect(sdkLoaded()).toBe(true);
      await withSpan('outer', { 'mole.a': 1 }, async (set) => {
        set({ 'mole.b': 'two' });
        withSpanSync('inner-sync', {}, () => undefined);
        await withSpan('inner', {}, async () => undefined);
        await executeTool('mole_map', { 'gen_ai.tool.call.id': '7' }, () => 'ok');
      });
      await expect(withSpan('boom', {}, () => Promise.reject(new TypeError('bad')))).rejects.toThrow('bad');
      await shutdownTelemetry();
    } finally {
      delete process.env.MOLE_OTEL;
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    }
    const spans = rec.spans;
    expect(rec.rejected).toBe(0);
    const outer = byName(spans, 'outer')[0]!;
    expect(outer).toBeDefined();
    expect(outer.parentSpanId).toBeUndefined();
    expect(outer.service).toBe('mole-test');
    expect(outer.attributes).toMatchObject({ 'mole.a': 1, 'mole.b': 'two' });
    expect(parentName(spans, byName(spans, 'inner')[0]!)).toBe('outer');
    expect(parentName(spans, byName(spans, 'inner-sync')[0]!)).toBe('outer');
    const tool = byName(spans, 'execute_tool mole_map')[0]!;
    expect(tool).toBeDefined();
    expect(parentName(spans, tool)).toBe('outer');
    expect(tool.attributes).toMatchObject({ 'gen_ai.operation.name': 'execute_tool', 'gen_ai.tool.name': 'mole_map', 'gen_ai.tool.call.id': '7' });
    const boom = byName(spans, 'boom')[0]!;
    expect(boom.status).toBe(2); // STATUS_CODE_ERROR
    expect(boom.attributes['error.type']).toBe('TypeError');
  });

  it('mole check emits git blame, fix lookup, symbol resolution and questions stages under mole.check, flushed before exit', () => {
    rec.reset();
    const env = { ...process.env, MOLE_OTEL: '1', OTEL_EXPORTER_OTLP_ENDPOINT: rec.url };
    const r = spawnSync(process.execPath, ['--no-warnings', cli, 'check', '61564ebf85', '--root', repoRoot, '--json'], { env, encoding: 'utf8' });
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout) as { hunks: unknown[]; questions: unknown[] };
    const spans = [...rec.spans]; // read at once: the CLI has exited, so the spans must already be here
    const root = byName(spans, 'mole.check');
    expect(root).toHaveLength(1);
    expect(root[0]!.parentSpanId).toBeUndefined();
    expect(root[0]!.service).toBe('mole-cli');
    expect(root[0]!.attributes).toMatchObject({ 'mole.change.kind': 'sha', 'mole.hunks': out.hunks.length, 'mole.questions.count': out.questions.length });
    expect(Number(root[0]!.attributes['mole.past_fixes'])).toBeGreaterThanOrEqual(1);
    expect(parentName(spans, byName(spans, 'mole.questions')[0]!)).toBe('mole.check');
    expect(parentName(spans, byName(spans, 'mole.history.check')[0]!)).toBe('mole.questions');
    for (const stage of ['mole.git.resolve_change', 'mole.git.blame', 'mole.history.fix_lookup', 'mole.history.symbol_resolution']) {
      const s = byName(spans, stage);
      expect(s, stage).toHaveLength(1);
      expect(parentName(spans, s[0]!), stage).toBe('mole.history.check');
    }
    expect(new Set(spans.map((s) => s.traceId)).size).toBe(1);
  }, 60_000);
});
