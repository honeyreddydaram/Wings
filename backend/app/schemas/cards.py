"""Schemas for controlled public cards and owner-isolated exchanged contacts."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator


PUBLIC_FIELDS = ("display_name", "headline", "organization", "email", "phone", "website", "bio")


class CardFields(BaseModel):
    display_name: str = Field(default="", max_length=100)
    headline: str = Field(default="", max_length=160)
    organization: str = Field(default="", max_length=120)
    email: str = Field(default="", max_length=254)
    phone: str = Field(default="", max_length=40)
    website: str = Field(default="", max_length=500)
    bio: str = Field(default="", max_length=500)

    @field_validator("website")
    @classmethod
    def validate_website(cls, value: str) -> str:
        value = value.strip()
        if value and not value.startswith(("https://", "http://")):
            raise ValueError("website must use http or https")
        return value


class CardUpdate(CardFields):
    published: bool = False
    visibility: dict[str, bool] = Field(default_factory=dict)

    @field_validator("visibility")
    @classmethod
    def validate_visibility(cls, value: dict[str, bool]) -> dict[str, bool]:
        unknown = set(value) - set(PUBLIC_FIELDS)
        if unknown:
            raise ValueError("unknown public card field")
        return {field: bool(value.get(field, True)) for field in PUBLIC_FIELDS}


class Card(CardUpdate):
    public_url: str = ""
    slug: str = ""
    updated_at: str | None = None


class PublicCard(CardFields):
    public_url: str
    updated_at: str | None = None

    @field_validator("public_url")
    @classmethod
    def validate_public_url(cls, value: str) -> str:
        value = value.strip()
        if not value.startswith(("https://", "http://")):
            raise ValueError("public_url must use http or https")
        return value


class ContactCreate(BaseModel):
    source: Literal["qr", "link", "vcard", "manual"] = "link"
    snapshot: PublicCard
    user_notes: str = Field(default="", max_length=1200)


class ContactUpdate(BaseModel):
    user_notes: str = Field(default="", max_length=1200)


class Contact(BaseModel):
    id: str
    source: Literal["qr", "link", "vcard", "manual"]
    exchanged_at: str
    snapshot: PublicCard
    user_notes: str = ""
    conversation_note: str = ""


class ConversationNoteLink(BaseModel):
    note: str = Field(min_length=1, max_length=1200)
