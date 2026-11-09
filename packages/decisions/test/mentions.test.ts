import { describe, it, expect } from 'vitest';
import { extractMentionedPaths, extractMentionedIdentifiers, dropCommonMentions } from '../src/route/mentions.js';

describe('extractMentionedPaths: path-shaped mentions in ADR prose, resolved against real repo files', () => {
  it('finds a path the ADR text names that also exists in the repo', () => {
    const text = '## Key files\n\n- `internal/controller/claw_providers.go` — the registry\n- `internal/controller/claw_models.go`\n';
    const repoFiles = ['internal/controller/claw_providers.go', 'internal/controller/claw_models.go', 'internal/other/unrelated.go'];
    expect(extractMentionedPaths(text, repoFiles).sort()).toEqual(['internal/controller/claw_models.go', 'internal/controller/claw_providers.go']);
  });

  it('drops a path-shaped mention that does not resolve to any real repo file (noise, e.g. a YAML example path)', () => {
    const text = 'See `config/example.yaml` for an illustration, not a real file in this repo.';
    expect(extractMentionedPaths(text, ['internal/controller/claw_providers.go'])).toEqual([]);
  });

  it('accepts a Set as well as an array for repoFiles (caller convenience)', () => {
    const text = 'Edit `pkg/foo/bar.go` to add the new type.';
    expect(extractMentionedPaths(text, new Set(['pkg/foo/bar.go']))).toEqual(['pkg/foo/bar.go']);
  });
});

describe('extractMentionedIdentifiers: backtick-coded symbol names in ADR prose', () => {
  it('finds backtick-fenced identifiers, including a call-shaped one, stripping the parens', () => {
    const text = 'The single `knownProviders` map replaces four others; see `buildProviderEntry()` for construction.';
    expect(extractMentionedIdentifiers(text).sort()).toEqual(['buildProviderEntry', 'knownProviders']);
  });

  it('drops short tokens and markdown-code-span stopwords (not real symbol names)', () => {
    const text = 'Set `id` to `true` and the `type` field is `none` by default.';
    expect(extractMentionedIdentifiers(text)).toEqual([]);
  });

  // Step B self-review (found during dev-recall measurement, 0 start.md): a real repo's ADRs commonly wrap an
  // ordinary English word in backticks for emphasis or to name a concept/field (`provider`, `domain`, `merge`,
  // `token`) -- NOT a reference to a specific code symbol. Treating those as identifier matches actively hurt
  // recall@1 on v4.1 dev (0.75 -> 0.594): nearly every claw-operator ADR discusses "provider" in prose, so the
  // match fired almost everywhere and drowned out the real signal.
  it('drops a plain, all-lowercase English word in backticks even if long enough and not a stopword (prose emphasis, not a symbol)', () => {
    const text = 'Each `provider` has a `domain` and the two configs `merge` before being written; see the `token` field.';
    expect(extractMentionedIdentifiers(text)).toEqual([]);
  });

  it('keeps a snake_case or SCREAMING_SNAKE_CASE token (unambiguous code shape even with no case transition)', () => {
    const text = 'The env var `OPENCLAW_PROXY_ACTIVE` and the helper `wire_token` both matter here.';
    expect(extractMentionedIdentifiers(text).sort()).toEqual(['OPENCLAW_PROXY_ACTIVE', 'wire_token']);
  });
});

describe('dropCommonMentions: corpus-level common-term filter (BM25F/IDF prior art)', () => {
  it('drops a mention that appears in MOST decisions in the corpus -- a project name, not a discriminating signal', () => {
    // self-review case (0 start.md "found (step B)"): `OpenClaw` (the repo's own product name) is named in
    // nearly every ADR AND nearly every diff comment -- treating it as a privileged match wrongly promoted the
    // wrong decision on a real v4.1 dev case.
    const perDoc = [
      { id: 'd1', mentions: ['OpenClaw', 'knownProviders'] },
      { id: 'd2', mentions: ['OpenClaw', 'deepMerge'] },
      { id: 'd3', mentions: ['OpenClaw'] },
      { id: 'd4', mentions: ['OpenClaw'] },
      { id: 'd5', mentions: [] },
    ];
    const out = dropCommonMentions(perDoc, 0.15); // max 1 doc at 5 docs total (floor(5*0.15)=0, floored to 1)
    expect(out.get('d1')).toEqual(['knownProviders']); // OpenClaw (df=4) dropped, knownProviders (df=1) kept
    expect(out.get('d2')).toEqual(['deepMerge']);
    expect(out.get('d3')).toEqual([]);
  });

  it('keeps a mention unique to exactly one decision in the corpus', () => {
    const perDoc = [
      { id: 'd1', mentions: ['uniqueToD1'] },
      { id: 'd2', mentions: [] },
    ];
    expect(dropCommonMentions(perDoc).get('d1')).toEqual(['uniqueToD1']);
  });
});
