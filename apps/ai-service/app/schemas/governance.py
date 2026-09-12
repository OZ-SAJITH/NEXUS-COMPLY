"""Pydantic schemas for the governance AI endpoints.

These mirror the change-governance domain (change impact analysis, simulation
advisory, exception triage, regulatory digest) while staying provider-agnostic:
the AI service always returns structured, validated JSON.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field

RiskBand = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]


class SettingItem(BaseModel):
    key: str
    label: str = ""
    value: str
    category: str = ""


class AnalyzeChangeRequest(BaseModel):
    changeId: str
    title: str
    description: str = ""
    targetSystems: list[str] = Field(default_factory=list)
    configBefore: list[SettingItem] = Field(default_factory=list)
    configAfter: list[SettingItem] = Field(default_factory=list)
    aiConfidence: float = Field(default=0.84, ge=0.0, le=100.0)
    provider: str = "mock"
    apiKey: Optional[str] = None


class AnalyzeChangeResponse(BaseModel):
    changeId: str
    narrative: str
    riskBand: RiskBand
    confidence: float = Field(ge=0.0, le=1.0)
    commentary: list[str] = Field(default_factory=list)
    downstreamImpact: int = 0
    simulateFirst: bool = True
    provider: Literal["mock", "live", "fallback"] = "mock"
    model: Optional[str] = None


class DiffSummaryItem(BaseModel):
    key: str
    label: str = ""
    change: Literal["ADDED", "REMOVED", "CHANGED"]
    current: str
    proposed: str


class SimulateAdvisoryRequest(BaseModel):
    changeId: str
    title: str = ""
    targetSystems: list[str] = Field(default_factory=list)
    configBefore: list[SettingItem] = Field(default_factory=list)
    configAfter: list[SettingItem] = Field(default_factory=list)
    aiConfidence: float = Field(default=0.84, ge=0.0, le=100.0)
    provider: str = "mock"
    apiKey: Optional[str] = None


class SimulateAdvisoryResponse(BaseModel):
    changeId: str
    diffSummary: list[DiffSummaryItem] = Field(default_factory=list)
    complianceDelta: int = 0
    securityDelta: int = 0
    failureModes: list[str] = Field(default_factory=list)
    blastRadius: int = 0
    recommendation: str
    status: Literal["PASSED", "CONDITIONAL", "FAILED"]
    provider: Literal["mock", "live", "fallback"] = "mock"
    model: Optional[str] = None


class TriageExceptionRequest(BaseModel):
    controlId: str
    controlName: str = ""
    title: str
    observed: str = ""
    risk: RiskBand = "MEDIUM"
    reasons: list[str] = Field(default_factory=list)
    aiConfidence: float = Field(default=0.7, ge=0.0, le=100.0)
    affectedSystems: list[str] = Field(default_factory=list)
    provider: str = "mock"
    apiKey: Optional[str] = None


class TriageExceptionResponse(BaseModel):
    controlId: str
    recommendedAction: Literal["ACCEPT_OVERRIDE", "REQUEST_REMEDIATION", "ESCALATE", "COMPENSATING_CONTROL"]
    reasoning: str
    decisionHooks: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    provider: Literal["mock", "live", "fallback"] = "mock"
    model: Optional[str] = None


class RegulatoryDigestRequest(BaseModel):
    regions: list[str] = Field(default_factory=list)
    industries: list[str] = Field(default_factory=list)
    provider: str = "mock"
    apiKey: Optional[str] = None


class RegulatorySignal(BaseModel):
    framework: str
    title: str
    impact: RiskBand
    status: str
    action: str


class RegulatoryDigestResponse(BaseModel):
    summary: str
    signals: list[RegulatorySignal] = Field(default_factory=list)
    regionConflicts: int = 0
    recommendations: list[str] = Field(default_factory=list)
    provider: Literal["mock", "live", "fallback"] = "mock"
    model: Optional[str] = None