"""Run with: python -m app.seed

Builds a Myntra-style catalog: 8 sections aligned with the site nav
(Men / Women / Kids / Beauty / Footwear / Accessories), each product with a
keyword-rich name (so search works), a matching real photo, and a description.
All image IDs below are verified-live Unsplash photos.
"""
import asyncio
import hashlib
import random
import re
from sqlalchemy import select
from app.database import AsyncSessionLocal, engine, Base
from app.models.product import Category, Product

IMG = "https://images.unsplash.com/{id}?w=400&h=500&fit=crop&auto=format"

# Keyword -> Unsplash photo id(s). Every id below has been VISUALLY verified to
# depict the product type it's mapped to, so a product's photo matches its name
# (a watch shows a watch, a saree shows a saree) instead of being assigned by a
# cycling index across mixed product types. Rules are checked top-to-bottom, so
# the MOST SPECIFIC keywords come first.
IMAGE_RULES = [
    # --- ethnic (specific terms before generic "dress"/"suit") ---
    (("saree",), ["1610030469983-98e550d6193c"]),
    (("lehenga", "anarkali", "choli"), ["1595777457583-95e059d581b8"]),
    (("kurti", "kurta", "salwar", "palazzo"), ["1585487000160-6ebcfceb0d03", "1583391733956-3750e0ff4e8b"]),
    # --- kids (catch before generic clothing so a "Girls Dress" stays a kids photo) ---
    (("kids", "boys", "girls"), ["1519238263530-99bdd11df2ea", "1503944168849-8bf86875bbd8",
                                  "1471286174890-9c112ffca5b4", "1622290291468-a28f7a7dc6a8"]),
    # --- accessories ---
    (("sunglasses", "aviator", "wayfarer"), ["1572635196237-14b3f281503f"]),
    (("watch", "chronograph"), ["1523170335258-f5ed11844a49", "1524805444758-089113d48a6d",
                                 "1524592094714-0f0654e20314"]),
    (("backpack",), ["1553062407-98eeb64c6a62"]),
    (("handbag", "tote", "crossbody", "sling"), ["1548036328-c9fa89d128fa", "1584917865442-de89df76afd3"]),
    (("belt",), ["1624222247344-550fb60583dc"]),
    (("wallet",), ["1627123424574-724758594e93"]),
    (("necklace", "bracelet", "jewel"), ["1599643478518-a784e5dc4c8f", "1611652022419-a9419f74343d"]),
    (("scarf",), ["1457545195570-67f207084966"]),
    # --- beauty & grooming ---
    (("perfume", "fragrance", "parfum"), ["1541643600914-78b084683601", "1592945403244-b3fbafd7f539"]),
    (("lipstick",), ["1586495777744-4413f21062fa"]),
    (("kajal", "eyeliner"), ["1631214524020-7e18db9a8f92"]),
    (("eyeshadow", "compact", "powder", "makeup"), ["1512496015851-a90fb38ba796", "1522335789203-aabd1fc54bc9",
                                                     "1596462502278-27bfdc403348"]),
    (("beard", "grooming"), ["1621607512214-68297480165e"]),
    (("hair", "wax", "styling"), ["1503951914875-452162b0f3f1"]),
    (("sunscreen",), ["1556228578-8c89e6adf883"]),
    (("serum", "face wash", "facewash", "mask", "lotion", "cream", "spf", "moisturiser"),
     ["1571781926291-c477ebfd024b", "1620916566398-39f1143ab7be"]),
    # --- footwear (heels before generic sandal/shoe) ---
    (("sneaker",), ["1600185365926-3a2ce3cdb9eb", "1595950653106-6c9ebd614d3a"]),
    (("heel", "pump", "wedge", "stiletto"), ["1543163521-1bf539c55dd2"]),
    # NOTE: no "oxford"/"derby" here -- those shoes match via "shoe", and the
    # keywords would otherwise hijack "Oxford Formal Shirt".
    (("sandal", "jutti", "espadrille", "flat", "ballerina", "loafer", "boot", "shoe"),
     ["1542291026-7eec264c27ff", "1549298916-b41d501d3772", "1491553895911-0055eca6402d",
      "1539185441755-769473a23570"]),
    # --- topwear ---
    (("t-shirt", "tee", "polo", "henley", "sweatshirt"), ["1620012253295-c15cc3e65df4",
                                                          "1602810318383-e386cc2a3ccf", "1603252109303-2751441dd157"]),
    (("shirt",), ["1596755094514-f87e34085b2c", "1607345366928-199ea26cfe3e", "1564859228273-274232fdb516"]),
    # --- dresses / generic women's western ---
    (("dress", "sundress", "frock", "gown", "jacket", "leggings", "dungaree", "shorts", "pyjama", "track", "cargo"),
     ["1572804013309-59a88b7e92f1", "1566174053879-31528523f8ae", "1496747611176-843222e1e57c",
      "1515886657613-9f3515b0c78f"]),
]
_DEFAULT_IMG = ["1596755094514-f87e34085b2c"]


# Color palette (display name -> hex for the swatch is on the frontend). If a
# product name mentions a color we use it; otherwise we assign one
# deterministically so the catalog has a realistic colour spread.
_COLOR_WORDS = [
    "White", "Black", "Blue", "Navy Blue", "Green", "Grey", "Red",
    "Pink", "Yellow", "Brown", "Maroon", "Beige", "Purple", "Orange",
]
_COLOR_ALIASES = {"navy": "Navy Blue", "gray": "Grey"}


def color_for(name: str) -> str:
    low = name.lower()
    for alias, canonical in _COLOR_ALIASES.items():
        if re.search(r"\b" + alias + r"\b", low):
            return canonical
    for c in _COLOR_WORDS:
        if re.search(r"\b" + c.lower() + r"\b", low):
            return c
    # No colour in the name -> deterministic assignment from a common subset.
    common = ["White", "Black", "Blue", "Navy Blue", "Green", "Grey", "Red", "Maroon", "Beige", "Pink"]
    idx = int(hashlib.md5(("c" + name).encode()).hexdigest(), 16) % len(common)
    return common[idx]


def _matches(keyword: str, low: str) -> bool:
    """Whole-word match with an optional trailing plural 's', so 'sandal'
    matches 'sandals' but 'belt' does NOT match 'belted' (which is a dress)."""
    return re.search(r"\b" + re.escape(keyword) + r"s?\b", low) is not None


def image_for(name: str) -> str:
    """Pick an on-subject image for a product name. Deterministic (same name ->
    same image) so the catalog is stable, with variety across the matched pool."""
    low = name.lower()
    chosen = _DEFAULT_IMG
    for keywords, ids in IMAGE_RULES:
        if any(_matches(k, low) for k in keywords):
            chosen = ids
            break
    idx = int(hashlib.md5(name.encode()).hexdigest(), 16) % len(chosen)
    return IMG.format(id="photo-" + chosen[idx])

CATALOG = [
    {
        "name": "Men's Topwear",
        "brands": ["Roadster", "HRX", "Allen Solly", "Levis", "H&M", "Puma"],
        "items": [
            "Slim Fit Casual Shirt", "Graphic Print T-Shirt", "Oxford Formal Shirt",
            "Polo Neck T-Shirt", "Checked Casual Shirt", "Solid Round Neck Tee",
            "Linen Half-Sleeve Shirt", "Striped Cotton Shirt", "Oversized Printed T-Shirt",
            "Denim Casual Shirt", "Henley Neck T-Shirt", "Mandarin Collar Shirt",
        ],
        "images": ["photo-1596755094514-f87e34085b2c", "photo-1602810318383-e386cc2a3ccf",
                   "photo-1607345366928-199ea26cfe3e", "photo-1620012253295-c15cc3e65df4",
                   "photo-1564859228273-274232fdb516", "photo-1603252109303-2751441dd157",
                   "photo-1598033129183-c4f50c736f10", "photo-1626497764746-6dc36546b388"],
        "desc": "A versatile {n} crafted from breathable fabric with a modern fit. Pairs effortlessly with jeans or chinos for all-day comfort.",
    },
    {
        "name": "Men's Footwear",
        "brands": ["Nike", "Puma", "Roadster", "HRX", "Levis"],
        "items": [
            "Running Sports Shoes", "Classic White Sneakers", "Casual Loafers",
            "High-Top Canvas Sneakers", "Leather Derby Shoes", "Slip-On Sneakers",
            "Mesh Training Shoes", "Suede Chukka Boots", "Lightweight Walking Shoes",
            "Retro Court Sneakers", "Outdoor Sandals", "Formal Oxford Shoes",
        ],
        "images": ["photo-1542291026-7eec264c27ff", "photo-1600185365926-3a2ce3cdb9eb",
                   "photo-1549298916-b41d501d3772", "photo-1595950653106-6c9ebd614d3a",
                   "photo-1491553895911-0055eca6402d", "photo-1463100099107-aa0980c362e6",
                   "photo-1460353581641-37baddab0fa2", "photo-1539185441755-769473a23570"],
        "desc": "Engineered for comfort, these {n} feature a cushioned sole and durable upper — perfect for workouts, weekends or everyday wear.",
    },
    {
        "name": "Women's Dresses",
        "brands": ["Zara", "H&M", "Roadster", "AND", "Vero Moda"],
        "items": [
            "Floral Print Maxi Dress", "Bodycon Party Dress", "A-Line Midi Dress",
            "Wrap Front Skater Dress", "Off-Shoulder Summer Dress", "Pleated Shirt Dress",
            "Ruffle Hem Mini Dress", "Polka Dot Fit & Flare Dress", "Satin Slip Dress",
            "Tiered Cotton Sundress", "Belted Shift Dress", "Smocked Tea Dress",
        ],
        "images": ["photo-1572804013309-59a88b7e92f1", "photo-1612336307429-8a898d10e223",
                   "photo-1566174053879-31528523f8ae", "photo-1496747611176-843222e1e57c",
                   "photo-1515886657613-9f3515b0c78f", "photo-1539109136881-3be0616acf4b",
                   "photo-1469334031218-e382a71b716b", "photo-1483985988355-763728e1935b"],
        "desc": "Flatter your silhouette in this {n}, made from flowy fabric with a flattering cut. Dress it up with heels or down with sneakers.",
    },
    {
        "name": "Women's Ethnic Wear",
        "brands": ["Biba", "W", "Global Desi", "Fabindia", "Anouk"],
        "items": [
            "Floral Print Kurti", "Banarasi Silk Saree", "Embroidered Anarkali Suit",
            "Cotton Palazzo Kurta Set", "Bandhani Print Kurti", "Straight Kurta with Pants",
            "Chikankari Kurti", "Woven Silk Saree", "Embellished Lehenga Choli",
            "Block Print Kurta Set", "Chanderi Salwar Suit", "Tie-Dye Cotton Kurti",
        ],
        "images": ["photo-1610030469983-98e550d6193c", "photo-1595777457583-95e059d581b8",
                   "photo-1581044777550-4cfa60707c03", "photo-1559583985-c80d8ad9b29f"],
        "desc": "Celebrate tradition with this {n} in rich fabric and intricate detailing — perfect for festivals, weddings and special occasions.",
    },
    {
        "name": "Women's Footwear",
        "brands": ["Puma", "Nike", "Metro", "Aldo", "H&M"],
        "items": [
            "Block Heel Sandals", "White Casual Sneakers", "Strappy Flat Sandals",
            "Pointed Toe Pumps", "Platform Espadrilles", "Ankle Strap Heels",
            "Slip-On Loafers", "Embellished Juttis", "Chunky Sole Sneakers",
            "Open Toe Wedges", "Ballerina Flats", "Knee High Boots",
        ],
        "images": ["photo-1543163521-1bf539c55dd2", "photo-1535043934128-cf0b28d52f95",
                   "photo-1560769629-975ec94e6a86", "photo-1607522370275-f14206abe5d3",
                   "photo-1595950653106-6c9ebd614d3a"],
        "desc": "Step out in these {n} that blend comfort with a chic finish. The cushioned footbed keeps you going from day to night.",
    },
    {
        "name": "Kids Wear",
        "brands": ["H&M", "Max", "Gini & Jony", "UCB", "Mothercare"],
        "items": [
            "Boys Cotton T-Shirt", "Girls Printed Frock", "Kids Denim Dungarees",
            "Boys Casual Shirt", "Girls Party Dress", "Kids Hooded Sweatshirt",
            "Boys Cargo Shorts", "Girls Leggings Set", "Kids Cartoon Pyjama Set",
            "Boys Track Pants", "Girls Denim Jacket", "Kids Graphic Tee",
        ],
        "images": ["photo-1519238263530-99bdd11df2ea", "photo-1503944168849-8bf86875bbd8",
                   "photo-1471286174890-9c112ffca5b4", "photo-1622290291468-a28f7a7dc6a8"],
        "desc": "Soft, playful and durable — this {n} is made for active little ones, with skin-friendly fabric and easy-care comfort.",
    },
    {
        "name": "Beauty & Grooming",
        "brands": ["Lakme", "Maybelline", "Nivea", "The Body Shop", "Mamaearth"],
        "items": [
            "Matte Liquid Lipstick", "Hydrating Face Serum", "Kajal Eyeliner Pencil",
            "Vitamin C Face Wash", "Compact Powder Makeup", "Beard Grooming Kit",
            "Nourishing Body Lotion", "Eau De Parfum Fragrance", "Eyeshadow Palette",
            "Sunscreen SPF 50 Cream", "Charcoal Face Mask", "Hair Styling Wax",
        ],
        "images": ["photo-1596462502278-27bfdc403348", "photo-1522335789203-aabd1fc54bc9",
                   "photo-1571781926291-c477ebfd024b", "photo-1512496015851-a90fb38ba796",
                   "photo-1556228578-8c89e6adf883", "photo-1620916566398-39f1143ab7be"],
        "desc": "Pamper yourself with this {n} — dermatologically tested, made with quality ingredients for visible, long-lasting results.",
    },
    {
        "name": "Accessories",
        "brands": ["Titan", "Fastrack", "Hidesign", "Fossil", "Ray-Ban"],
        "items": [
            "Analog Wrist Watch", "Aviator Sunglasses", "Leather Crossbody Handbag",
            "Woven Leather Belt", "Canvas Backpack", "Minimalist Tote Bag",
            "Silk Printed Scarf", "Stainless Steel Bracelet", "Classic Leather Wallet",
            "Chronograph Watch", "Wayfarer Sunglasses", "Beaded Necklace Set",
        ],
        "images": ["photo-1523170335258-f5ed11844a49", "photo-1572635196237-14b3f281503f",
                   "photo-1553062407-98eeb64c6a62", "photo-1524805444758-089113d48a6d",
                   "photo-1548036328-c9fa89d128fa", "photo-1611923134239-b9be5816e23c",
                   "photo-1576871337622-98d48d1cf531", "photo-1584917865442-de89df76afd3"],
        "desc": "Complete your look with this {n} — a versatile accessory in premium materials with a timeless design.",
    },
]


async def _insert_catalog(db) -> int:
    """Insert the categories + products. Assumes the tables already exist and
    are empty of catalog data; does NOT touch users or any other table."""
    total = 0
    for spec in CATALOG:
        cat = Category(name=spec["name"])
        db.add(cat)
        await db.flush()
        for item in spec["items"]:
            brand = random.choice(spec["brands"])
            name = f"{brand} {item}"
            db.add(Product(
                name=name,
                description=spec["desc"].format(n=item.lower()),
                brand=brand,
                category_id=cat.id,
                price=round(random.uniform(299, 4999), 2),
                stock=random.randint(0, 80),
                color=color_for(name),
                image_url=image_for(name),  # photo matched to the product name
                popularity_score=round(random.uniform(50, 500), 1),
                is_active=True,
            ))
            total += 1
    await db.commit()
    return total


async def seed():
    """Full reset: drop everything, recreate the schema, reseed the catalog.
    Destructive -- wipes users/carts/etc. Use for a clean start."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as db:
        total = await _insert_catalog(db)
        print(f"Seeded {len(CATALOG)} categories and {total} products.")


async def seed_if_empty() -> int:
    """Non-destructive: insert the catalog only when there are no products yet.
    Safe to call on every startup -- it leaves an already-populated DB (and any
    registered users) untouched, so the storefront is never empty."""
    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(Product).limit(1))
        if existing.scalar_one_or_none() is not None:
            return 0
        total = await _insert_catalog(db)
        print(f"Auto-seeded empty database: {len(CATALOG)} categories, {total} products.")
        return total


DEMO_COUPONS = [
    ("WELCOME15", "percent", 15, 0, "15% off your first order"),
    ("SAVE10", "percent", 10, 500, "10% off on orders above ₹500"),
    ("FLAT200", "flat", 200, 1000, "₹200 off on orders above ₹1000"),
    ("BIGSALE25", "percent", 25, 2000, "25% off on orders above ₹2000"),
]


async def seed_coupons_if_empty() -> int:
    """Insert demo promo codes if none exist yet. Non-destructive."""
    from app.models.coupon import Coupon, DiscountType
    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(Coupon).limit(1))
        if existing.scalar_one_or_none() is not None:
            return 0
        for code, dtype, value, min_amt, desc in DEMO_COUPONS:
            db.add(Coupon(
                code=code, discount_type=DiscountType(dtype), discount_value=value,
                min_order_amount=min_amt, description=desc, is_active=True,
            ))
        await db.commit()
        print(f"Seeded {len(DEMO_COUPONS)} demo coupons.")
        return len(DEMO_COUPONS)


async def update_product_images() -> int:
    """Re-point every existing product's photo to a name-matched image AND set a
    colour, WITHOUT touching users / orders / reviews. Run after changing the
    image/colour rules:
        python -m app.seed images
    """
    async with AsyncSessionLocal() as db:
        products = (await db.execute(select(Product))).scalars().all()
        for p in products:
            p.image_url = image_for(p.name)
            if not getattr(p, "color", None):
                p.color = color_for(p.name)
        await db.commit()
        print(f"Updated images + colours for {len(products)} products.")
        return len(products)


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "images":
        asyncio.run(update_product_images())
    else:
        asyncio.run(seed())
