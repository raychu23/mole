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

```notes
T32 prior art (R0, options round 3)      (mole-builder-10 · 2026-10-29)      read before any round-3 option was built;
                            round 2's prior-art.md (above) already covers IR/VSM, ROSE co-change, CODEOWNERS globs and
                            ast-grep/drift symbol anchors -- this section extends only the genuinely new ground the
                            task named: Dependabot/Renovate version-bump classifiers, and AST-level export-declaration
                            detection as a generalization of the symbol-anchor precedent to a different TS construct.

    5. dependency-bump classifiers (Dependabot, Renovate)
       sources                 GitHub Docs, "Dependabot options reference" (docs.github.com/en/code-security/
                               reference/supply-chain-security/dependabot-options-reference, retrieved 2026-10-29):
                               `update-types` classifies a bump by SemVer level (`semver-patch`/`-minor`/`-major`),
                               `dependency-type` by `development`/`production` · Renovate, "Automated Dependency
                               Updates for Terraform" (docs.renovatebot.com/modules/manager/terraform, retrieved
                               2026-10-29): the Terraform manager extracts a `depType` PER RESOURCE KIND the bump sits
                               in -- `helm_release` is its own named depType, distinct from `provider`,
                               `required_provider`, `required_version`, `tfe_workspace`, with NO depType at all for a
                               bare `locals`/`variable`/`output` block (those aren't dependency declarations).
       fits this case?         Confirms, from a second independent real tool (not just this bench's own title-term
                               heuristic), that "which resource TYPE a change sits in" is the field's actual
                               discriminator for whether a change is about a named dependency/technology at all --
                               exactly the gi-0006 false hit (an RBAC `locals` block in the same folder as, but not
                               the same resource as, the `helm_release` the ADR is about). Renovate's classifier is
                               per-FILE-TYPE (its Terraform manager only has these depTypes inside `.tf`/`.tofu`
                               files), matching this round's choice to scope option 6 to `.tf` files only, never TS.
       borrowed                the file-scoped, resource-kind-aware distinction itself (a `resource "type" {}` block
                               names a dependency/technology, a bare `locals`/`variable`/`output` block never does) ->
                               option 6 (`isTfBareBlock` + `fileHasTitledResource`): a folder/file scope anchor on a
                               technology-named record only requires a title-term match inside an untyped block, and
                               only when the FILE doesn't already declare a resource of that technology elsewhere
                               (the same file-level allowance a `helm_release` sitting beside unrelated `locals` in
                               one file would get from a human reviewer, or from Renovate's own per-manager grouping).

    6. AST-level declaration detection (generalizing source 4's symbol-anchor precedent to export statements)
       sources                 ast-grep structural anchors and drift (both already cited in round 2's source 4, re-
                               read for this specific question): an anchor is trusted only when the AST proves the
                               construct is actually there, never a text-position guess -- the same standard applied
                               here to a DIFFERENT TS construct than `path#Symbol` (a function/class/variable): the
                               `ExportDeclaration` node (`export { ... } from`, `export type { ... } from`,
                               `export * from`) and a top-level declaration carrying the `export` modifier.
       fits this case?         Directly: round 2 found the 14 misses are codebase-wide conventions with no path
                               anchor (bs-adr003/004, scope: [] by the overlay's own design, R2-frozen) and confirmed
                               title-term literal matching can't reach them (the title says "exports", the diff's
                               added lines are often just a bare identifier inside an already-open `export {` list,
                               with no literal "export" token on the changed line itself -- checked directly against
                               the real backstage diffs, e.g. #34892's `alpha.ts` adds
                               `MarketplaceAiResourceEntityV1alpha1,` to an export list whose `export type {` header
                               predates the PR). An AST pass finds this a different way: not by matching text, but by
                               asking the compiler "is this line part of an export statement, and if it's a whole
                               declaration, did its name exist before this diff." This needs the TypeScript compiler
                               (already a dependency, already used by `@mole/memory`'s symbol anchors) parsing the
                               file's OLD and NEW text -- no new authored per-record data, the same two AST shapes
                               checked for ANY record whose own title is itself about exports (reusing
                               `titleTermsOf`, source 1's already-approved generic IR extraction).
       checked against noise   before implementing, the candidate backstage PRs labeled NOT governed by bs-adr003/004
                               (#35205, #33441, #32593, #36254, #36475, #36472, #36489, #36501) were read diff-by-diff
                               (git show against the real clone) specifically for exported declarations: every one
                               only EDITS the body of an export that already existed before the PR (`export function
                               compileCatalogModel(` extended, `export class AzureBlobStoragePublish` methods
                               changed, etc.) -- confirming the "name already in the old file" exclusion is required,
                               not optional, before writing a line of the detector.
       borrowed                `exportConventionRanges` (options.ts): the two-shape AST detector above, gated to
                               records whose title itself names the export convention (`isExportConventionTitle`),
                               never to scope or an authored `match:` (content anchor) record, which stay strictly
                               more specific and always win.

    conclusion going into round 3      three code-only levers, none touching the frozen key/overlay (R2): option 4
                               (export-declaration AST detector, source 6) for recall on the scope:[] convention
                               misses; option 5 (comment-only-hunk and test-path exclusion for ANY folder/file/symbol
                               scope anchor -- a generic "decisions aren't about comments or test files" rule, not
                               tied to any one record, needed no further prior-art search beyond round 2's source 3/4
                               conclusion that the field's own fix for a too-coarse pattern is more specificity, and
                               the most generic specificity available without new scope data is "is this even
                               production code"); option 6 (source 5, Terraform resource-kind file gate) for the
                               remaining folder-anchor false hits. Results and the bench table: 4 log/runs.jsonl.
```
