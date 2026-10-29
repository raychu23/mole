# Task: 5 "why" questions about an unfamiliar folder

You are new to the Backstage repository and have been asked why some code in `plugins/notifications` is written the way it is.

- A local clone is at `~/.hermes/cache/scratch/mole-builder-4/backstage` (commit e8c4d056e3c). It is a sparse checkout: only
  `docs/architecture-decisions` and `plugins/notifications` are on disk.
- Use only files in that clone{{TREE_HINT}}. No web search, no network, no `git log`, `git grep` or anything that fetches more of the repository.
- Do not open any other folder on this machine (in particular not the Mole repository or anything named `bench`, `m22` or `answers`).
- Spend at most 10 minutes. A short answer is fine; say "don't know" rather than guess.

For each question give a 1-3 sentence answer that explains WHY, and the source you based it on (a repo-relative file path, for
example the decision record, or "code only" if you inferred it from the code).

## Questions

1. {{q1}}
2. {{q2}}
3. {{q3}}
4. {{q4}}
5. {{q5}}

## Answer format

Write exactly one JSON object to `{{ANSWER_FILE}}` (create the folder if needed) and nothing else in that file:

```json
{
  "q1": { "answer": "...", "source": "..." },
  "q2": { "answer": "...", "source": "..." },
  "q3": { "answer": "...", "source": "..." },
  "q4": { "answer": "...", "source": "..." },
  "q5": { "answer": "...", "source": "..." }
}
```

Then reply with one line: `done <minutes spent>`.
{{TREE}}