# Task: 5 "why" questions about an unfamiliar folder

You are new to the Backstage repository and have been asked why some code in `plugins/notifications` is written the way it is.

- A local clone is at `~/.hermes/cache/scratch/mole-builder-4/backstage` (commit e8c4d056e3c). It is a sparse checkout: only
  `docs/architecture-decisions` and `plugins/notifications` are on disk.
- Use only files in that clone and the annotated file tree below. No web search, no network, no `git log`, `git grep` or anything that fetches more of the repository.
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

## The annotated file tree for this folder

```text
Annotated file tree (Mole) for plugins/notifications: each folder's badge counts the decisions in force on it or below; [green] in force + checked, [yellow] needs a look, [red] replaced or broken. Cards list each folder's decisions (records in .mole/, mapped to Backstage's ADRs in docs/architecture-decisions).

(repo root)  [green] 8 decisions in force
  plugins/  [green] 8 decisions in force
    plugins/notifications/  [green] 7 decisions in force
      plugins/notifications/src/  [green] 6 decisions in force
        plugins/notifications/src/api/  [green] 2 decisions in force
        plugins/notifications/src/components/  [green] 3 decisions in force

plugins  (intent: .mole/intent/plugins.md)
Purpose: All plugin related code; the packages/ folder is reserved for core packages of Backstage (ADR011).
Decisions in force (1):
  ✓ adr003 Avoid default exports and prefer named exports · no test · plugins
      why: We will stop using default exports except when absolutely necessary (such as React.lazy modules). Named exports keep one name per symbol, so IDE rename, Find All References and grep work and re-exports do not conflict.

plugins/notifications  (intent: .mole/intent/plugins/notifications.md)
Purpose: Main frontend code of the notifications plugin (ADR011 naming, x = the frontend package; backend, node and common code live in sibling x-backend / x-node / x-common packages).
Decisions in force (7):
  ✓ adr004 Module export structure · no test · plugins/notifications/src
      why: Each exported symbol is traceable through index files all the way down to the root of the package, src/index.ts.
  ✓ adr006 Avoid React.FC and React.SFC · no test · plugins/notifications/src/components
      why: React.FC and React.SFC are avoided in new code: they add children props implicitly and do not support generic types on children; Facebook removed React.FC from the create-react-app base template.
  ✓ adr007 Use MSW to mock http requests · no test · plugins/notifications/src/api
      why: Any fetch or XMLHTTPRequest that happens in tests should be mocked by using msw (express-style route handlers), as react-testing-library suggests, instead of each test mocking network requests its own way.
  ✓ adr010 Use the Luxon date library · no test · plugins/notifications/src/components
      why: Luxon is the standard date library for core packages and plugins, for date manipulation or formatting the native Date cannot do easily.
  ✓ adr011 Plugin package structure · no test · plugins/notifications
      why: All plugin code lives in plugins/ (packages/ is for core packages). A plugin x has x (main frontend code), x-backend, x-react, x-node, x-common and optional modules, published as @backstage/plugin-x*.
  ✓ adr012 Use Luxon toLocaleString and date/time presets · no test · plugins/notifications/src/components
      why: Dates and times shown in the UI use toLocaleString with Luxon's presets instead of custom toFormat strings, so users read dates in their own locale's familiar format.
  ✓ adr014 Proper use of HTTP fetching libraries (native fetch) · no test · plugins/notifications/src/api
      why: Code that runs in Node.js uses the native fetch (Node.js 20+, undici based) and typeof fetch as the type; frontend plugins and packages prefer fetchApiRef; isomorphic packages accept an injected typeof fetch. Replaces ADR013 (node-fetch).
Replaced (1):
  ✗ adr013 [superseded] Proper use of HTTP fetching libraries (node-fetch) → replaced by adr014
```
