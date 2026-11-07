type Case = { case_id: string; repeat: number; input: any; expected: any };

export async function main(c: Case, run: any, judge_model = "", anthropic_key = "") {
  const checks: Record<string, number> = { completed: run.ok ? 1 : 0 };

  if (c.expected?.equals !== undefined) {
    checks.exact = JSON.stringify(run.result) === JSON.stringify(c.expected.equals) ? 1 : 0;
  }

  if (Array.isArray(c.expected?.contains) && c.expected.contains.length > 0) {
    const text = JSON.stringify(run.result ?? "").toLowerCase();
    const hits = c.expected.contains.filter((s: string) =>
      text.includes(String(s).toLowerCase()),
    );
    checks.contains = hits.length / c.expected.contains.length;
  }

  const checklist: string[] = Array.isArray(c.expected?.checklist) ? c.expected.checklist : [];
  const judgeConfigured = Boolean(judge_model && anthropic_key);
  const hasRealCheck = Object.keys(checks).some((k) => k !== "completed");

  let notes: string | null = null;
  let judge_skipped = false;

  if (checklist.length > 0) {
    if (judgeConfigured && run.ok) {
      const judged = await judge(anthropic_key, judge_model, c, run, checklist);
      checks.judge = judged.score;
      notes = judged.notes;
    } else {
      judge_skipped = true;
    }
  }

  // A case whose only expectation is a checklist cannot be scored without a
  // judge. Scoring it on `completed` alone would hand it a free 1.0 and
  // inflate the baseline, so report it as unscored instead.
  if (judge_skipped && !hasRealCheck) {
    return {
      case_id: c.case_id,
      repeat: c.repeat,
      scored: false,
      score: null,
      checks,
      judge_skipped: true,
      reason: "checklist-only case, no judge configured",
      judge_notes: null,
      latency_ms: run.latency_ms,
    };
  }

  const values = Object.values(checks);
  const score = values.reduce((a, b) => a + b, 0) / values.length;

  return {
    case_id: c.case_id,
    repeat: c.repeat,
    scored: true,
    score,
    checks,
    judge_skipped,
    judge_notes: notes,
    latency_ms: run.latency_ms,
  };
}

async function judge(key: string, model: string, c: Case, run: any, checklist: string[]) {
  const prompt = [
    "You are grading one run of an automated workflow. Be strict.",
    `Input: ${JSON.stringify(c.input)}`,
    `Output: ${JSON.stringify(run.result)}`,
    "Checklist, each item passes or fails:",
    ...checklist.map((x, i) => `${i + 1}. ${x}`),
    'Reply with JSON only: {"passed":[1,2],"failed":[],"notes":"one sentence"}',
  ].join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const body: any = await res.json();
  const text = body?.content?.[0]?.text ?? "{}";
  const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));

  return {
    score: (parsed.passed?.length ?? 0) / checklist.length,
    notes: String(parsed.notes ?? ""),
  };
}