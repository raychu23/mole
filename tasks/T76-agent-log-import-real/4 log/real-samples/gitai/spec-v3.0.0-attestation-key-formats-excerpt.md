<!-- Source: https://github.com/git-ai-project/git-ai/blob/v1.7.5/specs/git_ai_standard_v3.0.0.md (fetched
     2026-11-03, pinned to the same v1.7.5 release this task's real samples came from). Cited by T76's review
     fix (gitai.ts isHumanRow): h_ keys are never composite and MUST correspond to metadata.humans, independent
     of whether the map happens to be present on a given note. -->

#### 1.2.3.1 Attestation Key Formats

There are three attestation key formats. Parsers MUST route each key to the correct metadata map based on its prefix:

| Key prefix | Lookup map | Format | Description |
|---|---|---|---|
| `s_` | `metadata.sessions` | `s_<14hex>::t_<14hex>` | AI session with per-checkpoint trace |
| `h_` | `metadata.humans` | `h_<14hex>` | Known human author |
| _(no prefix)_ | `metadata.prompts` | `<16hex>` | Legacy AI session (pre-v1.4.0) |

##### Session Keys (`s_` prefix)

Session attestation keys use a composite `session_id::trace_id` format:

- `s_` + 14 hex chars = **session ID** (deterministic, same for all checkpoints from one agent session)
- `::` = separator
- `t_` + 14 hex chars = **trace ID** (random, unique per checkpoint call)

**Session ID generation:** `"s_" + SHA256("<tool>:<conversation_id>")[0..14]`

**Trace ID generation:** `"t_" + 14 random hex chars`

To resolve an `s_`-prefixed key to its metadata: split on `::`, take the first part (the session ID), and look it up in `metadata.sessions`.

Session keys:
- MUST use the `s_` prefix
- MUST contain the `::` separator between session ID and trace ID
- MUST use the `t_` prefix for the trace ID portion
- MUST remain stable for the same AI session across checkpoints (the session ID portion)
- MUST generate a unique trace ID per checkpoint call

##### Human Keys (`h_` prefix)

Human attestation keys identify lines written by a known human author (as observed by an IDE extension):

**Human hash generation:** `"h_" + SHA256("<author_identity>")[0..14]`

Where `<author_identity>` is the git committer string (e.g. `"Alice Smith <alice@example.com>"`).

Human keys:
- MUST use the `h_` prefix
- MUST be deterministic for the same author identity
- MUST correspond to an entry in `metadata.humans`

##### Legacy Keys (no prefix)

Legacy attestation keys are bare 16-character hex strings used by versions prior to v1.4.0:
