from decimal import Decimal
import json
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import (
    Acknowledgement,
    ApplicationSettings,
    Document,
    DocumentLineItem,
    EdiMappingRule,
    ProcessingEvent,
    TradingPartner,
    Transaction,
    ValidationResult,
)
from app.services.edi_engine import generate_x12_payload
from app.services.finance import calculate_line_total


SEED_PARTNERS = [
    {
        "partner_uid": "ptr-metro",
        "name": "Metro Retail",
        "role": "Buyer",
        "partner_code": "METRO",
        "isa_qualifier": "ZZ",
        "isa_id": "METRORETAIL01",
        "gs_id": "METROPROC",
        "supported_docs": ["850", "855", "810", "856"],
        "active": True,
        "gstin": "29AABCM4821K1Z4",
        "city": "Bengaluru",
        "state": "Karnataka",
        "contact_name": "Rohan Deshmukh",
        "contact_email": "edi-ops@metroretail.example",
        "contact_phone": "+91 80 4120 8900",
        "sla_ack_hours": 4,
        "notes": "[Demo Seed] Primary retail procurement hub issuing X12 850 purchase orders.",
    },
    {
        "partner_uid": "ptr-abc",
        "name": "ABC Components",
        "role": "Supplier",
        "partner_code": "ABCCOMP",
        "isa_qualifier": "ZZ",
        "isa_id": "ABCCOMPONENTS",
        "gs_id": "ABCSALES",
        "supported_docs": ["850", "855", "810", "856"],
        "active": True,
        "gstin": "27AADCA9104E1Z9",
        "city": "Pune",
        "state": "Maharashtra",
        "contact_name": "Neha Kulkarni",
        "contact_email": "billing-edi@abccomponents.example",
        "contact_phone": "+91 20 6721 3340",
        "sla_ack_hours": 6,
        "notes": "[Demo Seed] Enterprise IT hardware supplier fulfilling laptops, monitors, and docks.",
    },
    {
        "partner_uid": "ptr-kaveri",
        "name": "Kaveri Logistics",
        "role": "Logistics",
        "partner_code": "KAVERI3PL",
        "isa_qualifier": "ZZ",
        "isa_id": "KAVERIFREIGHT",
        "gs_id": "KAVLOG",
        "supported_docs": ["856", "810"],
        "active": True,
        "gstin": "33AAACK6420M1Z2",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "contact_name": "Suresh Subramanian",
        "contact_email": "dispatch@kaverilogistics.example",
        "contact_phone": "+91 44 2819 7710",
        "sla_ack_hours": 12,
        "notes": "[Demo Seed] Regional 3PL freight carrier emitting X12 856 ASNs and freight invoices.",
    },
]

SEED_MAPPING_RULES = [
    ("map-1", "850", "Purchase Order Number", "documentNumber", "BEG", "BEG03", "Purchase Order Reference Identifier", "UPPER(TRIM(value))", "Mapped", True),
    ("map-2", "850", "Document Date", "transactionDate", "BEG", "BEG05", "Date expressed as CCYYMMDD", "FORMAT_DATE(YYYYMMDD)", "Mapped", True),
    ("map-3", "850", "Buyer Identifier", "sender.partnerCode", "N1", "N104 (BY)", "Buying Party Identification Code", "PARTNER_CODE_LOOKUP(BY)", "Mapped", True),
    ("map-4", "850", "Supplier Identifier", "receiver.partnerCode", "N1", "N104 (SE)", "Selling Party Identification Code", "PARTNER_CODE_LOOKUP(SE)", "Mapped", True),
    ("map-5", "850", "Item SKU", "lineItems[].sku", "LIN", "LIN03", "Vendor Product / Item SKU", "DIRECT_STRING(VP)", "Mapped", True),
    ("map-6", "850", "Quantity", "lineItems[].quantity", "PO1", "PO102", "Quantity Ordered (Numeric)", "INTEGER(value)", "Mapped", True),
    ("map-7", "850", "Unit Price", "lineItems[].unitPrice", "PO1", "PO104", "Unit Price in INR", "DECIMAL(2)", "Mapped", True),
    ("map-8", "850", "Line Item Count", "lineItems.length", "CTT", "CTT01", "Transaction Line Item Hash Total", "COUNT(lineItems)", "Mapped", True),
    ("map-9", "810", "Invoice Number", "documentNumber", "BIG", "BIG02", "Invoice Identification Number", "UPPER(TRIM(value))", "Mapped", True),
    ("map-10", "810", "Reference Purchase Order", "referencePo", "BIG", "BIG04", "Matched Buyer PO Reference", "PO_LOOKUP(value)", "Mapped", True),
    ("map-11", "810", "Billed Quantity", "lineItems[].quantity", "IT1", "IT102", "Quantity Invoiced", "INTEGER(value)", "Mapped", True),
    ("map-12", "810", "Invoice Total (Paise)", "amount", "TDS", "TDS01", "Total Monetary Value Summary", "MULTIPLY(100)", "Mapped", True),
]

SEED_TRANSACTIONS = [
    {
        "transaction_id": "TXN-2026-1014",
        "document_number": "INV-ABC-8824",
        "document_type": "810",
        "sender": "ABC Components",
        "receiver": "Metro Retail",
        "date": "2026-11-11T14:20:00+05:30",
        "amount": Decimal("4600000.00"),
        "subtotal": Decimal("4600000.00"),
        "status": "Rejected",
        "reference_po": "PO-MTR-2026-441",
        "ack_status": "Exception",
        "summary": "[Demo Seed] Invoice for 100 Enterprise Laptops — ₹1,00,000 above PO amount",
        "exception": "Amount mismatch: Invoice ₹46,00,000 exceeds PO-MTR-2026-441 (₹45,00,000) by +₹1,00,000 (2.22%).",
        "lines": [("LPT-PRO-15", 'Enterprise Laptop 15" i7 / 16GB / 512GB SSD', 100, Decimal("46000.00"))],
        "extra_check": ("PO_AMOUNT_MATCH", "Two-Way PO to Invoice Amount Match", "fail", "Amount mismatch: Invoice ₹46,00,000 exceeds PO-MTR-2026-441 (₹45,00,000) by +₹1,00,000 (2.22%)."),
    },
    {
        "transaction_id": "TXN-2026-1013",
        "document_number": "PO-MTR-2026-445",
        "document_type": "850",
        "sender": "Metro Retail",
        "receiver": "ABC Components",
        "date": "2026-11-11T11:05:00+05:30",
        "amount": Decimal("1850000.00"),
        "subtotal": Decimal("1850000.00"),
        "status": "Pending",
        "reference_po": None,
        "ack_status": "Awaiting Ack",
        "summary": "[Demo Seed] 50 Docking Stations & USB-C Hubs — awaiting supplier 855 POA",
        "lines": [("DCK-THB-04", "Thunderbolt 4 Enterprise Docking Station", 50, Decimal("37000.00"))],
        "receipt_sim": True,
    },
    {
        "transaction_id": "TXN-2026-1012",
        "document_number": "ASN-ABC-3109",
        "document_type": "856",
        "sender": "ABC Components",
        "receiver": "Metro Retail",
        "date": "2026-11-10T17:45:00+05:30",
        "amount": Decimal("4500000.00"),
        "subtotal": Decimal("4500000.00"),
        "status": "Accepted",
        "reference_po": "PO-MTR-2026-441",
        "ack_status": "Acknowledged",
        "summary": "[Demo Seed] Shipment dispatch notice for 100 Laptops via Kaveri Logistics",
        "lines": [("LPT-PRO-15", 'Enterprise Laptop 15" i7 / 16GB / 512GB SSD', 100, Decimal("45000.00"))],
    },
    {
        "transaction_id": "TXN-2026-1011",
        "document_number": "POA-ABC-4410",
        "document_type": "855",
        "sender": "ABC Components",
        "receiver": "Metro Retail",
        "date": "2026-11-10T10:15:00+05:30",
        "amount": Decimal("4500000.00"),
        "subtotal": Decimal("4500000.00"),
        "status": "Accepted",
        "reference_po": "PO-MTR-2026-441",
        "ack_status": "Acknowledged",
        "summary": "[Demo Seed] Order acknowledgement confirming full delivery of 100 Laptops",
        "lines": [("LPT-PRO-15", 'Enterprise Laptop 15" i7 / 16GB / 512GB SSD', 100, Decimal("45000.00"))],
        "ack_info": ("POA-ABC-4410", "2026-11-10T10:15:00+05:30", "AC", "Supplier confirmed full acceptance of 100 units at ₹45,000/unit."),
    },
    {
        "transaction_id": "TXN-2026-1010",
        "document_number": "PO-MTR-2026-441",
        "document_type": "850",
        "sender": "Metro Retail",
        "receiver": "ABC Components",
        "date": "2026-11-10T09:12:00+05:30",
        "amount": Decimal("4500000.00"),
        "subtotal": Decimal("4500000.00"),
        "status": "Accepted",
        "reference_po": None,
        "ack_status": "Acknowledged",
        "summary": "[Demo Seed] Purchase order for 100 Enterprise Laptops @ ₹45,000 unit price",
        "lines": [("LPT-PRO-15", 'Enterprise Laptop 15" i7 / 16GB / 512GB SSD', 100, Decimal("45000.00"))],
        "receipt_sim": True,
        "ack_info": ("POA-ABC-4410", "2026-11-10T10:15:00+05:30", "AC", "Acknowledged via X12 855 (POA-ABC-4410) for 100 units."),
    },
    {
        "transaction_id": "TXN-2026-1009",
        "document_number": "PO-MTR-2026-439",
        "document_type": "850",
        "sender": "Metro Retail",
        "receiver": "ABC Components",
        "date": "2026-11-09T15:30:00+05:30",
        "amount": Decimal("1240000.00"),
        "subtotal": Decimal("1240000.00"),
        "status": "Pending",
        "reference_po": None,
        "ack_status": "Awaiting Ack",
        "summary": "[Demo Seed] 40 Dual-Band Enterprise Monitors — awaiting supplier 855 POA",
        "lines": [("MON-U27-4K", '27" 4K IPS USB-C Enterprise Monitor', 40, Decimal("31000.00"))],
        "receipt_sim": True,
    },
    {
        "transaction_id": "TXN-2026-1008",
        "document_number": "INV-KAV-2190",
        "document_type": "810",
        "sender": "Kaveri Logistics",
        "receiver": "Metro Retail",
        "date": "2026-11-09T12:10:00+05:30",
        "amount": Decimal("145000.00"),
        "subtotal": Decimal("145000.00"),
        "status": "Accepted",
        "reference_po": "PO-MTR-2026-434",
        "ack_status": "Acknowledged",
        "summary": "[Demo Seed] Freight settlement invoice for regional warehouse transfer",
        "lines": [("FRT-FTL-BLR", "Dedicated FTL Linehaul Pune → Bengaluru Hub", 1, Decimal("145000.00"))],
    },
    {
        "transaction_id": "TXN-2026-1007",
        "document_number": "INV-ABC-8791",
        "document_type": "810",
        "sender": "ABC Components",
        "receiver": "Metro Retail",
        "date": "2026-11-08T16:40:00+05:30",
        "amount": Decimal("2250000.00"),
        "subtotal": Decimal("2250000.00"),
        "status": "Accepted",
        "reference_po": "PO-MTR-2026-432",
        "ack_status": "Acknowledged",
        "summary": "[Demo Seed] Matched invoice for 50 Pro Workstations",
        "lines": [("WKS-PRO-32", "Pro Workstation Tower Xeon / 32GB ECC", 50, Decimal("45000.00"))],
        "extra_check": ("PO_AMOUNT_MATCH", "Two-Way PO to Invoice Amount Match", "pass", "Invoice ₹22,50,000 matches PO-MTR-2026-432 (₹22,50,000) exactly."),
    },
    {
        "transaction_id": "TXN-2026-1006",
        "document_number": "POA-ABC-4320",
        "document_type": "855",
        "sender": "ABC Components",
        "receiver": "Metro Retail",
        "date": "2026-11-07T14:05:00+05:30",
        "amount": Decimal("2250000.00"),
        "subtotal": Decimal("2250000.00"),
        "status": "Accepted",
        "reference_po": "PO-MTR-2026-432",
        "ack_status": "Acknowledged",
        "summary": "[Demo Seed] Full acceptance for 50 Pro Workstations",
        "lines": [("WKS-PRO-32", "Pro Workstation Tower Xeon / 32GB ECC", 50, Decimal("45000.00"))],
        "ack_info": ("POA-ABC-4320", "2026-11-07T14:05:00+05:30", "AC", "Full quantity accepted."),
    },
    {
        "transaction_id": "TXN-2026-1005",
        "document_number": "PO-MTR-2026-432",
        "document_type": "850",
        "sender": "Metro Retail",
        "receiver": "ABC Components",
        "date": "2026-11-07T10:20:00+05:30",
        "amount": Decimal("2250000.00"),
        "subtotal": Decimal("2250000.00"),
        "status": "Accepted",
        "reference_po": None,
        "ack_status": "Acknowledged",
        "summary": "[Demo Seed] Purchase order for 50 Pro Workstations",
        "lines": [("WKS-PRO-32", "Pro Workstation Tower Xeon / 32GB ECC", 50, Decimal("45000.00"))],
        "receipt_sim": True,
        "ack_info": ("POA-ABC-4320", "2026-11-07T14:05:00+05:30", "AC", "Acknowledged via POA-ABC-4320."),
    },
    {
        "transaction_id": "TXN-2026-1004",
        "document_number": "ASN-KAV-1102",
        "document_type": "856",
        "sender": "Kaveri Logistics",
        "receiver": "Metro Retail",
        "date": "2026-11-06T18:00:00+05:30",
        "amount": Decimal("980000.00"),
        "subtotal": Decimal("980000.00"),
        "status": "Accepted",
        "reference_po": "PO-MTR-2026-428",
        "ack_status": "Acknowledged",
        "summary": "[Demo Seed] Palletized delivery notice for Bengaluru hub",
        "lines": [("NET-SW-48P", "48-Port Managed Enterprise PoE+ Switch", 20, Decimal("49000.00"))],
    },
    {
        "transaction_id": "TXN-2026-1003",
        "document_number": "INV-ABC-8760",
        "document_type": "810",
        "sender": "ABC Components",
        "receiver": "Metro Retail",
        "date": "2026-11-05T13:15:00+05:30",
        "amount": Decimal("995000.00"),
        "subtotal": Decimal("980000.00"),
        "status": "Rejected",
        "reference_po": "PO-MTR-2026-428",
        "ack_status": "Exception",
        "summary": "[Demo Seed] Duplicate tax line item rejected during X12 810 validation",
        "exception": "Line item sum ₹9,80,000 does not match invoice total ₹9,95,000",
        "lines": [("NET-SW-48P", "48-Port Managed Enterprise PoE+ Switch", 20, Decimal("49000.00"))],
        "math_fail": "Line item sum ₹9,80,000 does not match invoice total ₹9,95,000 (+₹15,000 unexplained surcharge).",
    },
]


def _seed_all_records(db: Session) -> None:
    partner_map: dict[str, TradingPartner] = {}
    for pdata in SEED_PARTNERS:
        p = TradingPartner(
            partner_uid=pdata["partner_uid"],
            name=pdata["name"],
            role=pdata["role"],
            partner_code=pdata["partner_code"],
            isa_qualifier=pdata["isa_qualifier"],
            isa_id=pdata["isa_id"],
            gs_id=pdata["gs_id"],
            supported_docs_json=json.dumps(pdata["supported_docs"]),
            active=pdata["active"],
            is_demo_seed=True,
            gstin=pdata["gstin"],
            city=pdata["city"],
            state=pdata["state"],
            contact_name=pdata["contact_name"],
            contact_email=pdata["contact_email"],
            contact_phone=pdata["contact_phone"],
            sla_ack_hours=pdata["sla_ack_hours"],
            notes=pdata["notes"],
        )
        db.add(p)
        partner_map[p.name] = p

    rules: list[EdiMappingRule] = []
    for uid, dtype, sfield, spath, seg, elem, desc, trule, st, req in SEED_MAPPING_RULES:
        rule = EdiMappingRule(
            rule_uid=uid,
            document_type=dtype,
            source_field=sfield,
            source_path=spath,
            edi_segment=seg,
            edi_element=elem,
            edi_description=desc,
            transform_rule=trule,
            status=st,
            required=req,
        )
        db.add(rule)
        rules.append(rule)

    db.add(
        ApplicationSettings(
            id=1,
            organization_name="Metro Retail Supply Chain Hub",
            hub_code="METRO-HUB-01",
            hub_gstin="29AABCM4821K1Z4",
            admin_email="edi-ops@metroretail.example",
            default_tax_rate_pct=Decimal("0.00"),
            auto_validate_on_submit=True,
            edi_standard_version="ANSI X12 · 004010",
            segment_terminator="~",
            element_separator="*",
            ollama_endpoint="http://localhost:11434",
            ollama_model="qwen2.5:7b",
        )
    )
    db.flush()

    partners_list = list(partner_map.values())

    for row in SEED_TRANSACTIONS:
        sender_p = partner_map.get(row["sender"])
        receiver_p = partner_map.get(row["receiver"])
        txn = Transaction(
            transaction_id=row["transaction_id"],
            document_type=row["document_type"],
            sender_partner_id=sender_p.id if sender_p else None,
            receiver_partner_id=receiver_p.id if receiver_p else None,
            sender_name=row["sender"],
            receiver_name=row["receiver"],
            transaction_date=row["date"],
            amount=row["amount"],
            status=row["status"],
            ack_status=row["ack_status"],
            exception_reason=row.get("exception"),
            is_demo_seed=True,
        )
        db.add(txn)
        db.flush()

        doc = Document(
            transaction_pk=txn.id,
            document_number=row["document_number"],
            document_type=row["document_type"],
            document_date=row["date"],
            reference_po=row.get("reference_po"),
            subtotal=row["subtotal"],
            tax_rate_pct=Decimal("0.00"),
            tax_amount=Decimal("0.00"),
            grand_total=row["amount"],
            summary=row["summary"],
            edi_payload="",
            supplier_receipt_simulated=bool(row.get("receipt_sim", False)),
        )
        db.add(doc)
        db.flush()

        for idx, (sku, desc, qty, price) in enumerate(row["lines"], start=1):
            db.add(
                DocumentLineItem(
                    document_id=doc.id,
                    line_number=idx,
                    sku=sku,
                    description=desc,
                    quantity=qty,
                    unit_price=price,
                    line_total=calculate_line_total(qty, price),
                )
            )
        db.flush()
        db.refresh(doc)
        db.refresh(txn)

        doc.edi_payload = generate_x12_payload(txn, partners_list, rules)

        # Validation checks
        if "math_fail" in row:
            db.add_all([
                ValidationResult(
                    transaction_pk=txn.id,
                    rule_code="REQ_HEADER",
                    label="Document Header & Routing Completeness",
                    status="pass",
                    detail=f"{row['document_number']} routed from {row['sender']} to {row['receiver']}.",
                ),
                ValidationResult(
                    transaction_pk=txn.id,
                    rule_code="TOTAL_RECONCILE",
                    label="Subtotal, Tax & Grand Total Arithmetic",
                    status="fail",
                    detail=row["math_fail"],
                ),
            ])
        else:
            db.add_all([
                ValidationResult(
                    transaction_pk=txn.id,
                    rule_code="REQ_HEADER",
                    label="Document Header & Routing Completeness",
                    status="pass",
                    detail=f"{row['document_number']} routed from {row['sender']} to {row['receiver']}.",
                ),
                ValidationResult(
                    transaction_pk=txn.id,
                    rule_code="PARTNER_ELIGIBLE",
                    label="Trading Partner Status & X12 Capability",
                    status="pass",
                    detail="Sender and receiver active and enabled for this ANSI X12 message type.",
                ),
                ValidationResult(
                    transaction_pk=txn.id,
                    rule_code="LINE_POSITIVE",
                    label="Line-Item Quantities & Unit Pricing",
                    status="pass",
                    detail="All line items contain positive quantities and positive unit rates.",
                ),
                ValidationResult(
                    transaction_pk=txn.id,
                    rule_code="TOTAL_RECONCILE",
                    label="Subtotal, Tax & Grand Total Arithmetic",
                    status="pass",
                    detail="Reconciled line-item arithmetic verified.",
                ),
            ])
            if "extra_check" in row:
                rc, lbl, st, dtl = row["extra_check"]
                db.add(
                    ValidationResult(
                        transaction_pk=txn.id,
                        rule_code=rc,
                        label=lbl,
                        status=st,
                        detail=dtl,
                    )
                )

        # Timeline events
        dt_base = datetime.fromisoformat(row["date"])
        ts1 = dt_base.isoformat()
        ts2 = datetime.fromtimestamp(dt_base.timestamp() + 120, tz=dt_base.tzinfo).isoformat()
        ts3 = datetime.fromtimestamp(dt_base.timestamp() + 300, tz=dt_base.tzinfo).isoformat()
        db.add(
            ProcessingEvent(
                transaction_pk=txn.id,
                timestamp=ts1,
                step="Document Registered",
                actor=row["sender"],
                status="completed",
                note=f"{row['document_number']} entered EDI Nexus gateway.",
            )
        )
        db.add(
            ProcessingEvent(
                transaction_pk=txn.id,
                timestamp=ts2,
                step="Deterministic Validation",
                actor="Validation Engine",
                status="error" if row["status"] == "Rejected" else "completed",
                note=row.get("exception") or "Schema, partner eligibility, and Decimal arithmetic passed.",
            )
        )
        if row["status"] == "Accepted":
            db.add(
                ProcessingEvent(
                    transaction_pk=txn.id,
                    timestamp=ts3,
                    step="Interchange Accepted",
                    actor="EDI Gateway",
                    status="completed",
                    note="ANSI X12 payload generated and cleared for business ledger.",
                )
            )
        elif row["status"] == "Pending":
            db.add(
                ProcessingEvent(
                    transaction_pk=txn.id,
                    timestamp=ts3,
                    step="Awaiting Partner Acknowledgement",
                    actor="Workflow Monitor",
                    status="warning",
                    note="Dispatched X12 850; awaiting supplier 855 confirmation.",
                )
            )
        elif row["status"] == "Rejected":
            db.add(
                ProcessingEvent(
                    transaction_pk=txn.id,
                    timestamp=ts3,
                    step="Exception Flagged for Review",
                    actor="PO Matching Engine",
                    status="error",
                    note=row.get("exception") or "Validation exception requires operator review.",
                )
            )

        if "ack_info" in row:
            anum, adate, acode, anote = row["ack_info"]
            db.add(
                Acknowledgement(
                    transaction_pk=txn.id,
                    ack_doc_number=anum,
                    ack_date=adate,
                    ack_code=acode,
                    note=anote,
                )
            )

    db.commit()


def ensure_seed_data(db: Session) -> None:
    """Idempotent seed: inserts demonstration records only when database is empty."""
    has_partners = db.query(TradingPartner.id).first() is not None
    has_txns = db.query(Transaction.id).first() is not None
    if has_partners or has_txns:
        return
    _seed_all_records(db)


def reset_database_to_demo(db: Session) -> None:
    """Clear transactional/config tables and restore initial demonstration seed data."""
    db.query(Acknowledgement).delete()
    db.query(ProcessingEvent).delete()
    db.query(ValidationResult).delete()
    db.query(DocumentLineItem).delete()
    db.query(Document).delete()
    db.query(Transaction).delete()
    db.query(EdiMappingRule).delete()
    db.query(TradingPartner).delete()
    db.query(ApplicationSettings).delete()
    db.flush()
    _seed_all_records(db)

