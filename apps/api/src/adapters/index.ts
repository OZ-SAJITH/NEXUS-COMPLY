import type { VendorId } from "@nexus/shared-types";
import type { VendorAdapter } from "./types";
import { CiscoAdapter } from "./cisco";
import { FortinetAdapter } from "./fortinet";
import { JuniperAdapter } from "./juniper";
import { UnknownAdapter } from "./unknown";

export type { VendorAdapter, ParseResult } from "./types";

const registry: Record<VendorId, () => VendorAdapter> = {
  cisco: () => new CiscoAdapter(),
  fortinet: () => new FortinetAdapter(),
  juniper: () => new JuniperAdapter(),
  unknown: () => new UnknownAdapter(),
};

export function getIdapter(vendor: VendorId): VendorAdapter {
  const factory = registry[vendor] ?? registry.unknown;
  return factory();
}
