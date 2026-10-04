from sqlalchemy import select
from ..db import Template, now
from .html_validation import validate_html


def assign(row, payload):
    html = validate_html(payload.html)
    values = {"name": payload.name, "html": html, "page_size": payload.pageSettings.pageSize, "orientation": payload.pageSettings.orientation}
    values.update({f"margin_{side}_mm": getattr(payload.pageSettings.margins, side) for side in ("top", "right", "bottom", "left")})
    changed = any(getattr(row, key, None) != value for key, value in values.items())
    for key, value in values.items():
        setattr(row, key, value)
    if changed:
        row.updated_at = now()
    return row


def list_templates(session, query=None):
    statement = select(Template).order_by(Template.updated_at.desc(), Template.id.desc())
    if query:
        statement = statement.where(Template.name.contains(query, autoescape=True))
    return [serialize(row, summary=True) for row in session.scalars(statement)]


def serialize(row, summary=False):
    def timestamp(value):
        return value.isoformat().replace("+00:00", "Z") + ("Z" if value.tzinfo is None else "")
    data = {"id": row.id, "name": row.name, "pageSettings": {"pageSize": row.page_size, "orientation": row.orientation, "margins": {side: getattr(row, f"margin_{side}_mm") for side in ("top", "right", "bottom", "left")}}, "updatedAt": timestamp(row.updated_at)}
    if not summary:
        data.update(html=row.html, createdAt=timestamp(row.created_at))
    return data
