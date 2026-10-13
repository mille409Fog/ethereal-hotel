# Learning log

One section per stage: the concepts it covered, explained, and the interview questions
it prepares for. Stage 10 compiles this into interview prep.

## Stage 0 — Scoping

### Concepts

**Workflow vs. agent.** A workflow is a sequence of steps fixed in code, where an LLM
may fill in one of them ("classify this log"). An agent is a loop in which the model
chooses the next step: read, decide what to look at, call a tool, read the result,
repeat until done. Workflows are predictable, cheap and testable. Agents handle
problems whose path can't be known in advance, at the cost of being harder to bound and
to score.

**Why production systems are mostly workflow.** Most of any job has a known shape;
only part of it is open-ended. Using an agent for the known part spends money and
predictability on flexibility nobody needed. In CI triage, fetching and trimming a log
always happen the same way, and investigating _why_ it failed does not.

**What makes a demo credible.** Real input data, a metric that can be computed, tools
with clear jobs, and a point where a human approves. Here the input is this
repository's own 68 failed runs (2026-08-10 to 2026-10-12), and the label for each is
the commit that fixed it.

**Splitting evaluation data honestly.** When many examples share a root cause (the e2e
job's failures do), a random train/test split puts near-duplicates on both sides and
inflates the score. Split by time or by root cause instead.

### Interview questions

**Q: When would you use an agent rather than a workflow?**
When the sequence of steps depends on what you find along the way and can't be listed
in advance. For everything else, fixed steps are cheaper, faster and easier to test. In
this project only the investigation step is agentic.

**Q: Where did your evaluation labels come from?**
From history: for each failed run, the commit that turned the pipeline green again
shows what was actually wrong. That makes the labels evidence rather than opinion, with
one caveat: a fix commit sometimes changes more than the cause.

**Q: How did you keep the score from being inflated?**
The data is unbalanced and full of near-duplicates, so the held-out set is split by
time or by root cause, never at random.

## Stage 1 — Architecture and setup

### Concepts

**The model call is stateless.** Every call starts from nothing, so everything the
model needs must be in that call or reachable through a tool. Context windows, memory
and the cost of long prompts all follow from this.

**Prompts.** The system prompt carries standing instructions; the messages carry this
case. Keeping prompts in versioned files means a prompt change is a diff that can be
evaluated, like any other code change.

**Tools.** The model never runs anything itself. It emits a structured request (a name
and arguments), your code runs it, and the result goes back. A tool's name, description
and input schema are all the model knows about it, so a tool should be written like an
API for a colleague who can't ask questions.

**State, orchestration, memory.** State is what a run knows partway through.
Orchestration is whatever decides the next step: your code in a workflow, the model in
an agent. Short-term memory is what's in one run's context; long-term memory is stored
and carried across runs.

**MCP (Model Context Protocol).** A standard way to package tools as a server that any
MCP-capable program can use. It isn't worth it when you write the loop yourself, since
plain functions are simpler. It is the right tool when the loop belongs to a program
you don't control, which is our case with Claude Code.

**Running now vs. queuing.** If the caller waits for the result, a crash loses the
work. A queue stores the job durably for a worker to pick up and retry. GitHub Actions'
`workflow_run` event already is one, so we don't build our own.

**Failing closed.** A guard whose mistakes cost different amounts should err towards
the cheap mistake. A false refusal costs a re-run and a false pass costs money, so
anything the billing guard can't positively identify as safe is refused. The other half
of the discipline is testing that a safe case _passes_, or "refuse everything" passes
the suite.

**The agent loop is one growing conversation.** The model doesn't write itself new
prompts. Given one task, it replies with a tool call instead of an answer; the harness
runs the tool and appends the result; the model reads the whole conversation and
chooses again, until it answers. The model only decides the next step, and the harness
runs the loop. The reason to use one is that the path depends on what is found. If the
steps can be listed in advance, it should be a workflow instead.

**Golden set.** A fixed list of past cases with known right answers (here: a failed
run, its category, and the files its fix touched, taken from the commit that turned CI
green). It is the answer key the system is scored against. Part of it is held out:
never looked at while tuning prompts, so the score measures performance on unseen
failures rather than memorisation. It is frozen, unlike the rolling corpus of recent
failures, because an answer key that changes makes scores from different weeks
incomparable.

### Interview questions

**Q: What's a golden set, and why hold part of it out?**
A labelled set of real cases with known answers that the system is scored against, a
test suite for something non-deterministic. The held-out part is never seen while
tuning, because tuning against every case measures how well you fitted those cases,
not how well the system generalises.

**Q: Why did you use Claude Code headlessly instead of the API?**
A zero-cost constraint. The API bills per token, while headless Claude Code runs on an
existing subscription. That choice changed the architecture: the agent loop belongs to
Claude Code, so our tools reach it over MCP, and the fixed workflow steps are single
headless calls with schema-validated output.

**Q: How do you know the system can't run up a bill?**
Four layers, each enough on its own. The subprocess gets an allowlisted environment.
The whole parent environment is vetted anyway. Claude Code is asked which credential
it would use, and only the two subscription methods pass, matched exactly. The account
has extra usage switched off. Everything unknown is refused, and the tests try every
billing variable in every casing with every kind of value.

**Q: Why MCP here, when you said it's often unnecessary?**
Because we don't own the loop. When your code runs the loop, a tool is a function call.
When someone else's program runs it, MCP is the interface that program offers for
outside tools.

**Q: Why no queue or database?**
Volume is about 35 failures a month and the budget is zero. GitHub Actions already
gives a durable, retried trigger for free, and committed JSON files give versioned
storage that can be reviewed in a diff. Each is the production-shaped answer scaled to
the problem actually being solved.

## Stage 2 — Deterministic baseline

### Concepts

**A baseline is the number to beat.** Before any model is involved, the simplest thing
that could work is built and scored. Without one, "the AI scores 85%" means nothing,
because rules or even a constant guess might score that too. The weakest baseline of
all is always to answer the commonest class (here 50% on holdout), and every other
number should be read against it.

**Typed models between steps.** fetch → `FailedJob` → classify → `Category`. Each
arrow is a dataclass validated on the way in, so each step can be tested alone, and
Stage 3 can replace the classifier without touching anything else.

**Idempotency.** Running a step twice has the same effect as running it once:
deterministic filenames (run and job id), stable JSON bytes, atomic writes (a temp file
then a rename), and skipping work that is already done. A second fetch here made no
log requests and changed no file. That's what makes automatic retries safe in Stage 5.

**Labels from history, and their limits.** The fix for a failure is the diff from the
_last_ failing run to the first passing one. The first draft diffed from the original
failure and produced 119-file answer keys that any guess would hit. Branches that
were abandoned have no fix at all, and re-runs on the same commit are the only direct
evidence of flakiness.

**A perfect score is a warning.** 100% on holdout here came from three places: the
rule author had seen the holdout, the labels and the rules read the same signals, and
the data is three recurring problems. Data leakage, circular labels and an unvarying
test set are the classic ways an evaluation lies, and spotting them is the point.

### Interview questions

**Q: Your baseline scored 100%. Why didn't you celebrate?**
Because the holdout had been seen by whoever wrote the rules, the labels were drafted
from the same signals the rules test, and the failure history is three recurring
causes. A score is only as independent as the people and data that produced it. I
reported it with those caveats and moved the comparison to the metric that wasn't
compromised, fix-file accuracy at 50%.

**Q: How did you label real CI failures?**
Mechanically where possible: the fix is the diff between the last failing run and the
first passing run of the same job on the same branch. The category took judgment, so
it was drafted, confirmed by a human who knew the history, then frozen, with the
newest 30% held out by time.

**Q: What does idempotency buy you here?**
Retries without side effects. The fetch skips runs it already has, writes stable bytes
atomically, and rotates by run, so running it twice, or killing it halfway, leaves a
valid corpus.
