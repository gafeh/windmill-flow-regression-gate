import * as wmill from "windmill-client";

export async function main(target_flow_path: string, payload: Record<string, any>) {
  const started = Date.now();
  try {
    const result = await wmill.runFlow(target_flow_path, payload);
    return { ok: true, result, latency_ms: Date.now() - started };
  } catch (e: any) {
    return {
      ok: false,
      result: { error: String(e?.message ?? e) },
      latency_ms: Date.now() - started,
    };
  }
}