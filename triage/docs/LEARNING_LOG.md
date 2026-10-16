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

## Stage 3 — Single LLM calls

### Concepts

**Anatomy of a call.** A system prompt (standing instructions: the five categories,
what a good answer looks like), a user message (this one failed job), a cap on output,
and a stop condition. `claude -p` is stateless: each call is a new process that knows
only what is in its prompt, so the prompt is the whole of the model's context. It
exposes no temperature, so the same input can give a different answer. Stage 7 has to
allow for that.

**Structured output, validated twice.** The call carries a JSON Schema built from our
own enums, and the CLI holds the model to it. Our `Triage.from_json` then checks the
answer again against our types, because a schema the CLI accepted is not proof our
code will. When either check fails, the rule baseline answers instead, and the record
says `source: rules` and why. A fallback that is never labelled would quietly mix two
systems into one score.

**Prompts are versioned files.** `prompts/classify.v1.md`, with results stored under
`data/runs/classify.v1/`. A change of prompt is a new file and a new result set, so
two prompts can be compared on the same cases, and a diff shows exactly what changed.

**Workflow patterns.** Chaining feeds one call's output to the next, routing lets a
cheap step pick the handler, and parallelisation runs independent calls at once.
Here one call returns the whole record, because category and fix files both come from
reading the same log. Routing (rules first, model for the rest) would only make sense
once the rules stop recognising some cases.

**Tokens, latency, cost.** The JSON result reports tokens, wall time, turns and an
estimated cost. On the subscription that cost is notional, but it moves with quota,
which is what runs out. Prompt caching made 137k of 209k input tokens cache reads,
because the system prompt (instructions and file list) is identical for every case and
only the case changes. A stable prefix and a variable suffix is the cheapest shape a
prompt can have.

**Failures are classified, not just retried.** `failure_kind` sorts every call into
ok, retry, limit, invalid or fatal. Timeouts and crashes are retried with doubling
backoff. The usage limit is never retried, because retrying a quota error only fails
again, and "fall back to something paid" is the one route this project forbids. A
canary stops the run when its first call fails, rather than spending quota on every
case to learn the same thing.

**A metric can flatter.** The fix-file hit rate went from 50% to 100%, but the answer
keys are either two files or nineteen, so a hit can mean little. _(Corrected in Stage
4: this stage also claimed the model "named the real fix file in three cases whose logs
never mention it". It had been given today's file list, which contained that file
because the fix itself created it. That was leakage, not inference. See Stage 4.)_

### Interview questions

**Q: Your LLM scored 50% where rules scored 100%. Why keep it?**
Every miss was the same recurring failure, and its labels had been flagged as arguable
when they were made. The model read the mechanism correctly and chose the other side
of a convention, and the rest needed history that one call does not have. That made
the case for the Stage 4 agent, which reached 83% on the same holdout. _(The answer once
also cited fix files "the rules cannot find". That claim was withdrawn once it turned
out to be leakage.)_

**Q: How do you get reliable JSON out of an LLM?**
Constrain it, then verify it. The CLI enforces a JSON Schema at generation time; our
code parses the result into typed objects and rejects anything off-schema; and a
rejected answer falls back to a deterministic path, with the fallback recorded. Never
trust a single layer, and never let a fallback be silent.

**Q: What do you retry, and what don't you?**
Retry what is transient: timeouts, crashes, 5xx. Don't retry what will fail the same
way: auth errors, bad requests, the model running out of turns. And never retry a
quota limit: stop, report it, and resume later from saved progress. Each case is
saved as it finishes, which is what makes stopping cheap.

**Q: Why not tune the prompt until the holdout score went up?**
Because then the holdout would stop being a holdout. The disagreement was raised with
the human who owns the labels. Any prompt change gets tested on the tune split.

## Stage 4 — Tools and the agent loop

### Concepts

**The agent loop.** The model reads the task, chooses a tool and its arguments, our
code runs the tool, the result goes back into the context, and the loop repeats until
the model answers or a limit stops it. The model never executes anything itself. It
asks, and code decides what asking does. Here Claude Code runs the loop, and we supply
the tools, the limits and the record. One trace shows the whole thing: commit →
history → earlier failures → search → answer, in four turns.

**Agent where the path varies, workflow everywhere else.** Only the investigation is
an agent, because the facts it needs differ by case: inherited or introduced? platform
or content? where does the budget live? Fetching the commit, gathering history,
validating the answer, falling back and storing the record are fixed steps in code.
The test for "should this be an agent" is whether a fixed sequence of lookups would
either waste work or miss the one that mattered.

**Tools are an API for a new teammate.** Each has a name that says what it does, a
description that says when to use it, a strict input schema, and errors that say how
to recover: "No file `src/lobby.ts`. Did you mean `e2e/support/lobby.ts`?" Tool errors
come back as results the model reads (`isError`), not as crashes. Arguments are
validated by our code, because the model's arguments are input like any other.

**As of the failure.** Every tool reads the repository at the failing commit and the
history before the failing run, so the fix is never visible. The importance of this
was learned the hard way: Stage 3 gave the model today's file list, which included
the file the fix created, and that inflated its fix-file score. Time-travel leakage is
the agent-era version of testing on your training set.

**Stopping conditions.** Four limits, each enforced by something specific: turns and
notional cost by Claude Code (`--max-turns`, `--max-budget-usd`), wall clock and
total tokens by our stream reader, which kills the process. A limit you cannot watch
being enforced is not a limit. Hitting one leaves no answer, so the rules answer, and
the record says which limit it was. There are no retries, because a retried
investigation repeats every turn.

**Context management.** Each tool result stays in the context and is re-read on every
later turn, so tools return capped, targeted slices: at most 40 matches, 200 lines, 12
lines of commit message. The commit-message cap was added after seeing an upgrade
bot's release notes, which are pages of text written outside the repository, and an
injection surface Stage 6 will care about.

**MCP.** JSON-RPC over stdio: `initialize`, `tools/list`, `tools/call`. It was written
by hand in about 150 lines, so the protocol is visible and the package keeps no
runtime dependencies. The cost is tracking protocol changes ourselves.

**Traces.** The raw event stream, bracketed by our header (case, limits) and verdict,
one JSON object per line, and rendered turn by turn by `npm run triage:trace`. The
session's opening event is trimmed before writing, because traces are committed to a
public repository.

### Interview questions

**Q: Where did you put the agent, and why not everywhere?**
In the investigation only. Misses from the single call fell into questions the log
can't answer (was this failure inherited? does the render differ by platform? where's
the budget?), and which question matters varies by case. Everything with a fixed shape
stayed workflow, because workflow is cheaper, testable and predictable. The agent
lifted holdout accuracy from 50% to 83% for about 30% more cost per case.

**Q: How do you stop an agent from running away?**
With hard limits enforced by code, not by a request in the prompt: turns, notional
cost, wall clock and total tokens. Two are enforced by the CLI and two by our own
stream reader, which kills the process. Every limit has a defined outcome: a fallback
to deterministic rules, recorded with the reason. In this run none was hit; the worst
case took 15.5s, and the dearest cost $0.048 against a $0.30 cap.

**Q: Walk me through one trace.**
A Dependabot bump failed the e2e job. Turn 1: `commit_changes` showed only the
lockfile changed, and `job_history` showed the same job failing on
`development-alpha` for weeks before. Turn 2: `earlier_failures` showed the same lobby
tests failing on other branches. Turn 3: `search_repo` found `LOBBY_TIMEOUT = 20_000`
in the spec, duplicated in another spec. Turn 4: it answered `threshold`, not
`dependency`, because the history showed the failure was inherited, and quoted the
history line as evidence. The single call had blamed the upgrade.

**Q: What surprised you?**
That the biggest bug was in the evaluation, not the agent. The single call had been
given today's file list, so it "inferred" a fix file that the fix itself had created.
The agent, which can only see the repository as it was, exposed it.
