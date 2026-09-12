from fastapi import APIRouter

from app.interpreters.governance_mock import (
    analyze_change as mock_analyze_change,
    regulatory_digest as mock_regulatory_digest,
    simulate_advisory as mock_simulate_advisory,
    triage_exception as mock_triage_exception,
)
from app.schemas.governance import (
    AnalyzeChangeRequest,
    AnalyzeChangeResponse,
    RegulatoryDigestRequest,
    RegulatoryDigestResponse,
    SimulateAdvisoryRequest,
    SimulateAdvisoryResponse,
    TriageExceptionRequest,
    TriageExceptionResponse,
)

router = APIRouter()


@router.post("/ai/governance/analyze-change", response_model=AnalyzeChangeResponse)
async def analyze_change(req: AnalyzeChangeRequest) -> AnalyzeChangeResponse:
    try:
        return mock_analyze_change(req)
    except Exception:
        return mock_analyze_change(AnalyzeChangeRequest(
            changeId=req.changeId,
            title=req.title,
            targetSystems=req.targetSystems,
            aiConfidence=req.aiConfidence,
        ))


@router.post("/ai/governance/simulate-advisory", response_model=SimulateAdvisoryResponse)
async def simulate_advisory(req: SimulateAdvisoryRequest) -> SimulateAdvisoryResponse:
    try:
        return mock_simulate_advisory(req)
    except Exception:
        return mock_simulate_advisory(SimulateAdvisoryRequest(
            changeId=req.changeId,
            title=req.title,
            targetSystems=req.targetSystems,
            aiConfidence=req.aiConfidence,
        ))


@router.post("/ai/governance/triage-exception", response_model=TriageExceptionResponse)
async def triage_exception(req: TriageExceptionRequest) -> TriageExceptionResponse:
    try:
        return mock_triage_exception(req)
    except Exception:
        return mock_triage_exception(TriageExceptionRequest(
            controlId=req.controlId,
            title=req.title,
            risk=req.risk,
            aiConfidence=req.aiConfidence,
        ))


@router.post("/ai/governance/regulatory-digest", response_model=RegulatoryDigestResponse)
async def regulatory_digest(req: RegulatoryDigestRequest) -> RegulatoryDigestResponse:
    try:
        return mock_regulatory_digest(req)
    except Exception:
        return mock_regulatory_digest(RegulatoryDigestRequest(regions=req.regions))