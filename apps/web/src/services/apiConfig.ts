export class ApiConfigurationError extends Error {
  constructor(message?: string) {
    super(
      message ??
        "This deployment has no API backend configured. Repository variable VITE_API_URL must point at the hosted NEXUS-COMPLY API (e.g. https://nexus-api.example.com), then redeploy the Pages workflow."
    );
    this.name = "ApiConfigurationError";
  }
}

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
 * persistable state). Enable explicitly with the VITE_DEMO_MODE=true variable.
 */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true" || API_BASE === null;

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