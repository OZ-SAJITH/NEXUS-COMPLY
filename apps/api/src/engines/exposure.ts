import type {
  AuditRecord,
  ExposureNode,
  ExposurePath,
  Finding,
} from "@nexus/shared-types";
import { isSourceRestricted } from "@nexus/security-intent";

/**
 * Builds an explanatory "potential exposure path" for a failing finding.
 * This is for explainability and prioritization — it does NOT claim a real
 * compromise occurred.
 */
export function buildExposurePath(audit: AuditRecord, finding: Finding): ExposurePath | null {
  if (finding.status !== "FAIL") return null;

  const adminIntents = audit.intents.filter(
    (i) => i.intentType === "RESTRICT_ADMIN_ACCESS" || i.intentType === "SECURE_MANAGEMENT_INTERFACE"
  );

  const isAdmin = adminIntents.length > 0;
  const adminExposure = adminIntents.some((i) => !i.source || !isSourceRestricted(i));

  if (isAdmin) {
    const path: ExposureNode[] = [];

    if (adminExposure) {
      path.push({ label: "Internet", type: "external", detail: "Unrestricted source permitted" });
      path.push({ label: "Edge Firewall", type: "network", detail: "Management port open" });
    } else {
      path.push({ label: "Approved Network", type: "network", detail: "10.0.0.0/24" });
      path.push({ label: "Edge Firewall", type: "network", detail: "Management allowed" });
    }

    const proto = adminIntents[0].protocol?.toUpperCase() ?? "SSH";
    path.push({ label: proto, type: "service", detail: "Management protocol" });
    path.push({ label: "Admin Device", type: "device", detail: "Device management plane" });
    path.push({ label: "Critical Server", type: "asset", detail: "Reachable after admin compromise" });

    return {
      findingId: finding.id,
      controlId: finding.controlId,
      title: adminExposure ? "Potential Administrative Exposure" : "Administrative Access Path",
      warning: adminExposure
        ? "Potential exposure path — administrative services reachable from an untrusted source."
        : "Approved administrative access path.",
      path,
      potential: true,
    };
  }

  // Generic path for non-admin findings
  const path: ExposureNode[] = [
    { label: "External Source", type: "external", detail: "Unverified" },
    { label: "Network Stack", type: "network", detail: finding.where },
    { label: "Device", type: "device", detail: finding.controlName },
    { label: "Internal Assets", type: "asset", detail: "Lateral movement risk" },
  ];

  return {
    findingId: finding.id,
    controlId: finding.controlId,
    title: `Potential Exposure — ${finding.controlName}`,
    warning: "Potential exposure path for explainability and prioritization. Not a confirmed compromise.",
    path,
    potential: true,
  };
}
