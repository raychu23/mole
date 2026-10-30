# Design review: hand-back test selection

- DECISION: `selectTests()` must only use call-graph reachability plus past-fix lineage, never run the full suite by default.
- side note: CI minutes budget, unrelated to this record
