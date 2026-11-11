from collections import defaultdict
import csv
from datetime import datetime
from decimal import Decimal
import io
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Document, TradingPartner, Transaction
from app.services.serializers import serialize_transaction

router = APIRouter(prefix="/api/reports", tags=["Reports"])


def _filter_by_dates(
    txns: list[Transaction],
    from_date: Optional[str],
    to_date: Optional[str],
) -> list[Transaction]:
    result = []
    for t in txns:
        d = t.transaction_date[:10]
        if from_date and d < from_date:
            continue
        if to_date and d > to_date:
            continue
        result.append(t)
    return result


def _load_all_txns(db: Session) -> list[Transaction]:
    return (
        db.query(Transaction)
        .options(
            joinedload(Transaction.document).joinedload(Document.line_items),
            joinedload(Transaction.validation_results),
            joinedload(Transaction.processing_events),
            joinedload(Transaction.acknowledgement),
        )
        .order_by(Transaction.transaction_date.desc())
        .all()
    )


@router.get("/summary")
def get_reports_summary(
    from_date: Optional[str] = Query(default=None),
    to_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    txns = _filter_by_dates(_load_all_txns(db), from_date, to_date)
    total = len(txns)
    accepted = sum(1 for t in txns if t.status == "Accepted")
    pending = sum(1 for t in txns if t.status in ("Pending", "Processing", "Draft"))
    rejected = sum(1 for t in txns if t.status == "Rejected")
    total_val = sum((t.amount for t in txns), Decimal("0"))
    acceptance_rate = round((accepted / total) * 100) if total else 0

    # Daily volume trend
    txns_asc = sorted(txns, key=lambda t: t.transaction_date)
    buckets: dict[str, dict] = defaultdict(
        lambda: {"accepted": 0, "exceptions": 0, "total": 0, "value": Decimal("0")}
    )
    for t in txns_asc:
        try:
            label = datetime.fromisoformat(t.transaction_date.replace("Z", "+00:00")).strftime("%d %b")
        except ValueError:
            label = t.transaction_date[:10]
        b = buckets[label]
        b["total"] += 1
        b["value"] += t.amount
        if t.status == "Accepted":
            b["accepted"] += 1
        else:
            b["exceptions"] += 1

    volume_trend = [
        {
            "dateLabel": lbl,
            "total": st["total"],
            "accepted": st["accepted"],
            "exceptions": st["exceptions"],
            "valueLakhs": float(round(st["value"] / Decimal("100000"), 1)),
        }
        for lbl, st in buckets.items()
    ]

    denom = total or 1
    doc_dist = [
        {
            "code": code,
            "label": lbl,
            "count": (cnt := sum(1 for t in txns if t.document_type == code)),
            "sharePct": round((cnt / denom) * 100),
        }
        for code, lbl in [
            ("850", "850 · Purchase Order"),
            ("855", "855 · Order Acknowledgement"),
            ("810", "810 · Invoice"),
            ("856", "856 · Advance Shipping Notice"),
        ]
    ]

    return {
        "totalTransactions": total,
        "acceptedDocuments": accepted,
        "pendingTransactions": pending,
        "rejectedDocuments": rejected,
        "totalVolumeAmount": float(total_val),
        "acceptanceRate": acceptance_rate,
        "volumeTrend": volume_trend,
        "docDistribution": doc_dist,
    }


@router.get("/partners")
def get_reports_partners(
    from_date: Optional[str] = Query(default=None),
    to_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    txns = _filter_by_dates(_load_all_txns(db), from_date, to_date)
    partners = db.query(TradingPartner).order_by(TradingPartner.id).all()
    rows = []
    for p in partners:
        sent = [t for t in txns if t.sender_name == p.name]
        rec = [t for t in txns if t.receiver_name == p.name]
        involved = sent + rec
        rej = sum(1 for t in sent if t.status == "Rejected")
        rows.append(
            {
                "partnerName": p.name,
                "role": p.role,
                "partnerCode": p.partner_code,
                "sentCount": len(sent),
                "receivedCount": len(rec),
                "acceptedCount": sum(1 for t in involved if t.status == "Accepted"),
                "rejectedCount": rej,
                "errorCount": rej,
                "totalValue": float(sum((t.amount for t in involved), Decimal("0"))),
                "active": p.active,
            }
        )
    return rows


@router.get("/exceptions")
def get_reports_exceptions(
    from_date: Optional[str] = Query(default=None),
    to_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    txns = _filter_by_dates(_load_all_txns(db), from_date, to_date)
    flagged = [t for t in txns if t.status == "Rejected" or bool(t.exception_reason)]
    return [serialize_transaction(t) for t in flagged]


@router.get("/export")
def export_reports_csv(
    from_date: Optional[str] = Query(default=None),
    to_date: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    doc_type: Optional[str] = Query(default=None),
    partner: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    txns = _filter_by_dates(_load_all_txns(db), from_date, to_date)
    q_low = (search or "").strip().lower()
    filtered = []
    for t in txns:
        if status_filter and status_filter != "ALL" and t.status != status_filter:
            continue
        if doc_type and doc_type != "ALL" and t.document_type != doc_type:
            continue
        if partner and partner != "ALL" and t.sender_name != partner and t.receiver_name != partner:
            continue
        if q_low:
            doc_num = t.document.document_number.lower() if t.document else ""
            if not (
                q_low in t.transaction_id.lower()
                or q_low in doc_num
                or q_low in t.sender_name.lower()
                or q_low in t.receiver_name.lower()
            ):
                continue
        filtered.append(t)

    buf = io.StringIO()
    buf.write("\ufeff")
    writer = csv.writer(buf)
    writer.writerow(
        [
            "Transaction ID",
            "Document Number",
            "Document Type",
            "Sender",
            "Receiver",
            "Date",
            "Subtotal (INR)",
            "Tax (INR)",
            "Total (INR)",
            "Status",
            "Ack Status",
            "Reference PO",
            "Exception Detail",
        ]
    )
    for t in filtered:
        doc = t.document
        writer.writerow(
            [
                t.transaction_id,
                doc.document_number if doc else t.transaction_id,
                t.document_type,
                t.sender_name,
                t.receiver_name,
                t.transaction_date[:10],
                str(doc.subtotal if doc else t.amount),
                str(doc.tax_amount if doc else "0.00"),
                str(t.amount),
                t.status,
                t.ack_status,
                doc.reference_po if doc and doc.reference_po else "",
                t.exception_reason or "",
            ]
        )

    buf.seek(0)
    filename = f"edi-nexus-report-{datetime.now().strftime('%Y-%m-%d')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

