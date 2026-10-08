"""Chat history tables: one Conversation per thread, many Messages per Conversation."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import relationship

try:
    from sqlalchemy import Uuid  # SQLAlchemy 2.0+, works on every database
except ImportError:  # SQLAlchemy 1.4
    from sqlalchemy.dialects.postgresql import UUID as Uuid

# ASSUMPTION: adjust this import to wherever your declarative Base lives
# (the same Base your User and Document models use).
from backend.app.db.session import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # ASSUMPTION: your users table is called "users" and its id is a UUID.
    user_id = Column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(120), nullable=False, default="New chat")
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=_now, index=True)

    messages = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan",  # the ORM deletes messages itself, so this works on any database
        order_by="Message.created_at",
    )


class Message(Base):
    __tablename__ = "messages"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(Uuid(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(16), nullable=False)  # "user" or "assistant"
    content = Column(Text, nullable=False)
    citations = Column(JSON, nullable=True)  # [{"source": "...", "page": 3}, ...]
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)

    conversation = relationship("Conversation", back_populates="messages")