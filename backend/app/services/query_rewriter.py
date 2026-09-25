from __future__ import annotations

import json
import logging
import os
from dotenv import load_dotenv
from openai import OpenAI

logger = logging.getLogger(__name__)

load_dotenv()

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


_REWRITE_SYSTEM_PROMPT = """You rewrite user search queries to improve retrieval \
from a company policy knowledge base (HR policies, IT policies, etc.).

Given the user's query, produce:
1. A single cleaned-up, standalone version of the query (fix ambiguity, \
expand pronouns, keep it a proper question).
2. 2-3 alternative phrasings that use different but related wording, so a \
keyword/semantic search has more chances to match the right document \
(e.g. "leave policy" -> "PTO", "time off", "vacation policy").

Respond ONLY with valid JSON, no markdown, no commentary, in this exact shape:
{"primary": "<cleaned query>", "variants": ["<alt 1>", "<alt 2>", "<alt 3>"]}
"""


def rewrite_query(query: str, num_variants: int = 3) -> list[str]:
    """
    Returns a list of queries to run through retrieval: the cleaned-up
    primary query first, followed by up to `num_variants` alternative
    phrasings. Falls back to just the original query if the LLM call
    fails, so retrieval never breaks because of the rewriter.
    """
    try:
        client = _get_client()

        response = client.chat.completions.create(
            model=_MODEL_NAME,
            messages=[
                {"role": "system", "content": _REWRITE_SYSTEM_PROMPT},
                {"role": "user", "content": query},
            ],
            temperature=0.3,
            max_tokens=600,
            response_format={"type": "json_object"},  # Groq supports this; forces valid JSON, no markdown fences

        )

        raw_content = response.choices[0].message.content.strip()
        parsed = json.loads(raw_content)

        primary = parsed.get("primary", "").strip() or query
        variants = [v.strip() for v in parsed.get("variants", []) if v.strip()]

        queries = [primary] + variants[:num_variants]

        # Dedupe while preserving order, in case the LLM repeats itself
        seen: set[str] = set()
        unique_queries: list[str] = []
        for q in queries:
            key = q.lower()
            if key in seen:
                continue
            seen.add(key)
            unique_queries.append(q)

        return unique_queries

    except Exception:
        logger.exception("Query rewriting failed, falling back to original query.")
        return [query]