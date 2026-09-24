"""
Chunking """

import logging
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

logger = logging.getLogger(__name__)

def chunk_documents(
        documents:list[Document]
) -> list[Document]:

    logger.info("Chunking started...")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=500,
        separators=["\n\n", "\n", ". ", " ", ""]
    )

    chunks = splitter.split_documents(documents)

    logger.info("Successfully created chunks")

    return chunks
