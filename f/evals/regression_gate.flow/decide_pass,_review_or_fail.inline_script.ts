type Agg = { mean: number; cases: { case_id: string; mean: number; spread: number }[] };
type BaselineRow = { mean: number; per_case: { case_id: string; mean: number }[] };

export async function main(
  baseline_rows: BaselineRow[],
  agg: Agg,
  score_drop_tolerance = 0.02,
  max_spread = 0.2,
) {
  const unstable = agg.cases
    .filter((c) => c.spread > max_spread)
    .map((c) => ({ case_id: c.case_id, spread: Number(c.spread.toFixed(3)) }));

  const prev = baseline_rows?.[0];

  if (!prev) {
    return {
      verdict: "review",
      reason: "no baseline recorded yet, first run needs a human to sign it off",
      baseline: null,
      current: agg.mean,
      regressions: [],
      unstable,
      new_cases: agg.cases.map((c) => c.case_id),
    };
  }

  const base: Record<string, number> = {};
  for (const c of prev.per_case) base[c.case_id] = c.mean;

  const regressions = agg.cases
    .filter((c) => base[c.case_id] !== undefined && c.mean < base[c.case_id] - score_drop_tolerance)
    .map((c) => ({
      case_id: c.case_id,
      was: Number(base[c.case_id].toFixed(3)),
      now: Number(c.mean.toFixed(3)),
    }));

  const new_cases = agg.cases
    .filter((c) => base[c.case_id] === undefined)
    .map((c) => c.case_id);

  let verdict = "pass";
  let reason = "no case dropped beyond tolerance and no case is unstable";
  if (regressions.length > 0 || unstable.length > 0) {
    verdict = "fail";
    reason = "at least one case regressed or is unstable across repeats";
  } else if (new_cases.length > 0 || agg.mean < prev.mean) {
    verdict = "review";
    reason = "overall mean slipped or the dataset changed, needs a human before the baseline moves";
  }

  return { verdict, reason, baseline: prev.mean, current: agg.mean, regressions, unstable, new_cases };
}