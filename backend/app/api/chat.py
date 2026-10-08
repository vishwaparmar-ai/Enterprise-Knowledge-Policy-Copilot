from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.core.permissions import allowed_access_levels
from backend.app.core.security import get_current_user
from backend.app.db.session import get_db
from backend.app.models.user import User
from backend.app.schemas.chat import ChatResponse, ChatRequest, Citation
from backend.app.rag.hybrid_retriever import HybridRetriever
from backend.app.rag.generation import generate_answer
from backend.app.rag.smalltalk import small_talk_reply
from backend.app.services.chat_history import (
    build_generation_question,
    build_retrieval_query,
    get_or_create_conversation,
    recent_history,
    save_exchange,
)

router = APIRouter(prefix="/chat", tags=["Chat"])

_hybrid_retriever: HybridRetriever | None = None


def get_hybrid_retriever() -> HybridRetriever:
    global _hybrid_retriever
    if _hybrid_retriever is None:
        _hybrid_retriever = HybridRetriever(use_reranker=True, use_query_rewriting=True)
    return _hybrid_retriever


@router.post("/", response_model=ChatResponse)
def chat(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Load (or start) the conversation. A conversation that belongs to another user is a 404.
    conversation, is_new = get_or_create_conversation(db, current_user, request.conversation_id, request.query)
    history = [] if is_new else recent_history(db, conversation.id)

    try:
        # Conversational messages ("thanks", "hi") skip retrieval entirely.
        reply = small_talk_reply(request.query)
        if reply is not None:
            saved = save_exchange(db, conversation, request.query, reply, [])
            return ChatResponse(
                answer=reply, citations=[], conversation_id=str(conversation.id), message_id=str(saved.id)
            )

        retriever = get_hybrid_retriever()
        levels = allowed_access_levels(current_user.role)

        # Follow-ups like "what about contractors?" are searched together with the previous question.
        results = retriever.retrieve(
            query=build_retrieval_query(history, request.query),
            top_k=8,
            filter={"access_level": levels},
        )

        # Defense-in-depth: even though the filter above is the real
        # authorization boundary, explicitly re-check every retrieved
        # chunk's access_level before it reaches generate_answer. This
        # should never trigger if the filter is correct; it exists so
        # a future bug in the filter/store layer fails closed (drops
        # the chunk) rather than silently leaking restricted content
        # into the LLM prompt.
        safe_results = []
        for document, score in results:
            chunk_level = document.metadata.get("access_level", 0)
            if chunk_level not in levels:
                continue
            safe_results.append((document, score))

        # The model also sees the recent turns, so "it" / "that" resolve correctly.
        response = generate_answer(
            query=build_generation_question(history, request.query),
            results=safe_results,
        )

        seen = set()
        citations = []
        for document, _ in safe_results:
            source = document.metadata.get("source_filename", "Unknown")
            page = document.metadata.get("page")
            key = (source, page)
            if key in seen:
                continue
            seen.add(key)
            citations.append(Citation(source=source, page=page))

        saved = save_exchange(
            db,
            conversation,
            request.query,
            response["answer"],
            [{"source": c.source, "page": c.page} for c in citations],
        )

        return ChatResponse(
            answer=response["answer"],
            citations=citations,
            conversation_id=str(conversation.id),
            message_id=str(saved.id),
        )

    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Chat generation failed: {str(exc)}")