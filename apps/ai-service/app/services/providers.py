"""AI Provider architecture.

Providers:
  - MockProvider       : deterministic, offline, DEMO mode (default)
  - OpenAIProvider     : OpenAI chat completions
  - GeminiProvider     : Google Gemini
  - OpenRouterProvider : OpenRouter-compatible endpoint

The service ALWAYS returns structured JSON validated against InterpretResponse.
If a live provider is unavailable/fails, the service falls back to the
deterministic MockProvider so the demo never breaks.
"""

from typing import Optional

from app.schemas.interpret import InterpretRequest, InterpretResponse


class BaseProvider:
    name = "base"

    def interpret(self, req: InterpretRequest) -> InterpretResponse:
        raise NotImplementedError


class MockProvider(BaseProvider):
    name = "mock"

    def interpret(self, req: InterpretRequest) -> InterpretResponse:
        from app.interpreters.mock import interpret as mock_interpret

        return mock_interpret(req)


class _LiveProvider(BaseProvider):
    """Common logic for JSON-based live providers."""

    name = "live"
    endpoint = ""
    model_env = "AI_MODEL"
    default_model = ""

    def _prompt(self, req: InterpretRequest) -> str:
        return f"""Analyze the following network device configuration, which uses an UNKNOWN/custom configuration syntax.

Return STRICT JSON only, matching this schema:
{{
  "detectedConcept": "short lower_snake_case name of the security concept",
  "securityIntent": "one of RESTRICT_ADMIN_ACCESS, DISABLE_INSECURE_PROTOCOL, REQUIRE_LOGGING, RESTRICT_SOURCE_NETWORK, DENY_UNAUTHORIZED_TRAFFIC, REQUIRE_STRONG_AUTHENTICATION, SECURE_MANAGEMENT_INTERFACE, DEFAULT_DENY, NETWORK_SEGMENTATION",
  "protocol": "ssh|telnet|http|https|snmp|ftp|tftp or null",
  "sourceRestriction": true|false,
  "loggingEnabled": true|false,
  "confidence": 0.0-1.0,
  "evidence": [{{"lineStart": int, "lineEnd": int, "reason": "explanation", "snippet": "exact line text"}}],
  "suggestedRemediation": "concise safe remediation recommendation"
}}

Configuration file: {req.configName}

--- CONFIGURATION (SECRETS REDACTED) ---
{req.redactedConfig}
--- END ---
"""

    def interpret(self, req: InterpretRequest) -> InterpretResponse:
        import json
        import os

        import requests

        api_key = req.apiKey or os.environ.get("AI_API_KEY", "")
        model = os.environ.get(self.model_env, self.default_model)
        text = self._call(endpoint=self.endpoint, api_key=api_key, model=model, prompt=self._prompt(req))
        data = json.loads(text)
        if not isinstance(data, dict):
            raise ValueError("Live provider returned non-object JSON")
        return InterpretResponse(**data, provider="live", model=model)

    def _call(self, endpoint, api_key, model, prompt) -> str:  # pragma: no cover - provider-specific
        raise NotImplementedError


class OpenAIProvider(_LiveProvider):
    name = "openai"
    endpoint = "https://api.openai.com/v1/chat/completions"
    default_model = "gpt-4o-mini"

    def _call(self, endpoint, api_key, model, prompt) -> str:
        import requests

        resp = requests.post(
            endpoint,
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            },
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


class GeminiProvider(_LiveProvider):
    name = "gemini"
    endpoint = "https://generativelanguage.googleapis.com/v1beta/models"
    default_model = "gemini-1.5-flash"

    def _call(self, endpoint, api_key, model, prompt) -> str:
        import requests

        resp = requests.post(
            f"{endpoint}/{model}:generateContent?key={api_key}",
            json={"contents": [{"parts": [{"text": prompt}]}],
                  "generationConfig": {"temperature": 0.2}},
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json()["candidates"][0]["content"]["parts"][0]["text"]


class OpenRouterProvider(_LiveProvider):
    name = "openrouter"
    endpoint = "https://openrouter.ai/api/v1/chat/completions"
    default_model = "anthropic/claude-3.5-sonnet"

    def _call(self, endpoint, api_key, model, prompt) -> str:
        import requests

        resp = requests.post(
            endpoint,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            },
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


def get_provider(name: Optional[str]) -> BaseProvider:
    configured = (name or "mock").lower()
    if configured == "openai":
        return OpenAIProvider()
    if configured == "gemini":
        return GeminiProvider()
    if configured == "openrouter":
        return OpenRouterProvider()
    return MockProvider()