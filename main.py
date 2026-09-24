import logging

from fastapi import FastAPI

from backend.app.core.logging import setup_logging
from backend.app.api.file_upload import router as upload_router

setup_logging()

logger = logging.getLogger(__name__)

app = FastAPI(title="Knowledge Assistant & Policy Copilot")

app.include_router(upload_router)

@app.get("/health")
async def health_check():
    logger.info("Health check requested")

    return {
        "status": "healthy"
    }