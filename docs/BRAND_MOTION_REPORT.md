# Brand Motion Report — Signature Animated Logo System & Premium Interactive Motion

Extension of the earlier premium-UI upgrade (`docs/UI_MOTION_REPORT.md`). Adds a reusable animated
NEXUS-COMPLY logo, a Nexus Core system visualization, a travelling signature particle, human-in-the-loop
visualization, compliance-score split, semantic severity motion, report-generation process animation and
nav micro-interactions — all driven by real application state, never faked.

## 1. Animation library used

**None.** Zero new npm dependencies. All motion is hand-rolled:

- CSS keyframes + `prefers-reduced-motion` media queries in `apps/web/src/index.css`
- CSS custom properties injected from components (cursor `--rx`/`--ry`, particle `--px`/`--py`, stagger `--node-delay`)
- 2 tiny existing hooks: `useReducedMotion`, existing `CountUp`
- Custom window events as a lightweight state bus: `nexus:ai` (audit engine → logo) and `nexus:refresh` (queue mutation → dashboard/sidebar)

## 2. Components created

| Component | File | Purpose |
|---|---|---|
| `AnimatedNexusLogo` | `apps/web/src/components/motion/AnimatedNexusLogo.tsx` | 7-state signature logo; PNG asset animated *around* only (never distorted/replaced) |
| `NexusCore` | `apps/web/src/components/motion/NexusCore.tsx` | Dashboard "AI Security Engine" orb + arms strip |
| `HumanReviewFlow` | `apps/web/src/components/motion/HumanReviewFlow.tsx` | AI DETECTS → AI RECOMMENDS → HUMAN REVIEW → HUMAN VERIFIED pipeline |
| `ReportGenerate` | `apps/web/src/components/motion/ReportGenerate.tsx` | Modal report generation, indeterminate shimmer, real-fetch gated |

## 3. Logo states and their real-state drivers

| State | Visual | Driven by real state |
|---|---|---|
| `IDLE` | slow 7.5 s breathing halo + faint ring | no pending queue, no live analysis |
| `LOADING` | rotating scan + quick breathe | boot/LoadingScreen, login in-flight, report generation |
| `AI_ANALYZING` | radar ring + conic scan + converging particles | `nexus:ai` events from `AuditPage` during `ANALYZING…GENERATING_FINDINGS` |
| `REVIEW_REQUIRED` | amber halo/ring + badge dot pulse | live `GET /api/reviews` aggregate: `PENDING_REVIEW + CHANGES_REQUESTED + AI_GENERATED > 0` |
| `SUCCESS` | one-shot emerald check overlay | login resolves, `api.approveFinding` resolves (ReviewsPage flash) |
| `WARNING` / `ERROR` | amber/red badge (`AlertTriangle`) — **non-flashing** by design | login failure, approve failure |
| Intro | ~1.4 s symbol fade-in → light sweep → wordmark/tagline reveal | boot remount, login page, landing hero |

Wordmark + optional tagline; hover-only interactivity (`--interactive`, no motion unless hovered);
reduced-motion disables everything and keeps error/review badges visible.

## 4. NexusCore implementation

- GlassCard orb: layered `nexus-core__orb/__ring/__radar`, state class on root (`nexus-core--idle|review|critical|verified`)
- Dashboard derivation (no faked severity): `pending > 0 → REVIEW_REQUIRED` else `risk.CRITICAL > 0 → CRITICAL` else `humanVerifiedCoverage ≥ 90 → VERIFIED` else `IDLE`
- Arms show real counts: vendor platforms, controls passed, active findings; staggered row-in entry

## 5. AI flow animation (audit pipeline)

- `AuditPage` step 5 shows the logo in `AI_ANALYZING` → `SUCCESS`/`ERROR` mirroring `aiStatus`
- `NexusFlow` relabelled to the brand chain (Vendor data → AI engine → Controls → Risk → Findings → Human → Verified) and now carries the travelling **NEXUS FLOW signature particle** (one-shot light bead along the progress line)
- Run buttons show a `btn-spinner` + "ANALYZING…" state instead of a static label
- Global sidebar logo reacts to the live audit phase via `nexus:ai`

## 6. Human Approval animation

- ReviewsPage renders `HumanReviewFlow` from live queue counts; human step pulses amber while pending, emerald checks land on done steps, connectors illuminate as segments complete
- Approve resolve → brief SUCCESS logo flash overlay "Decision recorded" + `nexus:refresh` immediately updates dashboard + sidebar logo; approve failure → ERROR flash
- View-only analyst access fully preserved (E2E re-verified)

## 7. Report generation animation

- Replaces the plain "Open report" link with a generate flow: 4 stages (COLLECTING EVIDENCE → VALIDATING CONTROLS → APPLYING HUMAN DECISIONS → BUILDING REPORT), **indeterminate shimmer — no fake percentages**
- `REPORT READY` + auto-preview only after the real `GET /api/reports/:auditId` resolves; failure shows an error state with retry affordance; Cancel always available

## 8. Audit trail / timeline animation

- `AuditTrailTimeline` nodes now pop in (`timeline-node`), icons draw in (`timeline-icon`), and the vertical line grows (`audit-line`) with per-node `--node-delay` stagger

## 9. Performance & correctness

- Only `transform` / `opacity` / `box-shadow` animated; paint/GPU-friendly; no Three.js, no canvas scenes
- Logo check-draw now only animates while its overlay is visible (invisible `.check-anim` no longer animates)
- Full `prefers-reduced-motion` lockdown — E2E-verified **0 running logo animations**, no intro class, badges/checks remain visible
- Semantics: `CRITICAL`/`HIGH` severity ring-pulses (`sev-critical`/`sev-high`), `MEDIUM` subtle dot pulse, `LOW/INFO` static; `REVIEW_REQUIRED` never used as a fake red alert
- Mobile 390 px verified: no horizontal overflow on login/home

## 10. Files changed (this task)

- `apps/web/src/index.css` — full logo/core/flow/timeline/report/nav motion system + reduced-motion extension
- `apps/web/src/components/motion/AnimatedNexusLogo.tsx`, `NexusCore.tsx`, `HumanReviewFlow.tsx`, `ReportGenerate.tsx` (new)
- `apps/web/src/components/AppShell.tsx` — animated sidebar/header logos, queue-polled state, nav-pill sweep + collapsed tooltips, boot intro replay
- `apps/web/src/components/LoadingScreen.tsx`, `apps/web/src/pages/LoginPage.tsx` — logo-centric loading/login hooks
- `apps/web/src/pages/AuditPage.tsx` — AI-state logo + `nexus:ai` dispatch + spinner buttons
- `apps/web/src/pages/DashboardPage.tsx` — NexusCore strip + AI/Human compliance split
- `apps/web/src/pages/ReviewsPage.tsx` — HumanReviewFlow + approval flash + `nexus:refresh`
- `apps/web/src/pages/ReportsPage.tsx` — ReportGenerate integration
- `apps/web/src/components/VendorCard.tsx` — glass, cursor glow, mini animated ring, live status dot
- `apps/web/src/components/SeverityBadge.tsx` — semantic severity motion
- `apps/web/src/components/motion/NexusFlow.tsx` — stage relabel + signature particle
- `apps/web/src/components/AuditTrailTimeline.tsx` — growing line + node/icon pop
- `apps/web/src/pages/LandingPage.tsx` — animated hero logo

## 11. Verification (all green)

- `npm run build --workspace=apps/web` — tsc strict + vite build pass
- `npm test` — **52/52** API tests pass
- `node logs/verify-review.mjs` — approve → trail event → finalize (acknowledge flow) → analyst view-only: pass
- `node logs/verify-review2.mjs` — sealed filtering + analyst isolation: pass
- `node logs/probe-nexus.mjs` — intro sequence, sidebar `REVIEW_REQUIRED`, collapse tooltips, NexusCore chip "REVIEW REQUIRED", AI/HUMAN compliance split, report generation→`REPORT READY`, reduced-motion 0 animations, mobile 0 overflow: pass

### Remaining issues

- Headless sandbox shows `net::ERR_CONNECTION_REFUSED` for external CDNs (Google Fonts, Tailwind CDN, `api.iconify.design`) — pre-existing environmental network block, not a code regression (present in the pre-task baseline too)
- `AI_ANALYZING` on the global sidebar logo only reflects live audit runs; the audit-page logo already mirrors `aiStatus` in-situ