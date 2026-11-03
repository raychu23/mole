// T80 review MEDIUM 3: a standalone worker process used ONLY by captured-arguments-lock.test.ts's
// concurrency stress test to spawn real OS processes against the same captured-arguments JSON file (a
// single Node process cannot race itself: the event loop is single-threaded, so the lock/race has to be
// exercised across real child processes, same convention as priorities-lock-worker.ts).
// argv: root decisionId argumentId approver
import process from 'node:process';
import { approveCapturedArgument } from '../src/index.js';

const [, , root, decisionId, argumentId, approver] = process.argv;
await approveCapturedArgument(root!, decisionId!, argumentId!, approver!);
