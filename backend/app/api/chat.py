from fastapi import APIRouter, Depends, HTTPException
from backend.app.core.permissions import allowed_access_levels
from backend.app.core.security import get_current_user
from backend.app.models.user import User
from backend.app.schemas.chat import ChatResponse, ChatRequest, Citation
from backend.app.rag.hybrid_retriever import HybridRetriever
from backend.app.rag.generation import generate_answer

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
    current_user: User = Depends(get_current_user),
):
    try:
        retriever = get_hybrid_retriever()
        levels = allowed_access_levels(current_user.role)

        results = retriever.retrieve(
            query=request.query,
            top_k=8,
            filter={"access_level": levels},
        )

        # Defense-in-depth: even though the filter above is the real
        # authorization boundary, explicitly re-check every retrieved
        # chunk's access_level before it reaches generate_answer. This
        # should never trigger if the filter is correct — it exists so
        # a future bug in the filter/store layer fails closed (drops
        # the chunk) rather than silently leaking restricted content
        # into the LLM prompt.
        safe_results = []
        for document, score in results:
            chunk_level = document.metadata.get("access_level", 0)
            if chunk_level not in levels:
                continue
            safe_results.append((document, score))

        response = generate_answer(query=request.query, results=safe_results)

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

        return ChatResponse(answer=response["answer"], citations=citations)

    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Chat generation failed: {str(exc)}")