"""Admin analytics queries. Each feature adds one function here."""

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.app.models.chat import Conversation, Feedback, Message


def _bounds(start: date, end: date) -> tuple[datetime, datetime]:
    """[start 00:00 UTC, day after end 00:00 UTC)"""
    lo = datetime.combine(start, time.min, tzinfo=timezone.utc)
    hi = datetime.combine(end + timedelta(days=1), time.min, tzinfo=timezone.utc)
    return lo, hi


def _day_expr(db: Session):
    """Calendar day (UTC) of a message, on PostgreSQL and SQLite."""
    if db.get_bind().dialect.name == "postgresql":
        return func.date(func.timezone("UTC", Message.created_at))
    return func.date(Message.created_at)


def _user_questions(db: Session, lo: datetime, hi: datetime):
    """Base query: questions asked (user messages) inside the window, joined to their conversation."""
    return (
        db.query(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .filter(Message.role == "user", Message.created_at >= lo, Message.created_at < hi)
    )


def _totals(db: Session, lo: datetime, hi: datetime) -> dict:
    questions = _user_questions(db, lo, hi).count()
    active_users = (
        _user_questions(db, lo, hi).with_entities(func.count(func.distinct(Conversation.user_id))).scalar() or 0
    )
    conversations = (
        _user_questions(db, lo, hi).with_entities(func.count(func.distinct(Message.conversation_id))).scalar() or 0
    )
    return {
        "questions": questions,
        "active_users": active_users,
        "conversations": conversations,
        "avg_questions_per_conversation": round(questions / conversations, 1) if conversations else 0,
    }


def usage_report(db: Session, days: int) -> dict:
    """
    Usage over the last `days` days (including today), compared with the
    equally long period before it. Days with no activity appear as zeros.
    """
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=days - 1)
    prev_start = start - timedelta(days=days)
    prev_end = start - timedelta(days=1)

    lo, hi = _bounds(start, today)
    prev_lo, prev_hi = _bounds(prev_start, prev_end)

    day = _day_expr(db)
    rows = (
        _user_questions(db, lo, hi)
        .with_entities(day.label("day"), func.count(Message.id), func.count(func.distinct(Conversation.user_id)))
        .group_by(day)
        .all()
    )
    by_day = {str(d): (q, u) for d, q, u in rows}

    daily = []
    for i in range(days):
        d = (start + timedelta(days=i)).isoformat()
        q, u = by_day.get(d, (0, 0))
        daily.append({"date": d, "questions": q, "active_users": u})

    return {
        "range_days": days,
        "start": start.isoformat(),
        "end": today.isoformat(),
        "totals": _totals(db, lo, hi),
        "previous": _totals(db, prev_lo, prev_hi),
        "daily": daily,
    }


# --------------------------------------------------------------------------- #
# Feature 2: answer quality (from the thumbs up/down feedback)
#
# Everything is grouped by the day the ANSWER was given, so "helpful rate" means
# "of the answers given in this period that were rated, how many were helpful".
# --------------------------------------------------------------------------- #

REASONS = ["inaccurate", "not_relevant", "incomplete", "other", "none"]  # "none": a thumbs-down with no reason given


def _answers_in(db: Session, lo: datetime, hi: datetime):
    return db.query(Message).filter(Message.role == "assistant", Message.created_at >= lo, Message.created_at < hi)


def _feedback_in(db: Session, lo: datetime, hi: datetime):
    """Feedback rows whose answer was given inside the window."""
    return (
        db.query(Feedback)
        .join(Message, Feedback.message_id == Message.id)
        .filter(Message.created_at >= lo, Message.created_at < hi)
    )


def _quality_totals(db: Session, lo: datetime, hi: datetime) -> dict:
    answers = _answers_in(db, lo, hi).count()
    counts = dict(
        _feedback_in(db, lo, hi).with_entities(Feedback.rating, func.count(Feedback.id)).group_by(Feedback.rating).all()
    )
    up, down = counts.get("up", 0), counts.get("down", 0)
    rated = up + down
    return {
        "answers": answers,
        "rated": rated,
        "up": up,
        "down": down,
        "helpful_rate": round(up / rated, 4) if rated else None,         # None = nothing rated yet
        "rating_coverage": round(rated / answers, 4) if answers else None,  # share of answers that got a rating
    }


def quality_report(db: Session, days: int, limit: int = 10) -> dict:
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=days - 1)
    prev_start = start - timedelta(days=days)
    lo, hi = _bounds(start, today)
    prev_lo, prev_hi = _bounds(prev_start, start - timedelta(days=1))

    # --- per day (zero-filled)
    day = _day_expr(db)
    rows = (
        _feedback_in(db, lo, hi)
        .with_entities(day.label("day"), Feedback.rating, func.count(Feedback.id))
        .group_by(day, Feedback.rating)
        .all()
    )
    per_day: dict[str, dict[str, int]] = {}
    for d, rating, n in rows:
        per_day.setdefault(str(d), {})[rating] = n
    daily = []
    for i in range(days):
        d = (start + timedelta(days=i)).isoformat()
        daily.append({"date": d, "up": per_day.get(d, {}).get("up", 0), "down": per_day.get(d, {}).get("down", 0)})

    # --- why people downvote
    reason_counts = dict(
        _feedback_in(db, lo, hi)
        .filter(Feedback.rating == "down")
        .with_entities(Feedback.reason, func.count(Feedback.id))
        .group_by(Feedback.reason)
        .all()
    )
    reasons = [{"reason": r, "count": reason_counts.get(None if r == "none" else r, 0)} for r in REASONS]

    # --- downvoted answers to review, newest rating first
    flagged = (
        _feedback_in(db, lo, hi)
        .filter(Feedback.rating == "down")
        .order_by(Feedback.updated_at.desc())
        .limit(limit)
        .all()
    )
    downvoted = []
    for f in flagged:
        answer = db.get(Message, f.message_id)
        question = (
            db.query(Message)
            .filter(
                Message.conversation_id == answer.conversation_id,
                Message.role == "user",
                Message.created_at < answer.created_at,
            )
            .order_by(Message.created_at.desc())
            .first()
        )
        downvoted.append(
            {
                "message_id": str(answer.id),
                "asked_at": answer.created_at.isoformat(),
                "rated_at": f.updated_at.isoformat(),
                "question": question.content if question else "",
                "answer": answer.content[:2000],
                "sources": answer.citations or [],
                "reason": f.reason,
                "comment": f.comment,
            }
        )

    return {
        "range_days": days,
        "start": start.isoformat(),
        "end": today.isoformat(),
        "totals": _quality_totals(db, lo, hi),
        "previous": _quality_totals(db, prev_lo, prev_hi),
        "daily": daily,
        "reasons": reasons,
        "downvoted": downvoted,
    }