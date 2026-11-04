// T87 review fix (MEDIUM): scripts/public-README.md's and site/index.html's demo transcript used hand-copied
// timing numbers (899 ms / 43 ms) that did not match the saved real transcript (418 ms / 46 ms) -- they had
// drifted from a stale hand-edit. This is the single source of truth both are derived FROM: parse the real,
// unedited transcript at `tasks/T87-public-release-site/4 log/demo-transcript.txt` (captured by running
// `npx -y mole-code demo` through a packed tarball in a clean install dir -- see that file's own header) and
// produce exactly what each consumer needs, so re-running sync-demo-assets.mjs after a fresh capture is the
// only way those numbers ever change again. Pure functions here (no fs) so the test file can exercise them
// directly against fixed transcript text.

/** The two "(... ms)" timings in the transcript, in the order they appear: [before-edit check, after-edit check]. */
export function extractTimingsMs(transcriptText) {
  const matches = [...transcriptText.matchAll(/\((\d+) ms\)/g)].map((m) => Number(m[1]));
  if (matches.length < 2) throw new Error(`expected 2 "(N ms)" timings in the transcript, found ${matches.length}`);
  return [matches[0], matches[1]];
}

const HEADER_WARNING_RES = [/ExperimentalWarning: SQLite/, /--trace-warnings/];
const TEMP_DIR_RE = /mole-demo-[A-Za-z0-9]+/;
const TAIL_START_RE = /^The sample repo is left on disk/;
// the one long transcript line the site/README demo block wraps at a fixed point for terminal-width display
const LONG_LINE_RE = /^(\s*src\/payments\/checkout\.ts:2 {2}import \.\.\/legacy-billing\/client\.js {2}breaks D001 "Payments never imports) (the legacy billing client directly" \(green accepted\))$/;

/** site/index.html's `LINES` array content: the real transcript, minus the node warning header and the
 * closing "sample repo is left on disk" tail (site is a 30s animation, not a how-to-clean-up guide) -- with
 * the one real temp-dir path genericized (a fresh run's temp dir name is not a meaningful part of the demo)
 * and the one over-wide line wrapped at the same point the original hand-written array used. Everything else
 * is the transcript's own text, unedited. */
export function deriveSiteLines(transcriptText) {
  const raw = transcriptText.replace(/\n$/, '').split('\n');
  const body = raw.filter((l) => !HEADER_WARNING_RES.some((re) => re.test(l)));
  const tailIdx = body.findIndex((l) => TAIL_START_RE.test(l));
  const withoutTail = tailIdx === -1 ? body : body.slice(0, tailIdx - 1); // drop the blank line right before the tail too
  const wrapped = [];
  for (const l of withoutTail) {
    const m = LONG_LINE_RE.exec(l);
    if (m) {
      wrapped.push(m[1]);
      wrapped.push(`   ${m[2]}`);
      continue;
    }
    wrapped.push(TEMP_DIR_RE.test(l) ? l.replace(/\/\S*mole-demo-[A-Za-z0-9]+/, '/tmp/mole-demo-XXXXXX') : l);
  }
  return ['$ npx -y mole-code demo', ...wrapped];
}

export function renderSiteLinesBlock(lines) {
  const body = lines.map((l) => JSON.stringify(l)).join(',\n');
  return `const LINES = [\n${body},\n];`;
}

export function updateSiteHtml(html, transcriptText) {
  const block = renderSiteLinesBlock(deriveSiteLines(transcriptText));
  const re = /const LINES = \[[\s\S]*?\n\];/;
  if (!re.test(html)) throw new Error('site/index.html: could not find `const LINES = [...]` block');
  return html.replace(re, block);
}

/** scripts/public-README.md's demo block keeps its own curated, shorter prose (it is not a 1:1 transcript
 * replay the way the site animation is) -- but the two timing numbers inside it are measured facts, not prose,
 * and must always be the transcript's own numbers. This only ever rewrites those two substrings. */
export function updateReadmeTimings(readmeText, transcriptText) {
  const [ms1, ms2] = extractTimingsMs(transcriptText);
  let seen = 0;
  const updated = readmeText.replace(/\((\d+) ms\)/g, (_m, _n) => {
    seen += 1;
    return `(${seen === 1 ? ms1 : ms2} ms)`;
  });
  if (seen !== 2) throw new Error(`expected 2 "(N ms)" timings in scripts/public-README.md, found ${seen}`);
  return updated;
}
