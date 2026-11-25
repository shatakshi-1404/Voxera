import datetime as dt
import re
import uuid
from decimal import Decimal


def row(obj, exclude: tuple = ("embedding", "password_hash", "raw_text")) -> dict:
    out = {}
    for c in obj.__table__.columns:
        if c.name in exclude:
            continue
        v = getattr(obj, c.name)
        if isinstance(v, uuid.UUID):
            v = str(v)
        elif isinstance(v, (dt.datetime, dt.date)):
            v = v.isoformat()
        elif isinstance(v, Decimal):
            v = float(v)
        out[c.name] = v
    return out


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "org"


def initials(name: str) -> str:
    return "".join(p[0] for p in name.split()[:2]).upper()
