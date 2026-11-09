# T112b-b2-grow -- prior-art / repo search log (dated 2026-11-08)

Goal of this log: show the actual search, not just the conclusion, per prior-art-first.

## Sources consulted (>=3, dated)

1. **2026-11-08, repo exclusion list** -- grepped every prior version's `build_common*.py` `REPOS`
   dict directly (`context/product-plan/systems/metrics-proof/m2-conflict/{v2,v3,v4,v4.1,v4.2}/`):
   `backstage`, `log4brains`, `python-tuf` (v2/v3), `easi-app`, `powertools-python` (v3), `claw-operator`,
   `handbook`, `merino-py`, `hmrc-frontend` (v4/v4.1/v4.2). 9 repos excluded going in.

2. **2026-11-08, web_search** -- queries: `"docs/adr" architecture decision records folder public repo`,
   `site:github.com "docs/architecture/decisions" ADR-0001 ADR-0010`, `"docs/adr" "0012-" github.com`,
   `real world examples architecture decision records repositories list`, `github.com docs/architecture/decisions ADR-0015`.
   Surfaced `backstage/backstage` (already excluded), `dotnet/reactive` (checked, rejected: 9 ADRs,
   below the >=10 floor), `archivematica/archivematica-architectural-decisions` (checked, rejected: docs-only,
   no source tree), `microsoft/semantic-kernel` (confirmed via API, kept), endjin blog post naming
   `dotnet/reactive` as a real OSS ADR user (led to the check above).

3. **2026-11-08, GitHub REST contents API** (unauthenticated, `api.github.com/repos/<repo>/contents/<path>`)
   -- ~45 repo+path guesses checked across two batches (hit the 60/hr unauth rate limit once, waited/
   switched approach). Full raw hit list:
   - `microsoft/semantic-kernel` `docs/decisions` -> 80 .md files (real ADRs; KEPT)
   - `jaegertracing/jaeger` `docs/adr` -> 15 .md files (real ADRs; KEPT)
   - `alphagov/content-publisher` `docs/adr` -> 16 .md files (real ADRs; KEPT)
   - `alphagov/email-alert-api` `docs/adr` -> 10 .md files (real ADRs; KEPT, exactly at floor)
   - `home-assistant/architecture` `adr` -> 22 .md files, but repo root is docs-only (no source code
     alongside); REJECTED (method needs a real diff against the repo's own current files)
   - `archivematica/archivematica-architectural-decisions` -> 17 files (12 real ADRs 0000-0012 +
     Jekyll/docs scaffolding); REJECTED, same reason (Jekyll site repo, no app source)
   - `openstatusHQ/openstatus` `docs/adr` -> 9 real ADRs (0000-0008); REJECTED, <10
   - `dotnet/reactive` (checked via browser, GitHub API rate-limited at that point) -> 9 real ADRs
     (0001-0009); REJECTED, <10
   - `alphagov/whitehall` `docs/adr` -> 9 real ADRs; REJECTED, <10
   - `json-schema-org/community` `docs/adr` -> 2 real decisions; REJECTED, <10
   - `alphagov/content-store` `docs/adr` -> 1 file; REJECTED
   - `alphagov/account-api` `docs/adr` -> 4 files; REJECTED
   - `alphagov/govuk_publishing_components` `docs/adr` -> 2 files; REJECTED
   - ~30 other blind guesses (`wiremock`, `cert-manager`, `flux2`, `mimir`, `besu`, `18F/identity-idp`,
     `cloudquery`, `coder`, `temporalio/temporal`, `dapr`, `ethyca/fides`, `aws-sdk-go-v2`, `nodejs/node`,
     `npm/cli`, `opensearch-project/OpenSearch`, `sourcegraph`, `prisma`, `next.js`, `deno`, `bun`,
     `tauri`, `pnpm`, `biome`, `ruff`, `slsa`, `grafana/grafana`, `loki`, `tempo`, `cosmos-sdk`, `kubo`,
     `go-libp2p`, `go-ethereum`, `prysm`, `lotus`, `cosmwasm`, `velero`, `kops`, `knative/serving`,
     `dagger`, `pack`, `faas`, `pulumi`, `spinnaker`, `opencost`, `vector`, `influxdb`, `questdb`,
     `timescaledb`, `trino`, `iceberg`, `delta`, `arrow`, `duckdb`, `risingwave`, `alphagov/publishing-api`,
     `collections`, `gov-uk-content-schemas`, `18F/C2`, `concourse`, `GSA/datagov-deploy`, `usdr-gost`,
     `caseflow`, `bcda-app`, `cloud-gov/pages-core`, `alphagov/content-tagger`, `search-api`,
     `asset-manager`, `signon`, `smart-answers`, `manuals-publisher`, `pagopa/io-backend`, `sul-dlss/argo`,
     `ssb-project-cli`, `NYPL-Simplified/circulation`) -> all HTTP 404 (path doesn't exist at that guess).

## Decision

4 repos selected (within the brief's 3-6 range): `microsoft/semantic-kernel`, `jaegertracing/jaeger`,
`alphagov/content-publisher`, `alphagov/email-alert-api`. See `../../../context/product-plan/systems/
metrics-proof/m2-conflict/v4.3/protocol_v4.3.md` section 1 for the final table and the disclosed
caveat (2 of 4 share the `alphagov` org with v4.2's `hmrc-frontend`, a different repo).
