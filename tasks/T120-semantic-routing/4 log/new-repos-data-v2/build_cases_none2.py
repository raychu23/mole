import json, subprocess
from pathlib import Path

FEAST = Path("/Users/a1/.hermes/cache/scratch/t120c/feast")
PLEDGER = Path("/Users/a1/.hermes/cache/scratch/t120c/pledger-android")

def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo)] + list(args), capture_output=True, text=True, check=True).stdout.strip()

def write(repo, rel, text):
    p = repo / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)

def commit_case(repo, case_id, files_text, base_sha):
    git(repo, "checkout", "-q", base_sha)
    for rel, text in files_text.items():
        write(repo, rel, text)
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", f"t120-rebuild-case {case_id}")
    head = git(repo, "rev-parse", "HEAD")
    git(repo, "checkout", "-q", base_sha)
    return head

# T120 Amendment-2 rebuild v2: the first 8 no_decision distractors were too trivially off-topic (README/util/test
# edits) -- the no-context LLM gate correctly called 'NONE' on 8/8 (100%, CI entirely above chance), a one-class
# leak symmetric to the original violate-class failure. These replacements sit INSIDE the governed files/dirs
# themselves (same file the paired ADR governs, or its direct neighbor) but change nothing the ADR's own text
# actually speaks to -- harder for a no-context judge to confidently rule out.
cases = []

def none_case(id_, repo_key, repo, files_text):
    base_sha = git(repo, "rev-parse", "HEAD")
    head = commit_case(repo, id_, files_text, base_sha)
    cases.append({"id": id_, "repo": repo_key, "adr_id": "none", "label_constructor_intent": "no_decision", "base": base_sha, "head": head, "mode": "new"})

none_case("t120r-none2-1", "feast", FEAST, {
    "sdk/python/feast/infra/online_stores/online_store.py.appendix": (
        "# internal note: online_read/online_write_batch signatures are documented in the ADR-0009 design doc\n"
    ),
})
none_case("t120r-none2-2", "feast", FEAST, {
    "sdk/python/feast/examples/basket_affinity_notes.py": (
        "# scratch notes while iterating on basket_summary's schema; no code here is imported anywhere\n"
        "DRAFT_FIELD_NAMES = [\"basket_total\", \"basket_item_count\"]\n"
    ),
})
none_case("t120r-none2-3", "feast", FEAST, {
    "sdk/python/feast/examples/support_tickets_notes.md": (
        "# Support tickets feature service\n\nSee support_tickets.py for the duplicate_report_service definition.\n"
    ),
})
none_case("t120r-none2-4", "feast", FEAST, {
    "sdk/python/feast/infra/online_stores/README.md": (
        "# Online stores\n\nEach store under this directory implements online read/write access for materialized "
        "features. See individual files for store-specific configuration.\n"
    ),
})
none_case("t120r-none2-5", "pledger-android", PLEDGER, {
    "app/src/main/java/com/pledgerio/app/identity/session/SessionManagerNotes.kt": (
        "package com.pledgerio.app.identity.session\n\n"
        "// Design note: SessionManager is the single owner of auth-scoped preference access.\n"
        "// See docs/adr/006-encrypted-shared-preferences.md for the storage rationale.\n"
    ),
})
none_case("t120r-none2-6", "pledger-android", PLEDGER, {
    "app/src/main/java/com/pledgerio/app/catalog/data/local/MigrationNotes.kt": (
        "package com.pledgerio.app.catalog.data.local\n\n"
        "// Tracking doc for upcoming schema changes under consideration; no migration defined yet.\n"
        "val PLANNED_SCHEMA_NOTES: List<String> = listOf(\"consider indexing TransactionEntity.date\")\n"
    ),
})
none_case("t120r-none2-7", "pledger-android", PLEDGER, {
    "app/src/main/java/com/pledgerio/app/reports/presentation/ReportsExportViewModelNotes.kt": (
        "package com.pledgerio.app.reports.presentation\n\n"
        "// Follow-up idea: let ReportsExportViewModel expose export progress as a StateFlow<Float>.\n"
    ),
})
none_case("t120r-none2-8", "pledger-android", PLEDGER, {
    "app/build-notes.md": (
        "# Build notes\n\nAnnotation processors (Hilt, Room, Moshi) all run via KSP; see docs/adr/013-ksp-over-kapt.md.\n"
    ),
})

json.dump(cases, open("/Users/a1/.hermes/cache/scratch/t120c/cases_none2_raw.json", "w"), indent=2)
print("built", len(cases), "replacement no_decision cases")
for repo in (FEAST, PLEDGER):
    status = git(repo, "status", "--porcelain")
    print(repo.name, "clean" if not status else f"DIRTY:\n{status}")
