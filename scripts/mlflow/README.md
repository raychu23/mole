# MLflow viewer over the build loop's runs.jsonl (T16)

`runs.jsonl` stays the record; this only mirrors it into a local MLflow 3 file store (no server, no network, no account).

    python3 -m venv ~/.hermes/cache/scratch/mole-mlflow-venv
    ~/.hermes/cache/scratch/mole-mlflow-venv/bin/pip install -r scripts/mlflow/requirements.txt
    ~/.hermes/cache/scratch/mole-mlflow-venv/bin/python scripts/mlflow/load_runs.py            # -> .mole/local/mlruns (gitignored)
    ~/.hermes/cache/scratch/mole-mlflow-venv/bin/mlflow ui --backend-store-uri .mole/local/mlruns   # optional, needs full `mlflow`

One run per runs.jsonl line in experiment `mole-build-loop`: params task/commit/cmd/exit, metrics parsed from the summary
strings (`precision 100% (3/3)` -> `M3.precision = 100`), the raw string as tag `mole.raw.<metric>`. Re-running adds nothing
twice (tag `mole.line_hash`). MLflow 3.17 keeps the file store behind `MLFLOW_ALLOW_FILE_STORE=true`; the loader sets it and
switches MLflow usage telemetry off (`MLFLOW_DISABLE_TELEMETRY`, `DO_NOT_TRACK`). `mlflow-skinny` is enough for the loader;
the web UI needs the full `mlflow` package.
