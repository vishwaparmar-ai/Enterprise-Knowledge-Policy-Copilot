import hashlib

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter


def chunk_documents(documents: list[Document]) -> list[Document]:

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=100,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    chunks = splitter.split_documents(documents)

    for index, chunk in enumerate(chunks):

        doc_id = chunk.metadata.get("doc_id", "unknown")

        chunk_hash = hashlib.sha256(
            chunk.page_content.encode("utf-8")
        ).hexdigest()[:16]

        chunk.metadata["chunk_id"] = (
            f"{doc_id}:{index}:{chunk_hash}"
        )

    return chunks