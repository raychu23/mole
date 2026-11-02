# Graphiti deterministic candidate path

- Fetched: 2026-11-02
- URLs:
  - https://github.com/getzep/graphiti/blob/main/graphiti_core/utils/bulk_utils.py
  - https://github.com/getzep/graphiti/issues/1916
- Primary sources: upstream Graphiti source plus its public reproducibility bug
  report.
- Relevant behavior: exact normalized matching runs before the similarity
  candidate path; the implementation builds a MinHash index and resolves
  candidates. The public report identifies unstable set iteration on score ties.
- T51 fit: use deterministic 3-gram shingles, fixed hash seeds, LSH buckets,
  exact Jaccard scoring, and stable id ordering for ties. Unlike Graphiti,
  T51 only reports candidates: it never merges or rewrites duplicate records.
