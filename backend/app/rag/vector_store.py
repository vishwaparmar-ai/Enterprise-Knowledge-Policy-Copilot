# backend/app/rag/vector_store.py
from langchain_chroma import Chroma
from langchain_core.documents import Document

from backend.app.rag.chunk_ids import compute_chunk_id

CHROMA_PERSIST_DIRECTORY = "./chroma_db"
COLLECTION_NAME = "knowledge_documents"


def get_vector_store(embeddings) -> Chroma:
    return Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=embeddings,
        persist_directory=CHROMA_PERSIST_DIRECTORY,
    )


def store_chunks(
    chunks: list[Document],
    embeddings,
) -> Chroma:

    vector_store = get_vector_store(embeddings)

    ids = [compute_chunk_id(chunk) for chunk in chunks]
    vector_store.add_documents(chunks, ids=ids)

    return vector_store


def reset_vector_store(embeddings) -> None:
    """
    Dev/test utility: wipe the collection instead of deleting the
    chroma_db folder by hand. Safe to call even if the collection
    doesn't exist yet.
    """
    vector_store = get_vector_store(embeddings)
    vector_store.delete_collection()