"""The eval's key (written before any harness code): case data, the truth from the guarding test itself, n + stopping rule."""
import hashlib
import json
from datetime import datetime
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parents[1]
KEY = json.loads((EVAL_DIR / "cases" / "key.json").read_text())


def sha(rel: str) -> str:
    return hashlib.sha256((EVAL_DIR / rel).read_bytes()).hexdigest()


def test_key_is_dated_and_names_the_subject_and_tool_commits():
    datetime.strptime(KEY["written"], "%Y-%m-%dT%H:%M:%S%z")
    assert KEY["subject"]["commit"] == "3fa6e4a"
    assert KEY["tool"]["commit"]


def test_key_pins_the_guard_and_planted_files():
    assert sha(KEY["guard"]["file"]) == KEY["guard"]["sha256"]
    assert sha(KEY["planted"]["file"]) == KEY["planted"]["sha256"]


def test_truth_comes_from_the_guard_itself_good_passes_bad_fails():
    t = KEY["truth"]
    assert set(t["known_good"]["exit_codes"]) == {0}
    assert 0 not in t["known_bad"]["exit_codes"]
    assert t["existing_tests_on_bad"]["exit_code"] == 0


def test_two_runnable_cases_and_b1_excalidraw_cases_excluded_with_a_reason():
    assert [c["id"] for c in KEY["cases"]] == ["B3-tidy", "B3-review"]
    for c in KEY["cases"]:
        assert c["prompt"] and "guard" not in c["prompt"].lower() and "9e19c51" not in c["prompt"]
    ex = KEY["excluded"][0]
    assert ex["ids"] == ["B1 R1", "B1 R2", "B1 R3", "B1 R4", "B1 R5"] and ex["why"]


def test_n_and_stopping_rule_written_before_running():
    f = KEY["full_run"]
    assert f["epochs_per_case_per_arm"] >= 10
    assert f["runs_per_arm"] == f["epochs_per_case_per_arm"] * len(KEY["cases"])
    assert "no partial score" in f["stopping_rule"]
    assert KEY["dry_run"]["samples"] == 2 and KEY["dry_run"]["model"].startswith("mockllm/")
