import re

from langchain_core.documents import Document
from rank_bm25 import BM25Okapi

from backend.app.rag.metadata_filter import MetadataFilter, matches_filter

_TOKEN_RE = re.compile(r"\w+")


class BM25Retriever:
    def __init__(self, documents: list[Document]):
        self.documents = documents

        if not documents:
            self.bm25 = None
            return

        tokenized_documents = [
            self._tokenize(document.page_content)
            for document in documents
        ]
        self.bm25 = BM25Okapi(tokenized_documents)

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        return _TOKEN_RE.findall(text.lower())

    def retrieve(
        self,
        query: str,
        k: int = 5,
        filter: MetadataFilter | None = None,
    ) -> list[Document]:
        if self.bm25 is None:
            return []

        tokenized_query = self._tokenize(query)
        scores = self.bm25.get_scores(tokenized_query)

        candidate_indices = [
            i for i, document in enumerate(self.documents)
            if matches_filter(document, filter)
        ]
        candidate_indices.sort(key=lambda i: scores[i], reverse=True)

        return [self.documents[i] for i in candidate_indices[:k]]