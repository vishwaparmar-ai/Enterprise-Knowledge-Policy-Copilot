# backend/app/rag/chunk_ids.py
from langchain_core.documents import Document


def compute_chunk_id(document: Document) -> str:
    """
    Stable identifier for a chunk. Prefers the chunk_id assigned in
    chunking.py (doc_id:index:content_hash — unique per chunk by
    construction, since index guarantees uniqueness even when two
    chunks share identical text). Falls back to a page+content key
    only for documents that didn't go through chunk_documents.
    """
    chunk_id = document.metadata.get("chunk_id")
    if chunk_id:
        return chunk_id

    metadata = document.metadata
    doc_id = metadata.get("doc_id", "")
    page = metadata.get("page", "")
    content = document.page_content.strip()

    return f"{doc_id}:{page}:{content}"