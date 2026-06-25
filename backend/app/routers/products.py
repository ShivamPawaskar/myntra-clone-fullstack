from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.product import Product, Category
from app.core.deps import get_optional_user, get_current_user
from app.services import recently_viewed_service, browsing_history_service, review_service

router = APIRouter(prefix="/products", tags=["products"])


class ReviewRequest(BaseModel):
    rating: int
    title: str = ""
    body: str = ""


def _csv(value: str | None) -> list[str]:
    """Split a comma-separated query param into a clean lowercased list."""
    if not value:
        return []
    return [v.strip().lower() for v in value.split(",") if v.strip()]


@router.get("")
async def list_products(
    search: str | None = None,
    category: str | None = None,
    category_id: int | None = None,
    category_ids: str | None = None,   # comma-separated (multi-select)
    brand: str | None = None,          # single (backward-compat)
    brands: str | None = None,         # comma-separated (multi-select)
    colors: str | None = None,         # comma-separated (multi-select)
    min_price: float | None = None,
    max_price: float | None = None,
    sort: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Catalog listing with real server-side search, filtering and sorting.

    - `search`: matches name / brand / description / category name (case-insensitive)
    - `category`: section filter — prefix-matches the category name (e.g. "men"
      matches "Men's Topwear" but NOT "Women's…"), and also matches when the
      term appears anywhere in the category name (e.g. "footwear", "beauty").
    - `category_id`: exact category match (used by category tiles)
    - `min_price` / `max_price`: inclusive price band
    - `sort`: price_asc | price_desc | popular | newest (default: newest)
    """
    query = (
        select(Product)
        .join(Category, Product.category_id == Category.id)
        .where(Product.is_active == True)  # noqa: E712
    )

    if category_id:
        query = query.where(Product.category_id == category_id)

    cat_id_list = [int(c) for c in _csv(category_ids) if c.isdigit()]
    if cat_id_list:
        query = query.where(Product.category_id.in_(cat_id_list))

    if category:
        term = category.strip().lower()
        # Prefix match on the category name so the gender/section nav is exact:
        # "men" matches "Men's …" but NOT "Women's …". For substring sections
        # (e.g. "footwear") the storefront uses the `search` param instead.
        query = query.where(func.lower(Category.name).like(f"{term}%"))

    brand_list = _csv(brands) or ([brand.strip().lower()] if brand else [])
    if brand_list:
        query = query.where(func.lower(Product.brand).in_(brand_list))

    color_list = _csv(colors)
    if color_list:
        query = query.where(func.lower(Product.color).in_(color_list))

    if search:
        like = f"%{search.strip().lower()}%"
        # Match the product identity (name / brand / category) only -- NOT the
        # marketing description. Descriptions mention other product types
        # ("...dress it down with sneakers"), which made a search for one type
        # surface unrelated items. Name/brand/category is what users expect.
        query = query.where(
            or_(
                func.lower(Product.name).like(like),
                func.lower(Product.brand).like(like),
                func.lower(Category.name).like(like),
            )
        )

    if min_price is not None:
        query = query.where(Product.price >= min_price)
    if max_price is not None:
        query = query.where(Product.price <= max_price)

    if sort == "price_asc":
        query = query.order_by(Product.price.asc())
    elif sort == "price_desc":
        query = query.order_by(Product.price.desc())
    elif sort == "popular":
        query = query.order_by(Product.popularity_score.desc())
    else:
        query = query.order_by(Product.id.desc())

    rows = (await db.execute(query.limit(200))).scalars().all()
    return rows


@router.get("/categories")
async def list_categories(db: AsyncSession = Depends(get_db)):
    """All categories with product counts — powers the filter sidebar."""
    rows = (
        await db.execute(
            select(Category.id, Category.name, func.count(Product.id))
            .join(Product, Product.category_id == Category.id, isouter=True)
            .where(Product.is_active == True)  # noqa: E712
            .group_by(Category.id, Category.name)
            .order_by(Category.name)
        )
    ).all()
    return [{"id": r[0], "name": r[1], "count": r[2]} for r in rows]


@router.get("/facets")
async def product_facets(
    search: str | None = None,
    category: str | None = None,
    category_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Facet counts for the filter sidebar (brands, colors, categories, price),
    scoped to the current search/section but NOT to the selected facets, so the
    counts stay stable as the user ticks boxes."""
    def base():
        q = select(Product).join(Category, Product.category_id == Category.id).where(Product.is_active == True)  # noqa: E712
        if category_id:
            q = q.where(Product.category_id == category_id)
        if category:
            q = q.where(func.lower(Category.name).like(f"{category.strip().lower()}%"))
        if search:
            like = f"%{search.strip().lower()}%"
            q = q.where(or_(
                func.lower(Product.name).like(like),
                func.lower(Product.brand).like(like),
                func.lower(Category.name).like(like),
            ))
        return q.subquery()

    sub = base()

    async def grouped(col):
        rows = (await db.execute(
            select(col, func.count()).select_from(sub).where(col != "").group_by(col).order_by(func.count().desc())
        )).all()
        return [{"name": r[0], "count": r[1]} for r in rows]

    brands = await grouped(sub.c.brand)
    colors = await grouped(sub.c.color)
    cat_rows = (await db.execute(
        select(sub.c.category_id, func.count()).select_from(sub).group_by(sub.c.category_id)
    )).all()
    cat_names = dict((await db.execute(select(Category.id, Category.name))).all())
    categories = sorted(
        [{"id": r[0], "name": cat_names.get(r[0], "?"), "count": r[1]} for r in cat_rows],
        key=lambda c: -c["count"],
    )
    price_row = (await db.execute(
        select(func.min(sub.c.price), func.max(sub.c.price)).select_from(sub)
    )).one()

    return {
        "categories": categories,
        "brands": brands,
        "colors": colors,
        "price": {"min": float(price_row[0] or 0), "max": float(price_row[1] or 0)},
    }


@router.get("/{product_id}")
async def get_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_optional_user),
):
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # A product detail view is the single event that drives both feature 1
    # (recently viewed) and feature 6's browsing-history signal, plus a
    # cheap popularity bump used as the recommendation cold-start fallback.
    if user:
        await recently_viewed_service.record_view(db, user.id, product_id)
        await browsing_history_service.record_browsing_event(db, user.id, product_id)
    await db.execute(
        update(Product).where(Product.id == product_id).values(popularity_score=Product.popularity_score + 1)
    )
    await db.commit()
    return product


@router.get("/{product_id}/reviews")
async def list_reviews(product_id: int, db: AsyncSession = Depends(get_db)):
    """Aggregate rating + the reviews for a product (public)."""
    return await review_service.get_product_reviews(db, product_id)


@router.post("/{product_id}/reviews")
async def submit_review(
    product_id: int,
    payload: ReviewRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Create or update the current user's review for a product. The review is
    flagged Verified Purchase automatically if the user has bought it."""
    try:
        review = await review_service.upsert_review(
            db, user.id, product_id, payload.rating, payload.title, payload.body
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "id": review.id,
        "rating": review.rating,
        "title": review.title,
        "body": review.body,
        "verified_purchase": review.verified_purchase,
    }
