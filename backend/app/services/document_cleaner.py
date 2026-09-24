"""
Cleaning stage of the ingestion pipeline.

Takes the ParsedDocument from document_parser and returns a cleaned copy:
  1. Unicode/whitespace normalization (ligatures, soft hyphens, control chars)
  2. PDF only: removes repeating headers/footers and page numbers
  3. PDF only: reflows hard-wrapped lines back into real paragraphs
  4. Drops junk blocks and exact-duplicate paragraphs
"""

import math
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, replace
from statistics import median

from backend.app.services.document_parser import Block, ParsedDocument

EDGE_LINES = 2  # how many lines at the top/bottom of a page count as header/footer
MAX_BOILERPLATE_LEN = 120  # headers/footers are short; never strip long lines
MIN_DEDUPE_LEN = 40  # only dedupe paragraphs at least this long
SHORT_LINE_RATIO = 0.6  # a line shorter than this * typical width ends a paragraph

# zero-width chars + soft hyphen
_INVISIBLE = dict.fromkeys(map(ord, "\u200b\u200c\u200d\u2060\ufeff\u00ad"), None)
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_BULLET = re.compile(r"^(?:[•●▪◦‣▶*\-–—]|\d{1,3}[.)]|[A-Za-z][.)]|\(\d{1,3}\))\s+")
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


# --------------------------------------------------------------------------- #
# Step 1: normalization
# --------------------------------------------------------------------------- #
def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)  # "ﬁ" -> "fi", nbsp -> space, ...
    text = text.translate(_INVISIBLE)
    text = _CONTROL.sub("", text)
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text.split("\n")]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


# --------------------------------------------------------------------------- #
# Step 2: repeating headers / footers / page numbers (PDF)
# --------------------------------------------------------------------------- #
def _edge_key(line: str) -> str:
    """'Acme Corp | Page 3' and 'Acme Corp | Page 4' share one key."""
    return re.sub(r"\s+", " ", re.sub(r"\d+", "#", line.lower())).strip()


def _strip_pdf_boilerplate(blocks: list[Block], report: CleaningReport) -> list[Block]:
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

    # A line is boilerplate if the same (digit-masked) text sits at the edge of
    # at least half the pages. Needs 3+ pages to avoid false positives.
    counts: Counter = Counter()
    for entries in pages.values():
        counts.update({_edge_key(ln) for _, _, ln in edges(entries)})

    n_pages = len(pages)
    threshold = max(3, math.ceil(n_pages * 0.5))
    repeated = {k for k, c in counts.items() if k and n_pages >= 3 and c >= threshold}

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


# --------------------------------------------------------------------------- #
# Step 3: reflow hard-wrapped PDF lines into paragraphs
# --------------------------------------------------------------------------- #
def _reflow(text: str) -> list[str]:
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    if not lines:
        return []

    # With very few lines, line width isn't a reliable signal: only split on bullets
    typical = median(len(ln) for ln in lines) if len(lines) >= 4 else None

    paragraphs: list[list[str]] = [[lines[0]]]
    for prev, nxt in zip(lines, lines[1:]):
        new_para = bool(_BULLET.match(nxt)) or (
            typical is not None and len(prev) < SHORT_LINE_RATIO * typical
        )
        if new_para:
            paragraphs.append([nxt])
        else:
            paragraphs[-1].append(nxt)

    return [" ".join(p) for p in paragraphs]


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #
def clean_document(doc: ParsedDocument) -> tuple[ParsedDocument, CleaningReport]:
    report = CleaningReport(blocks_in=len(doc.blocks))

    blocks = [replace(b, text=_normalize(b.text)) for b in doc.blocks]
    blocks = [b for b in blocks if b.text]

    if doc.file_type == "pdf":
        blocks = _strip_pdf_boilerplate(blocks, report)

    cleaned: list[Block] = []
    seen: set[str] = set()

    for b in blocks:
        is_pdf_paragraph = b.kind == "paragraph" and b.page is not None
        pieces = _reflow(b.text) if is_pdf_paragraph else [b.text]

        for text in pieces:
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