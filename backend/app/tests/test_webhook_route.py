"""
Route-level tests for the hardened payment webhook (Feature 4):
signature verification + payload validation. These exercise the HTTP layer
(via httpx ASGITransport) rather than calling the service directly, so the
422/401 handling actually gets covered.
"""
import hashlib
import hmac
import json
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database import get_db
from app.config import settings

VALID = {
    "event_id": "evt_w1", "order_id": "ORD-W1", "user_id": 1,
    "payment_mode": "UPI", "amount": 500.0, "status": "success", "raw": {},
}


@pytest_asyncio.fixture
async def client(db_session):
    """App client with get_db overridden to the in-memory test session."""
    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_webhook_valid_payload_is_processed(client):
    r = await client.post("/transactions/webhook", json=VALID)
    assert r.status_code == 200
    assert r.json()["status"] == "processed"


@pytest.mark.asyncio
async def test_webhook_malformed_payload_returns_422(client):
    # missing required fields -> clean 422, not a 500
    r = await client.post("/transactions/webhook", json={"event_id": "x"})
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_webhook_unknown_status_returns_422(client):
    bad = {**VALID, "event_id": "evt_w2", "status": "banana"}
    r = await client.post("/transactions/webhook", json=bad)
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_webhook_signature_enforced_when_secret_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "WEBHOOK_SIGNING_SECRET", "shh-secret")
    body = json.dumps({**VALID, "event_id": "evt_w3"}).encode()
    headers = {"content-type": "application/json"}

    # no signature header -> 401
    r = await client.post("/transactions/webhook", content=body, headers=headers)
    assert r.status_code == 401

    # wrong signature -> 401
    r = await client.post(
        "/transactions/webhook", content=body,
        headers={**headers, "x-webhook-signature": "deadbeef"},
    )
    assert r.status_code == 401

    # correct signature -> 200
    sig = hmac.new(b"shh-secret", body, hashlib.sha256).hexdigest()
    r = await client.post(
        "/transactions/webhook", content=body,
        headers={**headers, "x-webhook-signature": sig},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "processed"
