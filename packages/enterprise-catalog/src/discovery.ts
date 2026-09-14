import type {
  AssetRecord,
  AssetStatus,
  DiscoveryResult,
} from "@nexus/shared-types";
import { INVENTORY, toAssetRecord, assetRelationships } from "./catalog";

// ---------------------------------------------------------------------------
// Discovery pipeline — simulated enterprise discovery.
// Creates NEW asset records, updates metadata of EXISTING ones, and advances
// the discovery lifecycle state. It NEVER resets an asset that has already
// been remediated (state is preserved).
// ---------------------------------------------------------------------------

const STAGE_ORDER: AssetStatus[] = ["DISCOVERED", "IDENTIFIED", "CONNECTABLE", "SCANNABLE"];

export function nextDiscoveryStage(current: AssetStatus): AssetStatus {
  const idx = STAGE_ORDER.indexOf(current);
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return STAGE_ORDER[STAGE_ORDER.length - 1];
  return STAGE_ORDER[idx + 1];
}

export function runDiscovery(assets: AssetRecord[]): DiscoveryResult {
  const now = new Date().toISOString();
  const runId = `disc-${Date.now().toString(36)}`;
  const existingById = new Map(assets.map((a) => [a.id, a]));
  const relationships = assetRelationships();
  const result: AssetRecord[] = [];
  const notes: string[] = [];
  let discovered = 0;
  let updated = 0;
  let unchanged = 0;

  for (const seed of INVENTORY) {
    const existing = existingById.get(seed.id);
    if (!existing) {
      const asset = toAssetRecord(seed, relationships);
      asset.lastDiscoveredAt = now;
      asset.status = "DISCOVERED";
      asset.discoveryStatus = "DISCOVERED";
      result.push(asset);
      discovered += 1;
      notes.push(`Discovered ${seed.name} (${seed.assetType}, ${seed.region}/${seed.site}).`);
      continue;
    }

    const updatedName = existing.name !== seed.name;
    const updatedIp = existing.ipAddress !== seed.ipAddress;
    const nextStage = nextDiscoveryStage(existing.discoveryStatus);
    if (updatedName || updatedIp || nextStage !== existing.discoveryStatus) {
      existing.lastDiscoveredAt = now;
      existing.status = nextStage;
      existing.discoveryStatus = nextStage;
      existing.history = [
        ...existing.history,
        { at: now, action: `Discovery advanced to ${nextStage}`, actor: "Discovery Engine" },
      ];
      updated += 1;
      notes.push(`Advanced ${seed.name} → ${nextStage}.`);
    } else {
      unchanged += 1;
    }
    result.push(existing);
  }

  return {
    runId,
    startedAt: now,
    completedAt: new Date().toISOString(),
    discovered,
    updated,
    unchanged,
    assets: result,
    notes,
  };
}

export interface DiscoveryTarget {
  assetId: string;
  name: string;
  conn_ok: boolean;
}

/**
 * Advances a freshly-discovered estate directly to the SCANNABLE stage so a
 * new portfolio opens in a live, active state (identified, connectable via
 * ONLINE connectors, ready to scan) instead of an all-DISCOVERED inventory.
 * Observed state is never reset — only the lifecycle is matured.
 */
export function matureEstate(assets: AssetRecord[]): AssetRecord[] {
  const now = new Date().toISOString();
  return assets.map((a) => ({
    ...a,
    status: "SCANNABLE",
    discoveryStatus: "SCANNABLE",
    lastDiscoveredAt: a.lastDiscoveredAt ?? now,
    history: [
      ...a.history,
      { at: now, action: "Estate matured: assets identified, connected and scannable via ONLINE connectors.", actor: "Discovery Engine" },
    ],
  }));
}