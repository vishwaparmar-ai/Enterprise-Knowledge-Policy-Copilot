"""
Cleaning stage of the ingestion pipeline.

The parser now does most of the structural work directly (front matter,
footers, headings, bullets, Q&A, and numbered steps are all handled during
parsing). This stage is a lighter safety net:
  1. Unicode/whitespace normalization
  2. A defensive repetition-based boilerplate pass (in case a future
     document doesn't perfectly follow the template the parser expects)
  3. Drops junk blocks and exact-duplicate paragraphs
"""

import math
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, replace

from backend.app.services.document_parser import Block, ParsedDocument

EDGE_LINES = 2
MAX_BOILERPLATE_LEN = 120
MIN_DEDUPE_LEN = 40

_INVISIBLE = dict.fromkeys(map(ord, "\u200b\u200c\u200d\u2060\ufeff\u00ad"), None)
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_PAGE_NUM = re.compile(
    r"^[-–—\s]*(?:page\s+)?\d{1,4}(?:\s*(?:of|/)\s*\d{1,4})?[-–—\s]*$", re.I
)


@dataclass
class CleaningReport:
    blocks_in: int = 0
    blocks_out: int = 0
    boilerplate_lines_removed: int = 0
    junk_blocks_dropped: int = 0
    duplicate_blocks_dropped: int = 0

    def to_dict(self) -> dict:
        return asdict(self)


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = text.translate(_INVISIBLE)
    text = _CONTROL.sub("", text)
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text.split("\n")]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def _edge_key(line: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"\d+", "#", line.lower())).strip()


def _strip_residual_boilerplate(blocks: list[Block], report: CleaningReport) -> list[Block]:
    """
    Defensive backstop only — the parser already strips the company
    header, footers, front matter, and closing line explicitly. This
    catches anything that slips through (e.g. a document that deviates
    from the expected template).
    """
    pages: dict[int, list[tuple[int, int, str]]] = defaultdict(list)
    lines_by_block: dict[int, list[str]] = {}

    for bi, b in enumerate(blocks):
        if b.page is None:
            continue
        lines = b.text.split("\n")
        lines_by_block[bi] = lines
        for li, ln in enumerate(lines):
            pages[b.page].append((bi, li, ln))

    if not pages:
        return blocks

    def edges(entries):
        if len(entries) <= 2 * EDGE_LINES:
            return entries
        return entries[:EDGE_LINES] + entries[-EDGE_LINES:]

    counts: Counter = Counter()
    for entries in pages.values():
        counts.update({_edge_key(ln) for _, _, ln in edges(entries)})

    n_pages = len(pages)
    threshold = max(2, math.ceil(n_pages * 0.5))
    repeated = {k for k, c in counts.items() if k and n_pages >= 2 and c >= threshold}

    drop: set[tuple[int, int]] = set()
    for entries in pages.values():
        for bi, li, ln in edges(entries):
            is_page_no = bool(_PAGE_NUM.match(ln))
            is_repeated = len(ln) <= MAX_BOILERPLATE_LEN and _edge_key(ln) in repeated
            if is_page_no or is_repeated:
                drop.add((bi, li))

    out: list[Block] = []
    for bi, b in enumerate(blocks):
        if bi in lines_by_block:
            kept = [ln for li, ln in enumerate(lines_by_block[bi]) if (bi, li) not in drop]
            report.boilerplate_lines_removed += len(lines_by_block[bi]) - len(kept)
            if not kept:
                continue
            b = replace(b, text="\n".join(kept))
        out.append(b)
    return out


def clean_document(doc: ParsedDocument) -> tuple[ParsedDocument, CleaningReport]:
    report = CleaningReport(blocks_in=len(doc.blocks))

    blocks = [replace(b, text=_normalize(b.text)) for b in doc.blocks]
    blocks = [b for b in blocks if b.text]

    if doc.file_type == "pdf":
        blocks = _strip_residual_boilerplate(blocks, report)

    cleaned: list[Block] = []
    seen: set[str] = set()

    for b in blocks:
        text = b.text

        if b.kind == "paragraph":
            if sum(ch.isalnum() for ch in text) < 3:
                report.junk_blocks_dropped += 1
                continue
            if len(text) >= MIN_DEDUPE_LEN:
                key = re.sub(r"\s+", " ", text.lower())
                if key in seen:
                    report.duplicate_blocks_dropped += 1
                    continue
                seen.add(key)

        cleaned.append(replace(b, text=text))

    report.blocks_out = len(cleaned)
    return replace(doc, blocks=cleaned), report