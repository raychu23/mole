// T120c: the local transformers.js (@xenova/transformers) MiniLM adapter for cascadeCheck's embedBoost signal.
// Deliberately a SEPARATE module from cascade.ts/route.ts/cli.ts's own static import graph -- only
// cli.ts's `--embed-route` path reaches this file, via a DYNAMIC `await import()`, so the core dist bundle
// (dist/src/index.js and everything it statically imports) never grows just because this flag exists (see
// `tasks/T120-semantic-routing/4 log/bundle-size.md` for the measured before/after). `@xenova/transformers` is
// intentionally NOT a dependency of this package (it is a large, optional, native-addon-backed install) -- the
// module specifier below is a runtime string, not a static import, so `tsc` never requires it to be installed
// to typecheck this file; `npm install @xenova/transformers` is required only to actually call embed().
import type { Embedder } from './types.js';

const PKG = '@xenova/transformers';

type FeatureExtractor = (text: string, opts: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array | number[] }>;

async function loadExtractor(model: string): Promise<FeatureExtractor> {
  let mod: { pipeline: (...args: unknown[]) => unknown };
  try {
    mod = (await import(PKG)) as typeof mod;
  } catch (err) {
    throw new Error(
      `--embed-route needs "${PKG}" installed (npm install ${PKG} -w @mole/decisions) -- it is deliberately NOT ` +
        `a core dependency so the default build stays small. Original error: ${(err as Error).message}`,
    );
  }
  return (await mod.pipeline('feature-extraction', model)) as FeatureExtractor;
}

/** A feature-extraction pipeline, once constructed, is reused across every embed() call on the same Embedder
 *  instance (loading the model is the expensive part; this mirrors hermesLlmClient's own "configure once,
 *  call many times" posture). Mean-pooled, L2-normalized sentence embeddings (the model card's own recommended
 *  usage), same vector shape cosineSim in route.ts expects. */
export function createMiniLmEmbedder(model = 'Xenova/all-MiniLM-L6-v2'): Embedder {
  let extractorPromise: Promise<FeatureExtractor> | undefined;
  return {
    async embed(texts: string[]): Promise<number[][]> {
      if (!extractorPromise) extractorPromise = loadExtractor(model);
      const extractor = await extractorPromise;
      const out: number[][] = [];
      for (const text of texts) {
        const res = await extractor(text, { pooling: 'mean', normalize: true });
        out.push(Array.from(res.data as Iterable<number>));
      }
      return out;
    },
  };
}
