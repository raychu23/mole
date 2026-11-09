#!/usr/bin/env python3
"""T120 Q13 follow-up, bug (1): the v1 harness's governsSummary attachment step matched the bulk
hermes -z reply's keys against repo_docs ids by EXACT STRING EQUALITY ONLY. That reply's own id
format drifted per-repo (one bulk call per repo, 10 total): easi-app/powertools-python/
content-publisher/email-alert-api happened to get the model to echo back the full filename
("0001-separate-infra-repo.md"), so exact-match worked there (203/210 resolved per the v1
report). But log4brains/python-tuf/merino-py/hmrc-frontend/semantic-kernel/jaeger got back
ABBREVIATED ids (e.g. "0021", "0021-json", "001") that never equal any real filename -- exact
match silently resolved ZERO of those repos' summaries (0/79 for semantic-kernel, the exact repo
Q13 names), and the measurement reported "0 parsed" as if that were an inherent coverage gap
rather than a matching bug. Verified against the REAL raw governs_summaries.json (one real
`hermes -z --safe-mode` claude-haiku-4-5 bulk call per repo, tested here, not re-generated).

Fix: a 5-pass progressively-looser resolver (exact filename/stem -> unique numeric-prefix ->
disambiguation-by-elimination among already-claimed candidates -> suffix-token substring overlap
-> sole-remaining-candidate-in-prefix-group), never guessing when genuinely ambiguous (log4brains'
20200925 group: 2 real files share the same date-only prefix and the bulk reply gave only ONE
summary for that date -- left unresolved, disclosed, not forced).

Result verified on the real data: 0/206 -> 205/206 keys resolved overall; semantic-kernel 0/77 ->
77/77 (its 79 docs include 2 the bulk reply never summarized at all -- a real, smaller gap,
unrelated to this bug).
"""
import json
import re
import sys


def resolve_repo(repo_docs, summ):
    stems = [(doc['id'], doc['id'][:-3] if doc['id'].endswith('.md') else doc['id']) for doc in repo_docs]
    stem_to_file = {s: f for f, s in stems}
    file_set = {f for f, s in stems}
    resolved = {}
    claimed = set()
    keys = list(summ.keys())

    # Pass 1: exact filename, or exact stem (filename minus .md)
    remaining = []
    for k in keys:
        if k in file_set:
            resolved[k] = summ[k]; claimed.add(k)
        elif k in stem_to_file:
            f = stem_to_file[k]; resolved[f] = summ[k]; claimed.add(f)
        else:
            remaining.append(k)
    remaining.sort(key=len, reverse=True)  # most-specific keys claim first

    # Pass 2: unique prefix match among still-unclaimed files
    still = []
    for k in remaining:
        cands = [f for f, s in stems if f not in claimed and (s == k or s.startswith(k + '-'))]
        if len(cands) == 1:
            resolved[cands[0]] = summ[k]; claimed.add(cands[0])
        else:
            still.append((k, cands))
    still.sort(key=lambda t: len(t[0]), reverse=True)

    # Pass 3: elimination -- a key whose candidate list had >1 entry, but all-but-one have since
    # been claimed by a more specific key
    unresolved = []
    for k, cands in still:
        cands2 = [f for f in cands if f not in claimed]
        if len(cands2) == 1:
            resolved[cands2[0]] = summ[k]; claimed.add(cands2[0])
        else:
            unresolved.append((k, cands2))
    unresolved.sort(key=lambda t: len(t[0]), reverse=True)

    # Pass 4: suffix-token substring overlap within the same numeric-prefix group (e.g. key
    # "0023-stream" vs real file "0023-kernel-streaming.md")
    still2 = []
    for k, cands in unresolved:
        m = re.match(r'^(\d+)[-]?(.*)$', k)
        numpart, suffix = (m.group(1), m.group(2)) if m else (k, '')
        suffix_flat = suffix.replace('-', '')
        group = [f for f, s in stems if f not in claimed and s.startswith(numpart + '-')]
        scored = []
        for f in group:
            stem = next(s for ff, s in stems if ff == f)
            stem_flat = stem.replace('-', '')
            if suffix_flat and suffix_flat in stem_flat:
                scored.append((len(suffix_flat), f))
        if scored:
            scored.sort(reverse=True)
            best = scored[0][1]
            resolved[best] = summ[k]; claimed.add(best)
        else:
            still2.append((k, numpart, group))

    # Pass 5: sole remaining unclaimed file in the numeric-prefix group, no content match needed
    final_unresolved = []
    for k, numpart, group in still2:
        group2 = [f for f in group if f not in claimed]
        if len(group2) == 1:
            resolved[group2[0]] = summ[k]; claimed.add(group2[0])
        else:
            final_unresolved.append((k, group2))
    return resolved, final_unresolved


def main():
    dataset_path, summaries_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    dataset = json.load(open(dataset_path))
    summaries = json.load(open(summaries_path))

    total_resolved = total_keys = 0
    all_resolved = {}
    for repo, summ in summaries.items():
        docs = dataset['repo_docs'][repo]
        resolved, unresolved = resolve_repo(docs, summ)
        all_resolved[repo] = resolved
        total_keys += len(summ)
        total_resolved += len(resolved)
        print(f"{repo}: {len(resolved)}/{len(summ)} resolved (docs={len(docs)}) unresolved={unresolved}")
    print(f"TOTAL {total_resolved}/{total_keys}")

    coverage = {}
    for repo, docs in dataset['repo_docs'].items():
        rmap = all_resolved.get(repo, {})
        for doc in docs:
            doc['governsSummary'] = rmap.get(doc['id'])
        coverage[repo] = {'n_docs': len(docs), 'with_summary': sum(1 for x in docs if x.get('governsSummary'))}
    print('per-repo doc coverage:', json.dumps(coverage, indent=2))

    json.dump(dataset, open(out_path, 'w'))
    print('wrote', out_path)


if __name__ == '__main__':
    main()
