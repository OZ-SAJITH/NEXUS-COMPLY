"""Deterministic mock/fallback AI interpreter.

When no live provider is configured (or when the live provider fails), this
produces a structured candidate Security Intent without any external calls.
Output is clearly labelled as DEMO (Mock) — never presented as live AI.
"""

import re
from typing import List

from app.schemas.interpret import EvidenceItem, InterpretRequest, InterpretResponse

_INSECURE_PROTOCOLS = {"telnet", "http", "snmp", "ftp", "tftp"}


def _find_lines(text: str, pattern: str) -> List[int]:
    out = []
    for idx, line in enumerate(text.splitlines(), start=1):
        if re.search(pattern, line, re.IGNORECASE):
            out.append(idx)
    return out


def interpret(req: InterpretRequest) -> InterpretResponse:
    c = req.redactedConfig
    lines = c.splitlines()
    evidence: List[EvidenceItem] = []

    def ref(start: int, end: int, reason: str) -> None:
        snippet = "\n".join(lines[max(0, start - 1):end])
        evidence.append(EvidenceItem(lineStart=start, lineEnd=end, reason=reason, snippet=snippet))

    has_ssh = bool(re.search(r"ssh|secure[\s\-_]*shell", c, re.IGNORECASE))
    has_telnet = bool(re.search(r"telnet", c, re.IGNORECASE))
    # "0.0.0.0" must be the exact wildcard address - "10.0.0.0/8" is NOT unrestricted.
    has_any = bool(
        re.search(
            r"(source|from|allow|clients)[^\n]*(?:\bany\b|(?:^|[^0-9])0\.0\.0\.0(?:/\d+)?(?=$|[^0-9.])|unrestricted|\ball\b)",
            c,
            re.IGNORECASE,
        )
    )
    has_logging = bool(re.search(r"log|audit|trap", c, re.IGNORECASE))

    if has_telnet and not has_ssh:
        ref(1, min(3, len(lines)), "Configuration enables Telnet for administrative access.")
        return InterpretResponse(
            detectedConcept="insecure_protocol_enabled",
            securityIntent="DISABLE_INSECURE_PROTOCOL",
            protocol="telnet",
            sourceRestriction=False,
            loggingEnabled=False,
            confidence=0.91,
            evidence=evidence,
            suggestedRemediation="Disable Telnet and enforce SSH for administrative access.",
            provider="mock",
        )

    for ln in range(len(lines)):
        if re.search(r"ssh|secure[\s\-_]*shell|remote|management|admin", lines[ln], re.IGNORECASE):
            ref(ln + 1, ln + 1, lines[ln].strip()[:120])

    if has_any:
        ref(1, min(6, len(lines)), "Administrative access appears permitted from an unrestricted source.")
        source_restriction = False
    else:
        source_restriction = True

    remediation = (
        "Restrict administrative access to approved management networks and enforce logging."
        if source_restriction
        else "Restrict SSH management access to approved administrative networks."
    )

    return InterpretResponse(
        detectedConcept="administrative_access",
        securityIntent="RESTRICT_ADMIN_ACCESS",
        protocol="ssh",
        sourceRestriction=source_restriction,
        loggingEnabled=has_logging,
        confidence=0.91,
        evidence=evidence,
        suggestedRemediation=remediation,
        provider="mock",
    )