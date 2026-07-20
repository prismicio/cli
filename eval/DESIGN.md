# AI evals for the Prismic CLI — vision

Why these evals are shaped the way they are. This is the stable rationale; the code
is the source of truth for how it works and where it currently stands.

## Goal

Measure how well an AI agent accomplishes real tasks with the Prismic CLI, and
track how that changes over time. Two things to watch:

- **Effectiveness** — did it do the task, and was the result good.
- **Efficiency** — turns, tokens, and duration. Not cost; it swings with model and
  provider pricing we don't control.

One agent, one model, configured in one place. No matrix.

## Why vitest, nothing else

The CLI repo already has what an eval harness needs: tests drive the real built
CLI, a throwaway repo is set up and torn down, fixtures isolate each run, and there
are domain matchers. Concurrency, retries, and timeouts are configured.

Eval tools (Evalite, viteval, vitest-evals) mostly solve problems we don't have,
like normalizing many agent SDKs and hosting a dashboard. We have one agent and
want a tool that won't be abandoned. An eval is a plain `it(...)` test with one
extra fixture: an `agent` that drives the CLI instead of hardcoded CLI calls.

## Probe, don't script

An eval seeds a realistic state, gives an under-specified intent, and grades the
outcome — not a fixed sequence of steps. The point is to observe how the agent
discovers the CLI (`--help`, `docs`, command names) and what it produces, then turn
a CLI knob (help text, defaults, naming) and see if behavior moves. The commands
the agent ran matter as much as pass/fail: they are the discovery signal, and the
per-field type it chose is encoded in the `field add` calls.

Spell out steps only when testing execution (can it add a rich text field), not
when testing judgment (does it know a title should be single-heading rich text).

## Measure vs gate

Deterministic correctness is genuinely binary, so it asserts and can hard-fail
(field type, `toHaveRun`). Quality and convention adherence are scores, not
booleans: record and trend them, gate only where we ask for it. The judge gate is a
ratchet: each eval keeps its best score so far as a plain number literal in the test,
and a run passes unless it drops a bucket below that bar. The bar only moves up, and
it lives in the test where you can read it. A better score raises it like a snapshot:
`vitest -u` rewrites the literal in place; a normal run only reports that it could
rise, so a lucky run never silently ratchets and CI never edits source. Because the
literal is the source of truth, `results.jsonl` is written but never read back to
decide anything.

Judge variance makes a single run noisy; the honest unit is the median of several
trials. We don't run trials yet. When we do, the ratchet takes a `candidate` score
and doesn't care where it came from, so an averaging layer above just calls it once
with the median instead of per run.

## Atomic vs workflow evals

- **Atomic capability**: one capability, minimal, clean signal (the field-add
  backbone). Don't bundle extra steps; a second failure mode dilutes the signal.
- **Workflow / intent**: phrased as a developer's intent, checked end to end.

Aim for a pyramid: many cheap atomic evals, a few realistic workflows.

## Environment fidelity

The agent must have the context a real user's agent has, or the eval measures
ignorance instead of capability. It is told the CLI exists via hard-coded guidance
that mirrors the real Prismic skill, so the eval does not depend on the developer's
installed skill, and it runs generic — no personal skills, memory, MCP, or CLAUDE.md
— so we measure the agent, not one machine's setup.

Real agents have file tools, so they can bypass the CLI and hand-edit model JSON.
We can't prevent it, so we detect it: if the model changed but no matching `prismic`
command ran, it edited the JSON directly.
