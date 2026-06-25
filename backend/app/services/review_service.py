"""
Product reviews & ratings, with a verified-purchase trust signal.

A review is "verified" when the reviewing user has a SUCCESS transaction
whose item snapshot includes the product -- reusing the order data we
already store (gateway_payload["items"]) rather than tracking it separately.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.review import Review
from app.models.transaction import Transaction, TransactionStatus
from app.models.product import Product
from app.models.user import User


async def has_purchased(db: AsyncSession, user_id: int, product_id: int) -> bool:
    """True if the user has a successful order containing this product."""
    result = await db.execute(
        select(Transaction.gateway_payload).where(
            Transaction.user_id == user_id,
            Transaction.status == TransactionStatus.SUCCESS,
        )
    )
    for (payload,) in result.all():
        if isinstance(payload, dict):
            for item in payload.get("items", []):
                if item.get("product_id") == product_id:
                    return True
    return False


async def upsert_review(
    db: AsyncSession, user_id: int, product_id: int, rating: int, title: str, body: str
) -> Review:
    if not isinstance(rating, int) or rating < 1 or rating > 5:
        raise ValueError("Rating must be an integer from 1 to 5")
    product = await db.get(Product, product_id)
    if product is None:
        raise ValueError("Product not found")

    verified = await has_purchased(db, user_id, product_id)
    existing = (
        await db.execute(
            select(Review).where(Review.user_id == user_id, Review.product_id == product_id)
        )
    ).scalar_one_or_none()

    if existing:
        existing.rating = rating
        existing.title = title.strip()[:120]
        existing.body = body.strip()[:2000]
        existing.verified_purchase = verified
        review = existing
    else:
        review = Review(
            user_id=user_id, product_id=product_id, rating=rating,
            title=title.strip()[:120], body=body.strip()[:2000], verified_purchase=verified,
        )
        db.add(review)
    await db.commit()
    return review


async def get_product_reviews(db: AsyncSession, product_id: int) -> dict:
    """Reviews (newest first) plus an aggregate summary for the rating header."""
    rows = (
        await db.execute(
            select(Review, User.name)
            .join(User, User.id == Review.user_id)
            .where(Review.product_id == product_id)
            .order_by(Review.created_at.desc())
        )
    ).all()

    count = len(rows)
    distribution = {5: 0, 4: 0, 3: 0, 2: 0, 1: 0}
    total = 0
    reviews = []
    for review, user_name in rows:
        distribution[review.rating] = distribution.get(review.rating, 0) + 1
        total += review.rating
        reviews.append({
            "id": review.id,
            "user_name": user_name,
            "rating": review.rating,
            "title": review.title,
            "body": review.body,
            "verified_purchase": review.verified_purchase,
            "created_at": review.created_at,
        })

    return {
        "product_id": product_id,
        "count": count,
        "average": round(total / count, 1) if count else 0.0,
        "distribution": distribution,
        "reviews": reviews,
    }
