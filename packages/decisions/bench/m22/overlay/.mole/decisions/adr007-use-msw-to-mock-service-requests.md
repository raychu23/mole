---
id: adr007
title: 'Use MSW to mock http requests'
status: accepted
door: two-way
scope:
  - plugins/notifications/src/api/
source: docs/architecture-decisions/adr007-use-msw-to-mock-service-requests.md (backstage e8c4d056e3c)
---

## Decision

Any fetch or XMLHTTPRequest that happens in tests should be mocked by using msw (express-style route handlers), as react-testing-library suggests, instead of each test mocking network requests its own way.
