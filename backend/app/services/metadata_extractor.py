"""
Metadata stage of the ingestion pipeline.

Combines three sources:
  - file facts       : size, sha256 (use it to detect duplicate uploads)
  - embedded props   : title/author/subject/dates from the PDF info dict or DOCX core properties
  - derived from text: title fallback, word/char/block counts, heading outline, reading time
"""

import hashlib
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from docx import Document as DocxDocument
from pypdf import PdfReader

from backend.app.services.document_parser import ParsedDocument

# Titles that authoring tools fill in automatically and carry no information
_JUNK_TITLE = re.compile(r"^(untitled|document\d*|microsoft word\b.*|.*\.(docx?|pdf))$", re.I)


@dataclass
class DocumentMetadata:
    doc_id: str
    source_filename: str
    file_type: str
    size_bytes: int
    sha256: str
    title: str
    title_source: str  # properties | heading | first_line | filename
    author: str | None = None
    subject: str | None = None
    keywords: list[str] = field(default_factory=list)
    created_at: str | None = None  # ISO 8601
    modified_at: str | None = None
    page_count: int | None = None
    word_count: int = 0
    char_count: int = 0
    block_count: int = 0
    table_count: int = 0
    headings: list[str] = field(default_factory=list)
    estimated_reading_minutes: float = 0.0
    ingested_at: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if isinstance(dt, datetime) else None


def _str(value) -> str | None:
    value = (str(value).strip() if value is not None else "")
    return value or None


def _keywords(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [k.strip() for k in re.split(r"[;,]", raw) if k.strip()]


def _pdf_properties(path: Path) -> dict:
    """Embedded PDF info dict. Missing or malformed fields are simply skipped."""
    try:
        reader = PdfReader(str(path))
        if reader.is_encrypted:
            reader.decrypt("")
        meta = reader.metadata
        if not meta:
            return {}

        def safe(getter):
            try:
                return getter()
            except Exception:
                return None

        return {
            "title": _str(safe(lambda: meta.title)),
            "author": _str(safe(lambda: meta.author)),
            "subject": _str(safe(lambda: meta.subject)),
            "keywords": _keywords(_str(meta.get("/Keywords"))),
            "created_at": _iso(safe(lambda: meta.creation_date)),
            "modified_at": _iso(safe(lambda: meta.modification_date)),
        }
    except Exception:
        return {}


def _docx_properties(path: Path) -> dict:
    try:
        core = DocxDocument(str(path)).core_properties
        return {
            "title": _str(core.title),
            "author": _str(core.author),
            "subject": _str(core.subject),
            "keywords": _keywords(_str(core.keywords)),
            "created_at": _iso(core.created),
            "modified_at": _iso(core.modified),
        }
    except Exception:
        return {}


def _resolve_title(props_title: str | None, doc: ParsedDocument, filename: str) -> tuple[str, str]:
    if props_title and not _JUNK_TITLE.match(props_title):
        return props_title, "properties"

    for b in doc.blocks[:10]:
        if b.kind == "heading":
            return b.text, "heading"

    if doc.blocks:
        first = doc.blocks[0]
        text = first.text.strip()
        if first.kind == "paragraph" and 3 <= len(text) <= 120 and not text.endswith((".", ",", ";", ":")):
            return text, "first_line"

    stem = Path(filename).stem.replace("_", " ").replace("-", " ").strip()
    return (stem or filename), "filename"


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #
def extract_metadata(
    path: Path, filename: str, doc_id: str, doc: ParsedDocument
) -> DocumentMetadata:
    """`doc` should be the cleaned document so counts reflect the stored text."""
    path = Path(path)
    props = _pdf_properties(path) if doc.file_type == "pdf" else _docx_properties(path)
    title, title_source = _resolve_title(props.get("title"), doc, filename)

    word_count = sum(len(b.text.split()) for b in doc.blocks)

    return DocumentMetadata(
        doc_id=doc_id,
        source_filename=filename,
        file_type=doc.file_type,
        size_bytes=path.stat().st_size,
        sha256=_sha256(path),
        title=title,
        title_source=title_source,
        author=props.get("author"),
        subject=props.get("subject"),
        keywords=props.get("keywords") or [],
        created_at=props.get("created_at"),
        modified_at=props.get("modified_at"),
        page_count=doc.page_count,
        word_count=word_count,
        char_count=doc.char_count,
        block_count=len(doc.blocks),
        table_count=sum(1 for b in doc.blocks if b.kind == "table"),
        headings=[b.text for b in doc.blocks if b.kind == "heading"],
        estimated_reading_minutes=round(word_count / 230, 1),
        ingested_at=datetime.now(timezone.utc).isoformat(),
    )