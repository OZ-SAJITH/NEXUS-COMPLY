# NEXUS-COMPLY — Demo Script (judged walkthrough)

Time-boxed ~5 minute run. Everything below is driven by the real engine (no canned numbers).

## 0. Pre-flight (already running)
- One command: `npm run demo` → API `:4000` (auto-seeds 7 demo audits) + AI `:8000` + Web `:5173`.
- Open http://localhost:5173

## 1. Dashboard (30s)
The landing dashboard shows **real aggregates**:
- Posture gauge, compliance donut (37 passed / 11 failed across 7 seeded audits), severity bar, vendor distribution (Cisco/Fortinet/Juniper/Unknown).
- **Top risks** with explainable scores, exposure + recent audits.
- "Adaptive" panel: known analyzed = 6, unknown detected = 1, AI interpretations, approved mappings.
> Speak to: *every number is computed from parsed intent + the explainable risk formula, nothing is hard-coded.*

## 2. Known-vendor audit (60s)
- Click **LOAD DEMO** → scenario "Cisco — relaxation of management controls" (or upload `samples/cisco/demo-insecure.conf`).
- Result page shows compliance 67% (6 pass / 3 fail / 1 warning / 6 NA).
- **Findings tab**: TELNET (82), MGMT (67), SNMP (52) — click any to see line-numbered evidence and the recommended fix.
- **Exposure tab**: Internet → Firewall → TELNET → Admin Device → Critical Server.
- **Remediation tab**: Simulate Fix → compliance 67 → **100**, posture 50 → 100, high-risk findings drop to 0.
> Speak to: *simulation only ever touches in-memory copies — the real config is never mutated.*

## 3. The flagship — unknown syntax + AI + human approval (120s)
- **LOAD DEMO** → scenario "Custom vendor — new device lands on the SOC desk".
- Vendor detection returns **unknown**; the AI service (mock) reads the redacted config and proposes `RESTRICT_ADMIN_ACCESS`, confidence **0.91**, with evidence lines.
- The proposal sits **PENDING**; the review card offers **Approve / Reject / Edit**.
- Click **Approve** → the mapping is persisted.
- Upload the *branch* variant (`samples/unknown/custom-demo-branch.conf`):
  - Same custom language, different values → same structural fingerprint → **mapping reused** (no new AI call), compliance evaluated from the approved intent, adaptive counters update (approvedMappings 1, totalAudits 8).
> Speak to: *AI proposes; the human decides; the system learns by syntax structure — not by config hash — so real-world variants reuse approval.*

## 4. Unknown without approval (30s)
- Upload `custom-demo.conf` a second time on a fresh database (or reject the candidate) → nothing is reused; `usedApprovedMapping = false`. Proves the gate is enforced.

## 5. Reports & the models (30s)
- On any audit, open **Report** tab → self-contained printable HTML with branding → judge's browser **Print → Save as PDF**.
- Mention file evidence + explainable risk formula and the 35 vitest tests (`npm test`).

## Exit hooks for judges
- "How is this adaptive?" → unknown vendor + AI proposal + approval + structural-fingerprint reuse.
- "Is AI trusted by default?" → no — PENDING gate, mock provider default, offline fallback still requires approval.
- "Where are the credentials?" → never sent; redaction happens before the AI call; report shows redaction counts.
- "Can it scale?" → JSON repo is an adapter; swap in PostgreSQL (docker-compose provided); parsers are a plugin registry.