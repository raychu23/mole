# T67 prior art

## 1. @argdown/core (MIT, christianvoigt/argdown), the devDependency already pinned in
   packages/decisions/package.json — fetched 2026-11-03 by running the real parser locally
   (`node packages/decisions/probe*.mjs`, ArgdownApplication + ParserPlugin/DataPlugin/ModelPlugin,
   same plugin set test/argdown-parser.test.ts already uses for its oracle fixtures).
   - `[A]: a\n  - [A]\n` → real argdown-core emits one relation `{from: A, to: A, type: 'attack'}`.
     It does NOT drop the self-loop.
   - Also checked self-support (`[A]: a\n  + [A]`) and self-undercut (`<A>: a\n  <_ <A>`): both kept
     as `{from: A, to: A}` relations too. argdown-core treats all three relation kinds uniformly —
     it never special-cases `from === to`.
   - Borrow: parser.ts's `addRelation` must not drop `from === to`; dropping it is this parser's own
     bug, not something copied from the reference grammar it claims to subset.
   - Does not fit: nothing — this is a direct, mechanical parity fix (the parser's own stated design
     goal, per its header comment, is to match argdown-core's relation set exactly).

## 2. Caminada, M. "On the issue of reinstatement in argumentation" (JELIA 2006) + the complete-
   labelling definition it popularized — summarized via ORBilu "A Logical Account of Formal
   Argumentation" (orbilu.uni.lu/bitstream/10993/16339/1/labml.pdf, fetched 2026-11-03): a complete
   labelling requires `in` ⇔ all attackers `out`, and `out` ⇔ some attacker `in`. For an argument A
   whose only attacker is itself: A `in` ⇒ A `out` (contradiction, since A's one attacker, A, would
   have to be `out`, i.e. not `in`) and A `out` ⇒ A `in` (A `out` requires some attacker of A, i.e.
   A itself, to be labelled `in`) — both forbidden, so the only consistent label is `undecided`.
   - Borrow: a self-attacking argument with no other attacker is `undecided` under grounded, not
     `out`. This directly contradicts the parenthetical gloss in this task's own GOAL line
     ("a self-attacking argument is out under grounded") — see decision D1 below.
   - Does not fit: nothing additional needed; packages/reasoning's `runGrounded` (engine.ts) already
     implements this: `remaining(A)` is seeded to `attackersOf(A).size` (1, itself) and only
     decremented when an attacker becomes `out`; A's only attacker is A, which can never become
     `out` without first being `in`, so A is stuck `undecided` by construction. No algorithm change
     needed in packages/reasoning — confirmed by reading engine.ts's `runGrounded` (lines ~70-125)
     and tracing a single self-attacking node by hand.

## 3. ICCMA 2025 proceedings (argumentationcompetition.org/2025/iccma-25-proceedings.pdf, fetched
   2026-11-03 via web search), which is the actual competition whose solvers this package's own
   engine.ts doc comments already cite (carneades-4's dung.go, TweetyProject's SimpleGroundedReasoner
   — "see research memo §3/§5"). The proceedings' own notation: "IN(F) the set of arguments in the
   grounded extension, and UNDEC(F) the set of arguments which are neither in the grounded extension
   nor attacked by it" (i.e. OUT(F) = attacked by an IN argument; everything else, including a
   self-attacker whose only attacker is never IN, is UNDEC by this definition too).
   - Borrow: this is the second independent primary source (after #2) confirming the self-attacker
     case lands in UNDEC, not OUT, under the actual grounded-semantics reference this engine targets.
   - Does not fit: n/a.

## 4. carneades-4 (github.com/carneades/carneades-4), named directly in engine.ts's own doc comment
   as the reference implementation's dung.go:GroundedExtension — NOT RUN: no local Go toolchain/
   binary available in this worktree and no network access to build or fetch the compiled solver, so
   its output was not independently executed. Relied on #2/#3 (both primary, both specific to the
   UNDEC/OUT distinction) instead, and on direct inspection that engine.ts's own `runGrounded` already
   matches their definitions mechanically. Recorded here as NOT RUN with reason, per project rules,
   rather than fabricating a Carneades CLI transcript.

## Decision D1 (recorded, this task)
GOAL's parenthetical "(a self-attacking argument is out under grounded)" is corrected by evidence
#2/#3 above: a self-attacking argument with no other attacker is **undecided**, not out, under
rigorous Caminada/ICCMA grounded semantics — and packages/reasoning's existing `runGrounded` already
implements this correctly (no change needed there). This task's actual, testable bar is DONE-WHEN #3:
"grounded label matches the Carneades/ICCMA reference on fixtures" — satisfied by `undecided`, backed
by two independent primary sources, not by inventing an `out` result the literature does not support.
A self-attacker that *also* attacks another node B leaves B undecided too (B's only attacker, the
self-attacker, can never become `out`) — this is Dung's own documented "self-defeat poisons anything
it attacks" phenomenon (Baumann/Spanring/Woltran AAAI-20 "Revisiting the Foundations of Abstract
Argumentation", informatik.uni-leipzig.de/~baumann/papers/AAAI-20-GMR.pdf, fetched 2026-11-03),
not a bug in this fix.
