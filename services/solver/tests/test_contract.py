"""Zgodność modeli Pydantic z kontraktem zod (packages/contracts → app/contract.schema.json)."""

import json
from pathlib import Path

import pytest

from app.schemas import SolveRequest, SolveResponse

SCHEMA = Path(__file__).resolve().parents[1] / "app" / "contract.schema.json"


def _resolve(node, defs):
    while isinstance(node, dict) and "$ref" in node:
        node = defs[node["$ref"].split("/")[-1]]
    return node


def _shape(node, defs, path="$"):
    """Spłaszcza schemat do {ścieżka: zbiór nazw pól} dla obiektów."""
    node = _resolve(node, defs)
    out = {}
    if not isinstance(node, dict):
        return out
    for key in ("anyOf", "oneOf", "allOf"):
        for branch in node.get(key, []):
            out.update(_shape(branch, defs, path))
    if "properties" in node:
        out[path] = set(node["properties"])
        for name, sub in node["properties"].items():
            out.update(_shape(sub, defs, f"{path}.{name}"))
    if "items" in node and isinstance(node["items"], dict):
        out.update(_shape(node["items"], defs, f"{path}[]"))
    return out


@pytest.mark.parametrize("name,model", [("SolveRequest", SolveRequest), ("SolveResponse", SolveResponse)])
def test_pydantic_matches_zod_contract(name, model):
    if not SCHEMA.exists():
        pytest.fail("Brak app/contract.schema.json — uruchom `npm run contracts:export`")
    zod = json.loads(SCHEMA.read_text())[name]
    py = model.model_json_schema(by_alias=True)
    assert _shape(py, py.get("$defs", {})) == _shape(zod, zod.get("definitions", {}))
