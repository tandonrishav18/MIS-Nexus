from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import (
    ApproveRequestIn,
    DocumentAiExplainOut,
    DocumentCreateIn,
    RejectRequestIn,
    TransactionOut,
)
from app.services.ai_assistant import explain_transaction_exception
from app.services.document_extraction import extract_text_from_document
from app.services.serializers import serialize_transaction
from app.services.structured_extraction import extract_structured_document
from app.services.workflow import (
    approve_in_db,
    create_document_transaction,
    generate_edi_in_db,
    get_transaction_or_404,
    reject_in_db,
    reprocess_in_db,
    simulate_ack_855_in_db,
    simulate_receipt_in_db,
    validate_in_db,
)

router = APIRouter(prefix="/api/documents", tags=["Documents"])


class StructuredExtractionRequest(BaseModel):
    extractedText: str = Field(..., min_length=1, max_length=30000)
    useAi: bool = True


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_document(payload: DocumentCreateIn, db: Session = Depends(get_db)):
    txn = create_document_transaction(db, payload)
    return serialize_transaction(txn)


@router.post("/upload")
@router.post("/ocr-extract")
async def upload_and_extract_document(
    file: UploadFile = File(...),
    use_ai: bool = True,
    db: Session = Depends(get_db),
):
    """
    Validate extension/size (PDF/PNG/JPG/JPEG <= 10MB), extract text via PyMuPDF or Tesseract OCR,
    and convert extracted text to Pydantic-validated structured JSON for human review.
    Never saves automatically to SQLite transactions without explicit user confirmation.
    """
    content = await file.read()
    filename = file.filename or "document.pdf"
    try:
        text_res = extract_text_from_document(filename, content)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    structured = extract_structured_document(db, text_res.extracted_text, use_ai=use_ai)
    return {
        "filename": text_res.filename,
        "fileExtension": text_res.file_extension,
        "fileSizeBytes": text_res.file_size_bytes,
        "pageCount": text_res.page_count,
        "extractionMethod": text_res.extraction_method,
        "ocrUsed": text_res.ocr_used,
        "ocrAvailable": text_res.ocr_available_or_not_needed,
        "extractedText": text_res.extracted_text,
        "warning": text_res.warning,
        "structured": structured.model_dump(),
    }


@router.post("/extract-structured")
def extract_structured_from_text(
    payload: StructuredExtractionRequest,
    db: Session = Depends(get_db),
):
    structured = extract_structured_document(db, payload.extractedText, use_ai=payload.useAi)
    return structured.model_dump()


@router.get("/{identifier}", response_model=TransactionOut)
def get_document(identifier: str, db: Session = Depends(get_db)):
    txn = get_transaction_or_404(db, identifier)
    return serialize_transaction(txn)


@router.post("/{identifier}/validate", response_model=TransactionOut)
def validate_document(identifier: str, db: Session = Depends(get_db)):
    txn = validate_in_db(db, identifier)
    return serialize_transaction(txn)


@router.post("/{identifier}/generate-edi", response_model=TransactionOut)
def generate_document_edi(identifier: str, db: Session = Depends(get_db)):
    txn = generate_edi_in_db(db, identifier)
    return serialize_transaction(txn)


@router.post("/{identifier}/approve", response_model=TransactionOut)
def approve_document(
    identifier: str,
    body: ApproveRequestIn | None = None,
    db: Session = Depends(get_db),
):
    txn = approve_in_db(db, identifier, body.note if body else None)
    return serialize_transaction(txn)


@router.post("/{identifier}/reject", response_model=TransactionOut)
def reject_document(
    identifier: str,
    body: RejectRequestIn,
    db: Session = Depends(get_db),
):
    txn = reject_in_db(db, identifier, body.reason)
    return serialize_transaction(txn)


@router.post("/{identifier}/reprocess")
def reprocess_document(identifier: str, db: Session = Depends(get_db)):
    txn, passed = reprocess_in_db(db, identifier)
    return {"passed": passed, "transaction": serialize_transaction(txn)}


@router.post("/{identifier}/simulate-receipt", response_model=TransactionOut)
def simulate_supplier_receipt(identifier: str, db: Session = Depends(get_db)):
    txn = simulate_receipt_in_db(db, identifier)
    return serialize_transaction(txn)


@router.post("/{identifier}/simulate-ack")
def simulate_ack_855(identifier: str, db: Session = Depends(get_db)):
    res = simulate_ack_855_in_db(db, identifier)
    return {
        "po": serialize_transaction(res["po"]),
        "ack": serialize_transaction(res["ack"]),
    }


@router.post("/{identifier}/ai-explain", response_model=DocumentAiExplainOut)
def ai_explain_document(identifier: str, db: Session = Depends(get_db)):
    txn = get_transaction_or_404(db, identifier)
    return explain_transaction_exception(db, txn)
