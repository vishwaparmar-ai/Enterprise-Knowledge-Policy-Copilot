import hashlib

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

MIN_CHUNK_WORDS = 6

# Atomic units — a table row and a Q&A pair are each already a single
# complete fact. Splitting them further separates a label from its value
# (tables) or a question from its answer (FAQs).
_ATOMIC_KINDS = {"table", "qa"}


def chunk_documents(documents: list[Document]) -> list[Document]:

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=400,
        chunk_overlap=50,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    atomic_documents = [d for d in documents if d.metadata.get("kind") in _ATOMIC_KINDS]
    other_documents = [d for d in documents if d.metadata.get("kind") not in _ATOMIC_KINDS]

    chunks = splitter.split_documents(other_documents) + atomic_documents

    chunks = [c for c in chunks if len(c.page_content.split()) >= MIN_CHUNK_WORDS]

    for chunk in chunks:
        doc_id = chunk.metadata.get("doc_id", "unknown")
        page = chunk.metadata.get("page", "")
        chunk_hash = hashlib.sha256(chunk.page_content.encode("utf-8")).hexdigest()[:16]

        # No positional index — same content on the same page always
        # produces the same chunk_id, so re-ingestion upserts instead
        # of accumulating duplicates.
        chunk.metadata["chunk_id"] = f"{doc_id}:{page}:{chunk_hash}"

    return chunks