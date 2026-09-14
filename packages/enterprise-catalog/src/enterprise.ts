import type {
  AssetCriticality,
  AssetType,
  ConnectorType,
  EnterpriseRegion,
  NetworkTier,
  TierInfo,
} from "@nexus/shared-types";

// ---------------------------------------------------------------------------
// Enterprise topology — Global → Region → Site → Network Zone → Tier
// Deterministic simulated enterprise. Never hardcoded to one geography.
// ---------------------------------------------------------------------------

export const REGIONS: EnterpriseRegion[] = [
  {
    code: "IND",
    label: "India",
    flag: "🇮🇳",
    sites: [
      { id: "site-chennai", label: "Chennai", region: "IND", timezone: "Asia/Kolkata", zones: ["DMZ", "CORE", "APP", "DATA", "MGMT"] },
      { id: "site-mumbai", label: "Mumbai", region: "IND", timezone: "Asia/Kolkata", zones: ["DMZ", "CORE", "APP", "DATA", "MGMT"] },
    ],
  },
  {
    code: "USA",
    label: "United States",
    flag: "🇺🇸",
    sites: [
      { id: "site-virginia", label: "Virginia", region: "USA", timezone: "America/New_York", zones: ["DMZ", "CORE", "APP", "DATA", "MGMT"] },
      { id: "site-newyork", label: "New York", region: "USA", timezone: "America/New_York", zones: ["DMZ", "CORE", "APP", "DATA", "MGMT"] },
      { id: "site-oregon", label: "Oregon", region: "USA", timezone: "America/Los_Angeles", zones: ["DMZ", "CORE", "APP", "DATA", "CLOUD"] },
    ],
  },
  {
    code: "SGP",
    label: "Singapore",
    flag: "🇸🇬",
    sites: [
      { id: "site-singapore", label: "Singapore-1", region: "SGP", timezone: "Asia/Singapore", zones: ["DMZ", "CORE", "APP", "DATA", "MGMT"] },
    ],
  },
];

export const TIERS: TierInfo[] = [
  { id: "TIER_1", label: "TIER 1 — Restricted Infrastructure", description: "Network edge, firewalls, core routing. Highest trust boundary." },
  { id: "TIER_2", label: "TIER 2 — Application / Services", description: "API gateways, applications, databases, message queues." },
  { id: "TIER_3", label: "TIER 3 — Management & Compliance", description: "Compliance management platform, CMDB, observability." },
];

export function regionByCode(code: string): EnterpriseRegion | undefined {
  return REGIONS.find((r) => r.code === code);
}

export function siteLabel(siteId: string): string {
  for (const r of REGIONS) {
    const s = r.sites.find((x) => x.id === siteId);
    if (s) return s.label;
  }
  return siteId;
}

export function regionLabelOf(regionCode: string): string {
  return REGIONS.find((r) => r.code === regionCode)?.label ?? regionCode;
}

export function flagOf(regionCode: string): string {
  return REGIONS.find((r) => r.code === regionCode)?.flag ?? "🌐";
}

export function zonesFor(siteId: string): string[] {
  for (const r of REGIONS) {
    const s = r.sites.find((x) => x.id === siteId);
    if (s) return s.zones;
  }
  return ["DMZ", "CORE", "APP", "DATA", "MGMT"];
}

// ---------------------------------------------------------------------------
// Asset type metadata
// ---------------------------------------------------------------------------

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  NETWORK_DEVICE: "Network Device",
  ROUTER: "Router",
  SWITCH: "Switch",
  FIREWALL: "Firewall",
  PROXY: "Proxy",
  SERVER: "Server",
  VIRTUAL_MACHINE: "Virtual Machine",
  DATABASE: "Database",
  APPLICATION: "Application",
  API: "API",
  MESSAGE_QUEUE: "Message Queue",
  CLOUD_RESOURCE: "Cloud Resource",
  LOAD_BALANCER: "Load Balancer",
  CERTIFICATE: "Certificate / PKI Asset",
  OTHER: "Other Infrastructure / Service",
};

export const ASSET_TYPE_CATEGORY: Record<AssetType, string> = {
  NETWORK_DEVICE: "Network",
  ROUTER: "Network",
  SWITCH: "Network",
  FIREWALL: "Network",
  PROXY: "Network",
  SERVER: "Server",
  VIRTUAL_MACHINE: "Server",
  DATABASE: "Database",
  APPLICATION: "Application",
  API: "Application",
  MESSAGE_QUEUE: "Messaging",
  CLOUD_RESOURCE: "Cloud",
  LOAD_BALANCER: "Network",
  CERTIFICATE: "PKI",
  OTHER: "Other",
};

export const CATEGORY_ASSET_TYPES: Record<string, AssetType[]> = {
  Network: ["NETWORK_DEVICE", "ROUTER", "SWITCH", "FIREWALL", "PROXY", "LOAD_BALANCER"],
  Server: ["SERVER", "VIRTUAL_MACHINE"],
  Application: ["APPLICATION", "API"],
  Database: ["DATABASE"],
  Messaging: ["MESSAGE_QUEUE"],
  Cloud: ["CLOUD_RESOURCE"],
  PKI: ["CERTIFICATE"],
  Other: ["OTHER"],
};

export function connectorTypeForAsset(assetType: AssetType): ConnectorType {
  if (assetType === "DATABASE") return "DATABASE";
  if (assetType === "MESSAGE_QUEUE") return "MESSAGE_QUEUE";
  if (assetType === "CLOUD_RESOURCE") return "CLOUD";
  if (assetType === "SERVER" || assetType === "VIRTUAL_MACHINE") return "SERVER";
  return "NETWORK";
}

export function assetTypeOfCategory(category: string): AssetType[] {
  return CATEGORY_ASSET_TYPES[category] ?? [category as AssetType];
}

export const CRITICALITY_WEIGHT: Record<AssetCriticality, number> = {
  LOW: 0.2,
  MEDIUM: 0.5,
  HIGH: 0.75,
  CRITICAL: 1.0,
};

export const TIER_LABEL: Record<NetworkTier, string> = {
  TIER_1: "Tier 1",
  TIER_2: "Tier 2",
  TIER_3: "Tier 3",
};

export const DISCOVERY_STAGES: Array<{ status: "DISCOVERED" | "IDENTIFIED" | "CONNECTABLE" | "SCANNABLE"; label: string }> = [
  { status: "DISCOVERED", label: "Discovered" },
  { status: "IDENTIFIED", label: "Identified" },
  { status: "CONNECTABLE", label: "Connectable" },
  { status: "SCANNABLE", label: "Scannable" },
];