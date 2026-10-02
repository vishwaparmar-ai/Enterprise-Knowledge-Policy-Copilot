from __future__ import annotations

import json
import logging
import os
from dotenv import load_dotenv
from backend.app.prompts.system_prompts.query_rewriter_prompt_v1 import REWRITE_SYSTEM_PROMPT
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



_REWRITE_SYSTEM_PROMPT = """You rewrite a search query for a company policy knowledge base.

Return ONLY this JSON object, nothing else, no markdown fences:
{"primary": "<cleaned up query>", "variants": ["<alt 1>", "<alt 2>"]}

Keep "primary" close to the original question, just clearer. Keep each
variant SHORT (under 15 words) and using different wording for the same
need. Exactly 2 variants, no more."""


def rewrite_query(query: str, num_variants: int = 2) -> list[str]:
    try:
        client = _get_client()

        response = client.chat.completions.create(
            model=_MODEL_NAME,
            messages=[
                {"role": "system", "content": _REWRITE_SYSTEM_PROMPT},
                {"role": "user", "content": query},
            ],
            temperature=0.2,
            max_tokens=1024,
            response_format={"type": "json_object"},
        )

        raw_content = response.choices[0].message.content.strip()

        # Defensive parsing: strip accidental markdown fences before
        # attempting json.loads, in case the model wraps its output
        # despite being told not to.
        if raw_content.startswith("```"):
            raw_content = raw_content.strip("`")
            if raw_content.lower().startswith("json"):
                raw_content = raw_content[4:].strip()

        parsed = json.loads(raw_content)

        primary = parsed.get("primary", "").strip() or query
        variants = [v.strip() for v in parsed.get("variants", []) if v.strip()]

        queries = [primary] + variants[:num_variants]

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
