# Results

Scores against the frozen golden set, newest stage first. Every number here comes from
`npm run triage:eval`, and every one carries the caveats that limit what it means.

## Stage 4 — the investigation agent (2026-10-15)

`npm run triage:eval -- --agent`: Sonnet in Claude Code's loop, prompt
`investigate.v1`, our five read-only tools over MCP (ADR 0007). Holdout only, 18 cases.
Records are in `data/runs/investigate.v1/`, and one trace per case is in
`data/traces/investigate.v1/`.

| Holdout (18 cases)        | Category accuracy | Fix-file hit rate | Notional cost | Median time |
| ------------------------- | ----------------- | ----------------- | ------------- | ----------- |
| Rule baseline (Stage 2)   | 100% (18/18)      | 50% (6/12)        | —             | —           |
| Single call, classify.v1  | 50% (9/18)        | 100% (12/12)\*    | $0.45         | 4.9s        |
| **Agent, investigate.v1** | **83% (15/18)**   | **100% (12/12)**  | **$0.59**     | **8.1s**    |
| _Brief targets_           | _≥ 85%_           | _≥ 60%_           |               | _≤ 120s_    |

\* Inflated by leakage (see the correction below). The agent's number is clean.

**Within every limit.** 18 runs, 0 fallbacks, 0 limits hit. 95 turns (5.3 per case),
a maximum of 15.5s, and $0.033 per case against a cap of $0.30. The single call cost
$0.025 per case, so the investigation cost about 30% more for a large gain in
accuracy.

**It used the tools it was given, for the reason it was given them.** `job_history`
and `commit_changes` were called in all 18 runs, `search_repo` in 9, `earlier_failures`
in 7, `read_file` in 4. There were three tool errors, and all were recovered:

- Twice the model sent malformed JSON for its final answer, once with a literal
  `"placeholder"` hypothesis. The CLI rejected both, the third attempt was a full
  answer, and that is the one recorded. The schema check did its job.
- Once it called `read_file` by its bare name with string numbers, and Claude Code
  answered "No such tool". It carried on without it.

**What the history fixed.** v1's three Dependabot misses are all correct now. In each,
`job_history` showed that the same job had already been failing on
`development-alpha` before the upgrade, and the agent quoted that line as evidence. The
five lobby cases v1 called `environment` or `flaky` are also correct, but that is the
v2 time-limit rule, which the agent's prompt includes. **This comparison therefore
mixes two changes: the tools, and the rule.** A clean split would need classify.v2 on
holdout, which was not run.

**The 3 misses:**

- `34155666732-101846850684` (labelled `dependency`, answered `threshold`). This is the
  Angular-upgrade budget case. The agent argued that a 15 kB budget against a 266 kB
  bundle is a misconfigured limit, not upgrade growth. The label's own note says
  "FLAG: could be threshold".
- `37383859048-112012213886` (labelled `threshold`, answered `regression`). The agent
  read the code at the failing commit and found that the e2e test still expects the
  sentence "written and not built", which the page stopped saying once all six floors
  were built. That is specific and checkable, and the label note is the generic lobby
  note. **This label is worth re-checking: the agent may be right.**
- `37385355841-112017165099` (labelled `threshold`, answered `environment`). The log shows
  the browser session dying ("session closed") rather than a missed wait, and the
  agent applied the rule's own exception, "a tool that failed outright".

**Fix files.** All 12 eligible cases were hit, and every suggested path existed at the
failing commit. For the lobby cases the agent named `e2e/aubade.spec.ts`, where
`LOBBY_TIMEOUT` lived at the time, and in one trace it noticed that the same 20s wait
was duplicated in `e2e/a11y.spec.ts`. The real fix removed exactly that duplication by
moving both into `e2e/support/lobby.ts`. The metric is still the loose one (any overlap
with a wide diff), as noted under Stage 3.

### Correction to Stage 3: the single call saw the future file tree

Stage 3 gave the model `git ls-files` from today. `e2e/support/lobby.ts` and
`scripts/lobby-headroom.mjs` were created on 2026-10-11 by the commit that fixed the
lobby timeouts, after every golden case. Naming them in the file list told the model
where the fix would go, and hinted at "a lobby budget" as the cause. So:

- **v1's and v2's fix-file rates (100%, 94%) are inflated**, and the "inferred a file
  the log never mentions" claim is withdrawn.
- **v2's 23/23 on `threshold` (tune) may be partly helped** by the same hint. How much
  cannot be known without a re-run.
- **Fixed in code.** The single call now gets `git ls-tree` at the failing commit
  (`classify.files_at`), the same tree the agent's tools read. The stored v1 and v2
  records were made before the fix and stay as they were, labelled by this note.

## Stage 3, revised — classify.v2 on tune (2026-10-15)

After the holdout results below, the maintainer ruled that **a missed time limit is
`threshold`**, even when the runner's speed is the reason. `classify.v2` states that as
policy. It was run on the 39 tune cases only, so the holdout was not used to tune it.

| Tune (39 cases)             | Category accuracy | Fix-file hit rate |
| --------------------------- | ----------------- | ----------------- |
| Rule baseline (Stage 2)     | 100% (39/39)      | 50% (8/16)        |
| **Model call, classify.v2** | **77% (30/39)**   | **94% (15/16)**   |

39 calls, 0 fallbacks, 0 retries. A median of 7.1s per case and a maximum of 10.5s. The
notional cost was $0.98, $0.025 per case.

**The rule worked.** All 23 `threshold` cases were answered `threshold`, including
every lobby timeout, the cluster that v1 missed nine times out of nine on holdout.

**The 9 misses are two clusters, and one log cannot settle either:**

- **4 résumé-PDF failures labelled `environment`** were answered `dependency` (3) or
  `regression` (1). The log says the committed PDF no longer matches a fresh render,
  and the model blamed a renderer upgrade or a content change. The real cause was
  that Chromium renders the same PDF differently on Windows and on Linux, which shows
  only when the same commit is compared across machines, or in the history of the
  check.
- **4 Angular-upgrade budget failures labelled `dependency`** were answered
  `threshold`. The prompt's own example covers exactly this case ("a budget exceeded
  because an upgrade inflated the bundle is `dependency`"), yet the stronger new rule
  won. Two rules that point opposite ways on the same case are a design problem in
  the prompt.
- **1 reduced-motion failure** on an upgrade branch was answered `regression`. It
  failed only on Dependabot branches, which is again a fact about history.

**Not yet run: v2 on holdout.** The holdout number reported for Stage 3 is still v1's.
A v2 holdout run (18 calls) is the clean final measurement, and Stage 4 needs it as the
single-call reference.

**Caveat added in Stage 4:** these v2 runs saw a file list that included files created
after the failures. See the correction under Stage 4.

## Stage 3 — one model call per case (2026-10-15)

`npm run triage:eval -- --llm`: Sonnet (`claude-sonnet-5-5`), prompt `classify.v1`, one
`claude -p` call per case with a JSON schema (ADR 0006). Holdout only. The 39 tune
cases have not been run yet. The records behind every number are in
`triage/data/runs/classify.v1/`, so re-scoring costs nothing.

| Strategy                    | Category accuracy, holdout | Fix-file hit rate, holdout |
| --------------------------- | -------------------------- | -------------------------- |
| Rule baseline (Stage 2)     | 100% (18/18)               | 50% (6/12)                 |
| **Model call, classify.v1** | **50% (9/18)**             | **100% (12/12)**           |
| _Brief targets_             | _≥ 85%_                    | _≥ 60%_                    |

**Cost and latency.** 18 calls, 18 answered by the model, 0 fallbacks, 0 retries. A
median of 4.9s per case and a maximum of 13.7s, inside the brief's 2 minutes. Tokens:
72,311 input, 137,108 read from cache, 14,366 output. The notional cost was $0.45 in
all, $0.025 per case. That is Claude Code's estimate at API list prices: nothing was
billed, and it reads as quota used.

### Category: worse than the rules, and the misses are one argument

Every one of the 9 misses is a case labelled `threshold`, and all 9 have the same root
cause: the Aubade lobby missing its end-to-end time budget on slow CI runners. The
model never answered `threshold` at all.

- **5 went to `environment` (3) or `flaky` (2).** The model's hypotheses describe the mechanism
  correctly: software WebGL on a slow runner, so the lobby never unlocks within 20s.
  It then calls that a runner problem. The label note on these cases reads "FLAG:
  arguably environment (runner speed)". The labeller flagged the category as arguable,
  and the model chose the alternative the note names. This is a disagreement about a
  convention (is a time budget a gate or a runner property?), not a misreading of
  the log.
- **3 went to `dependency`.** All three were on Dependabot branches, and the model blamed
  the upgrade. In fact they inherited the lobby failure from the main branch. One log
  cannot tell those apart. Checking whether the same job failed the same way without
  the upgrade can, and that is a history lookup, not a reading task.
- **1 went to `regression`**: a failed text assertion on the Reader's Edition, read as
  changed copy. The lobby timeout behind it is not visible in that excerpt.

So the 100% the rules score here does not show that rules understand these failures.
It shows that they encode the labeller's convention for one recurring cause.

### Fix files: better than the rules, but the metric flatters both

The model named a file the fix touched in all 12 eligible cases. Two things limit what
that means:

- **The answer keys are either very narrow or very wide.** Six are the two-file
  dependency pair (`package.json`, `package-lock.json`). The other six are lobby fixes
  that touched 9 to 19 files each, so almost any end-to-end file counts as a hit.
- ~~**The real signal is narrower and genuine.**~~ **Corrected in Stage 4: this was
  leakage, not inference.** The model named `e2e/support/lobby.ts` in 3 of the 6 lobby
  cases, whose logs never mention it. But that file was created on 2026-10-11 by the
  fix itself (`6b948ed`), after every golden case. The model was given **today's** file
  list, so it could see where the fix would go. Until then the budget lived in
  `e2e/aubade.spec.ts`. From Stage 4 the list is the tree at the failing commit
  (`classify.files_at`).

### What it means for Stage 4

- **The prompt was not changed after seeing these results.** Changing it now would
  fit it to the holdout. The convention question goes to the maintainer instead: if
  "a time budget missed on CI" is `threshold` by policy, the prompt should state that
  rule explicitly, and the change should be tested on the tune split.
- **Most errors are what a single call cannot know.** Three misses need the job's
  history, and the correct fix file needs knowledge of where budgets live. That is
  the case for the Stage 4 investigation, with history and repository-search tools,
  measured against these numbers.
- **The fix-file metric needs a sharper key in Stage 7**, for example the one file
  that carried the fix, so that wide diffs stop counting any nearby guess as a hit.

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
