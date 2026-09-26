from fastapi import APIRouter,HTTPException
from langchain_core.documents import Document
from backend.app.schemas.chat import ChatResponse, ChatRequest,Citation
from backend.app.rag.hybrid_retriever import HybridRetriever
from backend.app.rag.generation import generate_answer

router = APIRouter(
    prefix="/chat",
    tags=["Chat"]
)

hybrid_retriever = HybridRetriever()

@router.post("/", response_model=ChatResponse)
def chat(
    request: ChatRequest
):
    try:
        results = hybrid_retriever.retrieve(
            query=request.query,
            top_k=8,
            filter=None,
        )

        answer = generate_answer(query=request.query, results=results)

        citations = []

        for document in answer:
            metadata = document.metadata

            citations.append(
                Citation(
                    source=metadata.get("source_filename", "Unknown"),
                    page=metadata.get("page_number"),
                )
            )

        return ChatResponse(
            answer=answer,
            citations=citations,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Chat generation failed: {str(exc)}",
        )





    
            