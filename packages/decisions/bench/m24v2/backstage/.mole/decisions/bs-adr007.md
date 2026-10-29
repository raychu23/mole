---
id: bs-adr007
title: "Use MSW to mock http requests"
status: accepted
scope: []
source: backstage/backstage@e8c4d056 docs/architecture-decisions/adr007-use-msw-to-mock-service-requests.md
match:
  - pattern: '\b(msw|setupServer|setupWorker|HttpResponse|XMLHttpRequest|mockFetch|fetchMock|jest-fetch-mock)\b|\bfetch\s*[=:(]|jest\.(mock|spyOn)\([^)]*fetch'
    in: '**/*.test.{ts,tsx,js}'
    why: 'ADR007 Decision: "any `fetch` or `XMLHTTPRequest` that happens, should be mocked by using `msw`" (example `import { http, HttpResponse } from ''msw''`)'
---

Overlay record for the M24 bench (T32), v2 (options round): the frozen m24 overlay + `match:` content anchors written from the ADR text (each `why` quotes the sentence). Scope written from the ADR text and the repo tree at the pinned head, never from a PR: codebase-wide test convention: no path anchor.
