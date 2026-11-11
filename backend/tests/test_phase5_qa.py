import importlib
import os
from pathlib import Path
import sys

from fastapi.testclient import TestClient
import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _boot_app_with_db(db_file: Path):
    os.environ["EDI_NEXUS_DATABASE_URL"] = f"sqlite:///{db_file.as_posix()}"
    import app.database as db_mod
    import app.models as models_mod
    import app.main as main_mod

    importlib.reload(db_mod)
    importlib.reload(models_mod)
    importlib.reload(main_mod)
    return main_mod.app


@pytest.fixture()
def db_and_client(tmp_path: Path):
    db_file = tmp_path / "phase5_qa.db"
    fastapi_app = _boot_app_with_db(db_file)
    with TestClient(fastapi_app) as tc:
        yield db_file, tc


def test_scenario1_end_to_end_and_restart_persistence(db_and_client):
    db_file, client = db_and_client
    before_summary = client.get("/api/dashboard/summary").json()

    # 1. Metro Retail creates Purchase Order: 100 laptops @ ₹45,000 = ₹45,00,000
    create_res = client.post(
        "/api/documents",
        json={
            "documentType": "850",
            "documentNumber": "PO-MTR-2026-951",
            "documentDate": "2026-11-11",
            "sender": "Metro Retail",
            "receiver": "ABC Components",
            "taxRatePct": "0",
            "summary": "Phase 5 E2E Scenario 1: Enterprise Laptops",
            "lineItems": [
                {
                    "sku": "LPT-PRO-15",
                    "description": "Enterprise Laptop 15 i7",
                    "quantity": 100,
                    "unitPrice": "45000",
                }
            ],
            "declaredTotal": "4500000",
            "mode": "submit",
        },
    )
    assert create_res.status_code == 201
    po = create_res.json()
    po_txn_id = po["transactionId"]
    assert po["amount"] == 4500000.0
    assert po["status"] == "Pending"
    assert po["ackStatus"] == "Awaiting Ack"
    assert "ISA*" in po["ediPayload"]
    assert "BEG*00*NE*PO-MTR-2026-951" in po["ediPayload"]
    assert all(c["status"] == "pass" for c in po["validationResults"])

    # 2. Simulate supplier receipt + EDI 855 acknowledgement
    rcpt = client.post(f"/api/documents/{po_txn_id}/simulate-receipt")
    assert rcpt.status_code == 200
    assert rcpt.json()["supplierReceiptSimulated"] is True

    ack_res = client.post(f"/api/documents/{po_txn_id}/simulate-ack")
    assert ack_res.status_code == 200
    ack_payload = ack_res.json()
    assert ack_payload["po"]["status"] == "Accepted"
    assert ack_payload["po"]["ackStatus"] == "Acknowledged"
    ack_txn_id = ack_payload["ack"]["transactionId"]
    assert ack_payload["ack"]["documentType"] == "855"

    # 3. Verify Dashboard & Reports updated (+2 transactions: 850 + 855)
    after_summary = client.get("/api/dashboard/summary").json()
    assert after_summary["totalTransactions"] == before_summary["totalTransactions"] + 2
    assert after_summary["acceptedDocuments"] == before_summary["acceptedDocuments"] + 2

    reports_csv = client.get("/api/reports/export")
    assert reports_csv.status_code == 200
    assert "PO-MTR-2026-951" in reports_csv.text
    assert ack_txn_id in reports_csv.text

    # 4. Simulate full FastAPI application restart on same SQLite DB
    restarted_app = _boot_app_with_db(db_file)
    with TestClient(restarted_app) as restarted_client:
        persisted_po = restarted_client.get(f"/api/transactions/{po_txn_id}")
        assert persisted_po.status_code == 200
        assert persisted_po.json()["status"] == "Accepted"
        assert persisted_po.json()["documentNumber"] == "PO-MTR-2026-951"

        persisted_ack = restarted_client.get(f"/api/transactions/{ack_txn_id}")
        assert persisted_ack.status_code == 200
        assert persisted_ack.json()["referencePo"] == "PO-MTR-2026-951"


def test_scenario2_invoice_discrepancy_explain_correct_reprocess(db_and_client):
    _db_file, client = db_and_client
    before_summary = client.get("/api/dashboard/summary").json()

    # 1. ABC Components submits ₹46,00,000 invoice against ₹45,00,000 PO-MTR-2026-441
    inv_res = client.post(
        "/api/documents",
        json={
            "documentType": "810",
            "documentNumber": "INV-ABC-9952",
            "documentDate": "2026-11-11",
            "sender": "ABC Components",
            "receiver": "Metro Retail",
            "referencePo": "PO-MTR-2026-441",
            "taxRatePct": "0",
            "summary": "Phase 5 E2E Scenario 2: Invoice Discrepancy",
            "lineItems": [
                {
                    "sku": "LPT-PRO-15",
                    "description": "Enterprise Laptop 15 i7",
                    "quantity": 100,
                    "unitPrice": "46000",
                }
            ],
            "mode": "submit",
        },
    )
    assert inv_res.status_code == 201
    inv = inv_res.json()
    inv_id = inv["transactionId"]
    # Must NOT silently modify submitted financial total
    assert inv["amount"] == 4600000.0
    assert inv["status"] == "Rejected"
    assert "₹1,00,000" in (inv["exceptionReason"] or "")

    # 2. Explain discrepancy (offline deterministic or local AI)
    explain = client.post(f"/api/documents/{inv_id}/ai-explain")
    assert explain.status_code == 200
    exp_body = explain.json()
    assert exp_body["invoiceTotal"] == "₹46,00,000"
    assert exp_body["purchaseOrderTotal"] == "₹45,00,000"
    assert exp_body["difference"] == "₹1,00,000"

    # 3. Human correction + Reprocess
    patch_res = client.patch(
        f"/api/transactions/{inv_id}",
        json={
            "lineItems": [
                {
                    "sku": "LPT-PRO-15",
                    "description": "Enterprise Laptop 15 i7",
                    "quantity": 100,
                    "unitPrice": "45000",
                }
            ],
            "taxRatePct": "0",
            "reviewerNotes": "Adjusted rate to match contracted PO ₹45,000/unit",
        },
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["amount"] == 4500000.0
    assert patch_res.json()["status"] == "Processing"

    reproc = client.post(f"/api/documents/{inv_id}/reprocess")
    assert reproc.status_code == 200
    assert reproc.json()["passed"] is True
    assert reproc.json()["transaction"]["status"] == "Accepted"
    assert reproc.json()["transaction"]["exceptionReason"] is None

    after_summary = client.get("/api/dashboard/summary").json()
    assert after_summary["acceptedDocuments"] == before_summary["acceptedDocuments"] + 1
    assert after_summary["rejectedDocuments"] == before_summary["rejectedDocuments"]


def test_database_integrity_validation_and_invalid_transitions(db_and_client):
    _db_file, client = db_and_client
    baseline_total = client.get("/api/transactions").json()["total"]

    # Duplicate document number -> 409
    dup_doc = client.post(
        "/api/documents",
        json={
            "documentType": "850",
            "documentNumber": "PO-MTR-2026-441",
            "documentDate": "2026-11-11",
            "sender": "Metro Retail",
            "receiver": "ABC Components",
            "lineItems": [{"sku": "X1", "description": "Item", "quantity": 1, "unitPrice": "100"}],
            "mode": "draft",
        },
    )
    assert dup_doc.status_code == 409

    # Duplicate partner -> 409
    dup_partner = client.post(
        "/api/partners",
        json={
            "name": "Metro Retail",
            "role": "Buyer",
            "partnerCode": "METRO-DUP",
            "isaId": "DUP01",
            "gsId": "DUPGS",
            "supportedDocs": ["850"],
        },
    )
    assert dup_partner.status_code == 409

    # Unknown partner reference -> 422
    bad_partner = client.post(
        "/api/documents",
        json={
            "documentType": "850",
            "documentNumber": "PO-UNK-999",
            "documentDate": "2026-11-11",
            "sender": "Unregistered Buyer LLC",
            "receiver": "ABC Components",
            "lineItems": [{"sku": "X1", "description": "Item", "quantity": 1, "unitPrice": "100"}],
            "mode": "submit",
        },
    )
    assert bad_partner.status_code == 422

    # Same sender and receiver -> 422
    same_party = client.post(
        "/api/documents",
        json={
            "documentType": "850",
            "documentNumber": "PO-SELF-999",
            "documentDate": "2026-11-11",
            "sender": "Metro Retail",
            "receiver": "Metro Retail",
            "lineItems": [{"sku": "X1", "description": "Item", "quantity": 1, "unitPrice": "100"}],
            "mode": "submit",
        },
    )
    assert same_party.status_code == 422

    # Negative quantity / unit price -> 422
    neg_qty = client.post(
        "/api/documents",
        json={
            "documentType": "850",
            "documentNumber": "PO-NEG-999",
            "documentDate": "2026-11-11",
            "sender": "Metro Retail",
            "receiver": "ABC Components",
            "lineItems": [{"sku": "X1", "description": "Item", "quantity": -5, "unitPrice": "100"}],
            "mode": "submit",
        },
    )
    assert neg_qty.status_code == 422

    neg_price = client.post(
        "/api/documents",
        json={
            "documentType": "850",
            "documentNumber": "PO-NEGP-999",
            "documentDate": "2026-11-11",
            "sender": "Metro Retail",
            "receiver": "ABC Components",
            "lineItems": [{"sku": "X1", "description": "Item", "quantity": 2, "unitPrice": "-100"}],
            "mode": "submit",
        },
    )
    assert neg_price.status_code == 422

    # Incorrect declared document total -> 422
    bad_total = client.post(
        "/api/documents",
        json={
            "documentType": "850",
            "documentNumber": "PO-TOT-999",
            "documentDate": "2026-11-11",
            "sender": "Metro Retail",
            "receiver": "ABC Components",
            "lineItems": [{"sku": "X1", "description": "Item", "quantity": 2, "unitPrice": "500"}],
            "declaredTotal": "999999",
            "mode": "submit",
        },
    )
    assert bad_total.status_code == 422

    # Ledger count must be completely unchanged after all failed validations
    assert client.get("/api/transactions").json()["total"] == baseline_total

    # Invalid status transitions on Draft PO
    draft_po = client.post(
        "/api/documents",
        json={
            "documentType": "850",
            "documentNumber": "PO-DRAFT-999",
            "documentDate": "2026-11-11",
            "sender": "Metro Retail",
            "receiver": "ABC Components",
            "lineItems": [{"sku": "X1", "description": "Item", "quantity": 2, "unitPrice": "500"}],
            "mode": "draft",
        },
    ).json()
    draft_id = draft_po["transactionId"]

    assert client.post(f"/api/documents/{draft_id}/approve", json={}).status_code == 409
    assert client.post(f"/api/documents/{draft_id}/simulate-receipt").status_code == 409
    assert client.post(f"/api/documents/{draft_id}/simulate-ack").status_code == 409

    # Cannot modify line items on an already Accepted transaction
    lock_err = client.patch(
        "/api/transactions/TXN-2026-1010",
        json={
            "lineItems": [{"sku": "LPT-PRO-15", "description": "Tampered", "quantity": 1, "unitPrice": "1"}],
        },
    )
    assert lock_err.status_code == 409

    # Cannot duplicate EDI 855 ack on already acknowledged PO
    assert client.post("/api/documents/TXN-2026-1010/simulate-ack").status_code == 409

    # Reset Demo restores exact baseline (12 records)
    reset_res = client.post("/api/settings/reset-demo")
    assert reset_res.status_code == 200
    assert client.get("/api/transactions").json()["total"] == 12


def test_security_upload_limits_cors_and_api_404(db_and_client):
    _db_file, client = db_and_client

    # Unknown API route must return 404 JSON, never HTML SPA fallback
    missing_api = client.get("/api/nonexistent-endpoint")
    assert missing_api.status_code == 404
    assert "application/json" in missing_api.headers["content-type"]

    # Oversized upload (> 10 MB) -> 422
    huge = b"A" * (10 * 1024 * 1024 + 32)
    big_res = client.post(
        "/api/documents/upload",
        files={"file": ("oversized.pdf", huge, "application/pdf")},
    )
    assert big_res.status_code == 422

    # Empty upload -> 422
    empty_res = client.post(
        "/api/documents/upload",
        files={"file": ("empty.pdf", b"", "application/pdf")},
    )
    assert empty_res.status_code == 422

    # Untrusted origin denied by CORS preflight
    cors_res = client.options(
        "/api/transactions",
        headers={
            "Origin": "https://untrusted.example.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert "access-control-allow-origin" not in cors_res.headers

