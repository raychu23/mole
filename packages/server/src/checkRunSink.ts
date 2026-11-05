// Pluggable outbox delivery sink (T98 server-slo). Audit finding: buildApp() wrote outbox
// rows on every check-run job but NOTHING in the running server ever called
// relayOutboxOnce() -- only bench/m25.ts and tests did, manually, in-process. A real
// `node dist/src/index.js` deployment queued check-run notifications forever and never
// posted a single one anywhere. Non-goal (docs/server-slo.md, Non-goals): no real GitHub
// App registration, so this never talks to api.github.com directly. Instead:
//  - MOLE_CHECKRUN_WEBHOOK_URL (optional): POST each check-run payload as JSON to this URL
//    (compatible with src/fakeGithub.ts's own `${url}/check-runs` contract, so it can point
//    at a real recorder, a staging relay, or -- in a real deploy -- a small adapter process
//    that holds the actual GitHub App credentials and is NOT this codebase's concern).
//  - unset (the default): throws a clear, logged error on every delivery attempt, which
//    feeds the SAME retry/backoff/dead-letter path real send failures would. This is
//    intentionally honest about the gap rather than silently no-op-marking rows delivered.
import type { FakeGithubClient } from './outbox.js';

export function createHttpCheckRunSink(baseUrl: string): FakeGithubClient {
  return {
    async postCheckRun(orgId, ref, payload) {
      const res = await fetch(`${baseUrl}/check-runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orgId, ref, payload }),
      });
      if (!res.ok) {
        throw new Error(`check-run sink ${baseUrl} responded ${res.status}`);
      }
    },
  };
}

export function createUnconfiguredSink(): FakeGithubClient {
  return {
    async postCheckRun() {
      throw new Error(
        'no check-run delivery sink configured: set MOLE_CHECKRUN_WEBHOOK_URL (dev/staging recorder) ' +
          'or pass opts.githubSink to buildApp (a real deploy would inject an Octokit-based sink here; ' +
          'Mole itself never registers a GitHub App -- see docs/server-slo.md, Non-goals)'
      );
    },
  };
}

export function createCheckRunSink(env: NodeJS.ProcessEnv): FakeGithubClient {
  const url = env.MOLE_CHECKRUN_WEBHOOK_URL;
  return url ? createHttpCheckRunSink(url) : createUnconfiguredSink();
}
