// Builds tasks.json (what a participant sees) and keys.json (experimenter only) from the T4 ticket file.
//   TICKETS=<path to generated data/m15-tickets.json> node study/m15-learner/build-tasks.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const TICKETS = process.env.TICKETS ?? resolve(here, '../../../Mole/generated data/m15-tickets.json');
const tk = JSON.parse(readFileSync(TICKETS, 'utf8'));
// Set X and Y each hold callers, impact and importers questions; X has a call-path question where Y has a second callers question (T13 is the only path ticket), so sets are NOT type-matched and the crossover counterbalancing has to carry that. Transfer tasks are 'who calls this' on functions that no set task touches.
const SETS = { X: ['T05', 'T06', 'T11', 'T13'], Y: ['T04', 'T07', 'T12', 'T02'], TA: ['T01'], TB: ['TX1'] };
// TX1 is not a T4 ticket: callers of hasSensitivePrompt (src/app/overlayStore.ts), picked because no set task touches that function.
// Key from the TypeScript language service (callSites in packages/daemon/bench/m15/truth.mjs), cross-checked with grep on commit e06df9c.
const EXTRA = { TX1: { id: 'TX1', type: 'callers', difficulty: 'medium', prompt: 'Which files under src/ contain a direct call to the function `hasSensitivePrompt` defined in `src/app/overlayStore.ts`? Count only calls, not imports or mentions in comments.', answerFormat: 'json array of repo-relative file paths, e.g. ["src/a.ts","src/b.tsx"]', key: { kind: 'set', items: ['src/app/useInputHandlers.ts', 'src/app/useMainApp.ts', 'src/app/usePet.ts'] } } };
const byId = new Map([...tk.tickets, ...Object.values(EXTRA)].map((t) => [t.id, t]));

// Post-hoc audit from T4: JSX renders and callbacks-as-arguments are real second-level references the language-service filter dropped.
const ACCEPT = { T06: ['src/components/messageLine.tsx'], T07: ['src/components/streamingAssistant.tsx'] };

const LIMIT_MIN = { callers: 4, impact: 8, importers: 4, 'call-path': 6 };

const plain = (t) => t.prompt.replace(/ \(ignore src\/__tests__ and any \*\.test\.\* files\)/, '').replace(/ \(ignore src\/__tests__ and \*\.test\.\* files\)/, '').replace(/production files/g, 'files').replace(/Count only calls, not imports or mentions in comments\./, 'Count real calls, not imports or comments.');
const tasks = {};
const keys = { generatedFrom: tk.fixtureCommit, callGraph: tk.callGraph, tasks: {} };
for (const [set, ids] of Object.entries(SETS)) {
  tasks[set] = ids.map((id) => {
    const t = byId.get(id);
    keys.tasks[id] = { type: t.type, key: ACCEPT[id] ? { ...t.key, items: [...t.key.items, ...ACCEPT[id]] } : t.key };
    return { id, type: t.type, minutes: LIMIT_MIN[t.type], prompt: plain(t), answerFormat: t.answerFormat };
  });
}
writeFileSync(join(here, 'tasks.json'), JSON.stringify({ repo: 'ui-tui (hermes-agent), src/ only', note: 'The study copy has all test files removed (README setup), so every file you can see is production code.', commit: tk.fixtureCommit, sets: tasks }, null, 2) + '\n');
writeFileSync(join(here, 'keys.json'), JSON.stringify(keys, null, 2) + '\n');
console.log(Object.fromEntries(Object.entries(tasks).map(([k, v]) => [k, v.map((t) => `${t.id}:${t.type}`)])));
