// Builds tasks.json (what a participant sees) and keys.json (experimenter only) from the T4 ticket file.
//   TICKETS=<path to generated data/m15-tickets.json> node study/m15-learner/build-tasks.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const TICKETS = process.env.TICKETS ?? resolve(here, '../../../Mole/generated data/m15-tickets.json');
const tk = JSON.parse(readFileSync(TICKETS, 'utf8'));
const byId = new Map(tk.tickets.map((t) => [t.id, t]));

// Post-hoc audit from T4: JSX renders and callbacks-as-arguments are real second-level references the language-service filter dropped.
const ACCEPT = { T06: ['src/components/messageLine.tsx'], T07: ['src/components/streamingAssistant.tsx'] };

// Sets are matched on task type so each arm sees the same kinds of question; transfer tasks are 'who calls this' on different functions.
const SETS = { X: ['T05', 'T06', 'T11', 'T13'], Y: ['T04', 'T07', 'T12', 'T02'], TA: ['T01'], TB: ['T03'] };
const LIMIT_MIN = { callers: 4, impact: 8, importers: 4, 'call-path': 6 };

const plain = (t) => t.prompt.replace(/ \(ignore src\/__tests__ and any \*\.test\.\* files\)/, '').replace(/ \(ignore src\/__tests__ and \*\.test\.\* files\)/, '').replace(/Count only calls, not imports or mentions in comments\./, 'Count real calls, not imports or comments.');
const tasks = {};
const keys = { generatedFrom: tk.fixtureCommit, callGraph: tk.callGraph, tasks: {} };
for (const [set, ids] of Object.entries(SETS)) {
  tasks[set] = ids.map((id) => {
    const t = byId.get(id);
    keys.tasks[id] = { type: t.type, key: ACCEPT[id] ? { ...t.key, items: [...t.key.items, ...ACCEPT[id]] } : t.key };
    return { id, type: t.type, minutes: LIMIT_MIN[t.type], prompt: plain(t), answerFormat: t.answerFormat };
  });
}
writeFileSync(join(here, 'tasks.json'), JSON.stringify({ repo: 'ui-tui (hermes-agent), src/ only', commit: tk.fixtureCommit, sets: tasks }, null, 2) + '\n');
writeFileSync(join(here, 'keys.json'), JSON.stringify(keys, null, 2) + '\n');
console.log(Object.fromEntries(Object.entries(tasks).map(([k, v]) => [k, v.map((t) => `${t.id}:${t.type}`)])));
