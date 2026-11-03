# T72-okf-export prior art

## 1. Queries tried (web_search, 2026-11-03)

- `"Open Knowledge Format" agent memory spec provenance trust freshness lifecycle attestation`
- `"Open Knowledge Format" 0.2 spec github agent`
- `"Agent Trace" format spec agent memory provenance`

## 2. What exists, fetched and dated

1. **Open Knowledge Format (OKF) v0.2** — the real spec D62/the task's five questions
   (provenance/trust/freshness/lifecycle/attestation) are quoted from, verbatim.
   - Spec: `https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md`
     (also mirrored at `github.com/GoogleCloudPlatform/open-knowledge-format`).
   - Fetched 2026-11-03T08:55:42Z via `curl` of the raw file
     (`raw.githubusercontent.com/GoogleCloudPlatform/knowledge-catalog/main/okf/SPEC.md`,
     1006 lines, 37748 bytes); saved verbatim at
     `tasks/T72-okf-export/4 log/okf-spec-v0.2.md` for this task's own record.
   - Announcement: Google Cloud Blog, "OKF v0.2 adds trust signals"
     (`cloud.google.com/blog/products/data-analytics/okf-v0-2-adds-trust-signals`),
     read 2026-11-03.
   - Independent write-up confirming the same field names: William Lyon, "Google's Open
     Knowledge Format Meets Neo4j" (`lyonwj.com/blog/google-okf-neo4j-knowledge-graph`),
     read 2026-11-03.
   - Reference validator (stdlib-only Python, no deps): `lorsabyan/okf-skill`
     `okf/scripts/validate_okf.py`, fetched 2026-11-03T08:5x via
     `raw.githubusercontent.com/lorsabyan/okf-skill/main/okf/scripts/validate_okf.py`
     (684 lines); copied into this task's log as the external round-trip consumer (§4
     below). Exit 0 = conformant, `--strict` turns warnings into errors.
2. **Agent Trace** (`agent-trace.dev`, `github.com/cursor/agent-trace`) — a different,
   real spec also surfaced by the search, but scoped to attributing *code* contributions
   (human vs. AI) in version-controlled codebases, not decision-record provenance/trust/
   freshness/lifecycle/attestation. D62 says Mole already "keeps reading Agent Trace"
   elsewhere (code attribution) — out of this task's boundary (packages/decisions export,
   not code-authorship tracing). Not used here.

No fabrication was needed: OKF v0.2 is real, versioned, and its field names
(`sources`, `generated.by`/`generated.at`, `verified[].by`/`verified[].at`, `status`,
`stale_after`, `type`, actor convention `human:<id>` / `process:<id>` / `<producer>/
<version>`) come straight from SPEC.md §4, §5, §7, §12 — quoted below where used.

## 3. OKF v0.2 field names actually used (SPEC.md section refs)

| OKF field (§) | Meaning | Mole source |
|---|---|---|
| `type` (§4.1, REQUIRED) | kind of concept | `Mole ${node.kind}` (e.g. `Mole Decision`) — producer-chosen string, spec explicitly leaves `type` un-registered |
| `title` (§4.1) | display name | `node.title` |
| `resource` (§4.1, §6.2) | canonical URI/path of the underlying asset | the record's own repo-relative `file` |
| `status` (§5.4, lifecycle) | `draft \| stable \| deprecated` | mapped from `node.status` (see §5 below; INFERENCE, lossy) |
| `sources[]` (§5.1, provenance) | materials a concept derives from | `node.source` (origin doc) and `node.evidence` (test/incident anchors) — see §5 |
| `generated.by` / `generated.at` (§5.2, trust) | who/when produced the content | `node.approver` (actor) / git commit date resolved from `node.confirmed` or the file's last commit |
| `verified[].by` / `verified[].at` (§5.2, trust) | who/when confirmed it | present only when `node.approver` is set (an approved decision *is* a human-reviewed one) |
| extension key `mole_status` | OKF §4.1 "Extensions: producers MAY include any additional keys" | the original Mole status string, so the lossy §5.4 mapping is never destructive |

Nothing above is an invented field: every key is either required/recommended/optional
in SPEC.md §4-§7, or an explicitly-sanctioned producer extension (§4.1's own
"Extensions" clause).

## 4. Round-trip / external consumer

`okf/scripts/validate_okf.py` (lorsabyan/okf-skill, stdlib-only, no deps) is run against
every exported bundle in the test suite (`npx vitest run packages/decisions -t okf`) as
the external validator called for by the task's done-when #3. It is not NOT RUN: python3
is available in this environment and the script needs no install. See
`tasks/T72-okf-export/2 insights.md` for the pass/fail evidence.

## 5. What we borrow / what does not fit

- **Borrow as-is**: `sources`, `generated`/`verified` trust family, `status` lifecycle
  values, the actor convention, extension keys, `okf_version` on a bundle-root
  `index.md` (§12). These map cleanly onto Mole's existing `GraphNode` fields with no
  new vocabulary.
- **Does not fit, left out, not invented**:
  - `stale_after` (§5.5): Mole decision records carry no staleness horizon field
    anywhere in `GraphNode`/`capture/records.ts`; there is nothing to derive it from, so
    it is omitted rather than guessed.
  - The **Attested Computation** concept type and its `runtime`/`parameters`/
    `executor`/`attester` contract (§10) is OKF's literal "attestation" family, but it
    describes a *sanctioned, re-runnable computation* (SQL/dbt/Python with typed
    parameters) — Mole decision records have no computation to re-run. The task's own
    done-when phrase ("evidence->attestation") is read as: Mole's nearest evidence-backed
    analog is `node.evidence` (test/incident anchors a decision cites as support), which
    is exposed through OKF's real `sources[]` family (§5.1, "materials a concept derives
    from") rather than through an invented bespoke "attestation" key. This is the
    documented INFERENCE/lossy point (see insights.md).
  - Mole's richer `EdgeType` graph (supersedes/overrides/amends/...) has no OKF
    equivalent beyond plain markdown links (§6.1, "the specific kind... is conveyed by
    the surrounding prose, not by the link itself"); edges are rendered as plain body
    links, not a new frontmatter field.
