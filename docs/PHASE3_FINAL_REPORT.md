# PHASE 3 — Final Report (deterministic evidence-driven rule engine + lifecycle + compliance summary)

Date: 2026-09-14

---

## 1. Objective & scope

Replace the ad-hoc eval-kernel with a deterministic, per-asset rule engine that evaluates 21 compliance controls from normalised evidence rows. Add human finding-lifecycle management (ACKNOWLEDGED / EXCEPTED / OPEN), a portfolio compliance summary, an evidence-grounded "Why is this a finding?" UI, and full test + parity coverage — all without disturbing any existing feature.

## 2. Control catalog (16 → 21)

`packages/enterprise-catalog/src/controls.ts` — `ASSET_CONTROLS` now contains 21 entries, each carrying:

| Field | Purpose |
|---|---|
| `id` | Canonical control ID (e.g. `TLS-001`, `ACL-001`) |
| `evalKind` | Discriminator union: `tls_version`, `cert_expiry`, `cert_crypto`, `database`, `network`, `mgmt_access`, `acl`, `firewall`, `secret_scan`, `integrity_check`, `xml_sig`, `api_auth`, `rate_limit`, `data_encryption`, `privileged_access`, `version_update`, `message_queue`, `config_drift`, `certificate_expiry` |
| `appliesTo` | Asset type whitelist — AUTH-001 widened to include `LOAD_BALANCER` |
| `defaultSeverity`, `remediationActions` | Control-level defaults |
| `standardRef` | NIST / ISO / CIS reference |

New controls added: TLS-002 (legacy protocols), CERT-002 (key strength), FW-002 (mgmt interface exposure), ACL-001 (default policy), CONFIG-001 (config drift). Advisory observations renamed: `ACL-001` → `ACLOBS-001`, `CERT-001` → `CERTOBS-001`.

## 3. Rule engine architecture

`packages/enterprise-catalog/src/rules.ts` — 21 `ComplianceRule` objects, each with:

```ts
interface ComplianceRule {
  id: string;                     // matches control id
  evalKind: EvalKind;
  appliesTo: AssetType[];
  severity: Severity;
  category: string;
  evaluate(asset: AssetRecord): ControlEvaluation;
  remediationActions: string[];
}
```

`evaluateEvidenceForAsset(asset) → ControlResult[]` iterates only rules matching `asset.assetType`, calling each `rule.evaluate(asset)`. The result contains:

- `controlId`, `evalKind`, `category`, `evaluation` (status / observedValue / expectedValue / remediationGuidance), `assetType`

Determinism: same input asset always produces the same output (no randomness, no timestamps, no external calls).

`findingsFromResults(results, assetId)` filters FAIL + WARNING results, assigns severity from the rule, and sets `observedValue` / `expectedValue` / `remediationGuidance` on each `AssetFinding`.

## 4. Evidence mapping (21 control IDs)

`packages/enterprise-catalog/src/evidence.ts` — `evidenceTypeForControlId(controlId)` returns the appropriate `EvidenceType` for all 21 control IDs plus the two advisory observations. A new `CERTIFICATE` evidence-type branch emits `certKeyAlgorithm` and `certKeySize` from observed state.

## 5. Finding lifecycle state machine

Lifecycles: `OPEN` → `ACKNOWLEDGED` / `EXCEPTED`; `ACKNOWLEDGED` → `OPEN`; `EXCEPTED` → `OPEN`.

`apps/api/src/services/enterprise/assetService.ts`:

- `setFindingLifecycle(repo, findingId, lifecycle, reason?, actor?)` — validates the transition against the current lifecycle, mutates the finding record, emits a `FINDING_LIFECYCLE_CHANGED` audit event.
- `applyFindingLifecycle(assets, findingId, lifecycle)` — in-memory demo-store variant.

`apps/api/src/services/enterprise/remediationService.ts`:

- `createRemediation` sets finding → `REMEDIATION_PLANNED`
- `executeRemediation` sets finding → `REMEDIATED`
- `verifyRemediation` sets finding → `VERIFIED`
- `rollbackRemediation` sets finding → `OPEN`

API route: `POST /assets/:id/findings/:findingId/lifecycle` accepts `{ lifecycle, reason? }`.

## 6. Compliance summary

`apps/api/src/services/enterprise/assetService.ts` → `complianceSummary(repo)`:

Iterates every asset, evaluates all applicable rules, tallies `passed` / `failed` / `warnings` / `na`. Derives `score = passed / (passed + failed + warnings) * 100`. Breaks down by category, by severity, and by lifecycle. Returns:

```ts
interface ComplianceSummary {
  total: number; passed: number; failed: number; warnings: number; na: number; score: number;
  byCategory: Array<{ category: string; passed: number; failed: number; warnings: number }>;
  bySeverity: Array<{ severity: Severity; count: number }>;
  lifecycleBreakdown: Array<{ lifecycle: FindingLifecycle; count: number }>;
  generatedAt: string;
}
```

API route: `GET /enterprise/compliance-summary`.

## 7. Shared types & schema

`packages/shared-types/src/index.ts`:

- `FindingLifecycle = "OPEN" | "ACKNOWLEDGED" | "EXCEPTED" | "REMEDIATION_PLANNED" | "REMEDIATED" | "VERIFIED"`
- `AssetFinding`: new fields — `lifecycle?`, `lifecycleReason?`, `observedValue?`, `expectedValue?`, `remediationGuidance?`
- `EvalKind` union: expanded to 19 discriminators (was 8)
- `ComplianceSummary`, `FindingLifecycleUpdate` types added
- `AuditEventType` widened with `"FINDING_LIFECYCLE_CHANGED"`

## 8. API surface additions

| Route | Method | Purpose |
|---|---|---|
| `/assets/:id/findings/:findingId/lifecycle` | POST | Transition finding lifecycle |
| `/enterprise/compliance-summary` | GET | Portfolio compliance summary |

Both routes are mirrored in `apps/web/src/services/demoApi.ts`.

## 9. Frontend enhancements

**AssetDetailPage** (`apps/web/src/pages/enterprise/AssetDetailPage.tsx`):

- `LifecycleBadge` component: renders coloured pill for all six lifecycle states.
- **"Why is this a finding?"** expandable detail panel: shows `observedValue`, `expectedValue`, `remediationGuidance` (fallback `recommendedFix`), severity / status / control metadata.
- **Lifecycle selector** (ACKNOWLEDGED / EXCEPTED / OPEN): calls `api.enterprise.setFindingLifecycle`; re-renders with the new badge + finding row.

**DashboardPage** (`apps/web/src/pages/DashboardPage.tsx`):

- Compliance summary strip below the enterprise metric grid: score percentage bar, passed/failed/warnings/na totals, bySeverity chip counts, lifecycleBreakdown chips.

**Demo facade** (`apps/web/src/services/demoApi.ts` + `apps/web/src/demo/enterpriseStore.ts`):

- `setFindingLifecycle`, `complianceSummary` facade methods added, mirroring the backend.

## 10. Test coverage

### API (89 tests, 9 files)

| File | Tests | PHASE 3 additions |
|---|---|---|
| `enterprise.test.ts` | 28 | Rule-engine matrix (TLS-001 1.2/1.1/1.0, TLS-002 legacy protocols, CERT-002 key strength, FW-002 mgmt exposure, ACL-001 states, CONFIG-001 drift, determinism), lifecycle transitions, compliance summary shape |
| `remediation-workflow.test.ts` | 9 | Lifecycle assertions (REMEDIATION_PLANNED / REMEDIATED / VERIFIED / OPEN) |
| Other 7 files | 52 | Unchanged (approval, parsers, risk, review, etc.) |

### Web (23 tests, 2 files)

| File | Tests | PHASE 3 additions |
|---|---|---|
| `enterpriseParity.test.ts` | 16 | Compliance summary parity (score, lifecycleBreakdown), lifecycle endpoint round-trip (ACKNOWLEDGED → OPEN) |
| `enterpriseRender.test.tsx` | 7 | "Why is this a finding?" expand + lifecycle selector interaction |

### Regression

All 112 tests pass. Both builds clean: `tsc -p tsconfig.json` (apps/api), `tsc --noEmit && vite build` (apps/web).

## 11. Key fixes during PHASE 3

1. **CERT-002 rule syntax** — broken template-literal quotes (lines 546) in the ECDSA branch of `rules.ts`; corrected to use backticks consistently.
2. **Unused `na()` helper** — removed from `rules.ts` (TS `noUnusedLocals`).
3. **AUTH-001 `appliesTo` mismatch** — controls.ts did not include `LOAD_BALANCER`; added so the rule fires for load balancers as intended.
4. **Test clone helper** — `clone()` in `enterprise.test.ts` referenced `knownEstateRecords` (only KNOWN_ESTATE assets); switched to `INVENTORY.find() + toAssetRecord()` so discovery-wave assets (e.g. `ast-cert-sg-01`, `ast-app-chn-01`) are available in test cases.
5. **CERT-002 test assertion** — original test overrode `technology` inside `observedState`; corrected to use `certKeyAlgorithm` (the field the rule actually reads from observed state).
6. **API build TS error** — unused destructured `c` in `remediation-workflow.test.ts`; removed.

## 12. What was NOT changed

- Governance, reviews, approvals, AI analysis, risk scoring, dashboard, reports — all untouched.
- Existing PHASE 2 findings, evidence, connector topology — unchanged.
- No schema migrations; all additions are backward-compatible new fields with `?` optionality.

## 13. Known limitations & future work

- Lifecycle transitions are in-memory only (no persistent database state beyond the JSON store).
- `FINDING_LIFECYCLE_CHANGED` audit events are append-only; no event replay or undo.
- Compliance summary recomputes from scratch on every request (acceptable at simulated scale).
- `lifecycleBreakdown` counts every finding (including PASS ones after remediation); this is correct by design (lifecycle is set on the finding record regardless of current PASS/FAIL status).

## 14. Sign-off

PHASE 3 is complete. All objectives delivered: 21-control deterministic rule engine, finding lifecycle management, portfolio compliance summary, evidence-grounded "Why?" UI, full test + parity coverage, clean builds, no regressions. No commit made (per instructions).
