"""
Database model for the knowledge base.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from backend.app.db.session import Base

class DocumentStatus(str, enum.Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    INGESTED = "ingested"  # parsed + cleaned + metadata done
    INDEXED = "indexed"  # chunked + embedded + stored in ChromaDB (searchable)
    FAILED = "failed"


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # --- file facts ---
    original_filename: Mapped[str] = mapped_column(String(255))
    file_type: Mapped[str] = mapped_column(String(10))  # pdf | docx
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64), index=True)  # duplicate detection
    storage_path: Mapped[str] = mapped_column(String(500))

    # --- pipeline state ---
    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus, native_enum=False, length=20),
        default=DocumentStatus.QUEUED,
        index=True,
    )
    stage: Mapped[str | None] = mapped_column(String(20))  # parsing | cleaning | metadata | ...
    error: Mapped[str | None] = mapped_column(Text)
    warnings: Mapped[list | None] = mapped_column(JSONB)

    # --- extracted metadata ---
    title: Mapped[str | None] = mapped_column(String(500))
    title_source: Mapped[str | None] = mapped_column(String(20))
    author: Mapped[str | None] = mapped_column(String(255))
    subject: Mapped[str | None] = mapped_column(String(500))
    keywords: Mapped[list | None] = mapped_column(JSONB)
    headings: Mapped[list | None] = mapped_column(JSONB)  # outline (DOCX)
    source_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source_modified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    page_count: Mapped[int | None] = mapped_column(Integer)
    word_count: Mapped[int | None] = mapped_column(Integer)
    block_count: Mapped[int | None] = mapped_column(Integer)
    table_count: Mapped[int | None] = mapped_column(Integer)

    # --- indexing (ChromaDB) ---
    chunk_count: Mapped[int | None] = mapped_column(Integer)  # filled after indexing

    # --- timestamps ---
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    ingested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))