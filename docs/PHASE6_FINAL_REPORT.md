# PHASE 6 — Final Report (AI Remediation Intelligence Engine)

Date: 2026-09-18
Commit: `4f1e776` (`feat: PHASE 6 - AI remediation intelligence engine with evidence-grounded structured plans`)

---

## 1. Objective & scope

Extend the enterprise closed-loop remediation workflow (plan → validate → human approval → execute → verify → roll back → audit) with an **AI remediation intelligence engine**: evidence-grounded, structurally validated remediation plans that the existing workflow consumes as data. The AI never executes changes, never short-circuits the human approval gate, and never presents a baseline/deterministic plan as an AI verdict. Everything ships through the same `/api` conventions and the in-browser demo mirror used by PHASES 1–5. Nothing existing was duplicated or removed.

## 2. Design tenets (enforced in code)

1. **Evidence is a consideration, not ground truth.** Plans are built deterministically from stored evidence; hashes shown in the UI are re-derived SHA-256 over the canonical evidence payload, never fabricated. Missing evidence yields `rootCauseCertainty = INSUFFICIENT_EVIDENCE` and lower confidence — never invented root causes.
2. **The AI proposes; the orchestrator disposes.** Intelligence only proposes a *change*. Execution still requires plan validation, request-approval, human approve/reject, orchestrator execute (with the PHASE 2 production-connector policy gate intact), auto-verify and rollback.
3. **`requiresApproval: true` is forced for every generated plan.** No path, mock or live, can produce a plan that bypasses the human gate.
4. **Honest labeling.** Plans not grounded in a live provider are explicitly labeled *"Baseline remediation guidance"* (`BASELINE_REMEDIATION_LABEL`) with `source: "deterministic"`; the panel renders a "Baseline remediation guidance"/"AI-assisted" source badge and an AI-unavailable notice when appropriate.
5. **Structure before trust.** Every plan passes `validateAiRemediationPlanShape` before persistence; live-provider output is flattened to prose/overrides over the deterministic structure so the validator stays in control.

## 3. Deterministic intelligence engine

`packages/enterprise-catalog/src/intelligence.ts` (new catalog module):

- **Action catalog** — per-`RemediationActionType` descriptions, `describe`, `validate` and `rollback` plans, targets, `configArea`, expected states and reasons; `intentFromActionType`; `topPriorityActions` (e.g. TLS-001 → `SET_TLS_MIN_VERSION` + `ENFORCE_STRONG_CIPHERS`).
- **Change-risk classifier** — `changeRiskFor({ actionImpact, exposure, environment, blast, rollbackAvailable, destructiveInProd, connectorAuthorized })` → deterministic `ChangeRisk` (LOW/MEDIUM/HIGH/CRITICAL/REVIEW_REQUIRED) with a human `reason`. `REVIEW_REQUIRED` when rollback is unavailable or the action is destructive in production regardless of other factors.
- **Confidence** — `confidenceFromEvidence(evidence)` maps available evidence quality to a 0.30→0.98 scale (0.30 with no evidence). Confidence is evidence-weighted, never a proxy for model certainty and never a gate for approval.
- **Validation plan** — `validationStepsFor` emits BEFORE/CHANGE/AFTER steps with `expectedEvidence`/`expectedControl`; AFTER includes a downstream blast-radius confirmation.
- **Reasoning chain** — `buildReasoningChain` traces evidence → control → risk → impact → action so the "Why this remediation?" expansion is prose derived from real values.
- **Structural validator** — `validateAiRemediationPlanShape` rejects malformed/shallow plans.
- **Baseline label** — `BASELINE_REMEDIATION_LABEL = "Baseline remediation guidance"` used in the disclaimer of every deterministic/mock plan.

**Fix during PHASE 6:** `validationStepsFor` originally referenced `blast.affectedServices` (required on `FindingBlastRadius` and populated by `findingBlastRadius`); the step now prefers the populated `affectedServices` list and falls back to the affected-asset count defensively.

## 4. Evidence flow

`evidenceForFinding(findingId)` is preferred, else `evidenceForAsset(asset.id)` — the same fallback pattern as the existing analyze route. Each `EvidenceRecord` is mapped to `IntelligenceEvidenceInput` and every displayed hash comes from `verifyEvidenceRecord` (re-computed SHA-256 over the canonical stored payload). The UI shows a "verified" chip and the short hash per evidence row.

## 5. Service orchestration

`apps/api/src/services/enterprise/remediationService.ts` — `analyzeRemediationIntelligence(ctx, findingId, actor)`:

- Loads the finding, its asset, and all assets; computes `FindingRiskContext` through the catalog (`buildFindingRiskContext`), so blast radius / exposure / impact are the exact PHASE 5 values.
- Builds the plan deterministically, validates it, and **stores the intelligence inline on the `RemediationRecord`** (`record.intelligence`) plus an append-only `planVersions[]` snapshot (sliced to the latest 20).
- **Versioning:** `version = max(prev intelligence.version, planVersions.length) + 1`; regenerating never overwrites history — each run appends a `RemediationPlanVersion` and bumps the record's intelligence.
- **Provider mode:** only `AI_PROVIDER === "live"` attempts the live AI service (`POST {AI_SERVICE_URL}/api/ai/remediation-plan`, 6 s abort). Any failure or non-live mode falls back to the deterministic engine with `source: "deterministic"`, `provider: "mock"`, baseline disclaimer. Live output is used only for prose/overrides on top of the deterministic structure.
- **Audit:** logs `AI_REMEDIATION_INTELLIGENCE_GENERATED` (entityType `remediation`, `source: "ai"`, detail = intelligenceId/version/source/provider/requiresApproval) attributed to the SYSTEM_REVIEWER actor.
- Returns the enriched `RemediationRecord` — the same record object the existing workflow UI already drives.

## 6. API surface additions

`apps/api/src/routes/enterprise.ts`:

| Route | Method | Purpose |
|---|---|---|
| `/findings/:id/remediation/analyze` | POST | Generate/regenerate AI remediation intelligence; returns enriched `RemediationRecord` |
| `/findings/:id/remediation` | GET | List remediations for a finding (lookup via finding id) |
| `/remediation/:id` | GET | Remediation detail by remediation id |
| `/remediation/:id/validate-plan` | POST | Thin alias of the existing plan-validation — validates the current intelligence version |

The record shape is unchanged from the existing `RemediationRecord`, so Validate → request approval → Approve → Execute → Verify → Rollback all keep working untouched.

## 7. Shared types

`packages/shared-types/src/index.ts` PHASE 6 additions: `ChangeRisk`, `RemediationIntelligenceSource`, `RemediationEvidenceUsed`, `RemediationIntelligenceAction`, `AiRemediationPreCheck`, `AiRemediationValidationStep`, `AiRemediationRollbackStep`, `AiRemediationIntelligence`, `RemediationPlanVersion`; `RemediationRecord` gains optional `intelligence` + `planVersions`; `AuditEventType` gains `AI_REMEDIATION_INTELLIGENCE_GENERATED`.

## 8. Frontend — the AI Remediation Intelligence panel

`apps/web/src/components/assets/AiRemediationIntelligencePanel.tsx` (new, exports `ChangeRiskPill` for reuse):

- **Header** — version badge (vN), source badge ("Baseline remediation guidance" vs "AI-assisted"), `ChangeRiskPill`, confidence.
- **AI-unavailable notice** — when `source !== "ai"`, the panel states the engine generated the plan deterministically from evidence.
- **Root cause** — prose + certainty badge (`EVIDENCE_GROUNDED` / `INSUFFICIENT_EVIDENCE`).
- **Evidence used** — verified chip + short hash per row.
- **Recommended actions** — per action: instruction, `changeRisk` pill, `requiresApproval` ("approval required") badge, target/configArea/expectedState/reason.
- **Pre-checks / Validation plan (BEFORE/CHANGE/AFTER) / Rollback plan + status / Expected result / Change risk / Connector capability** (vendor-aware, from the authorized connector) **+ Unavailable list**.
- **"Why this remediation?"** — collapsible reasoning chain (evidence → control → risk → impact → action).
- **Disclaimer** — baseline guidance disclosure when applicable.

## 9. Frontend integration points

- `RemediationWorkflow.tsx` — "Generate AI plan" / "Regenerate AI plan" button (Sparkles) on PLANNED / VALIDATION_FAILED cards calling `api.enterprise.remediationIntelligence(findingId)`; the panel renders inline in the expanded card after "Parameters".
- `RiskExplainCard.tsx` — optional `onRemediationIntelligence` prop + "AI remediation plan" button next to "Plan remediation".
- `AssetDetailPage.tsx` — `remediateIntelligence(findingId)` analyzes then navigates to the workflow, showing a notice with the generated version (`vN`).

## 10. Web demo mirror

- `enterpriseStore.ts` — `remediationIntelligence(findingId)` (same versioning + inline storage on persisted state), `findingRemediations(findingId)`, existing `remediationById`/`validateRemediation` powering the validate-plan handler; `AI_REMEDIATION_INTELLIGENCE_GENERATED` audit events.
- `demoApi.ts` — handlers for all four routes (incl. `need(..., "Remediation not found")` guards and 404 paths).
- `api.ts` — typed client: `remediationIntelligence`, `findingRemediations`, `planById`, `validatePlan`.

## 11. Test coverage — API

`apps/api/test/ai-remediation.test.ts` (new, 19 tests):

- **Catalog units** — valid structural plan for TLS-001; `INSUFFICIENT_EVIDENCE` with no evidence; baseline disclaimer; `SET_TLS_MIN_VERSION` + `ENFORCE_STRONG_CIPHERS` actions; rollback `AVAILABLE`; malformed-plan rejection; `confidenceFromEvidence([]) === 0.3`; `EVIDENCE_GROUNDED` with verified evidence; deterministic `changeRiskFor`; `REVIEW_REQUIRED` without rollback.
- **Service integration** (fresh repo + discover + scan `ast-api-gateway-01`) — enriched `RemediationRecord` (v1, requiresApproval, provider mock, source deterministic, version + plan version, approval `NONE`/execution `NOT_EXECUTED`); baseline disclaimer; rollback `AVAILABLE`; evidence non-empty with hash; version increments reusing the same record; status stays `PLANNED`; `AI_REMEDIATION_INTELLIGENCE_GENERATED` audit detail; `listFindingRemediations` returns the enriched record; service change risk matches the catalog calculation.

## 12. Test coverage — Web

- `enterpriseParity.test.ts` — PHASE 6 parity describe: store analyze/version-bump/audit assertions + demoApi route mirror (analyze/list/detail/validate-plan, 404 for unknown finding).
- `enterpriseRender.test.tsx` — PHASE 6 jsdom probe: panel sections render (version badge, source badge, root cause, evidence used, recommended actions, pre-checks, potential impact, validation plan, rollback, expected result, change risk, confidence); RemediationsPage shows "Regenerate AI plan" and renders the inline panel once the card is expanded.

## 13. Regression & builds

- API `tsc -p tsconfig.json` clean; `npm run build --workspace=apps/api` clean.
- Web `tsc` + `vite build` clean.
- Full suites: **API 150/150 (13 files)**, **Web 44/44 (2 files)**.

## 14. Live API verification (:4919)

Started via `npx tsx src/index.ts` (tsx is the supported runtime; the pre-existing `npm start` node path has an ESM extension issue unrelated to this phase), probed with `Invoke-RestMethod` against a scanned `ast-api-gateway-01` (finding `TLS-001`, risk 98):

- `POST /api/findings/:id/remediation/analyze` → 200, `status=PLANNED`, `intelligence v1 source=deterministic provider=mock requiresApproval=true rollbackStatus=AVAILABLE rootCauseCertainty=EVIDENCE_GROUNDED changeRisk=HIGH`, 1 evidence item, 2 recommended actions.
- `GET /api/findings/:id/remediation` → 1 record carrying `intelligence`.
- `GET /api/remediation/:id` → same enriched record (version 1).
- `POST /api/remediation/<id>/validate-plan` → `VALIDATED`.
- `POST /api/findings/does-not-exist/remediation/analyze` → 404.

## 15. Key fixes during PHASE 6

1. **`validationStepsFor` blast field** — after a test exposed a crash risk on a missing `affectedServices`, the AFTER step prefers `affectedServices` and falls back to affected-asset count defensively.
2. **Test-side typing** — `heroFinding` widened to the full `AssetFinding`; blast fixtures completed to the required `FindingBlastRadius` (incl. `affectedServices`); evidence `evidenceType` moved to the `EvidenceType` union (`"TLS"`); audit sort uses `AuditEventRecord.at`; unused import removed (strict `noUnusedLocals`).
3. **Web render probe** — the inline panel test originally failed because remediation cards render collapsed; the probe now expands the card (header toggle click) before asserting the panel text.
4. **Stray debug artifact** — `zz-debug.test.ts` (used to prove the version bump) removed so the suite reflects the real 13 files / 150 tests.

## 16. What was NOT changed

- The existing validation / request-approval / approve / reject / execute / verify / rollback code paths — untouched and still driven by `RemediationRecord.status` transitions.
- The PHASE 2 production-connector policy gate at the execution boundary — intact; intelligence never bypasses it.
- Lifecycle, connectors, governance, compliance summary, audit ledger append-only semantics — preserved.
- `files` are additive/backward-compatible only; no schema migration required.

## 17. Known limitations & future work

- Live AI provider requires `AI_PROVIDER=live` + `AI_SERVICE_URL`; without it (or on any failure/6 s timeout) plans are deterministic baseline guidance — the safe default.
- `confidence` reflects available evidence, not model proficiency; it never gates approval.
- `planVersions` history is append-only and viewable in the record, but the UI does not offer per-version selection/jumping.
- Connector capability is read from the authorized connector's `authorizedActions`; the unavailable list is structured per action, surfaced in the panel.
- Real vendor adapters remain out of scope (unchanged from PHASE 2/5); execution is simulated-only, gated as before.

## 18. Manual demo steps (§36) — shipped

`docs/DEMO_SCRIPT.md` now includes a **PHASE 6 — AI remediation intelligence (60s)** walkthrough (see below), covering generate → baseline-guidance label → approval gate → regeneration version bump.

## 19. Report (§37) — this document

Cross-phase tracker: PHASE 3 (rule engine) → PHASE 4 (governance) → PHASE 5 (risk prioritization/impact) → PHASE 6 (AI remediation intelligence). Plans table updated in `NEXUS-COMPLY-UPGRADE-PLAN.md` under a new "### PHASE 6 — AI remediation intelligence engine (shipped)" section, including the live-probe results.

## 20. Sign-off

PHASE 6 is complete and committed. All objectives delivered: deterministic evidence-grounded intelligence engine with structural validator, inline storage + append-only plan versions, forced human approval, honest baseline labeling, live-provider fallback with prose-overrides only, 4 new API routes, full frontend panel + workflow integration, demo parity, 19 new API tests + Web parity/render probes, clean builds, full live smoke test of the new endpoints, and live verification recorded. No regressions; a debug artifact was removed and the totals reflect the true suite.