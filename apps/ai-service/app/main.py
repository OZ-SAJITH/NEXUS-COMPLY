"""NEXUS-COMPLY AI Service — FastAPI application."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import ai

app = FastAPI(title="NEXUS-COMPLY AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ai.router, prefix="/api")


@app.get("/health")
async def health():
    return {"ok": True, "service": "ai-service"}