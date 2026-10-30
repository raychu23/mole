# M29 bench corpora provenance

- `m29-speckit/`: `.specify/memory/constitution.md` and `specs/001-llm-perf-analytics/{spec,plan,research}.md` copied verbatim from
  github.com/mnriem/spec-kit-spring-react-demo @ 8ec8841a66c80b284d0053ba5f236154471bf5e2 (fetched 2026-10-29, MIT-style demo repo).
  `frontend/.gitkeep` and `src/main/resources/db/migration/.gitkeep` are placeholders standing in for real files/dirs the real
  repo has at those paths (confirmed present in the real repo's git tree at the same sha), so the importer's anchor-existence
  check resolves the same way it would against the real checkout.
- `m29-madr/docs/decisions/*.md`: copied verbatim from github.com/adr/madr @ ba75bb1b20d42af5746b246ad348c202419ae681
  (develop branch, fetched 2026-10-29). MIT license.
- `m29-adrtools/doc/adr/*.md`: copied verbatim from github.com/npryce/adr-tools @ b3279baf9be2207d1a4f4bbd608fd0b591c72aee
  (master, fetched 2026-10-29). GPL-licensed tool; only its own ADR *documentation* files are copied here (not its source).
