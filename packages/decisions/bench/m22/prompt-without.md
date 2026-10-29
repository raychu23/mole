# Task: 5 "why" questions about an unfamiliar folder

You are new to the Backstage repository and have been asked why some code in `plugins/notifications` is written the way it is.

- A local clone is at `~/.hermes/cache/scratch/mole-builder-4/backstage` (commit e8c4d056e3c). It is a sparse checkout: only
  `docs/architecture-decisions` and `plugins/notifications` are on disk.
- Use only files in that clone. No web search, no network, no `git log`, `git grep` or anything that fetches more of the repository.
- Do not open any other folder on this machine (in particular not the Mole repository or anything named `bench`, `m22` or `answers`).
- Spend at most 10 minutes. A short answer is fine; say "don't know" rather than guess.

For each question give a 1-3 sentence answer that explains WHY, and the source you based it on (a repo-relative file path, for
example the decision record, or "code only" if you inferred it from the code).

## Questions

1. plugins/notifications/src/api/NotificationsClient.test.ts mocks the notifications backend with `setupServer()` and `http.get(...)` handlers instead of stubbing `fetchApi` or `fetch` directly. Why is the test written this way?
2. plugins/notifications/src/api/NotificationsClient.ts receives a `fetchApi` in its constructor (wired from `fetchApiRef` in src/plugin.ts) instead of importing an HTTP library such as node-fetch or cross-fetch. Why? Name the decision that applies today.
3. plugins/notifications/src/components/RelativeTime/RelativeTime.tsx handles timestamps with luxon's `DateTime` rather than Moment.js or a hand-written helper on `Date`. Why luxon?
4. Components in plugins/notifications/src/components (for example RelativeTime) are typed as plain functions taking a props object, never as `React.FC<Props>`. Why?
5. Each subfolder of plugins/notifications/src (api, hooks, components and each component folder) has its own index.ts, and src/index.ts re-exports from ./api, ./hooks and ./components instead of reaching into deeper files. Why is the package's public surface built through index files this way?

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
