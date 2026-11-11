from decimal import Decimal
import json
from typing import Any, Optional

from sqlalchemy.orm import Session, joinedload

from app.models import ApplicationSettings, Document, TradingPartner, Transaction
from app.services.assistant import answer_assistant_query_from_db
from app.services.finance import format_inr
from app.services.ollama_client import chat_with_ollama, probe_ollama_health


def _get_ai_settings(db: Session) -> tuple[str, str]:
    cfg = db.query(ApplicationSettings).filter(ApplicationSettings.id == 1).first()
    if cfg:
        return cfg.ollama_endpoint.rstrip("/"), cfg.ollama_model
    return "http://localhost:11434", "qwen2.5:7b"


def _build_sqlite_context(db: Session) -> tuple[str, list[Transaction]]:
    txns = (
        db.query(Transaction)
        .options(joinedload(Transaction.document).joinedload(Document.line_items))
        .order_by(Transaction.transaction_date.desc())
        .all()
    )
    partners = db.query(TradingPartner).all()

    total = len(txns)
    accepted = sum(1 for t in txns if t.status == "Accepted")
    pending = sum(1 for t in txns if t.status in ("Pending", "Processing", "Draft"))
    rejected = sum(1 for t in txns if t.status == "Rejected")
    total_val = sum((t.amount for t in txns), Decimal("0"))

    lines = [
        f"LEDGER SUMMARY: total={total}, accepted={accepted}, pending={pending}, rejected={rejected}, total_inr={format_inr(total_val)}",
        "PARTNERS:",
    ]
    for p in partners:
        rej_cnt = sum(1 for t in txns if t.sender_name == p.name and t.status == "Rejected")
        lines.append(
            f"- {p.name} (role={p.role}, code={p.partner_code}, active={p.active}, rejected_sent={rej_cnt})"
        )

    lines.append("TRANSACTIONS:")
    for t in txns[:30]:
        doc_num = t.document.document_number if t.document else t.transaction_id
        ref_po = t.document.reference_po if t.document and t.document.reference_po else "none"
        err = t.exception_reason or "none"
        lines.append(
            f"- {t.transaction_id} | doc={doc_num} | type={t.document_type} | date={t.transaction_date[:10]} | "
            f"{t.sender_name} -> {t.receiver_name} | amount={format_inr(t.amount)} | "
            f"status={t.status} | ack={t.ack_status} | ref_po={ref_po} | exception={err}"
        )

    return "\n".join(lines), txns


def answer_mis_query(db: Session, question: str) -> dict[str, Any]:
    """
    SQLite-grounded MIS Assistant:
    1. Retrieves factual records from SQLite.
    2. If local Ollama + selected model are connected, sends grounded context to Qwen.
    3. Otherwise transparently returns deterministic SQLite query answer (never fakes an AI response).
    """
    endpoint, selected_model = _get_ai_settings(db)
    det = answer_assistant_query_from_db(db, question)
    health = probe_ollama_health(endpoint, selected_model)

    if health.overall_status != "Connected":
        return {
            "reply": det.reply,
            "engineLabel": f"SQLite Deterministic Engine (Ollama: {health.overall_status})",
            "relatedTransactionIds": det.relatedTransactionIds,
            "ollamaUsed": False,
            "aiStatus": health.overall_status,
            "warning": health.error,
        }

    context_text, txns = _build_sqlite_context(db)
    system_prompt = (
        "You are EDI NEXUS Assistant for an enterprise B2B EDI Management Information System. "
        "Answer strictly from the SQLite database snapshot below. "
        "Do NOT invent transaction IDs, partner names, or rupee amounts. Use ₹ INR formatting. "
        "Keep answers concise, operational, and cite exact transaction IDs.\n\n"
        f"{context_text}"
    )

    content, err = chat_with_ollama(
        endpoint=endpoint,
        model=selected_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question},
        ],
        timeout_sec=20.0,
    )
    if content:
        mentioned = [
            t.transaction_id for t in txns if t.transaction_id.lower() in content.lower()
        ]
        return {
            "reply": content,
            "engineLabel": f"Ollama Local ({selected_model}) + SQLite",
            "relatedTransactionIds": mentioned or det.relatedTransactionIds,
            "ollamaUsed": True,
            "aiStatus": "Connected",
            "warning": None,
        }

    return {
        "reply": det.reply,
        "engineLabel": "SQLite Deterministic Engine (Ollama Fallback)",
        "relatedTransactionIds": det.relatedTransactionIds,
        "ollamaUsed": False,
        "aiStatus": "Unavailable",
        "warning": err,
    }


def explain_transaction_exception(db: Session, txn: Transaction) -> dict[str, Any]:
    """
    Generate concise exception explanation & next steps grounded in SQLite validation checks
    and deterministic PO discrepancy numbers. Never alters invoice records.
    """
    doc = txn.document
    doc_num = doc.document_number if doc else txn.transaction_id
    ref_po = doc.reference_po if doc else None

    matched_po: Optional[Transaction] = None
    if ref_po:
        matched_po = (
            db.query(Transaction)
            .options(joinedload(Transaction.document).joinedload(Document.line_items))
            .join(Document, Document.transaction_pk == Transaction.id)
            .filter(Transaction.document_type == "850", Document.document_number == ref_po)
            .first()
        )

    po_total_str: Optional[str] = format_inr(matched_po.amount) if matched_po else None
    inv_total_str: str = format_inr(txn.amount)
    diff_str: Optional[str] = None
    if matched_po:
        diff_str = format_inr(abs(txn.amount - matched_po.amount))

    if txn.status == "Rejected" and matched_po and matched_po.document and doc:
        diff = txn.amount - matched_po.amount
        po_item = matched_po.document.line_items[0] if matched_po.document.line_items else None
        inv_item = doc.line_items[0] if doc.line_items else None
        rate_note = ""
        if po_item and inv_item and po_item.unit_price != inv_item.unit_price:
            rate_note = (
                f" Line unit price billed at {format_inr(inv_item.unit_price)}/unit "
                f"versus contracted PO price {format_inr(po_item.unit_price)}/unit for {inv_item.quantity} units."
            )
        det_explanation = (
            f"Invoice total: {inv_total_str} | Purchase order total: {po_total_str} | Difference: {format_inr(abs(diff))}. "
            f"{doc_num} failed deterministic 2-way matching against {matched_po.document.document_number}.{rate_note}"
        )
        det_recommendation = (
            f"Hold settlement, verify contracted pricing with {txn.sender_name}, and either reject or adjust unit price "
            f"to {format_inr(po_item.unit_price) if po_item else po_total_str} via 'Correct Figures' before reprocessing."
        )
    elif txn.status == "Rejected":
        det_explanation = (
            f"Validation Exception on {doc_num} ({inv_total_str}): "
            f"{txn.exception_reason or 'One or more deterministic validation rules failed.'}"
        )
        det_recommendation = (
            "Review failed checks in Validation Results, correct line items if confirmed by partner, and click Reprocess."
        )
    elif txn.status == "Pending" and txn.document_type == "850":
        det_explanation = (
            f"Purchase Order {doc_num} ({inv_total_str}) cleared deterministic validation and is awaiting X12 855 acknowledgement from {txn.receiver_name}."
        )
        det_recommendation = (
            "Confirm supplier transmission receipt (997) and record the 855 Order Acknowledgement once received."
        )
    else:
        det_explanation = (
            f"Document {doc_num} ({inv_total_str}) between {txn.sender_name} and {txn.receiver_name} passed deterministic validation ({txn.status})."
        )
        det_recommendation = "No corrective action required; audit trail complete."

    endpoint, selected_model = _get_ai_settings(db)
    health = probe_ollama_health(endpoint, selected_model)
    if health.overall_status == "Connected":
        facts = {
            "transactionId": txn.transaction_id,
            "documentNumber": doc_num,
            "documentType": txn.document_type,
            "sender": txn.sender_name,
            "receiver": txn.receiver_name,
            "invoiceOrDocTotalInr": inv_total_str,
            "referencePo": ref_po,
            "purchaseOrderTotalInr": po_total_str,
            "differenceInr": diff_str,
            "status": txn.status,
            "exceptionReason": txn.exception_reason,
            "validationChecks": [
                {"rule": v.rule_code, "status": v.status, "detail": v.detail}
                for v in txn.validation_results
            ],
        }
        prompt = (
            "Explain this EDI transaction status or validation exception using ONLY the JSON facts provided. "
            "Do NOT modify or suggest fabricating amounts. Return JSON with keys 'explanation' and 'recommendation'.\n\n"
            f"{json.dumps(facts)}"
        )
        raw, err = chat_with_ollama(
            endpoint=endpoint,
            model=selected_model,
            messages=[{"role": "user", "content": prompt}],
            timeout_sec=20.0,
            json_mode=True,
        )
        if raw:
            try:
                parsed = json.loads(raw)
                if parsed.get("explanation") and parsed.get("recommendation"):
                    return {
                        "explanation": str(parsed["explanation"]),
                        "recommendation": str(parsed["recommendation"]),
                        "engineLabel": f"Ollama Local ({selected_model})",
                        "ollamaUsed": True,
                        "invoiceTotal": inv_total_str,
                        "purchaseOrderTotal": po_total_str,
                        "difference": diff_str,
                    }
            except json.JSONDecodeError:
                pass

    return {
        "explanation": det_explanation,
        "recommendation": det_recommendation,
        "engineLabel": f"Deterministic Advisory Engine (Ollama: {health.overall_status})",
        "ollamaUsed": False,
        "invoiceTotal": inv_total_str,
        "purchaseOrderTotal": po_total_str,
        "difference": diff_str,
    }

