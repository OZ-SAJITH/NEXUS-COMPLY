# NEXUS-COMPLY — Security Model

How the prototype keeps credentials safe and audits trustworthy.

## 1. Evidence-first, no blind trust
- Every compliance finding is derived from parsed `SecurityIntent`s that carry **evidence**: `file`, `lineStart`, `lineEnd`, `reason`, `snippet`.
- No AI output influences a known-vendor audit. The deterministic engine is fully reproducible: same config → same score.

## 2. Secret redaction before AI
- `apps/api/src/utils/redact.ts` scans configurations for secrets (passwords, shared secrets, keys, hashes, tokens, SNMP community strings, credentials) and replaces them **before** any content is sent to the AI service.
- The AI service only ever receives the `redactedConfig`; the original is never transmitted.
- Redaction is applied by default on every audit (`runAudit`).

## 3. RE for candidate *only*, human approval is authoritative
- Unknown/vendor-detection-failed configs receive an AI **candidate interpretation** flagged `PENDING`.
- The system **never** applies AI intent directly. A human must either:
  - **APPROVE** → persist a reusable `ApprovedMapping`, or
  - **EDIT** → persist the corrected mapping, or
  - **REJECT** → nothing is stored and the candidate is discarded.
- Even a high-confidence mock (0.91) candidate requires approval before reuse. This keeps the adaptive behavior auditable and prevents AI hallucination from silently changing compliance results.

## 4. Reuse is scoped & keyed safely
- `ApprovedMapping`s are keyed by a **structural syntax fingerprint** (keyword structure only, no secret material is hashed — values are stripped first).
- A mapping only ever influences **unknown-vendor** audits. Known vendors continue through deterministic parsers.

## 5. Zero-infrastructure storage, swap-ready
- `data/db.json` is the only persistent store during the prototype; it lives outside `packages/`. The repository interface (`jsonRepo.ts`) is a seam for a production PostgreSQL implementation (see `docker-compose.yml`).

## 6. Developer ergonomics without lowering the bar
- Default `AI_PROVIDER=mock`: the API uses a deterministic in-process interpreter when the AI service is down, so the **full approval workflow still demos offline** — but the human-gate is never bypassed.
- API keys for live providers are read from `AI_API_KEY` / `.env` and are never logged or exposed to the frontend.

## 7. Surface chatter
- Standard mitigation: CORS on the API, JSON body limits, no secrets in `.env.example`, `.gitignore` excludes `data/`, `node_modules/`, `.env`, build/dist output.

## 8. Known prototype limitations (documented for judges)
- Redaction is regex-based — robust for demo-grade configs, but a production system should parse the vendor grammar.
- No per-user auth/tenancy in the prototype (adds no demo value); modeled as a single-operator tool.
- AI confidence is per-proposal, not calibrated; approval remains the trust anchor.