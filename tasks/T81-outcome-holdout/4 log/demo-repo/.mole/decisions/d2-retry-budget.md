---
id: d2-retry-budget
title: Raise the client retry budget from 2 to 5
status: accepted
prediction:
  expected: 'fewer user-visible 5xx errors from transient failures'
  signal: 'user-visible 5xx rate per day'
  check_at: '2020-02-01'
outcome:
  observed: '5xx rate rose 18% -- retries amplified load during a downstream outage'
  date: '2026-11-02'
  who: raymond
  result: contradicted
---

## Decision
Raise client retry budget.
