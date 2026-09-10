import type { DemoConfig } from "../types";
import { severityColor, statusColor } from "../utils/cn";

const BASE = import.meta.env.VITE_API_URL ?? "/api";

export async function loadDemoConfigs(): Promise<DemoConfig[]> {
  const res = await fetch(`${BASE}/samples`);
  if (!res.ok) throw new Error("Failed to load demo samples");
  return (await res.json()) as DemoConfig[];
}

export { severityColor, statusColor };