"""
Document parsing for the knowledge base: PDF and DOCX -> structured blocks.
"""

import re
import zipfile
from dataclasses import asdict, dataclass, field
from pathlib import Path

import pdfplumber
from docx import Document as DocxDocument
from docx.opc.exceptions import PackageNotFoundError
from docx.table import Table
from docx.text.paragraph import Paragraph


class ParseError(Exception):
    """Raised when a document cannot be parsed (corrupt, encrypted, empty...)."""


@dataclass
class Block:
    text: str
    kind: str = "paragraph"  # paragraph | heading | table | qa
    page: int | None = None  # PDF only (1-based)
    heading: str | None = None  # nearest preceding section heading


@dataclass
class ParsedDocument:
    filename: str
    file_type: str  # "pdf" | "docx"
    blocks: list[Block] = field(default_factory=list)
    page_count: int | None = None
    warnings: list[str] = field(default_factory=list)

    @property
    def char_count(self) -> int:
        return sum(len(b.text) for b in self.blocks)

    @property
    def full_text(self) -> str:
        return "\n\n".join(b.text for b in self.blocks)

    def to_dict(self) -> dict:
        data = asdict(self)
        data["char_count"] = self.char_count
        return data


# --------------------------------------------------------------------------- #
# Structural patterns — derived from surveying the actual Helix document
# template across all 27 files in the knowledge base. This template is
# extremely consistent: every document has the same front-matter block,
# the same numbered-heading style, the same footer, the same closing line.
# --------------------------------------------------------------------------- #

# "1. Purpose", "6. Security Requirements for Remote Work" — never ends in
# terminal punctuation, which is what distinguishes it from a numbered
# procedure step ("1 Customer submits a request...").
_SECTION_HEADING = re.compile(r"^\d{1,2}\.\s+[A-Z][A-Za-z0-9 ,/&'()-]{2,80}$")

# "1 Customer submits a request..." — digit + space + capital, NO period.
_NUMBERED_STEP = re.compile(r"^\d{1,2}\s+[A-Z]")

# FAQ documents only: "Q: How long is parental leave?"
_QA_QUESTION = re.compile(r"^Q:\s*")

# Recurs on every single page of every document.
_COMPANY_HEADER = re.compile(r"Internal\s*-\s*Confidential", re.I)

# "HR-002 | Leave and Time Off Policy | v3.1 Page 2 of 2"
_DOC_FOOTER = re.compile(
    r"^[A-Z]{2,4}-\d{3}\s*\|.*\|\s*v\d+(\.\d+)?(\s+Page\s+\d+\s+of\s+\d+)?$", re.I
)

_PAGE_NUM = re.compile(
    r"^[-–—\s]*(?:page\s+)?\d{1,4}(?:\s*(?:of|/)\s*\d{1,4})?[-–—\s]*$", re.I
)

# Identical text at the end of every single document in this corpus.
_END_OF_DOC = re.compile(r"^End of document\.", re.I)


def _is_section_heading(text: str) -> bool:
    if not _SECTION_HEADING.match(text):
        return False
    return not text.rstrip().endswith((".", "!", "?"))


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _clean(text: str) -> str:
    text = text.replace("\x00", "").replace("\u00a0", " ")
    text = text.replace("(cid:127)", "•")  # PDF bullet glyph -> real bullet char
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)  # re-join hyphenated line breaks
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# --------------------------------------------------------------------------- #
# PDF
# --------------------------------------------------------------------------- #
def _table_rows_to_blocks(page, page_no: int) -> tuple[list[Block], list[tuple]]:
    """
    Extracts each detected table as one Block per row (kind="table").

    Handles two table orientations seen in this corpus:
      - Row-per-record, with a real header (e.g. "Leave Type | Duration | Pay")
        -> "Leave Type: X | Duration: Y | Pay: Z"
      - Transposed, attribute-per-row with entity names as column headers
        and an EMPTY top-left cell (e.g. the pricing table: "" | Starter |
        Growth | Enterprise, then "Price" | "$199" | "$899" | "Custom").
        Naively zipping header-to-cell here drops the row's own label
        ("Price") entirely, since its column header is blank — so it's
        prepended explicitly instead.
    """
    blocks: list[Block] = []
    bboxes: list[tuple] = []

    tables = page.find_tables()

    for table in tables:
        bboxes.append(table.bbox)
        data = table.extract()
        if not data:
            continue

        header = [(_clean(c) if c else "") for c in data[0]]
        has_header = any(header)

        for row in (data[1:] if has_header else data):
            cells = [(_clean(c) if c else "") for c in row]
            if not any(cells):
                continue

            if has_header:
                pairs = [f"{h}: {c}" for h, c in zip(header, cells) if h and c]
                row_text = " | ".join(pairs) if pairs else " | ".join(cells)

                # Transposed-table fix: if the top-left header cell is
                # blank, the row's own first cell is its real label and
                # would otherwise be silently dropped.
                if not header[0] and cells[0]:
                    row_text = f"{cells[0]}: {row_text}" if row_text else cells[0]
            else:
                row_text = " | ".join(cells)

            blocks.append(Block(text=row_text, kind="table", page=page_no))

    return blocks, bboxes


def parse_pdf(path: Path, filename: str) -> ParsedDocument:
    try:
        with pdfplumber.open(str(path), password="") as pdf:
            doc = ParsedDocument(
                filename=filename, file_type="pdf", page_count=len(pdf.pages)
            )
            empty_pages = []

            current_heading: str | None = None
            seen_first_heading = False
            end_of_doc_reached = False

            buffer: list[str] = []
            buffer_kind: str | None = None

            def flush():
                nonlocal buffer, buffer_kind
                if buffer:
                    text = " ".join(buffer).strip()
                    if text:
                        doc.blocks.append(
                            Block(
                                text=text,
                                kind=buffer_kind or "paragraph",
                                page=page_no,
                                heading=current_heading,
                            )
                        )
                buffer = []
                buffer_kind = None

            for page_no, page in enumerate(pdf.pages, start=1):
                table_blocks, table_bboxes = _table_rows_to_blocks(page, page_no)

                text_page = page
                for bbox in table_bboxes:
                    text_page = text_page.outside_bbox(bbox)

                raw_text = _clean(text_page.extract_text() or "")
                if not raw_text and not table_blocks:
                    empty_pages.append(page_no)
                    continue

                lines = [ln.strip() for ln in raw_text.split("\n") if ln.strip()]
                page_had_any_content_block = bool(table_blocks)

                for ln in lines:
                    if end_of_doc_reached:
                        continue

                    if _END_OF_DOC.match(ln):
                        flush()
                        end_of_doc_reached = True
                        continue

                    if _COMPANY_HEADER.search(ln) or _DOC_FOOTER.match(ln) or _PAGE_NUM.match(ln):
                        continue

                    if not seen_first_heading:
                        if _is_section_heading(ln):
                            seen_first_heading = True
                            # fall through to heading handling below
                        else:
                            # Front matter: doc-type label, title, "Document
                            # ID / Owner / Applies to" block — never contains
                            # retrievable content in this corpus, and it
                            # duplicates document_metadata.
                            continue

                    if _is_section_heading(ln):
                        flush()
                        current_heading = ln
                        doc.blocks.append(
                            Block(text=ln, kind="heading", page=page_no, heading=ln)
                        )
                        page_had_any_content_block = True
                        continue

                    if _QA_QUESTION.match(ln):
                        flush()
                        buffer = [ln]
                        buffer_kind = "qa"
                        page_had_any_content_block = True
                        continue

                    if buffer_kind == "qa":
                        # Continuation of the current Q/A pair (the "A:"
                        # line itself, or a wrapped continuation of it) —
                        # keep it atomic until the next Q: or heading.
                        buffer.append(ln)
                        continue

                    if _NUMBERED_STEP.match(ln) or ln.startswith("•"):
                        flush()
                        buffer = [ln]
                        buffer_kind = "paragraph"
                        page_had_any_content_block = True
                        continue

                    buffer.append(ln)
                    page_had_any_content_block = True

                flush()

                if not page_had_any_content_block:
                    empty_pages.append(page_no)

    except ParseError:
        raise
    except Exception as exc:
        raise ParseError(f"Could not read PDF: {exc}") from exc

    if empty_pages:
        doc.warnings.append(
            f"No extractable content on page(s) {empty_pages[:20]}"
            f"{'...' if len(empty_pages) > 20 else ''}."
        )
    if not doc.blocks:
        raise ParseError(
            "No text found in PDF. It is probably scanned; OCR is required."
        )
    return doc


# --------------------------------------------------------------------------- #
# DOCX
# --------------------------------------------------------------------------- #
def _table_to_text(table: Table) -> str:
    rows = []
    for row in table.rows:
        cells, prev = [], None
        for cell in row.cells:
            # merged cells repeat the same underlying cell object
            if cell._tc is prev:
                continue
            prev = cell._tc
            cells.append(re.sub(r"\s+", " ", cell.text).strip())
        if any(cells):
            rows.append(" | ".join(cells))
    return "\n".join(rows)


def parse_docx(path: Path, filename: str) -> ParsedDocument:
    try:
        docx = DocxDocument(str(path))
    except (PackageNotFoundError, zipfile.BadZipFile, KeyError, ValueError) as exc:
        raise ParseError(f"Could not read DOCX: {exc}") from exc

    doc = ParsedDocument(filename=filename, file_type="docx")
    current_heading: str | None = None

    for child in docx.element.body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]

        if tag == "p":
            para = Paragraph(child, docx)
            text = _clean(para.text)
            if not text:
                continue
            style = (para.style.name or "") if para.style is not None else ""
            if style.startswith("Heading") or style == "Title":
                current_heading = text
                doc.blocks.append(
                    Block(text=text, kind="heading", heading=current_heading)
                )
            else:
                doc.blocks.append(Block(text=text, heading=current_heading))

        elif tag == "tbl":
            text = _table_to_text(Table(child, docx))
            if text:
                doc.blocks.append(
                    Block(text=text, kind="table", heading=current_heading)
                )

    if not doc.blocks:
        raise ParseError("No text found in DOCX.")
    return doc


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #
def parse_document(path: Path, filename: str | None = None) -> ParsedDocument:
    path = Path(path)
    filename = filename or path.name
    ext = path.suffix.lower()

    if ext == ".pdf":
        return parse_pdf(path, filename)
    if ext == ".docx":
        return parse_docx(path, filename)
    raise ParseError(f"Unsupported file type: {ext}")