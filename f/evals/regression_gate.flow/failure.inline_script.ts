export async function main(message: string, step_id: string) {
  return { gate: "failed", step: step_id, message };
}
