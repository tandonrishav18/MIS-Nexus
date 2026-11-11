from datetime import datetime, timezone
from decimal import Decimal
import re
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.models import (
    Acknowledgement,
    Document,
    DocumentLineItem,
    EdiMappingRule,
    ProcessingEvent,
    TradingPartner,
    Transaction,
    ValidationResult,
)
from app.schemas import DocumentCreateIn, LineItemIn, TransactionUpdateIn
from app.services.edi_engine import generate_x12_payload
from app.services.finance import calculate_document_totals, calculate_line_total, format_inr, quantize_money
from app.services.validator import ValidationOutcome, validate_transaction_deterministic


def now_iso_ist() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def get_transaction_or_404(db: Session, identifier: str) -> Transaction:
    query = db.query(Transaction).options(
        joinedload(Transaction.document).joinedload(Document.line_items),
        joinedload(Transaction.validation_results),
        joinedload(Transaction.processing_events),
        joinedload(Transaction.acknowledgement),
    )
    txn = query.filter(Transaction.transaction_id == identifier).first()
    if not txn and identifier.isdigit():
        txn = query.filter(Transaction.id == int(identifier)).first()
    if not txn:
        doc = db.query(Document).filter(Document.document_number == identifier).first()
        if doc:
            txn = query.filter(Transaction.id == doc.transaction_pk).first()
    if not txn:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction or document '{identifier}' not found.",
        )
    return txn


def generate_next_txn_id(db: Session) -> str:
    existing = db.query(Transaction.transaction_id).all()
    max_num = 1014
    for (tid,) in existing:
        m = re.search(r"TXN-\d{4}-(\d+)", tid)
        if m:
            max_num = max(max_num, int(m.group(1)))
    return f"TXN-2026-{max_num + 1}"


def _replace_validation_results(db: Session, txn: Transaction, outcome: ValidationOutcome) -> None:
    db.query(ValidationResult).filter(ValidationResult.transaction_pk == txn.id).delete()
    for chk in outcome.checks:
        db.add(
            ValidationResult(
                transaction_pk=txn.id,
                rule_code=chk.rule_code,
                label=chk.label,
                status=chk.status,
                detail=chk.detail,
            )
        )


def _add_event(
    db: Session,
    txn: Transaction,
    step: str,
    actor: str,
    event_status: str,
    note: str,
) -> None:
    db.add(
        ProcessingEvent(
            transaction_pk=txn.id,
            timestamp=now_iso_ist(),
            step=step,
            actor=actor,
            status=event_status,
            note=note,
        )
    )


def create_document_transaction(db: Session, payload: DocumentCreateIn) -> Transaction:
    if payload.sender == payload.receiver:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Sender and receiver trading partners must be distinct.",
        )

    sender_p = db.query(TradingPartner).filter(TradingPartner.name == payload.sender).first()
    receiver_p = db.query(TradingPartner).filter(TradingPartner.name == payload.receiver).first()
    if not sender_p or not receiver_p:
        missing = payload.sender if not sender_p else payload.receiver
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown trading partner '{missing}'. Register sender and receiver before creating documents.",
        )

    doc_num = payload.documentNumber.strip()
    existing_doc = db.query(Document).filter(Document.document_number == doc_num).first()
    if existing_doc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Document number '{doc_num}' already exists in ledger.",
        )

    subtotal, tax_amount, grand_total = calculate_document_totals(
        [(li.quantity, li.unitPrice) for li in payload.lineItems],
        payload.taxRatePct,
    )
    if payload.declaredTotal is not None and quantize_money(payload.declaredTotal) != grand_total:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Declared document total ({format_inr(quantize_money(payload.declaredTotal))}) "
                f"does not match computed Decimal subtotal + tax ({format_inr(grand_total)})."
            ),
        )

    txn_date = (
        payload.documentDate
        if "T" in payload.documentDate
        else f"{payload.documentDate}T{datetime.now().strftime('%H:%M:%S')}+05:30"
    )
    txn_id = generate_next_txn_id(db)

    txn = Transaction(
        transaction_id=txn_id,
        document_type=payload.documentType,
        sender_partner_id=sender_p.id if sender_p else None,
        receiver_partner_id=receiver_p.id if receiver_p else None,
        sender_name=payload.sender,
        receiver_name=payload.receiver,
        transaction_date=txn_date,
        amount=grand_total,
        status="Draft",
        ack_status="Not Required",
        is_demo_seed=False,
    )
    db.add(txn)
    db.flush()

    doc_labels = {
        "850": "Purchase Order",
        "855": "Order Acknowledgement",
        "810": "Invoice",
        "856": "Advance Shipping Notice",
    }
    doc_summary = (
        payload.summary.strip()
        or f"{doc_labels.get(payload.documentType, 'EDI Document')} for {payload.lineItems[0].description}"
    )

    doc = Document(
        transaction_pk=txn.id,
        document_number=payload.documentNumber.strip(),
        document_type=payload.documentType,
        document_date=txn_date,
        reference_po=(payload.referencePo or "").strip() or None,
        subtotal=subtotal,
        tax_rate_pct=quantize_money(payload.taxRatePct),
        tax_amount=tax_amount,
        grand_total=grand_total,
        summary=doc_summary,
        edi_payload="",
        supplier_receipt_simulated=False,
    )
    db.add(doc)
    db.flush()

    for idx, item in enumerate(payload.lineItems, start=1):
        line_total = calculate_line_total(item.quantity, item.unitPrice)
        db.add(
            DocumentLineItem(
                document_id=doc.id,
                line_number=idx,
                sku=item.sku.strip(),
                description=item.description.strip(),
                quantity=item.quantity,
                unit_price=quantize_money(item.unitPrice),
                line_total=line_total,
            )
        )
    db.flush()
    db.refresh(txn)

    _add_event(
        db,
        txn,
        "Saved as Draft" if payload.mode == "draft" else "Document Created",
        payload.sender,
        "completed",
        f"{doc.document_number} registered for {format_inr(grand_total)}.",
    )

    if payload.mode == "submit":
        partners = db.query(TradingPartner).all()
        rules = db.query(EdiMappingRule).all()
        outcome = validate_transaction_deterministic(db, txn)
        _replace_validation_results(db, txn, outcome)
        doc.edi_payload = generate_x12_payload(txn, partners, rules)

        if not outcome.passed:
            txn.status = "Rejected"
            txn.ack_status = "Exception"
            txn.exception_reason = outcome.exception_reason
            _add_event(
                db,
                txn,
                "Deterministic Validation Failed",
                "Validation Engine",
                "error",
                outcome.exception_reason or "One or more validation checks failed.",
            )
        elif txn.document_type == "850":
            txn.status = "Pending"
            txn.ack_status = "Awaiting Ack"
            _add_event(
                db,
                txn,
                "Deterministic Validation Passed",
                "Validation Engine",
                "completed",
                "All X12 850 fields and Decimal totals reconciled.",
            )
            _add_event(
                db,
                txn,
                "ANSI X12 850 Generated",
                "EDI Translator",
                "completed",
                "Generated outbound 850 interchange; awaiting supplier 855 acknowledgement.",
            )
        else:
            txn.status = "Accepted"
            txn.ack_status = "Acknowledged"
            _add_event(
                db,
                txn,
                "Deterministic Validation & PO Match Passed",
                "Validation Engine",
                "completed",
                "All invoice checks and PO amount reconciliation passed.",
            )
            _add_event(
                db,
                txn,
                f"ANSI X12 {txn.document_type} Accepted",
                "EDI Gateway",
                "completed",
                "Document cleared for enterprise ledger posting.",
            )

    db.commit()
    return get_transaction_or_404(db, txn.transaction_id)


def update_transaction_figures(
    db: Session, identifier: str, payload: TransactionUpdateIn
) -> Transaction:
    txn = get_transaction_or_404(db, identifier)
    doc = txn.document
    if not doc:
        raise HTTPException(status_code=404, detail="Document payload missing")

    if payload.summary is not None:
        doc.summary = payload.summary.strip()
    if payload.reviewerNotes is not None:
        txn.reviewer_notes = payload.reviewerNotes.strip()

    if payload.lineItems is not None:
        if txn.status == "Accepted":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Accepted transactions are settled and cannot have financial line items modified directly.",
            )
        tax_rate = (
            payload.taxRatePct if payload.taxRatePct is not None else doc.tax_rate_pct
        )
        subtotal, tax_amount, grand_total = calculate_document_totals(
            [(li.quantity, li.unitPrice) for li in payload.lineItems],
            tax_rate,
        )
        db.query(DocumentLineItem).filter(DocumentLineItem.document_id == doc.id).delete()
        for idx, item in enumerate(payload.lineItems, start=1):
            db.add(
                DocumentLineItem(
                    document_id=doc.id,
                    line_number=idx,
                    sku=item.sku.strip(),
                    description=item.description.strip(),
                    quantity=item.quantity,
                    unit_price=quantize_money(item.unitPrice),
                    line_total=calculate_line_total(item.quantity, item.unitPrice),
                )
            )
        doc.tax_rate_pct = quantize_money(tax_rate)
        doc.subtotal = subtotal
        doc.tax_amount = tax_amount
        doc.grand_total = grand_total
        txn.amount = grand_total
        txn.status = "Processing"

        db.flush()
        db.refresh(doc)
        partners = db.query(TradingPartner).all()
        rules = db.query(EdiMappingRule).all()
        doc.edi_payload = generate_x12_payload(txn, partners, rules)

        _add_event(
            db,
            txn,
            "Document Corrected for Reprocessing",
            "Arjun Mehta (Ops Lead)",
            "info",
            f"{txn.reviewer_notes or 'Updated line-item figures'} — new total {format_inr(grand_total)}.",
        )

    db.commit()
    return get_transaction_or_404(db, txn.transaction_id)


def validate_in_db(db: Session, identifier: str) -> Transaction:
    txn = get_transaction_or_404(db, identifier)
    outcome = validate_transaction_deterministic(db, txn)
    _replace_validation_results(db, txn, outcome)
    txn.exception_reason = None if outcome.passed else outcome.exception_reason
    _add_event(
        db,
        txn,
        "Validation Passed" if outcome.passed else "Validation Exception Detected",
        "Validation Engine",
        "completed" if outcome.passed else "error",
        "All deterministic checks passed."
        if outcome.passed
        else (outcome.exception_reason or "Validation check failure."),
    )
    db.commit()
    return get_transaction_or_404(db, txn.transaction_id)


def generate_edi_in_db(db: Session, identifier: str) -> Transaction:
    txn = get_transaction_or_404(db, identifier)
    if not txn.document:
        raise HTTPException(status_code=404, detail="Document not found")
    partners = db.query(TradingPartner).all()
    rules = db.query(EdiMappingRule).all()
    txn.document.edi_payload = generate_x12_payload(txn, partners, rules)
    _add_event(
        db,
        txn,
        f"ANSI X12 {txn.document_type} Generated",
        "EDI Translator",
        "completed",
        f"Regenerated X12 {txn.document_type} interchange using active SQLite mapping rules.",
    )
    db.commit()
    return get_transaction_or_404(db, txn.transaction_id)


def simulate_receipt_in_db(db: Session, identifier: str) -> Transaction:
    txn = get_transaction_or_404(db, identifier)
    if txn.document_type != "850":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Supplier receipt confirmation applies only to outbound X12 850 Purchase Orders.",
        )
    if txn.status in ("Draft", "Rejected"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot confirm supplier receipt for a {txn.status} Purchase Order.",
        )
    if txn.document:
        txn.document.supplier_receipt_simulated = True
    _add_event(
        db,
        txn,
        "Supplier Receipt Confirmed",
        txn.receiver_name,
        "info",
        f"{txn.receiver_name} EDI endpoint confirmed transmission receipt (997 Functional Ack).",
    )
    db.commit()
    return get_transaction_or_404(db, txn.transaction_id)


def simulate_ack_855_in_db(db: Session, identifier: str) -> dict:
    po = get_transaction_or_404(db, identifier)
    if po.document_type != "850" or not po.document:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="EDI 855 acknowledgement can only be simulated for X12 850 Purchase Orders.",
        )
    if po.status in ("Draft", "Rejected"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot generate EDI 855 acknowledgement for a {po.status} Purchase Order.",
        )
    if po.ack_status == "Acknowledged":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Purchase Order is already acknowledged via EDI 855.",
        )

    ack_doc_num = f"POA-{po.receiver_name[:3].upper()}-{po.document.document_number[-4:]}"
    ack_txn_id = generate_next_txn_id(db)
    now_str = now_iso_ist()

    receiver_p = db.query(TradingPartner).filter(TradingPartner.name == po.receiver_name).first()
    sender_p = db.query(TradingPartner).filter(TradingPartner.name == po.sender_name).first()

    ack_txn = Transaction(
        transaction_id=ack_txn_id,
        document_type="855",
        sender_partner_id=receiver_p.id if receiver_p else None,
        receiver_partner_id=sender_p.id if sender_p else None,
        sender_name=po.receiver_name,
        receiver_name=po.sender_name,
        transaction_date=now_str,
        amount=po.amount,
        status="Accepted",
        ack_status="Acknowledged",
        is_demo_seed=False,
    )
    db.add(ack_txn)
    db.flush()

    ack_doc = Document(
        transaction_pk=ack_txn.id,
        document_number=ack_doc_num,
        document_type="855",
        document_date=now_str,
        reference_po=po.document.document_number,
        subtotal=po.document.subtotal,
        tax_rate_pct=po.document.tax_rate_pct,
        tax_amount=po.document.tax_amount,
        grand_total=po.document.grand_total,
        summary=f"Order acknowledgement confirming {po.document.document_number} ({format_inr(po.amount)})",
        edi_payload="",
        supplier_receipt_simulated=True,
    )
    db.add(ack_doc)
    db.flush()

    for idx, item in enumerate(po.document.line_items, start=1):
        db.add(
            DocumentLineItem(
                document_id=ack_doc.id,
                line_number=idx,
                sku=item.sku,
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=item.line_total,
            )
        )
    db.flush()
    db.refresh(ack_txn)

    partners = db.query(TradingPartner).all()
    rules = db.query(EdiMappingRule).all()
    ack_doc.edi_payload = generate_x12_payload(ack_txn, partners, rules)

    db.add(
        ValidationResult(
            transaction_pk=ack_txn.id,
            rule_code="POA_PO_LINK",
            label="Purchase Order Reference Match",
            status="pass",
            detail=f"855 POA linked cleanly to {po.document.document_number}.",
        )
    )
    _add_event(
        db,
        ack_txn,
        "EDI 855 Generated",
        po.receiver_name,
        "completed",
        f"{ack_doc_num} confirmed full acceptance of {po.document.document_number}.",
    )
    db.add(
        Acknowledgement(
            transaction_pk=ack_txn.id,
            ack_doc_number=ack_doc_num,
            ack_date=now_str,
            ack_code="AC",
            note=f"Supplier {po.receiver_name} accepted all line items without backorder.",
        )
    )

    # Update parent PO status & acknowledgement record
    po.status = "Accepted"
    po.ack_status = "Acknowledged"
    po.document.supplier_receipt_simulated = True
    db.query(Acknowledgement).filter(Acknowledgement.transaction_pk == po.id).delete()
    db.add(
        Acknowledgement(
            transaction_pk=po.id,
            ack_doc_number=ack_doc_num,
            ack_date=now_str,
            ack_code="AC",
            note=f"Acknowledged via {ack_doc_num} ({ack_txn_id}).",
        )
    )
    _add_event(
        db,
        po,
        "EDI 855 Acknowledgement Received",
        po.receiver_name,
        "completed",
        f"Linked {ack_doc_num} ({ack_txn_id}) received; Purchase Order status updated to Accepted.",
    )
    db.commit()

    return {
        "po": get_transaction_or_404(db, po.transaction_id),
        "ack": get_transaction_or_404(db, ack_txn.transaction_id),
    }


def approve_in_db(db: Session, identifier: str, note: Optional[str] = None) -> Transaction:
    txn = get_transaction_or_404(db, identifier)
    if txn.status == "Draft":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Draft documents must be submitted and validated before operator approval.",
        )
    if txn.status == "Accepted":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Transaction is already Accepted.",
        )
    clean_note = (note or "").strip()
    txn.status = "Accepted"
    txn.ack_status = "Acknowledged"
    if clean_note:
        txn.reviewer_notes = clean_note
    _add_event(
        db,
        txn,
        "Approved by Operator",
        "Arjun Mehta (Ops Lead)",
        "completed",
        clean_note or "Transaction manually approved for ledger settlement.",
    )
    db.commit()
    return get_transaction_or_404(db, txn.transaction_id)


def reject_in_db(db: Session, identifier: str, reason: str) -> Transaction:
    txn = get_transaction_or_404(db, identifier)
    final_reason = (
        reason.strip()
        or txn.exception_reason
        or "Rejected during manual exception review."
    )
    txn.status = "Rejected"
    txn.ack_status = "Exception"
    txn.exception_reason = final_reason
    txn.reviewer_notes = final_reason
    _add_event(
        db,
        txn,
        "Rejected by Operator",
        "Arjun Mehta (Ops Lead)",
        "error",
        final_reason,
    )
    db.commit()
    return get_transaction_or_404(db, txn.transaction_id)


def reprocess_in_db(db: Session, identifier: str) -> tuple[Transaction, bool]:
    txn = get_transaction_or_404(db, identifier)
    outcome = validate_transaction_deterministic(db, txn)
    _replace_validation_results(db, txn, outcome)

    partners = db.query(TradingPartner).all()
    rules = db.query(EdiMappingRule).all()
    if txn.document:
        txn.document.edi_payload = generate_x12_payload(txn, partners, rules)

    if outcome.passed:
        if txn.document_type == "850" and txn.ack_status != "Acknowledged":
            txn.status = "Pending"
            txn.ack_status = "Awaiting Ack"
        else:
            txn.status = "Accepted"
            txn.ack_status = "Acknowledged"
        txn.exception_reason = None
        _add_event(
            db,
            txn,
            "Reprocessed & Accepted",
            "Validation Engine",
            "completed",
            f"Reprocessing succeeded; all deterministic checks passed at {format_inr(txn.amount)}.",
        )
    else:
        txn.status = "Rejected"
        txn.ack_status = "Exception"
        txn.exception_reason = outcome.exception_reason
        _add_event(
            db,
            txn,
            "Reprocessing Failed",
            "Validation Engine",
            "error",
            outcome.exception_reason or "Validation checks still failing.",
        )

    db.commit()
    return get_transaction_or_404(db, txn.transaction_id), outcome.passed

