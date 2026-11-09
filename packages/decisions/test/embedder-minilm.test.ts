// T120c RED test: the local transformers.js (@xenova/transformers) MiniLM adapter -- a SEPARATE module from
// cascade.ts/route.ts so neither file (nor anything core dist/src/index.js re-exports) ever statically imports
// it; only cli.ts's --embed-route path reaches it, via a dynamic `await import()`. This repo does NOT install
// @xenova/transformers as a core dependency (bundle-size.md), so this test exercises the real, honest behavior
// in THIS environment: a clear, actionable error instead of a silent no-op or a crash with no explanation.
import { describe, expect, it } from 'vitest';
import { createMiniLmEmbedder } from '../src/cascade/embedder-minilm.js';

describe('createMiniLmEmbedder (T120c)', () => {
  it('returns an Embedder (embed() is a function) without importing the heavy dependency eagerly', () => {
    const embedder = createMiniLmEmbedder();
    expect(typeof embedder.embed).toBe('function');
  });

  it('embed() throws a clear, actionable error when @xenova/transformers is not installed (this repo\'s real state)', async () => {
    const embedder = createMiniLmEmbedder();
    await expect(embedder.embed(['hello world'])).rejects.toThrow(/@xenova\/transformers/);
  });
});
