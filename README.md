# Mole

New chat startup: open this repository folder, then follow `AGENTS.md` → `context/0 start.md` + `context/1 takeaways.md` → selected task. Detailed history is on demand. Tested: a writable chat updated both condensed files after a synthetic correction, and a separate fresh chat recovered the change and reason without the answer in its prompt. The latest reader skipped the full global preference inbox and long logs. This is agent-managed turn-end maintenance, not an independent background service or a cross-host guarantee. Evidence: `context/systems/decision-sync-test.json`; earlier checks: `context/systems/startup-test.json`.

Visual codebase guidance and grounded, changing project knowledge. This is the actual Mole repository, linked to `https://github.com/raychu23/mole.git`. As of 2026-10-08 it contains organization and startup instructions; no application slice has been implemented here.

Start with [Mole context](</Users/a1/Desktop/CS Code/Project/Mole/context/0 start.md>) or its [readable page](</Users/a1/Desktop/CS Code/Project/Mole/context/doc.html>). The [source coverage index](</Users/a1/Desktop/CS Code/Project/Mole/context/4 log/0 coverage.md>) connects this conversation, older Mole/product-research chats and shared research. The context folder is a local link to the private, versioned workspace copy, not a second archive. The [first scenario task](</Users/a1/Desktop/CS Code/Project/Mole/current data/tasks/first scenario/0 start.md>) remains open. Shared development practices, tools, skills and evals are in [SDLC](</Users/a1/Desktop/CS Code/Project/sdlc/0-start.md>).

- `current data`: project brief/task/source-index routes; accepted state has one canonical home in `../Context/mole`.
- `training data`: historical source route. Reference material, not trained model weights.
- `generated data`: project run evidence; no application/eval results yet.
- `AGENTS.md`: task scope and startup instructions. `CLAUDE.md` points to the same contract.

These local context routes are ignored by Git and depend on this workspace. A remote clone does not receive the private chat archive or sibling SDLC folder. Before another machine/host works here, explicitly supply a reviewed, portable current packet. Automatic cross-host synchronization is not implemented.
