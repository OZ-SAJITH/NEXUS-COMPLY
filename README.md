# NEXUS-COMPLY

**Adaptive, Evidence-Driven Multi-Vendor Network Security Compliance Auditor**
Prototype build for **Smart India Hackathon 2026 (SIH26155)**.

Audit device configurations from **Cisco IOS, Fortinet FortiGate, and Juniper Junos**, and — when a config uses unknown/proprietary syntax — get an **AI-proposed interpretation** that stays **PENDING until a human approves it**. Approved interpretations become **reusable mappings** keyed by structural fingerprints, so variants of the same custom language are compliant on sight, next time.

## Why this is different
- **Deterministic engine for known vendors** — every finding has evidence (file, line range, snippet, reason). No AI guesses.
- **Human-in-the-loop AI for everything else** — the AI only proposes; a human decides; the system learns.
- **Explainable risk** — 0–100 score from transparent factors (severity 35%, exposure 30%, criticality 15%, importance 10%, exploitability 10%).
- **Safe remediation simulation** — fixes are computed on in-memory copies; real config is never mutated.
- **Runs fully offline** — mock AI provider + deterministic fallback, zero paid infrastructure.

## Quick start
```bash
npm install
npm run start-all   # API :4000 + optional AI :8000 + Web :5173, one command
# or
npm run demo        # same, but resets the demo DB first (consistent judged state)
```
- The API auto-seeds **7 demo audits** on first run, so the dashboard is populated immediately.
- Point the UI at your own configs, or hit **LOAD DEMO** for one-click scenarios.
- Prefer individual terminals? `npm run dev:api`, `npm run dev:ai`, `npm run dev:web`.

## Tests
```bash
npm test          # 35 vitest tests: parsers, compliance, risk, AI contract,
                  # approval→reuse loop, remediation
```

## Layout
```
apps/api          Express REST API (audit pipeline, AI approval, reports)
apps/ai-service   FastAPI AI interpreter (mock / OpenAI / Gemini / OpenRouter)
apps/web          React + Vite + Tailwind UI
packages/         shared-types · security-intent · compliance-rules
samples/          secure/insecure Cisco, Fortinet, Juniper + unknown-language demo
docs/             ARCHITECTURE · IMPLEMENTATION_PLAN · SECURITY_MODEL · DEMO_SCRIPT
scripts/          smoke test, mapping-reuse verification
```

## Docs
- [Architecture](docs/ARCHITECTURE.md)
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Security model](docs/SECURITY_MODEL.md)
- [Demo script](docs/DEMO_SCRIPT.md)
- [Solution pitch](docs/SOLUTION_PITCH.md)
- [Verification report](docs/VERIFICATION.md)