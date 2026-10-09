import json
import logging
from typing import Iterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.app.core.permissions import allowed_access_levels
from backend.app.core.security import get_current_user
from backend.app.db.session import SessionLocal, get_db
from backend.app.models.user import User
from backend.app.schemas.chat import ChatResponse, ChatRequest, Citation
from backend.app.rag.hybrid_retriever import HybridRetriever
from backend.app.rag.generation import generate_answer
from backend.app.rag.smalltalk import small_talk_reply
from backend.app.rag.streaming import stream_answer
from backend.app.services.chat_history import (
    build_generation_question,
    build_retrieval_query,
    get_or_create_conversation,
    get_owned_conversation,
    recent_history,
    save_exchange,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Chat"])

_hybrid_retriever: HybridRetriever | None = None


def get_hybrid_retriever() -> HybridRetriever:
    global _hybrid_retriever
    if _hybrid_retriever is None:
        _hybrid_retriever = HybridRetriever(use_reranker=True, use_query_rewriting=True)
    return _hybrid_retriever


# --------------------------------------------------------------------------- #
# Shared helpers (used by both the normal and the streaming endpoint)
# --------------------------------------------------------------------------- #

def _retrieve_safe_results(role, history: list[dict], query: str):
    retriever = get_hybrid_retriever()
    levels = allowed_access_levels(role)

    # Follow-ups like "what about contractors?" are searched together with the previous question.
    results = retriever.retrieve(
        query=build_retrieval_query(history, query),
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
    return safe_results


def _build_citations(safe_results) -> list[Citation]:
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
    return citations


# --------------------------------------------------------------------------- #
# Normal (non-streaming) endpoint
# --------------------------------------------------------------------------- #

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

        safe_results = _retrieve_safe_results(current_user.role, history, request.query)

        # The model also sees the recent turns, so "it" / "that" resolve correctly.
        response = generate_answer(
            query=build_generation_question(history, request.query),
            results=safe_results,
        )
        citations = _build_citations(safe_results)

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


# --------------------------------------------------------------------------- #
# Streaming endpoint
#
# Response format: one JSON object per line (NDJSON):
#   {"type": "status", "stage": "searching" | "generating"}
#   {"type": "delta",  "text": "..."}                       (repeated)
#   {"type": "done",   "answer", "citations", "conversation_id", "message_id"}
#   {"type": "error",  "message": "..."}                    (instead of "done")
# --------------------------------------------------------------------------- #

def _event(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False) + "\n"


def _chat_events(*, query: str, user_id, role, conversation_id, history: list[dict]) -> Iterator[str]:
    # The request's own DB session can already be closed while the response is
    # still streaming, so the stream opens its own session.
    db = SessionLocal()
    try:
        reply = small_talk_reply(query)
        if reply is not None:
            answer, citations = reply, []
            yield _event({"type": "delta", "text": reply})
        else:
            yield _event({"type": "status", "stage": "searching"})
            safe_results = _retrieve_safe_results(role, history, query)
            citations = _build_citations(safe_results)

            yield _event({"type": "status", "stage": "generating"})
            parts: list[str] = []
            for piece in stream_answer(build_generation_question(history, query), safe_results):
                parts.append(piece)
                yield _event({"type": "delta", "text": piece})
            answer = "".join(parts)

        # Saved only after the answer is complete. If the user presses Stop (the
        # connection closes), nothing is stored, so no half-answers in the history.
        user = db.get(User, user_id)
        conversation, _ = get_or_create_conversation(db, user, conversation_id, query)
        saved = save_exchange(
            db, conversation, query, answer, [{"source": c.source, "page": c.page} for c in citations]
        )
        yield _event(
            {
                "type": "done",
                "answer": answer,
                "citations": [{"source": c.source, "page": c.page} for c in citations],
                "conversation_id": str(conversation.id),
                "message_id": str(saved.id),
            }
        )
    except HTTPException as exc:
        yield _event({"type": "error", "message": str(exc.detail)})
    except Exception as exc:
        db.rollback()
        logger.exception("Streaming chat failed")
        yield _event({"type": "error", "message": f"Chat generation failed: {exc}"})
    finally:
        db.close()


@router.post("/stream")
def chat_stream(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Validate before streaming starts, so a bad or foreign conversation is a normal HTTP 404.
    history: list[dict] = []
    if request.conversation_id is not None:
        conversation = get_owned_conversation(db, current_user, request.conversation_id)
        history = recent_history(db, conversation.id)

    return StreamingResponse(
        _chat_events(
            query=request.query,
            user_id=current_user.id,
            role=current_user.role,
            conversation_id=request.conversation_id,
            history=history,
        ),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no"},
    )