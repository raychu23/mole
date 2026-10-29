// T16 done-when 1 (off half): with MOLE_OTEL unset nothing is loaded and nothing is sent.
// Its own file: vitest isolates files, so the SDK the "on" tests load cannot leak into this module instance.
import { spawn } from 'node:child_process';
const spawnAsync = (cmd: string, args: string[], opts: { env: NodeJS.ProcessEnv }) =>
  new Promise<{ status: number | null; stdout: string }>((res) => {
    const c = spawn(cmd, args, { env: opts.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    c.stdout.setEncoding('utf8');
    c.stdout.on('data', (d: string) => (stdout += d));
    c.stderr.resume();
    c.on('close', (status) => res({ status, stdout }));
  });
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { executeTool, sdkLoaded, startTelemetry, shutdownTelemetry, telemetryEnabled, withSpan, withSpanSync } from '../src/index.js';
import { startReceiver, type Receiver } from '../bench/otlp-receiver.js';

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

describe('telemetry off (MOLE_OTEL unset)', () => {
  it('spans are pass-through, the SDK is never imported and no request is sent', async () => {
    const saved = process.env.MOLE_OTEL;
    delete process.env.MOLE_OTEL;
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = rec.url;
    try {
      expect(telemetryEnabled()).toBe(false);
      expect(telemetryEnabled({ MOLE_OTEL: '0' })).toBe(false);
      expect(telemetryEnabled({ MOLE_OTEL: '1' })).toBe(true);
      expect(await startTelemetry('mole-test')).toBe(false);
      const seen: string[] = [];
      const v = await withSpan('outer', { a: 1 }, async (set) => {
        set({ b: 2 });
        seen.push('outer');
        return withSpanSync('inner', {}, () => 41) + 1;
      });
      expect(v).toBe(42);
      expect(await executeTool('mole_map', {}, () => 'tool')).toBe('tool');
      await expect(withSpan('boom', {}, () => Promise.reject(new Error('x')))).rejects.toThrow('x');
      await shutdownTelemetry();
      expect(seen).toEqual(['outer']);
      expect(sdkLoaded()).toBe(false);
      await new Promise((r) => setTimeout(r, 200));
      expect(rec.requests).toBe(0);
    } finally {
      if (saved !== undefined) process.env.MOLE_OTEL = saved;
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    }
  });

  it('mole check with MOLE_OTEL unset sends 0 requests to a configured OTLP endpoint', async () => {
    rec.reset();
    const env = { ...process.env, OTEL_EXPORTER_OTLP_ENDPOINT: rec.url };
    delete env.MOLE_OTEL;
    const r = await spawnAsync(process.execPath, ['--no-warnings', cli, 'check', '61564ebf85', '--root', repoRoot, '--json'], { env });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).questions.length).toBeGreaterThan(0);
    await new Promise((res) => setTimeout(res, 500));
    expect(rec.requests).toBe(0);
  }, 60_000);
});
