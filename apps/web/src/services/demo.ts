import type { DemoConfig } from "../types";
import { severityColor, statusColor } from "../utils/cn";
import { fetchApi } from "./apiConfig";

export async function loadDemoConfigs(): Promise<DemoConfig[]> {
  const res = await fetchApi("/samples");
  if (!res.ok) return [];
  return (await res.json()) as DemoConfig[];
}

export { severityColor, statusColor };