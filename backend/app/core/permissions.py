from backend.app.models.user import Role

# Higher level = more sensitive. A role can see its own level and
# every level below it (Manager sees Employee-level content too).
ROLE_LEVEL: dict[Role, int] = {
    Role.EMPLOYEE: 0,
    Role.MANAGER: 1,
    Role.ADMIN: 2,
}

# Document/chunk-category -> baseline access level, derived from the
# doc_id prefix already present in every filename in this corpus.
_CATEGORY_DEFAULT_LEVEL = {
    "HR": 0,
    "ONB": 0,
    "PRD": 0,
    "FAQ": 0,
    "SOP": 1,
    "ENG": 2,
    "SEC": 2,
}

# Explicit overrides for specific documents whose category default
# doesn't match their actual sensitivity.
_ACCESS_LEVEL_OVERRIDES = {
    "HR-005": 1,  # Compensation, Benefits and Travel Expense Policy
    "HR-006": 1,  # Performance Review and Promotion Policy
}


def infer_access_level(filename: str) -> int:
    """
    Derives a document's access level from its doc-id prefix
    (e.g. "HR-005_compensation-....pdf" -> "HR-005" -> level 1),
    with explicit overrides for documents whose sensitivity doesn't
    match their category default.
    """
    import re

    match = re.match(r"^([A-Z]{2,4})-(\d{3})", filename)
    if not match:
        return 0  # unknown format — default to least-restrictive

    prefix, number = match.group(1), match.group(2)
    doc_id = f"{prefix}-{number}"

    if doc_id in _ACCESS_LEVEL_OVERRIDES:
        return _ACCESS_LEVEL_OVERRIDES[doc_id]

    return _CATEGORY_DEFAULT_LEVEL.get(prefix, 0)


def allowed_access_levels(role: Role) -> list[int]:
    """All levels a role is permitted to retrieve, inclusive."""
    max_level = ROLE_LEVEL[role]
    return list(range(0, max_level + 1))