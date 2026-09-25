import re

from langchain_core.documents import Document
from rank_bm25 import BM25Okapi

_TOKEN_RE = re.compile(r"\w+")


class BM25Retriever:

    def __init__(self, documents: list[Document]):
        self.documents = documents

        tokenized_documents = [
            self._tokenize(document.page_content)
            for document in documents
        ]

        self.bm25 = BM25Okapi(tokenized_documents)

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        # Word-boundary tokenization instead of a naive split, so
        # "policy." / "policy," / "policy" all match the same token.
        return _TOKEN_RE.findall(text.lower())

    def retrieve(
        self,
        query: str,
        k: int = 5,
    ) -> list[Document]:

        tokenized_query = self._tokenize(query)

        results = self.bm25.get_top_n(
            tokenized_query,
            self.documents,
            n=k,
        )

        return results