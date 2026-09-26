import logging

from fastapi import FastAPI

from backend.app.core.logging import setup_logging
from backend.app.api.file_upload import router as upload_router
from backend.app.api.chat import router as chat_router
from backend.app.api.auth import router as login_router
from fastapi.middleware.cors import CORSMiddleware

setup_logging()

logger = logging.getLogger(__name__)

app = FastAPI(title="Knowledge Assistant & Policy Copilot")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        "http://127.0.0.1:8000",

    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload_router)
app.include_router(chat_router)
app.include_router(login_router)

@app.get("/health")
async def health_check():
    logger.info("Health check requested")

    return {
        "status": "healthy"
    }