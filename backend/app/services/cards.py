"""Pure helpers for public-card projection, HTML, QR and vCard output."""

from html import escape
from io import BytesIO
import re

import qrcode
import qrcode.image.svg

from ..schemas.cards import PUBLIC_FIELDS


SLUG_PATTERN = re.compile(r"^[A-Za-z0-9_-]{20,64}$")


def public_projection(record: dict, public_url: str) -> dict:
    visibility = record.get("visibility", {})
    projected = {
        field: record.get(field, "") if visibility.get(field, True) else ""
        for field in PUBLIC_FIELDS
    }
    projected.update(public_url=public_url, updated_at=record.get("updated_at"))
    return projected


def vcard(card: dict) -> str:
    def clean(value: str) -> str:
        return str(value or "").replace("\\", "\\\\").replace("\r", "").replace("\n", "\\n").replace(";", "\\;").replace(",", "\\,")

    lines = ["BEGIN:VCARD", "VERSION:3.0", f"FN:{clean(card.get('display_name', ''))}"]
    optional = (
        ("TITLE", "headline"), ("ORG", "organization"), ("EMAIL;TYPE=INTERNET", "email"),
        ("TEL;TYPE=CELL", "phone"), ("URL", "website"), ("NOTE", "bio"),
    )
    lines.extend(f"{label}:{clean(card.get(field, ''))}" for label, field in optional if card.get(field))
    lines.extend((f"SOURCE:{clean(card['public_url'])}", "END:VCARD", ""))
    return "\r\n".join(lines)


def qr_svg(url: str) -> bytes:
    image = qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage, box_size=8, border=3)
    output = BytesIO()
    image.save(output)
    return output.getvalue()


def card_html(card: dict) -> str:
    name = escape(card.get("display_name") or "Wings contact")
    rows = []
    for label, field in (("Email", "email"), ("Phone", "phone"), ("Website", "website")):
        value = card.get(field)
        if not value:
            continue
        href = value if field == "website" else ("mailto:" if field == "email" else "tel:") + value
        rows.append(f'<p><strong>{label}</strong><br><a rel="nofollow noopener" href="{escape(href, quote=True)}">{escape(value)}</a></p>')
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>{name} · Wings</title><style>body{{margin:0;background:#f7f8f4;color:#203d32;font:17px/1.55 system-ui,sans-serif}}main{{max-width:620px;margin:8vh auto;padding:40px;background:#fff;border:1px solid #e1e6dd;border-radius:18px}}h1{{font:2.4rem Georgia,serif;margin:.2rem 0}}h2{{font-size:1.1rem;font-weight:500;color:#577064}}a{{color:#34654e}}.org,.bio{{color:#65756c}}.actions{{display:flex;gap:12px;flex-wrap:wrap;margin-top:30px}}.button{{padding:11px 16px;border-radius:8px;background:#34654e;color:white;text-decoration:none}}@media(max-width:680px){{main{{margin:0;padding:28px 22px;min-height:100vh;border:0;border-radius:0}}}}</style></head><body><main><small>SHARED WITH WINGS</small><h1>{name}</h1><h2>{escape(card.get('headline') or '')}</h2><p class="org">{escape(card.get('organization') or '')}</p><p class="bio">{escape(card.get('bio') or '')}</p>{''.join(rows)}<div class="actions"><a class="button" href="{escape(card['public_url'], quote=True)}.vcf" download>Save contact (.vcf)</a></div><p><small>This person chose which fields to share. Wings is not required to view or save this card.</small></p></main></body></html>"""
