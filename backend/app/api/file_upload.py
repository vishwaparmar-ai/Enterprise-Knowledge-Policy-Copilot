"""
FastAPI upload + ingestion pipeline.

Flow:
    POST /upload
        -> validate + save to temp/
        -> create DB document
        -> background ingestion

    GET /upload/documents/{doc_id}
        -> status/stage
        -> full ingested content if requested
"""

import json
import logging
import uuid
from pathlib import Path

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
    Response
)
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.models.documents import Document, DocumentStatus
from backend.app.rag.ingestion import IngestionError, ingest_document

from backend.app.db.session import SessionLocal
from backend.app.rag.indexer import blocks_to_documents
from backend.app.rag.chunking import chunk_documents
from backend.app.rag.embedding import get_embeddings
from backend.app.rag.vector_store import store_chunks, delete_document_chunks

from backend.app.core.security import require_role
from backend.app.models.user import Role, User



from backend.app.core.permissions import ROLE_LEVEL, infer_access_level
from backend.app.core.security import require_role
from backend.app.models.user import Role, User

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/upload",
    tags=["Upload Doc"],
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


MAGIC_BYTES = {
    ".pdf": b"%PDF-",
    ".docx": b"PK\x03\x04",
}


# --------------------------------------------------------------------------- #
# Background ingestion
# --------------------------------------------------------------------------- #

def process_document(
    doc_id: uuid.UUID,
    path: Path,
    original_name: str,
) -> None:


    db = SessionLocal()

    try:
        document = db.get(Document, doc_id)

        if document is None:
            logger.error("Document %s not found in database", doc_id)
            return

        document.status = DocumentStatus.PROCESSING
        document.stage = "parsing"
        db.commit()

        def update_stage(stage: str):
            document.stage = stage
            db.commit()

        # doc_id intentionally NOT passed here — the SQL row's uuid
        # (this function's `doc_id` argument) is only a database
        # primary key. The RAG-layer identifier used inside Chroma
        # metadata is derived from the file's own sha256 instead, so
        # re-uploading the same file upserts rather than duplicating.
        ingested = ingest_document(
            path,
            original_name,
            on_stage=update_stage,
        )

        ingested_path = INGESTED_DIR / f"{doc_id}.json"
        ingested_path.write_text(
            json.dumps(ingested.to_dict(), ensure_ascii=False),
            encoding="utf-8",
        )

        meta = ingested.metadata

        document.status = DocumentStatus.INGESTED
        document.stage = "done"
        document.title = meta.title
        document.page_count = meta.page_count
        document.word_count = meta.word_count
        document.block_count = meta.block_count
        document.warnings = ingested.warnings
        document.ingested_at = __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc
        )
        db.commit()

        logger.info("Document %s successfully ingested", doc_id)

   

        document.stage = "indexing"
        db.commit()

        documents = blocks_to_documents(
            blocks=ingested.blocks,
            document_metadata=ingested.metadata,
        )
        chunks = chunk_documents(documents)

        embeddings = get_embeddings()
        store_chunks(chunks=chunks, embeddings=embeddings)

        document.status = DocumentStatus.INDEXED
        document.stage = "indexed"
        db.commit()

        # Rebuild BM25's in-memory corpus so this document is
        # searchable via keyword search too, without restarting the
        # server. Dense/Chroma search sees new documents immediately
        # since it queries the live store directly; BM25 does not.
        try:
            from backend.app.api.chat import get_hybrid_retriever
            
            get_hybrid_retriever().refresh_bm25()
        except Exception:
            logger.exception(
                "Failed to refresh BM25 index after ingesting %s — "
                "restart the server to pick up this document for "
                "keyword search.",
                doc_id,
            )

        logger.info("Document %s successfully indexed (%d chunks)", doc_id, len(chunks))

    except IngestionError as exc:
        logger.error("Ingestion failed for document %s: %s", doc_id, exc)
        document = db.get(Document, doc_id)
        if document:
            document.status = DocumentStatus.FAILED
            document.stage = exc.stage
            document.error = str(exc)
            db.commit()

    except Exception:
        logger.exception("Unexpected error ingesting document %s", doc_id)
        document = db.get(Document, doc_id)
        if document:
            document.status = DocumentStatus.FAILED
            document.stage = "unknown"
            document.error = "Unexpected error during ingestion."
            db.commit()

    finally:
        db.close()

    

# --------------------------------------------------------------------------- #
# Upload endpoint
# --------------------------------------------------------------------------- #

@router.post(
    "/",
    status_code=status.HTTP_202_ACCEPTED,
)
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(Role.MANAGER, Role.ADMIN)),

):
    # -------------------------------------------------
    # Validate extension
    # -------------------------------------------------

    ext = Path(file.filename or "").suffix.lower()

    if ext not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only .pdf and .docx files are allowed.",
        )

    # Least privilege: a user can't introduce content classified above
    # their own clearance — they'd have no way to read or verify it
    # themselves afterward.
    inferred_level = infer_access_level(file.filename or "")
    if inferred_level > ROLE_LEVEL[current_user.role]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "This document's classification requires a higher "
                "access level than your role permits to upload."
            ),
        )

    # -------------------------------------------------
    # Validate content type
    # -------------------------------------------------

    if file.content_type not in ALLOWED_TYPES[ext]:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Content type '{file.content_type}' "
                f"does not match '{ext}'."
            ),
        )

    # -------------------------------------------------
    # Validate magic bytes
    # -------------------------------------------------

    header = await file.read(len(MAGIC_BYTES[ext]))

    if header != MAGIC_BYTES[ext]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File content does not match its extension.",
        )

    await file.seek(0)

    # -------------------------------------------------
    # Generate document ID
    # -------------------------------------------------

    doc_id = uuid.uuid4()

    dest = UPLOAD_DIR / f"{doc_id}{ext}"

    size = 0

    # -------------------------------------------------
    # Save uploaded file
    # -------------------------------------------------

    try:

        with dest.open("wb") as out:

            while chunk := await file.read(CHUNK_SIZE):

                size += len(chunk)

                if size > MAX_SIZE_BYTES:

                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=(
                            f"File exceeds "
                            f"{MAX_SIZE_BYTES // (1024 * 1024)} MB limit."
                        ),
                    )

                out.write(chunk)

    except Exception:

        dest.unlink(missing_ok=True)

        raise

    finally:

        await file.close()

    # -------------------------------------------------
    # Create database record
    # -------------------------------------------------

    document = Document(
        id=doc_id,
        original_filename=file.filename,
        file_type=ext,
        size_bytes=size,
        sha256="",  # calculate later
        storage_path=str(dest),
        status=DocumentStatus.QUEUED,
        stage="queued",
    )

    db.add(document)
    db.commit()
    db.refresh(document)

    logger.info(
        "Document uploaded: %s (%s)",
        document.id,
        document.original_filename,
    )

    # -------------------------------------------------
    # Start background ingestion
    # -------------------------------------------------

    background_tasks.add_task(
        process_document,
        document.id,
        dest,
        file.filename,
    )

    # -------------------------------------------------
    # Response
    # -------------------------------------------------

    return {
        "doc_id": str(document.id),
        "original_filename": document.original_filename,
        "size_bytes": document.size_bytes,
        "status": document.status.value,
        "stage": document.stage,
    }


# --------------------------------------------------------------------------- #
# List documents (admin only)
# --------------------------------------------------------------------------- #

@router.get("/documents")
def list_documents(
    limit: int = 200,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN)),
):
    # Newest first. Falls back to ingested_at if your model has no created_at column.
    order_col = getattr(Document, "created_at", None) or Document.ingested_at

    docs = (
        db.query(Document)
        .order_by(order_col.desc())
        .offset(offset)
        .limit(min(limit, 500))
        .all()
    )

    return [
        {
            "doc_id": str(d.id),
            "original_filename": d.original_filename,
            "title": d.title,
            "file_type": d.file_type,
            "size_bytes": d.size_bytes,
            "status": d.status.value,
            "stage": d.stage,
            "error": d.error,
            "page_count": d.page_count,
            "word_count": d.word_count,
            "ingested_at": d.ingested_at,
            "created_at": getattr(d, "created_at", None),
        }
        for d in docs
    ]


# --------------------------------------------------------------------------- #
# Get document
# --------------------------------------------------------------------------- #



@router.get("/documents/{doc_id}")
def get_document(
    doc_id: uuid.UUID,
    include_content: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN)),
):

    document = db.get(Document, doc_id)

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    response = {
        "doc_id": str(document.id),
        "original_filename": document.original_filename,
        "file_type": document.file_type,
        "size_bytes": document.size_bytes,
        "status": document.status.value,
        "stage": document.stage,
        "error": document.error,
        "title": document.title,
        "page_count": document.page_count,
        "word_count": document.word_count,
        "block_count": document.block_count,
        "warnings": document.warnings,
    }

    # -------------------------------------------------
    # Include complete ingestion output
    # -------------------------------------------------

    if include_content and document.status in {
        DocumentStatus.INGESTED,
        DocumentStatus.INDEXED,
    }:

        ingested_path = INGESTED_DIR / f"{doc_id}.json"

        if ingested_path.exists():

            response["ingested"] = json.loads(
                ingested_path.read_text(
                    encoding="utf-8"
                )
            )

    return response


# --------------------------------------------------------------------------- #
# Delete document (admin only)
# --------------------------------------------------------------------------- #

@router.delete(
    "/documents/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_document(
    doc_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN)),
):
    document = db.get(Document, doc_id)

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    # The background task still uses this row and its files while the
    # document is queued, parsing, or indexing, so don't delete mid-flight.
    if document.status in {
        DocumentStatus.QUEUED,
        DocumentStatus.PROCESSING,
        DocumentStatus.INGESTED,
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This document is still being processed. Try again once it finishes.",
        )

    # -------------------------------------------------
    # 1. Remove chunks from the vector store.
    #    Done first: if it fails we keep the DB row, so the admin can retry.
    #    Chunks are matched by filename, so skip this if another upload with
    #    the same filename still exists (it shares those chunks).
    # -------------------------------------------------
    same_name_count = (
        db.query(Document)
        .filter(
            Document.original_filename == document.original_filename,
            Document.id != document.id,
        )
        .count()
    )

    removed_chunks = 0
    if same_name_count == 0:
        try:
            removed_chunks = delete_document_chunks(document.original_filename)
        except Exception as exc:
            logger.exception("Failed to remove vectors for document %s", doc_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Could not remove the document from the search index: {exc}",
            )

    # -------------------------------------------------
    # 2. Remove files from disk (best effort).
    # -------------------------------------------------
    if document.storage_path:
        Path(document.storage_path).unlink(missing_ok=True)
    (INGESTED_DIR / f"{doc_id}.json").unlink(missing_ok=True)

    # -------------------------------------------------
    # 3. Remove the database record.
    # -------------------------------------------------
    db.delete(document)
    db.commit()

    # -------------------------------------------------
    # 4. Rebuild the keyword (BM25) index so deleted text stops matching.
    # -------------------------------------------------
    try:
        from backend.app.api.chat import get_hybrid_retriever

        get_hybrid_retriever().refresh_bm25()
    except Exception:
        logger.exception(
            "Failed to refresh BM25 index after deleting %s; restart the server to clear it from keyword search.",
            doc_id,
        )

    logger.info(
        "Document %s deleted by %s (%d chunks removed)",
        doc_id,
        current_user.email,
        removed_chunks,
    )

    return Response(status_code=status.HTTP_204_NO_CONTENT)