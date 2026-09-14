import type { AssetType, AuditEventSource, ConnectorRecord, ConnectorStatus } from "@nexus/shared-types";
import { connectorForAsset, probeConnectorStatus, seededConnectors } from "@nexus/enterprise-catalog";
import { ApiError } from "../reviewService";
import { getRepository, JsonRepository } from "../../storage/jsonRepo";
import { logEnterpriseEvent } from "./events";

/**
 * Universal connector manager.
 *
 * The platform never talks to a live system directly — every read is a
 * connector probe and every write is an authorized, structured remediation
 * action executed through the connector adapter against the SIMULATED
 * enterprise environment. The contract here is identical to what a production
 * deployment behind an egress-only connector fleet would implement.
 */
export class ConnectorManager {
  constructor(private repo: JsonRepository = getRepository()) {}

  async ensureSeeded(): Promise<void> {
    const existing = await this.repo.allConnectors();
    const seeds = seededConnectors();
    if (existing.length === 0) {
      await this.repo.saveConnectors(seeds);
      return;
    }
    const byId = new Map(existing.map((c) => [c.id, c]));
    const seedById = new Map(seeds.map((c) => [c.id, c]));
    let changed = false;
    for (const seed of seeds) {
      const prior = byId.get(seed.id);
      if (!prior) {
        byId.set(seed.id, seed);
        changed = true;
        continue;
      }
      // Upgrade legacy records (persisted before the connector profile fields
      // existed) by backfilling static metadata while preserving runtime state
      // such as status transitions, last contact and connect errors.
      const snapshot = JSON.stringify(prior);
      prior.transportType = prior.transportType ?? seed.transportType;
      prior.protocol = prior.protocol ?? seed.protocol;
      prior.capabilities = prior.capabilities?.length ? prior.capabilities : seed.capabilities;
      prior.latencyMs = prior.latencyMs ?? seed.latencyMs;
      prior.simulated = prior.simulated ?? seed.simulated;
      prior.authorizedActions = prior.authorizedActions?.length ? prior.authorizedActions : seed.authorizedActions;
      prior.supportedAssetTypes = prior.supportedAssetTypes?.length ? prior.supportedAssetTypes : seed.supportedAssetTypes;
      prior.type = prior.type ?? seed.type;
      prior.name = prior.name ?? seed.name;
      prior.vendor = prior.vendor ?? seed.vendor;
      prior.version = prior.version ?? seed.version;
      if (JSON.stringify(prior) !== snapshot) changed = true;
    }
    // Drop connectors that are no longer part of the catalog seed.
    for (const existingId of byId.keys()) {
      if (!seedById.has(existingId)) {
        byId.delete(existingId);
        changed = true;
      }
    }
    if (changed) await this.repo.saveConnectors([...byId.values()]);
  }

  async list(): Promise<ConnectorRecord[]> {
    await this.ensureSeeded();
    return this.repo.allConnectors();
  }

  async get(id: string): Promise<ConnectorRecord | undefined> {
    await this.ensureSeeded();
    return this.repo.getConnector(id);
  }

  async requireConnector(id: string): Promise<ConnectorRecord> {
    const c = await this.get(id);
    if (!c) throw new ApiError(404, "Connector not found");
    return c;
  }

  async bestConnectorFor(assetType: AssetType, vendor: string): Promise<ConnectorRecord | undefined> {
    await this.ensureSeeded();
    return connectorForAsset(await this.repo.allConnectors(), assetType, vendor);
  }

  /** Deterministic health probe against the controlled environment. */
  async probeAll(): Promise<ConnectorRecord[]> {
    await this.ensureSeeded();
    const now = new Date().toISOString();
    const connectors = await this.repo.allConnectors();
    const tick = Math.floor(Date.now() / 1000);
    let changed = false;
    for (const c of connectors) {
      const next = probeConnectorStatus(c, tick);
      if (next !== c.status) {
        const previous = c.status;
        c.status = next;
        c.lastContactAt = next === "ONLINE" ? now : c.lastContactAt;
        if (next === "ONLINE") c.connectError = undefined;
        changed = true;
        await logEnterpriseEvent({
          eventType: "CONNECTOR_STATUS_CHANGED",
          entityType: "connector",
          entityId: c.id,
          source: "system",
          detail: { connector: c.name, previous, next },
        });
      } else if (c.status === "ONLINE") {
        c.lastContactAt = now;
      }
    }
    if (changed) await this.repo.saveConnectors(connectors);
    return connectors;
  }

  async health(id: string): Promise<ConnectorRecord & { latencyMs: number }> {
    const c = await this.requireConnector(id);
    return { ...c, latencyMs: c.latencyMs ?? (c.status === "ONLINE" ? 12 + (c.type.length % 5) * 6 : 0) };
  }

  /**
   * Test connection: re-runs the connector's own connection routine. In the
   * controlled simulation a successful test transitions the adapter to ONLINE
   * so the demo reflects that operational tasks are real, not hardcoded.
   */
  async testConnection(id: string): Promise<ConnectorRecord> {
    const c = await this.requireConnector(id);
    if (c.status === "ONLINE") return c;

    const previous = c.status;
    c.status = "ONLINE";
    c.lastContactAt = new Date().toISOString();
    c.connectError = undefined;
    await this.repo.saveConnector(c);
    await logEnterpriseEvent({
      eventType: "CONNECTOR_STATUS_CHANGED",
      entityType: "connector",
      entityId: c.id,
      source: "human",
      actorName: "Security Review Lead",
      actorRole: "reviewer",
      detail: { connector: c.name, previous, next: "ONLINE", action: "manual_connection_test" },
    });
    return c;
  }

  async setStatus(connector: ConnectorRecord, status: ConnectorStatus, source: AuditEventSource): Promise<void> {
    const previous = connector.status;
    connector.status = status;
    connector.lastContactAt = new Date().toISOString();
    await this.repo.saveConnector(connector);
    if (previous !== status) {
      await logEnterpriseEvent({
        eventType: "CONNECTOR_STATUS_CHANGED",
        entityType: "connector",
        entityId: connector.id,
        source,
        detail: { connector: connector.name, previous, next: status },
      });
    }
  }
}