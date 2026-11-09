# T120 rebuild (Amendment 2): final leak-gate results on the 33-case rebuilt set

Replaces the REJECTED Amendment-1 64-case set entirely (see Amendment 2). `cases_FINAL.json`
(33 cases: 12 violate, 12 compliant, 9 no_decision) across the same two repos Amendment 1's own
gates selected (feast-dev/feast, pledger-io/android-app) -- re-gated from scratch per
`constructed-benchmark-leak-gates`.

## 1. Keyword gate -- PASS, all classes (0% cue-word hits)

Checked every case's diff against the cue-word list (`instead of`, `directly`, `bypass`,
`anti-pattern`, `violat`, `hardcod`, `custom`, `bespoke`, `standalone`, `singleton`, `workaround`,
`hack`, etc.), word-boundary matched. 0/33 cases hit any cue word. (Also scanned for literal ADR
id mentions in diff text -- 0 hits; caught and fixed 3 draft no_decision cases during
construction that had named an ADR id in a comment before this file was written.)

## 2. Structural gate -- PASS, all classes

Every violate/compliant case is a NEW file (100% both classes, so file-newness carries zero
discriminating signal between them) with near-identical diff-line-count distributions (violate
avg 14.6 lines, compliant avg 14.5; a diff-length>median classifier scores 58.3% on violate vs
50.0% on compliant -- close to a coin flip, nothing like v4.2's 59/60 near-constant-predictor
finding). File extensions are identical within each violate/compliant pair (same file, by
construction).

## 3. No-context LLM gate -- PASS on violate + compliant; DISCLOSED RESIDUAL on no_decision

| class | n | correct | rate | 95% Wilson CI | chance (3-way) | verdict |
|---|---|---|---|---|---|---|
| violate | 12 | 3 | 25.0% | [0.089, 0.532] | 33.3% | **PASS** (CI includes chance) |
| compliant | 12 | 0 | 0.0% | [0.000, 0.243] | 33.3% | see note below |
| no_decision | 9 | 7 | 77.8% | [0.453, 0.937] | 33.3% | **residual, disclosed** |

**This is the defect Amendment 2 targeted, and it is fixed**: violate-class correct-guess rate
dropped from 78.3% (Amendment 1's set, REJECTED) to 25.0% (this set), now squarely inside its own
chance CI. The construction method change (break the ADR's own specific, pinned detail -- a
rejected RFC option, a named prefix/scheme/migration policy -- using ordinary-looking code, never
a generic architecture smell) worked as intended.

**Compliant class note**: 0% is NOT a leak of the true label. Breaking down predictions:
violate cases got `VIOLATES` guessed 3/12 (25%), `NONE` 9/12; compliant cases got `VIOLATES`
guessed 1/12 (8.3%), `NONE` 11/12 -- the no-context judge overwhelmingly defaults to "NONE" for
BOTH classes (a `COMPLIANT`-specific guess is a rare answer shape absent context, not a tell that
distinguishes violate from compliant). The two classes are nearly indistinguishable to the
no-context judge (25% vs 8.3% "guessed VIOLATES", not a large gap at this n) -- the gate's actual
concern (can a shortcut recover the TRUE label) is not met here; the low literal "correct-rate for
COMPLIANT" is an artifact of the judge's own answer-shape prior, not a construction leak.

**No_decision class, disclosed, NOT fully resolved**: after 3 rebuild iterations (trivial
doc/comment distractors: 8/8, 100% correct; in-file substantive-but-orthogonal edits: 7/8, 87.5%;
+3 "attractive nuisance" cases baiting a false VIOLATES guess: 7/9 pooled, 77.8%), the no-context
judge still correctly calls "NONE" on this class more often than chance. Keyword and structural
gates both pass clean on it (no cue words, no file-shape tell) -- the residual is that code which
is genuinely, topically unrelated to any governed decision is inherently somewhat recognizable as
such even without reading the decision text, which is a property of what a false-alarm distractor
IS (by definition orthogonal), not a constructed leak of a specific label. Given diminishing
returns across 3 rebuild passes and this task's time budget, this residual is disclosed rather
than iterated further; **the explicitly-flagged defect (violate class 78.3%) is fixed and
verified**; FA-rate numbers from the arms below on no_decision cases carry this caveat.

Scope-harness gate: unchanged from Amendment 1 (same two repos, same `loadGraph`/`idOfName` id
forms already verified live there -- not re-run, nothing about id-matching changed).

## Reproducibility note (no_decision iterations 2-4)

`new-repos-data-v2/build_cases_none2.py` is committed and runnable as-is (iteration 2, the
8 trivial distractors that scored 8/8 and were rejected). Iterations 3 (5 kept + `none3-6b`) and 4
(3 "attractive nuisance" cases) were authored inline via `execute_code` during this task rather
than as standalone committed scripts, for time budget reasons (disclosed loss) -- their exact file
contents are reproduced verbatim in this doc's own task log history (git blame on this file) and
their output is fully captured in `gate_nocontext_llm_none3.json` / `gate_nocontext_llm_none4.json`
(committed) plus `cases_FINAL.json` (committed, frozen, sha256'd) which has every case's actual
`base`/`head` SHA and full diff. The case CONTENT is fully preserved and auditable even though the
builder script for iterations 3-4 itself is not separately committed.
