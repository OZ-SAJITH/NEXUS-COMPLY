import type { AuditEventRecord, AuditEventSource, AuditEventType, UserRole } from "@nexus/shared-types";
import { getRepository } from "../../storage/jsonRepo";
import { uniqueId } from "../../utils/helpers";

/**
 * Append-only enterprise audit-trail writer. Use the payload's audit field
 * when the event belongs to a config audit; otherwise pass a synthetic id so
 * the (required) schema field stays meaningful.
 */
export async function logEnterpriseEvent(payload: {
  eventType: AuditEventType;
  entityType: "asset" | "evidence" | "remediation" | "connector" | "finding";
  entityId: string;
  findingId?: string;
  auditId?: string;
  controlId?: string;
  actorId?: string;
  actorName?: string;
  actorRole?: UserRole;
  source: AuditEventSource;
  detail: Record<string, unknown>;
}): Promise<AuditEventRecord> {
  const event: AuditEventRecord = {
    id: uniqueId("evt"),
    eventType: payload.eventType,
    entityType: payload.entityType,
    entityId: payload.entityId,
    findingId: payload.findingId,
    auditId: payload.auditId ?? "",
    controlId: payload.controlId,
    actorId: payload.actorId,
    actorName: payload.actorName,
    actorRole: payload.actorRole,
    source: payload.source,
    at: new Date().toISOString(),
    detail: payload.detail,
  };
  return getRepository().appendAuditEvent(event);
}

export function simulatedDelay(ms = 200): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}