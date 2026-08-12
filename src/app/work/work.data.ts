/**
 * The case studies behind `/work`.
 *
 * These describe work done under NDA, which is why they live in a typed
 * structure rather than in the template: the type is the skeleton from
 * ROADMAP item 3, and every field on it is required. A study cannot be
 * committed with the constraint filled in and the cost left blank, which is
 * the specific way this kind of writing goes vague — the decision gets
 * described, the price of it quietly does not.
 *
 * `work.data.spec.ts` enforces the rest mechanically: length, the presence of
 * a number in the outcome, and a deny-list of the proper nouns that would turn
 * a disclosure-free case study into a disclosure. That check is the reason
 * these are data and not prose in HTML — a paragraph in a template cannot be
 * asserted against.
 *
 * Nothing here is written from the résumé. Every constraint, option, cost and
 * number came from the person who did the work; where a figure could not be
 * stated without disclosing something, the study says so rather than
 * estimating.
 */

/** One decision, told to the skeleton in ROADMAP item 3. */
export interface ICaseStudy {
  /** URL-safe id, used for the heading anchor and the in-page nav. */
  readonly slug: string;

  /** Short title. Domain-level — no product or system names. */
  readonly title: string;

  /** The industry, at the altitude an outsider can place. */
  readonly domain: string;

  /** Two sentences. What the system was for, in the language of the problem. */
  readonly context: string;

  /**
   * The specific thing that made it hard, stated precisely enough that someone
   * could disagree with it. "At scale" is not a constraint; it is a category.
   */
  readonly constraint: string;

  /**
   * The real candidates, including the one an average engineer picks. Two or
   * three. An options list with one plausible entry is a decision wearing a
   * costume.
   */
  readonly options: readonly IOption[];

  /** The route taken, and the reasoning that made it the right one. */
  readonly decision: string;

  /**
   * What the decision cost. Separate field from `decision` on purpose: kept in
   * the same paragraph it reliably erodes into a concession clause, and the
   * cost is the part that demonstrates the judgment.
   */
  readonly cost: string;

  /** The result, ending on a number that discloses nothing. */
  readonly outcome: string;
}

/** One candidate approach, and why it was or wasn't taken. */
export interface IOption {
  readonly label: string;
  readonly detail: string;
  /** True for the option most engineers would reach for first. */
  readonly conventional?: boolean;
}

/**
 * The studies themselves.
 *
 * Empty until the interview that produces them is finished. The page renders
 * an honest empty state rather than placeholder prose, for the same reason
 * `/booking` ships no offline fixture: invented specifics about real
 * engagements are the one lie a page about proprietary work cannot afford, and
 * a plausible-looking draft is far more likely to survive to production than a
 * blank one.
 */
export const CASE_STUDIES: readonly ICaseStudy[] = [
  {
    slug: 'pipeline-fork',
    title: 'The pipeline that blocked its own hotfix path',
    domain: 'Telecommunications',
    context:
      'A customer-facing web platform of independently deployed frontend applications, built by ' +
      'one shared CI/CD pipeline serving development, staging, and several production ' +
      'environments. In production each frontend deployed on its own schedule.',
    constraint:
      'A major framework upgrade landed in the lower environments, rewriting both the application ' +
      'code and the pipeline validating it — new control-flow syntax, functional route guards, ' +
      'a changed dependency-injection form. The production tiers still ran pre-upgrade code, ' +
      'correctly — they had passed the old pipeline. But the pipeline was ' +
      'versioned with the branch that invoked it, not with the code it was building. So an urgent ' +
      'fix cherry-picked from development into production — the routine way anything shipped ' +
      'between cuts — was validated by the new pipeline against old source, and failed on syntax ' +
      'valid for its own tier. It failed once per frontend, six times for a single fix. The ' +
      'breakage fell entirely on the hotfix path, where delay cost most.',
    options: [
      {
        label: 'Let cherry-picks skip the failing stages',
        detail:
          'The fastest route, and not a technical decision at all. A bypass stops being an ' +
          'exception the second time someone reaches for it, and whoever adds it owns the next ' +
          'outage.',
        conventional: true,
      },
      {
        label: 'Backport the upgrade to every production tier',
        detail:
          'One pipeline correct everywhere — at the price of touching nearly every file in every ' +
          'application, on the critical path of an unrelated fix.',
      },
      {
        label: 'Fork the pipeline per tier',
        detail:
          'Pin production to a definition matching the code actually deployed there. Correct, and ' +
          'expensive in ways unrelated to code.',
      },
    ],
    decision:
      'We forked per tier, temporarily, with an explicit end date: the fork existed in order to ' +
      'be deleted. It was the only option that kept the failing stages meaningful — backporting ' +
      'put a huge migration on the critical path of an urgent fix, and a bypass fixes this outage ' +
      'by disabling what catches the next.',
    cost:
      'My team did not own the pipeline; every change went through one of three other teams with ' +
      'repository access. The real work was not writing the fork but walking three groups through ' +
      'a change to infrastructure they owned, without any of them hearing it as an accusation. ' +
      'Slower than doing it myself, and the only version that would have survived.',
    outcome:
      'The fix reached production through the normal cherry-pick path instead of waiting on the ' +
      'next scheduled cut — which would have left the bug live for as long as two weeks.',
  },
  {
    slug: 'design-before-access',
    title: 'When the bottleneck was permission, not engineering',
    domain: 'Finance',
    context:
      'A replacement for the reconciliation system at a financial clearing institution — the ' +
      'process checking what was supposed to move against what actually moved. The handoff could ' +
      'not incur downtime, and the work was audited throughout.',
    constraint:
      'Every tool needed to build or test — the runtime, the IDE, the test runner, each ' +
      'dependency — required security approval before installation, because anything unvetted was ' +
      'a malware vector on machines that could not afford one. Approvals were staggered and slow, ' +
      'and the deadline did not move while they ran: the calendar came out near 70% blocked to ' +
      '30% available. Tolerance for error at cutover was effectively zero, so the suite could not ' +
      'be trimmed to fit the window. The scarce resource was never engineering effort. It was ' +
      'approved machine time.',
    options: [
      {
        label: 'Wait for access, then start',
        detail:
          'The honest first instinct, and mine. It treats blocked time as time off, and it ' +
          'cannot meet the deadline: what remains is not enough to design, build and test a ' +
          'system that must be right first time.',
        conventional: true,
      },
      {
        label: 'Prototype without the tools and retrofit them later',
        detail:
          'Keeps hands on keyboards while blocked. Unpredictable in the wrong direction: fitting ' +
          'a test runner into code shaped around its absence is rework nobody can schedule.',
      },
      {
        label: 'Specify the whole architecture on paper first',
        detail:
          'Spend the blocked stretches on the only work never gated, so every hour of approved ' +
          'access goes to execution rather than to deciding what to execute.',
      },
    ],
    decision:
      'We whiteboarded the entire architecture before running a line of it, and shifted the ' +
      'design goal from efficiency to inevitability — the simplest code that could work, with ' +
      'redundancy over it. Those two choices are one choice: a design you cannot execute is a ' +
      'design you cannot measure, and simple, redundant code is the only kind you can reason ' +
      'about correctly without running it. Cleverness needs a profiler. This had to be right on ' +
      'paper.',
    cost:
      'Whiteboarding has no feedback mechanism. You can be far off base and not learn it until ' +
      'execution starts — the one phase with no slack, so a wrong assumption would surface ' +
      'exactly where it was least affordable. It also meant optimising for something other than ' +
      'performance, which was new to me and is still the habit I argue myself into.',
    outcome:
      'The first pass after whiteboarding came in above 96% coverage. Of roughly 1,400 scenarios ' +
      'exercised, 3 required reworking the architecture.',
  },
  {
    slug: 'two-phase-schema',
    title: 'A schema change that could not be atomic',
    domain: 'Retail',
    context:
      'Device telemetry from the stores of a large retailer, reporting into backend services. The ' +
      'event schema was being revised, and the devices sending those events spanned several ' +
      'hardware generations.',
    constraint:
      'The rollout could not be made uniform. Sites updated on their own schedule, so for a ' +
      'period every schema version was live in some locations and absent in others, and an ' +
      'older-generation device meeting the new shape would fail the entire transaction. The worse ' +
      'case was quieter: some of those events did not fail at all. They passed validation and ' +
      'carried the wrong thing. A loud failure after a rollout is an incident with a timestamp; a ' +
      'false positive is a number somebody trusts.',
    options: [
      {
        label: 'Serve multiple schema versions from the registry',
        detail:
          'The standard answer, and what a registry is for: pin older generations to the shape ' +
          'they understand. It also turns a loud failure into a mismatch between versions — the ' +
          'silent kind, and silence was already the failure we most wanted gone.',
        conventional: true,
      },
      {
        label: 'Make every schema change land everywhere at once',
        detail:
          'Treats the uneven rollout as the defect and fixes the deployment instead of the data. ' +
          'A costly networking problem, and it makes correctness depend on a guarantee no fleet ' +
          'that size can offer.',
      },
      {
        label: 'Change the schema in two phases',
        detail: 'Widen, confirm, then narrow. Slower by construction, and safe by construction.',
      },
    ],
    decision:
      'We split every schema change in two. The first phase only ever widens: retired fields are ' +
      'marked deprecated but stay present, new fields arrive optional. Nothing breaks, because ' +
      'nothing is required that an old device cannot send. Once the rollout was confirmed to have ' +
      'reached every location, a second phase dropped the deprecated fields and made some of the ' +
      'new ones mandatory. The compatibility window is not a side effect of this design. It is ' +
      'the design.',
    cost:
      'Every schema change now costs two deployments separated by a wait of indefinite length, ' +
      'and the wait is bounded by the slowest site rather than by us. In between, the schema is ' +
      'deliberately ambiguous — deprecated fields still present, new fields not yet guaranteed, ' +
      'every consumer written to tolerate both shapes. We traded the ability to change the schema ' +
      'quickly for the ability to change it without corrupting anything.',
    outcome:
      'Transaction failures following a new rollout fell by more than half — still above the ' +
      'background failure rate, though within its margin of error.',
  },
];
