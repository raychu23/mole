// Tiny local OTLP/HTTP trace receiver for the T16 tests and the M13 bench: node http on 127.0.0.1, random port.
// Accepts OTLP JSON (what @opentelemetry/exporter-trace-otlp-http sends); protobuf bodies are counted and answered 415
// (Mole configures the JSON exporter, so a protobuf request is itself a finding).
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface ReceivedSpan {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  service?: string;
  attributes: Record<string, unknown>;
  status?: number;
}

export interface Receiver {
  /** base endpoint, e.g. http://127.0.0.1:PORT (exporters append /v1/traces) */
  url: string;
  requests: number;
  rejected: number;
  spans: ReceivedSpan[];
  waitFor(pred: (spans: ReceivedSpan[]) => boolean, ms: number): Promise<boolean>;
  reset(): void;
  close(): Promise<void>;
}

type AnyValue = { stringValue?: string; intValue?: string | number; boolValue?: boolean; doubleValue?: number; arrayValue?: { values?: AnyValue[] } };
type KV = { key: string; value?: AnyValue };

function value(v: AnyValue | undefined): unknown {
  if (!v) return undefined;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.intValue !== undefined) return Number(v.intValue);
  if (v.boolValue !== undefined) return v.boolValue;
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.arrayValue) return (v.arrayValue.values ?? []).map(value);
  return undefined;
}

const attrs = (list: KV[] | undefined): Record<string, unknown> => Object.fromEntries((list ?? []).map((a) => [a.key, value(a.value)]));

/** ids arrive as hex strings (JSON exporter) or base64 (spec JSON); normalise to hex */
function hexId(id: unknown): string {
  if (typeof id !== 'string' || !id) return '';
  if (/^[0-9a-f]+$/i.test(id) && (id.length === 16 || id.length === 32)) return id.toLowerCase();
  return Buffer.from(id, 'base64').toString('hex');
}

export function parseOtlpJson(body: unknown): ReceivedSpan[] {
  const out: ReceivedSpan[] = [];
  const rs = (body as { resourceSpans?: Array<{ resource?: { attributes?: KV[] }; scopeSpans?: Array<{ spans?: Array<Record<string, unknown>> }> }> }).resourceSpans ?? [];
  for (const r of rs) {
    const service = attrs(r.resource?.attributes)['service.name'] as string | undefined;
    for (const ss of r.scopeSpans ?? []) {
      for (const s of ss.spans ?? []) {
        const parent = hexId(s.parentSpanId);
        out.push({
          name: String(s.name),
          traceId: hexId(s.traceId),
          spanId: hexId(s.spanId),
          ...(parent ? { parentSpanId: parent } : {}),
          service,
          attributes: attrs(s.attributes as KV[] | undefined),
          status: (s.status as { code?: number } | undefined)?.code,
        });
      }
    }
  }
  return out;
}

export async function startReceiver(): Promise<Receiver> {
  const rec: Omit<Receiver, 'url' | 'close'> & { url: string; close: () => Promise<void> } = {
    url: '',
    requests: 0,
    rejected: 0,
    spans: [],
    async waitFor(pred, ms) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (pred(rec.spans)) return true;
        await new Promise((r) => setTimeout(r, 50));
      }
      return pred(rec.spans);
    },
    reset() {
      rec.requests = 0;
      rec.rejected = 0;
      rec.spans = [];
    },
    close: async () => undefined,
  };
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      rec.requests++;
      const type = String(req.headers['content-type'] ?? '');
      if (req.method !== 'POST' || !req.url?.endsWith('/v1/traces')) {
        res.writeHead(404).end();
        return;
      }
      if (!type.includes('json')) {
        rec.rejected++;
        res.writeHead(415, { 'content-type': 'application/json' }).end('{}');
        return;
      }
      try {
        rec.spans.push(...parseOtlpJson(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
        res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
      } catch {
        rec.rejected++;
        res.writeHead(400).end();
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  rec.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  rec.close = () =>
    new Promise<void>((r) => {
      server.closeAllConnections();
      server.close(() => r());
    });
  return rec;
}
