# T79 prior art: standard regression-test-selection (RTS) metrics

```notes
sources (3, fetched + dated 2026-11-03)
1  Rothermel & Harrold, "Analyzing Regression Test Selection Techniques" (IEEE TSE 22(8), 1996)
   https://digitalcommons.unl.edu/cgi/viewcontent.cgi?article=1013&context=csearticles
2  Gligoric, Eloussi, Marinov, "Practical Regression Test Selection with Dynamic File Dependencies" (Ekstazi, ISSTA 2015)
   https://users.ece.utexas.edu/~gligoric/papers/GligoricETAL15Ekstazi.pdf
3  Legunsen, Shi, Marinov, "STARTS: STAtic Regression Test Selection" (ASE 2017 tool demo)
   https://cs.cornell.edu/~legunsen/pubs/LegunsenETAL17STARTS.pdf
```

## What we borrow

```notes
inclusiveness / safety (source 1, section 4.1-4.2)
    Inclusiveness = 100*(m/n): m = modification-revealing tests a technique M selects, n = the TOTAL number of
    modification-revealing tests in the full suite T (100% if n=0). "Safe" = always 100% inclusive. The
    denominator is always the full suite's count of fault-revealing tests, never an intermediate candidate set.

selection size % (sources 2 §6 "e%", 3 abstract)
    Both report the selected-test ratio as a share of the FULL test suite ("RetestAll"): STARTS "selects on
    average 35.2% of all tests"; Ekstazi's e% is "ratio of test entities selected" against the same RetestAll
    denominator. A baseline that runs the whole suite is, by this definition, 100% trivially — it is never
    itself reported as a ratio against some other subset.

end-to-end time (source 2 §1, §6)
    Ekstazi's central point: selection-size reduction does not equal time reduction, because the Analysis +
    Execution + Collection phases have their own overhead; it explicitly reports end-to-end wall time
    (A+E+C) against RetestAll's wall time, not just a test-count ratio. STARTS likewise reports runtime
    (81.0% of RetestAll) separately from selection size (35.2%).
```

## What doesn't fit / why Mole's bench diverged

```notes
Mole's M14 bench additionally reports "share of reach": tests the selector ran / tests in `vitest related`'s
module-graph reach set. This is NOT one of the three standard metrics above — it's a Mole-specific comparison
against a coarse dynamic-dependency baseline (closest analog: Ekstazi/STARTS's own selection, which IS exactly
"reach" at file/module granularity). It is a legitimate secondary number but must never be reported as "% of
the suite" — that label belongs only to the true selection-size metric (selected / full suite), which the bench
was missing entirely. Reusing the "share of reach" formula for the run-all baseline (whose own "selected" count
IS the full suite) produces the exact bug D52 flagged: fullSuiteTests / reach.tests, averaged, = 1347.5%, while
Mole's own number under the same (reach-relative) formula is 18.5% — both numbers are internally correct under
their own (non-standard) definition, but the prose around them called the run-all number "% of the suite",
which no reach-relative number can ever correctly be (reach.tests <= fullSuiteTests always, so run-all's
reach-relative share is always >=100% whenever reach < suite — a structural artifact, not a baseline result).
```
