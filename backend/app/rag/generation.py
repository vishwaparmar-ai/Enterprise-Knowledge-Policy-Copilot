from __future__ import annotations

import logging
import os

from langchain_core.documents import Document
from backend.app.prompts.system_prompts.llm_generation_v1 import SYSTEM_PROMPT
from openai import OpenAI

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_GROQ_BASE_URL = "https://api.groq.com/openai/v1"
_MODEL_NAME = "openai/gpt-oss-20b"

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY environment variable is not set.")
        _client = OpenAI(api_key=api_key, base_url=_GROQ_BASE_URL)
    return _client





def _format_excerpts(documents: list[Document]) -> str:
    blocks = []
    for i, doc in enumerate(documents, start=1):
        meta = doc.metadata
        title = meta.get("title", meta.get("source_filename", "Unknown document"))
        heading = meta.get("heading")
        label = f"[{i}] {title}" + (f" — {heading}" if heading else "")
        blocks.append(f"{label}\n{doc.page_content}")
    return "\n\n".join(blocks)


def generate_answer(
    query: str,
    results: list[tuple[Document, float]],
) -> dict:
    """
    Synthesizes a final answer from retrieved (Document, score) pairs.
    Returns {"answer": str, "sources": [...]} — sources lists the
    distinct documents actually passed in as context, for citation
    display in the UI, regardless of which ones the LLM ends up citing
    by name in the answer text.
    """
    documents = [doc for doc, _ in results]

    if not documents:
        return {
            "answer": (
                "I couldn't find anything in the policy knowledge base "
                "relevant to this question. You may want to check with "
                "the relevant team directly."
            ),
            "sources": [],
        }

    excerpts_text = _format_excerpts(documents)

    try:
        client = _get_client()

        response = client.chat.completions.create(
            model=_MODEL_NAME,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"Question: {query}\n\nExcerpts:\n{excerpts_text}",
                },
            ],
            temperature=0.1,
            max_tokens=700,
        )

        answer = response.choices[0].message.content.strip()

    except Exception:
        logger.exception("Answer generation failed.")
        answer = (
            "Something went wrong generating an answer. Here are the most "
            "relevant policy excerpts I found — please review them directly."
        )

    sources = []
    seen_files = set()
    for doc in documents:
        source_filename = doc.metadata.get("source_filename")
        if source_filename in seen_files:
            continue
        seen_files.add(source_filename)
        sources.append(
            {
                "title": doc.metadata.get("title"),
                "source_filename": source_filename,
                "heading": doc.metadata.get("heading"),
            }
        )

    return {"answer": answer, "sources": sources}