import uuid

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.app.core.security import get_current_user
from backend.app.db.session import get_db
from backend.app.models.chat import Conversation
from backend.app.models.user import User
from backend.app.services.chat_history import get_owned_conversation

router = APIRouter(prefix="/conversations", tags=["Conversations"])


class RenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)


def _summary(c: Conversation) -> dict:
    return {"id": str(c.id), "title": c.title, "updated_at": c.updated_at.isoformat()}


@router.get("")
def list_conversations(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(Conversation)
        .filter(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc())
        .limit(min(limit, 200))
        .all()
    )
    return [_summary(c) for c in rows]


@router.get("/{conversation_id}")
def get_conversation(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = get_owned_conversation(db, current_user, conversation_id)
    return {
        **_summary(c),
        "messages": [
            {
                "id": str(m.id),
                "role": m.role,
                "content": m.content,
                "citations": m.citations or [],
                "created_at": m.created_at.isoformat(),
            }
            for m in c.messages
        ],
    }


@router.patch("/{conversation_id}")
def rename_conversation(
    conversation_id: uuid.UUID,
    request: RenameRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = get_owned_conversation(db, current_user, conversation_id)
    c.title = request.title.strip() or c.title
    db.commit()
    db.refresh(c)
    return _summary(c)


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = get_owned_conversation(db, current_user, conversation_id)
    db.delete(c)  # messages are removed by the cascade
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)