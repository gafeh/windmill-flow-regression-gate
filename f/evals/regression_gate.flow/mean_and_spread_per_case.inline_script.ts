export async function main(rows: any[]) {
  const scored = rows.filter((r) => r.scored !== false && typeof r.score === "number");
  const unscored_cases = [
    ...new Set(rows.filter((r) => r.scored === false).map((r) => r.case_id)),
  ];

  const byCase: Record<string, number[]> = {};
  for (const r of scored) {
    (byCase[r.case_id] ??= []).push(r.score);
  }

  const cases = Object.entries(byCase).map(([case_id, scores]) => {
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    return {
      case_id,
      mean,
      spread: Math.max(...scores) - Math.min(...scores),
      runs: scores.length,
    };
  });

  const mean = cases.length ? cases.reduce((a, c) => a + c.mean, 0) / cases.length : 0;

  return { mean, cases, unscored_cases, rows };
}