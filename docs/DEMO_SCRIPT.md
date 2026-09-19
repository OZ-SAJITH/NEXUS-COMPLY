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
- Mention file evidence + explainable risk formula and the 195 tests (`npm test`: API 151 + Web 44).

## 6. Global Adaptive Governance — PHASE 4 (60s)
- Sidebar → **Enterprise** → **Governance** (portrait: Global policy, Adaptive).
- **Regime posture**: by-region rows (India / Singapore / United States — scores come from the same compliance engine; PASS controls counted) and by-framework rows with COMPLIANT/PARTIAL/AT_RISK chips.
- **Framework catalog**: NIST CSF 2.0, CIS v8, ISO/IEC 27001:2022, PCI-DSS, OWASP ASVS + PROTOTYPE — each with authored `Applicable|Optional|Organization-selected`, scope and a disclaimer. *Not claimed as regulatory fact.*
- **Regional policy profiles**: Global Baseline + 5 regional policies; an asset selects deterministically by region (refresh-safe).
- **Asset decision trace**: pick **API-GATEWAY-01** → policy **INDIA_ENTERPRISE**, 14 applicable controls, 14 findings. Open the asset.
- On the asset's **Adaptive Governance** panel: controls grid with `whyApplicable` per control; under Governance exceptions click **Request exception** (pick `TLS-001`, reason, 30 days) → status **REQUESTED** → **Approve** → notice *"renders FAIL + EXCEPTION APPROVED until …"*. Never a silent PASS.
- Further down the asset page: **Impact cascade** — API-GATEWAY-01 → dependent service/application/database nodes → **Business impact** (Customer PII / Payment border), with the blast-radius summary lines. *An approved exception still shows its downstream blast radius.*
- Back to **Enterprise → Audit Trail**: filter `Governance exception decided` → the decision is timestamped, actor-attributed, append-only. Dashboard **Regional & framework posture** panel echoes the same numbers.
> Speak to: *the policy is data, not code — swap a regional profile and the applicability engine re-derives the posture; exceptions are governed decisions, so a FAIL stays visible as FAIL + EXCEPTION APPROVED.*

## 7. AI Remediation Intelligence — PHASE 6 (60s)
- Sidebar → **Enterprise** → **Remediation** (portrait: Workflow).
- Find the **TLS-001** card (`SET_TLS_MIN_VERSION`, risk band CRITICAL, status **PLANNED**). Click **Generate AI plan**.
- The card expands with the **AI Remediation Intelligence** panel:
  - header: version badge **v1**, source badge **Baseline remediation guidance** (deterministic, evidence-grounded — never presented as an AI verdict), **Change risk HIGH** pill, confidence.
  - **Root cause** with certainty badge **Evidence-grounded**, **Evidence used** rows with verified chips + short hashes (derived SHA-256 over the stored payload).
  - **Recommended actions** — *Set minimum TLS version to 1.2; disable TLS 1.0/1.1 cipher suites* (`SET_TLS_MIN_VERSION`) + *Apply strong cipher configuration and remove legacy key exchange / weak ciphers* (`ENFORCE_STRONG_CIPHERS`), each with target / expected config state / reason and an "approval required" badge.
  - **Pre-checks**, **Validation plan** (BEFORE / CHANGE / AFTER with expected evidence), **Rollback plan** + **AVAILABLE**, **Expected result**, **Connector capability** (vendor-aware) and the **Unavailable** list.
- Click **Regenerate AI plan** → notice: *regenerated v2* — the record keeps its history (version bumps, no overwrite).
- Keep the **human gate** on: Validate → **Request approval** → **Approve** → Execute → verify — the AI only proposes the change; the orchestrator (with the production connector policy gate intact) executes after human approval.
> Speak to: *the plan is generated as data and structurally validated before it is stored; evidence is a consideration, not invented ground truth — no evidence would flip the root cause to INSUFFICIENT_EVIDENCE; baseline guidance is labeled as such, never an AI verdict; and approval is always required — the AI can never bypass the human.*

## Exit hooks for judges
- "How is this adaptive?" → unknown vendor + AI proposal + approval + structural-fingerprint reuse.
- "Is AI trusted by default?" → no — PENDING gate, mock provider default, offline fallback still requires approval.
- "Where are the credentials?" → never sent; redaction happens before the AI call; report shows redaction counts.
- "Can it scale?" → JSON repo is an adapter; swap in PostgreSQL (docker-compose provided); parsers are a plugin registry.
- "What does the AI plan add?" (PHASE 6) → structured, evidence-grounded remediation plans with derived hashes, change-risk classification, validation/rollback steps, baseline-labeled fallback — generated as data into the same human-approved workflow, never executed directly.