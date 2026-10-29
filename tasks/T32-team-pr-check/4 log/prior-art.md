```notes
T32 prior art (R0, options round 2)      (mole-builder-6 · 2026-10-29)      read before any option was designed/tried
    scope                   "which published approach does record -> changed-lines matching the way this field already
                            studies it, and what do they report", before touching pr-check.ts again. 5 primary sources
                            fetched (web_search returned full abstracts/body text, not just titles); 2 Mole-repo precedents
                            read directly.

    1. traceability link recovery (IR: VSM/tf-idf, LSI, BERT)
       sources                Lohar/Amornborvornwong/Zisman/Cleland-Huang, "Improving Trace Accuracy through Data-Driven
                               Configuration and Composition of Tracing Features" (summarized via the VSM/LSI/IR-prob.
                               comparison, IEEE INFOCT 2019, doi.org/10.1109/infoct.2019.8710919, retrieved 2026-10-29) ·
                               Oliveto/Gethers/Poshyvanyk/De Lucia, "On the Equivalence of Information Retrieval Methods
                               for Automated Traceability Link Recovery" (ICPC 2010, cs.wm.edu/~dposhyvanyk/pubs/ICPC10-
                               traceability.pdf, retrieved 2026-10-29) · Lin et al., "Traceability Transformed" (T-BERT,
                               ICSE 2021, dl.acm.org/doi/10.1109/icse43902.2021.00040) and BTLink (Lin et al., Empirical
                               Software Engineering 2023, doi.org/10.1007/s10664-023-10342-7)
       reported numbers        2019 comparison: VSM and IR-probabilistic get HIGH precision / LOW recall; LSI gets low
                               precision AND low recall. ICPC 2010: "no clear winner among the experimented IR techniques"
                               (VSM ~ LSI ~ JS divergence, all in the same range). T-BERT (2021): +60.31% mean average
                               precision over VSM on issue-commit links, needs a pretrained transformer + fine-tuning.
                               BTLink (2023): pre-trained BERT beats heuristic rules on issue-commit recovery, same cost.
       fits this case?         Partly. The task is query(record text) -> changed-diff-lines, the same shape VSM/tf-idf
                               targets, and VSM's reported profile (precise, not very complete) is exactly what a
                               conservative title-term filter should look like: safe to add, won't invent new recall.
                               BERT/LLM-based options are explicitly out (non-goals: no paid API/model calls from Mole
                               code; a local embedding model is also heavier than this bench needs and unproven to beat
                               VSM here per the 2010 "no clear winner" finding).
       borrowed                standard VSM preprocessing (tokenize the query text, drop a FIXED stopword list, treat
                               what's left as the query terms) applied to each record's own `title` field (already in the
                               frozen overlay, no new authored data) as the vocabulary for a literal substring match
                               against diff text -> implemented as `titleTermsOf`/`hasTitleTerm` (options.ts).

    2. co-change mining (Zimmermann et al., ROSE)
       source                  T. Zimmermann, P. Weißgerber, S. Diehl, A. Zeller, "Mining Version Histories to Guide
                               Software Changes", ICSE 2004 / IEEE TSE 31(6) 2005 (thomas-zimmermann.com/publications/
                               files/zimmermann-icse-2004.pdf, retrieved 2026-10-29)
       reported numbers        association rules over "transactions" (files/functions changed together in one commit);
                               topmost-3 suggestions contain a correct further location >70% of the time across 8 OSS
                               projects; file-level correct-prediction rate 26%, function/variable-level 15% (TSE 2005).
       fits this case?         The *idea* transfers (what changed together with the decision's own origin should be
                               weighted as "really part of it"), but the *data* does not: an ADR/overlay record's
                               `source:` field in this bench is the REPO'S PINNED HEAD where the doc currently lives, not
                               the commit that introduced the decision, so finding the real "ADR-introducing" commit
                               needs `git log --follow` on the ADR doc path. Tried this for bs-adr015 and gi-0006 (the
                               two records with the worst false-positive rate): bs-adr015's introducing commit
                               (backstage@cdb683f4d8, "docs/adrs: adr 15 for loader structure") touches ONLY the ADR doc,
                               0 code files -> no co-change signal exists to mine. gi-0006's doc history runs past the
                               shallow clone's fetch boundary before reaching an originating commit. CONCLUSION (measured,
                               not assumed): co-change-at-ADR-authoring-commit is empirically inapplicable to this key's
                               ADR style (ADRs here are usually standalone prose commits, not landed with their first
                               implementing diff) -- not tried as an option; logging why instead of pretending to try it.
       borrowed                nothing implemented; the negative finding itself is the useful artifact (saves a future
                               round from re-trying the same empty well).

    3. scope globs / CODEOWNERS-style path patterns
       source                  GitHub Docs, "About code owners" (docs.github.com/en/enterprise-server@2.20/articles/
                               about-code-owners, retrieved 2026-10-29): gitignore-style patterns, "last matching pattern
                               takes the most precedence"
       fits this case?         Already the backbone of `scope:` (file / `path#Symbol` / `folder/`) and of
                               `codeowners.ts` (last-match-wins, already implemented pre-T32). The field's own failure
                               mode here is exactly a CODEOWNERS anti-pattern: a folder-level pattern is "too coarse" the
                               same way a bare `*` CODEOWNERS line is -- it owns everything under it, including things
                               the author never meant to flag. CODEOWNERS' own fix is a MORE SPECIFIC trailing pattern,
                               which requires new authored data per path (blocked here: scope is frozen, R2).
       borrowed                the diagnosis, not a new pattern: this is why option 3 narrows at the HUNK level (via
                               content, not a new path) rather than trying to write a narrower frozen `scope:` entry.

    4. symbol anchors / code anchoring (living documentation, renamed/moved lines)
       sources                 ast-grep structural anchors (coles.codes/posts/anchoring-specs-to-code-with-ast-grep,
                               retrieved 2026-10-29): "anchor by node kind and name... rides out any edit that keeps the
                               identifiers... rename the method and the rule stops matching, same as a stale line number
                               would" · drift (github.com/fiberplane/drift): doc<->code bindings keyed on `path#Symbol` +
                               an AST-fingerprint signature, same shape as this repo's own `path#Symbol` scope anchors ·
                               repowise DOC_DRIFT.md: a `symbol` reference is only trusted when git proves the name was
                               defined at the line the doc was written, and a rename re-attaches only to "exactly one new
                               symbol of the same kind whose name is close to the old one"
       fits this case?         Yes, and it's already built (T29/T32): `path#Symbol` anchors resolve via `symbolsOfText`
                               at both the head and the merge base (pr-check.ts `Symbols` class), and a rename-away is
                               reported `unanchored` (grey) rather than silently mis-re-attached or silently dropped --
                               matching the field's stated best practice (ast-grep: "a broken anchor there is the signal
                               I want rather than noise"; repowise: never silently guess). Mole's failure case (M24 done-
                               when 5) already encodes this. Nothing new to add here for THIS round: the 14 misses and 5
                               false hits are not rename/symbol-drift cases, they are (a) codebase-wide conventions with
                               no anchor at all (scope: [], by the overlay's own design) and (b) a folder anchor firing on
                               unrelated files under it. Symbol anchors don't apply to either.
       borrowed                nothing new; confirms the existing path#Symbol design already follows the field's
                               consensus (never silently re-attach a renamed symbol).

    conclusion going into the options                the only lever usable without touching the frozen key/overlay
                               (R2) is the matcher CODE's precision/recall behaviour on data already in those frozen
                               files (title, scope, status). IR/VSM-style literal term matching (source 1) applied to
                               `title` is the one with real traction (narrows false hits without new data); co-change-at-
                               authoring (source 2) is checked and found inapplicable; CODEOWNERS/scope-glob and symbol-
                               anchor precedents (sources 3-4) confirm the existing design already matches the field's
                               practice and don't suggest a further code-only change. -> one option implemented and
                               bench-scored below (4 log/runs.jsonl); see 2 insights.md for the result.
```
