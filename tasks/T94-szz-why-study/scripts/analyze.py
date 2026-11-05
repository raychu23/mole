#!/usr/bin/env python3
"""T94 D82 analysis script (run ONCE, per frozen protocol.md). No p-hacking: this
script is run exactly once on the full dataset, with the model/CI/null-definition
fixed before mining (see protocol.md). Writes analysis_output.json for results.md."""
import json, glob
import numpy as np
import pandas as pd
import statsmodels.api as sm
import statsmodels.formula.api as smf

rows = []
for path in glob.glob("/Users/a1/.hermes/cache/scratch/szz/raw_*.jsonl"):
    with open(path) as f:
        for line in f:
            rows.append(json.loads(line))

df = pd.DataFrame(rows)
print(f"total rows loaded: {len(df)}")
print(df.groupby("repo").size())

# apply censor window exclusion (protocol §6: exclude last ~90 days before mining date
# to avoid right-censoring bias -- commits too recent to have been fixed/caught yet)
df = df[df["in_censor_window"] == True].copy()
print(f"rows after censor-window exclusion: {len(df)}")

df["log_churn"] = np.log1p(df["lines_changed"])
df["log_files"] = np.log1p(df["files_changed"])
df["log_experience"] = np.log1p(df["author_prior_commits"])
df["has_why_int"] = df["has_why"].astype(int)
df["bug_inducing_int"] = df["bug_inducing"].astype(int)

n_total = len(df)
n_why = int(df["has_why_int"].sum())
n_bug_inducing = int(df["bug_inducing_int"].sum())
n_why_and_inducing = int((df["has_why_int"] & df["bug_inducing_int"]).sum())
by_repo = df.groupby("repo").agg(
    n=("hash", "count"), n_why=("has_why_int", "sum"),
    n_bug_inducing=("bug_inducing_int", "sum"),
    n_why_and_inducing=("has_why_int", lambda s: int((s & df.loc[s.index, "bug_inducing_int"]).sum())),
).to_dict(orient="index")

print(f"n_total={n_total} n_why={n_why} n_bug_inducing={n_bug_inducing} n_why_and_inducing={n_why_and_inducing}")

# Pre-registered null criterion (protocol.md §8): <30 bug-inducing commits with has_why=1
# across all repos combined -> NOT RUN, insufficient events. Check this BEFORE fitting.
insufficient_events = n_why_and_inducing < 30

result = {
    "n_total_commits": n_total,
    "n_has_why": n_why,
    "n_bug_inducing": n_bug_inducing,
    "n_why_and_inducing": n_why_and_inducing,
    "by_repo": by_repo,
    "insufficient_events_per_protocol": insufficient_events,
}

# 2x2 raw rates (descriptive, always reported regardless of model fit)
rate_bug_given_why = df.loc[df.has_why_int == 1, "bug_inducing_int"].mean() if n_why > 0 else None
rate_bug_given_nowhy = df.loc[df.has_why_int == 0, "bug_inducing_int"].mean()
result["raw_rate_bug_inducing_given_has_why"] = None if rate_bug_given_why is None else round(float(rate_bug_given_why), 4)
result["raw_rate_bug_inducing_given_no_why"] = round(float(rate_bug_given_nowhy), 4)

# Fit logistic regression regardless (report per protocol even if flagged insufficient,
# but headline conclusion in results.md honors the pre-registered null-by-insufficient-events rule)
try:
    model = smf.glm("bug_inducing_int ~ has_why_int + log_churn + log_files + log_experience",
                     data=df, family=sm.families.Binomial())
    fit_default = model.fit()
    # cluster-robust by repo
    fit_cluster = model.fit(cov_type="cluster", cov_kwds={"groups": df["repo"]})

    coef = fit_cluster.params["has_why_int"]
    se = fit_cluster.bse["has_why_int"]
    or_point = float(np.exp(coef))
    ci_low = float(np.exp(coef - 1.96 * se))
    ci_high = float(np.exp(coef + 1.96 * se))

    # bootstrap CI (resample commits within repo, 2000 resamples) as a robustness cross-check
    rng = np.random.default_rng(42)
    boot_ors = []
    repos = df["repo"].unique()
    for _ in range(2000):
        parts = []
        for r in repos:
            sub = df[df["repo"] == r]
            parts.append(sub.sample(n=len(sub), replace=True, random_state=rng.integers(0, 2**31)))
        boot_df = pd.concat(parts, ignore_index=True)
        try:
            bm = smf.glm("bug_inducing_int ~ has_why_int + log_churn + log_files + log_experience",
                         data=boot_df, family=sm.families.Binomial()).fit()
            boot_ors.append(float(np.exp(bm.params["has_why_int"])))
        except Exception:
            continue
    boot_ors = np.array(boot_ors)
    boot_ci = (float(np.percentile(boot_ors, 2.5)), float(np.percentile(boot_ors, 97.5))) if len(boot_ors) > 50 else None

    result["model"] = {
        "formula": "bug_inducing ~ has_why + log1p(churn) + log1p(files_changed) + log1p(author_prior_commits)",
        "odds_ratio_has_why": round(or_point, 4),
        "ci95_cluster_robust_by_repo": [round(ci_low, 4), round(ci_high, 4)],
        "ci95_bootstrap_2000x": [round(boot_ci[0], 4), round(boot_ci[1], 4)] if boot_ci else None,
        "n_bootstrap_successful": int(len(boot_ors)),
        "n_clusters": int(df["repo"].nunique()),
        "repo_fe_alternative_or": None,
    }

    # robustness: repo fixed effects
    try:
        fe_model = smf.glm("bug_inducing_int ~ has_why_int + log_churn + log_files + log_experience + C(repo)",
                           data=df, family=sm.families.Binomial()).fit()
        result["model"]["repo_fe_alternative_or"] = round(float(np.exp(fe_model.params["has_why_int"])), 4)
    except Exception as e:
        result["model"]["repo_fe_error"] = str(e)

    # Pre-registered null definition (protocol §8): CI includes 1, OR in [0.8,1.25], or insufficient events
    ci_includes_1 = ci_low <= 1.0 <= ci_high
    negligible_effect = 0.8 <= or_point <= 1.25
    result["null_result"] = bool(insufficient_events or ci_includes_1 or negligible_effect)
    result["null_reasons"] = {
        "insufficient_events": bool(insufficient_events),
        "ci_includes_1": bool(ci_includes_1),
        "negligible_effect_size": bool(negligible_effect),
    }
except Exception as e:
    result["model_error"] = str(e)
    result["null_result"] = True
    result["null_reasons"] = {"model_fit_failed": str(e)}

with open("/Users/a1/.hermes/cache/scratch/szz/analysis_output.json", "w") as f:
    json.dump(result, f, indent=2, default=str)

print(json.dumps(result, indent=2, default=str))
