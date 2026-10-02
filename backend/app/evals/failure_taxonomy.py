"""
Classifies WHY a question failed, by pipeline stage — so failures can be
fixed at the right layer instead of guessed at.

Stages, checked in order:
  1. RETRIEVAL_MISS      - expected chunk never appeared anywhere in the
                            raw dense+BM25 candidate pool (before rerank).
                            Fix: retrieval depth (dense_k/bm25_k), query
                            rewriting, or the chunk genuinely doesn't exist
                            (parsing/chunking bug).
  2. RERANK_DEMOTION     - expected chunk WAS in the candidate pool but got
                            reranked below top_k. Fix: reranker model,
                            rerank_candidates width, or top_k.
  3. GENERATION_ERROR    - correct chunks reached generation, but the
                            answer is wrong, incomplete, or miscites.
                            Fix: the generation prompt.
  4. FALSE_REFUSAL       - correct chunks were available but the system
                            refused to answer anyway. Fix: generation
                            prompt's refusal threshold.
  5. HALLUCINATED_ANSWER - an unanswerable question got a confident
                            fabricated answer instead of a refusal. Fix:
                            generation prompt — this is the most serious
                            failure class for a policy copilot.
  6. PASS                - no failure.
"""

from __future__ import annotations

from dataclasses import dataclass

from langchain_core.documents import Document

from backend.app.evals.metrics import _doc_matches_expected, refusal_correctness


@dataclass
class FailureClassification:
    question_id: str
    stage: str
    detail: str


def classify_failure(
    question_id: str,
    expected_sources: list[str],
    is_answerable: bool,
    pre_rerank_candidates: list[Document],
    final_retrieved: list[Document],
    answer: str,
    cited_sources: list[str],
) -> FailureClassification:

    if not is_answerable:
        if refusal_correctness(answer, is_answerable=False):
            return FailureClassification(question_id, "PASS", "Correctly refused.")
        return FailureClassification(
            question_id, "HALLUCINATED_ANSWER",
            "Question is unanswerable but the system produced a confident answer instead of refusing.",
        )

    found_in_candidates = any(
        _doc_matches_expected(doc, expected_sources) for doc in pre_rerank_candidates
    )
    found_in_final = any(
        _doc_matches_expected(doc, expected_sources) for doc in final_retrieved
    )

    if not found_in_candidates:
        return FailureClassification(
            question_id, "RETRIEVAL_MISS",
            f"Expected source(s) {expected_sources} never appeared in the pre-rerank candidate pool.",
        )

    if found_in_candidates and not found_in_final:
        return FailureClassification(
            question_id, "RERANK_DEMOTION",
            f"Expected source(s) {expected_sources} were retrieved but demoted below top_k by reranking.",
        )

    is_refusal = refusal_correctness(answer, is_answerable=True) and any(
        marker in answer.lower()
        for marker in ["don't cover", "doesn't cover", "not covered", "couldn't find"]
    )
    if is_refusal:
        return FailureClassification(
            question_id, "FALSE_REFUSAL",
            "Correct source material was retrieved, but the system refused to answer anyway.",
        )

    citation_ok = any(
        any(source.startswith(prefix) for prefix in expected_sources)
        for source in cited_sources
    )
    if not citation_ok:
        return FailureClassification(
            question_id, "GENERATION_ERROR",
            "Correct chunks reached generation, but citations don't reference the expected source(s) — "
            "check whether the answer content itself is also wrong, or just miscited.",
        )

    return FailureClassification(question_id, "PASS", "Correct source retrieved, correctly cited.")