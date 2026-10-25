"""Bounded, priority-ordered context construction for conversation cues."""

from html import escape


def _clean(value: object, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


def build_cue_prompt(state: dict, profile: dict | None) -> str:
    profile = profile or {}
    recent = _clean(" ".join(state.get("fragments", [])), 760)
    summary = _clean(state.get("summary"), 300)
    contact_notes = _clean(state.get("memory"), 220) if state.get("remember") else ""
    contact_context = _clean(state.get("context"), 180)
    profile_parts = [
        _clean(profile.get("headline"), 100),
        _clean(profile.get("organization"), 80),
        ", ".join(_clean(item, 40) for item in profile.get("skills", [])[:4]),
        ", ".join(_clean(item, 40) for item in profile.get("interests", [])[:4]),
        _clean(profile.get("networking_goals"), 160),
        _clean(profile.get("accomplishments"), 160),
    ]
    profile_context = " | ".join(part for part in profile_parts if part)[:380]
    signal = state.get("signal") if state.get("signal") in {"low", "medium", "high"} else "low"
    return (
        "Create three optional, low-pressure conversation cues: at least one follow-up question, "
        "plus a natural transition, talking point, or brief experience-introduction suggestion. "
        "Each must be under 160 characters. Use recent conversation as the primary evidence. "
        "Background may shape relevance but must never invent facts. Do not infer sensitive traits, "
        "health, emotion, or intent. Do not manipulate or impersonate anyone.\n"
        f"Assistance signal (rough, non-clinical): {signal}\n"
        f"<untrusted_context priority=\"1_recent_conversation\">{escape(recent)}</untrusted_context>\n"
        f"<untrusted_context priority=\"2_running_summary\">{escape(summary)}</untrusted_context>\n"
        f"<untrusted_context priority=\"3_contact_notes\">{escape(contact_notes)}</untrusted_context>\n"
        f"<untrusted_context priority=\"4_contact_context\">{escape(contact_context)}</untrusted_context>\n"
        f"<untrusted_context priority=\"5_user_profile\">{escape(profile_context)}</untrusted_context>"
    )
