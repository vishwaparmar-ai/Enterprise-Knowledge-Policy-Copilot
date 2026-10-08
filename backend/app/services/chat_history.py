"""Conversation persistence and multi-turn memory helpers."""

import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.app.models.chat import Conversation, Message
from backend.app.models.user import User

HISTORY_TURNS = 3          # how many previous question/answer pairs the model sees
MAX_CONTEXT_CHARS = 600    # each past message is trimmed to this many characters


# --------------------------------------------------------------------------- #
# Persistence
# --------------------------------------------------------------------------- #

def _title_from(text: str) -> str:
    title = re.sub(r"\s+", " ", text).strip()
    return title if len(title) <= 60 else title[:57].rstrip() + "..."


def get_owned_conversation(db: Session, user: User, conversation_id: uuid.UUID) -> Conversation:
    """Fetch a conversation only if it belongs to this user. Others get 404 (never reveal it exists)."""
    conversation = (
        db.query(Conversation)
        .filter(Conversation.id == conversation_id, Conversation.user_id == user.id)
        .first()
    )
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    return conversation


def get_or_create_conversation(
    db: Session, user: User, conversation_id: uuid.UUID | None, first_query: str
) -> tuple[Conversation, bool]:
    """Returns (conversation, is_new)."""
    if conversation_id is not None:
        return get_owned_conversation(db, user, conversation_id), False

    conversation = Conversation(user_id=user.id, title=_title_from(first_query))
    db.add(conversation)
    db.flush()  # assigns the id; committed later together with the messages
    return conversation, True


def recent_history(db: Session, conversation_id: uuid.UUID, turns: int = HISTORY_TURNS) -> list[dict]:
    rows = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(turns * 2)
        .all()
    )
    return [{"role": m.role, "content": m.content} for m in reversed(rows)]


def save_exchange(
    db: Session, conversation: Conversation, user_text: str, answer: str, citations: list[dict]
) -> Message:
    """Saves the question and answer. Returns the assistant message (its id is what feedback attaches to)."""
    now = datetime.now(timezone.utc)
    # Explicit, ordered timestamps: a database's now() is constant inside one transaction.
    db.add(Message(conversation_id=conversation.id, role="user", content=user_text, created_at=now))
    assistant = Message(
        id=uuid.uuid4(),
        conversation_id=conversation.id,
        role="assistant",
        content=answer,
        citations=citations,
        created_at=now + timedelta(milliseconds=1),
    )
    db.add(assistant)
    conversation.updated_at = now
    db.commit()
    return assistant


# --------------------------------------------------------------------------- #
# Multi-turn memory
# --------------------------------------------------------------------------- #

_FOLLOW_UP_START = re.compile(r"^\s*(and|also|then|but|so|what about|how about|what if|why)\b", re.I)
_REFERENCE_WORDS = re.compile(r"\b(it|its|that|this|those|these|they|them|their|same|there|above)\b", re.I)


def is_follow_up(query: str) -> bool:
    """Heuristic: does this message depend on the previous turn to make sense?"""
    return bool(_FOLLOW_UP_START.match(query)) or (len(query.split()) <= 12 and bool(_REFERENCE_WORDS.search(query)))


def build_retrieval_query(history: list[dict], query: str) -> str:
    """
    "What about contractors?" retrieves nothing useful on its own, so a follow-up is
    searched together with the previous question. Standalone questions are untouched.
    """
    if not history or not is_follow_up(query):
        return query
    last_user = next((m["content"] for m in reversed(history) if m["role"] == "user"), None)
    return f"{last_user} {query}" if last_user else query


def build_generation_question(history: list[dict], query: str) -> str:
    """Gives the model the recent conversation so it can resolve words like "it" or "that"."""
    if not history:
        return query
    lines = []
    for m in history:
        who = "User" if m["role"] == "user" else "Assistant"
        text = m["content"].strip()
        if len(text) > MAX_CONTEXT_CHARS:
            text = text[:MAX_CONTEXT_CHARS].rstrip() + "..."
        lines.append(f"{who}: {text}")
    return (
        "Use the conversation below only to understand what the user is referring to. "
        "Answer from the policy documents, not from the conversation.\n\n"
        "Conversation so far:\n" + "\n".join(lines) + f"\n\nCurrent question: {query}"
    )