// `mole coverage [file] [--session ID] [--weak] [--json]` (T35, M27): which agents cover which code, and where
// nobody does. D31: the decisions behind the code, shown where the developer already works -- this surfaces who
// touched a file, whether a human has looked since, what guards it and what decision governs it, at the command
// line the same way T34's VS Code panel and the MCP tool (mole_coverage) read it.
import { coverage, scanCoverage, type CoverageResult, type FileCoverage } from './index.js';

function formatFile(f: FileCoverage): string {
  const lines: string[] = [f.file];
  if (f.agents.length === 0) lines.push('  no agent session has read or edited this file');
  for (const a of f.agents) lines.push(`  ${a.harness} ${a.session.slice(0, 12)}  read=${a.read ?? '-'}  edited=${a.edited ?? '-'}  last=${a.last}`);
  lines.push(`  human last seen: ${f.human.lastSeen ?? 'never'}`);
  lines.push(`  guarding tests: ${f.tests.length ? f.tests.join(', ') : 'none'}`);
  lines.push(`  decisions: ${f.decisions.length ? f.decisions.map((d) => `${d.id}(${d.flag})`).join(', ') : 'none'}`);
  if (f.weak.is) lines.push(`  WEAK: ${f.weak.reasons.join('; ')}`);
  return lines.join('\n');
}

export async function coverageCli(pos: string[], flags: Record<string, string | true>, root: string): Promise<number> {
  const file = pos[0];
  const session = typeof flags.session === 'string' ? flags.session : undefined;
  const onlyWeak = flags.weak === true;
  const json = flags.json === true;

  if (file) {
    const r = await coverage(root, file);
    if (json) {
      console.log(JSON.stringify(r, null, 2));
    } else {
      console.log(formatFile(r));
    }
    return 0;
  }

  const scan: CoverageResult = scanCoverage(root);
  if (scan.notice) {
    console.log(scan.notice);
    return 0;
  }
  let files = scan.files;
  if (session) files = files.filter((f) => f.agents.some((a) => a.session.startsWith(session)));
  if (onlyWeak) files = files.filter((f) => f.weak.is);

  if (json) {
    console.log(JSON.stringify({ ...scan, files }, null, 2));
    return 0;
  }
  if (files.length === 0) {
    console.log(onlyWeak ? 'no weak spots found' : 'no files matched');
    return 0;
  }
  console.log(files.map(formatFile).join('\n\n'));
  if (scan.malformed) console.log(`\n(${scan.malformed} malformed log line(s) skipped)`);
  return 0;
}
