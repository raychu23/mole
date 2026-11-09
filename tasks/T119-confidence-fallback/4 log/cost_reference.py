#!/usr/bin/env python3
# T119: real $/check cost reference points, read verbatim from EXISTING raw run outputs (never re-run,
# never re-scored) -- these are v3/v4.1 HELD-OUT arm run files (the only place per-case cost usage was
# ever actually measured end-to-end with a real model), used here ONLY as a $/call cost reference for
# this design study's extra-cost estimate in design.md section 3. Not used for any accuracy/recall claim
# (dev-only per the task's instruction covers section 2's margin/FA analysis; this script is cost-only).
import json, statistics as st

B2 = '/Users/a1/Desktop/CS Code/Project/Mole/context/product-plan/systems/metrics-proof/m2-conflict'

def load(p):
    return json.load(open(p))

rag_v41 = load(f'{B2}/v4.1/run/arm_rag_heldout_v4_1.json')
t53_v41 = load(f'{B2}/v4.1/run/t53_semantic_route_v4_1_heldout_claude-haiku-4-5_k5_m0_c1.01.json')
t53_v3 = load(f'{B2}/v3/run/t53_semantic_route_v3_heldout_claude-haiku-4-5_k5_m0_c1.01.json')

rag_costs = [r['usage']['estimated_cost_usd'] for r in rag_v41 if 'usage' in r]
print('RAG reads-all, v4.1 heldout: mean $/check =', round(st.mean(rag_costs), 5), 'n=', len(rag_costs), 'max=', round(max(rag_costs), 5))

t53_costs = [r.get('totalCostUsd', 0) for r in t53_v41]
route_costs = [r.get('routeCostUsd', 0) for r in t53_v41]
esc_costs = [r.get('escalateCostUsd', 0) for r in t53_v41 if r.get('escalateCostUsd')]
print('T53 cascade, v4.1 heldout: mean total $/check =', round(st.mean(t53_costs), 5),
      'mean BM25-route-only $/check =', round(st.mean(route_costs), 5),
      'mean escalate-call $ (when it escalates) =', round(st.mean(esc_costs), 5) if esc_costs else None,
      f'escalates {len(esc_costs)}/{len(t53_v41)} cases')

t53_costs3 = [r.get('totalCostUsd', 0) for r in t53_v3]
route_costs3 = [r.get('routeCostUsd', 0) for r in t53_v3]
esc_costs3 = [r.get('escalateCostUsd', 0) for r in t53_v3 if r.get('escalateCostUsd')]
print('T53 cascade, v3 heldout: mean total $/check =', round(st.mean(t53_costs3), 5),
      'mean BM25-route-only $/check =', round(st.mean(route_costs3), 5),
      'mean escalate-call $ (when it escalates) =', round(st.mean(esc_costs3), 5) if esc_costs3 else None,
      f'escalates {len(esc_costs3)}/{len(t53_v3)} cases')
