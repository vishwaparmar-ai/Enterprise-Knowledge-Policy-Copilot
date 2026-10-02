"""
Runs the golden dataset through four pipeline configurations and reports
retrieval + generation metrics for each, plus a failure taxonomy for the
final (full) pipeline.

Configurations compared, in increasing sophistication:
  1. dense_only        - vector search alone, no BM25, no rerank, no
                          query rewriting.
  2. hybrid             - dense + BM25 fused with RRF, no rerank, no
                          query rewriting.
  3. hybrid_reranked     - hybrid + cross-encoder reranking.
  4. full_pipeline      - hybrid + reranking + query rewriting (this is
                          what /chat actually runs in production).
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from langchain_core.documents import Document

from backend.app.rag.hybrid_retriever import HybridRetriever
from backend.app.rag.generation import generate_answer

from backend.app.evals.metrics import recall_at_k, precision_at_k, reciprocal_rank, citation_correctness
from backend.app.evals.failure_taxonomy import classify_failure

DATASET_PATH = Path(__file__).parent / "golden_dataset.json"
RESULTS_PATH = Path(__file__).parent / "eval_results.json"

TOP_K = 8


def load_dataset() -> list[dict]:
    with open(DATASET_PATH) as f:
        return json.load(f)


def build_configs(retriever: HybridRetriever) -> dict[str, dict]:
    """
    Returns config name -> kwargs to pass into retriever.retrieve(),
    reusing ONE HybridRetriever instance (already indexed) rather than
    rebuilding the vector store per configuration.
    """
    return {
        "dense_only": {"use_reranker": False, "use_query_rewriting": False, "dense_only": True},
        "hybrid": {"use_reranker": False, "use_query_rewriting": False, "dense_only": False},
        "hybrid_reranked": {"use_reranker": True, "use_query_rewriting": False, "dense_only": False},
        "full_pipeline": {"use_reranker": True, "use_query_rewriting": True, "dense_only": False},
    }


def retrieve_for_config(retriever: HybridRetriever, query: str, config: dict) -> list[tuple[Document, float]]:
    """
    Temporarily overrides the retriever's reranker/query-rewrite flags
    for this one call, then restores them — avoids needing 4 separate
    HybridRetriever instances (4 separate embedding-model loads).
    """
    original_reranker = retriever.use_reranker
    original_rewriting = retriever.use_query_rewriting

    retriever.use_reranker = config["use_reranker"]
    retriever.use_query_rewriting = config["use_query_rewriting"]

    try:
        if config["dense_only"]:
            dense_results = retriever.dense_retrieve(query, filter=None)
            return [(doc, 0.0) for doc in dense_results[:TOP_K]]
        return retriever.retrieve(query=query, top_k=TOP_K, filter=None)
    finally:
        retriever.use_reranker = original_reranker
        retriever.use_query_rewriting = original_rewriting


def evaluate_config(retriever: HybridRetriever, dataset: list[dict], config_name: str, config: dict) -> dict:
    recalls, precisions, rrs, citation_scores = [], [], [], []
    per_question = []

    for item in dataset:
        query = item["question"]
        expected_sources = item["expected_sources"]

        retrieved = retrieve_for_config(retriever, query, config)
        retrieved_docs = [doc for doc, _ in retrieved]

        # print("\n" + "=" * 80)
        # print(f"QUESTION: {query}")
        # print(f"EXPECTED SOURCES: {expected_sources}")

        # for rank, doc in enumerate(retrieved_docs, start=1):
        #     print(f"\n--- Retrieved #{rank} ---")
        #     print("source_id:", doc.metadata.get("source_id"))
        #     print("source_filename:", doc.metadata.get("source_filename"))
        #     print("title:", doc.metadata.get("title"))
        #     print("chunk_id:", doc.metadata.get("chunk_id"))


        if item["is_answerable"]:
            recalls.append(recall_at_k(retrieved_docs, expected_sources, TOP_K))
            precisions.append(precision_at_k(retrieved_docs, expected_sources, TOP_K))
            rrs.append(reciprocal_rank(retrieved_docs, expected_sources))

        per_question.append({
            "id": item["id"],
            "category": item["category"],
            "retrieved_sources": [d.metadata.get("source_filename") for d in retrieved_docs],
        })

    return {
        "config": config_name,
        "mean_recall_at_k": sum(recalls) / len(recalls) if recalls else None,
        "mean_precision_at_k": sum(precisions) / len(precisions) if precisions else None,
        "mrr": sum(rrs) / len(rrs) if rrs else None,
        "n_answerable_questions": len(recalls),
        "per_question": per_question,
    }


def evaluate_full_pipeline_generation(retriever: HybridRetriever, dataset: list[dict]) -> dict:
    """
    Runs the FULL pipeline (retrieval + generation) for every question,
    computes citation correctness, and classifies every failure by
    pipeline stage. This is the expensive pass (one Groq call per
    question) — only run once, against the production configuration.
    """
    failures = []
    citation_scores = []
    generation_rows = []  # for optional Ragas scoring afterward

    original_reranker = retriever.use_reranker
    original_rewriting = retriever.use_query_rewriting
    retriever.use_reranker = True
    retriever.use_query_rewriting = True

    try:
        for item in dataset:
            query = item["question"]
            expected_sources = item["expected_sources"]

            # Pre-rerank candidate pool, for failure classification
            queries = [query]
            dense_results, bm25_results = [], []
            for q in queries:
                dense_results.extend(retriever.dense_retrieve(q, filter=None))
                bm25_results.extend(retriever.bm25_retrieve(q, filter=None))
            fused = retriever.reciprocal_rank_fusion(dense_results, bm25_results)
            pre_rerank_candidates = [doc for doc, _ in fused[: retriever.rerank_candidates]]

            final_results = retriever.retrieve(query=query, top_k=TOP_K, filter=None)
            final_docs = [doc for doc, _ in final_results]

            response = generate_answer(query=query, results=final_results)
            answer = response["answer"]
            cited_sources = [s["source_filename"] for s in response["sources"] if s.get("source_filename")]

            citation_scores.append(citation_correctness(cited_sources, expected_sources))

            classification = classify_failure(
                question_id=item["id"],
                expected_sources=expected_sources,
                is_answerable=item["is_answerable"],
                pre_rerank_candidates=pre_rerank_candidates,
                final_retrieved=final_docs,
                answer=answer,
                cited_sources=cited_sources,
            )
            failures.append({
                "id": item["id"],
                "category": item["category"],
                "stage": classification.stage,
                "detail": classification.detail,
            })

            generation_rows.append({
                "question": query,
                "answer": answer,
                "contexts": [d.page_content for d in final_docs],
                "ground_truth": item["reference_answer"] or "",
            })
    finally:
        retriever.use_reranker = original_reranker
        retriever.use_query_rewriting = original_rewriting

    stage_counts: dict[str, int] = {}
    for f in failures:
        stage_counts[f["stage"]] = stage_counts.get(f["stage"], 0) + 1

    return {
        "mean_citation_correctness": sum(citation_scores) / len(citation_scores) if citation_scores else None,
        "failure_taxonomy_counts": stage_counts,
        "failures": [f for f in failures if f["stage"] != "PASS"],
        "generation_rows": generation_rows,
    }


def run_ragas_scoring(generation_rows: list[dict]) -> dict | None:
    """
    Optional: computes faithfulness and answer_relevancy via Ragas,
    using the same Groq-hosted model as the rest of this project.
    Skips gracefully if ragas isn't installed or GROQ_API_KEY is unset,
    so the rest of the eval still runs without it.
    """
    try:
        from ragas import evaluate
        from ragas.metrics import faithfulness, answer_relevancy
        from datasets import Dataset
        from langchain_openai import ChatOpenAI
    except ImportError:
        print("Ragas not installed — skipping faithfulness/relevancy scoring. "
              "Run: pip install ragas datasets langchain-openai --break-system-packages")
        return None

    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        print("GROQ_API_KEY not set — skipping Ragas scoring.")
        return None

    answerable_rows = [r for r in generation_rows if r["ground_truth"]]
    if not answerable_rows:
        return None

    llm = ChatOpenAI(
        model="openai/gpt-oss-20b",
        api_key=api_key,
        base_url="https://api.groq.com/openai/v1",
        temperature=0.0,
    )

    ragas_dataset = Dataset.from_list(answerable_rows)
    result = evaluate(ragas_dataset, metrics=[faithfulness, answer_relevancy], llm=llm)
    return dict(result)


def main():
    dataset = load_dataset()
    print(f"Loaded {len(dataset)} golden questions.")

    retriever = HybridRetriever(use_reranker=False, use_query_rewriting=False)
    configs = build_configs(retriever)

    all_results = {}

    for config_name, config in configs.items():
        print(f"\nEvaluating config: {config_name} ...")
        result = evaluate_config(retriever, dataset, config_name, config)
        all_results[config_name] = result
        print(
            f"  Recall@{TOP_K}: {result['mean_recall_at_k']:.3f}  "
            f"Precision@{TOP_K}: {result['mean_precision_at_k']:.3f}  "
            f"MRR: {result['mrr']:.3f}"
        )

    print("\nRunning full pipeline generation + failure classification "
          "(one Groq call per question — this is the slow part) ...")
    generation_result = evaluate_full_pipeline_generation(retriever, dataset)
    all_results["full_pipeline_generation"] = generation_result

    print(f"\nMean citation correctness: {generation_result['mean_citation_correctness']:.3f}")
    print("Failure taxonomy:", generation_result["failure_taxonomy_counts"])

    print("\nAttempting Ragas faithfulness/relevancy scoring ...")
    ragas_scores = run_ragas_scoring(generation_result["generation_rows"])
    if ragas_scores:
        all_results["ragas_scores"] = ragas_scores
        print("Ragas scores:", ragas_scores)

    with open(RESULTS_PATH, "w", encoding="utf-8") as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False, default=str)

    print(f"\nFull results written to {RESULTS_PATH}")


if __name__ == "__main__":
    main()