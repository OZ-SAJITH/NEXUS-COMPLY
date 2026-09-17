# NEXUS-COMPLY — SIH Upgrade Plan (Closed-Loop Enterprise Compliance Orchestration)

> Extension plan for the existing SIH-26155 prototype. Nothing existing is removed or
> rebuilt from scratch; the platform is **extended** from a network-configuration audit
> dashboard into a **global, multi-vendor, multi-asset, closed-loop compliance
> orchestration platform**.

---

## 1. Current Architecture (audit result)

| Layer | Technology | Status |
|---|---|---|
| Frontend | React 18 + Vite 5 + Tailwind 3 + React Three Fiber + Recharts | Working |
| Backend | Express 4 REST API (TypeScript, ESM) | Working |
| Storage | JSON-file repository (`data/db.json`) behind a swappable repository adapter | Working |
| AI | FastAPI service (`apps/ai-service`) mock/live provider + deterministic in-process fallback | Working |
| Auth | Intentionally removed → single built-in `Security Review Lead` identity | Working |
| Monorepo | npm workspaces (`apps/*`, `packages/*`) | Working |

### Existing features (all preserved)
1. **Config-driven network audits** — upload / paste Cisco IOS, Fortinet FortiGate, Juniper Junos configs; deterministic vendor detection, secret redaction, syntax fingerprinting.
2. **Deterministic compliance engine** — 16 `NET-*` controls (`@nexus/compliance-rules`) evaluated from parsed security intents.
3. **Explainable risk** — 5-factor 0–100 scoring (severity 35%, exposure 30%, criticality 15%, importance 10%, exploitability 10%).
4. **Adaptive AI interpretation** — unknown-vendor configs → AI proposes intent → human approves → reusable fingerprint-keyed mapping.
5. **Human-in-the-loop review workflow** — review queue, approve/reject/request-changes/modify/reopen, finalization, per-finding audit trail.
6. **Safe remediation simulation** — `POST /api/remediation/simulate` on in-memory config copies (never mutates real config).
7. **Global compliance policy engine** (`@nexus/governance-core`) — 15 frameworks, 20 governance controls, regional applicability, change governance with approve→execute→verify→rollback lifecycle, exceptions, drift, freeze.
8. **Evidence system** — line-pinned per-finding evidence (file, line range, snippet, reason).
9. **Reports** — self-contained HTML report per audit.
10. **Rich animated UI** — landing page, dashboard, motion design system, Nexus core animations, NetworkGraph, CyberGlobe.
11. **Dashboard** — posture ring, KPIs, top risks, vendor cards, framework cards, AI insights, review flow.
12. **Demo mode** — in-browser demo API (`demoApi.ts` + `demoStore.ts` + `governanceStore.ts`) mirrors backend behavior for static hosting.

### Key gaps found (relative to product vision)
- **No asset model/entity** — assets only appear as decorative graph nodes. No asset CRUD, no discovery.
- **No connector architecture** — no connector entities, health, or adapters.
- **No hierarchical enterprise model** — no Global→Region→Site→NetworkZone→Tier.
- **Evidence exists but is not normalized** into a common evidence model, and is config-line oriented only.
- **Rules are network-config-only** — no TLS/crypto/PKI/DB/API/messaging/cloud controls; rules are not asset-aware.
- **Risk is not explainable per finding** (no reason breakdown).
- **AI does not analyze findings** — it only interprets unknown config syntax.
- **No remediation orchestrator** for asset findings (validate → approve → execute → verify → rollback → audit).
- **No verification/rollback on asset state**; governance change requests operate on config diffs, not asset state.
- **No impact graph** between assets/services/databases.
- **Dashboard lacks** asset posture, global posture, connector health, and remediation metrics.

---

## 2. Proposed Architecture

```
                          NEXUS-COMPLY CORE
                                  |
                    ┌─────────────┴─────────────┐
              Compliance Engine           Remediation Orchestrator
                                  |
                        CONNECTOR MANAGER
        ┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
    Network     Server      Database   Application  Firewall  Message Q   Cloud
    Adapter     Adapter     Adapter    /API Adapter Adapter   Adapter   Adapter
                                  │
                 SIMULATED ENTERPRISE ASSETS (honest, controlled)
        (observed state transitions + verification + rollback in simulation)
```

**New module graph**
```
shared-types (extended)          ← all new contracts
enterprise-catalog (NEW pkg)     ← enterprise topology, asset inventory, connectors,
                                    asset-age controls + evaluation, remediation actions
apps/api (extended)
  ├─ storage/jsonRepo            ← 5 new collections: assets, connectors, evidence,
  │                                 assetScans, remediations
  ├─ services/assetService       ← discovery, scan, impact graph
  ├─ services/connectorManager   ← universal connector interface + health
  ├─ services/remediationService ← validate→approve→execute→verify→rollback
  ├─ services/aiAnalysisService  ← evidence-grounded finding analysis
  ├─ routes/enterprise.ts        ← new REST surface
apps/web (extended)
  ├─ pages/AssetsPage, AssetDetailPage, TopologyPage,
  │   ConnectorsPage, RemediationPage, RemediationDetailPage
  ├─ demo/enterpriseStore.ts     ← browser demo mirror
```

### Honesty principle
- Discovery/scanning/remediation run against a **controlled simulated enterprise**,
  clearly labelled **SIMULATION ENVIRONMENT** in the UI at every action point.
- Remediation executes only structured `ACTION + parameters` via connectors; it never
  runs arbitrary shell commands and never claims production execution.
- A **Production Connector Architecture** is documented so authorized production
  connectors can plug into the same orchestration (connector interface + policy gates).

---

## 3. Files / components touched

### Modify
- `packages/shared-types/src/index.ts` — add asset/connector/evidence/remediation/analysis types.
- `apps/api/src/storage/jsonRepo.ts` — new collections + CRUD.
- `apps/api/src/app.ts` — mount `enterpriseRouter`.
- `apps/api/src/routes/index.ts` — wire router + dashboard extension.
- `apps/api/src/services/dashboardService.ts` — asset/connector/remediation/global-posture metrics.
- `api/index.ts` (Vercel) — nothing required (router is inside `createApp`).
- `apps/api/vitest.config.ts` + `apps/web/vite.config.ts` + `apps/web/tsconfig.json` + `apps/api/tsconfig.json` — alias for `@nexus/enterprise-catalog`.
- `apps/web/src/services/api.ts`, `apps/web/src/services/demoApi.ts`, `apps/web/src/types/index.ts`.
- `apps/web/src/App.tsx` — new routes.
- `apps/web/src/components/AppShell.tsx` — new nav sections + breadcrumbs.
- `apps/web/src/pages/DashboardPage.tsx` — global posture + asset/connector metrics panels.

### Add (packages)
- `packages/enterprise-catalog/` — new workspace package (pure TS).

### Add (backend)
- `apps/api/src/services/assetService.ts`
- `apps/api/src/services/connectorManager.ts`
- `apps/api/src/services/remediationService.ts`
- `apps/api/src/services/aiAnalysisService.ts`
- `apps/api/src/services/riskExplainer.ts`
- `apps/api/src/routes/enterprise.ts`
- `apps/api/test/enterprise.test.ts`, `apps/api/test/remediation.test.ts`

### Add (frontend)
- `apps/web/src/demo/enterpriseStore.ts`
- `apps/web/src/pages/AssetsPage.tsx`, `AssetDetailPage.tsx`, `TopologyPage.tsx`,
  `ConnectorsPage.tsx`, `RemediationPage.tsx`, `RemediationDetailPage.tsx`
- `apps/web/src/components/assets/*` (AssetCard, AssetStatusChip, DiscoveryWizard,
  ImpactGraphView, ConnectorHealthList, RemediationWorkflow, EvidenceInspector,
  RiskExplainCard, GlobalPosturePanel)
  - Shipped so far (PHASE 4 follow-up): `PostureCards` (shared byRegion/byFramework
    cards used by both `DashboardPage` and the `GovernancePage` hub) and
    `GovernanceExceptionBadge` (shared exception-status chip used by
    `AssetDetailPage` and `GovernancePage`, replacing duplicated inline copies),
    `EvidenceInspector` (normalized evidence row + recomputed SHA-256 integrity),
    `ConnectorHealthList` (managing-connector health card),
    `RiskExplainCard` (finding card + expandable evidence-grounded risk), all
    extracted from `AssetDetailPage`; `RemediationWorkflow` (the validate →
    approve → execute → verify → rollback card) extracted from
    `RemediationsPage`; and `GlobalPosturePanel` (AI-vs-human compliance rings +
    per-domain bars) extracted from `DashboardPage`. Remaining entries
    (AssetCard, AssetStatusChip, DiscoveryWizard, ImpactGraphView) are covered
    inline by the shipped pages above.

---

## 4. New shared data model (db.json collections)

| Collection | Purpose | Key fields |
|---|---|---|
| `assets` | Unified asset registry | id, name, assetType, vendor, technology, environment, region, site, networkZone, tier, hostname, ipAddress, status (DISCOVERED/IDENTIFIED/CONNECTABLE/SCANNABLE/NON_COMPLIANT/COMPLIANT/MONITORED), criticality, connectorType, lastDiscoveredAt, lastScannedAt, complianceStatus, riskScore, observedState, stateSnapshots, relationships, history |
| `connectors` | Connector registry + health | id, type, name, vendor, status (ONLINE/OFFLINE/AUTHENTICATION_FAILED/NETWORK_BLOCKED), lastContactAt, simulated, supportedActions |
| `evidence` | Normalized evidence | evidenceId, assetId, controlId, source, observedValue, expectedValue, evidenceType, timestamp, status, rawReference, confidence, integrityHash, collector, simulated |
| `assetScans` | Scan runs on assets | id, assetId, connectorType, startedAt, completedAt, status, findings[], risk, compliance, evidenceIds |
| `remediations` | Orchestrated remediation | id, findingId, assetId, controlId, proposedAction, risk, expectedImpact, rollbackAvailable, status, validation, approvals, execution, verification, rollback, audit event refs, before/after |

Audit events are reused for the unified timeline: `AuditEventRecord.entityType` widened to include `asset | evidence | remediation | connector`.

---

## 5. New API surface (names follow existing `/api` conventions)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/assets` | List/filter assets (region, site, tier, type, status) |
| POST | `/api/assets/discover` | Run deterministic enterprise discovery → create/update asset records |
| GET | `/api/assets/:id` | Asset detail incl. state + history |
| POST | `/api/assets/:id/scan` | Scan asset via connector → collect+normalize evidence → evaluate controls → findings |
| GET | `/api/assets/:id/evidence` | Inspect evidence behind a scan |
| GET | `/api/assets/:id/impact` | Impact graph (asset→service→app→db→business) |
| GET | `/api/enterprise/topology` | Region/Site/Zone/Tier + connectivity matrix |
| GET | `/api/connectors` | Connector registry + health |
| GET | `/api/connectors/:id/health` | Single connector health |
| POST | `/api/connectors/:id/test` | Test connection (simulated) |
| GET | `/api/evidence/:id` | Evidence record |
| GET | `/api/asset-controls` | Asset-aware control catalogue |
| GET | `/api/frameworks` | Framework ↔ control coverage for asset controls |
| POST | `/api/findings/:id/analyze` | AI analysis of a finding (grounded in evidence) |
| GET | `/api/remediations` | Remediation list/queue |
| POST | `/api/remediations` | Generate remediation plan from finding |
| POST | `/api/remediations/:id/validate` | Validation/simulation stage |
| POST | `/api/remediations/:id/approve` | Human approval |
| POST | `/api/remediations/:id/execute` | Controlled execution (simulated) |
| POST | `/api/remediations/:id/verify` | Automatic re-scan + verification |
| POST | `/api/remediations/:id/rollback` | Rollback + restore prior state |
| GET | `/api/remediations/:id` | Full lifecycle detail |
| GET | `/api/audit` | Unified audit/evidence trail (assets, scans, remediations) |
| GET | `/api/dashboard` | **Extended** with assets/connectors/remediation/global posture |

---

## 6. New compliance controls (asset-aware, ~16)

TLS-001 min TLS · PKI-002 cert validity · PROTO-003 insecure protocol · CRYPTO-004 weak crypto ·
DBENC-005 DB encryption · DBEX-006 exposed DB · FW-007 excessive firewall access · AUTH-008 strong auth ·
INTEG-009 integrity validation · XMLSIG-010 XML signature · API-011 insecure API · DATA-012 sensitive data ·
PRIV-013 privileged access · OUTDATE-014 outdated version · CHECKSUM-015 checksum mismatch · MQ-016 exposed queue.

Each is mapped to representative frameworks (ISO 27001 / NIST CSF / CIS / PCI DSS / OWASP / prototype),
**asset-aware** (`appliesTo`), evaluated deterministically against normalized evidence + observed state.

---

## 7. Implementation phases

- **A. Audit + plan** — this document.
- **B. Asset model + discovery** — shared types, repo collections, catalog, discovery service, assets UI.
- **C. Connector architecture** — connector manager, health, test, simulated adapters, topology.
- **D. Evidence + asset compliance engine** — evidence collector/normalizer, asset controls, scan flow.
- **E. Risk explainability + AI analysis** — per-finding reason breakdown, grounded AI analysis.
- **F. Remediation orchestrator** — plan generation, lifecycle state machine.
- **G. Validation + approval + controlled execution** — simulation stage, approval UI, execution logs.
- **H. Verification + rollback + audit** — auto re-scan, before/after, rollback, unified timeline.
- **I. Impact graph + global posture** — asset relationships, dashboard metric panels.
- **J. SIH demo polish + tests** — deterministic demo flow, tests, regression fixes.

---

## 8. Risks

- **Demo-mode parity** — in-browser demo store must mirror new API behavior (mitigated: shared catalog package + explicit parity tests).
- **JSON repo write amplification** — more collections in one file; acceptable for demo scale (Vercel /tmp).
- **TS strictness** — `noUnusedLocals`, strict mode; new code must compile under `apps/web` rules.
- **Regressions** — dashboard/reviews/governance untouched paths re-verified after each phase.
- **Scope creep** — phased delivery, build+test after every phase.

## 9. Testing strategy
- Extend Vitest suites: asset discovery, connector health, asset control evaluation,
  risk explanation, remediation validation/approval/execution/verification/rollback, audit logging.
- `npm run build` (all workspaces) + `npm test` after each phase; fix, never hide errors.
- Manual browser check of the main SIH flow (discover → scan → evidence → analyze →
  remediate → validate → approve → execute → verify → audit).

## 10. Run commands
- `npm install`
- `npm run demo` (reset demo DB + API 4000 + optional AI 8000 + Web 5173)
- `npm run start-all` (no DB reset)
- `npm test` → run all workspace test suites.

---

## 11. Delivery status

### Backend + packages (shipped)
- `packages/enterprise-catalog` — topology/inventory/connectors, asset-aware controls (16), risk explainer, remediation actions + state machine, discovery, impact graph, integrity hashing.
- `packages/shared-types` — `AssetRecord`, `ConnectorRecord`, `EvidenceRecord`, `AssetScanRecord`, `AssetFinding`, `AssetComplianceControl`, `FindingAnalysis`, `RemediationRecord`, widened `AuditEventType`, `RiskAssessment`.
- `apps/api` — `assetService`, `connectorManager`, `remediationService`, `aiAnalysisService`, `riskExplainer`, `routes/enterprise.ts` (+ `:id` variants incl. `request-approval`, plus `GET /frameworks`, `GET /asset-controls`). All demo-file services run against the simulated enterprise catalog.

### Frontend (shipped)
- `apps/web/src/demo/enterpriseStore.ts` — in-browser mirror of the enterprise API; seeds **only the KNOWN (managed) estate** via catalog `knownEstateRecords` + `matureEstate` (22 assets, all SCANNABLE, hero API-GATEWAY-01 pre-staged with the TLS-001 closed loop); the first "Discover Assets" run creates the 15-asset regional discovery wave (Chennai / New York / Singapore) and re-runs are idempotent (0 new); persists under `nexus-enterprise-v1`.
- `services/api.ts` + `services/demoApi.ts` — typed enterprise client + demo handlers mirroring the backend paths (incl. guards).
- Pages (named slightly differently than §3, list + detail combined):
  - `pages/enterprise/AssetsPage.tsx` (Portfolio `/app/enterprise`, `/app/enterprise/assets` — full spec: 5 stat cards, regional footprint, search + 8 filters, 12-column portfolio table, discover button reporting regions)
  - `pages/enterprise/AssetDetailPage.tsx` (`/app/enterprise/assets/:id` — RiskGauge, findings, AnalysisModal, evidence, scans, state history)
  - `pages/enterprise/TopologyPage.tsx` (`/app/enterprise/topology` — Tier1→Tier2→Tier3 flow + per-tier asset counts)
  - `pages/enterprise/ConnectorsPage.tsx` (`/app/enterprise/connectors` — health + test connection)
  - `pages/enterprise/RemediationsPage.tsx` (`/app/enterprise/remediation` — status-gated workflow buttons, expanded lifecycle detail)
  - `pages/enterprise/EnterpriseAuditPage.tsx` (`/app/enterprise/audit` — unified event trail with source chips + detail JSON)
- `App.tsx` routes + `AppShell.tsx` "Enterprise" nav section.
- `DashboardPage.tsx` — enterprise posture panel row (managed assets, non-compliant assets, connectors online, remediations).
- Demo labels (SIMULATED / SIMULATION ENVIRONMENT) shown at every action point.

### Verification
- Web strict typecheck (`tsc --noEmit`) + Vite build in `apps/web` and `tsc -p tsconfig.json` in `apps/api` → clean.
- `npm run test --workspace=apps/api` → 105 tests pass across 10 files (asset scan→evidence→findings→risk, closed-loop remediation workflow incl. illegal transitions, validation pass/fail, execute, auto-verify, rollback, full audit trail; PHASE 2 connector profile/test/evidence-detail routes, derived SHA-256 integrity re-verification, legacy connector-profile backfill + legacy evidence-integrity upgrade; PHASE 4 governance — see below).
- `npm run test --workspace=apps/web` → 32 tests pass (new: `apps/web/vitest.config.ts` + jsdom; enterprise-parity tests — store seeds the 22-asset known estate, **first discovery creates the 15-asset regional wave then re-runs are idempotent (0 new)**, hero TLS-001 FAIL scan + enrichment, topology/connectors, demoApi dispatch mirrors the REST surface incl. 404s, PHASE 2 connector profile/test/evidence-detail parity, PHASE 4 governance parity — plus jsdom render probes mounting the real pages: AssetDetailPage connector panel + connection test + verified evidence rows + Adaptive Governance panel, ConnectorsPage transport/protocol/capability chips + degraded→ONLINE connection test, "Why is this a finding?" panel + lifecycle selector, GovernancePage hub with regime posture/catalog/policies/decision trace/exception registry, DashboardPage regional & framework posture panel, EnterpriseAuditPage governance-exception chips).
- PHASE 2 verification (live API on port 4000 + render probes): `GET /assets/:id/connector-profile` → ast-api-gateway-01 shows Kong / HTTPS_API / HTTPS + capabilities; `GET /issues/:connectorId` test → `{ ok, status: ONLINE }` with transport/latency/capabilities negotiated; scan produces 7 findings (risk 89) each with 14 evidenceIds; `GET /assets/:id/evidence/:evidenceId` → `{ verified: true, hashMatch: true }` with the derived 64-hex SHA-256 over the canonical payload (upgraded legacy 8-char hashes are re-derived at seed time via `upgradeStoredEvidenceIntegrity`); connector catalog = 17 records, every one declaring transportType/protocol/capabilities/latencyMs. Frontend render probes confirm the same values in the React bundle's demo mode.
- Browser verification against the **production bundle** (`vite preview`, demo mode): `logs/enterprise-probe.mjs` — 23/23 page-render checks across Assets / Topology / Connectors / Remediation / Audit / Asset detail (fresh store opens with 22 known assets), 0 console errors; `logs/sih-workflow-probe.mjs` — interactive 13/13 closed-loop click-through (Validate → Submit for approval → Approve → Execute → Re-scan & verify → VERIFIED, verification detail PASS + before/after + auto_verify attribution, complete audit trail), 0 console errors; `logs/sih-discover-probe.mjs` — interactive 10/10 front-of-loop (**Discovery notice confirms: "14 new assets discovered across 3 regions, 0 updated."** → Scan now → findings + integrity-hashed evidence → Analyze modal with evidence grounding + root cause → Plan remediation lands a new PLANNED card on the workflow), 0 console errors.
- PHASE 1A fixes: React error #310 (Rules of Hooks) fixed in `RemediationsPage.tsx` (counts `useMemo` hoisted above conditional early returns with `rems ?? []`); enterprise discovery made real — backend (`assetService.ensureAssets` now seeds only the known estate via `knownEstateRecords`, `discoverAssets` matures the freshly discovered wave to SCANNABLE so re-discovery is unchanged) and demo store mirror; catalog split into `KNOWN_ESTATE` (22) + `DISCOVERY_WAVE` (15: FW-CHN-01, RTR-CHN-01, SW-CHN-01, APP-CHN-01, API-CHN-01, DB-CHN-01, MQ-CHN-01, FW-NY-01, APP-NY-01, DB-NY-01, API-NY-01, FW-SG-01, API-SG-01, DB-SG-01, CERT-SG-01) with 5 new seeds (SW-CHN-01, FW-SG-01, DB-SG-01, CERT-SG-01, API-NY-01) + relationships and region tiers aligned to the spec; live backend verified against the pre-existing `data/db.json` (33 assets → first discover adds exactly the 5 new wave assets → idempotent 0 on re-run); `logs/wave-detail-probe.mjs` — 12/12 browser checks (discover → second-run idempotent with no duplicates → firewall detail: unscanned state, connect via Palo Alto adapter (connector foundation gates scanning), scan → findings/evidence/risk), 0 console errors.
- Regressions found & fixed during verification: `assetService` completed-scans filter TS error (type predicate); `api.ts` finding type (`AssetFinding`); `RemediationsPage` React error #310 (Max update depth — `useMemo` after conditional early return; hoisted above the returns).
- Demo hero loop verified in-browser (store + bundle): discover → scan `ast-api-gateway-01` → TLS-001 FAIL (risk ≥ 80) → evidence → analyze → plan → validate → request approval → approve → execute (observed state `tlsMinVersion` → `1.2`) → verify (flips PASS, `VERIFIED`) → full audit event trail.

### PHASE 3 — deterministic evidence-driven rule engine + lifecycle + compliance summary (shipped)
- **21-control canonical catalog** (`packages/enterprise-catalog/src/controls.ts`): every control is rule-driven with `evalKind` discriminator (`tls_version|cert_expiry|cert_crypto|database|network|mgmt_access|acl|firewall|secret_scan|integrity_check|xml_sig|api_auth|rate_limit|data_encryption|privileged_access|version_update|message_queue|config_drift`); AUTH-001 `appliesTo` widened to include `LOAD_BALANCER`.
- **21-rule engine** (`packages/enterprise-catalog/src/rules.ts`): `evaluateEvidenceForAsset(asset) → ControlResult[]`; `findingsFromResults(results, assetId) → AssetFinding[]`; `ruleForControl(controlId) → ComplianceRule | undefined`; deterministic across repeated calls; covers TLS version matrix, cert expiry thresholds, cert key-strength, legacy protocols, mgmt access exposure, ACL default policy, config-drift, version drift, DB bind/encryption/secrets, firewall any-rules, API auth/rate-limit, data encryption at rest, privileged access broad, XML signature validation, integrity-check, message queue authentication, and all remaining control checks.
- **Evidence & remediation**: `evidenceTypeForControlId` and `defaultActionForControl` updated for all 21 control IDs; advisory rows renamed (`ACL-001`→`ACLOBS-001`, `CERT-001`→`CERTOBS-001`).
- **Finding lifecycle** (`apps/api/src/services/enterprise/assetService.ts` + `remediationService.ts`): `setFindingLifecycle` + `applyFindingLifecycle`; lifecycle transitions (ACKNOWLEDGED/EXCEPTED/OPEN) persist via `POST /assets/:id/findings/:findingId/lifecycle`; transitions propagate through remediation workflow (PLANNED→REMEDIATION_PLANNED, execute→REMEDIATED, verify→VERIFIED, rollback→OPEN).
- **Compliance summary** (`GET /enterprise/compliance-summary`): evidence-driven portfolio summary with `score`, `passed/failed/warnings/na` totals, `byCategory`, `bySeverity`, `lifecycleBreakdown`, `generatedAt`.
- **Shared types** (`packages/shared-types`): `FindingLifecycle`, `AssetFinding` lifecycle/observedValue/expectedValue/remediationGuidance fields, `evalKind` union, `ComplianceSummary`, `FindingLifecycleUpdate`, `AuditEventType` extended with `FINDING_LIFECYCLE_CHANGED`.
- **Frontend**: `AssetDetailPage` — "Why is this a finding?" expandable detail panel (observed/expected/remediation guidance) + lifecycle selector (ACKNOWLEDGED/EXCEPTED/OPEN) calling `api.enterprise.setFindingLifecycle`; `LifecycleBadge` component for all six lifecycle states. `DashboardPage` — compliance summary strip below enterprise metric grid (score, passed/failed/warnings/na, bySeverity counts, lifecycleBreakdown chips). Demo facade mirrors all lifecycle + summary endpoints. Parity tests + jsdom render probes added.
- **Tests**: API: 89 tests across 9 files → PHASE 3 rule-engine matrix, lifecycle transitions, compliance summary assertions added. Web: 23 tests across 2 files → PHASE 3 parity (lifecycle endpoint round-trip, compliance summary shape) + render probe ("Why" panel expand + lifecycle select interaction). Builds: `apps/api tsc -p tsconfig.json` clean; `apps/web tsc --noEmit && vite build` clean.
- Browser verification (`logs/phase3-probe.mjs`): 13/13 checks pass against `vite preview:4173` + live API `:4000` — Dashboard compliance summary strip (evidence-driven score 47%, passed/failed/warnings/na totals, severity chips, lifecycle breakdown with OPEN×9), Asset detail "Why is this a finding?" expand showing observed/expected/recommended fix, lifecycle selector flip ACKNOWLEDGED + persistence across reload, audit trail FINDING LIFECYCLE CHANGED event; 0 console errors.

### PHASE 4 — Global Adaptive Governance + Multi-Framework Compliance (shipped)
- **Framework catalog** (`packages/enterprise-catalog/src/governance.ts`): `COMPLIANCE_FRAMEWORKS` — 6 frameworks (NIST CSF 2.0, CIS v8, ISO/IEC 27001:2022, PCI-DSS, OWASP, PROTOTYPE) each declaring `status`, `applicability` (`Applicable|Optional|Organization-selected|Not applicable`), scope and an explicit disclaimer — never claims regulatory applicability as a fact.
- **Policy profiles**: `POLICY_PROFILES` — Global Baseline (NIST/CIS/ISO) + 5 regional enterprise policies (India/US/Singapore/EU/UK, each enabling NIST/CIS/ISO/PCI-DSS/OWASP) + `DEFAULT_ORGANIZATION_BASELINE`. `selectPolicyForAsset` deterministically maps an asset to a regional profile by `siteRegion` (e.g. ast-api-ch-01→INDIA_ENTERPRISE, ast-api-ny-01→US_ENTERPRISE, ast-api-sg-01→SINGAPORE_ENTERPRISE).
- **Applicability engine**: `controlFrameworkMappings(controlId)` per-control mapping table (controls mostly `REVIEW_REQUIRED`; only confident NIST refs are `MAPPED`); `applicableControlsForAsset(controlId, frameworks, scrubbedFindings, exceptions)` returns `{ cratePk, id, controlName, framework, severity, whyApplicable, applicability, status }` per control and framework.
- **Governance exception lifecycle** (`packages/enterprise-catalog/src/governance.ts`): `requestException`/`decideException`; statuses `REQUESTED|APPROVED|REJECTED|EXPIRED`; an approved exception renders a control **FAIL + EXCEPTION APPROVED** (never silent PASS) and `exceptionStatusFor()` computes `EXPIRED` inline from `expiresAt`.
- **Governance decision trace** (`buildGovernanceTrace`): per-asset `GovernanceDecisionTrace` — organization + regional policy, applicable frameworks, applicable controls, evidence, findings (with `governanceContextForFinding`), active exceptions, disclaimer.
- **Posture aggregation** (`computeRegionalPosture` / `computeFrameworkPosture`): per-region and per-framework scores. Backend `complianceSummary` now also returns `byRegion` (per-region score/passed/failed/warnings/findings) and `byFramework` (status: COMPLIANT/PARTIAL/AT_RISK/NOT_ASSESSED).
- **Backend service** (`apps/api/src/services/enterprise/governanceService.ts`): `listFrameworks`, `getFrameworkById`, `listPolicies`, `getPolicyById`, `getOrganizationBaseline`, `selectPolicy`, `getAssetApplicableControls`, `getAssetGovernance`, `listExceptions`, `requestException`, `decideException`, `buildFindingGovernanceContext`.
- **API surface** (`apps/api/src/routes/enterprise.ts`): `GET /frameworks`, `GET /frameworks/:id`, `GET /policies`, `GET /policies/:id`, `POST /governance/policy/select`, `GET /governance/evaluate/:assetId` (combined `{ assetId, policy, applicableControls, trace, exceptions }`), `GET /assets/:id/governance`, `GET /assets/:id/frameworks`, `GET /assets/:id/applicable-controls`, plus enterprise governance exceptions scoped to `GET/POST /enterprise/governance/exceptions` and `POST /enterprise/governance/exceptions/:id/decide` (avoids collision with the org-level `GET /governance/exceptions`). `/audit` filter now includes `governance` entityType. `scanAsset` attaches a `governanceContext` to each finding.
- **Web mirror**: `enterpriseStore.ts` (`governanceExceptions` + `organizationBaseline` persisted; `frameworks()` returns the catalog; `complianceSummary()` includes `byRegion`/`byFramework`; governance methods `frameworkById` / `listPolicies` / `policyById` / `selectPolicy` / `assetApplicableControls` / `assetGovernance` / `assetFrameworks` / `listExceptions` / `requestException` / `decideException`), `demoApi.ts` handlers for all new routes (incl. combined evaluate object), and `api.ts` client methods (`frameworkById`, `listPolicies`, `policyById`, `selectPolicy`, `evaluateGovernance`, `assetGovernance`, `assetFrameworks`, `assetApplicableControls`, `governanceExceptions`, `requestGovernanceException`, `decideGovernanceException`).
- **Tests**: API 105/105 across 10 files (new `apps/api/test/governance.test.ts` — 16 tests: framework catalog, policy profiles, deterministic selection, applicable controls, full trace, exception lifecycle, byRegion/byFramework summary incl. PASS-included regions). Web 32/32 across 2 files (parity: 5 new PHASE 4 parity tests — framework catalog + 404, policies + deterministic selection, asset governance trace + per-framework + applicable controls + evaluate, exception lifecycle via REST surface **with governance audit events asserted**, compliance summary byRegion/byFramework with PASS controls counted; render probes: 4 new PHASE 4 jsdom probes — GovernancePage hub incl. auto-loading decision trace, AssetDetailPage Adaptive Governance panel, DashboardPage posture panel, EnterpriseAuditPage governance-exception chips). Builds clean.
- **Live probe (API on :4000)** via `npx tsx` + `Start-Job` session: `GET /api/frameworks` → 6 frameworks; `GET /api/policies` → 6 policies; `POST /api/governance/policy/select` (ast-api-gateway-01) → IND / INDIA_ENTERPRISE; exception create → REQUESTED then decide → APPROVED; `GET /api/assets/ast-api-gateway-01/governance` → region IND, 5 frameworks, 14 applicable controls, 1 exception; `GET /api/enterprise/compliance-summary` → byRegion=3, byFramework=5 with **PASS counted** (IND score 39, passed=41, failed=45; SGP 52/32/21; USA 58/38/17).
- **Fix during PHASE 4**: `complianceSummary` byRegion tally now pushes every evaluated control (incl. PASS) into `controlResults` before the PASS continue — regions previously under-counted passed controls. Also fixed a pre-existing wall-clock flake in the demo store: `seed()` no longer re-probes every connector with `Date.now()`-based `probeConnectorStatus` (which promoted `NETWORK_BLOCKED` connectors to ONLINE on 2–3 minutes each hour); authored seed statuses are retained and live probing stays on the explicit `probeConnectors()`/`testConnector()` flows.
- **Frontend surfacing (shipped)**: `DashboardPage` gains a "Regional & framework posture" panel (byRegion/byFramework with score bars + COMPLIANT/PARTIAL/AT_RISK/NOT_ASSESSED chips + link into enterprise governance) inside the enterprise closed-loop section. `AssetDetailPage` gains an Adaptive Governance panel — policy selection (with deterministic region→policy explanation + framework chips), applicable-controls grid (severity badges, whyApplicable, framework membership, show-all toggle), and governed exceptions (request form scoped to the asset's finding controls, Approve/Reject for REQUESTED, "FAIL + EXCEPTION APPROVED" render note, live reload after each decision). New `Enterprise Governance` hub at `/app/enterprise/governance` (`pages/enterprise/GovernancePage.tsx`): regime posture, framework catalog (applicability/scope/status + disclaimer disclosure), regional policy profiles table, asset decision-trace explorer (auto-loads the first asset, re-evaluates on selection, links into the detail page), and the exception registry with Approve/Reject. Registered in `App.tsx`, `EnterpriseTabs.tsx` (Portfolio/Topology/**Governance**/Connectors/Remediation/Audit Trail), AppShell nav, and breadcrumbs special-cased to "Enterprise Governance". `EnterpriseAuditPage` adds dedicated chips for the governance-exception events and names governance in its subtitle. `docs/DEMO_SCRIPT.md` gains a PHASE 4 walkthrough segment (regime posture → catalog → deterministic policy → decision trace → exception request/approve → audit trail).

### Remaining (not yet shipped)
- ImpactGraphView / DiscoveryWizard / RemediationDetailPage as separate components (§3) — covered inline by the shipped pages above.
- Production connector adapters (architecture documented; simulated connectors only).