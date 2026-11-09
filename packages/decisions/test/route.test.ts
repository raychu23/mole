// T53 red tests: routeDecisions -- stage 1 (BM25, zero-LLM) narrows every candidate decision to its top-k lexical
// matches against the change text; stage 2 (one listwise LLM call, candidate SUMMARIES only) runs ONLY when
// stage 1 is not confidently ahead. Injectable LlmClient (fakes here), real client only in the bench script.
import { describe, expect, it } from 'vitest';
import { routeDecisions } from '../src/route/route.js';
import { indexTextOf, oneLineSummaryOf } from '../src/route/index-text.js';
import type { LlmClient } from '../src/compile/types.js';
import type { RouteDoc } from '../src/route/types.js';

function fakeLlm(response: string): { client: LlmClient; prompts: string[] } {
  const prompts: string[] = [];
  return { prompts, client: { complete: async (p: string) => { prompts.push(p); return { text: response, usage: { inputTokens: 50, outputTokens: 5, costUsd: 0.0003 } }; } } };
}

const DOC_EXPORTS: RouteDoc = { id: 'adr003', title: 'Avoid Default Exports', summary: 'Named exports only, no default exports.', text: 'avoid default exports prefer named exports barrel file reexport' };
const DOC_CATALOG: RouteDoc = { id: 'adr002', title: 'Default Software Catalog File Format', summary: 'Catalog entities must follow the schema.', text: 'software catalog file format entity schema yaml' };
const DOC_REACTFC: RouteDoc = { id: 'adr006', title: 'Avoid React.FC', summary: 'Do not use React.FC or React.SFC typings.', text: 'avoid react fc sfc typings functional component' };

describe('routeDecisions: stage 1 only (confident BM25 top pick, no LLM call)', () => {
  it('a change whose text clearly overlaps one decision routes to it with zero LLM calls', async () => {
    const { client, prompts } = fakeLlm('PICK: 1');
    const r = await routeDecisions({
      changeText: 'export default CopyTextButton; // new default export added to the barrel file index.tsx',
      decisions: [DOC_EXPORTS, DOC_CATALOG, DOC_REACTFC],
      llm: client,
    });
    expect(r.tier).toBe('bm25');
    expect(r.routed.map((c) => c.id)).toEqual(['adr003']);
    expect(prompts).toHaveLength(0);
    expect(r.usage).toBeUndefined();
  });

  it('a change with no lexical overlap with any decision routes to nothing', async () => {
    const r = await routeDecisions({ changeText: 'bump terraform aws_instance type to t3.large', decisions: [DOC_EXPORTS, DOC_CATALOG, DOC_REACTFC] });
    expect(r.routed).toEqual([]);
    expect(r.bm25Candidates).toEqual([]);
  });

  it('with no llm configured, an ambiguous case still returns the BM25 top candidate (never throws)', async () => {
    const r = await routeDecisions({ changeText: 'export default thing; format of this entity', decisions: [DOC_EXPORTS, DOC_CATALOG] });
    expect(r.tier).toBe('bm25');
    expect(r.routed.length).toBe(1);
  });
});

describe('routeDecisions: stage 2 (listwise LLM pick) runs only when stage 1 is ambiguous', () => {
  it('calls the LLM with candidate SUMMARIES only (never the full decision text)', async () => {
    const { client, prompts } = fakeLlm('PICK: 1');
    // ambiguous: change mentions terms from BOTH adr003 and adr006 with similar overlap
    const r = await routeDecisions({
      changeText: 'export default a react functional component, consider avoiding default export style here',
      decisions: [DOC_EXPORTS, DOC_REACTFC],
      llm: client,
      confidenceRatio: 100, // force ambiguous for this test regardless of the actual score gap
    });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain(DOC_EXPORTS.summary);
    expect(prompts[0]).not.toContain(DOC_EXPORTS.text); // full index text must never leak into the stage-2 prompt
    expect(r.tier).toBe('bm25+llm');
    expect(r.usage).toEqual({ inputTokens: 50, outputTokens: 5, costUsd: 0.0003 });
  });

  it('parses a multi-pick response into several routed candidates', async () => {
    const { client } = fakeLlm('PICK: 1, 2');
    const r = await routeDecisions({ changeText: 'export default a react fc component', decisions: [DOC_EXPORTS, DOC_REACTFC], llm: client, confidenceRatio: 100 });
    expect(r.routed.map((c) => c.id).sort()).toEqual(['adr003', 'adr006']);
  });

  it('PICK: NONE routes to nothing even though BM25 had candidates', async () => {
    const { client } = fakeLlm('PICK: NONE');
    const r = await routeDecisions({ changeText: 'export default a react fc component', decisions: [DOC_EXPORTS, DOC_REACTFC], llm: client, confidenceRatio: 100 });
    expect(r.routed).toEqual([]);
  });

  it('an unparsable LLM response never silently drops everything: falls back to the BM25 top candidate', async () => {
    const { client } = fakeLlm('I am not sure, sorry.');
    const r = await routeDecisions({ changeText: 'export default a react fc component', decisions: [DOC_EXPORTS, DOC_REACTFC], llm: client, confidenceRatio: 100 });
    expect(r.routed.length).toBe(1);
  });

  it('topK bounds how many BM25 candidates stage 2 ever sees', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, title: `decision ${i}`, summary: `summary ${i}`, text: `catalog entity format schema term${i}` }));
    const { client, prompts } = fakeLlm('PICK: 1');
    await routeDecisions({ changeText: 'catalog entity format schema', decisions: many, llm: client, topK: 3, confidenceRatio: 100 });
    // exactly 3 numbered candidates in the prompt, not 10
    expect(prompts[0]!.match(/^\[\d+\]/gm)?.length).toBe(3);
  });
});

describe('route API shape: ids + confidence + cost', () => {
  it('RouteResult reports a confidence number and ms always, cost only when the LLM stage ran', async () => {
    const r1 = await routeDecisions({ changeText: 'export default CopyTextButton barrel file', decisions: [DOC_EXPORTS, DOC_CATALOG] });
    expect(typeof r1.confidence).toBe('number');
    expect(typeof r1.ms).toBe('number');
    expect(r1.usage).toBeUndefined();

    const { client } = fakeLlm('PICK: 1');
    const r2 = await routeDecisions({ changeText: 'export default a react fc component', decisions: [DOC_EXPORTS, DOC_REACTFC], llm: client, confidenceRatio: 100 });
    expect(r2.usage?.costUsd).toBe(0.0003);
  });
});

describe('indexTextOf / oneLineSummaryOf: title + summary + rationale key terms, never the whole body', () => {
  const RECORD = [
    '---',
    'id: adr003',
    'title: Avoid Default Exports',
    'status: accepted',
    '---',
    '',
    '## Decision',
    '',
    'No default exports anywhere in src/. Use named exports only.',
    '',
    '## Context',
    '',
    'Default exports thwart IDE refactoring tools and promote typos in consuming code across the whole monorepo codebase here.',
  ].join('\n');

  it('includes the title and the first-paragraph summary', () => {
    const text = indexTextOf('Avoid Default Exports', RECORD);
    expect(text).toContain('Avoid Default Exports');
    expect(text).toContain('No default exports anywhere in src/');
  });

  it('is bounded well below the full rationale budget (index text is for ranking, not for reading)', () => {
    const longRecord = RECORD + '\n\n' + 'x'.repeat(10_000);
    const text = indexTextOf('Avoid Default Exports', longRecord);
    expect(text.length).toBeLessThan(2_000);
  });

  it('oneLineSummaryOf returns a short single line, falling back to the title when there is no summary', () => {
    expect(oneLineSummaryOf('Avoid Default Exports', RECORD)).not.toContain('\n');
    expect(oneLineSummaryOf('My Title', '')).toBe('My Title');
  });
});

// T118: routing recall fix -- B2 v4.2 miss analysis (all misses were routedCorrectly=false) found concrete cases
// where the TRUE decision carries a `scope:` glob that exactly matches the changed file's path (M2 v3 dev
// 'v3-pt-millisecond-compliant': pt-0002's scope `aws_lambda_powertools/utilities/**` matches the diff's touched
// file, but plain BM25 ranked it #6/7, just outside topK=5) while lexically weaker/unrelated candidates scored
// higher purely on prose-term overlap. Prior art (4 log/prior-art.md): RRF (Cormack et al. 2009) fuses two
// independently-scored rankings without needing comparable score scales; CODEOWNERS/Cursor rules use path globs
// as a routing signal. `scopeBoost` (opt-in flag, default off -- never changes existing behavior unless a caller
// asks) fuses BM25 rank with a path-glob-match rank via RRF: never excludes a candidate with no scope or no glob
// match (T49's recall-ceiling finding: a decision with no authored anchor must still get to compete).
describe('routeDecisions: scopeBoost (opt-in, RRF of BM25 rank + scope-glob-match rank)', () => {
  const DOC_SCOPED: RouteDoc = {
    id: 'pt-0002',
    title: 'Every millisecond counts',
    summary: 'Lazy imports only inside aws_lambda_powertools/utilities.',
    text: 'every millisecond counts lazy import performance cold start',
    scopeGlobs: ['aws_lambda_powertools/utilities/**'],
  };
  const DOC_UNSCOPED_STRONGER_LEXICAL: RouteDoc = {
    id: 'pt-0009',
    title: 'Logging format',
    summary: 'Structured JSON logging only.',
    // deliberately shares more raw tokens with the change text below than DOC_SCOPED does, so plain BM25 ranks
    // it #1 and DOC_SCOPED #2 -- the miss shape actually observed in baseline_recall.json.
    text: 'def get pandas import pandas as pd returned lazily only when this optional feature path is actually used',
  };

  it('without scopeBoost, a lexically weaker scoped candidate can still rank behind an unscoped one (baseline behavior, unchanged)', async () => {
    const r = await routeDecisions({
      changeText: 'def get_pandas():\n  import pandas as pd  # imported lazily, only when this optional feature path is actually used\n  return pd',
      decisions: [DOC_UNSCOPED_STRONGER_LEXICAL, DOC_SCOPED],
      topK: 1,
    });
    expect(r.routed.map((c) => c.id)).toEqual(['pt-0009']);
  });

  it('with scopeBoost + changedFiles, a scope-glob match promotes the true candidate via RRF even when its raw BM25 score trails', async () => {
    const r = await routeDecisions({
      changeText: 'def get_pandas():\n  import pandas as pd  # imported lazily, only when this optional feature path is actually used\n  return pd',
      decisions: [DOC_UNSCOPED_STRONGER_LEXICAL, DOC_SCOPED],
      changedFiles: ['aws_lambda_powertools/utilities/_lazy_import.py'],
      scopeBoost: true,
      topK: 1,
    });
    expect(r.routed.map((c) => c.id)).toEqual(['pt-0002']);
  });

  it('a scope glob that matches nothing never excludes a candidate that BM25 already found (recall-ceiling preserved, T49)', async () => {
    // DOC_SCOPED's scope glob (aws_lambda_powertools/utilities/**) matches NONE of this change's files, but its
    // text still has some lexical overlap with the change ('default' / 'export'), so plain BM25 alone would
    // have surfaced it (score > 0) -- scopeBoost must not knock it back out just because its scope didn't match.
    const r = await routeDecisions({
      changeText: 'export default CopyTextButton; // every millisecond counts here, lazy import performance matters',
      decisions: [DOC_SCOPED, DOC_EXPORTS],
      changedFiles: ['src/components/CopyTextButton.tsx'], // does not match aws_lambda_powertools/utilities/**
      scopeBoost: true,
    });
    expect(r.bm25Candidates.map((c) => c.id)).toContain('pt-0002'); // still present, just not boosted
  });

  it('scopeBoost with no changedFiles given is a no-op (falls back to plain BM25 order)', async () => {
    const r = await routeDecisions({
      changeText: 'def get_pandas():\n  import pandas as pd  # imported lazily, only when this optional feature path is actually used\n  return pd',
      decisions: [DOC_UNSCOPED_STRONGER_LEXICAL, DOC_SCOPED],
      scopeBoost: true,
      topK: 1,
    });
    expect(r.routed.map((c) => c.id)).toEqual(['pt-0009']);
  });

  // T118 self-review (adversarial check against B2 v3 dev's 'none' cases, 4 log/false_alarm_check_v3dev_none.mjs):
  // decision 0003 ("Use Go As Server Language", easi-app) declares `scope: [pkg/apperrors/**, pkg/**, cmd/**]` --
  // `pkg/**` and `cmd/**` are catch-all, single-literal-segment globs that match almost every file under those
  // top-level dirs regardless of what the change actually is. Naively boosting on raw match count routed 16/22
  // dev 'none' cases (changes that govern NO decision) to 0003 -- a concrete false-alarm regression. Fix: a
  // scope glob only counts toward the boost when its literal (non-wildcard) prefix names at least 2 path
  // segments -- `pkg/apperrors/**` (specific) counts, `pkg/**` (catch-all) does not. Same posture as the Cursor
  // rules prior art: scope narrowly to the folders a rule actually guards, not a whole top-level tree.
  it('a catch-all single-segment scope glob (e.g. "pkg/**") never wins the boost -- only a narrower, >=2-segment glob does', async () => {
    const DOC_CATCHALL: RouteDoc = { id: '0003', title: 'Use Go As Server Language', summary: 'Go only.', text: 'go golang server language runtime', scopeGlobs: ['pkg/apperrors/**', 'pkg/**', 'cmd/**'] };
    const DOC_UNRELATED: RouteDoc = { id: '0020', title: 'Some unrelated decision', summary: 'unrelated', text: 'some unrelated decision about caching redis session store' };
    const r = await routeDecisions({
      changeText: 'add a redis session cache helper',
      decisions: [DOC_UNRELATED, DOC_CATCHALL],
      changedFiles: ['pkg/session/cache.go'], // matches pkg/** (catch-all) but NOT pkg/apperrors/**
      scopeBoost: true,
      topK: 1,
    });
    expect(r.routed.map((c) => c.id)).toEqual(['0020']); // BM25's own pick, unmoved by the catch-all glob
  });
});

// T118 step B: real ADR corpora (v4.1/v4.2) carry ZERO scope: anchors (0/54 decisions, see 0 start.md) --
// scopeBoost is a provable no-op there. mentionBoost is a SEPARATE opt-in signal fed from text the ADR itself
// mentions (a "Key files" list, a backtick-coded identifier), extracted at load time by route/mentions.ts, not
// an author-declared field. Modeled directly on B2 v4.2's one miss type this DOES address (claw-0018: the ADR's
// own "Key files" section names `internal/controller/claw_providers.go`, the diff's exact touched file, but
// plain BM25 ranked a different, lexically-stronger decision first).
describe('routeDecisions: mentionBoost (opt-in, RRF of BM25 rank + ADR-text-mention-match rank)', () => {
  const DOC_MENTIONS_PATH: RouteDoc = {
    id: 'claw-0018',
    title: 'Centralized Provider Registry',
    summary: 'Single knownProviders map replaces four scattered maps.',
    text: 'provider registry centralized knownProviders buildProviderEntry deployment apply strategy',
    mentionPaths: ['internal/controller/claw_providers.go', 'internal/controller/claw_models.go'],
    mentionIdentifiers: ['knownProviders', 'buildProviderEntry'],
  };
  const DOC_UNSCOPED_STRONGER_LEXICAL: RouteDoc = {
    id: 'claw-0017',
    title: 'Some other decision',
    // shares more raw tokens with the change text below than DOC_MENTIONS_PATH does, so plain BM25 ranks it
    // #1 -- the miss shape actually observed (claw-0018 routed to 0017 in the real v4.2 run).
    summary: 'unrelated',
    text: 'provider extra header map variable declaration go language registry other',
  };

  it('without mentionBoost, a lexically weaker but path/identifier-matching candidate can still rank behind an unrelated one', async () => {
    const r = await routeDecisions({
      changeText: 'var extraProviderHeaders = map[string]string{"newprovider": "x-new-provider-key"}',
      decisions: [DOC_UNSCOPED_STRONGER_LEXICAL, DOC_MENTIONS_PATH],
      topK: 1,
    });
    expect(r.routed.map((c) => c.id)).toEqual(['claw-0017']);
  });

  it('with mentionBoost + changedFiles, a path the ADR text itself names promotes the true candidate via RRF', async () => {
    const r = await routeDecisions({
      changeText: 'var extraProviderHeaders = map[string]string{"newprovider": "x-new-provider-key"}',
      decisions: [DOC_UNSCOPED_STRONGER_LEXICAL, DOC_MENTIONS_PATH],
      changedFiles: ['internal/controller/claw_providers.go'],
      mentionBoost: true,
      topK: 1,
    });
    expect(r.routed.map((c) => c.id)).toEqual(['claw-0018']);
  });

  it('with mentionBoost, two or more identifiers the ADR text names appearing in the diff text also promotes the true candidate (a single identifier match alone is not enough -- see MIN_IDENTIFIER_MATCHES)', async () => {
    const r = await routeDecisions({
      changeText: 'knownProviders and buildProviderEntry are both bypassed here: var extraProviderHeaders = map[string]string{"newprovider": "x"}',
      decisions: [DOC_UNSCOPED_STRONGER_LEXICAL, DOC_MENTIONS_PATH],
      mentionBoost: true, // no changedFiles at all -- identifier-in-changeText signal alone still fires
      topK: 1,
    });
    expect(r.routed.map((c) => c.id)).toEqual(['claw-0018']);
  });

  it('a single identifier match alone is not enough evidence to promote a candidate (self-review: a lone shared word/name can be coincidence, e.g. a product name mentioned in unrelated prose)', async () => {
    const r = await routeDecisions({
      // the mentioned identifier 'knownProviders' appears only inside an unrelated longer token here
      // (zzzknownProviderszzz) so it contributes nothing to BM25's own lexical score either -- isolates
      // mentionMatchCount's identifier-floor behavior from BM25's own scoring.
      changeText: 'var extraProviderHeaders = map[string]string{"newprovider": "x-new-provider-key"} // zzzknownProviderszzz marker only, not a real token match',
      decisions: [DOC_UNSCOPED_STRONGER_LEXICAL, DOC_MENTIONS_PATH],
      mentionBoost: true, // only ONE identifier ('knownProviders', as a substring) appears -- below the floor
      topK: 1,
    });
    expect(r.routed.map((c) => c.id)).toEqual(['claw-0017']); // unchanged from the no-mentionBoost baseline
  });

  it('a decision with no mentionPaths/mentionIdentifiers never loses its BM25-alone candidacy (recall-ceiling preserved)', async () => {
    const r = await routeDecisions({
      changeText: 'provider extra header map variable declaration go language registry other, knownProviders nowhere here',
      decisions: [DOC_UNSCOPED_STRONGER_LEXICAL, DOC_MENTIONS_PATH],
      changedFiles: ['some/unrelated/file.go'],
      mentionBoost: true,
    });
    expect(r.bm25Candidates.map((c) => c.id)).toContain('claw-0018'); // still present, just not boosted
  });

  it('scopeBoost and mentionBoost both on fuse both signals (neither excludes the other)', async () => {
    const DOC_SCOPED_AND_MENTIONED: RouteDoc = { ...DOC_MENTIONS_PATH, scopeGlobs: ['internal/controller/**'] };
    const r = await routeDecisions({
      changeText: 'var extraProviderHeaders = map[string]string{"newprovider": "x-new-provider-key"}',
      decisions: [DOC_UNSCOPED_STRONGER_LEXICAL, DOC_SCOPED_AND_MENTIONED],
      changedFiles: ['internal/controller/claw_providers.go'],
      scopeBoost: true,
      mentionBoost: true,
      topK: 1,
    });
    expect(r.routed.map((c) => c.id)).toEqual(['claw-0018']);
  });
});
