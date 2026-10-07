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

def delete_document_chunks(source_filename: str) -> int:
    """
    Remove every chunk belonging to a document from the vector store.
    Returns how many chunks were deleted.

    No embedding function is needed here: Chroma only embeds when adding or
    searching, so this avoids loading the embedding model for a delete.
    """
    store = Chroma(
        collection_name=COLLECTION_NAME,
        persist_directory=CHROMA_PERSIST_DIRECTORY,
    )

    found = store.get(where={"source_filename": source_filename}, include=[])
    ids = found.get("ids", [])

    if ids:
        store.delete(ids=ids)

    return len(ids)


def reset_vector_store(embeddings) -> None:
    """
    Dev/test utility: wipe the collection instead of deleting the
    chroma_db folder by hand. Safe to call even if the collection
    doesn't exist yet.
    """
    vector_store = get_vector_store(embeddings)
    vector_store.delete_collection()