from __future__ import annotations

from langchain_core.documents import Document


MetadataFilter = dict[str, object]


def matches_filter(document: Document, filter: MetadataFilter | None) -> bool:
    """Used by BM25, which has no native filtering — check each
    candidate document's metadata against the filter by hand."""
    if not filter:
        return True

    metadata = document.metadata

    for key, expected in filter.items():
        actual = metadata.get(key)

        if isinstance(expected, (list, tuple, set)):
            if actual not in expected:
                return False
        else:
            if actual != expected:
                return False

    return True


def to_chroma_filter(filter: MetadataFilter | None) -> dict | None:
    """Translate our simple filter format into Chroma's filter syntax
    (which requires $eq/$in for conditions and $and for multiple
    keys)."""
    if not filter:
        return None

    def condition(key: str, value: object) -> dict:
        if isinstance(value, (list, tuple, set)):
            return {key: {"$in": list(value)}}
        return {key: {"$eq": value}}

    conditions = [condition(k, v) for k, v in filter.items()]

    if len(conditions) == 1:
        return conditions[0]

    return {"$and": conditions}