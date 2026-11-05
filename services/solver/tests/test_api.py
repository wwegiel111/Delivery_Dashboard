from fastapi.testclient import TestClient

from app.main import app

from .factory import request, truck

client = TestClient(app)


def test_healthz():
    assert client.get("/healthz").json() == {"status": "ok"}


def test_solve_roundtrip():
    payload = request([truck(1), truck(2)]).model_dump()
    r = client.post("/solve", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] in ("OPTIMAL", "FEASIBLE")
    assert {t["id"] for t in body["trucks"]} == {"t1", "t2"}
    assert len(body["buffer_level"]) == payload["horizon_slots"]


def test_extra_fields_are_rejected():
    payload = request([truck(1)]).model_dump()
    payload["unexpected"] = 1
    assert client.post("/solve", json=payload).status_code == 422
