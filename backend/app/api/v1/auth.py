import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.graph import DEFAULT_PROMPT
from app.core.db import get_db
from app.core.security import decode_token, hash_password, make_token, verify_password
from app.deps import ADMINS, MANAGERS, Principal, current_principal, require
from app.models import AgentConfig, Membership, Organization, User
from app.utils import row, slugify

router = APIRouter(prefix="/auth", tags=["auth"])
team_router = APIRouter(prefix="/team", tags=["team"])


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str
    org_name: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


def _session(user: User, org: Organization, m: Membership) -> dict:
    token = make_token({"sub": str(user.id), "org": str(org.id), "role": m.role, "typ": "staff"})
    return {"access_token": token, "token_type": "bearer", "role": m.role,
            "user": {"id": str(user.id), "email": user.email, "full_name": user.full_name},
            "organization": {"id": str(org.id), "name": org.name, "slug": org.slug}}


@router.post("/signup")
async def signup(body: SignupIn, db: AsyncSession = Depends(get_db)):
    if (await db.execute(select(User).where(User.email == body.email.lower()))).scalar_one_or_none():
        raise HTTPException(409, "Email already registered")
    org = Organization(name=body.org_name, slug=f"{slugify(body.org_name)}-{secrets.token_hex(2)}")
    user = User(email=body.email.lower(), password_hash=hash_password(body.password), full_name=body.full_name)
    db.add_all([org, user])
    await db.flush()
    m = Membership(user_id=user.id, org_id=org.id, role="owner")
    db.add_all([m, AgentConfig(org_id=org.id, system_prompt=DEFAULT_PROMPT,
                               tools_enabled=["orders", "refunds", "tickets", "knowledge"])])
    await db.commit()
    return _session(user, org, m)


@router.post("/login")
async def login(body: LoginIn, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email == body.email.lower()))).scalar_one_or_none()
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    m = (await db.execute(select(Membership).where(Membership.user_id == user.id))).scalars().first()
    if not m:
        raise HTTPException(403, "No organization membership")
    return _session(user, await db.get(Organization, m.org_id), m)


@router.get("/me")
async def me(p: Principal = Depends(current_principal), db: AsyncSession = Depends(get_db)):
    user, org = await db.get(User, p.user_id), await db.get(Organization, p.org_id)
    return {"user": {"id": str(user.id), "email": user.email, "full_name": user.full_name}, "role": p.role,
            "organization": {"id": str(org.id), "name": org.name, "slug": org.slug}}


@router.post("/forgot-password")
async def forgot(body: dict, db: AsyncSession = Depends(get_db)):
    email = str(body.get("email", "")).lower()
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user:  # demo: log the link instead of emailing it
        import logging
        logging.getLogger("voxera.auth").info("password reset token for %s: %s", email, make_token({"sub": str(user.id), "typ": "reset"}, 30))
    return {"ok": True}  # same answer whether or not the account exists


@router.post("/reset-password")
async def reset(body: dict, db: AsyncSession = Depends(get_db)):
    try:
        c = decode_token(body["token"])
        assert c["typ"] == "reset" and len(body["password"]) >= 8
    except Exception:
        raise HTTPException(400, "Invalid token or weak password")
    user = await db.get(User, uuid.UUID(c["sub"]))
    user.password_hash = hash_password(body["password"])
    await db.commit()
    return {"ok": True}


# ----- team -------------------------------------------------------------------------------------------
class InviteIn(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "agent"


@team_router.get("")
async def team(p: Principal = Depends(current_principal), db: AsyncSession = Depends(get_db)):
    ms = (await db.execute(select(Membership).where(Membership.org_id == p.org_id))).scalars().all()
    return [{"user_id": str(m.user_id), "email": m.user.email, "full_name": m.user.full_name, "role": m.role,
             "available": m.available} for m in ms]


@team_router.post("/invite")
async def invite(body: InviteIn, p: Principal = Depends(require(*ADMINS)), db: AsyncSession = Depends(get_db)):
    if body.role not in ("admin", "manager", "agent", "analyst"):
        raise HTTPException(400, "Invalid role")
    user = (await db.execute(select(User).where(User.email == body.email.lower()))).scalar_one_or_none()
    temp = None
    if not user:
        temp = secrets.token_urlsafe(9)  # demo: returned once; production would email an invite link
        user = User(email=body.email.lower(), password_hash=hash_password(temp), full_name=body.full_name)
        db.add(user)
        await db.flush()
    db.add(Membership(user_id=user.id, org_id=p.org_id, role=body.role))
    await db.commit()
    return {"user_id": str(user.id), "temporary_password": temp}


@team_router.patch("/{user_id}")
async def update_member(user_id: uuid.UUID, body: dict, p: Principal = Depends(require(*MANAGERS)), db: AsyncSession = Depends(get_db)):
    m = (await db.execute(select(Membership).where(Membership.user_id == user_id, Membership.org_id == p.org_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(404)
    if "available" in body:
        m.available = bool(body["available"])
    if "role" in body and p.role in ADMINS and m.role != "owner" and body["role"] in ("admin", "manager", "agent", "analyst"):
        m.role = body["role"]
    await db.commit()
    return {"user_id": str(user_id), "role": m.role, "available": m.available}
