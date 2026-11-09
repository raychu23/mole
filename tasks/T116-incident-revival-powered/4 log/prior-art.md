# T116 (Q5b) prior-art — dated

1. T111's own prior-art (Graphiti candidate-admission gate, Dung 1995 grounded semantics, Robertson &
   Zaragoza BM25) carries over unchanged: this task reuses the same engine and baselines, only the case
   construction changes (`tasks/T111-incident-revival-eval/4 log/prior-art.md`, re-checked 2026-11-08).
2. **The T111 review design this task implements** (`tasks/T111-incident-revival-eval/4 log/results.md`,
   "Reviewer's design for a real study", 2026-11-08): >=3 options/case so recall@1 can fail and the
   structural gate is exercised against real distractors; independently dated pre-trigger dissent quotes,
   not reconstructed after the fact; PEPs/Rust RFCs/KEPs filtered by their own status field.
3. **peps.python.org/api/peps.json** (fetched 2026-11-08): the official, machine-readable PEP status/
   `superseded_by` field — used to find the 31 real PEP pairs where a later PEP officially superseded an
   earlier one (not a model's opinion of "similar" PEPs). 6 of those 31 pairs were hand-built into cases
   for this task; the other 25 were read from the API but not hand-built (time/scope, see "NOT RUN").
4. The 6 cases' own quoted sources (all fetched 2026-11-08, primary documents, each quote's date given in
   `cases.json`): PEP 601/765 (peps.python.org/pep-0601, /pep-0765), PEP 722/723 (/pep-0722, /pep-0723),
   PEP 554/734 (/pep-0554, /pep-0734), PEP 665/751 (/pep-0665, /pep-0751), PEP 563/649/749 (/pep-0563,
   /pep-0649, /pep-0749), PEP 354/435 (/pep-0354, /pep-0435). Each case's dissent quote is drawn from the
   REJECTED PEP's own text (or, for PEP 649, a quoted November-2017 python-dev mailing-list reply), dated
   independently of and years before the real trigger that revived it — the T111 limit #1 this task was
   built to fix. Two cases (py-finally-controlflow's 3rd option, py-annotations-eval's 3rd option) could
   not find an independently-pre-dated 3rd (distractor) option and use one dated at/near the trigger
   instead — disclosed in cases.json and results.md, not hidden.

## Explicit scope limitation (stated up front)
The queue goal's power target is n=30-60 across PEPs + Rust RFCs + KEPs. This pass built n=6, PEPs only,
in the ~3h timebox the queue brief allows for freezing and running descriptively below n=30. See
results.md "NOT RUN" for what a follow-up pass would need to close the gap (Rust RFC and KEP sourcing,
and scaling the PEP source past 6 of its 31 real candidate pairs).
