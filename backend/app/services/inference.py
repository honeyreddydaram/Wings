"""Inference boundary for current demo/Gemini behavior and future Gemma support."""

import re

import httpx
from fastapi import HTTPException

from ..core.config import Settings


async def generate_text(settings: Settings, prompt: str, schema: dict | None = None) -> str:
    if settings.inference_provider == "gemma":
        raise HTTPException(503, "Gemma provider is not implemented yet")
    if settings.inference_provider != "gemini" or not settings.gemini_api_key:
        raise HTTPException(503, "Gemini is not configured")
    config = {"responseMimeType": "application/json"} if schema else {}
    if schema:
        config["responseSchema"] = schema
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.inference_model}:generateContent"
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.post(
            url,
            headers={"x-goog-api-key": settings.gemini_api_key},
            json={"contents": [{"parts": [{"text": prompt}]}], "generationConfig": config},
        )
        response.raise_for_status()
        return response.json()["candidates"][0]["content"]["parts"][0]["text"]


def demo_cues(context: str) -> list[dict[str, str]]:
    if re.search("design|product|research|user", context, re.I):
        return [
            {"category": "question", "text": "What’s one thing you learned from users that surprised you?"},
            {"category": "question", "text": "How did that change the way you approached the project?"},
            {"category": "suggestion", "text": "Share a small moment when feedback changed your own perspective."},
        ]
    if re.search("work|team|project|career", context, re.I):
        return [
            {"category": "question", "text": "What part of that work has been the most rewarding?"},
            {"category": "question", "text": "What would you love to explore next?"},
            {"category": "suggestion", "text": "Reflect back one detail that stood out, then give them room to elaborate."},
        ]
    return [
        {"category": "question", "text": "What got you interested in that in the first place?"},
        {"category": "question", "text": "What has that experience been like for you?"},
        {"category": "suggestion", "text": "Pick up on the last thing they said. A little curiosity goes a long way."},
    ]
