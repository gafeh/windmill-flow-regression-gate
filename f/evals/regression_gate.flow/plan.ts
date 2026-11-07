type Case = { id: string; input: Record<string, any>; expected?: any };

export async function main(dataset: Case[], repeats = 3) {
  const out: any[] = [];
  for (const c of dataset) {
    for (let r = 1; r <= repeats; r++) {
      out.push({
        case_id: c.id,
        repeat: r,
        input: c.input,
        expected: c.expected ?? {},
      });
    }
  }
  return out;
}