# Task: 9 "why" questions about an unfamiliar repo's decision records

You are new to the Backstage repository. You have been asked 9 "why" questions about code in several folders under
`plugins/notifications`, `plugins/` and `docs/architecture-decisions`.

- A local clone is at `~/.hermes/cache/scratch/mole-builder-4/backstage` (commit e8c4d056e3c). It is a sparse
  checkout: only `docs/architecture-decisions` and `plugins/notifications` are on disk. Work inside that clone.
- Every question's answer is written down somewhere in `docs/architecture-decisions/*.md` (16 ADR files). The code
  itself does not explain any of these decisions in a comment -- you must read the ADR text, not guess from the code
  or the file/folder names{{TREE_HINT}}.
- No web search, no network, no `git log`, `git grep` or anything that fetches more of the repository than what is
  already on disk.
- Read ONE file per shell command (one `cat`, one `Read`); do not use wildcards, `cat *`, shell loops, or anything
  else that opens more than one file in a single command. Treat this the way you would a folder of hundreds of
  decision records in a real repo, where reading them all at once is not realistic.
- Do not open any other folder on this machine (in particular not the Mole repository or anything named `bench`,
  `m22`, `m22b` or `answers`).
- Spend at most 12 minutes. A short answer is fine; say "don't know" rather than guess at an ADR number.

For each question give a 1-3 sentence answer that explains WHY, and the source you based it on (the ADR file path,
for example `docs/architecture-decisions/adr014-use-fetch.md`, or "code only" if you inferred it from the code
without finding a record).

## Questions

1. {{q1}}
2. {{q2}}
3. {{q3}}
4. {{q4}}
5. {{q5}}
6. {{q6}}
7. {{q7}}
8. {{q8}}
9. {{q9}}

## Answer format

Reply with ONLY one JSON object as your final message, nothing else before or after it (no code fence, no
commentary):

```json
{
  "q1": { "answer": "...", "source": "..." },
  "q2": { "answer": "...", "source": "..." },
  "q3": { "answer": "...", "source": "..." },
  "q4": { "answer": "...", "source": "..." },
  "q5": { "answer": "...", "source": "..." },
  "q6": { "answer": "...", "source": "..." },
  "q7": { "answer": "...", "source": "..." },
  "q8": { "answer": "...", "source": "..." },
  "q9": { "answer": "...", "source": "..." }
}
```
{{TREE}}
