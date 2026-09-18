# PHASE 5 — Final Report (Deterministic Risk Prioritization + Asset Impact Graph)

Date: 2026-09-18
Commit: `8c8f02f` (`feat: PHASE 5 - deterministic risk prioritization with exposure, blast-radius impact context and exposure paths`)

---

## 1. Objective & scope

Make every finding answer *"how much does this matter, where does it sit, and what could it touch?"* before anyone acts on it. PHASE 5 adds a deterministic **network exposure model**, a bounded **impact graph** with per-finding **blast radius**, a `FindingRiskContext` that feeds both the existing risk surfaces and (in PHASE 6) the remediation-intelligence engine, and a **potential exposure path** explorer. All results are deterministic (same input → same output), bounded (hard caps on graph breadth/depth), and honestly labeled (*potential* exposure, never *confirmed* attack path). Built as a pure catalog layer with API + demo-mirror parity; nothing existing was duplicated or removed.

## 2. Network exposure model

`packages/enterprise-catalog/src/risk.ts` — `networkExposureOfAsset(asset)` derives a `NetworkExposure` class deterministically from zone/tier/tags:

| Class | Rule |
|---|---|
| `INTERNET_FACING` | zone/tier/tag `internet-facing` or `payment-border` |
| `DMZ` | `DMZ` or `CLOUD` |
| `RESTRICTED` | `MGMT` or `TIER_3` |
| `PARTNER` | `partner` or `extranet` |
| `INTERNAL` | everything else |

Each class carries a per-class `EXPOSURE_WEIGHT`. Legacy risk scores and weights are preserved exactly (including the `pci` tag still rendering 1.0 exposure), so every control's risk-factor decomposition is unchanged at equal input — this was a hard compatibility requirement.

## 3. Bounded impact graph

`packages/enterprise-catalog/src/impact.ts` (rewrite) — `buildImpactGraph(asset, allAssets, { maxDepth })`:

- Builds the asset → service → application → database → business cascade with a hard `MAX_GRAPH_NODES = 120` cap and cycle-safe BFS.
- Nodes are enriched with assetType / region / tier / environment / riskScore / riskBand / complianceStatus, plus a synthetic `kind: "internet"` edge node at the boundary.
- `findingBlastRadius(root, allAssets, depth 4)` returns `affectedAssetIds`/`affectedAssetCount`, `criticalAssetsAffected`, `affectedServices`, `regionsAffected` (always includes the root region, sorted) and `crossRegion`.
- `impactScoreFor` is fully deterministic and capped 0–100: breadth ≤ 25 (count×8), critical downstream ≤ 20 (count×10), root criticality ≤ 15 (CRITICAL 15 / HIGH 12 / MEDIUM 8 / LOW 5), production ≤ 15, cross-region ≤ 10, service diversity ≤ 15 (services×5).
- Cyclic/duplicate edges terminate (bounded BFS), so even a malformed relationship set cannot hang or explode.

## 4. Potential exposure path

`exposurePathForAsset` — reverse-traces edge devices (FW / ROUTER / PROXY / SWITCH / LB) from the asset out toward `Internet`, then lists the asset and its **top critical/high downstream** dependents. Bounded (maxDepth 8) and explicitly labeled *"Potential exposure path … not evidence of compromise"* — the spec (§32) forbids ever presenting this as a *confirmed attack path*, and the UI renders it with exactly that disclaimer.

## 5. Finding risk context

`buildFindingRiskContext(input: FindingRiskInput)` — per-finding `FindingRiskContext` carrying:

- `riskScore` / `riskLevel` (band), `severity`, provenance as a derived `exposure` class (not a stored field),
- asset criticality + name, `evidenceConfidence`,
- `impactScore` and a `blastRadius`,
- a 5-factor `contributors` breakdown (severity / exposure / criticality / importance / exploitability points, each equal to the matching `explainableRisk` factor),
- a human-readable `explanation` string ("Why this risk score?" prose assembled from actual contributor values).

Falls back to `explainableRisk` when no prior `riskExplanation` exists on the finding. This context is the same object PHASE 6's remediation-intelligence engine consumes, so blast radius / exposure / impact values are identical across features.

## 6. API surface

`apps/api/src/routes/enterprise.ts` + service:

| Route | Method | Purpose |
|---|---|---|
| `/assets/:id/impact` | GET | Existing route now wired — impact graph + blast-radius summary |
| `/assets/:id/graph` | GET | Alias of the above |
| `/findings/:id/impact` | GET | `FindingRiskContext` with evidence confidence from `evidenceForFinding` |
| `/findings/:id/exposure-path` | GET | `AssetExposurePath` (potential path + disclaimer) |

## 7. Shared types

`packages/shared-types/src/index.ts` PHASE 5 additions: `NetworkExposure`, expanded `ImpactNode` (internet kind + region/risk chips), `FindingBlastRadius`, `FindingRiskContext`, `ExposurePathHop`, `AssetExposurePath`.

## 8. Frontend

- `ImpactGraphView` — gains an `internet` node kind (Globe) and region/risk chips.
- `RiskContextPanel` — "Potential impact / blast radius": risk score/level, exposure, asset criticality, evidence confidence, impact score, blast-radius chips, per-contributor bars, "Why this risk?" prose + a View-impact-graph anchor.
- `ExposurePathList` — hop chips with protocol/port, "Potential exposure path" label + disclaimer.
- `RiskExplainCard` — shows the risk panel per finding when context is available.
- `AssetDetailPage` — batches contexts and renders the exposure path under the cascade (anchor id `impact`).

## 9. Demo parity

`enterpriseStore.ts` + `demoApi.ts` mirror `assetGraph` / `findingImpact` / `findingExposurePath` exactly — the same deterministic catalog functions run against persisted demo state, so parity holds in-browser.

## 10. Test coverage — API

`apps/api/test/risk-context.test.ts` (new, 18 tests): exposure class derivation, determinism across repeated calls, criticality/exposure/production ordering, blast-radius counts + regions + cross-region, isolated-asset no-blast, cyclic graphs terminate (bounded), exposure path Internet→edge→asset, contributors match `explainableRisk` factors, service integration round-trip. Totals at PHASE 5: **API 131/131 (12 files)**.

## 11. Test coverage — Web

`enterpriseParity.test.ts` + `enterpriseRender.test.tsx` — PHASE 5 parity for the three demo endpoints and jsdom render probes of the risk panel / exposure path / impact graph. Totals at PHASE 5: **Web 36/36 (2 files)**.

## 12. Regression & builds

- API `tsc -p tsconfig.json` clean; Web `tsc --noEmit` + `vite build` clean.

## 13. Live API verification (:4000)

Started via `Start-Job`/`npx tsx` + `Invoke-RestMethod`:

- `GET /api/assets/ast-api-gateway-01/impact` and `/graph` → 200.
- `GET /api/findings/<TLS-001-id>/impact` → risk 98 CRITICAL, exposure `INTERNET_FACING`, impact 89, blast 3 assets / 3 critical / regions IND, contributors sev+35 exp+30 crit+15, evidence confidence 0.98.
- `GET /api/findings/ast-api-gateway-01/exposure-path` → `Internet → FW-DMZ-01 → API-GATEWAY-01 → DB-CUSTOMER-CORE → WEB-PAYMENTS`, depth 5, "potential path, not a confirmed attack path" disclaimer.

## 14. Key design notes (constraints honored)

1. **Determinism** — exposure, impact score, blast radius and context are pure functions of persisted state; identical inputs never produce different outputs.
2. **Boundedness** — graph ≤ 120 nodes, blast depth 4, exposure path depth 8, cycle-safe traversal. No unbounded recursion paths.
3. **Compatibility** — legacy risk decomposition unchanged at equal input (exposure is additive and only *derived*); existing routes are wired, not replaced.
4. **Honesty** — "potential exposure path … not evidence of compromise"; "Potential impact only — never a confirmed compromise".

## 15. What was NOT changed

- Compliance summary, governance, connectors, lifecycle, remediation workflow, and the audit ledger — untouched.
- No schema migration; PHASE 5 types are additive and backward-compatible.
- The legacy `risk`/`explainableRisk` numbers are preserved verbatim; PHASE 5 only adds context alongside them.

## 16. Known limitations & future work

- Blast radius/impact are recomputed per request (acceptable at simulated scale).
- Exposure paths are topologically derived (bounded reverse-trace), not live traceroute data — a deliberate simulation scoping.
- Single `MAX_GRAPH_NODES` bound guards breadth; very large estates rely on it rather than a paginated graph API.

## 17. Manual demo steps (§36)

The PHASE 4 demo walkthrough (`docs/DEMO_SCRIPT.md` §6) already surfaces the **Impact cascade** on `AssetDetailPage` (API-GATEWAY-01 → dependent service/application/database nodes → Business impact, with the blast-radius summary lines). PHASE 5 adds the exposure-path list under the cascade and the per-finding "Potential impact / blast radius" risk panel (via `RiskExplainCard`), plus the internet node in the graph — demoed as part of the asset detail walkthrough.

## 18. Report (§37) — this document

Cross-phase tracker continuity: PHASE 3 (rule engine) → PHASE 4 (governance) → PHASE 5 (risk prioritization / impact) → PHASE 6 (AI remediation intelligence). `NEXUS-COMPLY-UPGRADE-PLAN.md` carries the PHASE 5 (shipped) section with the live-probe results.

## 19. Sign-off

PHASE 5 is complete and committed. All objectives delivered: deterministic exposure model, bounded impact graph + blast radius, per-finding risk context (feeding PHASE 6), potential exposure paths with honest labeling, 4 API surface points, full frontend surface (Internet node, RiskContextPanel, ExposurePathList), demo parity, 18 new API tests + Web parity/render coverage, clean builds, and live verification recorded. No regressions.