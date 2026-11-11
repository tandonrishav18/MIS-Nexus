from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Document, TradingPartner, Transaction
from app.services.finance import format_inr
from app.services.serializers import serialize_transaction

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


def _load_scoped_txns(
    db: Session,
    partner: Optional[str] = None,
    q: Optional[str] = None,
) -> list[Transaction]:
    txns = (
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
    res: list[Transaction] = []
    q_low = (q or "").strip().lower()
    for t in txns:
        if partner and partner != "ALL":
            if t.sender_name != partner and t.receiver_name != partner:
                continue
        if q_low:
            doc_num = t.document.document_number.lower() if t.document else ""
            summary = t.document.summary.lower() if t.document else ""
            if not (
                q_low in t.transaction_id.lower()
                or q_low in doc_num
                or q_low in t.sender_name.lower()
                or q_low in t.receiver_name.lower()
                or q_low in summary
            ):
                continue
        res.append(t)
    return res


@router.get("/summary")
def get_dashboard_summary(
    partner: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    txns = _load_scoped_txns(db, partner, q)
    total = len(txns)
    accepted = sum(1 for t in txns if t.status == "Accepted")
    pending = sum(1 for t in txns if t.status in ("Pending", "Processing", "Draft"))
    rejected = sum(1 for t in txns if t.status == "Rejected")
    total_vol = sum((t.amount for t in txns), Decimal("0"))
    acceptance_rate = round((accepted / total) * 100) if total else 0

    pending_alerts = [
        serialize_transaction(t)
        for t in txns
        if t.ack_status == "Awaiting Ack" or t.status == "Pending"
    ]

    rejected_invoices = [
        t for t in txns if t.document_type == "810" and t.status == "Rejected"
    ]
    pending_pos = [
        t
        for t in txns
        if t.document_type == "850"
        and (t.ack_status == "Awaiting Ack" or t.status == "Pending")
    ]

    insights: list[dict] = []
    if rejected_invoices:
        m = rejected_invoices[0]
        doc_num = m.document.document_number if m.document else m.transaction_id
        ref_po = m.document.reference_po if m.document and m.document.reference_po else "referenced PO"
        insights.append(
            {
                "id": "ins-mismatch",
                "category": "Exception",
                "severity": "danger",
                "title": f"PO-Invoice Variance Flagged on {doc_num}",
                "detail": (
                    f"{m.sender_name} submitted {format_inr(m.amount)} against {ref_po}. "
                    f"{m.exception_reason or 'Review variance before AP release.'}"
                ),
                "actionLabel": "Inspect Exception",
                "targetPath": f"/processing/{m.transaction_id}",
            }
        )

    if pending_pos:
        p_sum = sum((p.amount for p in pending_pos), Decimal("0"))
        insights.append(
            {
                "id": "ins-pending-ack",
                "category": "Partner SLA",
                "severity": "warning",
                "title": f"{len(pending_pos)} Purchase Order(s) Awaiting 855 Acknowledgement",
                "detail": f"{format_inr(p_sum)} in open procurement orders has not yet received supplier 855 confirmation.",
                "actionLabel": "Review Pending POs",
                "targetPath": "/transactions?status=Pending",
            }
        )

    insights.append(
        {
            "id": "ins-compliance",
            "category": "Compliance",
            "severity": "success",
            "title": f"{acceptance_rate}% Straight-Through EDI Acceptance Rate",
            "detail": f"{accepted} of {total} ANSI X12 documents cleared deterministic validation across SQLite records.",
            "actionLabel": "Open Analytics",
            "targetPath": "/reports",
        }
    )

    partners = db.query(TradingPartner).all()
    partner_activity = []
    for p in partners:
        sent = [t for t in txns if t.sender_name == p.name]
        rec = [t for t in txns if t.receiver_name == p.name]
        involved = sent + rec
        rej_cnt = sum(1 for t in sent if t.status == "Rejected")
        partner_activity.append(
            {
                "partnerName": p.name,
                "role": p.role,
                "partnerCode": p.partner_code,
                "sentCount": len(sent),
                "receivedCount": len(rec),
                "acceptedCount": sum(1 for t in involved if t.status == "Accepted"),
                "rejectedCount": rej_cnt,
                "errorCount": rej_cnt,
                "totalValue": float(sum((t.amount for t in involved), Decimal("0"))),
                "active": p.active,
            }
        )

    return {
        "totalTransactions": total,
        "acceptedDocuments": accepted,
        "pendingTransactions": pending,
        "rejectedDocuments": rejected,
        "totalVolumeAmount": float(total_vol),
        "acceptanceRate": acceptance_rate,
        "pendingAlerts": pending_alerts,
        "insights": insights,
        "partnerActivity": partner_activity,
    }


@router.get("/trends")
def get_dashboard_trends(
    partner: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    txns = _load_scoped_txns(db, partner, q)
    txns_asc = sorted(txns, key=lambda t: t.transaction_date)
    buckets: dict[str, dict] = defaultdict(
        lambda: {"accepted": 0, "exceptions": 0, "total": 0, "value": Decimal("0")}
    )

    for t in txns_asc:
        try:
            dt = datetime.fromisoformat(t.transaction_date.replace("Z", "+00:00"))
            label = dt.strftime("%d %b")
        except ValueError:
            label = t.transaction_date[:10]
        b = buckets[label]
        b["total"] += 1
        b["value"] += t.amount
        if t.status == "Accepted":
            b["accepted"] += 1
        elif t.status in ("Rejected", "Pending", "Processing"):
            b["exceptions"] += 1

    return [
        {
            "dateLabel": label,
            "total": stats["total"],
            "accepted": stats["accepted"],
            "exceptions": stats["exceptions"],
            "valueLakhs": float(round(stats["value"] / Decimal("100000"), 1)),
        }
        for label, stats in buckets.items()
    ]


@router.get("/document-distribution")
def get_document_distribution(
    partner: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    txns = _load_scoped_txns(db, partner, q)
    total = len(txns) or 1
    meta = {
        "850": "850 · Purchase Order",
        "855": "855 · Order Acknowledgement",
        "810": "810 · Invoice",
        "856": "856 · Advance Shipping Notice",
    }
    return [
        {
            "code": code,
            "label": label,
            "count": (cnt := sum(1 for t in txns if t.document_type == code)),
            "sharePct": round((cnt / total) * 100),
        }
        for code, label in meta.items()
    ]

