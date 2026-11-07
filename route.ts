export async function main(text: string, tier = "free") {
  const urgent = /refund|charged twice|outage|cannot log in/i.test(text);
  if (tier === "enterprise") return { queue: "priority", sla_hours: 1 };
  if (urgent) return { queue: "billing", sla_hours: 4 };
  return { queue: "general", sla_hours: 24 };
}