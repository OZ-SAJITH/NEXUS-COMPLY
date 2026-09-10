# NEXUS-COMPLY — Architecture

> Adaptive, evidence-driven multi-vendor network security compliance auditor.
> Prototype build for **Smart India Hackathon 2026 (SIH26155)**.

## High-level flow

```
                     ┌──────────────────────────────────────────────┐
                     │             React + Vite (apps/web)         │
                     │  Dashboard · Audit · Findings · Exposure ·  │
                     │  Remediation · AI Review · Reports          │
                     └───────────────▲──────────────────────────────┘
                                     │  REST (JSON) + file upload
                     ┌───────────────┴──────────────────────────────┐
                     │          Express API (apps/api)              │
                     │  routes → services → engines → storage      │
                     └──▲──────────────────────────────┬───────────┘
        redacted config │                              │ candidate
       (never secrets)  │                              │ interpretation
                     ┌──┴─────────────────┐   ┌────────▼───────────┐
                     │   Python FastAPI   │   │   Compliance /     │
                     │   AI service       │   │   Risk engines     │
                     │   (mock | live)    │   └────────┬───────────┘
                     └────────────────────┘            │
                                              ┌────────▼───────────┐
                                              │  JSONRepository    │
                                              │  data/db.json      │
                                              └────────────────────┘
```

## Repository layout (npm workspaces monorepo)

| Path | Responsibility |
|---|---|
| `packages/shared-types` | Canonical TypeScript types (SecurityIntent, Finding, AuditRecord, AiInterpretation, ApprovedMapping, …). |
| `packages/security-intent` | Vendor-neutral Security Intent IR helpers (intent labels, `isSourceRestricted`, `protocolIsInsecure`, …). |
| `packages/compliance-rules` | 16 prototype controls + deterministic explainable risk engine, compliance summary, posture score. |
| `apps/api` | Express REST API: upload, audit, findings, AI interpret + approve/reject/edit, remediation simulation, exposure paths, dashboard, reports, sample loader. |
| `apps/ai-service` | FastAPI service that interprets **unknown** vendor syntax into a structured Security Intent with confidence. Provider plug-in: mock (default), OpenAI, Gemini, OpenRouter. |
| `apps/web` | React + Vite + Tailwind UI. |
| `samples` | Realistic secure/insecure configs for Cisco, Fortinet, Juniper, plus a proprietary unknown language demo. |
| `scripts` | Verification utilities (smoke test, mapping reuse test). |

## Key design decisions

1. **Two-pass pipeline (deterministic, evidence-driven).**
   Known-vendor configs go through a syntax adapter → Security Intent IR → compliance engine. Each finding carries `evidence` (file, line range, snippet, reason).

2. **Unknown syntax → AI-assisted adaptive path.**
   When vendor detection fails, the AI service produces a *candidate* interpretation (SecurityIntent + confidence + evidence). The human must **approve** it before it becomes reusable. Approved interpretations are stored as `syntaxFingerprint → intent` mappings.

3. **Structural fingerprinting for reuse.**
   `fingerprintSyntax()` normalizes a configuration to its keyword structure (values stripped), so variants of the same custom language (e.g. `custom-demo.conf` vs `custom-demo-branch.conf`) share a fingerprint and reuse the approved mapping.

4. **Human in the loop is mandatory.**
   AI output is never authoritative. PENDING → APPROVE / REJECT / EDIT. Only APPROVED (or EDITED) interpretations persist a mapping.

5. **Zero-infrastructure persistence.**
   `apps/api/src/storage/jsonRepo.ts` is a JSON-file repository (auto-created `data/db.json`). The interface is a thin adapter that can be swapped for PostgreSQL in production (see `docker-compose.yml`).

6. **Development runnable offline.**
   With `AI_PROVIDER=mock` (default), the API falls back to a deterministic in-process interpreter if the Python service is unavailable. Nothing is blocked by missing cloud keys.

## Pipeline detail

1. **Vendor detection** — `detectVendor()` scores marker regexes (Cisco IOS, Fortinet FortiGate, Juniper Junos) → `known` | `unknown`.
2. **Redaction** — `redactSecrets()` strips passwords/secrets *before* any AI call (`redactedConfig` only).
3. **Parse** — known → adapter (`cisco.ts`, `fortinet.ts`, `juniper.ts`); unknown → adaptive path.
4. **Evaluate** — `evaluateIntents()` runs all 16 controls → PASS / FAIL / WARNING / NA with evidence.
5. **Risk** — `buildRiskAssessment()` combines severity, exposure, criticality, importance, exploitability into a 0–100 explainable score.
6. **Persist** — audit + configuration + interpretations + mappings to `data/db.json`.
7. **Act** — remediation simulation (in-memory copies only), exposure path analysis, printable HTML report.

## Services & storage contract

- REST endpoints live in `apps/api/src/routes/index.ts` (see that file for the full list).
- `apps/api/src/services/auditService.ts` orchestrates the whole audit pipeline (`runAudit`).
- Storage is behind `getRepository()` so tests and runtime can point `DATA_DIR` anywhere.

## Running

```bash
npm install          # one-time
npm run start-all    # one command: API :4000 + AI :8000 (optional) + Web :5173
npm run demo         # same, but resets the demo DB first (consistent judged demo)
```

The API **auto-seeds 7 demo audits** when the database is empty, so the
dashboard is populated on first load. Individual services can also be started
separately with `npm run dev:api`, `npm run dev:ai`, `npm run dev:web`.

See `docs/IMPLEMENTATION_PLAN.md` for build order, `docs/VERIFICATION.md` for
test/verification evidence, and `docs/DEMO_SCRIPT.md` for the judged walkthrough.