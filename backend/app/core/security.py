import datetime as dt

import bcrypt
import jwt

from app.core.config import settings


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except ValueError:
        return False


def make_token(claims: dict, minutes: int | None = None) -> str:
    exp = dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=minutes or settings.access_token_minutes)
    return jwt.encode({**claims, "exp": exp}, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
