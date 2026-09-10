export class ApiConfigurationError extends Error {
  constructor(message?: string) {
    super(
      message ??
        "No API backend is configured. On GitHub Pages the app runs in demo mode (in-browser engine) and never requires VITE_API_URL."
    );
    this.name = "ApiConfigurationError";
  }
}

/**
 * GitHub Pages is static only and the NEXUS-COMPLY demo must never call /api
 * there. Detecting the host at runtime guarantees demo mode even if a
 * VITE_API_URL repository variable is set (it would otherwise disable it).
 */
export const RUNS_ON_GITHUB_PAGES =
  typeof window !== "undefined" && window.location.hostname.toLowerCase().endsWith("github.io");

import { demoResponse } from "./demoApi";

const configured = (import.meta.env.VITE_API_URL as string | undefined)?.trim();

export const API_BASE: string | null = configured
  ? configured.replace(/\/+$/, "")
  : import.meta.env.DEV
    ? "/api"
    : null;

/**
 * DEMO_MODE: when the frontend runs on static hosting (e.g. GitHub Pages)
 * without a separately hosted API, all API calls are served by an in-browser
 * demo engine that mirrors the Express backend (same endpoints, same types,
 * persistable state). It is forced on for GitHub Pages at runtime, and may be
 * enabled explicitly with the VITE_DEMO_MODE=true variable when the API_BASE
 * fallback heuristic does not apply (e.g. local preview of the static build).
 */
export const DEMO_MODE = RUNS_ON_GITHUB_PAGES || import.meta.env.VITE_DEMO_MODE === "true" || API_BASE === null;

export function apiEndpoint(path: string): string {
  const base = API_BASE;
  if (!base) throw new ApiConfigurationError();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export async function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  if (DEMO_MODE) return demoResponse(path, init);
  return fetch(apiEndpoint(path), init);
}