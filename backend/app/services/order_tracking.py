"""
Order-status timeline (Placed -> Packed -> Shipped -> Out for Delivery ->
Delivered), derived purely from the order's age. This needs no extra column
and no background job: each stage "completes" once enough time has elapsed
since the order was placed, so a fresh order shows Placed and naturally
progresses over the following days.
"""
from datetime import timedelta, timezone

# (label, time after order placement at which this stage is reached)
_STAGES = [
    ("Order Placed", timedelta(0)),
    ("Packed", timedelta(hours=2)),
    ("Shipped", timedelta(days=1)),
    ("Out for Delivery", timedelta(days=2)),
    ("Delivered", timedelta(days=3)),
]


def tracking_for(created_at, status) -> dict:
    """Return {current, stages[], note} for an order. SUCCESS/PENDING orders
    get the timeline; failed/refunded orders get a note instead."""
    from app.models.user import utcnow

    status_val = getattr(status, "value", status)
    if status_val == "failed":
        return {"current": -1, "stages": [], "note": "Payment failed"}
    if status_val == "refunded":
        return {"current": -1, "stages": [], "note": "Order refunded"}

    ca = created_at
    if ca.tzinfo is None:  # stored naive (older rows) -> treat as UTC
        ca = ca.replace(tzinfo=timezone.utc)
    now = utcnow()

    stages, current = [], 0
    for i, (label, delta) in enumerate(_STAGES):
        at = ca + delta
        done = now >= at
        if done:
            current = i
        stages.append({"label": label, "at": at.isoformat(), "done": done})
    return {"current": current, "stages": stages, "note": None}
