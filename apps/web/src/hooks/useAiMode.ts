import { useEffect, useState } from "react";

export type AiMode = "mock" | "live";

/**
 * Queries the AI service provider endpoint to determine whether we are in
 * DEMO (mock) or LIVE mode. Defaults to mock if the service is unreachable.
 */
export function useAiMode(): { mode: AiMode; checked: boolean } {
  const [mode, setMode] = useState<AiMode>("mock");
  const [checked, setChecked] = useState(false);

  const aiUrl =
    ((import.meta.env.VITE_AI_URL as string | undefined)?.trim()?.replace(/\/+$/, "") ??
      (import.meta.env.DEV ? "http://localhost:8000" : null)) ??
    null;

  useEffect(() => {
    if (!aiUrl) {
      setChecked(true);
      return;
    }
    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    fetch(`${aiUrl}/api/ai/provider`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((j: { mode?: string }) => {
        if (alive) setMode(j.mode === "live" ? "live" : "mock");
      })
      .catch(() => {
        if (alive) setMode("mock");
      })
      .finally(() => {
        clearTimeout(timer);
        if (alive) setChecked(true);
      });

    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [aiUrl]);

  return { mode, checked };
}