import json
from typing import Iterable

from app.models import (
    ApplicationSettings,
    EdiMappingRule,
    TradingPartner,
    Transaction,
)
from app.schemas import (
    AcknowledgementOut,
    AppSettingsOut,
    LineItemOut,
    MappingRuleOut,
    PartnerOut,
    ProcessingEventOut,
    TransactionOut,
    ValidationCheckOut,
)


def serialize_transaction(txn: Transaction) -> TransactionOut:
    doc = txn.document
    line_items = [
        LineItemOut(
            id=f"li-{li.id}",
            sku=li.sku,
            description=li.description,
            quantity=li.quantity,
            unitPrice=float(li.unit_price),
            lineTotal=float(li.line_total),
        )
        for li in (doc.line_items if doc else [])
    ]
    validation_results = [
        ValidationCheckOut(
            id=f"chk-{vr.id}",
            ruleCode=vr.rule_code,
            label=vr.label,
            status=vr.status,  # type: ignore[arg-type]
            detail=vr.detail,
        )
        for vr in txn.validation_results
    ]
    timeline = [
        ProcessingEventOut(
            id=f"ev-{ev.id}",
            timestamp=ev.timestamp,
            step=ev.step,
            actor=ev.actor,
            status=ev.status,  # type: ignore[arg-type]
            note=ev.note,
        )
        for ev in txn.processing_events
    ]
    ack_out = (
        AcknowledgementOut(
            ackDocNumber=txn.acknowledgement.ack_doc_number,
            ackDate=txn.acknowledgement.ack_date,
            ackCode=txn.acknowledgement.ack_code,  # type: ignore[arg-type]
            note=txn.acknowledgement.note,
        )
        if txn.acknowledgement
        else None
    )

    return TransactionOut(
        id=str(txn.id),
        transactionId=txn.transaction_id,
        documentNumber=doc.document_number if doc else txn.transaction_id,
        documentType=txn.document_type,  # type: ignore[arg-type]
        sender=txn.sender_name,
        receiver=txn.receiver_name,
        transactionDate=txn.transaction_date,
        subtotal=float(doc.subtotal if doc else txn.amount),
        taxRatePct=float(doc.tax_rate_pct if doc else 0),
        taxAmount=float(doc.tax_amount if doc else 0),
        amount=float(txn.amount),
        status=txn.status,  # type: ignore[arg-type]
        referencePo=doc.reference_po if doc else None,
        ackStatus=txn.ack_status,  # type: ignore[arg-type]
        summary=doc.summary if doc else "",
        exceptionReason=txn.exception_reason,
        reviewerNotes=txn.reviewer_notes,
        lineItems=line_items,
        validationResults=validation_results,
        ediPayload=doc.edi_payload if doc else "",
        timeline=timeline,
        acknowledgement=ack_out,
        supplierReceiptSimulated=doc.supplier_receipt_simulated if doc else False,
        isDemoSeed=txn.is_demo_seed,
    )


def serialize_partner(
    partner: TradingPartner,
    all_txns: Iterable[Transaction] = (),
) -> PartnerOut:
    try:
        docs = json.loads(partner.supported_docs_json)
    except json.JSONDecodeError:
        docs = []

    involved = [
        t
        for t in all_txns
        if t.sender_name == partner.name or t.receiver_name == partner.name
    ]
    accepted_count = sum(1 for t in involved if t.status == "Accepted")
    rejected_count = sum(1 for t in involved if t.status == "Rejected")
    total_volume = sum(float(t.amount) for t in involved)

    return PartnerOut(
        id=partner.partner_uid,
        name=partner.name,
        role=partner.role,  # type: ignore[arg-type]
        partnerCode=partner.partner_code,
        isaQualifier=partner.isa_qualifier,
        isaId=partner.isa_id,
        gsId=partner.gs_id,
        supportedDocs=docs,
        active=partner.active,
        isDemoSeed=partner.is_demo_seed,
        gstin=partner.gstin,
        city=partner.city,
        state=partner.state,
        contactName=partner.contact_name,
        contactEmail=partner.contact_email,
        contactPhone=partner.contact_phone,
        slaAckHours=partner.sla_ack_hours,
        notes=partner.notes,
        totalTransactions=len(involved),
        acceptedCount=accepted_count,
        rejectedCount=rejected_count,
        totalVolume=total_volume,
    )


def serialize_mapping_rule(rule: EdiMappingRule) -> MappingRuleOut:
    return MappingRuleOut(
        id=rule.rule_uid,
        documentType=rule.document_type,  # type: ignore[arg-type]
        sourceField=rule.source_field,
        sourcePath=rule.source_path,
        ediSegment=rule.edi_segment,
        ediElement=rule.edi_element,
        ediDescription=rule.edi_description,
        transformRule=rule.transform_rule,
        status=rule.status,  # type: ignore[arg-type]
        required=rule.required,
    )


def serialize_settings(cfg: ApplicationSettings) -> AppSettingsOut:
    return AppSettingsOut(
        organizationName=cfg.organization_name,
        hubCode=cfg.hub_code,
        hubGstin=cfg.hub_gstin,
        adminEmail=cfg.admin_email,
        defaultTaxRatePct=float(cfg.default_tax_rate_pct),
        autoValidateOnSubmit=cfg.auto_validate_on_submit,
        ediStandardVersion=cfg.edi_standard_version,
        segmentTerminator=cfg.segment_terminator,
        elementSeparator=cfg.element_separator,
        ollamaEndpoint=cfg.ollama_endpoint,
        ollamaModel=cfg.ollama_model,
    )

