from pydantic import BaseModel,Field
import uuid

class ChatRequest(BaseModel):
    query: str = Field(
        ...,
        min_length=1,
        max_length=1000,
    )
    conversation_id: uuid.UUID | None = None   


class Citation(BaseModel):
    source: str
    page: int | None = None


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]
    conversation_id: uuid.UUID | None = None   