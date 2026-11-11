from dataclasses import dataclass
import io
import os
import shutil
from typing import Optional

from PIL import Image, ImageOps
import pytesseract


@dataclass
class OcrStatus:
    installation_status: str  # "Connected" | "Not Installed"
    ocr_availability: str     # "Connected" | "Unavailable"
    available: bool
    binary_path: Optional[str]
    message: str


def find_tesseract_binary() -> Optional[str]:
    on_path = shutil.which("tesseract")
    if on_path:
        return on_path
    for candidate in (
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ):
        if os.path.exists(candidate):
            return candidate
    return None


def get_ocr_status() -> OcrStatus:
    binary = find_tesseract_binary()
    if binary:
        return OcrStatus(
            installation_status="Connected",
            ocr_availability="Connected",
            available=True,
            binary_path=binary,
            message=f"Tesseract OCR ready at {binary}.",
        )
    return OcrStatus(
        installation_status="Not Installed",
        ocr_availability="Unavailable",
        available=False,
        binary_path=None,
        message="Tesseract OCR binary is not installed on this machine.",
    )


def preprocess_image_for_ocr(image_bytes: bytes) -> Image.Image:
    """Apply lightweight Pillow preprocessing: EXIF orientation, grayscale, autocontrast, and min-width scaling."""
    img = Image.open(io.BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img)
    gray = img.convert("L")
    gray = ImageOps.autocontrast(gray)
    if gray.width < 1000:
        scale = 1000 / max(1, gray.width)
        new_size = (int(gray.width * scale), int(gray.height * scale))
        gray = gray.resize(new_size, Image.Resampling.BICUBIC)
    return gray


def extract_text_from_image_bytes(image_bytes: bytes) -> tuple[str, bool, Optional[str]]:
    """
    Preprocess image with Pillow and run local Tesseract OCR if installed.
    Returns (extracted_text, ocr_used, error_or_warning).
    """
    status = get_ocr_status()
    if not status.available or not status.binary_path:
        return (
            "",
            False,
            "Tesseract OCR is not installed locally. Install Tesseract OCR to scan PNG/JPG images, or enter fields manually.",
        )

    try:
        preprocessed = preprocess_image_for_ocr(image_bytes)
        pytesseract.pytesseract.tesseract_cmd = status.binary_path
        text = pytesseract.image_to_string(preprocessed)
        cleaned = text.strip()
        if not cleaned:
            return "", True, "Tesseract OCR completed but detected no readable text in the image."
        return cleaned, True, None
    except Exception as exc:
        return "", False, f"Image OCR failed: {exc}"
