# T31 prior art (R0, code half of M23)

Written 2026-10-30, before the checks-first commit, by a20/mole-builder-15.

## Standard approaches for this exact problem

- **Teach-back / read-back as a method**: AHRQ Health Literacy Universal Precautions Toolkit, "Use the Teach-Back
  Method" (ahrq.gov/health-literacy/improve/precautions/tool5.html) — the learner explains a thing back in their
  own words; the teacher confirms or corrects. This is the method T31's "read-back" names (per
  `context/product-plan/Design reviews + mentorship.md` §"Ideas to borrow").
- **I-PASS structured handoffs**: Starmer et al., NEJM 2014, "Changes in Medical Errors after Implementation of
  the I-PASS Handoff Program" — a structured handoff protocol cut medical errors 23%. Cited in `tasks/loop-goals.json`
  M23 and the task's own done-when as the reference point, explicitly "not a software benchmark" (effect size is
  not reusable here; the structure — grouped, confirmed, one point of truth — is what's borrowed).
- **CodeRabbit "learnings"**: a reviewer comment a maintainer corrects becomes a stored rule applied to future PRs.
  Closest existing shipped case of "a question/correction becomes a durable per-scope record", but has no read-back
  step (research doc §1, row "mentor's explanation pinned to code + read-back": verdict "unique" for the read-back
  half).
- **1:1 meeting-notes tools (Fellow, Lattice, 15Five, Range)**: they store 1:1 agenda items and action items per
  person. Explicitly the thing D31/M23 rejects for Mole's purpose (per-person tracking is a non-goal here); Mole's
  difference is grouping by folder/code-scope, never by the person who asked.
- **Code-ownership / CODEOWNERS + "who should answer this" routing**: already built in Mole as T32 (team PR check,
  M24, precision/recall 0.93/0.93) — T31 reuses the same precision/recall framing (not the same code) for a
  different question: does an existing record already answer a logged question, not does a change touch an owner.

## Method picked and why

Deterministic keyword/substring + path-overlap matching between a logged question's text and the set of existing
Mole records (decision records, docs, this project's own planning pages) — no model call, same "no model" bar the
rest of this codebase holds for every M-numbered metric (loop-goals.json R6: "a model may only word things on top
of facts code already found, and is never the check"). This mirrors the established shape of `@mole/decisions`
(T29, flag recall 100%/false flags 0%) and `@mole/questions` (T14): facts first, deterministic rules second, model
only behind an optional reword hook, never load-bearing.

## How the field measures it

Precision and recall against a frozen, hand-labeled key, the same scoring shape as T32 (M24: precision 0.9/recall
0.8 bar) and T29 (M21: recall >=90%, false flags <=10%). T31 adopts the stricter instruction given directly for
this task (M23 code half): precision/recall measured against a frozen key of >= 20 REAL questions, not synthetic
ones, pulled from this project's own logged history (`context/product-plan/4 log/my words.md` + `my words.txt`),
each with the record that is documented as having actually answered it at the time (several rows in `my words.txt`
already carry an explicit "→ <file>" answer pointer, written by the project's own `export_pdfs.py`/notes pipeline
months before this task existed, which is what makes them usable as ground truth rather than a label invented for
this bench).

## Bar used here

No external published bar exists for "does a logged question already have an answering record" (it is not one of
the 38/49/37-tool comparisons research already ran — checked `context/product-plan/Mole compared.html` and the
Design reviews doc; nothing in either names this exact capability outside Mole's own 1:1/read-back idea). In the
absence of a field bar, this task reuses the project's own established bar for this shape of metric (precision
>= 0.9, recall >= 0.8, the T32/M24 bar) since M23's own task-level wording ("share of questions answered by a
record ... rises") does not fix a numeric target for the code half; the numeric target used in the checks command
and reported in `4 log/runs.jsonl` is explicit in this file so a reviewer can hold it to account.
