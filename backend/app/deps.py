import uuid
from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import decode_token

bearer = HTTPBearer(auto_error=False)

ALL_STAFF = ("owner", "admin", "manager", "agent", "analyst")
OPERATORS = ("owner", "admin", "manager", "agent")
MANAGERS = ("owner", "admin", "manager")
ADMINS = ("owner", "admin")


@dataclass
class Principal:
    user_id: uuid.UUID
    org_id: uuid.UUID
    role: str


def principal_from_token(token: str) -> Principal:
    try:
        c = decode_token(token)
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    if c.get("typ") != "staff":
        raise HTTPException(401, "Wrong token type")
    return Principal(uuid.UUID(c["sub"]), uuid.UUID(c["org"]), c["role"])


async def current_principal(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> Principal:
    if not creds:
        raise HTTPException(401, "Not authenticated")
    return principal_from_token(creds.credentials)


def require(*roles: str):
    async def dep(p: Principal = Depends(current_principal)) -> Principal:
        if p.role not in roles:
            raise HTTPException(403, f"Requires role: {', '.join(roles)}")
        return p

    return dep


@dataclass
class CustomerSession:
    conversation_id: uuid.UUID
    org_id: uuid.UUID


def customer_from_token(token: str) -> CustomerSession:
    try:
        c = decode_token(token)
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    if c.get("typ") != "customer":
        raise HTTPException(401, "Wrong token type")
    return CustomerSession(uuid.UUID(c["conv"]), uuid.UUID(c["org"]))


async def customer_session(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> CustomerSession:
    if not creds:
        raise HTTPException(401, "Not authenticated")
    return customer_from_token(creds.credentials)
