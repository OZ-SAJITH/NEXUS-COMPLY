from fastapi import APIRouter, HTTPException

from app.schemas.interpret import InterpretRequest, InterpretResponse
from app.services.providers import MockProvider, get_provider

router = APIRouter()


@router.post("/ai/interpret", response_model=InterpretResponse)
async def interpret(req: InterpretRequest) -> InterpretResponse:
    try:
        provider = get_provider(req.provider)
        return provider.interpret(req)
    except Exception:
        # Never break the demo: fall back to deterministic mock interpretation.
        return MockProvider().interpret(req)


@router.get("/ai/provider")
async def provider_info():
    default = get_provider(None)
    return {"configured": default.name, "mode": "live" if default.name != "mock" else "mock"}