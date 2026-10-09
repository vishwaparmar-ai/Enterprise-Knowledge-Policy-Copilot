"""
Streaming answer generation.

stream_answer() yields the answer text in small pieces so the chat screen can
show it while it is being written instead of after a long wait.
"""

import re
import time
from typing import Iterator

from backend.app.rag.generation import generate_answer

# Temporary fallback settings (see below). Set the delay to 0 once real streaming is wired in.
FALLBACK_WORDS_PER_PIECE = 2
FALLBACK_DELAY_SECONDS = 0.012


def stream_answer(query: str, results) -> Iterator[str]:
    """Yield the answer to `query` (built from the retrieved `results`) in pieces."""

    # ------------------------------------------------------------------ #
    # OPTION A: real token streaming (recommended).
    #
    # Replace the fallback below with your LLM's streaming call, using the
    # same prompt that generate_answer() builds. With a LangChain chat model:
    #
    #     for chunk in llm.stream(messages):
    #         if chunk.content:
    #             yield chunk.content
    #     return
    #
    # The first words then appear as soon as the model starts writing,
    # instead of after the whole answer is finished.
    # ------------------------------------------------------------------ #

    # ------------------------------------------------------------------ #
    # FALLBACK (works with your current code): generate the full answer,
    # then release it in small pieces so the whole streaming pipeline can be
    # used and tested before the LLM call itself is changed.
    # ------------------------------------------------------------------ #
    answer = generate_answer(query=query, results=results)["answer"]
    tokens = re.findall(r"\S+\s*", answer)
    for i in range(0, len(tokens), FALLBACK_WORDS_PER_PIECE):
        yield "".join(tokens[i : i + FALLBACK_WORDS_PER_PIECE])
        if FALLBACK_DELAY_SECONDS:
            time.sleep(FALLBACK_DELAY_SECONDS)