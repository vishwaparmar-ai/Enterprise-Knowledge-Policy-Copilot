from pydantic import BaseModel,Field

class ChatRequest(BaseModel):
    query: str = Field(
        ...,
        min_length=1,
        max_length=1000,
    )


class Citation(BaseModel):
    source: str
    page: int | None = None


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]