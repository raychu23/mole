---
task: T42-reasoning-engine
---
```notes
1  oracle parsing is where the real risk lived, not the algorithm.
   carneades-4's `dung` CLI prints the unique grounded extension double-bracketed
   ("[[3,1]]"/"[[]]") and the TGF importer (tgf.go:41) keys arguments by a node
   line's FIRST token only, silently discarding the human label on the same
   line -- so the CLI's own extension ids are the file's numeric ids, not the
   names a caller wrote. Naive "strip one bracket, split on comma" parsing
   produced silent, wrong-looking disagreements (a chain fixture reported
   ["2","A3"] instead of ["A1","A3"]) that were easy to misread as an engine
   bug. The actual bug was in my own tgf-label lookup: it kept scanning past
   the "#" separator and let edge lines ("1 2") overwrite node-label entries
   keyed by the same first token, silently corrupting the id->label map.
   Lesson for any future oracle-comparison script: print the RAW untouched
   oracle stdout next to the parsed result at least once per fixture while
   building the parser, and stop any line-oriented parser explicitly at a
   format's own section separator rather than trusting "doesn't look like a
   separator" heuristics on content you don't fully control.
2  "recompute only the affected component" has one clean invariant, not a grab
   bag of cases: for addAttack/removeAttack/addArg/removeArg, the only ids
   whose grounded label can change are those in the forward closure (via
   defeat edges) of a single seed set -- {to} for either attack edit, {id}
   for addArg, and the former effective targets of id for removeArg. Treating
   every id outside that closure as a fixed external fact (reusing its last
   cached label untouched) is enough to reproduce full evaluate() exactly,
   including the "an external attacker is already in -> force OUT immediately,
   bypassing the remaining-attacker counter" edge case that a naive port of
   the full BFS forgets (it only handles attackers becoming OUT via the BFS's
   own queue, never an attacker that was already IN before the edit touched
   this component at all). The 520-sequence randomized test checking equality
   after EVERY prefix op (not just the final state) is what caught this one.
```
