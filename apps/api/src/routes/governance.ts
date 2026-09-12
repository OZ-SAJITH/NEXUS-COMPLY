import { Router } from "express";
import {
  getGovernanceDashboard,
  getPassport,
  listOrgProfiles,
  getActiveOrg,
  setActiveOrg,
  resetOrg,
  listFrameworks,
  controlMappingsView,
  listDrift,
  suppressDrift,
  listRegionConflicts,
  listRegulatoryUpdates,
  listScenarios,
  dependencyGraph,
  vendorRiskSummaries,
  listChanges,
  getChange,
  createChange,
  createChangeFromFinding,
  createChangeFromScenario,
  analyzeChange,
  runChangeSimulation,
  requestApproval,
  decideApproval,
  executeChange,
  verifyChange,
  rollbackChange,
  investigateRollback,
  keepChange,
  listExceptions,
  resolveException,
  setChangeFreeze,
  getFreeze,
  getTelemetryForChange,
  changeEvents,
  getAuditTrail,
  getGovernanceEvaluation,
  getGovernanceContext,
  updateGovernanceContext,
  listGovernanceConflicts,
  requestConflictReview,
  getActiveFrameworks,
  getFrameworkEvaluation,
  getFrameworkMappings,
} from "../services/governanceService";
import type { OrganizationProfile } from "@nexus/shared-types";

export const governanceRouter = Router();

governanceRouter.get("/governance/dashboard", async (_req, res) => {
  res.json(await getGovernanceDashboard());
});

governanceRouter.get("/governance/passport", async (_req, res) => {
  res.json(await getPassport());
});

governanceRouter.get("/governance/evaluate", async (_req, res) => {
  res.json(await getGovernanceEvaluation());
});

governanceRouter.get("/governance/context", async (_req, res) => {
  res.json(await getGovernanceContext());
});

governanceRouter.post("/governance/context", async (req, res) => {
  const raw = req.body as OrganizationProfile | { profile: OrganizationProfile };
  const profile = (raw as { profile: OrganizationProfile }).profile ?? (raw as OrganizationProfile);
  res.json(await updateGovernanceContext(profile));
});

governanceRouter.get("/governance/conflicts", async (_req, res) => {
  res.json(await listGovernanceConflicts());
});

governanceRouter.post("/governance/conflicts/:id/review-request", async (req, res, next) => {
  try {
    res.json(await requestConflictReview(req.params.id));
  } catch (err) {
    next(err);
  }
});

governanceRouter.get("/governance/frameworks/active", async (_req, res) => {
  res.json(await getActiveFrameworks());
});

governanceRouter.get("/governance/frameworks/:id/mappings", async (req, res, next) => {
  getFrameworkMappings(req.params.id)
    .then((m) => res.json(m))
    .catch(next);
});

governanceRouter.get("/governance/frameworks/:id", async (req, res, next) => {
  getFrameworkEvaluation(req.params.id)
    .then((f) => res.json(f))
    .catch(next);
});

governanceRouter.get("/governance/organizations", async (_req, res) => {
  res.json(listOrgProfiles());
});

governanceRouter.get("/governance/organizations/active", async (_req, res) => {
  res.json(await getActiveOrg());
});

governanceRouter.post("/governance/organizations", async (req, res) => {
  const raw = req.body as OrganizationProfile | { profile: OrganizationProfile };
  const profile = (raw as { profile: OrganizationProfile }).profile ?? (raw as OrganizationProfile);
  res.json(await setActiveOrg(profile));
});

governanceRouter.post("/governance/organizations/reset", async (_req, res) => {
  res.json(await resetOrg());
});

governanceRouter.get("/governance/frameworks", async (_req, res) => {
  res.json(await listFrameworks());
});

governanceRouter.get("/governance/controls", async (_req, res) => {
  const { GOVERNANCE_CONTROLS } = await import("@nexus/governance-core");
  res.json(GOVERNANCE_CONTROLS);
});

governanceRouter.get("/governance/control-mappings", async (_req, res) => {
  res.json(await controlMappingsView());
});

governanceRouter.get("/governance/drift", async (_req, res) => {
  res.json(await listDrift());
});

governanceRouter.post("/governance/drift/:id/suppress", async (req, res) => {
  res.json(await suppressDrift(req.params.id));
});

governanceRouter.get("/governance/regulatory-updates", async (_req, res) => {
  res.json(await listRegulatoryUpdates());
});

governanceRouter.get("/governance/region-conflicts", async (_req, res) => {
  res.json(await listRegionConflicts());
});

governanceRouter.get("/governance/vendors", async (_req, res) => {
  res.json(await vendorRiskSummaries());
});

governanceRouter.get("/governance/dependency-graph", async (_req, res) => {
  res.json(await dependencyGraph());
});

governanceRouter.get("/governance/scenarios", async (_req, res) => {
  res.json(await listScenarios());
});

governanceRouter.get("/governance/change-requests", async (_req, res) => {
  res.json(await listChanges());
});

governanceRouter.post("/governance/change-requests", async (req, res) => {
  res.status(201).json(await createChange(req.body as never));
});

governanceRouter.post("/governance/change-requests/from-finding", async (req, res) => {
  const { findingId } = (req.body ?? {}) as { findingId?: string };
  if (!findingId) return void res.status(400).json({ error: "findingId is required" });
  res.status(201).json(await createChangeFromFinding(findingId));
});

governanceRouter.post("/governance/change-requests/from-scenario", async (req, res) => {
  const { scenarioId } = (req.body ?? {}) as { scenarioId?: string };
  if (!scenarioId) return void res.status(400).json({ error: "scenarioId is required" });
  res.status(201).json(await createChangeFromScenario(scenarioId));
});

governanceRouter.get("/governance/change-requests/:id/telemetry", async (req, res) => {
  res.json(await getTelemetryForChange(req.params.id));
});

governanceRouter.get("/governance/change-requests/:id/events", async (req, res) => {
  res.json({ items: await changeEvents(req.params.id) });
});

governanceRouter.get("/governance/change-requests/:id", async (req, res, next) => {
  getChange(req.params.id)
    .then((c) => res.json(c))
    .catch(next);
});

governanceRouter.post("/governance/change-requests/:id/analyze", async (req, res, next) => {
  analyzeChange(req.params.id)
    .then((c) => res.json(c))
    .catch(next);
});

governanceRouter.post("/governance/change-requests/:id/simulate", async (req, res, next) => {
  runChangeSimulation(req.params.id)
    .then((c) => res.json(c))
    .catch(next);
});

governanceRouter.post("/governance/change-requests/:id/request-approval", async (req, res, next) => {
  const { comment } = (req.body ?? {}) as { comment?: string };
  requestApproval(req.params.id, comment)
    .then((c) => res.json(c))
    .catch(next);
});

governanceRouter.post("/governance/change-requests/:id/approve", async (req, res, next) => {
  const body = (req.body ?? {}) as {
    approverName?: string;
    approverRole?: string;
    decision?: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
    comment?: string;
    emergency?: boolean;
    emergencyReason?: string;
  };
  decideApproval(
    req.params.id,
    body.approverName ?? "Security Review Lead",
    body.approverRole ?? "Security Engineer",
    body.decision ?? "APPROVED",
    body.comment ?? "",
    { emergency: body.emergency, emergencyReason: body.emergencyReason }
  )
    .then((c) => res.json(c))
    .catch(next);
});

governanceRouter.post("/governance/change-requests/:id/execute", async (req, res, next) => {
  const { executor } = (req.body ?? {}) as { executor?: string };
  executeChange(req.params.id, executor)
    .then((c) => res.json(c))
    .catch(next);
});

governanceRouter.post("/governance/change-requests/:id/verify", async (req, res, next) => {
  const { verifier } = (req.body ?? {}) as { verifier?: string };
  verifyChange(req.params.id, verifier)
    .then((c) => res.json(c))
    .catch(next);
});

governanceRouter.post("/governance/change-requests/:id/rollback", async (req, res, next) => {
  const { reason } = (req.body ?? {}) as { reason?: string };
  rollbackChange(req.params.id, reason)
    .then((c) => res.json(c))
    .catch(next);
});

governanceRouter.post("/governance/change-requests/:id/investigate", async (req, res, next) => {
  investigateRollback(req.params.id)
    .then((c) => res.json(c))
    .catch(next);
});

governanceRouter.post("/governance/change-requests/:id/keep", async (req, res, next) => {
  keepChange(req.params.id)
    .then((c) => res.json(c))
    .catch(next);
});

governanceRouter.get("/governance/exceptions", async (_req, res) => {
  res.json(await listExceptions());
});

governanceRouter.post("/governance/exceptions/:id/resolve", async (req, res, next) => {
  const { action, compensatingControls } = (req.body ?? {}) as {
    action?: "ACCEPT_OVERRIDE" | "REQUEST_REMEDIATION" | "ESCALATE" | "COMPENSATING_CONTROL";
    compensatingControls?: string[];
  };
  resolveException(req.params.id, action ?? "ACCEPT_OVERRIDE", compensatingControls)
    .then((e) => res.json(e))
    .catch(next);
});

governanceRouter.get("/governance/freeze", async (_req, res) => {
  res.json(await getFreeze());
});

governanceRouter.post("/governance/freeze", async (req, res, next) => {
  const { active, reason } = (req.body ?? {}) as { active?: boolean; reason?: string };
  setChangeFreeze(active ?? false, reason)
    .then((f) => res.json(f))
    .catch(next);
});

governanceRouter.get("/governance/audit-trail", async (_req, res) => {
  res.json({ items: await getAuditTrail() });
});