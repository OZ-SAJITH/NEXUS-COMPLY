from fastapi import APIRouter

from app.interpreters.remediation_mock import plan_remediation as mock_plan_remediation
from app.schemas.remediation import RemediationPlanRequest, RemediationPlanResponse

router = APIRouter()


@router.post("/ai/remediation-plan", response_model=RemediationPlanResponse)
async def remediation_plan(req: RemediationPlanRequest) -> RemediationPlanResponse:
    try:
        return mock_plan_remediation(req)
    except Exception:
        # Never break the demo: fall back to the deterministic mock planner
        # with the same evidence-only contract.
        return mock_plan_remediation(RemediationPlanRequest(
            systemPrompt=req.systemPrompt,
            finding=req.finding,
            asset=req.asset,
            evidence=req.evidence,
            riskContext=req.riskContext,
            connector=req.connector,
            expectedActionType=req.expectedActionType,
            requiredOutput=req.requiredOutput,
        ))