```notes
T29 insights      (builder a6 · mole-builder-4 · 2026-10-29)      INFERENCE = agent choices made while Raymond is away (brief §8)
    0 assumptions (decided before the red commit, so the key and the code share one written rule set)
        format              .mole/decisions/*.md = YAML front matter (MADR-style) + markdown body      parser = `yaml` (eemeli/yaml, already in package-lock)
            fields          id · title · status (proposed | accepted | superseded | deprecated | rejected) · door (one-way | two-way)
                            traces_to [tenet or decision ids] · scope [path | path#Symbol | folder/] · supersedes · superseded_by · overridden_by · overrides
                            Kruchten relations: constrains · forbids · enables · subsumes · conflicts_with · comprises · alternative_to · cites
                            evidence [{test: path#name} | {incident: id}] · approver · confirmed (git sha the approver last confirmed) · source
        tenets              .mole/tenets.md: one `## tenet-N · text` heading per tenet      `retired` in the heading line → red
        intent              .mole/intent/<folder>.md front matter: folder · purpose · end_state · risk · ask · tenets      loaded as nodes (T30 reads them), no flag
        incidents           .mole/incidents/*.md front matter: id · date · fix · test · decisions      evidence_for the decisions it names
        public ADRs         also read Nygard / adr-tools / backstage records with NO Mole front matter: status from the `## Status` section
                            or backstage's `:::note[Superseded]` block + `[superseded]` in the title; relations only from the status section
                            ("Superseded by", "Supersedes", "Amended by", "Amends", links to other records there)      body links are NOT relations
                            reason: body mentions are context, not treatment (KeyCite flags treatment, not every citation)
        flags (first match wins: red > yellow > green/grey)
            red             status superseded/deprecated · superseded_by set or another ACCEPTED record supersedes it · every scope anchor gone (orphaned) · tenet retired
            yellow          a PROPOSED record supersedes / overrides / conflicts_with it · scope code changed since `confirmed` (normalized body hash, so whitespace + comment-only edits don't count)
                            some (not all) scope anchors gone · listed evidence missing (file or test name gone) or failing (only when a test report is given)
                            a record it traces_to / overrides / cites (or that it amends, adr-tools) is yellow or red      propagates to a fixed point
            green           accepted and none of the above      no scope or no evidence listed is NOT a flag (most public ADRs have neither)
            grey            proposed or rejected
            confirmed       missing → the last commit that touched the record file
        metric M21 scoring  recall = (scenario, record) pairs the key expects yellow/red that get exactly that colour
                            false flags = raised yellow/red flags the key does not expect / all raised flags (stricter than over all records; both reported)
                            records a scenario does not list keep their base label (base labels for every record are in the key)
    1 bench sources       ~/.hermes/cache/scratch/mole-builder-4/{backstage,govuk-aws} (blobless + sparse clones, gc.auto 0)
                            real history: backstage 3ecfb121859 (adr014 added, adr013 superseded) · govuk-aws 52979fc8 (0004 superseded by 0015)
                            `git log -S` on a blobless clone fetches every blob: never use it there (it hung 5 min)
```

```notes
    2 builder notes       (mole-builder-4 · 2026-10-29, written before the red commit; the key and the code follow them too)
        status words        accepted | approved → accepted · proposed | pending | draft → proposed (grey) · superseded… → red · deprecated → red · rejected → grey
                            "Partly superseded" (govuk-aws 0003) → yellow 'partly superseded' (not in section 0: a partial supersession is treatment, not removal)
        public ADR ids      leading `adrNNN` or `NNNN` of the file name (adr013-use-fetch.md and its rename adr013-use-node-fetch.md stay adr013)
                            an id already taken by another record → the repo-relative path is the id      files named *template*, index.md, README.md are not records
                            backstage records have no Status section → accepted unless `:::note Superseded` / `:::note[Superseded]` or `[superseded]` in the title
        relations           conflicts_with is symmetric (either side listing it counts)      supersedes / superseded_by both directions resolve to one edge
                            propagation ignores a parent's reasons that the child itself caused (a proposed record that overrides X must not turn yellow
                            only because it made X yellow)
        evidence            missing = test file gone, or the test name not present as a quoted string in it · incident id with no .mole/incidents file
                            failing = a vitest JSON report (--test-report) with a matching test (title, describe ancestor or full name) in status failed
        scope               path = file (normalized-content hash for .ts/.tsx/.js, whitespace-collapsed for others) · path#Symbol = @mole/memory symbol hash
                            folder/ = any tracked file under it changed (normalized); confirmed sha unknown to git → fallback to the record's last commit
        bench               the scenario repos copy Mole's live .mole/ records + a snapshot of their scope/evidence files (bench/corpora/mole, at 491dd7e)
                            so later edits to the real daemon don't move M21; public corpora are copied from the clones with a NOTICE
        test files          written with write_file/terminal heredoc as allowed; no approval gate hit (note only if one appears)
```

```notes
    2 builder notes (cont., after the red commit 53aafc6)
        correction          'test files … no approval gate hit' above was wrong: write_file WAS approval-gated for test files (unattended run),
                            so the 3 red test files were created with terminal heredocs (cat > file <<'EOF'), as the brief allows
        red commit          also carries what the bench needs to build and run: .mole/ records (the fixtures), package.json/tsconfig,
                            root tsconfig reference, package-lock (workspace link), a typed stub src/index.ts whose functions throw
        record lines        a Mole record's own line = 1 (the opening ---); a tenet's = its heading; an ADR reason sits on the status
                            sentence line (not the ## Status heading); identical reasons (same code + file:line) are kept once
        ids                 intent nodes are 'intent:<folder>'; a duplicate record id is a problem at file:line, the first record wins
        dogfood             right after the T29 wiring, `mole decisions --root .` shows 0007 and 0013 yellow: the one-line registration in
                            packages/daemon/src/cli.ts changed code in their scope after the records were committed. Correct by the rules;
                            Raymond clears it by setting `confirmed: <sha>` on 0007/0013 after reading the change (not done by the builder)
        machine load        full `npm run check` runs hit 5 s vitest timeouts in other packages at load average 90-100 (parallel builders);
                            logged as failures in runs.jsonl, never retried silently
```
