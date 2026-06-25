"""
Streaming CSV export: yields one CSV row at a time as the DB cursor
advances, so a 10,000+ row export never holds the full result set in
memory -- FastAPI's StreamingResponse pulls from this generator and
flushes to the client incrementally.

PDF receipts: generated on-demand per transaction (not pre-rendered and
stored) with reportlab, containing the unique invoice number and
timestamp -- this also means a price/legal-detail correction never leaves
stale PDFs lying around since every download re-renders from current DB
state.
"""
import csv
import io
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from app.models.user import utcnow
from app.services.transaction_service import stream_transactions_for_export


async def csv_export_generator(db, user_id: int, **filters):
    header = ["invoice_number", "order_id", "payment_mode", "amount", "currency", "status", "created_at"]
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(header)
    yield buf.getvalue()
    buf.seek(0)
    buf.truncate(0)

    async for txn in stream_transactions_for_export(db, user_id, **filters):
        writer.writerow([
            txn.invoice_number, txn.order_id, txn.payment_mode,
            str(txn.amount), txn.currency, txn.status.value,
            txn.created_at.isoformat(),
        ])
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)


def generate_receipt_pdf(transaction) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4

    c.setFont("Helvetica-Bold", 18)
    c.drawString(50, height - 60, "Payment Receipt")

    c.setFont("Helvetica", 11)
    y = height - 110
    lines = [
        f"Invoice Number: {transaction.invoice_number}",
        f"Order ID: {transaction.order_id}",
        f"Date/Time: {transaction.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')}",
        f"Payment Mode: {transaction.payment_mode}",
        f"Amount: {transaction.currency} {transaction.amount}",
        f"Status: {transaction.status.value.upper()}",
        "",
        f"Generated: {utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}",
    ]
    for line in lines:
        c.drawString(50, y, line)
        y -= 22

    c.setFont("Helvetica-Oblique", 9)
    c.drawString(50, 40, "This is a system-generated receipt and does not require a signature.")

    c.showPage()
    c.save()
    buf.seek(0)
    return buf.read()
