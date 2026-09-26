from __future__ import annotations

from langchain_core.documents import Document

from backend.app.rag.bm25_retriever import BM25Retriever
from backend.app.rag.chunk_ids import compute_chunk_id
from backend.app.rag.embedding import get_embeddings
from backend.app.rag.metadata_filter import MetadataFilter, to_chroma_filter
from backend.app.services.query_rewriter import rewrite_query
from backend.app.rag.reranker import rerank
from backend.app.rag.vector_store import get_vector_store


class HybridRetriever:
    def __init__(
        self,
        documents: list[Document],
        dense_k: int = 10,
        bm25_k: int = 10,
        rrf_k: int = 60,
        rerank_candidates: int = 20,
        use_reranker: bool = False,
        use_query_rewriting: bool = False,
    ):
        self.documents = documents
        self.dense_k = dense_k
        self.bm25_k = bm25_k
        self.rrf_k = rrf_k
        self.rerank_candidates = rerank_candidates
        self.use_reranker = use_reranker
        self.use_query_rewriting = use_query_rewriting

        self.bm25 = BM25Retriever(documents)

        embeddings = get_embeddings()
        self.vector_store = get_vector_store(embeddings=embeddings)

        self._index_documents(documents)

    def _index_documents(self, documents: list[Document]) -> None:
        if not documents:
            return
        ids = [compute_chunk_id(document) for document in documents]
        self.vector_store.add_documents(documents, ids=ids)

    def dense_retrieve(
        self,
        query: str,
        filter: MetadataFilter | None = None,
    ) -> list[Document]:
        return self.vector_store.similarity_search(
            query,
            k=self.dense_k,
            filter=to_chroma_filter(filter),
        )

    def bm25_retrieve(
        self,
        query: str,
        filter: MetadataFilter | None = None,
    ) -> list[Document]:
        return self.bm25.retrieve(
            query=query,
            k=self.bm25_k,
            filter=filter,
        )

    def reciprocal_rank_fusion(
        self,
        dense_results: list[Document],
        bm25_results: list[Document],
    ) -> list[tuple[Document, float]]:

        scores: dict[str, float] = {}
        documents: dict[str, Document] = {}

        for rank, document in enumerate(dense_results, start=1):
            document_id = compute_chunk_id(document)
            scores[document_id] = scores.get(document_id, 0.0)
            scores[document_id] += 1 / (self.rrf_k + rank)
            documents[document_id] = document

        for rank, document in enumerate(bm25_results, start=1):
            document_id = compute_chunk_id(document)
            scores[document_id] = scores.get(document_id, 0.0)
            scores[document_id] += 1 / (self.rrf_k + rank)
            documents[document_id] = document

        ranked_results = sorted(scores.items(), key=lambda item: item[1], reverse=True)

        return [(documents[document_id], score) for document_id, score in ranked_results]

    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        filter: MetadataFilter | None = None,
    ) -> list[tuple[Document, float]]:

        queries = rewrite_query(query) if self.use_query_rewriting else [query]

        all_dense_results: list[Document] = []
        all_bm25_results: list[Document] = []

        for q in queries:
            all_dense_results.extend(self.dense_retrieve(q, filter=filter))
            all_bm25_results.extend(self.bm25_retrieve(q, filter=filter))

        fused_results = self.reciprocal_rank_fusion(
            dense_results=all_dense_results,
            bm25_results=all_bm25_results,
        )

        if not self.use_reranker:
            return fused_results[:top_k]

        candidates = [document for document, _ in fused_results[: self.rerank_candidates]]

        return rerank(query=query, documents=candidates, top_k=top_k)