// T104 db-migrations: `mole-server migrate` — run the versioned migrations (migrations/, via
// node-pg-migrate, see db.ts's runMigrations) standalone, outside of buildApp()/startServer().
// buildApp() already calls runMigrations(pool) on every start (src/index.ts), behind the same
// session advisory lock (727001) this CLI uses — this is for an explicit pre-deploy migrate
// step (the common "run migrations in CI/a release job before traffic shifts" pattern used by
// node-pg-migrate's own CLI, Flyway, Rails, etc.) when you don't want to also start the HTTP
// server + queue workers just to apply pending migrations.
import { createPool, runMigrations, closePool } from './db.js';

async function main(): Promise<void> {
  const [, , command] = process.argv;
  if (command !== 'migrate') {
    process.stderr.write(`usage: mole-server migrate\n`);
    process.exitCode = 1;
    return;
  }
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    process.stderr.write('DATABASE_URL is required\n');
    process.exitCode = 1;
    return;
  }
  const pool = createPool(dbUrl);
  try {
    await runMigrations(pool);
    process.stdout.write('migrations applied\n');
  } finally {
    await closePool(pool);
  }
}

// Only run when invoked directly (`node dist/src/cli.js migrate`), not when imported by tests.
import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    process.stderr.write(`${(e as Error).stack ?? e}\n`);
    process.exitCode = 1;
  });
}

export { main };
