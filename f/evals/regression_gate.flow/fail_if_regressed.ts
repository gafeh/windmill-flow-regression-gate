export async function main(compare: any) {
  const lines = ["Regression gate failed.", compare.reason, ""];

  for (const r of compare.regressions ?? []) {
    lines.push(`regressed  ${r.case_id}: ${r.was} -> ${r.now}`);
  }
  for (const u of compare.unstable ?? []) {
    lines.push(`unstable   ${u.case_id}: spread ${u.spread} across repeats`);
  }

  lines.push("", `baseline mean ${compare.baseline} , this run ${compare.current}`);
  throw new Error(lines.join("\n"));
}