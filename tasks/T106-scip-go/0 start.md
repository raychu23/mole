# T106 scip-go

goal        Go repos get the same import/call checks as TypeScript and Python (D71 rank 1: languages)
status      merged a3ec8b4 (11-05) · review PASS deleg_b3fb4dbe · one LOW fixed before merge 61f823e
what        root cause of T95's "scip-go has no ranges": Mole's reader @c4312/scip predates the typed
            Occurrence.range oneof (scip PR #387) and dropped it · switched to the official @scip-code/scip 0.10.0
            (Apache-2.0) · occurrenceRange() reads typed + legacy forms
proof       packages/scip/test/fixtures/go/ indexed by real scip-go 0.2.9 (how: HOW-PRODUCED.md there)
            go-counterfixture.test.ts 9 + decisions rules-check-scip-go.test.ts 4 · Python fixtures byte-identical
            old lib 57/57 empty ranges vs new 57/57 typed (reviewer reproduced) · package slightly smaller
docs        docs/decisions-and-rules.md Limits
open        no test for a multi-line grouped Go import block (reviewer checked by hand: correct) · prior-art note not written
note        this folder was created 11-05 by the orchestrator; the builder left evidence only in the fixture + commit
