# T62 prior art — reasoning in the editor sidebar (fetched 2026-11-02)

```notes
source                                         what it says / does                                 we borrow / differ
VS Code UX guidelines, webviews.md             only use webviews when necessary · themeable         no NEW webview: one more section in the existing
  github.com/microsoft/vscode-docs/main/api/   (color tokens) · accessibility (contrast, ARIA,     T34 sidebar view · --vscode-* colors only · plain
  ux-guidelines/webviews.md (approved 10/28/26) keyboard) · don't repeat existing functionality     text lines, no colour-only meaning (state words)
VS Code UX guidelines, sidebars.md             "use good judgement … too much contributed UI can   one section, collapsed to 3 short groups (phase ·
                                               lead to a cluttered experience"                      incidents · proposals); empty groups hidden
tasks/T34-one-panel/4 log/prior-art.md         WebviewViewProvider + postMessage refresh; each      same section() wrapper; each sub-source fails alone
  (official webview-view-sample, GitLens-style) source wrapped so one failure blanks one section
argdown-vscode README (christianvoigt/argdown)  editor support for Argdown: live argument-MAP      differ: Mole shows the RESULT (which decisions hold
                                               preview, hover, outline, lint                        or flip, why) not the map; Argdown map preview stays
                                                                                                    the place to draw the graph (complementary)
T61 (this repo)                                same JSON for agents via MCP                         panel renders the same CLI JSON (stop row: a line
                                                                                                    that differs from the JSON = FAIL); proposal
                                                                                                    discovery moves to @mole/proposals (one source)
```
INFERENCE: no shipped IDE tool found that shows value-based (tenet-ranked) acceptability or proposal-vs-baseline
decision diffs; queries: "vscode extension architecture decision records panel", "argument map vscode", ADR Manager.
