# Prior art: seeded crisp-trap benchmark construction

Goal of this note: find how others build tasks where an agent is likely to make a specific, pre-named
mistake (so blocking/verification mechanisms have something real to catch), as opposed to dcbench's
organic-gotcha design (results-v41.md, results-v42.md) which measured ~0% base rate for Mole's 2 crisp
`rules:` decisions (D-001 CalendarRange, D-005 PulseLoader) because nothing in those tasks' repos
actually primes the agent toward the deprecated choice.

## Sources (dated)

1. **Jimenez, Yang, Wettig, Yao, Pei, Press, Narasimhan — "SWE-bench: Can Language Models Resolve
   Real-World GitHub Issues?"** arXiv:2310.06770 (submitted 10 Oct 2023; ICLR 2024 Oral).
   https://arxiv.org/abs/2310.06770 / https://github.com/SWE-bench/SWE-bench
   Relevant idea: tasks are constructed from REAL repo state + a real issue, scored by hidden
   FAIL_TO_PASS/PASS_TO_PASS tests recovered from the actual merge commit — the "trap" (the bug) is
   not invented from nothing, it is already latent in the codebase the model is dropped into. Mole's
   seeded-trap design borrows the same structural idea (the mistake pre-exists in the repo state handed
   to the agent) without needing a real GitHub issue corpus for 2 tiny tasks.

2. **Patra & Pradel — "Semantic Bug Seeding: A Learning-Based Approach for Creating Realistic Bugs"
   (SemSeed)**, ESEC/FSE 2021. https://dl.acm.org/doi/10.1145/3468264.3468623 /
   https://www.software-lab.org/publications/fse2021.pdf
   Relevant idea: realistic seeded bugs are produced by IMITATING how a real bug occurred in similar
   code elsewhere, not by generic random mutation — realism comes from nearby-context analogy. This is
   the direct justification for T115's design choice: the deprecated pattern must already be visible in
   a SIBLING file the agent is likely to read/pattern-match against (not merely documented in an
   abstract rule), because that is what makes copying it "natural" rather than contrived.

3. **Ashik, Wang, Chen, Asaduzzaman — "When LLMs Lag Behind: Knowledge Conflicts from Evolving APIs in
   Code Generation"**, arXiv:2604.09515 (submitted 10 Apr 2026). https://arxiv.org/abs/2604.09515
   Directly motivates the "deprecated API" trap category itself: models carry stale/pretraining-era API
   knowledge that conflicts with a codebase's actual (evolved) convention. T115's traps are an in-repo
   instance of this same conflict, but seeded via LOCAL sibling-file precedent rather than relying on
   the model's global pretraining prior (which results-v42.md already showed is not enough on its own
   to produce dcbench's organic CalendarRange/PulseLoader mistakes at a usable rate).

4. **Microsoft Research / Foundry Labs — "BugPilot: Complex Bug Generation for Efficient Learning of
   SWE Skills"**, arXiv:2510.19898 (submitted ~13 Oct 2025). https://arxiv.org/abs/2510.19898 /
   https://microsoft.github.io/debug-gym/blog/2025/10/bug-pilot/
   Relevant idea: BugPilot has agents IMPLEMENT A FEATURE and lets bugs arise as an unintended
   side-effect of that normal feature work, explicitly contrasted with traditional synthetic-bug
   pipelines that "intentionally perturb the code" and produce out-of-distribution bugs unlike what
   models actually do. T115's tasks are feature-addition prompts (not "fix this bug" prompts) for the
   same reason: the crisp violation this benchmark cares about (copying a deprecated import) is a
   side-effect an agent can plausibly produce while doing ordinary, unrelated feature work, which is
   exactly the scenario Mole's D102 blocking exists for in production.

## Design decision this note supports

T115's seeded traps (SEED-001, SEED-002) each put TWO existing sibling files in the seed repo that
already use a deprecated helper/component with no in-file deprecation warning, then ask the agent to
add a THIRD, similar file and explicitly invite consistency ("formatted/shown the same way the other
components in this codebase do") without naming the decision or the deprecated symbol. This directly
targets queue item Q9's goal line: "tasks where the repo already contains a deprecated pattern an agent
would naturally copy," which is a different bet than dcbench's TASK-001/TASK-013 (those ask for a
NEW feature from scratch with no existing in-repo precedent for the deprecated symbol, which sources
#1-#4 above would all predict is a weak trap — consistent with the 0/16 base rate already measured).
