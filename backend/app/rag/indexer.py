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

        heading = block_data.get("heading")
        kind = block_data.get("kind")

        # A standalone heading block ("6. Security Requirements for
        # Remote Work") is never emitted as its own retrievable chunk —
        # its text is already folded into every block beneath it via
        # the prefix below, so keeping it separately just reintroduces
        # bare, low-information heading chunks competing in results.
        if kind == "heading":
            continue

        # Fold the nearest section heading into the content so a chunk
        # never loses the context that makes it findable by a
        # heading-shaped query (e.g. "6. Security Requirements for
        # Remote Work: Use only company-managed devices...").
        if heading:
            text = f"{heading}: {text}"

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
    doc_id: str | None = None,
):
    ingested = ingest_document(
        path=path,
        filename=filename,
        doc_id=doc_id,
    )

    documents = blocks_to_documents(
        blocks=ingested.blocks,
        document_metadata=ingested.metadata,
    )

    chunks = chunk_documents(documents)

    embeddings = get_embeddings()

    vector_store = store_chunks(
        chunks=chunks,
        embeddings=embeddings,
    )

    return {
        "doc_id": ingested.doc_id,
        "documents": len(documents),
        "chunks": len(chunks),
        "vector_store": vector_store,
    }