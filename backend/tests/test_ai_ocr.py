import io
import json
import os
from pathlib import Path
import sys
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from PIL import Image
import pymupdf
import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


@pytest.fixture()
def client(tmp_path: Path):
    db_file = tmp_path / "test_phase4.db"
    os.environ["EDI_NEXUS_DATABASE_URL"] = f"sqlite:///{db_file.as_posix()}"

    import importlib
    import app.database as db_mod
    import app.models as models_mod
    import app.main as main_mod

    importlib.reload(db_mod)
    importlib.reload(models_mod)
    importlib.reload(main_mod)

    with TestClient(main_mod.app) as tc:
        yield tc


def _make_sample_pdf_bytes(text: str) -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 72), text)
    data = doc.tobytes()
    doc.close()
    return data


def _make_sample_png_bytes() -> bytes:
    img = Image.new("RGB", (400, 120), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_ollama_unavailable_fallback_across_assistant_and_explain(client: TestClient):
    with patch("app.services.ollama_client.httpx.Client") as mock_client_cls:
        mock_client_cls.return_value.__enter__.return_value.get.side_effect = ConnectionError("offline")
        health = client.get("/api/ai/health").json()
        assert health["ollama"]["overallStatus"] in ("Not Installed", "Not Running")

        q_res = client.post(
            "/api/assistant/query",
            json={"question": "Which documents require human review?"},
        )
        assert q_res.status_code == 200
        q_body = q_res.json()
        assert q_body["ollamaUsed"] is False
        assert "TXN-2026-1014" in q_body["relatedTransactionIds"]

        exp = client.post("/api/documents/TXN-2026-1014/ai-explain")
        assert exp.status_code == 200
        exp_body = exp.json()
        assert exp_body["ollamaUsed"] is False
        assert exp_body["invoiceTotal"] == "₹46,00,000"
        assert exp_body["purchaseOrderTotal"] == "₹45,00,000"
        assert exp_body["difference"] == "₹1,00,000"


def test_ollama_connected_with_local_qwen_model(client: TestClient):
    tags_resp = MagicMock()
    tags_resp.status_code = 200
    tags_resp.raise_for_status = MagicMock()
    tags_resp.json.return_value = {"models": [{"name": "qwen2.5:7b"}]}

    chat_resp = MagicMock()
    chat_resp.status_code = 200
    chat_resp.raise_for_status = MagicMock()
    chat_resp.json.return_value = {
        "message": {
            "content": "TXN-2026-1014 (INV-ABC-8824) was rejected due to a ₹1,00,000 variance against PO-MTR-2026-441."
        }
    }

    with patch("app.services.ollama_client.httpx.Client") as mock_client_cls:
        inst = mock_client_cls.return_value.__enter__.return_value
        inst.get.return_value = tags_resp
        inst.post.return_value = chat_resp

        health = client.get("/api/ai/health").json()
        assert health["ollama"]["serviceStatus"] == "Connected"
        assert health["ollama"]["modelStatus"] == "Connected"
        assert health["ollama"]["overallStatus"] == "Connected"

        res = client.post(
            "/api/assistant/query",
            json={"question": "What is the reason for rejecting TXN-2026-1014?"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["ollamaUsed"] is True
        assert "Ollama Local (qwen2.5:7b)" in data["engineLabel"]
        assert "TXN-2026-1014" in data["relatedTransactionIds"]


def test_invalid_or_missing_model_handling(client: TestClient):
    tags_resp = MagicMock()
    tags_resp.status_code = 200
    tags_resp.raise_for_status = MagicMock()
    tags_resp.json.return_value = {"models": [{"name": "llama3.2:3b"}]}

    with patch("app.services.ollama_client.httpx.Client") as mock_client_cls:
        inst = mock_client_cls.return_value.__enter__.return_value
        inst.get.return_value = tags_resp

        test_res = client.post(
            "/api/ai/test-connection",
            json={"endpoint": "http://localhost:11434", "model": "qwen2.5:7b"},
        )
        assert test_res.status_code == 200
        body = test_res.json()
        assert body["ollama"]["serviceStatus"] == "Connected"
        assert body["ollama"]["modelStatus"] == "Model Not Downloaded"
        assert body["ollama"]["overallStatus"] == "Model Not Downloaded"


def test_pdf_text_extraction_and_human_confirmation_safeguard(client: TestClient):
    pdf_bytes = _make_sample_pdf_bytes(
        "Purchase Order PO-MTR-2026-777\n"
        "Date: 2026-11-11\n"
        "Buyer: Metro Retail\n"
        "Supplier: ABC Components\n"
        "SKU: LPT-PRO-15\n"
        "Description: Enterprise Laptop\n"
        "Quantity: 10\n"
        "Unit Price: 45000\n"
        "Grand Total: 450000\n"
    )

    before_count = client.get("/api/transactions").json()["total"]

    with patch("app.services.ollama_client.httpx.Client") as mock_client_cls:
        mock_client_cls.return_value.__enter__.return_value.get.side_effect = ConnectionError("offline")
        resp = client.post(
            "/api/documents/upload",
            files={"file": ("po-777.pdf", pdf_bytes, "application/pdf")},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["extractionMethod"] == "PyMuPDF (Selectable PDF Text)"
    assert data["ocrUsed"] is False
    assert data["structured"]["document_type"] == "850"
    assert data["structured"]["document_number"] == "PO-MTR-2026-777"
    assert data["structured"]["buyer"] == "Metro Retail"
    assert data["structured"]["supplier"] == "ABC Components"
    assert data["structured"]["line_items"][0]["quantity"] == 10
    assert data["structured"]["line_items"][0]["unit_price"] == 45000.0

    # Safeguard: Uploading MUST NOT auto-save to SQLite transactions!
    after_count = client.get("/api/transactions").json()["total"]
    assert after_count == before_count


def test_missing_fields_flagged_and_invalid_json_safely_rejected(client: TestClient):
    # Sparse text -> missing fields must remain null and flagged in uncertain_fields
    sparse_pdf = _make_sample_pdf_bytes("Memorandum regarding upcoming delivery.")
    with patch("app.services.ollama_client.httpx.Client") as mock_client_cls:
        mock_client_cls.return_value.__enter__.return_value.get.side_effect = ConnectionError("offline")
        res = client.post(
            "/api/documents/upload",
            files={"file": ("sparse.pdf", sparse_pdf, "application/pdf")},
        )
    assert res.status_code == 200
    st = res.json()["structured"]
    assert st["document_number"] is None
    assert "document_number" in st["uncertain_fields"]
    assert "grand_total" in st["uncertain_fields"]

    # Invalid JSON from local model -> must not crash or accept silently
    tags_resp = MagicMock()
    tags_resp.status_code = 200
    tags_resp.raise_for_status = MagicMock()
    tags_resp.json.return_value = {"models": [{"name": "qwen2.5:7b"}]}

    bad_chat_resp = MagicMock()
    bad_chat_resp.status_code = 200
    bad_chat_resp.raise_for_status = MagicMock()
    bad_chat_resp.json.return_value = {"message": {"content": "{not valid json"}}

    with patch("app.services.ollama_client.httpx.Client") as mock_client_cls:
        inst = mock_client_cls.return_value.__enter__.return_value
        inst.get.return_value = tags_resp
        inst.post.return_value = bad_chat_resp
        res2 = client.post(
            "/api/documents/extract-structured",
            json={"extractedText": "Invoice INV-ABC-9100 Total 100000", "useAi": True},
        )
    assert res2.status_code == 200
    st2 = res2.json()
    assert st2["document_number"] == "INV-ABC-9100"
    assert any("invalid structured JSON" in w for w in st2["warnings"])


def test_ocr_image_handling_with_and_without_tesseract(client: TestClient):
    png_bytes = _make_sample_png_bytes()

    # Without Tesseract binary installed
    with patch("app.services.ocr_service.find_tesseract_binary", return_value=None):
        res = client.post(
            "/api/documents/ocr-extract",
            files={"file": ("scan.png", png_bytes, "image/png")},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["ocrUsed"] is False
        assert body["ocrAvailable"] is False
        assert "not installed" in (body["warning"] or "").lower()

    # With Tesseract binary mocked
    with (
        patch("app.services.ocr_service.find_tesseract_binary", return_value=r"C:\Tesseract\tesseract.exe"),
        patch(
            "app.services.ocr_service.pytesseract.image_to_string",
            return_value="Invoice INV-ABC-5501\nReference PO: PO-MTR-2026-441\nQuantity: 100\nUnit Price: 46000\nGrand Total: 4600000",
        ),
    ):
        res2 = client.post(
            "/api/documents/ocr-extract",
            files={"file": ("scan.png", png_bytes, "image/png")},
        )
        assert res2.status_code == 200
        body2 = res2.json()
        assert body2["ocrUsed"] is True
        assert body2["extractionMethod"] == "Pillow + Tesseract OCR"
        assert body2["structured"]["document_number"] == "INV-ABC-5501"
        assert body2["structured"]["reference_po"] == "PO-MTR-2026-441"


def test_upload_validation_rejects_bad_extensions(client: TestClient):
    res = client.post(
        "/api/documents/upload",
        files={"file": ("script.exe", b"MZ...", "application/octet-stream")},
    )
    assert res.status_code == 422
    assert "Unsupported file format" in res.json()["detail"]

