# Results

Scores against the frozen golden set, newest stage first. Every number here comes from
`npm run triage:eval`, and every one carries the caveats that limit what it means.

## Stage 2 — rule baseline (2026-10-13)

**The golden set.** 57 failed jobs from this repository's 50 most recent failed runs
(2026-08-11 to 2026-10-10). The labels were drafted by Claude, confirmed by the
maintainer, and frozen. The 39 oldest cases are `tune`; the 18 newest (from
2026-09-07) are `holdout`.

| Category    | tune | holdout |
| ----------- | ---- | ------- |
| threshold   | 23   | 9       |
| dependency  | 11   | 9       |
| environment | 5    | 0       |
| flaky       | 0    | 0       |
| regression  | 0    | 0       |

**Scores.**

| Strategy                               | Category accuracy, holdout | Fix-file hit rate, holdout |
| -------------------------------------- | -------------------------- | -------------------------- |
| Always answer the commonest category   | 50% (9/18)                 | —                          |
| Rule baseline (`classify_by_rules`)    | 100% (18/18)               | —                          |
| Naive file suggester (`suggest_files`) | —                          | 50% (6/12)                 |
| _Brief targets_                        | _≥ 85%_                    | _≥ 60%_                    |

On tune the rules score 100% (39/39) and the suggester 50% (8/16).

### What the 100% does and does not show

It does **not** show that rules generalise. Three things inflate it, and each is a
finding in its own right:

1. **The holdout was seen.** Claude read every case, holdout included, to draft the
   labels, and later wrote the rules too, after the maintainer handed the function
   back. The process rule ("write rules from tune only") holds for whoever wrote the
   rules, and that person had already seen the holdout.
2. **Labels and rules share a source.** The drafts were written by reading the same
   signatures the rules test: the lobby text, the budget wording, the audit report.
   Recovering a label from the features that produced it is close to circular.
3. **The history is uniform.** Three recurring root causes account for 52 of 57 cases:
   the Aubade lobby missing its time budget on CI, upgrades, and the résumé PDF's
   platform drift. On data this repetitive, fixed rules can be perfect.

It **does** show that this repository's failure history is mostly a few known problems,
each with a recognisable fingerprint. That is an argument about where an LLM can add
value: not in re-recognising known failures, which rules already do perfectly, but in
failures nobody has written a rule for yet, and in pointing at the fix.

### What it means for later stages

- **Category accuracy on this set can't show an LLM adding anything**, because the
  ceiling is already reached. Stage 3 will be judged on the fix-file metric (50%
  against a 60% target), on cost and latency, and on cases unlike these.
- **The golden set has no flaky or regression cases**, so those categories are
  unmeasured. Stage 7's expansion needs cases written for them (from the brief's
  definitions, labelled before any rule or prompt sees them) and a genuinely unseen
  test set.
- **The suggester's 50% has a clear ceiling.** It only names files that appear in the
  log. Half the fixes touched files the log never mentions (`angular.json` for a
  budget, `package-lock.json` for an advisory), which is exactly the inference the
  agent's investigation is meant to supply.
