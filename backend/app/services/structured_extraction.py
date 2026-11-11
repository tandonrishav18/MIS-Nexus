import json
import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session

from app.models import ApplicationSettings
from app.services.ollama_client import chat_with_ollama, probe_ollama_health


class ExtractedLineItem(BaseModel):
    sku: Optional[str] = None
    description: Optional[str] = None
    quantity: Optional[int] = Field(default=None, gt=0)
    unit_price: Optional[float] = Field(default=None, gt=0)


class StructuredDocumentExtraction(BaseModel):
    document_type: Literal["850", "855", "810", "856", "UNKNOWN"] = "UNKNOWN"
    document_number: Optional[str] = None
    document_date: Optional[str] = None
    buyer: Optional[str] = None
    supplier: Optional[str] = None
    reference_po: Optional[str] = None
    line_items: list[ExtractedLineItem] = Field(default_factory=list)
    subtotal: Optional[float] = None
    tax_amount: Optional[float] = None
    grand_total: Optional[float] = None
    uncertain_fields: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    extraction_source: str = "Deterministic Field Parser"


def _compute_uncertain_fields(model: StructuredDocumentExtraction) -> list[str]:
    uncertain = list(dict.fromkeys(model.uncertain_fields))
    required_checks = [
        ("document_type", model.document_type == "UNKNOWN"),
        ("document_number", not (model.document_number or "").strip()),
        ("document_date", not (model.document_date or "").strip()),
        ("buyer", not (model.buyer or "").strip()),
        ("supplier", not (model.supplier or "").strip()),
        ("line_items", len(model.line_items) == 0),
        ("grand_total", model.grand_total is None),
    ]
    for field_name, missing in required_checks:
        if missing and field_name not in uncertain:
            uncertain.append(field_name)

    for idx, li in enumerate(model.line_items):
        if not li.sku:
            key = f"line_items[{idx}].sku"
            if key not in uncertain:
                uncertain.append(key)
        if not li.quantity:
            key = f"line_items[{idx}].quantity"
            if key not in uncertain:
                uncertain.append(key)
        if not li.unit_price:
            key = f"line_items[{idx}].unit_price"
            if key not in uncertain:
                uncertain.append(key)

    return uncertain


def parse_document_text_deterministically(text: str) -> StructuredDocumentExtraction:
    """
    Deterministic regex/label extraction that NEVER invents missing values.
    Missing fields remain None and are explicitly flagged in uncertain_fields.
    """
    if not text.strip():
        return StructuredDocumentExtraction(
            uncertain_fields=[
                "document_type",
                "document_number",
                "document_date",
                "buyer",
                "supplier",
                "line_items",
                "grand_total",
            ],
            warnings=["No readable text available to extract fields from."],
            extraction_source="Deterministic Field Parser (Empty Input)",
        )

    low = text.lower()

    # Document type detection
    doc_type: Literal["850", "855", "810", "856", "UNKNOWN"] = "UNKNOWN"
    if re.search(r"\b(invoice|inv-|810)\b", low):
        doc_type = "810"
    elif re.search(r"\b(acknowledgement|poa-|855)\b", low):
        doc_type = "855"
    elif re.search(r"\b(shipping notice|asn-|856)\b", low):
        doc_type = "856"
    elif re.search(r"\b(purchase order|po-|850)\b", low):
        doc_type = "850"

    doc_num_m = re.search(r"\b((?:PO|INV|POA|ASN)-[A-Z0-9-]+)\b", text, re.IGNORECASE)
    doc_num = doc_num_m.group(1).upper() if doc_num_m else None

    ref_po_m = re.search(
        r"(?:Reference\s*PO|Ref\s*PO|Purchase\s*Order\s*Ref(?:erence)?)\s*[:\-]?\s*(PO-[A-Z0-9-]+)",
        text,
        re.IGNORECASE,
    )
    ref_po = ref_po_m.group(1).upper() if ref_po_m else None
    if not ref_po and doc_type == "810":
        all_pos = re.findall(r"\b(PO-[A-Z0-9-]+)\b", text, re.IGNORECASE)
        if all_pos:
            ref_po = all_pos[0].upper()

    date_m = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", text)
    doc_date = date_m.group(1) if date_m else None

    buyer: Optional[str] = None
    supplier: Optional[str] = None
    buyer_m = re.search(r"Buyer\s*[:\-]\s*([^\n\r,;]+)", text, re.IGNORECASE)
    supplier_m = re.search(r"(?:Supplier|Vendor|Seller)\s*[:\-]\s*([^\n\r,;]+)", text, re.IGNORECASE)
    if buyer_m:
        buyer = buyer_m.group(1).strip()
    elif "metro retail" in low:
        buyer = "Metro Retail"

    if supplier_m:
        supplier = supplier_m.group(1).strip()
    elif "abc components" in low:
        supplier = "ABC Components"
    elif "kaveri logistics" in low:
        supplier = "Kaveri Logistics"

    sku_m = re.search(r"SKU\s*[:\-]\s*([A-Z0-9-]+)\b", text, re.IGNORECASE)
    if not sku_m:
        sku_m = re.search(r"\b(?!PO-|INV-|POA-|ASN-)([A-Z]{2,5}-[A-Z0-9]{2,6}-[A-Z0-9]{1,6})\b", text)
    desc_m = re.search(r"(?:Description|Item)\s*[:\-]\s*([^\n\r]+)", text, re.IGNORECASE)
    qty_m = re.search(r"(?:Qty|Quantity)\s*[:\-]?\s*(\d+)", text, re.IGNORECASE)
    price_m = re.search(r"(?:Unit\s*Price|Unit\s*Rate|Rate)\s*[:\-]?\s*₹?\s*([\d,]+(?:\.\d{1,2})?)", text, re.IGNORECASE)

    sub_m = re.search(r"Subtotal\s*[:\-]?\s*₹?\s*([\d,]+(?:\.\d{1,2})?)", text, re.IGNORECASE)
    tax_m = re.search(r"(?:Tax|GST)\s*[:\-]?\s*₹?\s*([\d,]+(?:\.\d{1,2})?)", text, re.IGNORECASE)
    total_m = re.search(r"(?:Grand\s*Total|Total\s*Amount|Total)\s*[:\-]?\s*₹?\s*([\d,]+(?:\.\d{1,2})?)", text, re.IGNORECASE)

    def _to_float(m: Optional[re.Match[str]]) -> Optional[float]:
        if not m:
            return None
        try:
            return float(m.group(1).replace(",", ""))
        except ValueError:
            return None

    line_items: list[ExtractedLineItem] = []
    qty_val = int(qty_m.group(1)) if qty_m and int(qty_m.group(1)) > 0 else None
    price_val = _to_float(price_m)
    if price_val is not None and price_val <= 0:
        price_val = None
    sku_val = sku_m.group(1).upper() if sku_m else None
    desc_val = desc_m.group(1).strip() if desc_m else None

    if any(x is not None for x in (sku_val, desc_val, qty_val, price_val)):
        line_items.append(
            ExtractedLineItem(
                sku=sku_val,
                description=desc_val,
                quantity=qty_val,
                unit_price=price_val,
            )
        )

    extraction = StructuredDocumentExtraction(
        document_type=doc_type,
        document_number=doc_num,
        document_date=doc_date,
        buyer=buyer,
        supplier=supplier,
        reference_po=ref_po,
        line_items=line_items,
        subtotal=_to_float(sub_m),
        tax_amount=_to_float(tax_m),
        grand_total=_to_float(total_m),
        extraction_source="Deterministic Field Parser",
    )
    extraction.uncertain_fields = _compute_uncertain_fields(extraction)
    return extraction


def extract_structured_document(
    db: Session,
    extracted_text: str,
    use_ai: bool = True,
) -> StructuredDocumentExtraction:
    """
    Convert extracted document text into Pydantic-validated JSON structure.
    Uses local Ollama Qwen if connected and requested, with strict JSON validation
    and deterministic fallback. Never invents missing values or auto-saves to DB.
    """
    if not extracted_text.strip():
        return parse_document_text_deterministically(extracted_text)

    if use_ai:
        cfg = db.query(ApplicationSettings).filter(ApplicationSettings.id == 1).first()
        endpoint = cfg.ollama_endpoint if cfg else "http://localhost:11434"
        model = cfg.ollama_model if cfg else "qwen2.5:7b"
        health = probe_ollama_health(endpoint, model)

        if health.overall_status == "Connected":
            prompt = (
                "Extract structured EDI business document fields from the text below into a single JSON object "
                "with keys: document_type ('850'|'855'|'810'|'856'|'UNKNOWN'), document_number, document_date (YYYY-MM-DD), "
                "buyer, supplier, reference_po, line_items (array of {sku, description, quantity, unit_price}), "
                "subtotal, tax_amount, grand_total, uncertain_fields (array of missing/uncertain field names). "
                "CRITICAL: Do NOT invent or guess missing values; use null when absent and list the field name in uncertain_fields.\n\n"
                f"DOCUMENT TEXT:\n{extracted_text[:6000]}"
            )
            raw_json, err = chat_with_ollama(
                endpoint=endpoint,
                model=model,
                messages=[{"role": "user", "content": prompt}],
                timeout_sec=20.0,
                json_mode=True,
            )
            if raw_json:
                try:
                    parsed_dict = json.loads(raw_json)
                    validated = StructuredDocumentExtraction.model_validate(parsed_dict)
                    validated.extraction_source = f"Ollama Local ({model})"
                    validated.uncertain_fields = _compute_uncertain_fields(validated)
                    return validated
                except (json.JSONDecodeError, ValidationError) as parse_exc:
                    fallback = parse_document_text_deterministically(extracted_text)
                    fallback.extraction_source = "Deterministic Field Parser (Invalid Model JSON Fallback)"
                    fallback.warnings.append(
                        f"Local model returned invalid structured JSON ({type(parse_exc).__name__}); safely fell back to deterministic parser."
                    )
                    return fallback
            elif err:
                fallback = parse_document_text_deterministically(extracted_text)
                fallback.extraction_source = "Deterministic Field Parser (Ollama Fallback)"
                fallback.warnings.append(err)
                return fallback

    det = parse_document_text_deterministically(extracted_text)
    det.extraction_source = "Deterministic Field Parser (Ollama Offline)"
    return det

