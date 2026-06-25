import httpx
import json
import time

BASE = "http://localhost:8000"
c = httpx.Client(base_url=BASE, timeout=10.0)


def section(title):
    print(f"\n{'='*10} {title} {'='*10}")


def check(label, cond):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    assert cond, label


# ---- Auth ----
section("AUTH")
email = f"smoketest_{int(time.time())}@test.com"
r = c.post("/auth/register", json={"email": email, "password": "password123", "name": "Smoke Test"})
check("register returns 200", r.status_code == 200)
reg_data = r.json()
token = reg_data["access_token"]
user_id = reg_data["user"]["id"]
headers = {"Authorization": f"Bearer {token}"}

r2 = c.post("/auth/login", json={"email": email, "password": "password123"})
check("login returns 200", r2.status_code == 200)

# Second user for wishlist-overlap testing
email2 = f"smoketest2_{int(time.time())}@test.com"
r = c.post("/auth/register", json={"email": email2, "password": "password123", "name": "User Two"})
token2 = r.json()["access_token"]
headers2 = {"Authorization": f"Bearer {token2}"}

# ---- Products ----
section("PRODUCTS")
products = c.get("/products").json()
check("products list non-empty", len(products) > 0)
pids = [p["id"] for p in products]

# ---- Feature 1: Recently Viewed ----
section("FEATURE 1: RECENTLY VIEWED")
for pid in pids[:5]:
    r = c.get(f"/products/{pid}", headers=headers)
    check(f"view product {pid} returns 200", r.status_code == 200)

rv = c.get("/recently-viewed", headers=headers).json()
check("recently viewed has 5 items", len(rv) == 5)
check("recently viewed ordered newest first", rv[0]["product_id"] == pids[4])

# duplicate view should not create a second row, just bump viewed_at
c.get(f"/products/{pids[0]}", headers=headers)
rv2 = c.get("/recently-viewed", headers=headers).json()
check("dedup: still 5 items after re-viewing one", len(rv2) == 5)
check("re-viewed item now most recent", rv2[0]["product_id"] == pids[0])

# cap enforcement: view 20 total
for pid in pids[5:21]:
    c.get(f"/products/{pid}", headers=headers)
rv3 = c.get("/recently-viewed", headers=headers).json()
check(f"cap enforced at 20 (got {len(rv3)})", len(rv3) == 20)

# merge anonymous local history
merge_resp = c.post("/recently-viewed/merge", headers=headers, json={
    "local_history": [{"product_id": pids[50], "viewed_at": "2026-06-18T12:00:00Z"}]
})
check("merge endpoint returns 200", merge_resp.status_code == 200)

# ---- Feature 6: Recommendations (cold start first) ----
section("FEATURE 6: RECOMMENDATIONS")
t0 = time.time()
rec = c.get("/recommendations", headers=headers2).json()  # user2 has no history yet -> cold start
elapsed_ms = (time.time() - t0) * 1000
check(f"cold-start recommendations non-empty (popularity fallback) [{elapsed_ms:.1f}ms]", len(rec["items"]) > 0)

t0 = time.time()
rec_warm = c.get("/recommendations", headers=headers).json()
elapsed_ms = (time.time() - t0) * 1000
check(f"warm recommendations non-empty [{elapsed_ms:.1f}ms]", len(rec_warm["items"]) > 0)
print("Sample recs:", [r["name"] for r in rec_warm["items"][:3]])

# wishlist overlap signal: both users wishlist the same product, user2 also wishlists something user1 doesn't have
c.post("/wishlist", headers=headers, json={"product_id": pids[10]})
c.post("/wishlist", headers=headers2, json={"product_id": pids[10]})
c.post("/wishlist", headers=headers2, json={"product_id": pids[60]})
rec_with_overlap = c.get("/recommendations", headers=headers).json()
overlap_hit = any(item["id"] == pids[60] for item in rec_with_overlap["items"])
check("wishlist-overlap signal surfaces user2's other wishlist item", overlap_hit)

# ---- Feature 5: Cart with optimistic locking ----
section("FEATURE 5: CART CONCURRENCY")
add_resp = c.post("/cart/items", headers=headers, json={"product_id": pids[30], "quantity": 2})
check("add to cart returns 200", add_resp.status_code == 200)
item = add_resp.json()
check("initial version is 1", item["version"] == 1)

# simulate device A and device B both holding version=1, A updates first
ok = c.patch(f"/cart/items/{item['id']}", headers=headers, json={"quantity": 3, "version": item["version"]})
check("device A update with correct version succeeds", ok.status_code == 200)
new_version = ok.json()["version"]
check("version incremented after update", new_version == item["version"] + 1)

# device B still has the stale version=1 -> must get a 409 conflict
stale = c.patch(f"/cart/items/{item['id']}", headers=headers, json={"quantity": 5, "version": item["version"]})
check("device B with stale version gets 409 conflict", stale.status_code == 409)

# save for later / move back
saved = c.post(f"/cart/items/{item['id']}/save-for-later", headers=headers, json={"version": new_version})
check("save for later succeeds", saved.status_code == 200)
cart_view = c.get("/cart", headers=headers).json()
check("saved item not counted in active total", all(i["id"] != item["id"] for i in cart_view["active"]))
check("saved item appears in saved_for_later", any(i["id"] == item["id"] for i in cart_view["saved_for_later"]))

# out of stock handling
oos_product = next(p for p in products if p["stock"] == 0)
oos_resp = c.post("/cart/items", headers=headers, json={"product_id": oos_product["id"], "quantity": 1})
check("adding out-of-stock product returns 409", oos_resp.status_code == 409)

checkout_check = c.get("/cart/validate-checkout", headers=headers).json()
check("validate-checkout returns structured report", "can_checkout" in checkout_check)
print("Checkout validation:", json.dumps(checkout_check, indent=2)[:300])

# ---- Feature 4: Transactions, idempotent webhook, audit log, export ----
section("FEATURE 4: TRANSACTIONS")
event_id = f"evt_{int(time.time()*1000)}"
webhook_payload = {
    "event_id": event_id, "order_id": "ORD-SMOKE-1", "user_id": user_id,
    "payment_mode": "UPI", "amount": 999.0, "status": "success", "raw": {"gateway": "razorpay"},
}
wh1 = c.post("/transactions/webhook", json=webhook_payload)
check("first webhook delivery processed", wh1.json()["status"] == "processed")

# simulate gateway retrying the SAME webhook (idempotency test)
wh2 = c.post("/transactions/webhook", json=webhook_payload)
check("duplicate webhook ignored (idempotent)", wh2.json()["status"] == "duplicate_ignored")
check("idempotent retry maps to same transaction id", wh1.json()["transaction_id"] == wh2.json()["transaction_id"])

txn_list = c.get("/transactions?page=1&page_size=10", headers=headers).json()
check("transaction list has pagination metadata", "total_pages" in txn_list)

csv_resp = c.get("/transactions/export.csv", headers=headers)
check("CSV export returns 200", csv_resp.status_code == 200)
check("CSV export has header row", csv_resp.text.startswith("invoice_number,"))

if txn_list["items"]:
    txn_id = txn_list["items"][0]["id"]
    pdf_resp = c.get(f"/transactions/{txn_id}/receipt.pdf", headers=headers)
    check("PDF receipt returns 200", pdf_resp.status_code == 200)
    check("PDF receipt has PDF magic bytes", pdf_resp.content[:4] == b"%PDF")

# ---- Feature 3: Notifications ----
section("FEATURE 3: PUSH NOTIFICATIONS")
reg = c.post("/notifications/register-device", headers=headers, json={"token": f"ExponentPushToken[smoketest{int(time.time())}]", "platform": "android"})
check("device registration returns 200", reg.status_code == 200)

print("\nAll smoke tests passed.")
