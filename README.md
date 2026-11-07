# Flow regression gate

A reusable Windmill flow that regression-tests other Windmill flows, and
blocks when they get worse.

Windmill's AI agent evals give you datasets, code scorers and AI judges,
per-scorer thresholds, immutable run history and baseline comparison. They're
good. Two things they don't do: they attach only to reusable `ai_agent`
resources, so a flow with no agent step can't be evaluated at all, and nothing
they produce can block anything. The docs are explicit that comparisons are
shown and the operator decides.

This closes both, built from Windmill primitives and Windmill's own client.
No third-party dependencies, so it runs on any worker with nothing to resolve.

## What it does

Point it at a target flow and a labelled dataset. It runs every case N times,
scores each run with deterministic checks plus an optional LLM judge, and
compares the run against the last known-good baseline stored in Postgres.

Three outcomes:

- **pass** if no case dropped beyond tolerance and no case is unstable across
  repeats. The baseline moves.
- **fail** if any case regressed or any case's score range across repeats
  exceeds the bound. The flow throws, naming the specific cases that broke
  rather than reporting one aggregate number. The baseline does not move.
- **review** if the overall mean slipped or the dataset changed. The flow
  suspends for human approval before the baseline moves.

Run it on a schedule, or as a gate before promoting a flow to a production
workspace.

## Inputs

| Input | Required | Default | What it does |
|---|---|---|---|
| `target_flow_path` | yes | | Full path of the flow under test |
| `dataset` | yes | | Labelled cases, `{id, input, expected}` |
| `db` | yes | | Postgresql resource holding baselines |
| `repeats` | no | 3 | Runs per case, used to measure variance |
| `score_drop_tolerance` | no | 0.02 | How far one case may drop before it's a regression |
| `max_spread` | no | 0.2 | Max score range across repeats before a case is unstable |
| `judge_model` | no | `''` | Empty means deterministic checks only |

A case's `expected` supports `equals` for exact output, `contains` for
substring coverage, and `checklist` for the LLM judge. Any combination.
A case's score is the mean of whichever checks apply.

## Setup

Create a Postgresql resource at `f/evals/baseline_db`. The flow creates its own
table on first run, so there's no schema step. Use a folder path rather than a
`u/` path, or scheduled runs and other users won't be able to read it.

To turn the judge on:

    wmill variable add f/evals/anthropic_key --value="sk-ant-..." --secret

then set `anthropic_key` in the `score_case` module to
`$var:f/evals/anthropic_key` and pass a `judge_model`.

## Try it

The repo includes a deliberately simple target flow, `f/demo/support_router`,
which routes support tickets by urgency and tier using a regex, and a
four-case dataset for it. Three cases have exact expected outputs. The fourth
is a paraphrased billing complaint the regex misses, which is why the judge
exists.

    wmill sync push
    wmill flow run f/evals/regression_gate -d '@run_args.json'

First run returns `review`, because there's no baseline yet. Approve it in the
Runs view and the baseline is written. Second run passes.

Now delete `|charged twice` from the regex in
`f/demo/support_router.flow/route.ts`, push, and run the gate again. It fails
like this:

    <paste docs/failure_output.txt here>

Naming the broken case is the whole point. An aggregate score that moved from
0.94 to 0.81 tells you nothing about what to fix.

## Known limits

- No per-case timeout. `runFlow` waits for the target flow to finish, so a
  hanging target hangs the gate. Set a timeout on the target flow itself.
- Changing the scorer changes the scores, so turning the judge on moves the
  baseline for reasons unrelated to the target flow. The gate treats that as
  `review` rather than `pass`, which is correct, but a human has to approve
  it once.
- One baseline per target flow path. No branch or version dimension yet.

## Why this is a flow and not a product feature

It shouldn't be a flow. Everything here except the gate itself already exists
inside Windmill. I filed the product-side version as a feature request:
<issue link>

## Layout

    f/evals/regression_gate.flow/   the gate
    f/demo/support_router.flow/     a target flow to break on purpose
    datasets/support_router.json    four labelled cases
    run_args.json                   example inputs