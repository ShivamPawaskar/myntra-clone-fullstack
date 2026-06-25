"""
Search relevance: a search for a product TYPE must match product identity
(name / brand / category), not incidental words in the marketing description.
Regression test for "searching 'sneakers' returned dresses".
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database import get_db
from app.models.product import Category, Product


@pytest_asyncio.fixture
async def client(db_session):
    async def _override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = _override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_search_matches_name_not_description(client, db_session):
    cat = Category(name="Footwear")
    cat2 = Category(name="Dresses")
    db_session.add_all([cat, cat2])
    await db_session.commit()
    sneaker = Product(name="Puma Chunky Sneakers", brand="Puma", category_id=cat.id, price=2999, stock=10, is_active=True,
                      description="Comfy everyday shoes.")
    # A dress whose DESCRIPTION mentions sneakers -- must NOT match a "sneakers" search.
    dress = Product(name="Vero Moda Tea Dress", brand="Vero Moda", category_id=cat2.id, price=1999, stock=10, is_active=True,
                    description="Dress it up with heels or down with sneakers.")
    db_session.add_all([sneaker, dress])
    await db_session.commit()

    res = await client.get("/products?search=sneakers")
    assert res.status_code == 200
    names = [p["name"] for p in res.json()]
    assert "Puma Chunky Sneakers" in names
    assert "Vero Moda Tea Dress" not in names


@pytest.mark.asyncio
async def test_search_matches_brand(client, db_session):
    cat = Category(name="Footwear")
    db_session.add(cat)
    await db_session.commit()
    db_session.add(Product(name="Classic Running Shoes", brand="Nike", category_id=cat.id, price=3999, stock=5, is_active=True, description=""))
    await db_session.commit()

    res = await client.get("/products?search=nike")
    assert res.status_code == 200
    assert any(p["brand"] == "Nike" for p in res.json())
