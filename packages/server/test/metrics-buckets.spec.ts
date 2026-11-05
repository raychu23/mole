// T103 review FAIL (deleg_3ddcdb35): the second-scale histograms used the SDK's default ms-scale buckets, so every
// sub-second request landed in the first bucket and histogram_quantile() was meaningless. No database needed: the
// gauges' pool is a stub; the exposition comes from the exporter's own request handler.
import { describe, it, expect } from 'vitest';
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { initMetrics } from '../src/metrics.js';
import type { Pool } from '../src/db.js';

const stubPool = { query: async () => ({ rows: [{ n: 0 }] }) } as unknown as Pool;

async function scrape(handler: (req: never, res: never) => void): Promise<string> {
  const server = createServer((req, res) => handler(req as never, res as never));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  try {
    return await new Promise<string>((resolve, reject) => {
      request({ host: '127.0.0.1', port, path: '/metrics' }, (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => resolve(body));
      }).on('error', reject).end();
    });
  } finally {
    server.close();
  }
}

describe('metrics histogram buckets are second-scale (OTel HTTP semconv advice)', () => {
  it('a 30 ms request lands in the le="0.05" bucket, not only the first default bucket', async () => {
    const m = initMetrics(stubPool, 'bucket-test');
    try {
      m.recordHttpDuration(0.03, { method: 'GET', route: '/healthz', status: 200 });
      m.recordJob('rebuild-index', 'success', 1.5);
      const text = await scrape(m.requestHandler.bind(m));
      const http = text.split('\n').filter((l) => l.startsWith('http_server_request_duration_bucket'));
      expect(http.some((l) => l.includes('le="0.005"'))).toBe(true);
      expect(http.find((l) => l.includes('le="0.025"'))).toMatch(/ 0$/);
      expect(http.find((l) => l.includes('le="0.05"'))).toMatch(/ 1$/);
      const job = text.split('\n').filter((l) => l.startsWith('mole_job_duration_bucket'));
      expect(job.find((l) => l.includes('le="1"'))).toMatch(/ 0$/);
      expect(job.find((l) => l.includes('le="2.5"'))).toMatch(/ 1$/);
    } finally {
      await m.shutdown();
    }
  });
});
