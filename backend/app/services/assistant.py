from decimal import Decimal
from sqlalchemy.orm import Session, joinedload

from app.models import TradingPartner, Transaction
from app.schemas import AssistantQueryOut
from app.services.finance import format_inr


def answer_assistant_query_from_db(db: Session, question: str) -> AssistantQueryOut:
    """Phase 3 deterministic MIS query engine executed directly against SQLite."""
    q = question.strip().lower()
    txns = (
        db.query(Transaction)
        .options(joinedload(Transaction.document))
        .order_by(Transaction.transaction_date.desc())
        .all()
    )
    partners = db.query(TradingPartner).all()
    engine_label = "SQLite Deterministic MIS Engine (Phase 3)"

    # 1. Direct Transaction ID or Document Number match
    for t in txns:
        doc_num = t.document.document_number if t.document else ""
        if t.transaction_id.lower() in q or (doc_num and doc_num.lower() in q):
            issue = f" Exception detail: {t.exception_reason}" if t.exception_reason else ""
            po_ref = (
                f" (refers to {t.document.reference_po})"
                if t.document and t.document.reference_po
                else ""
            )
            return AssistantQueryOut(
                reply=(
                    f"{t.transaction_id} ({doc_num}, X12 {t.document_type}) "
                    f"is currently {t.status.upper()} · Ack: {t.ack_status}. "
                    f"Route: {t.sender_name} → {t.receiver_name}. "
                    f"Amount: {format_inr(t.amount)}{po_ref}.{issue}"
                ),
                engineLabel=engine_label,
                relatedTransactionIds=[t.transaction_id],
            )

    # 2. Pending / awaiting acknowledgement
    if any(k in q for k in ("pending", "awaiting", "acknowledg")):
        pending = [t for t in txns if t.status in ("Pending", "Processing", "Draft")]
        if not pending:
            return AssistantQueryOut(
                reply="There are currently 0 pending transactions in the SQLite ledger.",
                engineLabel=engine_label,
                relatedTransactionIds=[],
            )
        total_amt = sum((t.amount for t in pending), Decimal("0"))
        lines = [
            f"• {t.transaction_id} ({t.document.document_number if t.document else t.transaction_id}) — "
            f"{t.sender_name} → {t.receiver_name}, {format_inr(t.amount)} [{t.ack_status}]"
            for t in pending
        ]
        return AssistantQueryOut(
            reply=(
                f"There are {len(pending)} pending transaction(s) in SQLite totaling {format_inr(total_amt)}:\n"
                + "\n".join(lines)
            ),
            engineLabel=engine_label,
            relatedTransactionIds=[t.transaction_id for t in pending],
        )

    # 2b. Human review queue
    if any(k in q for k in ("human review", "review", "action required", "flagged")):
        needs_review = [
            t
            for t in txns
            if t.status in ("Rejected", "Pending", "Processing")
        ]
        if not needs_review:
            return AssistantQueryOut(
                reply="No documents currently require human review; all ledger entries are settled or accepted.",
                engineLabel=engine_label,
                relatedTransactionIds=[],
            )
        lines = [
            f"• {t.transactionId if hasattr(t, 'transactionId') else t.transaction_id} "
            f"({t.document.document_number if t.document else ''}) [{t.status}] — "
            f"{t.exception_reason or (t.document.summary if t.document else '')}"
            for t in needs_review
        ]
        return AssistantQueryOut(
            reply=(
                f"{len(needs_review)} document(s) currently require operator review or acknowledgement follow-up:\n"
                + "\n".join(lines)
            ),
            engineLabel=engine_label,
            relatedTransactionIds=[t.transaction_id for t in needs_review],
        )

    # 3. Invoice discrepancies / rejected invoices
    if any(k in q for k in ("discrepanc", "mismatch", "invoice", "why", "810")):
        flagged = [
            t
            for t in txns
            if t.document_type == "810" and (t.status == "Rejected" or bool(t.exception_reason))
        ]
        if not flagged:
            return AssistantQueryOut(
                reply="All 810 invoices in the database match their referenced purchase orders without active exceptions.",
                engineLabel=engine_label,
                relatedTransactionIds=[],
            )
        lines = [
            f"• {t.transaction_id} ({t.document.document_number if t.document else t.transaction_id}) "
            f"from {t.sender_name}: {format_inr(t.amount)} — "
            f"{t.exception_reason or (t.document.summary if t.document else '')}"
            for t in flagged
        ]
        return AssistantQueryOut(
            reply=(
                f"Found {len(flagged)} invoice(s) with validation exceptions or PO discrepancies:\n"
                + "\n".join(lines)
                + "\nRecommended action: Open Document Processing to compare PO vs Invoice figures and either reject or correct & reprocess."
            ),
            engineLabel=engine_label,
            relatedTransactionIds=[t.transaction_id for t in flagged],
        )

    # 4. Partner rejection ranking
    if any(k in q for k in ("partner", "most reject", "error", "supplier")):
        counts = []
        for p in partners:
            rej = [t for t in txns if t.sender_name == p.name and t.status == "Rejected"]
            counts.append((p, rej))
        counts.sort(key=lambda pair: len(pair[1]), reverse=True)
        if not counts or len(counts[0][1]) == 0:
            return AssistantQueryOut(
                reply="No trading partner currently has rejected documents in the database.",
                engineLabel=engine_label,
                relatedTransactionIds=[],
            )
        top_p, top_txns = counts[0]
        summary_lines = [
            f"• {p.name} ({p.role}): {len(rej)} rejected document(s) — "
            + ", ".join(t.document.document_number if t.document else t.transaction_id for t in rej)
            for p, rej in counts
            if len(rej) > 0
        ]
        return AssistantQueryOut(
            reply=(
                f"{top_p.name} currently has the highest rejected document count ({len(top_txns)}):\n"
                + "\n".join(summary_lines)
            ),
            engineLabel=engine_label,
            relatedTransactionIds=[t.transaction_id for t in top_txns],
        )

    # 5. Summary fallback
    total = len(txns)
    accepted = sum(1 for t in txns if t.status == "Accepted")
    pending_cnt = sum(1 for t in txns if t.status in ("Pending", "Processing", "Draft"))
    rejected_cnt = sum(1 for t in txns if t.status == "Rejected")
    total_val = sum((t.amount for t in txns), Decimal("0"))
    active_partners = sum(1 for p in partners if p.active)
    latest = txns[:3]

    return AssistantQueryOut(
        reply=(
            f"Active SQLite EDI Summary across {total} transactions ({format_inr(total_val)} total value) "
            f"and {active_partners} active trading partners:\n"
            f"• Accepted: {accepted} ({round((accepted / total) * 100) if total else 0}%)\n"
            f"• Pending / In Progress: {pending_cnt}\n"
            f"• Rejected / Exceptions: {rejected_cnt}\n"
            f"Most recent records:\n"
            + "\n".join(
                f"• {t.transaction_id} ({t.document_type} · {t.document.document_number if t.document else ''}): "
                f"{t.sender_name} → {t.receiver_name}, {format_inr(t.amount)} [{t.status}]"
                for t in latest
            )
        ),
        engineLabel=engine_label,
        relatedTransactionIds=[t.transaction_id for t in latest],
    )

