# Task: 9 "why" questions about an unfamiliar repo's decision records

You are new to the Backstage repository. You have been asked 9 "why" questions about code in several folders under
`plugins/notifications`, `plugins/` and `docs/architecture-decisions`.

- A local clone is at `~/.hermes/cache/scratch/mole-builder-4/backstage` (commit e8c4d056e3c). It is a sparse
  checkout: only `docs/architecture-decisions` and `plugins/notifications` are on disk. Work inside that clone.
- Every question's answer is written down somewhere in `docs/architecture-decisions/*.md` (16 ADR files). The code
  itself does not explain any of these decisions in a comment -- you must read the ADR text, not guess from the code
  or the file/folder names and the annotated file tree below.
- No web search, no network, no `git log`, `git grep` or anything that fetches more of the repository than what is
  already on disk.
- Do not open any other folder on this machine (in particular not the Mole repository or anything named `bench`,
  `m22`, `m22b` or `answers`).
- Spend at most 12 minutes. A short answer is fine; say "don't know" rather than guess at an ADR number.

For each question give a 1-3 sentence answer that explains WHY, and the source you based it on (the ADR file path,
for example `docs/architecture-decisions/adr014-use-fetch.md`, or "code only" if you inferred it from the code
without finding a record).

## Questions

1. plugins/notifications/src/api/NotificationsClient.ts injects a `fetchApi` in its constructor and imports no HTTP library at all (no `fetch`, no `node-fetch`, no `cross-fetch`). One ADR in docs/architecture-decisions is specifically titled around node-fetch for exactly this kind of code. Is that ADR currently in force for this file? If not, which ADR replaced it, and what does that ADR say frontend plugins like this one should use instead?
2. plugins/notifications/src/api/NotificationsClient.test.ts mocks the backend with `setupServer()` and `http.get(...)` handlers rather than stubbing `fetchApi` or `fetch` directly. Which ADR requires this specific mocking approach for ALL tests in the repository, not just this plugin, and what two things does it say that approach avoids (compared to each test mocking network requests its own way)?
3. Every component under plugins/notifications/src/components (for example RelativeTime) is typed as a plain function taking a props object, never as `React.FC<Props>` or `React.SFC`. Name the two technical problems with `React.FC` that the governing ADR cites, and one concrete fact the ADR gives about why `React.FC` fell out of favor upstream.
4. plugins/notifications/src/components/RelativeTime/RelativeTime.tsx formats timestamps with luxon's `DateTime`, never Moment.js or a hand-written helper on `Date`. The ADR that mandates luxon names a specific alternative library it replaces and gives two separate reasons that library is being retired. Name that alternative library and both reasons.
5. plugins/notifications/src/hooks has its own index.ts that only re-exports from files directly inside src/hooks, and nothing outside src/hooks imports a hooks file by a deep path. Which ADR requires every exported symbol to be traceable through index files all the way to the package's root src/index.ts, and what question about the codebase was this rule specifically meant to make easy to answer?
6. Neither plugins/notifications/src/utils/notificationLinks.ts nor plainText.ts is re-exported by any index.ts in this plugin: there is no src/utils/index.ts, and src/index.ts never mentions either file. Applying the same module-export-structure rule you used for the previous question (not a different one), are these two files part of the plugin's public API, and why does the rule say so even though nothing marks them private?
7. plugins/notifications ships as a single package: there is no plugins/notifications-backend, notifications-react, or notifications-common alongside it in this plugin's family (even though the ADR describing plugin package structure defines those suffixes). What rule does that ADR give for when a `-react` package specifically becomes justified, and what would have to be true of this plugin's code before it needed one?
8. There is no `export default` anywhere in plugins/notifications/src; every export is named. The governing ADR allows exactly one case where a default export is 'absolutely necessary'. Name that one exception and the workaround pattern the ADR gives for teams who want to avoid even that exception.
9. plugins/notifications/dev/index.tsx wires up NotificationsPage directly rather than through any `loader:`/`component:` option object. A later ADR defines exactly that `loader`/`component` option pattern for providing JSX elements and components. Which ADR number is it, and what does its own 'Consequences' section say about whether the team will retrofit that pattern onto code written in the dev app's (pre-existing) style?

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

## The annotated file tree for plugins/notifications

```text
Annotated file tree (Backstage) for plugins/notifications: each folder's badge counts the decisions in force on it or below; [green] in force + checked, [yellow] needs a look, [red] replaced or broken. Cards list each folder's decisions (ADRs mapped 1:1 from docs/architecture-decisions).

(repo root)  [yellow] 8 decisions in force
  plugins/  [yellow] 8 decisions in force
    plugins/notifications/  [yellow] 7 decisions in force
      plugins/notifications/src/  [yellow] 6 decisions in force
        plugins/notifications/src/api/  [green] 2 decisions in force
        plugins/notifications/src/components/  [green] 3 decisions in force

plugins  (intent: .mole/intent/plugins.md)
Purpose: All plugin related code; the packages/ folder is reserved for core packages of Backstage (ADR011).
Decisions in force (1):
  ! adr003 Avoid default exports and prefer named exports · no test · plugins
      why: We will stop using default exports except when absolutely necessary (such as React.lazy modules). Named exports keep one name per symbol, so IDE rename, Find All References and grep work and re-exports do not conflict.
      ! scope packages/ no longer exists (.mole/decisions/adr003-avoid-default-exports.md:8)

plugins/notifications  (intent: .mole/intent/plugins/notifications.md)
Purpose: Main frontend code of the notifications plugin (ADR011 naming, x = the frontend package; backend, node and common code live in sibling x-backend / x-node / x-common packages).
Decisions in force (7):
  ! adr004 Module export structure · no test · plugins/notifications/src
      why: Each exported symbol is traceable through index files all the way down to the root of the package, src/index.ts.
      ! scope packages/core-components/src/ no longer exists (.mole/decisions/adr004-module-export-structure.md:8)
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

