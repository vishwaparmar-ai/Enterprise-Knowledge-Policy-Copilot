import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.app.core.security import get_current_user
from backend.app.db.session import get_db
from backend.app.models.chat import Conversation, Feedback, Message
from backend.app.models.user import User

router = APIRouter(prefix="/feedback", tags=["Feedback"])


class FeedbackRequest(BaseModel):
    rating: Literal["up", "down"]
    reason: Literal["inaccurate", "not_relevant", "incomplete", "other"] | None = None
    comment: str | None = Field(default=None, max_length=500)


def _own_assistant_message(db: Session, user: User, message_id: uuid.UUID) -> Message:
    """Only answers inside the user's own conversations can be rated. Anything else is a 404."""
    message = (
        db.query(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .filter(Message.id == message_id, Message.role == "assistant", Conversation.user_id == user.id)
        .first()
    )
    if message is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found.")
    return message


@router.put("/{message_id}")
def set_feedback(
    message_id: uuid.UUID,
    request: FeedbackRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create or change this user's rating of an answer (one rating per user per answer)."""
    message = _own_assistant_message(db, current_user, message_id)
    now = datetime.now(timezone.utc)

    feedback = (
        db.query(Feedback)
        .filter(Feedback.message_id == message.id, Feedback.user_id == current_user.id)
        .first()
    )
    if feedback is None:
        feedback = Feedback(message_id=message.id, user_id=current_user.id, created_at=now)
        db.add(feedback)

    feedback.rating = request.rating
    # A reason and comment only make sense for a thumbs-down.
    feedback.reason = request.reason if request.rating == "down" else None
    comment = (request.comment or "").strip() or None
    feedback.comment = comment if request.rating == "down" else None
    feedback.updated_at = now
    db.commit()

    return {"message_id": str(message.id), "rating": feedback.rating, "reason": feedback.reason}


@router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
def clear_feedback(
    message_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove this user's rating (used when they click the same thumb again)."""
    message = _own_assistant_message(db, current_user, message_id)
    db.query(Feedback).filter(
        Feedback.message_id == message.id, Feedback.user_id == current_user.id
    ).delete()
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)