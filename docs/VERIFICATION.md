# NEXUS-COMPLY — Verification Report

Evidence for the final release build (SIH26155). Every item below was executed on this machine; numbers are real outputs, not claims.

## 1. Automated tests — `npm test`
Vitest, 7 suites / **52 tests passing**:

| Suite | Coverage | Tests |
|---|---|---|
| `parsers.test.ts` | vendor detection, Cisco/Fortinet/Juniper intents, evidence lines, unknown adapter | 12 |
| `compliance.test.ts` | 16 controls evaluated, secure=100% / insecure fails, evidence on findings, explainable fixes | 6 |
| `risk.test.ts` | determinism, CRITICAL band for internet-exposed admin, monotonic severity, overall risk, posture, compliance math | 6 |
| `ai.test.ts` | interpretation contract, evidence refs, **wildcard-address regression (10.0.0.0/8 ≠ 0.0.0.0)**, offline fallback, secret redaction | 6 |
| `approval.test.ts` | fresh unknown→PENDING, approve→reuse, branch variant reuses, reject→no mapping | 4 |
| `remediation.test.ts` | after > before, never mutates config, one step per failing control | 3 |
| `review.test.ts` | Human Review Queue flow + idempotent backfill of legacy FAIL/WARNING findings | 15 |

Regression fixed during verification: the wildcard check `0\.0\.0\.0` previously matched *inside*
`10.0.0.0/8`, so a restricted management network could be misread as unrestricted. Both the
JS fallback interpreter and the Python mock interpreter now match the exact wildcard only
(verified live: `SOURCE "10.0.0.0/8"` → sourceRestriction=true; `SOURCE "0.0.0.0"` → false).

## 2. Type checks & build
- `npx tsc --noEmit -p apps/web/tsconfig.json` → clean (final state, all fixes applied).
- `npx tsc -p apps/api/tsconfig.json --noEmit` → clean.
- `npm run build --workspace=apps/web` (`tsc --noEmit && vite build`) → clean, dist produced (~6.9s). Chunk-size warnings are pre-existing informational output about bundle size only, not build errors, and do not affect GitHub Pages deployment.

## 2a. Final QA scope (this release cycle)
QA ran against three distinct runtimes to match every deployment path:

| Runtime | Base URL | Behavior | Result |
|---|---|---|---|
| Live API | `http://localhost:5173` (vite dev + Express `:4000`) | full backend, empty baseline reseeded | 38/38 flows, 0 console errors |
| GitHub Pages demo | `http://localhost:4173` (built `dist`, static) | in-browser demo API + localStorage, zero network | 40/40 flows, 0 console errors, 0 failed requests |
| Responsive matrix | `http://localhost:4173` (built `dist`) | 5 viewports × 5 routes + drawer + console | 34/34 checks, 0 horizontal overflow |

### 2a.1 Functional matrix (Playwright, headless Edge)
Covers: landing, dashboard KPIs, AI OFFLINE/LIVE badge + reviewer session, Global Compliance Passport, request-human-review on conflicts (card → toast → `REVIEW REQUESTED`), region switch IN→India+EU re-deriving frameworks, Compliance Overview/Frameworks/Controls/Findings, Human Review Queue, vendors, devices posture, networks topology + Investigate, assets, New Audit wizard, full end-to-end audit via sample asset, history search, reports, AI Insights, risk analysis, recommendations, Governance frameworks, control mapping, regulatory context, Scenario Lab (runs a scenario to change detail), Safe Change Governance (full analyze→simulate→approve→execute→verify gate workflow), Exception Guardian, vendor risk + dependency graph, audit trail pagination, compliance drift, **drift-acknowledge persistence across reload in demo mode**, Settings, 404 route, Ctrl+K palette, refresh re-fetch.

### 2a.2 Responsive matrix
`desktop-wide 1600 · laptop 1366 · tablet-lg 1024 · tablet-portrait 768 · mobile 390`, routes `/app`, `/app/governance`, `/app/governance/drift`, `/app/audits/history`, `/app/compliance`. All PASS with no horizontal overflow and no unexpected console errors; mobile drawer open/close verified at both ≤768 widths.

## 2a.3 Performance audit (animation/runtime)
All animation & polling audited for duplicate loops, back-to-back listeners, unmount leaks and unnecessary layout work:

| Check | Verdict |
|---|---|
| CyberGlobe — object-direct `useFrame` rotation (no per-frame React state), `frameloop="demand"` while paused, rendered materials memoized and disposed, IntersectionObserver + `visibilitychange` pause, DPR capped at 2 | clean |
| NexusCore lazy-loads CyberGlobe; wrapper `pointer-events-none` | clean |
| BackgroundFx canvas — rAF loop cleaned up, cancelled on unmount, reduced-motion aware, DPR capped | clean |
| ComplianceFlow / NexusFlow — pure CSS animations, no JS timer | clean |
| CountUp — bounded rAF, cancelled on unmount | clean |
| AIAnalysisAnimation — interval gated to `ANALYZING` state + reduced motion, cleaned | clean |
| useAiMode — single fetch with AbortController | clean |
| AppShell health poll — 30s interval, cleaned on unmount | clean |
| LiveClock — **was 1s `setInterval` always running** | **fixed** |
| `flow-particle` keyframe animates `left` | negligible (10px element), left as-is |
| gateway-flow rAF monkey-patch | only inside generated preview iframe, safe |

### 2a.4 Bugs found & fixed this cycle
1. **`AppShell.tsx` LiveClock ran a 1s `setInterval` unconditionally** (even when visually hidden) — now gated to `matchMedia("(min-width: 1280px)")` with a `change` listener to bridge viewport crossings.
2. **`SafetyGate.tsx` missing React `key` on mapped fragments** — dev-only `console.error`; wrapped items in `<Fragment key>`.
3. **`GlobalCompliancePage.tsx` mobile horizontal overflow (+193px)** — the Framework Coverage grid (`md:grid-cols-2` with no base column) sized its auto grid track to max-content at <md; long framework names widened the page. Fixed with `grid-cols-[minmax(0,1fr)] md:grid-cols-2`.
4. **`CompliancePage.tsx` mobile horizontal overflow (+26px)** — the section tab nav had no scroll containment; active "Findings" tab clipped off-viewport at 390px. Fixed with `overflow-x-auto`.

All four fixes verified by re-running tsc, build, and the full QA matrix (sections 2a.1–2a.2), and by the API suite (52/52). No regressions.

## 2a.5 GitHub Pages readiness
The built app ships in demo mode when no API base is configured (`DEMO_MODE` = running on `pages` OR `API_BASE===null`), verified on the built `dist` at `:4173`: no network calls fail, localStorage persistence works across reload (drift acknowledgment survived), reviewer session present without any auth backend. Deploy = static `apps/web/dist` only.

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