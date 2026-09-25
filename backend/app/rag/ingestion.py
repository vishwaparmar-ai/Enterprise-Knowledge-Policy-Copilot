"""
Ingestion pipeline:  parse (PDF/DOCX)  ->  clean  ->  extract metadata

    ingested = ingest_document(path, filename)
    ingested.doc_id      # stable, content-derived (sha256 of the file)
    ingested.metadata    # DocumentMetadata
    ingested.blocks      # cleaned Blocks, ready for chunking
"""

import hashlib
import logging
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from pathlib import Path

from backend.app.services.document_cleaner import CleaningReport, clean_document
from backend.app.services.document_parser import Block, ParseError, parse_document
from backend.app.services.metadata_extractor import DocumentMetadata, extract_metadata

logger = logging.getLogger(__name__)


class IngestionError(Exception):
    """A pipeline stage failed. `stage` says which one."""

    def __init__(self, stage: str, message: str):
        super().__init__(message)
        self.stage = stage


@dataclass
class IngestedDocument:
    doc_id: str
    metadata: DocumentMetadata
    blocks: list[Block]
    cleaning: CleaningReport
    warnings: list[str] = field(default_factory=list)
    timings_ms: dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "doc_id": self.doc_id,
            "metadata": self.metadata.to_dict(),
            "blocks": [asdict(b) for b in self.blocks],
            "cleaning": self.cleaning.to_dict(),
            "warnings": self.warnings,
            "timings_ms": self.timings_ms,
        }


def _content_doc_id(path: Path) -> str:
    """
    Content-addressed document ID: sha256 of the raw file bytes.
    Re-ingesting the exact same file always produces the same
    doc_id, so downstream stores can upsert instead of duplicating.
    """
    hasher = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            hasher.update(block)
    return hasher.hexdigest()


def ingest_document(
    path: Path,
    filename: str,
    doc_id: str | None = None,
    on_stage: Callable[[str], None] | None = None,
) -> IngestedDocument:
    """Run all stages. `on_stage` is called with 'parsing' / 'cleaning' / 'metadata'
    so callers can report progress.

    `doc_id` is optional. If omitted, it's derived deterministically
    from the file's content (sha256), so calling this twice on the
    same file yields the same doc_id instead of a new random one
    every time. Pass an explicit doc_id only if you need to force a
    specific ID (e.g. reusing an existing DB record's ID).
    """
    timings: dict[str, int] = {}

    if doc_id is None:
        doc_id = _content_doc_id(path)

    def enter(stage: str) -> float:
        if on_stage:
            on_stage(stage)
        return time.perf_counter()

    def leave(stage: str, started: float) -> None:
        timings[stage] = int((time.perf_counter() - started) * 1000)

    # 1. parsing
    t = enter("parsing")
    try:
        parsed = parse_document(path, filename)
    except ParseError as exc:
        raise IngestionError("parsing", str(exc)) from exc
    leave("parsing", t)

    # 2. cleaning
    t = enter("cleaning")
    cleaned, report = clean_document(parsed)
    if not cleaned.blocks:
        raise IngestionError("cleaning", "No usable text left after cleaning.")
    leave("cleaning", t)

    # 3. metadata
    t = enter("metadata")
    metadata = extract_metadata(path, filename, doc_id, cleaned)
    leave("metadata", t)

    logger.info("Ingested %s (%s) in %s ms", doc_id, filename, timings)
    return IngestedDocument(
        doc_id=doc_id,
        metadata=metadata,
        blocks=cleaned.blocks,
        cleaning=report,
        warnings=parsed.warnings,
        timings_ms=timings,
    )