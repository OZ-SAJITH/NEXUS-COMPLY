"""Pydantic schemas for the AI interpretation endpoint."""

from typing import Literal, Optional

from pydantic import BaseModel, Field


class EvidenceItem(BaseModel):
    lineStart: int
    lineEnd: int
    reason: str
    snippet: Optional[str] = None


class InterpretRequest(BaseModel):
    configName: str
    redactedConfig: str
    vendor: str = "unknown"
    syntaxFingerprint: Optional[str] = None
    provider: str = "mock"
    apiKey: Optional[str] = None


class InterpretResponse(BaseModel):
    detectedConcept: str
    securityIntent: str
    protocol: Optional[str] = None
    sourceRestriction: bool = False
    loggingEnabled: bool = False
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    suggestedRemediation: str = ""
    provider: Literal["mock", "live", "fallback"] = "mock"
    model: Optional[str] = None