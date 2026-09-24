from langchain_chroma import Chroma
from langchain_core.documents import Document


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

    vector_store.add_documents(chunks)

    return vector_store