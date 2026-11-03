// T73 review 1 HIGH 2: a standalone worker process used ONLY by priorities.test.ts's concurrency tests to spawn
// real OS processes against the same .mole/priorities.md (a single Node process cannot race itself: the event
// loop is single-threaded, so the lock/race has to be exercised across real child processes).
// argv: root phase orderCsv [delayMs]
import process from 'node:process';
import { setPriorities } from '../src/index.js';

const [, , root, phase, orderCsv, delayMs] = process.argv;
if (delayMs) await new Promise((resolve) => setTimeout(resolve, Number(delayMs)));
await setPriorities(root!, phase!, orderCsv!.split(','));
