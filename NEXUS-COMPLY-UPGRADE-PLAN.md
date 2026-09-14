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
- `apps/web/src/demo/enterpriseStore.ts` — in-browser mirror of the enterprise API; seeds **only the KNOWN (managed) estate** via catalog `knownEstateRecords` + `matureEstate` (22 assets, all SCANNABLE, hero API-GATEWAY-01 pre-staged with the TLS-001 closed loop); the first "Discover Assets" run creates the 14-asset regional discovery wave (Chennai / New York / Singapore) and re-runs are idempotent (0 new); persists under `nexus-enterprise-v1`.
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
- `npm run test --workspace=apps/api` → 77 tests pass (asset scan→evidence→findings→risk, closed-loop remediation workflow incl. illegal transitions, validation pass/fail, execute, auto-verify, rollback, full audit trail; + PHASE 2: connector profile/test/evidence-detail routes, derived SHA-256 integrity re-verification, legacy connector-profile backfill + legacy evidence-integrity upgrade).
- `npm run test --workspace=apps/web` → 20 tests pass (new: `apps/web/vitest.config.ts` + jsdom; 14 enterprise-parity tests — store seeds the 22-asset known estate, **first discovery creates the 14-asset regional wave then re-runs are idempotent (0 new)**, hero TLS-001 FAIL scan + enrichment, topology/connectors, demoApi dispatch mirrors the REST surface incl. 404s, PHASE 2 connector profile/test/evidence-detail parity — plus 6 jsdom render probes mounting the real pages: AssetDetailPage connector panel + connection test + verified evidence rows, and ConnectorsPage transport/protocol/capability chips + degraded→ONLINE connection test).
- PHASE 2 verification (live API on port 4000 + render probes): `GET /assets/:id/connector-profile` → ast-api-gateway-01 shows Kong / HTTPS_API / HTTPS + capabilities; `GET /issues/:connectorId` test → `{ ok, status: ONLINE }` with transport/latency/capabilities negotiated; scan produces 7 findings (risk 89) each with 14 evidenceIds; `GET /assets/:id/evidence/:evidenceId` → `{ verified: true, hashMatch: true }` with the derived 64-hex SHA-256 over the canonical payload (upgraded legacy 8-char hashes are re-derived at seed time via `upgradeStoredEvidenceIntegrity`); connector catalog = 17 records, every one declaring transportType/protocol/capabilities/latencyMs. Frontend render probes confirm the same values in the React bundle's demo mode.
- Browser verification against the **production bundle** (`vite preview`, demo mode): `logs/enterprise-probe.mjs` — 23/23 page-render checks across Assets / Topology / Connectors / Remediation / Audit / Asset detail (fresh store opens with 22 known assets), 0 console errors; `logs/sih-workflow-probe.mjs` — interactive 13/13 closed-loop click-through (Validate → Submit for approval → Approve → Execute → Re-scan & verify → VERIFIED, verification detail PASS + before/after + auto_verify attribution, complete audit trail), 0 console errors; `logs/sih-discover-probe.mjs` — interactive 10/10 front-of-loop (**Discovery notice confirms: "14 new assets discovered across 3 regions, 0 updated."** → Scan now → findings + integrity-hashed evidence → Analyze modal with evidence grounding + root cause → Plan remediation lands a new PLANNED card on the workflow), 0 console errors.
- PHASE 1A fixes: React error #310 (Rules of Hooks) fixed in `RemediationsPage.tsx` (counts `useMemo` hoisted above conditional early returns with `rems ?? []`); enterprise discovery made real — backend (`assetService.ensureAssets` now seeds only the known estate via `knownEstateRecords`, `discoverAssets` matures the freshly discovered wave to SCANNABLE so re-discovery is unchanged) and demo store mirror; catalog split into `KNOWN_ESTATE` (22) + `DISCOVERY_WAVE` (14: FW-CHN-01, RTR-CHN-01, SW-CHN-01, APP-CHN-01, API-CHN-01, DB-CHN-01, MQ-CHN-01, FW-NY-01, APP-NY-01, DB-NY-01, FW-SG-01, API-SG-01, DB-SG-01, CERT-SG-01) with 4 new seeds (SW-CHN-01, FW-SG-01, DB-SG-01, CERT-SG-01) + relationships and region tiers aligned to the spec; live backend verified against the pre-existing `data/db.json` (32 assets → first discover adds exactly the 4 new wave assets → idempotent 0 on re-run); `logs/wave-detail-probe.mjs` — 12/12 browser checks (discover → second-run idempotent with no duplicates → firewall detail: unscanned state, connect via Palo Alto adapter (connector foundation gates scanning), scan → findings/evidence/risk), 0 console errors.
- Regressions found & fixed during verification: `assetService` completed-scans filter TS error (type predicate); `api.ts` finding type (`AssetFinding`); `RemediationsPage` React error #310 (Max update depth — `useMemo` after conditional early return; hoisted above the returns).
- Demo hero loop verified in-browser (store + bundle): discover → scan `ast-api-gateway-01` → TLS-001 FAIL (risk ≥ 80) → evidence → analyze → plan → validate → request approval → approve → execute (observed state `tlsMinVersion` → `1.2`) → verify (flips PASS, `VERIFIED`) → full audit event trail.

### Remaining (not yet shipped)
- ImpactGraphView / DiscoveryWizard / RemediationDetailPage as separate components (§3) — covered inline by the shipped pages above.
- Production connector adapters (architecture documented; simulated connectors only).