# Prior art — T111 incident-revival real-event eval (dated)

1. **Graphiti** (Apache-2.0, `main@16bf514`, v0.31.2) `get_edge_invalidation_candidates` —
   candidates for invalidation must share a node with the new event; similarity only ranks, never
   admits. Already cited as T58's own prior art (`tasks/T58-incident-dissent-revival/4 log/prior-art.md:12-16`,
   re-checked 2026-11-08 for this task: same repo/tag, no new release since T58).
2. Dung, "On the acceptability of arguments and its fundamental role in nonmonotonic reasoning, logic
   programming and n-person games," *Artificial Intelligence* 77:321-357, 1995 — grounded semantics
   (re-cited from `tasks/T58-incident-dissent-revival/4 log/prior-art.md:6`, `tasks/T68.../4 log/prior-art.md:19-22`,
   checked 2026-11-08: this task does not change the engine, only supplies new .mole records to it).
3. Robertson & Zaragoza, "The Probabilistic Relevance Framework: BM25 and Beyond," *Foundations and
   Trends in Information Retrieval* 3(4):333-389, 2009 — BM25 (k1 1.5, b 0.75) as the RAG-style baseline,
   same parameterization and role (ranking only, deterministic, no model call) as B2's own BM25 baseline
   (`context/product-plan/systems/metrics-proof/m2-conflict/v3/protocol_v3.md`, checked 2026-11-08) and
   M-A's own BM25 query (`context/product-plan/systems/metrics-proof/prelim-11-01/ma-objections/protocol.md:23`).
4. The three real-event sources used to build the frozen case set (each is the primary/semi-primary
   record of a real decision that was reversed by a real, dated, documented trigger — not a model's
   opinion of what happened):
   - npm, Inc., "kik, left-pad, and npm" (blog.npmjs.org/post/141577284765, 2016-03-23) and "Changes to
     npm's unpublish policy" (blog.npmjs.org/post/141905368000, 2016-03-29) — fetched 2026-11-08.
   - GitHub Changelog, "GitHub Actions – Updating the default GITHUB_TOKEN permissions to read-only"
     (github.blog/changelog/2023-02-02-..., 2023-02-02) and GitHub Security Lab / Palo Alto Networks,
     "The GitHub Actions Worm" (paloaltonetworks.com/blog/cloud-security/github-actions-worm-dependencies)
     as the documented incident motivating the change — fetched 2026-11-08.
   - PEP 479, "Change StopIteration handling inside generators" (peps.python.org/pep-0479, accepted
     2014-11-22, Final) — its own Rationale section quotes the real triggering bug report and the prior
     (reversed) behavior — fetched 2026-11-08.

## Explicit limitation carried into the protocol (stated up front, not discovered later)
None of these three real events has a formal, multi-party ADR with an on-record, named dissenting
argument the way `.mole/decisions` + `.mole/arguments` normally requires (unlike T58's python-tuf
ADR-0002 fixture). The "rejected option" in each case record is reconstructed from the SAME real,
dated, quotable source that reports the decision and the reversal (npm's own postmortem language,
GitHub's own changelog + the Security Lab's own research blog, PEP 479's own Rationale) — never
invented, but also never an independent dissenter's recorded quote the way Mole's mechanism is designed
to score. This is reported as a limitation of the case set, not glossed over (see protocol.md `limits`).
