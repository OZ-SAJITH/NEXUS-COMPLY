# Yellow-Orb Removal + Visible Motion Upgrade

Scope: fix the "large yellow/orange glowing circle" floating beside the NEXUS logo and make the
in-app motion clearly visible, premium, professional, and bound to real application state.
No build tooling or new dependencies were added — everything uses the existing CSS keyframe /
transition system already in `apps/web/src/index.css`.

---

## 1. Root cause of the yellow circle

The amber orb was **not** a raw PNG or a background blob. It was rendered by the logo state system:

- The sidebar / header NEXUS logo displays `REVIEW_REQUIRED` whenever the live review queue count
  (`GET /api/reviews` → `PENDING_REVIEW` + `CHANGES_REQUESTED` + `AI_GENERATED`) is non-zero.
- `apps/web/src/index.css` (`.nexus-logo--review`, previously lines 575-590) painted an **amber
  radial-gradient halo** (`rgba(245,158,11,…)`, 130% the size of the mark, blurred), an **amber
  pulsing ring**, and an **amber badge dot with a glow** (`box-shadow 12px`), all breathing on an
  infinite 2.2-2.6s loop.
- Because the demo dataset always has pending review items, the sidebar logo sat in that amber
  state permanently — a big glowing yellow/orange circle right next to the brand mark.
- Under `prefers-reduced-motion` the object still rendered as a *static* amber glow (animations are
  killed, the amber fill remained), which is why it never "went away" and the page felt static too.

## 2. What was removed

- Deleted **all** amber halo / amber ring / amber badge-glow rules for `.nexus-logo--review`,
  `.nexus-logo--warning`, and `.nexus-logo--error` (halo/ring now keep the brand cyan only).
- Removed the amber warning halo/badge rules for the `WARNING` logo state (that state was unused in
  the app anyway).
- Removed the white "review dot" badge rendering from `AnimatedNexusLogo` — the only badge that can
  still appear is a **small, non-glowing red triangle** on the transient `ERROR` state (login /
  approval failure); no colored orb is ever drawn around the logo again.
- Updated the `prefers-reduced-motion` block so the review state has no badge/halo tint to freeze.
- Review signal still lives where it belongs: the sidebar **review chip**, dashboard **NexusCore**
  ("REVIEW REQUIRED"), and notifications — driven by the same real queue count.

Result (verified in-browser): every `.nexus-logo__halo` computed style is
`rgba(56,189,248,…)` (cyan) — zero elements contain `rgba(245,158,11,…)`; no review badge renders.

## 3. Motion system (unchanged foundation, tuned for visibility)

All animation is custom CSS keyframes + transitions in `apps/web/src/index.css` (no library —
Framer Motion is not installed and was not added). GPU-friendly: only `transform` / `opacity` /
`filter` / `stroke-dasharray` animated. Single easing vocabulary `--ease-out / --ease-exp /
--ease-spring` and duration tokens `--dur-fast … --dur-cine`.

This iteration made the existing language noticeably *visible*:

- **Page transitions**: `page-enter` now 380ms exp-ease with `translateY(18px)` + `blur(10px)`
  un-blur (was 640ms, subtler). Every route is wrapped in `<div key={location.pathname}>`
  (`AppShell.tsx`), so each navigation reliably replays it.
- **Row/list entrances**: `row-in` raised to `translateY(12px)`.
- **New staggered-section helper `.enter-up`** (460ms, `backwards` fill) — used on
  `AuditResultPage` so interactive hover-lifts are never locked by the entrance fill.
- **Logo intro tightened** to ~1.1s (symbol scale/blur-in → light sweep → wordmark reveal).
- **Buttons**: every `.btn` presses down (`active:scale-0.97`); primary already kept its press.

## 4. Every major animated surface

| Surface | Animation | Bound to |
| --- | --- | --- |
| Signature NEXUS logo | state halos/rings/sweep/scan/particles; intro; breathing | real `NexusLogoState` |
| AI pipeline (new `AIAnalysisAnimation`) | 4-stage scan→map→score→findings with pulsing nodes, filling bars, WORKING/DONE/QUEUED tags, success logo flash on completion | AuditPage `aiStatus` (`ANALYZING`…`COMPLETE`/`ERROR`) |
| Route change | rise + un-blur page entrance | `location.pathname` keyed remount |
| Sections on audit result | staggered `.enter-up` header/chips/exec/tabs | page mount |
| Compliance ring | stroke-dasharray draws 0→score (1s exp) | real `audit.compliance.score` |
| Compliance score | `CountUp` 0→score | same |
| SumStat KPIs on result | `CountUp` 0→value | real counts |
| Tabs | animated sliding underline (`scaleX`) on toggle | active tab state |
| Process steps (properties / framework) | row/step stagger | data lists |
| Human review approve/reject/changes | modal spring, approval success flash on the logo, toast, status-flash | `api.approveFinding` etc. |
| Report generation | step light-up + indeterminate shimmer → REPORT READY | `fetch(reportUrl)` resolution |
| Audit trail timeline | line grows + nodes/icon pop | stage state changes |
| Sidebar | nav pill sweep, entry, collapse tooltips | active route + collapsed state |
| Cards / metrics | cursor spotlight, hover lift, count-up | hover + in-view |

## 5. Files changed

- `apps/web/src/index.css` — removed amber halo/ring/badge glow; tuned `page-enter`, `row-in`,
  logo intro; added `.enter-up`, `.tab-btn::after`, `.ai-stage*`/`.ai-bar`/`.ai-blink`,
  `active:scale` on buttons; updated reduced-motion block.
- `apps/web/src/components/motion/AnimatedNexusLogo.tsx` — badge only for `ERROR` (small red,
  non-glow); intro timer 1500→1200ms.
- `apps/web/src/components/motion/AIAnalysisAnimation.tsx` — **new** reusable real-status pipeline
  animation.
- `apps/web/src/pages/AuditPage.tsx` — step 5 now uses `AIAnalysisAnimation`; analysis step dwell
  time aligned with the real AI phase timeline (2600ms) so the animation is actually seen instead
  of flashing for ~600ms.
- `apps/web/src/pages/AuditResultPage.tsx` — staggered entrances, ring draw-on-mount, `CountUp`
  score + SumStats, animated tab underline, tab-content entrances.
- Verification: `logs/probe-motion2.mjs` (new), existing `probe-nexus.mjs` / `verify-review.mjs`.

## 6. Real-state binding (no fake data / no fake status)

- `AIAnalysisAnimation` only appears during a real audit run; `ANALYZING` comes from AuditPage
  `aiStatus`, `COMPLETE` only after `api.createAudit` resolves, `ERROR` only on a real failure.
  Pipeline step pacing is cosmetic (a loading visual); the terminal states are real.
- Compliance ring / score / SumStats are the real audit's numbers.
- REVIEW state is the real queue count; SUCCESS flashes are driven by real approve/login actions.
- AI/online indicators unchanged (still reflect the live `health` check — never faked).

## 7. Performance

- Only transform/opacity/filter/stroke-dasharray animated; `will-change` limited to `.enter-up`
  and `.reveal`; ambient loops are slow (breathe 4-7.5s, radar 24s rotate).
- No reflows on hover; spotlights are `::before` gradient ups triggered by pointermove.

## 8. Reduced motion

`prefers-reduced-motion: reduce` globally snaps animations to final state (0.01ms / `animation:
none`). Verified: 0 running animation names anywhere on the login/app pages; `.enter-up` and tab
underline render static; real-state badges/checks remain visible (error triangle, success check,
NexusCore chips).

## 9. Remaining limitations

- Step pacing inside `AIAnalysisAnimation` is time-based (a loading visual) because the engine
  doesn't emit fine-grained phase events; the final COMPLETE/ERROR states are real.
- `fetch("/api")` + external CDN calls (Google Fonts, Tailwind CDN, Iconify) log
  `ERR_CONNECTION_REFUSED` in headless sandbox — pre-existing environmental network block, not a
  code regression.
- Route transitions are discrete (no cross-fade between exiting/entering routes) — an intentional
  scope limit; a dual-layer cross-fade would need extra state in `AppShell`.