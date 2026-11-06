# Code quality

The standard every change in this repository is held to, whoever makes it. `RULES.md` holds what
the tool counts and why; `CLAUDE.md` holds the facts about the tree (build, traps, Firefly
behaviour, test layers); this file holds how code is written and judged. It applies to
TypeScript, shell, YAML and build files alike; a rule that names a language is an example, not a
limit. Where this file and `RULES.md` or a `CLAUDE.md` fact disagree, they win: they record a
decided rule or a measured constraint, and the rule here is the default.

## Scope

- **New code and edited code meet the standard.** The unit being changed (the function; the
  class or module when the change adds, removes or re-signs its members) may be brought to
  standard as part of the change, in its own commit when the clean-up is larger than the change.
  Untouched code is left alone: no drive-by reformatting, renaming or restructuring the change
  doesn't need. Making the unit testable is part of changing it; making untouched code testable
  is its own task.
- **Rules about signatures apply where this repo owns the signature.** A shape dictated by a
  dependency (the Firefly SDK's request and response types, the Anthropic SDK's tool schema,
  commander's action callbacks, inquirer's prompt options) keeps its names, arguments and
  nullability; the standard shapes what is new.
- **Published contracts stay.** The `--json` document (`schemaVersion`), the `config.yaml` keys,
  the CLI command names, aliases and flags, and the `btk` exit codes are used by the owner's
  scripts. A breaking change to one is a deliberate, versioned change (`CLAUDE.md`), never a
  side effect of a clean-up.
- **A refactor meant to change nothing is its own commit**, verified by the unit, scenario and
  (when Firefly interaction is touched) e2e suites passing unchanged.

## Principles

- **KISS.** The smallest change that solves the actual problem. No speculative abstraction,
  configuration nobody asked for, or framework where a function will do. A change that needs a
  long explanation usually has a simpler shape.
- **DRY.** Every fact and every rule lives in one place: a classification rule in `RULES.md` and
  `TransactionClassificationService`, a total in `TransactionCalculationUtils`, a config default in
  `config.defaults.ts`, observed Firefly behaviour in `firefly-contract.ts`. Before adding a
  helper, constant, type or mock, search for the existing one and reuse or extend it. Duplicate
  only when a tool or build constraint forces it (the hand-derived scenario literals are one), and
  say so at the duplicate.
- **Fix the cause, not the symptom.** Understand why something fails before changing it. A retry,
  a sleep or a null check added to make a failure go away hides a defect; it is not a fix.
- **Nothing fragile.** No patching `node_modules`, timing-dependent waits, or reliance on
  undocumented Firefly or SDK behaviour, except where `test-harness/VERIFICATION.md` records it and
  `firefly-contract.ts` pins it. If the only route is fragile, stop and raise it.
- **Delete rather than disable.** Remove dead code, exports, flags, files and configuration instead
  of switching them off, after checking nothing (tests, scripts, the e2e harness, the `--json`
  consumers) still depends on them.
- **One change per commit.** Refactors, behaviour changes and dependency bumps are separate
  commits unless inseparable. A reviewer can say what a commit does in one line.

## Naming

- **A name says what the thing is or does, at the level its reader thinks at.**
  `unbudgetedExpenses`, not `list`; `isBill()`, not `check()`; `MAX_PAGE_SIZE`, not `500`. A name
  that needs a comment is the wrong name.
- **One word per concept.** Don't mix `fetch`, `retrieve` and `get` for the same operation. File
  and class role suffixes follow what the surrounding directory uses for that role:
  `*.service.ts` / `…Service` for injected collaborators, `*.utils.ts` for stateless functions,
  `*.dto.ts` for report data, `*.serializer.ts` for `--json` output, `*.command.ts` for a CLI
  command, `*.types.ts` for shared types.
- **Length follows scope.** A loop index can be `i`; a field, an export or anything read far from
  its declaration gets a full name. No abbreviations the reader has to decode, no encodings
  (`strName`, `_count`, Hungarian notation), no noise words (`data`, `info`, `object`, `theX`).
  New interfaces don't take an `I` prefix; the existing `I*` service interfaces keep theirs until
  their module is reworked.
- **Booleans read as predicates** (`isEmpty`, `hasBudget`, `canSplit`), never as negatives that
  invite double negation (`isNotReady`).
- **Say what, not how.** `cachedBudgets`, not `budgetMap`; the type is in the declaration.

## Functions

- **Small, doing one thing, at one level of abstraction.** The test: if a section can be named,
  it is a function waiting to be extracted. Length past about twenty lines, or nesting past two
  levels (a callback body counts as a level), is the signal to extract.
- **Few arguments.** Zero to two is the norm; three is the ceiling before the arguments become an
  options object. No flag arguments: a boolean that switches behaviour is two functions.
- **Command-query separation.** A function either does something or answers something. Commands
  return nothing (or `Promise<void>`); the exceptions are builders and fluent APIs, which return
  the receiver. A function called `validate` doesn't also save; a getter doesn't mutate.
- **No output arguments.** Return the result; don't fill a passed-in array or object.
- **Read top-down.** The exported or public operation first, the helpers it calls below it, each
  one level more detailed; a reader shouldn't scroll up to understand.
- **Polymorphism when the set of types grows; a `switch` when the set of operations grows.** A
  `switch` on a kind appears once, exhaustive (a `never` default), in the place that maps the kind
  to behaviour, not repeated through callers. A `Record<Kind, …>` table is the TypeScript form of
  "add a row, not a branch".
- **Early return over deep nesting**; guard clauses first, the main path unindented.

## Classes and modules

- **Single responsibility.** A class or module has one reason to change. If describing it needs
  "and", or its name is `Utils`, `Helper` or `Manager` with no noun before it, it does several
  jobs.
- **Cohesion.** Methods use the fields of their class; a group of methods that uses only some of
  the fields is another class. A field that exists only to pass state between private methods is
  a parameter. A class with no state is a module of functions.
- **Open for extension, closed for modification.** Adding a case (a bucket, a display section, a
  config key, a JSON field) should add a function or a table row, not edit every consumer.
- **Inject collaborators through the constructor**, wired once in `ServiceFactory` (or
  `command.factory.ts`). `ConfigManager.getInstance()` and other static lookups belong only to
  entry points (`cli.ts`, the factories' defaults); a service never loads its own configuration.
- **Tell, don't ask.** Objects expose behaviour, not internals. Data structures (DTOs, the
  `--json` types, config types, SDK models) expose data and carry no logic; don't make hybrids.
- **Law of Demeter, for objects.** A method talks to its fields, its parameters, objects it creates
  and its own class, not to the results of results (`a.getB().getC().doIt()`). Navigating a data
  structure (`transaction.attributes.transactions[0].amount`) is not a chain of behaviour and is
  fine, but a navigation repeated in several places is a helper waiting to be written.
- **Prefer immutability.** `readonly` fields and properties, `const`, `ReadonlyArray`, no
  mutation of arguments. Mutable shared state is the exception, documented at its declaration
  with who mutates it.
- **Visibility as narrow as the code allows.** Export only what another module imports; members
  are `private` unless a caller needs them. Tests reach a unit through its public surface, not by
  widening it.
- **Types carry the contract.** No `any` in `src/`; `unknown` and narrowing at the boundary
  instead. No non-null assertions (`!`) or `as` casts to silence the compiler where a guard or a
  better type would do; a cast that remains says why.

## Comments

- **Comments record what the code cannot**: a trap, a measured fact, a reason for a non-obvious
  choice, a rule id (`R-XFER-1`), a contract the type system can't express. They don't restate the
  code, narrate history, apologise, or mark who changed what.
- **A comment is a failure to express it in code, until proven otherwise.** Before writing one,
  try a better name, a smaller function or an explicit constant. Before calling work done, delete
  every comment that an earlier version of the code needed and this one doesn't.
- **No commented-out code**, no TODOs in code (raise unfinished work with the user), no banners,
  no closing-brace comments, no TSDoc that repeats the signature. TSDoc on exported API is for the
  contract: preconditions, what `undefined`/`null` means, side effects, what is thrown.

## Error handling and absence

- **Use exceptions for failures, not return codes or sentinel values.** Throw where the problem is
  detected, catch where it can be handled, never swallow. A catch that only logs needs a reason.
  `Result<T, E>` (`src/types/result.type.ts`) is for an expected outcome the caller must branch
  on (validation the user reads, an analysis that may legitimately fail); keep it where the
  surrounding code uses it, and don't mix the two styles in one call chain.
- **Error handling is one thing.** A `try` block holds one call's worth of work; the body is a
  function if it is more. A function that handles errors does nothing else.
- **Errors carry context**: what was attempted, with which identifiers (transaction id, month,
  account), so the message alone locates the failure. Define error types by what the caller can do
  with them, not by where they were thrown. Wrap a dependency's error once, at the boundary that
  calls it, with `cause` set.
- **Absence has one spelling per meaning.** Return an empty array rather than `null` or
  `undefined` for "none"; use `undefined` (optional properties, `?:`) for "not set"; reserve
  `null` for a value that deliberately means "counted nowhere" or mirrors an SDK field. A new
  optional parameter is a smell: often it is two functions.
- **Fail fast at the boundary, trust inside.** Validate where input enters (CLI arguments, config
  loading, Firefly and Claude responses, prompts), then stop re-checking the same invariant in
  every private method.
- **Resources are closed where they are opened** (`try`/`finally`), and spinners, timers and
  servers are stopped on every path.

## Boundaries

- **Wrap what may be replaced.** An API with its own release cadence that could be bumped or
  swapped is used through a thin layer this repo controls, so the change lands in one place: the
  Firefly SDK through `src/services/core/` and `fetchAllPages`, Anthropic through `ClaudeClient`,
  inquirer through `UserInputService`, pino through `logger.ts`. Platform libraries (Node, chalk,
  commander in `cli.ts`) are used directly.
- **Firefly behaviour is evidence, not assumption.** A new reliance on how Firefly behaves is
  verified against a real instance, recorded in `test-harness/VERIFICATION.md` and pinned in
  `firefly-contract.ts`, so the next Firefly version can't change it silently.
- **Learn an unfamiliar API with a test**, and keep the test: it documents the behaviour relied on
  and catches the next version changing it.
- **Generated files are not edited by hand**: `dist/` comes from `npm run compile`,
  `package-lock.json` from npm.

## Tests

- **A behaviour change ships with its test, written with the code, not after**; a bug fix ships
  with the test that failed before the fix. A change to what is counted names the rule id in the
  test title (`CLAUDE.md`, "Testing").
- **Tests are as clean as production code**: they are read far more often than written. One
  behaviour per test, with set-up, action and assertion visible in that order; readable fixtures
  over clever ones. Reuse the shared builders and mock factories in `__tests__/shared/` rather
  than hand-rolling another. When one assertion needs a paragraph of set-up, the code under test
  has too many dependencies: fix that, not the test.
- **The name states the behaviour** (`returns an empty list when the month has no bills`); never
  a number or the method under test alone (`getBills 2`). Existing names stay.
- **Fast, independent, repeatable.** No order dependence, no shared mutable fixtures, no sleeps,
  real clocks, network or filesystem where a fake will do. A test that passes alone and fails in
  the suite is a defect in the test.
- **Mock boundaries, not the thing under test.** Inject mocks of the collaborators the class talks
  to (`jest.mock` is inert under ESM; `CLAUDE.md`); never mock the class itself, value objects or
  Node built-ins. Verify behaviour the caller can observe, not call order or private detail.
- **Expected values are never computed by the code under test** (`CLAUDE.md`, "The scenario is
  the single source of truth").

## Verification

- Every change is verified before it is called done: `npm test`, `npm run typecheck:tests` and
  `npx eslint .` pass.
- When runtime behaviour changes, run the CLI (`npm run start:dev -- …` against the local Docker
  Firefly) and exercise the change; when Firefly interaction changes, run `npm run test:e2e`.
  Passing unit tests alone do not prove it works.
- Report results as they are: failing or skipped checks are stated, not glossed over.

## Checkpoints and code review

After each batch of changes, and before any pull request:

1. Run the full verification above.
2. Review the whole diff since the previous checkpoint, uncommitted work included, against this
   file, `RULES.md` and `CLAUDE.md`, using the most capable available model as the reviewer. The
   reviewer checks `RULES.md` and `CLAUDE.md` before flagging a deliberate choice as a defect.
3. Judge each review suggestion on its merits and record it as **needed** or **not needed**, with
   the reason. A suggestion is not needed when it conflicts with this file, `RULES.md` or
   `CLAUDE.md`, contradicts measured behaviour, or adds complexity without fixing a real defect.
4. Fix the needed ones, re-run the affected checks, and commit those fixes separately from the work
   they review.
