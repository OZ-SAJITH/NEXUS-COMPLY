# NEXUS-COMPLY — Verification Report

Evidence for the prototype build (SIH26155). Every item below was executed on this machine; numbers are real outputs, not claims.

## 1. Automated tests — `npm test`
Vitest, 6 suites / **37 tests passing**:

| Suite | Coverage | Tests |
|---|---|---|
| `parsers.test.ts` | vendor detection, Cisco/Fortinet/Juniper intents, evidence lines, unknown adapter | 12 |
| `compliance.test.ts` | 16 controls evaluated, secure=100% / insecure fails, evidence on findings, explainable fixes | 6 |
| `risk.test.ts` | determinism, CRITICAL band for internet-exposed admin, monotonic severity, overall risk, posture, compliance math | 6 |
| `ai.test.ts` | interpretation contract, evidence refs, **wildcard-address regression (10.0.0.0/8 ≠ 0.0.0.0)**, offline fallback, secret redaction | 6 |
| `approval.test.ts` | fresh unknown→PENDING, approve→reuse, branch variant reuses, reject→no mapping | 4 |
| `remediation.test.ts` | after > before, never mutates config, one step per failing control | 3 |

Regression fixed during verification: the wildcard check `0\.0\.0\.0` previously matched *inside*
`10.0.0.0/8`, so a restricted management network could be misread as unrestricted. Both the
JS fallback interpreter and the Python mock interpreter now match the exact wildcard only
(verified live: `SOURCE "10.0.0.0/8"` → sourceRestriction=true; `SOURCE "0.0.0.0"` → false).

## 2. Type checks & build
- `npx tsc -p apps/api/tsconfig.json --noEmit` → clean.
- `npm run build --workspace=apps/web` (`tsc --noEmit && vite build`) → clean, 849 modules, dist produced.

## 3. Sample smoke test — `scripts/smoketest.ts`
Real pipeline (`runAudit` → parse → evaluate → risk). Every FAIL finding carried evidence (no evidence-less findings).

| Sample | Vendor | Score | Pass/Fail | Risk |
|---|---|---|---|---|
| cisco/demo-secure.conf | cisco (known) | 100% | 10 / 0 | 0 (no failures) |
| cisco/demo-insecure.conf | cisco (known) | 67% | 6 / 3 | HIGH 67 |
| fortinet/demo-secure.conf | fortinet (known) | 100% | 7 / 0 | 0 |
| fortinet/demo-insecure.conf | fortinet (known) | 43% | 3 / 4 | HIGH 67 |
| juniper/demo-secure.conf | juniper (known) | 100% | 9 / 0 | 0 |
| juniper/demo-insecure.conf | juniper (known) | 50% | 2 / 2 | HIGH 67 |
| unknown/custom-demo.conf | unknown | 0% | 0 / 2 | **CRITICAL 89** |

Unknown sample also produced an AI candidate `RESTRICT_ADMIN_ACCESS` at **0.91 confidence** (provider `mock`).

## 4. Mapping-reuse across custom-syntax variants — `scripts/maptest.ts`
```
Run1:  vendor=unknown usedMapping=false ai status=PENDING conf=0.91
Run1b: vendor=unknown usedMapping=true  aiInterpretations=0     (same config)
fp1=01n828ph fp2=01n828ph fp3=01n828ph allSame=true             (branch + partner)
Run2 (branch):  usedMapping=true  aiInterpretations=0
Run3 (partner): usedMapping=true  aiInterpretations=0
```
Three distinct configurations (different values, node ids, IPs, community strings) in the same custom language share **one structural fingerprint** and reuse the same human-approved mapping.

## 5. End-to-end API flow (HTTP)
1. `POST /api/audits` (unknown config) → PENDING interpretation attached, `vendor=unknown`.
2. `POST /api/ai/interpret/:id/approve` → `{ status: "APPROVED", mappingSaved: true }`.
3. `POST /api/audits` (branch variant) → `aiInterpretations: []` → mapping reused.
4. `GET /api/dashboard` → adaptive panel reflects: knownAnalyzed, unknownDetected, aiInterpretations, approvedMappings, totalAudits.
5. Cisco insecure: `POST /api/remediation/simulate` → compliance **67% → 100%**, posture **50 → 100**, steps = #failing findings.
6. `GET /api/audits/:id/exposure` → 3 potential exposure paths (Internet → Firewall → TELNET → Admin Device → Critical Server).
7. `GET /api/reports/:auditId` → self-contained printable HTML with findings table + NEXUS-COMPLY branding (browser print → PDF).
8. `GET /api/health` → `{ ok: true }`; `POST /api/ai/interpret` (`:8000`) → structured interpretation, `provider="mock"`.

## 6. One-command run — `npm run start-all` / `npm run demo`
- `start-all` launches API (`:4000`), AI service (`:8000`, graceful fallback if Python absent), and Web (`:5173`) together.
- Fresh DB triggers the auto-seed of **7 demo audits** (dashboard fully populated on first load).
- Verified: all three ports open; seeded audits = 7; dashboard posture 62; AI interpret returns `RESTRICT_ADMIN_ACCESS 0.91 mock`.
- Headless Edge render check: Dashboard, Audit, Audit-result, and Reports pages all render live data in the browser (no console errors surfaced via DOM dump).

## 7. Security checks
- `redactSecrets` test: passwords/secrets are absent from the redacted output (tested in `ai.test.ts`).
- No secrets in `.env.example`; `data/`, `.env`, `node_modules/`, `dist/` are gitignored.
- AI receives only the redacted configuration; approval remains mandatory regardless of confidence.