"""Provider-neutral LLM client with a MOCK mode that needs no internet/key.

Rules we follow:
 - mock mode is the default (LLM_MODE=mock)
 - the API key lives only on the server (env var), never in the frontend
 - every failure (timeout, no key, rate limit, outage) becomes ONE error type,
   LLMError, so callers can fall back safely
"""
import json
import os
from typing import Optional

from .heuristics import heuristic_classify


class LLMError(Exception):
    """Any problem talking to a model provider."""


SYSTEM_PROMPT = (
    "You classify SMS/WhatsApp messages for scam risk. Reply ONLY with JSON: "
    '{"result": "suspicious|likely_legitimate|unknown", "explanation": str, '
    '"evidence": [str]}. Never claim a message is guaranteed genuine.'
)


class LLMClient:
    def __init__(self, mode: Optional[str] = None, api_key: Optional[str] = None,
                 base_url: Optional[str] = None, model: Optional[str] = None,
                 timeout: float = 8.0):
        self.mode = (mode or os.getenv("LLM_PROVIDER") or os.getenv("LLM_MODE", "mock")).lower()
        self.api_key = api_key if api_key is not None else os.getenv("LLM_API_KEY")
        self.base_url = base_url or os.getenv("LLM_BASE_URL", "https://api.openai.com/v1")
        self.model = model or os.getenv("LLM_MODEL", "gpt-4o-mini")
        self.timeout = timeout

    @property
    def model_version(self) -> str:
        return "mock-v1" if self.mode == "mock" else f"{self.model}"

    def classify_json(self, text: str, language: Optional[str] = None) -> str:
        """Return a JSON string. May raise LLMError."""
        if self.mode == "mock":
            return json.dumps(heuristic_classify(text))
        return self._call_provider(text, language)

    def _call_provider(self, text: str, language: Optional[str]) -> str:
        if not self.api_key:
            raise LLMError("missing API key")
        try:
            import httpx
            resp = httpx.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={"model": self.model, "temperature": 0,
                      "messages": [{"role": "system", "content": SYSTEM_PROMPT},
                                   {"role": "user", "content": text}]},
                timeout=self.timeout,
            )
        except Exception as e:  # timeout, DNS, connection dropped...
            raise LLMError(f"provider unreachable: {type(e).__name__}") from e
        if resp.status_code == 429:
            raise LLMError("rate limited")
        if resp.status_code >= 500:
            raise LLMError("provider outage")
        if resp.status_code != 200:
            raise LLMError(f"provider error {resp.status_code}")
        try:
            return resp.json()["choices"][0]["message"]["content"]
        except Exception as e:
            raise LLMError("unexpected provider response") from e
