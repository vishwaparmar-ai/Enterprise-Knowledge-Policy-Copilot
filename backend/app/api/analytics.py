from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.app.core.security import require_role
from backend.app.db.session import get_db
from backend.app.models.user import Role, User
from backend.app.services.analytics import quality_report, usage_report

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/usage")
def usage(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN)),
):
    """Questions and active users per day, with totals compared to the previous period."""
    return usage_report(db, days)


@router.get("/quality")
def quality(
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN)),
):
    """Helpful rate, reasons for thumbs-down, and the downvoted answers to review."""
    return quality_report(db, days, limit)