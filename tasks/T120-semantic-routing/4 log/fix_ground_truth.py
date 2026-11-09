#!/usr/bin/env python3
"""T120 Q13 follow-up, bug (2) -- found while diagnosing why semantic-kernel's R@1 stayed 0.000
even after bug (1)'s governsSummary fix: v1's own `gt_file` field (the labeled governing decision,
resolved by substring-matching each case's `decision_text` against fetched ADR file content, per
recall-dev.md's own disclosed method) matched the WRONG file for 12 of semantic-kernel's 16
non-none cases -- 5 distinct adr_ids (sk-0009, sk-0011, sk-0026, sk-0033, sk-0039, sk-0043) all
collapsed onto the SAME generic file "0001-madr-architecture-decisions.md" (a boilerplate
"we use MADR format" decision whose decision_text snippet was generic enough to substring-match
almost anything). Every recall@k measured against that wrong ground truth was scoring the router
against a target it was never supposed to hit -- semantic-kernel's reported 0.000 R@1 in v1 was
this artifact, not (only) a routing failure.

Fix: ignore the broken decision_text substring match; every case already carries its own
adr_id (e.g. "sk-0039"), whose numeric suffix maps unambiguously to a real repo file in all but
the handful of true shared-numeric-prefix cases (none of which appear in the actual case set).
Only apply the override where it is UNAMBIGUOUS (exactly one candidate file for that number) --
if ambiguous, leave gt_file as-is rather than guess.

Verified: 12 corrections, all in semantic-kernel. Re-ran recall after the fix: semantic-kernel
baseline R@1 goes from (bug-era) 0.000 to 0.375 -- which matches the B2 v4.3 bench's own
independently-reported 0.375 for semantic-kernel exactly (frozen `results-v4.3.md`), the strongest
available cross-check that the correction, not the original value, is the real number.
"""
import json
import re
import sys


def number_part(adr_id):
    m = re.search(r'(\d+)$', adr_id)
    return m.group(1) if m else None


def main():
    in_path, out_path = sys.argv[1], sys.argv[2]
    dataset = json.load(open(in_path))
    corrections = []
    for c in dataset['cases']:
        if c['adr_id'] == 'none':
            continue
        num = number_part(c['adr_id'])
        if num is None:
            continue
        ids = [x['id'] for x in dataset['repo_docs'][c['repo']]]
        cands = [i for i in ids if re.match(rf'^0*{int(num)}-', i) or re.match(rf'^0*{int(num)}\.md$', i)]
        if len(cands) == 1 and cands[0] != c['gt_file']:
            corrections.append({'case': c['id'], 'repo': c['repo'], 'adr_id': c['adr_id'],
                                 'old_gt_file': c['gt_file'], 'new_gt_file': cands[0]})
            c['gt_file'] = cands[0]
        # len(cands) == 0: no improvement possible (slug-id repos like log4brains -- already OK)
        # len(cands) > 1: genuinely ambiguous -- leave as-is rather than guess

    print(f"{len(corrections)} ground-truth corrections:")
    for x in corrections:
        print(' ', x)
    json.dump(dataset, open(out_path, 'w'))
    print('wrote', out_path)
    return corrections


if __name__ == '__main__':
    main()
