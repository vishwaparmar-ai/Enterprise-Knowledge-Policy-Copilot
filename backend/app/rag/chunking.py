import hashlib

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

MIN_CHUNK_WORDS = 6

# chunking.py
def chunk_documents(documents: list[Document]) -> list[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=400,
        chunk_overlap=50,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    table_documents = [d for d in documents if d.metadata.get("kind") == "table"]
    other_documents = [d for d in documents if d.metadata.get("kind") != "table"]

    chunks = splitter.split_documents(other_documents) + table_documents
    chunks = [c for c in chunks if len(c.page_content.split()) >= MIN_CHUNK_WORDS]

    for chunk in chunks:
        doc_id = chunk.metadata.get("doc_id", "unknown")
        page = chunk.metadata.get("page", "")
        chunk_hash = hashlib.sha256(chunk.page_content.encode("utf-8")).hexdigest()[:16]

        # No positional index — same content on the same page always
        # produces the same chunk_id, regardless of how many chunks
        # come before/after it in a given run. This is what makes
        # re-ingestion an upsert instead of an accumulation.
        chunk.metadata["chunk_id"] = f"{doc_id}:{page}:{chunk_hash}"

    return chunks