from datetime import datetime
from decimal import Decimal
import re
from typing import Sequence

from app.models import EdiMappingRule, TradingPartner, Transaction


def _pad_right(value: str, length: int) -> str:
    return value[:length].ljust(length, " ")


def _x12_dates(iso_date: str) -> tuple[str, str]:
    try:
        dt = datetime.fromisoformat(iso_date.replace("Z", "+00:00"))
    except ValueError:
        return "261111", "20261111"
    full = dt.strftime("%Y%m%d")
    return full[2:], full


def _fmt_num(dec: Decimal) -> str:
    if dec == dec.to_integral_value():
        return str(int(dec))
    return f"{dec:.2f}"


def generate_x12_payload(
    txn: Transaction,
    partners: Sequence[TradingPartner],
    mapping_rules: Sequence[EdiMappingRule] | None = None,
) -> str:
    doc = txn.document
    if not doc:
        return ""

    partner_by_name = {p.name: p for p in partners}
    sender_p = partner_by_name.get(txn.sender_name)
    receiver_p = partner_by_name.get(txn.receiver_name)

    sender_qual = sender_p.isa_qualifier if sender_p else "ZZ"
    sender_isa = _pad_right(sender_p.isa_id if sender_p else "SENDER01", 15)
    receiver_qual = receiver_p.isa_qualifier if receiver_p else "ZZ"
    receiver_isa = _pad_right(receiver_p.isa_id if receiver_p else "RECEIVER01", 15)
    sender_gs = sender_p.gs_id if sender_p else "SENDERGS"
    receiver_gs = receiver_p.gs_id if receiver_p else "RECEIVERGS"

    short_date, full_date = _x12_dates(txn.transaction_date)
    digits = re.sub(r"\D", "", txn.transaction_id)
    control_num = digits[-9:].rjust(9, "0")
    st_control = digits[-4:].rjust(4, "0")

    gs_map = {"850": "PO", "855": "PR", "810": "IN", "856": "SH"}
    body: list[str] = []

    if txn.document_type == "850":
        body.append(f"BEG*00*NE*{doc.document_number}**{full_date}~")
        body.append("CUR*BY*INR~")
        body.append(
            f"N1*BY*{txn.sender_name}*92*{sender_p.partner_code if sender_p else 'BUYER'}~"
        )
        body.append(
            f"N1*SE*{txn.receiver_name}*92*{receiver_p.partner_code if receiver_p else 'SUPPLIER'}~"
        )
        for idx, item in enumerate(doc.line_items, start=1):
            body.append(
                f"PO1*{idx}*{item.quantity}*EA*{_fmt_num(item.unit_price)}*PE*VP*{item.sku}~"
            )
            body.append(f"LIN*{idx}*VP*{item.sku}~")
            body.append(f"PID*F****{item.description}~")
        body.append(f"CTT*{len(doc.line_items)}~")
        body.append(f"AMT*TT*{_fmt_num(doc.grand_total)}~")
    elif txn.document_type == "855":
        ref_po = doc.reference_po or doc.document_number
        body.append(f"BAK*00*AC*{ref_po}*{full_date}*****{full_date}~")
        body.append(f"REF*PO*{ref_po}~")
        body.append(
            f"N1*SE*{txn.sender_name}*92*{sender_p.partner_code if sender_p else 'SUPPLIER'}~"
        )
        body.append(
            f"N1*BY*{txn.receiver_name}*92*{receiver_p.partner_code if receiver_p else 'BUYER'}~"
        )
        for idx, item in enumerate(doc.line_items, start=1):
            body.append(
                f"PO1*{idx}*{item.quantity}*EA*{_fmt_num(item.unit_price)}**VP*{item.sku}~"
            )
            body.append(f"ACK*IA*{item.quantity}*EA*010*{full_date}~")
        body.append(f"CTT*{len(doc.line_items)}~")
    elif txn.document_type == "810":
        body.append(
            f"BIG*{full_date}*{doc.document_number}*{full_date}*{doc.reference_po or ''}~"
        )
        body.append("CUR*SE*INR~")
        if doc.reference_po:
            body.append(f"REF*PO*{doc.reference_po}~")
        body.append(
            f"N1*RE*{txn.sender_name}*92*{sender_p.partner_code if sender_p else 'SUPPLIER'}~"
        )
        body.append(
            f"N1*BT*{txn.receiver_name}*92*{receiver_p.partner_code if receiver_p else 'BUYER'}~"
        )
        for idx, item in enumerate(doc.line_items, start=1):
            body.append(
                f"IT1*{idx}*{item.quantity}*EA*{_fmt_num(item.unit_price)}**VP*{item.sku}~"
            )
            body.append(f"PID*F****{item.description}~")
        paise_total = int((doc.grand_total * Decimal("100")).to_integral_value())
        body.append(f"TDS*{paise_total}~")
        body.append(f"CTT*{len(doc.line_items)}~")
    else:
        body.append(f"BSN*00*{doc.document_number}*{full_date}*1400~")
        body.append("HL*1**S~")
        body.append(f"REF*PO*{doc.reference_po or ''}~")
        body.append(
            f"N1*SF*{txn.sender_name}*92*{sender_p.partner_code if sender_p else 'CARRIER'}~"
        )
        body.append(
            f"N1*ST*{txn.receiver_name}*92*{receiver_p.partner_code if receiver_p else 'BUYER'}~"
        )
        for idx, item in enumerate(doc.line_items, start=1):
            body.append(f"HL*{idx + 1}*1*I~")
            body.append(f"LIN*{idx}*VP*{item.sku}~")
            body.append(f"SN1*{idx}*{item.quantity}*EA~")
        body.append(f"CTT*{len(doc.line_items) + 1}~")

    if mapping_rules:
        for rule in mapping_rules:
            if rule.document_type == txn.document_type and rule.status == "Custom":
                body.append(
                    f"N9*ZZ*{rule.edi_segment}_{rule.edi_element}*{rule.source_path}~"
                )

    se_count = len(body) + 2
    lines = [
        f"ISA*00*          *00*          *{sender_qual}*{sender_isa}*{receiver_qual}*{receiver_isa}*{short_date}*1030*U*00401*{control_num}*0*P*>~",
        f"GS*{gs_map.get(txn.document_type, 'PO')}*{sender_gs}*{receiver_gs}*{full_date}*1030*1*X*004010~",
        f"ST*{txn.document_type}*{st_control}~",
        *body,
        f"SE*{se_count}*{st_control}~",
        "GE*1*1~",
        f"IEA*1*{control_num}~",
    ]
    return "\n".join(lines)

