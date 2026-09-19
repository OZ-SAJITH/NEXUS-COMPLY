"""Pydantic schemas for the AI remediation-planning endpoint.

Mirrors the PHASE 6 remediation intelligence contract: the backend sends a
structured, evidence-only context and the AI service returns prose overrides.
The plan silhouette (actions, pre-checks, validation, rollback, approval) is
ALWAYS owned by the deterministic catalog engine on the backend — a model can
never influence it, bypass approval, or fabricate evidence.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field


class RemediationFindingInput(BaseModel):
    id: str = ""
    controlId: str = ""
    title: str = ""
    reason: str = ""
    severity: str = "MEDIUM"
    riskScore: float = 0.0
    observedValue: Optional[str] = None
    expectedValue: Optional[str] = None


class RemediationAssetInput(BaseModel):
    id: str = ""
    name: str
    type: str = "UNKNOWN"
    vendor: str = "unknown"
    environment: str = "PROD_SIM"
    criticality: str = "MEDIUM"


class RemediationEvidenceInput(BaseModel):
    evidenceType: str = ""
    observedValue: str = ""
    expectedValue: str = ""
    source: str = ""
    verified: bool = False


class RemediationBlastRadiusInput(BaseModel):
    affectedAssetCount: int = 0
    criticalAssetsAffected: int = 0
    servicesAffected: int = 0
    regionsAffected: list[str] = Field(default_factory=list)
    crossRegion: bool = False


class RemediationRiskContextInput(BaseModel):
    riskScore: float = 0.0
    riskLevel: str = "MEDIUM"
    exposure: str = "INTERNAL"
    impactScore: float = 0.0
    blastRadius: RemediationBlastRadiusInput = Field(default_factory=RemediationBlastRadiusInput)


class RemediationConnectorInput(BaseModel):
    name: Optional[str] = None
    transportType: Optional[str] = None
    protocol: Optional[str] = None
    capabilities: list[str] = Field(default_factory=list)
    authorizedActions: list[str] = Field(default_factory=list)


class RemediationPlanRequest(BaseModel):
    systemPrompt: str = ""
    finding: RemediationFindingInput = Field(default_factory=RemediationFindingInput)
    asset: RemediationAssetInput = Field(default_factory=RemediationAssetInput)
    evidence: list[RemediationEvidenceInput] = Field(default_factory=list)
    riskContext: RemediationRiskContextInput = Field(default_factory=RemediationRiskContextInput)
    connector: Optional[RemediationConnectorInput] = None
    expectedActionType: str = ""
    requiredOutput: str = "RemediationPlan"
    provider: str = "mock"
    apiKey: Optional[str] = None


class RemediationPlanResponse(BaseModel):
    """Safe prose-only response. Structure and approval are backend-owned."""

    findingId: str = ""
    summary: str = ""
    rootCause: str = ""
    potentialImpact: str = ""
    changeRiskReason: str = ""
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    requiredOutput: str = "RemediationPlan"
    provider: Literal["mock", "live", "fallback"] = "mock"
    model: Optional[str] = None