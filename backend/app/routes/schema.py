"""
schema.py — GET /schema/mapping & GET /schema/fields

Exposes the canonical schema, source column aliases, and normalisation
pipeline rules as a read-only API — useful for documentation, debugging,
and the frontend Schema Explorer.
"""

from fastapi import APIRouter
from app.services.schema_map import get_schema_map, get_canonical_fields

router = APIRouter(prefix="/schema", tags=["Schema"])


@router.get(
    "/mapping",
    summary="Full schema mapping",
    description=(
        "Returns the canonical field definitions, per-source column alias mappings, "
        "and the normalisation pipeline steps."
    ),
)
def schema_mapping():
    """Full Normalization & Schema Mapping reference."""
    return get_schema_map()


@router.get(
    "/fields",
    summary="Canonical field definitions",
    description="Returns only the 14 canonical fields with types, categories and descriptions.",
)
def schema_fields():
    """List of all 14 canonical fields."""
    return {"fields": get_canonical_fields()}
