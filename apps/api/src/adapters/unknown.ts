import type { VendorAdapter, ParseResult } from "./types";

/**
 * Unknown vendor adapter.
 * Known-vendor-only parsing does not apply; the adaptive AI path owns this.
 * This adapter reports that no deterministic intents could be extracted and
 * signals that AI interpretation should be used.
 */
export class UnknownAdapter implements VendorAdapter {
  vendor = "unknown" as const;

  parse(content: string, fileName: string): ParseResult {
    return {
      intents: [],
      vendor: "unknown",
      parseNotes: [
        "No known vendor syntax detected. Routing to adaptive AI interpretation workflow.",
      ],
    };
  }
}
