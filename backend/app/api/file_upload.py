"""
FastAPI upload + ingestion pipeline.

Flow:  POST /upload  -> validate + save to temp/  -> background ingestion
                        (parse -> clean -> metadata)
       GET  /documents/{doc_id}  -> status/stage (+ full ingested content if requested)
"""

import json
import logging
import uuid
from pathlib import Path

from fastapi import BackgroundTasks, APIRouter, File, HTTPException, UploadFile, status

from backend.app.rag.ingestion import IngestionError, ingest_document

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/upload",
    tags=["Upload Doc"]
)

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "temp"
INGESTED_DIR = UPLOAD_DIR / "ingested"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
INGESTED_DIR.mkdir(parents=True, exist_ok=True)

MAX_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
CHUNK_SIZE = 1024 * 1024  # 1 MB

ALLOWED_TYPES = {
    ".pdf": {"application/pdf"},
    ".docx": {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/octet-stream",
    },
}
MAGIC_BYTES = {".pdf": b"%PDF-", ".docx": b"PK\x03\x04"}

# In-memory status registry. Swap for a DB table (documents: id, status, error...)
# once you add persistence; ingested output already lives on disk as JSON.
DOCUMENTS: dict[str, dict] = {}


# --------------------------------------------------------------------------- #
# Background ingestion
# --------------------------------------------------------------------------- #
def process_document(doc_id: str, path: Path, original_name: str) -> None:
    """Runs after the upload response is sent (in FastAPI's threadpool)."""
    record = DOCUMENTS[doc_id]
    record.update(status="processing", stage="parsing")
    try:
        ingested = ingest_document(
            path,
            original_name,
            doc_id,
            on_stage=lambda stage: record.update(stage=stage),
        )
        (INGESTED_DIR / f"{doc_id}.json").write_text(
            json.dumps(ingested.to_dict(), ensure_ascii=False), encoding="utf-8"
        )
        meta = ingested.metadata
        record.update(
            status="ingested",
            stage="done",
            title=meta.title,
            page_count=meta.page_count,
            word_count=meta.word_count,
            block_count=meta.block_count,
            warnings=ingested.warnings,
        )
        # TODO next stage: chunk -> embed -> upsert into vector store
    except IngestionError as exc:
        record.update(status="failed", stage=exc.stage, error=str(exc))
    except Exception:
        logger.exception("Unexpected error ingesting %s", doc_id)
        record.update(status="failed", error="Unexpected error during ingestion.")


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #
@router.post("/", status_code=status.HTTP_202_ACCEPTED)
async def upload_file(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    ext = Path(file.filename or "").suffix.lower()

    if ext not in ALLOWED_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Only .pdf and .docx files are allowed.",
        )
    if file.content_type not in ALLOWED_TYPES[ext]:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"Content type '{file.content_type}' does not match '{ext}'.",
        )

    header = await file.read(len(MAGIC_BYTES[ext]))
    if header != MAGIC_BYTES[ext]:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "File content does not match its extension."
        )
    await file.seek(0)

    doc_id = uuid.uuid4().hex
    dest = UPLOAD_DIR / f"{doc_id}{ext}"

    size = 0
    try:
        with dest.open("wb") as out:
            while chunk := await file.read(CHUNK_SIZE):
                size += len(chunk)
                if size > MAX_SIZE_BYTES:
                    raise HTTPException(
                        status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        f"File exceeds {MAX_SIZE_BYTES // (1024 * 1024)} MB limit.",
                    )
                out.write(chunk)
    except Exception:
        dest.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    DOCUMENTS[doc_id] = {
        "doc_id": doc_id,
        "original_filename": file.filename,
        "size_bytes": size,
        "status": "queued",
    }
    background_tasks.add_task(process_document, doc_id, dest, file.filename)

    return DOCUMENTS[doc_id]


@router.get("/documents/{doc_id}")
def get_document(doc_id: str, include_content: bool = False):
    ingested_path = INGESTED_DIR / f"{doc_id}.json"

    # Registry is in-memory; fall back to the ingested file after a server restart
    record = DOCUMENTS.get(doc_id)
    if record is None:
        if not ingested_path.exists():
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found.")
        record = {"doc_id": doc_id, "status": "ingested"}

    response = dict(record)
    if include_content and record["status"] == "ingested":
        response["ingested"] = json.loads(ingested_path.read_text(encoding="utf-8"))
    return response