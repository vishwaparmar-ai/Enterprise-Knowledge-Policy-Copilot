"""
Document parsing for the knowledge base: PDF and DOCX -> structured blocks.
"""

import re
import zipfile
from dataclasses import asdict, dataclass, field
from pathlib import Path

from docx import Document as DocxDocument
from docx.opc.exceptions import PackageNotFoundError
from docx.table import Table
from docx.text.paragraph import Paragraph
from pypdf import PdfReader
from pypdf.errors import PyPdfError


class ParseError(Exception):
    """Raised when a document cannot be parsed (corrupt, encrypted, empty...)."""


@dataclass
class Block:
    text: str
    kind: str = "paragraph"  # paragraph | heading | table
    page: int | None = None  # PDF only (1-based)
    heading: str | None = None  # nearest preceding heading (DOCX)


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
# Helpers
# --------------------------------------------------------------------------- #
def _clean(text: str) -> str:
    text = text.replace("\x00", "").replace("\u00a0", " ")
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)  # re-join hyphenated line breaks
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _split_paragraphs(text: str, keep_lines: bool = False) -> list[str]:
    """Split on blank lines. Single newlines inside a paragraph are collapsed,
    unless keep_lines=True (the cleaner needs them for header/footer removal)."""
    paras = []
    for raw in re.split(r"\n\s*\n", text):
        para = raw.strip() if keep_lines else re.sub(r"\s*\n\s*", " ", raw).strip()
        if para:
            paras.append(para)
    return paras


# --------------------------------------------------------------------------- #
# PDF
# --------------------------------------------------------------------------- #
def parse_pdf(path: Path, filename: str) -> ParsedDocument:
    try:
        reader = PdfReader(str(path))
        if reader.is_encrypted and not reader.decrypt(""):
            raise ParseError("PDF is password-protected.")

        doc = ParsedDocument(
            filename=filename, file_type="pdf", page_count=len(reader.pages)
        )
        empty_pages = []

        for page_no, page in enumerate(reader.pages, start=1):
            text = _clean(page.extract_text() or "")
            if not text:
                empty_pages.append(page_no)
                continue
            for para in _split_paragraphs(text, keep_lines=True):
                doc.blocks.append(Block(text=para, page=page_no))

    except ParseError:
        raise
    except (PyPdfError, ValueError, OSError) as exc:
        raise ParseError(f"Could not read PDF: {exc}") from exc

    if empty_pages:
        doc.warnings.append(
            f"No extractable text on page(s) {empty_pages[:20]}"
            f"{'...' if len(empty_pages) > 20 else ''}; they may be scanned images (OCR needed)."
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

    # Walk the body in document order so tables stay in position
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