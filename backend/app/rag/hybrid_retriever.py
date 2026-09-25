from __future__ import annotations

from langchain_core.documents import Document

from backend.app.rag.bm25_retriever import BM25Retriever
from backend.app.rag.chunk_ids import compute_chunk_id
from backend.app.rag.embedding import get_embeddings
from backend.app.rag.vector_store import get_vector_store


class HybridRetriever:
    def __init__(
        self,
        documents: list[Document],
        dense_k: int = 10,
        bm25_k: int = 10,
        rrf_k: int = 60,
    ):
        self.documents = documents
        self.dense_k = dense_k
        self.bm25_k = bm25_k
        self.rrf_k = rrf_k

        # BM25 index
        self.bm25 = BM25Retriever(documents)

        # Dense vector store
        embeddings = get_embeddings()
        self.vector_store = get_vector_store(embeddings=embeddings)

        # Make sure BM25 and dense search over the SAME chunk set.
        # compute_chunk_id is shared with vector_store.store_chunks,
        # so re-ingesting the same file upserts existing vectors
        # instead of adding duplicates.
        self._index_documents(documents)

    def _index_documents(self, documents: list[Document]) -> None:
        if not documents:
            return

        ids = [compute_chunk_id(document) for document in documents]
        self.vector_store.add_documents(documents, ids=ids)

    def dense_retrieve(self, query: str) -> list[Document]:
        return self.vector_store.similarity_search(
            query,
            k=self.dense_k,
        )

    def bm25_retrieve(self, query: str) -> list[Document]:
        return self.bm25.retrieve(
            query=query,
            k=self.bm25_k,
        )

    def reciprocal_rank_fusion(
        self,
        dense_results: list[Document],
        bm25_results: list[Document],
    ) -> list[tuple[Document, float]]:

        scores: dict[str, float] = {}
        documents: dict[str, Document] = {}

        # Process dense results
        for rank, document in enumerate(dense_results, start=1):
            document_id = compute_chunk_id(document)

            scores[document_id] = scores.get(document_id, 0.0)
            scores[document_id] += 1 / (self.rrf_k + rank)

            documents[document_id] = document

        # Process BM25 results
        for rank, document in enumerate(bm25_results, start=1):
            document_id = compute_chunk_id(document)

            scores[document_id] = scores.get(document_id, 0.0)
            scores[document_id] += 1 / (self.rrf_k + rank)

            documents[document_id] = document

        # Sort by RRF score
        ranked_results = sorted(
            scores.items(),
            key=lambda item: item[1],
            reverse=True,
        )

        return [
            (documents[document_id], score)
            for document_id, score in ranked_results
        ]

    def retrieve(
        self,
        query: str,
        top_k: int = 5,
    ) -> list[tuple[Document, float]]:

        dense_results = self.dense_retrieve(query)
        bm25_results = self.bm25_retrieve(query)

        fused_results = self.reciprocal_rank_fusion(
            dense_results=dense_results,
            bm25_results=bm25_results,
        )

        return fused_results[:top_k]