import datetime as dt
import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import (JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, Numeric, String, Text,
                        UniqueConstraint)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.core.db import Base

JSON_T = JSON().with_variant(JSONB(), "postgresql")


def now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def pk():
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def fk(table: str, nullable=False, ondelete="CASCADE"):
    return mapped_column(UUID(as_uuid=True), ForeignKey(f"{table}.id", ondelete=ondelete), nullable=nullable, index=True)


def ts(default=now, nullable=False):
    return mapped_column(DateTime(timezone=True), default=default, nullable=nullable)


class Organization(Base):
    __tablename__ = "organizations"
    id: Mapped[uuid.UUID] = pk()
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    created_at: Mapped[dt.datetime] = ts()


class User(Base):  # support staff only; customers are a different table
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = pk()
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[dt.datetime] = ts()


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "org_id"),)
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = fk("users")
    org_id: Mapped[uuid.UUID] = fk("organizations")
    role: Mapped[str] = mapped_column(String(20), default="agent")  # owner|admin|manager|agent|analyst
    available: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[dt.datetime] = ts()
    user: Mapped[User] = relationship(lazy="joined")


class Customer(Base):
    __tablename__ = "customers"
    __table_args__ = (UniqueConstraint("org_id", "email"),)
    id: Mapped[uuid.UUID] = pk()
    org_id: Mapped[uuid.UUID] = fk("organizations")
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    language: Mapped[str] = mapped_column(String(10), default="en")
    tags: Mapped[list] = mapped_column(JSON_T, default=list)
    sentiment: Mapped[str] = mapped_column(String(20), default="neutral")
    last_interaction_at: Mapped[dt.datetime | None] = ts(default=None, nullable=True)
    created_at: Mapped[dt.datetime] = ts()


class CustomerIdentity(Base):
    __tablename__ = "customer_identities"
    id: Mapped[uuid.UUID] = pk()
    org_id: Mapped[uuid.UUID] = fk("organizations")
    customer_id: Mapped[uuid.UUID] = fk("customers")
    kind: Mapped[str] = mapped_column(String(20))  # phone | email
    value: Mapped[str] = mapped_column(String(255))
    verified: Mapped[bool] = mapped_column(Boolean, default=True)


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[uuid.UUID] = pk()
    org_id: Mapped[uuid.UUID] = fk("organizations")
    customer_id: Mapped[uuid.UUID | None] = fk("customers", nullable=True, ondelete="SET NULL")  # set only once verified
    candidate_customer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)  # claimed, unverified
    channel: Mapped[str] = mapped_column(String(10), default="chat")
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)  # open|waiting|escalated|resolved
    handler: Mapped[str] = mapped_column(String(10), default="ai")  # ai|human
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    language: Mapped[str] = mapped_column(String(10), default="en")
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verify_attempts: Mapped[int] = mapped_column(Integer, default=0)
    pending_action: Mapped[dict | None] = mapped_column(JSON_T, nullable=True)
    last_intent: Mapped[str | None] = mapped_column(String(40), nullable=True)
    sentiment: Mapped[str] = mapped_column(String(20), default="neutral")
    is_test: Mapped[bool] = mapped_column(Boolean, default=False)
    subject: Mapped[str | None] = mapped_column(String(300), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_by: Mapped[str | None] = mapped_column(String(10), nullable=True)  # ai|human
    resolved_at: Mapped[dt.datetime | None] = ts(default=None, nullable=True)
    first_response_at: Mapped[dt.datetime | None] = ts(default=None, nullable=True)
    last_message_at: Mapped[dt.datetime] = ts()
    created_at: Mapped[dt.datetime] = ts()


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[uuid.UUID] = pk()
    org_id: Mapped[uuid.UUID] = fk("organizations")
    conversation_id: Mapped[uuid.UUID] = fk("conversations")
    role: Mapped[str] = mapped_column(String(10))  # customer|ai|agent|note|system
    content: Mapped[str] = mapped_column(Text)
    sender_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    channel: Mapped[str] = mapped_column(String(10), default="chat")
    meta: Mapped[dict] = mapped_column(JSON_T, default=dict)
    created_at: Mapped[dt.datetime] = ts()


class VoiceSession(Base):
    __tablename__ = "voice_sessions"
    id: Mapped[uuid.UUID] = pk()
    org_id: Mapped[uuid.UUID] = fk("organizations")
    conversation_id: Mapped[uuid.UUID] = fk("conversations")
    room_name: Mapped[str] = mapped_column(String(200), unique=True)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|ended
    language: Mapped[str] = mapped_column(String(10), default="en")
    started_at: Mapped[dt.datetime] = ts()
    ended_at: Mapped[dt.datetime | None] = ts(default=None, nullable=True)
    duration_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avg_latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)


class VoiceSegment(Base):
    __tablename__ = "voice_segments"
    id: Mapped[uuid.UUID] = pk()
    org_id: Mapped[uuid.UUID] = fk("organizations")
    voice_session_id: Mapped[uuid.UUID] = fk("voice_sessions")
    speaker: Mapped[str] = mapped_column(String(10))  # customer|ai
    text: Mapped[str] = mapped_column(Text)
    language: Mapped[str | None] = mapped_column(String(10), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    offset_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[dt.datetime] = ts()


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (UniqueConstraint("org_id", "code"),)
    id: Mapped[uuid.UUID] = pk()
    org_id: Mapped[uuid.UUID] = fk("organizations")
    customer_id: Mapped[uuid.UUID] = fk("customers")
    code: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(20), default="processing")  # processing|shipped|delivered|cancelled|refunded
    total: Mapped[float] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    placed_at: Mapped[dt.datetime] = ts()
    items: Mapped[list["OrderItem"]] = relationship(lazy="selectin", cascade="all, delete-orphan")
    shipment: Mapped["Shipment | None"] = relationship(lazy="selectin", uselist=False, cascade="all, delete-orphan")
    payment: Mapped["Payment | None"] = relationship(lazy="selectin", uselist=False, cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[uuid.UUID] = pk()
    order_id: Mapped[uuid.UUID] = fk("orders")
    name: Mapped[str] = mapped_column(String(200))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    price: Mapped[float] = mapped_column(Numeric(12, 2))


class Shipment(Base):
    __tablename__ = "shipments"
    id: Mapped[uuid.UUID] = pk()
    order_id: Mapped[uuid.UUID] = fk("orders")
    carrier: Mapped[str] = mapped_column(String(80), default="BlueDart")
    tracking_no: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(30), default="in_transit")  # label_created|in_transit|delayed|out_for_delivery|delivered
    expected_delivery: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    last_location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    delay_reason: Mapped[str | None] = mapped_column(String(300), nullable=True)
    delivered_at: Mapped[dt.datetime | None] = ts(default=None, nullable=True)


class Payment(Base):  # masked only. Never store PAN / CVV.
    __tablename__ = "payments"
    id: Mapped[uuid.UUID] = pk()
    org_id: Mapped[uuid.UUID] = fk("organizations")
    order_id: Mapped[uuid.UUID] = fk("orders")
    method: Mapped[str] = mapped_column(String(30), default="card")
    brand: Mapped[str | None] = mapped_column(String(30), nullable=True)
    last4: Mapped[str | None] = mapped_column(String(4), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="paid")  # paid|failed|refunded|pending
    amount: Mapped[float] = mapped_column(Numeric(12, 2))


class Refund(Base):
    __tablename__ = "refunds"
    id: Mapped[uuid.UUID] = pk()
    org_id: Mapped[uuid.UUID] = fk("organizations")
    order_id: Mapped[uuid.UUID] = fk("orders")
    customer_id: Mapped[uuid.UUID] = fk("customers")
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="requested")  # requested|approved|rejected
    idempotency_key: Mapped[str] = mapped_column(String(120), unique=True)
    created_by: Mapped[str] = mapped_column(String(20), default="ai")
    created_at: Mapped[dt.datetime] = ts()


class Ticket(Base):
    __tablename__ = "tickets"
    id: Mapped[uuid.UUID] = pk()
    org_id: Mapped[uuid.UUID] = fk("organizations")
    code: Mapped[str] = mapped_column(String(20), index=True)
    conversation_id: Mapped[uuid.UUID | None] = fk("conversations", nullable=True, ondelete="SET NULL")
    customer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    subject: Mapped[str] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[str] = mapped_column(String(10), default="medium")  # low|medium|high|urgent
    status: Mapped[str] = mapped_column(String(20), default="open")  # open|in_progress|waiting|resolved|closed
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    team: Mapped[str | None] = mapped_column(String(80), nullable=True)
    sla_due_at: Mapped[dt.datetime | None] = ts(default=None, nullable=True)
    escalation_reason: Mapped[str | None] = mapped_column(String(300), nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[dt.datetime | None] = ts(default=None, nullable=True)
    created_by: Mapped[str] = mapped_column(String(20), default="ai")
    created_at: Mapped[dt.datetime] = ts()


class Escalation(Base):
    __tablename__ = "escalations"
    id: Mapped[uuid.UUID] = pk()
    org_id: Mapped[uuid.UUID] = fk("organizations")
    conversation_id: Mapped[uuid.UUID] = fk("conversations")
    ticket_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    reason: Mapped[str] = mapped_column(String(300))
    triggered_by: Mapped[str] = mapped_column(String(20), default="ai")  # ai|customer|rule|staff
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|taken|resolved
    created_at: Mapped[dt.datetime] = ts()


class AgentConfig(Base):
    __tablename__ = "agents"
    id: Mapped[uuid.UUID] = pk()
    org_id: Mapped[uuid.UUID] = fk("organizations")
    name: Mapped[str] = mapped_column(String(100), default="Voxera AI")
    system_prompt: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(String(80), default="llama-3.3-70b-versatile")
    temperature: Mapped[float] = mapped_column(Float, default=0.3)
    languages: Mapped[list] = mapped_column(JSON_T, default=lambda: ["en", "hi", "hinglish"])
    voice: Mapped[dict] = mapped_column(JSON_T, default=dict)
    escalation_rules: Mapped[dict] = mapped_column(JSON_T, default=dict)
    tools_enabled: Mapped[list] = mapped_column(JSON_T, default=list)
    updated_at: Mapped[dt.datetime] = ts()


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[uuid.UUID] = pk()
    org_id: Mapped[uuid.UUID] = fk("organizations")
    title: Mapped[str] = mapped_column(String(300))
    category: Mapped[str] = mapped_column(String(60), default="general")
    collection: Mapped[str] = mapped_column(String(80), default="default")
    filename: Mapped[str | None] = mapped_column(String(300), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="processing")  # processing|ready|failed
    version: Mapped[int] = mapped_column(Integer, default=1)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)  # kept so re-index works
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[dt.datetime] = ts()


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    id: Mapped[uuid.UUID] = pk()
    org_id: Mapped[uuid.UUID] = fk("organizations")
    document_id: Mapped[uuid.UUID] = fk("documents")
    chunk_index: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(Vector(settings.embedding_dim))


class ConversationEvent(Base):
    __tablename__ = "conversation_events"
    id: Mapped[uuid.UUID] = pk()
    org_id: Mapped[uuid.UUID] = fk("organizations")
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    type: Mapped[str] = mapped_column(String(60))
    payload: Mapped[dict] = mapped_column(JSON_T, default=dict)
    created_at: Mapped[dt.datetime] = ts()


class Feedback(Base):
    __tablename__ = "feedback"
    id: Mapped[uuid.UUID] = pk()
    org_id: Mapped[uuid.UUID] = fk("organizations")
    conversation_id: Mapped[uuid.UUID] = fk("conversations")
    customer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    rating: Mapped[int] = mapped_column(Integer)  # 1..5
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[dt.datetime] = ts()
