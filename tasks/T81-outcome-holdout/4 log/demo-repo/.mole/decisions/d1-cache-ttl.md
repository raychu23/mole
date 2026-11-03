---
id: d1-cache-ttl
title: Shorten the hot-path cache TTL from 60s to 10s
status: accepted
prediction:
  expected: 'p95 API latency drops without a meaningful hit-rate loss'
  signal: 'p95 latency (ms) and cache hit rate (%) over 7 days post-rollout'
  check_at: '2020-01-10'
rollout:
  treated: packages/api/
  holdout: packages/api-eu/
---

## Decision
Shorten cache TTL on the hot read path.
