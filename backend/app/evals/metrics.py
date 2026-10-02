"""
Retrieval and citation metrics for evaluating the Helix RAG pipeline.

These are computed directly from retrieved (Document, score) pairs against
a golden dataset entry — no LLM judge required, so they're cheap to run
repeatedly while iterating on the pipeline.
"""

from __future__ import annotations

from langchain_core.documents import Document


def _doc_matches_expected(document: Document, expected_sources: list[str]) -> bool:
    """
    A retrieved chunk "counts" toward an expected source if its
    source_filename starts with one of the expected doc-id prefixes
    (e.g. "HR-002" matches "HR-002_leave-and-time-off-policy.pdf").
    """
    source_id = document.metadata.get("source_id", "")
    return source_id in expected_sources


def recall_at_k(
    retrieved: list[Document],
    expected_sources: list[str],
    k: int,
) -> float:
    """
    Of the expected source documents, what fraction have at least one
    chunk appearing in the top k retrieved results?
    Returns 1.0 if expected_sources is empty (nothing to recall).
    """
    if not expected_sources:
        return 1.0

    top_k = retrieved[:k]
    found = {
        prefix for prefix in expected_sources
        if any(_doc_matches_expected(doc, [prefix]) for doc in top_k)
    }
    return len(found) / len(expected_sources)


def precision_at_k(
    retrieved: list[Document],
    expected_sources: list[str],
    k: int,
) -> float:
    """
    Of the top k retrieved chunks, what fraction come from an expected
    source document? Undefined (returns 0.0) if nothing was retrieved.
    """
    top_k = retrieved[:k]
    if not top_k:
        return 0.0
    if not expected_sources:
        # For unanswerable questions, precision is really "did we avoid
        # confidently retrieving unrelated content" — treat any result
        # as a miss since nothing should count as "expected".
        return 0.0

    relevant = sum(1 for doc in top_k if _doc_matches_expected(doc, expected_sources))
    return relevant / len(top_k)


def reciprocal_rank(
    retrieved: list[Document],
    expected_sources: list[str],
) -> float:
    """
    1 / rank of the first chunk that matches any expected source.
    0.0 if none of the retrieved chunks match, or if expected_sources
    is empty (not applicable — exclude from MRR averaging upstream).
    """
    if not expected_sources:
        return 0.0

    for rank, doc in enumerate(retrieved, start=1):
        if _doc_matches_expected(doc, expected_sources):
            return 1.0 / rank
    return 0.0


def citation_correctness(
    cited_sources: list[str],
    expected_sources: list[str],
) -> float:
    """
    Of the sources actually cited in the final answer, what fraction
    correspond to an expected source? For unanswerable questions,
    correctness means citing NOTHING (returns 1.0 for empty citations,
    0.0 if anything was cited).
    """
    if not expected_sources:
        return 1.0 if not cited_sources else 0.0

    if not cited_sources:
        return 0.0

    correct = sum(
        1 for source in cited_sources
        if any(source.startswith(prefix) for prefix in expected_sources)
    )
    return correct / len(cited_sources)


def refusal_correctness(answer: str, is_answerable: bool) -> bool:
    """
    For unanswerable questions: did the system correctly refuse rather
    than hallucinate an answer? Uses simple keyword matching against
    the refusal phrasing in generation.py's system prompt — brittle,
    but a fast first-pass signal; verify borderline cases manually.
    """
    if is_answerable:
        return True  # not applicable

    refusal_markers = [
        "don't cover", "doesn't cover", "not covered", "couldn't find",
        "no relevant", "check with", "isn't covered", "not addressed",
    ]
    lowered = answer.lower()
    return any(marker in lowered for marker in refusal_markers)