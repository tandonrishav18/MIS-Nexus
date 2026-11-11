from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import pymupdf

from app.services.ocr_service import extract_text_from_image_bytes

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


@dataclass
class DocumentTextExtractionResult:
    filename: str
    file_extension: str
    file_size_bytes: int
    extraction_method: str
    ocr_used: bool
    ocr_available_or_not_needed: bool
    extracted_text: str
    page_count: int
    warning: Optional[str] = None


def validate_upload_file(filename: str, content_bytes: bytes) -> tuple[str, int]:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file format '{ext or 'unknown'}'. Allowed formats: PDF, PNG, JPG, JPEG."
        )
    size = len(content_bytes)
    if size == 0:
        raise ValueError("Uploaded file is empty.")
    if size > MAX_UPLOAD_BYTES:
        raise ValueError(
            f"File exceeds 10 MB limit ({size / (1024 * 1024):.1f} MB uploaded)."
        )
    return ext, size


def extract_text_from_document(
    filename: str,
    content_bytes: bytes,
) -> DocumentTextExtractionResult:
    """
    Extract text locally from PDF (PyMuPDF selectable text first, OCR fallback for scanned pages)
    or PNG/JPG/JPEG images (Pillow preprocessing + Tesseract OCR).
    """
    ext, size = validate_upload_file(filename, content_bytes)

    if ext == ".pdf":
        try:
            doc = pymupdf.open(stream=content_bytes, filetype="pdf")
        except Exception as exc:
            raise ValueError(f"Could not open PDF document: {exc}") from exc

        page_count = doc.page_count
        page_texts = [page.get_text("text").strip() for page in doc]
        selectable_text = "\n\n".join(t for t in page_texts if t).strip()

        # Extract selectable PDF text directly before attempting OCR
        if len(selectable_text) >= 15:
            return DocumentTextExtractionResult(
                filename=filename,
                file_extension=ext,
                file_size_bytes=size,
                extraction_method="PyMuPDF (Selectable PDF Text)",
                ocr_used=False,
                ocr_available_or_not_needed=True,
                extracted_text=selectable_text,
                page_count=page_count,
                warning=None,
            )

        # Scanned PDF fallback -> render up to first 3 pages and run local OCR
        ocr_chunks: list[str] = []
        ocr_used_any = False
        last_warn: Optional[str] = None
        for idx in range(min(page_count, 3)):
            pix = doc.load_page(idx).get_pixmap(dpi=200)
            txt, used, warn = extract_text_from_image_bytes(pix.tobytes("png"))
            if used:
                ocr_used_any = True
            if txt:
                ocr_chunks.append(txt)
            if warn:
                last_warn = warn

        combined = "\n\n".join(ocr_chunks).strip()
        if not combined:
            return DocumentTextExtractionResult(
                filename=filename,
                file_extension=ext,
                file_size_bytes=size,
                extraction_method="Scanned PDF (OCR Required)",
                ocr_used=ocr_used_any,
                ocr_available_or_not_needed=False,
                extracted_text="",
                page_count=page_count,
                warning=last_warn
                or "No selectable text found in PDF and OCR could not extract text. Enter fields manually.",
            )

        return DocumentTextExtractionResult(
            filename=filename,
            file_extension=ext,
            file_size_bytes=size,
            extraction_method="PyMuPDF Render + Tesseract OCR",
            ocr_used=True,
            ocr_available_or_not_needed=True,
            extracted_text=combined,
            page_count=page_count,
            warning=last_warn,
        )

    # Image formats (.png, .jpg, .jpeg)
    text, ocr_used, warn = extract_text_from_image_bytes(content_bytes)
    return DocumentTextExtractionResult(
        filename=filename,
        file_extension=ext,
        file_size_bytes=size,
        extraction_method="Pillow + Tesseract OCR" if ocr_used else "OCR Unavailable",
        ocr_used=ocr_used,
        ocr_available_or_not_needed=bool(text),
        extracted_text=text,
        page_count=1,
        warning=warn,
    )
