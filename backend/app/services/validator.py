from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
import json
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Document, TradingPartner, Transaction
from app.services.finance import calculate_document_totals, format_inr, quantize_money


@dataclass
class ValidationCheckData:
    rule_code: str
    label: str
    status: str  # 'pass' | 'warning' | 'fail'
    detail: str


@dataclass
class ValidationOutcome:
    passed: bool
    checks: list[ValidationCheckData]
    exception_reason: Optional[str] = None
    matched_po: Optional[Transaction] = None
    variance_amount: Optional[Decimal] = None


def validate_transaction_deterministic(db: Session, txn: Transaction) -> ValidationOutcome:
    """Deterministic business & financial validation using Decimal arithmetic."""
    checks: list[ValidationCheckData] = []
    doc = txn.document

    # 1. Header completeness
    has_required = bool(
        doc
        and doc.document_number.strip()
        and txn.sender_name.strip()
        and txn.receiver_name.strip()
        and txn.sender_name != txn.receiver_name
    )
    checks.append(
        ValidationCheckData(
            rule_code="REQ_HEADER",
            label="Document Header & Routing Completeness",
            status="pass" if has_required else "fail",
            detail=(
                f"{doc.document_number} routed from {txn.sender_name} to {txn.receiver_name}."
                if has_required and doc
                else "Missing required document number or invalid sender/receiver pair."
            ),
        )
    )

    # 2. Trading partner eligibility & active status
    sender_p = (
        db.query(TradingPartner).filter(TradingPartner.name == txn.sender_name).first()
    )
    receiver_p = (
        db.query(TradingPartner).filter(TradingPartner.name == txn.receiver_name).first()
    )

    def _supports(p: Optional[TradingPartner], code: str) -> bool:
        if not p or not p.active:
            return False
        try:
            docs = json.loads(p.supported_docs_json)
        except json.JSONDecodeError:
            docs = []
        return code in docs

    partners_valid = _supports(sender_p, txn.document_type) and _supports(
        receiver_p, txn.document_type
    )
    checks.append(
        ValidationCheckData(
            rule_code="PARTNER_ELIGIBLE",
            label="Trading Partner Status & X12 Capability",
            status="pass" if partners_valid else "fail",
            detail=(
                f"Both {sender_p.partner_code} and {receiver_p.partner_code} are active for X12 {txn.document_type}."
                if partners_valid and sender_p and receiver_p
                else "One or more trading partners are inactive or not enabled for this X12 message type."
            ),
        )
    )

    # 3. Positive line-item checks
    line_items = doc.line_items if doc else []
    lines_valid = len(line_items) > 0 and all(
        item.sku.strip()
        and item.description.strip()
        and item.quantity > 0
        and item.unit_price > Decimal("0")
        for item in line_items
    )
    checks.append(
        ValidationCheckData(
            rule_code="LINE_POSITIVE",
            label="Line-Item Quantities & Unit Pricing",
            status="pass" if lines_valid else "fail",
            detail=(
                f"{len(line_items)} line item(s) verified with positive quantities and unit prices."
                if lines_valid
                else "Line items must include SKU, description, quantity > 0, and unit price > 0."
            ),
        )
    )

    # 4. Financial Decimal reconciliation
    if doc:
        computed_sub, computed_tax, computed_grand = calculate_document_totals(
            [(li.quantity, li.unit_price) for li in line_items],
            doc.tax_rate_pct,
        )
        math_delta = abs(quantize_money(txn.amount) - computed_grand)
        math_valid = math_delta <= Decimal("1.00") and txn.amount > Decimal("0")
        checks.append(
            ValidationCheckData(
                rule_code="TOTAL_RECONCILE",
                label="Subtotal, Tax & Grand Total Arithmetic",
                status="pass" if math_valid else "fail",
                detail=(
                    f"Line subtotal ({format_inr(computed_sub)}) + tax ({format_inr(computed_tax)}) equals {format_inr(txn.amount)}."
                    if math_valid
                    else f"Line item sum + tax ({format_inr(computed_grand)}) does not match document total ({format_inr(txn.amount)})."
                ),
            )
        )
    else:
        checks.append(
            ValidationCheckData(
                rule_code="TOTAL_RECONCILE",
                label="Subtotal, Tax & Grand Total Arithmetic",
                status="fail",
                detail="Document record missing.",
            )
        )

    # 5. Purchase Order Matching for 810 Invoices
    matched_po: Optional[Transaction] = None
    variance_amount: Optional[Decimal] = None
    exception_reason: Optional[str] = None

    if txn.document_type == "810" and doc:
        ref_po = (doc.reference_po or "").strip()
        if not ref_po:
            checks.append(
                ValidationCheckData(
                    rule_code="PO_REFERENCE",
                    label="Purchase Order Reference Check",
                    status="warning",
                    detail="No Purchase Order number referenced; routed for manual buyer verification.",
                )
            )
        else:
            matched_po = (
                db.query(Transaction)
                .join(Document, Document.transaction_pk == Transaction.id)
                .filter(
                    Transaction.document_type == "850",
                    func.upper(Document.document_number) == ref_po.upper(),
                )
                .first()
            )
            if not matched_po or not matched_po.document:
                exception_reason = f"Referenced Purchase Order {ref_po} was not found."
                checks.append(
                    ValidationCheckData(
                        rule_code="PO_EXISTS",
                        label="Referenced Purchase Order Lookup",
                        status="fail",
                        detail=exception_reason,
                    )
                )
            else:
                variance_amount = quantize_money(txn.amount) - quantize_money(
                    matched_po.amount
                )
                abs_diff = abs(variance_amount)
                if matched_po.amount > Decimal("0"):
                    pct_dec = (
                        (abs_diff / matched_po.amount) * Decimal("100")
                    ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                else:
                    pct_dec = Decimal("0.00")

                if abs_diff == Decimal("0.00"):
                    checks.append(
                        ValidationCheckData(
                            rule_code="PO_AMOUNT_MATCH",
                            label="Two-Way PO to Invoice Amount Match",
                            status="pass",
                            detail=(
                                f"Invoice {format_inr(txn.amount)} matches "
                                f"{matched_po.document.document_number} ({format_inr(matched_po.amount)}) exactly."
                            ),
                        )
                    )
                else:
                    direction = "exceeds" if variance_amount > 0 else "is below"
                    signed = (
                        f"+{format_inr(abs_diff)}"
                        if variance_amount > 0
                        else f"-{format_inr(abs_diff)}"
                    )
                    exception_reason = (
                        f"Amount mismatch: Invoice {format_inr(txn.amount)} {direction} "
                        f"{matched_po.document.document_number} ({format_inr(matched_po.amount)}) "
                        f"by {signed} ({pct_dec}%)."
                    )
                    checks.append(
                        ValidationCheckData(
                            rule_code="PO_AMOUNT_MATCH",
                            label="Two-Way PO to Invoice Amount Match",
                            status="fail",
                            detail=exception_reason,
                        )
                    )

    if not exception_reason:
        first_fail = next((c for c in checks if c.status == "fail"), None)
        if first_fail:
            exception_reason = first_fail.detail

    passed = all(c.status != "fail" for c in checks)
    return ValidationOutcome(
        passed=passed,
        checks=checks,
        exception_reason=exception_reason,
        matched_po=matched_po,
        variance_amount=variance_amount,
    )

