// T102: worker_threads entry for prCheckAsync. Runs the EXACT SAME prCheck() this package exports for the
// CLI/hooks, just inside a worker thread instead of the caller's own thread -- see pr-check-async.ts for why.
import { parentPort } from 'node:worker_threads';
import { prCheck } from './pr-check.js';
import type { PrCheckOptions, PrCheckResult } from './types.js';

interface Request {
  id: number;
  opts: PrCheckOptions;
}
interface Response {
  id: number;
  ok: boolean;
  result?: PrCheckResult;
  error?: { message: string };
}

if (!parentPort) throw new Error('pr-check-worker.js must run inside a node:worker_threads Worker');
const port = parentPort;

port.on('message', (msg: Request) => {
  prCheck(msg.opts).then(
    (result) => port.postMessage({ id: msg.id, ok: true, result } satisfies Response),
    (err: unknown) => port.postMessage({ id: msg.id, ok: false, error: { message: err instanceof Error ? err.message : String(err) } } satisfies Response),
  );
});
