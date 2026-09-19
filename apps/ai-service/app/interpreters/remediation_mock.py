"""Deterministic mock/fallback remediation-planning interpreter.

Grounds every prose statement in the SUPPLIED evidence and context. Never
invents configuration values, credentials, vulnerabilities or execution
results. When required information is missing it says so. Output is clearly
labelled DEMO (Mock) — the backend still owns the structured plan silhouette,
the approval gate and every execution path.
"""

from app.schemas.remediation import RemediationPlanRequest, RemediationPlanResponse

_ACTION_LABEL = {
    "SET_TLS_MIN_VERSION": "Disable TLS 1.0/1.1 and enforce TLS 1.2+",
    "ENABLE_DB_ENCRYPTION": "Enable database encryption at rest",
    "ENFORCE_STRONG_CIPHERS": "Enforce strong cipher suites",
    "REVOKE_AND_RENEW_CERTIFICATE": "Renew and re-issue the certificate",
    "RESTRICT_DB_BIND": "Restrict the database listener binding",
    "CONSOLIDATE_FIREWALL_RULE": "Consolidate excessive firewall access rules",
    "SECURE_MESSAGE_QUEUE": "Enable message queue authentication",
    "ROTATE_AND_SCREEN_SECRETS": "Rotate and screen plaintext secrets",
    "RESTORE_BASELINE_HASH": "Restore the approved baseline configuration",
}

_EXPOSURE_LABEL = {
    "INTERNET_FACING": "internet-facing",
    "DMZ": "DMZ",
    "PARTNER": "partner-facing",
    "RESTRICTED": "restricted",
    "INTERNAL": "internal",
}

# Mirrors the backend catalog changeRiskFor() weights so prose never contradicts
# the authoritative deterministic change-risk classification.
_ACTION_IMPACT = {
    "SET_TLS_MIN_VERSION": 10,
    "ENFORCE_STRONG_CIPHERS": 10,
    "ENFORCE_STRONG_AUTH": 10,
    "ENABLE_INTEGRITY_VALIDATION": 10,
    "ENABLE_XML_SIGNATURE_VALIDATION": 10,
    "SECURE_API_CONFIG": 10,
    "RESTRICT_PRIVILEGED_ACCESS": 10,
    "REVOKE_AND_RENEW_CERTIFICATE": 22,
    "DISABLE_INSECURE_PROTOCOL": 22,
    "RESTRICT_DB_BIND": 22,
    "CONSOLIDATE_FIREWALL_RULE": 22,
    "RESTORE_BASELINE_HASH": 22,
    "SECURE_MESSAGE_QUEUE": 22,
    "ENABLE_DB_ENCRYPTION": 40,
    "ROTATE_AND_SCREEN_SECRETS": 40,
    "UPGRADE_SERVICE_VERSION": 40,
}
_EXPOSURE_WEIGHT = {"INTERNET_FACING": 16, "DMZ": 12, "PARTNER": 8, "RESTRICTED": 4, "INTERNAL": 0}
_ENV_WEIGHT = {"PROD_SIM": 14, "PRODUCTION": 20, "DR": 7, "STAGING": 3, "DEVELOPMENT": 0}
_DESTRUCTIVE_IN_PROD = {"ROTATE_AND_SCREEN_SECRETS", "UPGRADE_SERVICE_VERSION", "CONSOLIDATE_FIREWALL_RULE"}


def plan_remediation(req: RemediationPlanRequest) -> RemediationPlanResponse:
    finding = req.finding
    asset = req.asset
    control = finding.controlId or "UNKNOWN"
    action = _ACTION_LABEL.get(req.expectedActionType) or f"Apply {req.expectedActionType or 'the catalogue-approved structured action'}"

    verified = sum(1 for e in req.evidence if e.verified)
    if not req.evidence:
        confidence = 0.35
        root_cause = "Root cause cannot be determined from the available evidence."
    else:
        confidence = 0.55 + 0.2 * (verified / len(req.evidence))
        root_cause = _root_cause(finding, req)
        if verified == 0:
            root_cause += " (based on unverified evidence — treat as provisional)."

    summary = f"{action} on {asset.name} to resolve {control}"
    if finding.observedValue:
        expectation = f", expected {finding.expectedValue}" if finding.expectedValue else ""
        summary += f" (observed {finding.observedValue}{expectation})"
    summary += "."

    blast = req.riskContext.blastRadius
    region_list = ", ".join(blast.regionsAffected) or "unknown region(s)"
    exposure = _EXPOSURE_LABEL.get(req.riskContext.exposure, req.riskContext.exposure.lower()) if req.riskContext.exposure else "unknown"

    parts = [
        f"Change applies to {asset.name} (a {asset.criticality.lower()} asset, {exposure}, {asset.environment} environment).",
        f"Blast radius spans {blast.affectedAssetCount} downstream asset(s) across {region_list}: {blast.criticalAssetsAffected} critical/high, {blast.servicesAffected} service type(s)",
    ]
    if blast.crossRegion:
        parts[-1] += " with cross-region propagation"
    parts[-1] += "."
    parts.append(f"Potential-impact score {req.riskContext.impactScore}/100. Potential impact only — never a confirmed compromise.")
    potential_impact = " ".join(parts)

    change_risk_reason = _change_risk_reason(req, action)

    return RemediationPlanResponse(
        findingId=finding.id,
        summary=summary,
        rootCause=root_cause,
        potentialImpact=potential_impact,
        changeRiskReason=change_risk_reason,
        confidence=max(0.3, min(0.95, round(confidence, 2))),
        requiredOutput=req.requiredOutput or "RemediationPlan",
        provider="mock",
        model="nexus-remediation-live-v1-mock",
    )


def _root_cause(finding, req) -> str:
    control = finding.controlId
    observed = (finding.observedValue or "").strip().lower()
    if control == "TLS-001" and observed:
        return "Legacy TLS configuration permits the observed TLS version below the required TLS 1.2 baseline."
    if control == "DB-001":
        if not observed or observed in ("disabled", "false"):
            return "Database encryption at rest is not enabled for this deployment."
        return f'Observed "{finding.observedValue}" for DB-001 while encryption at rest is expected "enabled".'
    if observed:
        return f'Observed "{finding.observedValue}" for {control} while the baseline expects "{finding.expectedValue or "a compliant value"}", per evidence.'
    return f"Configuration evidence for {control} is inconsistent with the required baseline — manual review of observed state advised."


def _change_risk_reason(req, action: str) -> str:
    asset = req.asset
    blast = req.riskContext.blastRadius
    action_weight = _ACTION_IMPACT.get(req.expectedActionType, 22)
    exposure_weight = _EXPOSURE_WEIGHT.get(req.riskContext.exposure, 0)
    env_weight = _ENV_WEIGHT.get(asset.environment, 14)
    weight = (
        action_weight
        + exposure_weight
        + env_weight
        + min(10, blast.criticalAssetsAffected * 3)
        + (6 if blast.crossRegion else 0)
        + min(6, blast.servicesAffected * 2)
    )
    risk = "CRITICAL" if weight >= 70 else "HIGH" if weight >= 48 else "MEDIUM" if weight >= 28 else "LOW"

    # Same policy overrides as the backend catalog.
    if asset.environment == "PRODUCTION" and req.expectedActionType in _DESTRUCTIVE_IN_PROD:
        risk = "REVIEW_REQUIRED"
    elif not req.connector or req.expectedActionType not in (req.connector.authorizedActions or []):
        if risk in ("LOW", "MEDIUM"):
            risk = "REVIEW_REQUIRED"

    if req.connector is None:
        context = "no ONLINE connector authorizes this change"
    elif req.expectedActionType not in (req.connector.authorizedActions or []):
        context = f"connector {req.connector.name} does not authorize {req.expectedActionType}"
    else:
        context = "the authorized connector supports this action"

    base = (
        f"Classified {risk} — {context}, {_EXPOSURE_LABEL.get(req.riskContext.exposure, req.riskContext.exposure.lower())} exposure, "
        f"{asset.environment} environment, {blast.affectedAssetCount} downstream asset(s)"
    )
    if blast.crossRegion:
        base += " with cross-region blast radius"
    return f"{base}. Proposed change: {action}."