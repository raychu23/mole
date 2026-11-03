# T83 prior art (fetched and dated 2026-11-03)

1. **Kleppmann, Wiggins, van Hardenberg, McGranaghan — "Local-first software: you
   own your data, in spite of the cloud"** (Onward! 2019).
   https://martin.kleppmann.com/papers/local-first.pdf — fetched 2026-11-03
   (HTTP 200, PDF, 4.86 MB). Argues CRDTs/OT are the mechanism that lets
   *multiple concurrent editors* on *the same document* merge automatically
   without a server arbitrating — the use case CRDTs are *for* is frequent,
   fine-grained concurrent editing (e.g. two people typing in the same text
   field at once). It does not claim CRDTs are warranted wherever two people
   might touch the same file; the paper's own examples (Trello-like boards,
   real-time text editors) are all high-frequency multi-writer document edits.

2. **Automerge docs, "Hello, Automerge"** — https://automerge.org/docs/hello/
   — fetched 2026-11-03 (HTTP 200). Automerge is a JSON CRDT library: every
   field is independently mergeable, with last-writer-wins at the leaf level
   and array/text-specific merge algorithms. Designed to be embedded so an
   app never has to reason about merge conflicts; cost is a changelog/data
   format that is not plain git-diffable Markdown.

3. **Yjs docs** — https://docs.yjs.dev/ — fetched 2026-11-03 (HTTP 200).
   Same category as Automerge (CRDT framework, more common in rich-text /
   whiteboard collab editors e.g. real-time co-editing); also assumes a
   non-git-native storage/transport model (providers/awareness protocol) —
   adopting it for Mole's decision records would mean moving them out of
   plain Markdown-in-git into a CRDT document store, a materially bigger
   change than a merge driver.

4. **git-scm.com `gitattributes` docs** —
   https://git-scm.com/docs/gitattributes — fetched 2026-11-03 (HTTP 200).
   Documents `merge=<driver>` attributes and the `merge.<driver>.driver`
   config that invokes a custom 3-way merge command
   (`%O`/`%A`/`%B`/`%L` placeholders) per path pattern — the standard git
   mechanism for a field-level merge driver, should one turn out to be
   needed. `git merge-file` is the plumbing command the custom driver (or
   this spike's measurement script) calls to do the actual 3-way text merge.

## Takeaway before measuring

All three technologies (plain `git merge`, a custom merge driver, Automerge/
Yjs CRDTs) solve the *same* problem — reconciling two edits to the same
record made without seeing each other — but at increasing cost: a merge
driver needs no new storage format, just more merge logic; a CRDT needs a
new document format and sync layer. The paper's and both libraries' own
framing is that this cost is worth it when concurrent edits to the *same*
record are common. This spike measures whether that premise holds for
Mole's decision-record use case before picking a point on that cost curve.
