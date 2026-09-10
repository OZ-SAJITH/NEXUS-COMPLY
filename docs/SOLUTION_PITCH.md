# NEXUS-COMPLY — Solution Pitch

> **Problem (SIH26155).** Network teams must keep hundreds of heterogeneous
> devices compliant with security policies — Cisco IOS, Fortinet FortiGate,
> Juniper Junos, and a long tail of new, proprietary, and "cloud-style"
> configuration languages. Compliance checks today are either vendor-locked
> rule templates (miss the long tail) or manual review (slow, error-prone).
> AI analysis alone is not trusted: no evidence, hallucination risk.

## Our answer
**NEXUS-COMPLY** is an evidence-driven adaptive auditor:

- **Known vendors → deterministic, evidence-backed audit.** Vendor syntax is
  parsed into a vendor-neutral *Security Intent IR* (admin access, source
  restriction, insecure protocols, logging, segmentation, …). Every finding
  shows **file + line range + snippet**, so a security engineer can verify it
  in seconds. Risk scores are fully explainable (severity 35%, exposure 30%,
  criticality 15%, importance 10%, exploitability 10%).

- **Unknown syntax → AI proposes, human approves, system learns.**
  When detection fails, an LLM interprets the redacted config into the same
  Security Intent with a **confidence score** and evidence. The result stays
  **PENDING** — it is never applied without a human. Approve it once and the
  mapping is stored against a *structural* fingerprint of the syntax, so a
  slightly different device from the same vendor is compliant on sight, next
  time, **without another AI call and without another human review**.

## What makes it novel
1. **Vendor-neutral intent layer.** "Restrict admin access to an internal net"
   is the same intent whether it arrives as `access-class`, `set trusted-host`,
   `set system services ssh`, or a proprietary `MGMT.ACCESS { SOURCE … }` block.
   One compliance engine, many languages.
2. **Human-in-the-loop adaptivity.** AI is a *proposal engine*, never an oracle.
   The judge-verifiable loop is: upload → propose (91% mock) → **Approve** →
   reuse on a different variant of the same language (proven end-to-end).
3. **Structural, not hash, fingerprints.** `custom-demo.conf`,
   `custom-demo-branch.conf`, and `custom-demo-partner.conf` differ in every
   value yet share fingerprint `01n828ph` — because reuse keys on *syntax
   shape*, mirroring how humans recognize "this looks like the same config
   language".
4. **Trust built into the wiring.** Secrets are redacted before any AI call;
   the AI service only ever sees `redactedConfig`. The report generator,
   remediation sim, dashboard, and PDF all come from the **same** deterministic
   pipeline — no canned screenshots, nothing hard-coded.

## Impact & fit for SIH
- **Multi-vendor reality:** 3 named parsers + adaptive long-tail = coverage that
  template vendors cannot match without shipping new rules.
- **Zero-infra, demo-ready:** JSON-file storage, mock AI provider + in-process
  fallback, one-command `npm run demo`. Fully offline capable.
- **Honest AI:** confidence + evidence + mandatory approval — directly answers
  the "can we trust AI?" objection that judges raise.
- **Extensible:** parsers, controls, and AI providers are plugin registries;
  storage is an adapter (PostgreSQL swap included in `docker-compose.yml`).

## Ask
We built the end-to-end prototype with **35 passing tests**, a judged
walkthrough ready, and verified evidence for every claim
(see `docs/VERIFICATION.md` and the seeded dashboard). We want to take this
into hardening: more controls catalogs (CIS/ISO/NIST mapping), a real
PostgreSQL backend, and live-provider integration — with the human-in-the-loop
approval model as the design centerpiece.