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
