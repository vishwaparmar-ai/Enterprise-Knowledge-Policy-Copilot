from __future__ import annotations

from langchain_core.documents import Document
from sentence_transformers import CrossEncoder

_MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"

_model: CrossEncoder | None = None


def _get_model() -> CrossEncoder:
    global _model
    if _model is None:
        _model = CrossEncoder(_MODEL_NAME)
    return _model


def rerank(
    query: str,
    documents: list[Document],
    top_k: int = 5,
) -> list[tuple[Document, float]]:
    if not documents:
        return []

    model = _get_model()

    pairs = [[query, document.page_content] for document in documents]
    scores = model.predict(pairs)

    scored_documents = list(zip(documents, scores, strict=True))
    scored_documents.sort(key=lambda item: item[1], reverse=True)

    return [
        (document, float(score))
        for document, score in scored_documents[:top_k]
    ]