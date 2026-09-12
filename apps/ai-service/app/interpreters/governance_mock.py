"""Deterministic mock/fallback governance AI interpreters.

These produce structured change-impact narratives, simulation advisories,
exception triage recommendations and regulatory digests without any external
calls. Output is clearly labelled as DEMO (Mock) — never presented as live AI.
"""

from typing import List

from app.schemas.governance import (
    AnalyzeChangeRequest,
    AnalyzeChangeResponse,
    DiffSummaryItem,
    RegulatoryDigestRequest,
    RegulatoryDigestResponse,
    RegulatorySignal,
    SimulateAdvisoryRequest,
    SimulateAdvisoryResponse,
    TriageExceptionRequest,
    TriageExceptionResponse,
)

_HARDENING = ("enabled", "full", "mandatory", "restricted", "aes-256", "1.3", "isolated", "true")
_LOOSENING = ("disabled", "optional", "partial", "open", "shared", "1.0", "1.1", "false", "fallback")
_CRITICAL_TARGETS = {"identity", "apigw", "api-gw", "gateway", "admin", "iam", "auth"}


def _norm(key: str) -> str:
    return key.lower().replace("_", ".").replace(" ", ".")


def _digest(config_before: List[list], config_after: List[list]) -> List[DiffSummaryItem]:
    items: List[DiffSummaryItem] = []
    by_key = {_norm(c["key"]): c for c in config_after}
    for b in config_before:
        a = by_key.get(_norm(b["key"]))
        if a is None:
            items.append(DiffSummaryItem(key=b["key"], label=b.get("label", ""), change="REMOVED", current=b.get("value", ""), proposed="(removed)"))
        elif a.get("value") != b.get("value"):
            items.append(DiffSummaryItem(key=b["key"], label=b.get("label", ""), change="CHANGED", current=b.get("value", ""), proposed=a.get("value", "")))
    for a in config_after:
        if not any(_norm(x["key"]) == _norm(a["key"]) for x in config_before):
            items.append(DiffSummaryItem(key=a["key"], label=a.get("label", ""), change="ADDED", current="(absent)", proposed=a.get("value", "")))
    return items


def analyze_change(req: AnalyzeChangeRequest) -> AnalyzeChangeResponse:
    targets = [t.lower() for t in req.targetSystems]
    blast = max(1, len(targets) * 2 + (2 if "api-gw" in targets or "apigw" in targets else 0))
    has_legacy = any("legacy" in t for t in targets)
    touches_identity = any(t in _CRITICAL_TARGETS for t in targets)

    if has_legacy:
        band = "CRITICAL" if touches_identity else "HIGH"
    elif touches_identity:
        band = "HIGH"
    elif req.aiConfidence < 70:
        band = "HIGH"
    elif blast > 8:
        band = "MEDIUM"
    else:
        band = "LOW"

    narrative = (
        f"{'Change touches identity/boundary components — authentication flows will be affected. ' if touches_identity else ''}"
        f"Blast radius estimated at {blast} dependent components across "
        f"{len(targets)} direct target {'system' if len(targets) == 1 else 'systems'}."
    )
    commentary = ["Affected controls are mapped across multiple compliance frameworks."]
    if has_legacy:
        commentary.append("Legacy components may reject the proposed policy baseline.")
    if touches_identity:
        commentary.append("Authentication interruption is a credible failure mode.")
    commentary.append("Success criteria should include auth-failure and latency telemetry.")

    return AnalyzeChangeResponse(
        changeId=req.changeId,
        narrative=narrative,
        riskBand=band,
        confidence=round(min(0.98, max(0.55, req.aiConfidence / 100)), 2),
        commentary=commentary,
        downstreamImpact=max(0, blast - len(targets)),
        simulateFirst=has_legacy or blast > 6 or touches_identity,
        provider="mock",
    )


def simulate_advisory(req: SimulateAdvisoryRequest) -> SimulateAdvisoryResponse:
    before = [{"key": s.key, "label": s.label, "value": s.value, "category": s.category} for s in req.configBefore]
    after = [{"key": s.key, "label": s.label, "value": s.value, "category": s.category} for s in req.configAfter]
    diff = _digest(before, after)

    hardening = 0
    loosening = 0
    for d in diff:
        proposed = d.proposed.lower()
        if d.change != "REMOVED" and any(h in proposed for h in _HARDENING):
            hardening += 1
        if any(l in proposed for l in _LOOSENING):
            loosening += 1
    compliance_delta = min(20, hardening * 2 - loosening * 3)
    security_delta = min(20, hardening * 3 - loosening * 3)
    blast = max(1, len(req.targetSystems) * 2)

    targets = [t.lower() for t in req.targetSystems]
    failure_modes: List[str] = []
    if any("legacy" in t for t in targets):
        failure_modes.append("Legacy client compatibility failure")
    if any(t in {"identity", "auth", "iam"} for t in targets):
        failure_modes.append("Authentication interruption")
    if any("gw" in t or t == "api" for t in targets):
        failure_modes.append("API gateway latency / rejections")
    if blast > 8:
        failure_modes.append("Cascading dependency degradation")
    if not failure_modes:
        failure_modes.append("No failure modes projected")

    if failure_modes == ["No failure modes projected"]:
        status = "PASSED"
        recommendation = "Simulation passed — safe to proceed through the safety gate."
    elif len(failure_modes) == 1 and "compatibility" not in failure_modes[0].lower():
        status = "CONDITIONAL"
        recommendation = "TEST IN STAGING — conditional approval with monitoring requirements."
    else:
        status = "CONDITIONAL"
        recommendation = "TEST IN STAGING — compatibility risk detected; production safety gate applies."

    if len(diff) == 0:
        status = "FAILED"
        recommendation = "No configuration delta detected — proposed change is a no-op. Blocked."
        failure_modes = ["No configuration changes detected"]

    return SimulateAdvisoryResponse(
        changeId=req.changeId,
        diffSummary=diff,
        complianceDelta=compliance_delta,
        securityDelta=security_delta,
        failureModes=failure_modes,
        blastRadius=blast,
        recommendation=recommendation,
        status=status,
        provider="mock",
    )


def triage_exception(req: TriageExceptionRequest) -> TriageExceptionResponse:
    reasons = [r.lower() for r in req.reasons]
    combined = " ".join(reasons) + " " + req.title.lower() + " " + req.observed.lower()

    if req.risk == "CRITICAL" and "legacy" in combined:
        action = "COMPENSATING_CONTROL"
        reasoning = "Critical risk with legacy dependency — require compensating controls and dual approval before any deletion or replacement."
        hooks = [
            "Approve compensating controls or request remediation",
            "Escalate to security leadership for explicit risk acceptance",
        ]
    elif "legacy" in combined or "fallback" in combined:
        action = "REQUEST_REMEDIATION"
        reasoning = "Legacy component cannot meet the baseline — plan staged remediation with gate reviews."
        hooks = ["Request remediation plan from owning team", "Set exception review date"]
    elif req.risk == "HIGH" or req.aiConfidence < 65:
        action = "ESCALATE"
        reasoning = "High-risk or low-confidence exception — route to senior review for an explicit decision."
        hooks = ["Escalate to change advisory board", "Attach evidence bundle"]
    else:
        action = "ACCEPT_OVERRIDE"
        reasoning = "Risk is bounded and compensating controls are available — recommend documented acceptance with review date."
        hooks = ["Record acceptance rationale", "Schedule periodic re-assessment"]

    return TriageExceptionResponse(
        controlId=req.controlId,
        recommendedAction=action,
        reasoning=reasoning,
        decisionHooks=hooks,
        confidence=round(min(0.94, max(0.6, req.aiConfidence / 100)), 2),
        provider="mock",
    )


def regulatory_digest(req: RegulatoryDigestRequest) -> RegulatoryDigestResponse:
    regions = [r.upper() for r in req.regions]
    signals = [
        RegulatorySignal(
            framework="NIS2",
            title="Cyber risk-management guidance for essential entities",
            impact="HIGH",
            status="ASSESSING",
            action="Review access-control and supply-chain expectations before 2026-03-31.",
        ),
        RegulatorySignal(
            framework="DPDP",
            title="Draft rules — technical security safeguards",
            impact="MEDIUM",
            status="REVIEW_REQUIRED",
            action="Align encryption, logging and breach-notification controls with draft rules.",
        ),
        RegulatorySignal(
            framework="CERT-In",
            title="Log retention scope for covered entities",
            impact="MEDIUM",
            status="NEW",
            action="Confirm 180-day log retention and SIEM streaming coverage.",
        ),
    ]
    if "IN" not in regions:
        signals = [s for s in signals if s.framework != "CERT-In"]
    if "EU" not in regions and "DE" not in regions:
        signals = [s for s in signals if s.framework not in ("NIS2", "DPDP")]

    multi_region = len(regions) > 1
    recommendations = [
        "Maintain a jurisdiction-aware policy matrix — do not apply a single global default across regions.",
        "Pre-agree incident-notification timelines and legal response playbooks per region.",
    ]
    if multi_region:
        recommendations.append("Map data flows per jurisdiction before transfer decisions.")

    summary = (
        f"{len(signals)} regulatory signal{'s' if len(signals) != 1 else ''} in scope for "
        f"{', '.join(regions) if regions else 'the default operating regions'}"
        f"{' with cross-region policy conflicts detected' if multi_region else ''}."
    )

    return RegulatoryDigestResponse(
        summary=summary,
        signals=signals,
        regionConflicts=2 if multi_region else 0,
        recommendations=recommendations,
        provider="mock",
    )