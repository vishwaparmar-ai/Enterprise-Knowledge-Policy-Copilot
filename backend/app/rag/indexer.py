from dataclasses import asdict, is_dataclass
from pathlib import Path

from langchain_core.documents import Document

from backend.app.rag.ingestion import ingest_document
from backend.app.rag.chunking import chunk_documents
from backend.app.rag.embedding import get_embeddings
from backend.app.rag.vector_store import store_chunks


def blocks_to_documents(
    blocks,
    document_metadata,
) -> list[Document]:

    documents = []

    base_metadata = document_metadata.to_dict()

    # ChromaDB does not allow empty lists in metadata
    base_metadata = {
        key: value
        for key, value in base_metadata.items()
        if value is not None and value != []
    }

    for block in blocks:

        if is_dataclass(block):
            block_data = asdict(block)
        else:
            block_data = vars(block)

        text = block_data.pop("text", "")

        if not text.strip():
            continue

        # Remove None and empty-list metadata
        block_data = {
            key: value
            for key, value in block_data.items()
            if value is not None and value != []
        }

        metadata = {
            **base_metadata,
            **block_data,
        }

        documents.append(
            Document(
                page_content=text,
                metadata=metadata,
            )
        )

    return documents


def index_document(
    path: Path,
    filename: str,
    doc_id: str,
):
    # 1. Parse + clean + metadata
    ingested = ingest_document(
        path=path,
        filename=filename,
        doc_id=doc_id,
    )

    # 2. Convert cleaned blocks → LangChain Documents
    documents = blocks_to_documents(
        blocks=ingested.blocks,
        document_metadata=ingested.metadata,
    )

    # 3. Chunk documents
    chunks = chunk_documents(documents)

    # 4. Load BGE-M3
    embeddings = get_embeddings()

    # 5. Store chunks + embeddings in ChromaDB
    vector_store = store_chunks(
        chunks=chunks,
        embeddings=embeddings,
    )

    return {
        "doc_id": doc_id,
        "documents": len(documents),
        "chunks": len(chunks),
        "vector_store": vector_store,
    }