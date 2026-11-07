# Flow regression gate

A Windmill flow that regression-tests other Windmill flows, and blocks when
they get worse.

Windmill already has AI agent evals, and they're good. You get datasets, code
scorers and AI judges, per-scorer thresholds, immutable run history and a
compare-to-baseline view. Two things they don't do. They only attach to
reusable `ai_agent` resources, so a flow with no agent step can't be evaluated
at all. And nothing they produce can block anything. The docs say it plainly:
comparisons are shown and you decide what to do with them.

So the only enforcement available today is someone remembering to look at a
dashboard before they click Deploy. This is the missing half, built out of
Windmill's own primitives. No third-party dependencies, just the Windmill
client, so it runs on any worker with nothing to resolve.

## What it does

You point it at a target flow and a labelled dataset. It runs every case a few
times, scores each run with deterministic checks and optionally an LLM judge,
then compares the whole run against the last known-good baseline it has stored
in Postgres.

It passes when no case dropped beyond tolerance and no case is unstable across
repeats, and the baseline moves forward. It fails when a case regressed or its
score bounced around too much between identical runs, and then it throws,
naming the exact cases that broke, and the baseline stays where it was. It
asks for a human when the overall mean slipped or the dataset changed, pausing
on an approval step before anything is promoted.

Run it on a schedule, or as a gate before you promote a flow to production.

## Inputs

| Input | Required | Default | What it does |
|---|---|---|---|
| `target_flow_path` | yes | | Full path of the flow under test |
| `dataset` | yes | | Labelled cases, `{id, input, expected}` |
| `db` | yes | | Any postgresql resource, this is where baselines live |
| `repeats` | no | 3 | Runs per case, which is how variance gets measured |
| `score_drop_tolerance` | no | 0.02 | How far one case can drop before it counts |
| `max_spread` | no | 0.2 | Score range across repeats before a case is unstable |
| `judge_model` | no | `''` | Leave empty and you get deterministic checks only |

A case's `expected` takes `equals` for an exact output, `contains` for
substring coverage, and `checklist` for the judge. Mix them however you like.
A case scores the mean of whichever checks apply to it.

The `db` resource can live at any path you want. Nothing in the flow assumes a
name.

## Setup

Create a postgresql resource anywhere in your workspace and pass its path in.
The flow creates its own table on the first run, so there's no schema step.
Use a folder path rather than a `u/` path if anyone else or any schedule needs
to run this.

Turning the judge on takes two steps. Store a key:

    wmill variable add f/evals/anthropic_key --value="sk-ant-..." --secret

then point `anthropic_key` in the `score_case` module at
`$var:f/evals/anthropic_key` and pass a `judge_model` when you run.

## Try it

There's a target flow in here to break, `f/demo/support_router`. It routes
support tickets to a queue and an SLA using a regex, which is deliberately
fragile. The dataset has four cases. Three have exact expected outputs. The
fourth is the same billing complaint written differently, which the regex
misses, and that's the one the judge exists for.

    wmill sync push
    wmill flow run f/evals/regression_gate -d @run_args.json

The first run comes back as `review`, because there's no baseline to compare
against yet. Approve it in the Runs view and the baseline gets written. Run it
again and it passes.

Now break the router. Delete `|charged twice` from the regex in
`f/demo/support_router.flow/route.ts`, push, and run the gate:

    <paste docs/failure_output.txt here>

That's the whole point. `free_double_charge` dropped from 1.0 to 0.5 and the
gate tells you which case and by how much. An aggregate that moved from 0.94
to 0.81 would tell you nothing you can act on.

## What I ran into building this

These are all real, all hit while building, and all worth knowing before you
use this.

Running the cases in parallel deadlocks a small worker pool. The gate calls
the target flow and waits for it, so each case holds two workers at once, the
parent that's waiting and the child that's running. Set parallelism to four on
a three-worker instance and every worker ends up holding a parent waiting on a
child that can never be scheduled. Nothing warns you. The loop here is
sequential for that reason, and parallel is only safe when your pool is more
than twice the parallelism.

A `skip_if` on a module that has `suspend` skips the suspend along with it, so
you can't make an approval step conditional that way. The approval here lives
inside a `branchone` branch instead.

`wmill sync push` deletes remote items that aren't in your local files, scoped
to the `includes` pattern in `wmill.yaml`, which covers `f/**` by default. A
resource you created in the UI will be silently removed on the next push. The
resource is tracked as a file here, with its password pointing at a secret
variable so nothing sensitive ends up in git.

There's no per-case timeout. `runFlow` waits for the target to finish, so a
hanging target hangs the gate. Put a timeout on the target flow itself.

A case with only a `checklist` and no judge configured gets reported as
unscored, not scored. Scoring it on "the flow didn't throw" would hand it a
free 1.0 and quietly inflate the baseline, which is worse than admitting you
couldn't score it.

Changing the scorer changes the scores. Turning the judge on moves the
baseline for reasons that have nothing to do with the target flow. The gate
treats that as `review` rather than `pass`, which is right, but you have to
approve it once.

There's one baseline per target flow path. No branch or version dimension yet.

## Why this is a flow and not a feature

It shouldn't be a flow. Everything here except the gate itself already exists
inside Windmill, and gluing it together from the outside means every team that
wants this writes their own slightly different version. I wrote up the
product-side version as a feature request: <issue link>

## Layout

    f/evals/regression_gate.flow/   the gate
    f/demo/support_router.flow/     a target flow to break on purpose
    datasets/support_router.json    four labelled cases
    run_args.json                   example inputs