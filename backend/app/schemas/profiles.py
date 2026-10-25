"""Persistent professional profile API schemas."""

from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, field_validator


ShortItem = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class ProfileUpdate(BaseModel):
    display_name: str = Field(default="", max_length=100)
    headline: str = Field(default="", max_length=160)
    organization: str = Field(default="", max_length=120)
    skills: list[ShortItem] = Field(default_factory=list, max_length=20)
    interests: list[ShortItem] = Field(default_factory=list, max_length=20)
    networking_goals: str = Field(default="", max_length=600)
    accomplishments: str = Field(default="", max_length=1200)
    portfolio_url: str = Field(default="", max_length=500)
    resume_summary: str = Field(default="", max_length=1200)

    @field_validator("portfolio_url")
    @classmethod
    def validate_portfolio_url(cls, value: str) -> str:
        value = value.strip()
        if value and not value.startswith(("https://", "http://")):
            raise ValueError("portfolio_url must use http or https")
        return value


class Profile(ProfileUpdate):
    email: str | None = None
    updated_at: str | None = None
