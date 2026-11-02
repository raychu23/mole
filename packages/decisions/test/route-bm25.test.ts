// T53 red tests: the zero-LLM BM25 scorer alone (no routing/LLM logic here -- that's route.test.ts). Own ~60-line
// Okapi BM25 (prior-art.md: same k1=1.2/b=0.75 shape as wink-bm25-text-search, reimplemented so the tokenizer can
// be tuned to code-shaped text in place, no new runtime dependency).
import { describe, expect, it } from 'vitest';
import { Bm25Index, tokenize } from '../src/route/bm25.js';

describe('tokenize: code-shaped text (paths, camelCase, punctuation)', () => {
  it('splits paths on / . - _ and lowercases', () => {
    expect(tokenize('packages/core-components/src/CopyTextButton/index.tsx')).toEqual(
      expect.arrayContaining(['packages', 'core', 'components', 'src', 'copy', 'text', 'button', 'index', 'tsx']),
    );
  });
  it('splits camelCase boundaries', () => {
    expect(tokenize('exportDefaultCheck')).toEqual(['export', 'default', 'check']);
  });
  it('drops stopwords and single-char tokens', () => {
    const toks = tokenize('the catalog is a format for the entity');
    expect(toks).not.toContain('the');
    expect(toks).not.toContain('is');
    expect(toks).not.toContain('a');
    expect(toks).toEqual(expect.arrayContaining(['catalog', 'format', 'entity']));
  });
});

describe('Bm25Index: ranks documents by lexical overlap with the query', () => {
  it('a document containing the query term ranks above one that does not', () => {
    const idx = new Bm25Index();
    idx.add('d1', 'default exports are discouraged in this codebase, prefer named exports');
    idx.add('d2', 'software catalog file format must follow the entity schema');
    const hits = idx.score('export default CopyTextButton from the barrel file');
    expect(hits[0]!.id).toBe('d1');
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
  });

  it('term frequency saturates (k1): a doc repeating the term many times does not score unboundedly higher', () => {
    const idx = new Bm25Index();
    idx.add('once', 'react avoid react.fc react.sfc components');
    idx.add('many', 'react react react react react react react react react react avoid fc sfc');
    const hits = idx.score('react fc');
    const once = hits.find((h) => h.id === 'once')!;
    const many = hits.find((h) => h.id === 'many')!;
    // 'many' has more raw occurrences but BM25's TF term saturates; it must not be 10x 'once's score
    expect(many.score / once.score).toBeLessThan(3);
  });

  it('a rare term (low document frequency) scores higher (IDF) than a common term across the corpus', () => {
    const idx = new Bm25Index();
    idx.add('a', 'component component component rareterm');
    idx.add('b', 'component component component');
    idx.add('c', 'component component component');
    const hits = idx.score('rareterm');
    expect(hits[0]!.id).toBe('a');
    expect(hits[0]!.score).toBeGreaterThan(0);
  });

  it('returns a score of 0 (not an error) when the query shares no terms with any document', () => {
    const idx = new Bm25Index();
    idx.add('d1', 'default exports are discouraged');
    const hits = idx.score('completely unrelated terraform resource block');
    expect(hits[0]!.score).toBe(0);
  });

  it('empty index: score() returns no hits, never throws', () => {
    const idx = new Bm25Index();
    expect(idx.score('anything')).toEqual([]);
  });
});
