from langchain_core.documents import Document

from backend.app.rag.embedding import get_embeddings
from backend.app.rag.vector_store import get_vector_store


def get_retriever(
    k: int = 5,
):
    """
    Create a similarity-based retriever using ChromaDB.
    """

    embeddings = get_embeddings()

    vector_store = get_vector_store(
        embeddings=embeddings,
    )

    retriever = vector_store.as_retriever(
        search_type="similarity",
        search_kwargs={
            "k": k,
        },
    )

    return retriever


def retrieve_documents(
    query: str,
    k: int = 5,
) -> list[Document]:
    """
    Retrieve the most relevant chunks for a query.
    """

    retriever = get_retriever(k=k)

    documents = retriever.invoke(query)

    return documents