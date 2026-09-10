# §40 — Final Report: Premium UI Motion Upgrade

A zero-dependency, in-house motion system transforming the NEXUS-COMPLY console into a
high-end animated SOC platform ("AI-Powered Compliance, In Motion"). Backend logic,
business semantics, APIs, and tests are **unchanged** — this is a presentation-layer
upgrade only.

## 1. Animation library used
None (by design). We rolled a micro motion system in ~600 lines of CSS + 3 small hooks
because no animation lib is installed and the constraint was "no new npm dependencies."

- **CSS keyframes/transitions** for 90% of motion (GPU-friendly `transform`/`opacity` only).
- **IntersectionObserver** (`useInView`) for scroll-triggered `reveal` / `row-in` stagger.
- **requestAnimationFrame** for the particle network, count-up number tween & the audit
  pipeline keyboard progression — all paused when the tab is hidden (`document.hidden`).
- **`prefers-reduced-motion: reduce`** globally disables decorative animation in CSS and
  gates all JS-driven motion via `useReducedMotion`.

Motion tokens live in `apps/web/src/index.css` `:root` (`--dur-fast:160ms`,
`--dur-normal:280ms`, `--dur-med:420ms`, `--dur-cine:640ms`, `--dur-cine-slow:900ms`,
`--ease-out`, `--ease-exp`, `--ease-spring`).

## 2. Components created
| Component | Role |
|---|---|
| `components/motion/Reveal.tsx` | IntersectionObserver reveal wrapper (div-only, configurable delay/as=) |
| `components/motion/CountUp.tsx` | eased number tween on mount/in-view (rAF, reduced-motion instant) |
| `components/motion/GlassCard.tsx` | blur/glass card + pointer spotlight via `--rx/--ry` custom props |
| `components/motion/Modal.tsx` | accessible dialog (md/lg, Esc close, mount/unmount closing animation) |
| `components/motion/Toast.tsx` | tone-aware ratifications (success/warning/error/info, auto-dismiss, progress bar) |
| `components/motion/BackgroundFx.tsx` | fixed network-particle canvas + gradient blobs + grid-pan; hidden-tab paused |
| `components/motion/AiStatusIndicator.tsx` | 7-state AI status core with per-state pulse/scan animations |
| `components/motion/NexusFlow.tsx` | pipeline stages `Vendor → Data → AI → Controls → Risk → Human → Verified`, typed for running/complete/error |
| `hooks/useInView.ts` / `useReducedMotion.ts` | observation + reduced-motion hooks |

## 3. Global motion system (index.css)
`page-enter`, `toast-in`, `row-in`, `reveal`, `float-soft`, `status-flash`, `seal-glow`,
glass/`glass-card`, `bg-aurora`/`blob`/`grid-pan`, `ai-ring-pulse`, and all AiStatus
core states, plus a global reduced-motion media query that freezes everything decorative.

## 4. What animates, screen by screen
- **AppShell**: fixed background FX, glass sidebar + sticky header with gradient underline,
  hyperlink-style nav (active-pill glow, icon pop `group-hover:scale-110`), keyed
  `page-enter` on every route change, glass dropdowns + drawer, `ai-ring-pulse` notification badge.
- **Dashboard**: staggered KPI count-ups (60–300ms), human-in-the-loop block, animated
  compliance ring + count-up score, gauge count-up, framework rows reveal, top-risk links
  hover-translate, AI insight panel + network graph inside a GlassCard.
- **AI analysis (Audit page)**: live 5-step pipeline — `NexusFlow` + `AiStatusIndicator`
  progress through ANALYZING → MAPPING_CONTROLS → ASSESSING_RISK → GENERATING_FINDINGS →
  COMPLETE with real domino timers; step completion status-flashes.
- **Human approval (Reviews)**: approval/reject/correct actions, human-badge flash,
  audit-trail row-in event log, finalize modal + ratifying toast, busy spinners, empty
  state float animation.
- **Audit trail**: each event staggers in; sealed (RESOLVED) nodes pulse teal.
- **Charts**: report charts keep Recharts' built-in enter animations; risk gauge and
  compliance ring additionally count up.
- **Login / Loading**: glass card + `float-soft` hero visual, `ai-ring-pulse` boot screen.
- **Every list/table/grid** (findings, controls, vendors, devices, assets, reports,
  insights, audit history): `row-in` stagger during route entry.

## 5. Verification
- `npm run build --workspace=apps/web` — ✔ (tsc strict + vite; 1920 modules;
  CSS 64.3 kB, JS 422.4 kB / 117 kB gzip).
- `npm test` — ✔ 52/52 (7 test files).
- Playwright E2E against live servers — ✔ `verify-review.mjs` + `verify-review2.mjs`
  (approve/finalize flow, analyst view-only isolation intact).
- Reduced-motion probe — ✔ `matchMedia` matches, **0 canvases / 0 running CSS
  animations** rendered, no console errors.
- Mobile probe 390px — ✔ hamburger menu present, **0 horizontal overflow**, no errors.

## 6. Performance
GPU-composited layers only, rAF particle field pauses off-screen, single fixed canvas
throttled to DPR≤2, IntersectionObserver-driven (scroll-triggered) reveals, full
`prefers-reduced-motion` support. Bundle grew ~1 kB gzip over the previous polish pass.

## 7. Remaining known issues (accepted)
- Console noise: `ERR_CONNECTION_REFUSED` from the `useAiMode` provider probe (graceful
  offline fallback) and one intentional 400 from the acknowledge-pending finalize hint —
  both expected on a demo box without the AI service.
- `Approve`-text count in `verify-review.mjs` (analyst) = 1 is a statistics FilterChip
  ("APPROVED · 0"), **not** an editable action — `verify-review2.mjs` confirms 0 actionable
  buttons for the analyst.
- Sealed (RESOLVED) findings excluded from the default actionable queue by design;
  visible under the RESOLVED filter with a "Sealed" chip.