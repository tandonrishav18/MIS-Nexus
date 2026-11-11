import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Ensure backend root is importable
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


@pytest.fixture()
def client(tmp_path: Path):
    db_file = tmp_path / "test_edi_nexus.db"
    os.environ["EDI_NEXUS_DATABASE_URL"] = f"sqlite:///{db_file.as_posix()}"

    # Reload database & app modules cleanly per isolated test DB
    import importlib
    import app.database as db_mod
    import app.models as models_mod
    import app.main as main_mod

    importlib.reload(db_mod)
    importlib.reload(models_mod)
    importlib.reload(main_mod)

    with TestClient(main_mod.app) as tc:
        yield tc


def test_db_initialization_and_idempotent_seed(client: TestClient):
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    partners = client.get("/api/partners").json()
    names = {p["name"] for p in partners}
    assert {"Metro Retail", "ABC Components", "Kaveri Logistics"} <= names

    txns = client.get("/api/transactions").json()
    assert txns["total"] == 12

    mappings = client.get("/api/mappings").json()
    assert len(mappings) == 12


def test_partner_creation_and_toggle(client: TestClient):
    res = client.post(
        "/api/partners",
        json={
            "name": "Nova Peripherals",
            "role": "Supplier",
            "partnerCode": "NOVAPER",
            "isaQualifier": "ZZ",
            "isaId": "NOVAPERIPH01",
            "gsId": "NOVASALES",
            "supportedDocs": ["850", "855", "810"],
            "active": True,
            "city": "Hyderabad",
        },
    )
    assert res.status_code == 201
    created = res.json()
    assert created["partnerCode"] == "NOVAPER"
    assert created["active"] is True

    toggled = client.patch(f"/api/partners/{created['id']}", json={"active": False})
    assert toggled.status_code == 200
    assert toggled.json()["active"] is False


def test_scenario1_purchase_order_and_855_ack(client: TestClient):
    res = client.post(
        "/api/documents",
        json={
            "documentType": "850",
            "documentNumber": "PO-MTR-2026-901",
            "documentDate": "2026-11-11",
            "sender": "Metro Retail",
            "receiver": "ABC Components",
            "taxRatePct": "0",
            "summary": "Scenario 1: 100 laptops",
            "lineItems": [
                {
                    "sku": "LPT-PRO-15",
                    "description": "Enterprise Laptop 15",
                    "quantity": 100,
                    "unitPrice": "45000",
                }
            ],
            "mode": "submit",
        },
    )
    assert res.status_code == 201
    po = res.json()
    assert po["transactionId"] == "TXN-2026-1015"
    assert po["amount"] == 4500000.0
    assert po["status"] == "Pending"
    assert po["ackStatus"] == "Awaiting Ack"
    assert "BEG*00*NE*PO-MTR-2026-901" in po["ediPayload"]
    assert "PO1*1*100*EA*45000" in po["ediPayload"]

    # Simulate receipt & 855 Ack
    rcpt = client.post(f"/api/documents/{po['transactionId']}/simulate-receipt")
    assert rcpt.status_code == 200
    assert rcpt.json()["supplierReceiptSimulated"] is True

    ack_res = client.post(f"/api/documents/{po['transactionId']}/simulate-ack")
    assert ack_res.status_code == 200
    ack_data = ack_res.json()
    assert ack_data["po"]["status"] == "Accepted"
    assert ack_data["po"]["ackStatus"] == "Acknowledged"
    assert ack_data["ack"]["documentType"] == "855"
    assert ack_data["ack"]["referencePo"] == "PO-MTR-2026-901"


def test_scenario2_invoice_mismatch_correction_and_reprocess(client: TestClient):
    # Submit ₹46,00,000 invoice against PO-MTR-2026-441 (₹45,00,000)
    res = client.post(
        "/api/documents",
        json={
            "documentType": "810",
            "documentNumber": "INV-ABC-9901",
            "documentDate": "2026-11-11",
            "sender": "ABC Components",
            "receiver": "Metro Retail",
            "referencePo": "PO-MTR-2026-441",
            "taxRatePct": "0",
            "summary": "Scenario 2: Mismatched laptop invoice",
            "lineItems": [
                {
                    "sku": "LPT-PRO-15",
                    "description": "Enterprise Laptop 15",
                    "quantity": 100,
                    "unitPrice": "46000",
                }
            ],
            "mode": "submit",
        },
    )
    assert res.status_code == 201
    inv = res.json()
    # Must NOT silently alter ₹46,00,000 amount
    assert inv["amount"] == 4600000.0
    assert inv["status"] == "Rejected"
    assert "₹1,00,000" in (inv["exceptionReason"] or "")

    # Human correction to ₹45,000 unit price (₹45,00,000)
    patch_res = client.patch(
        f"/api/transactions/{inv['transactionId']}",
        json={
            "lineItems": [
                {
                    "sku": "LPT-PRO-15",
                    "description": "Enterprise Laptop 15",
                    "quantity": 100,
                    "unitPrice": "45000",
                }
            ],
            "taxRatePct": "0",
            "reviewerNotes": "Corrected per credit memo",
        },
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["amount"] == 4500000.0

    # Reprocess
    reproc = client.post(f"/api/documents/{inv['transactionId']}/reprocess")
    assert reproc.status_code == 200
    body = reproc.json()
    assert body["passed"] is True
    assert body["transaction"]["status"] == "Accepted"
    assert body["transaction"]["exceptionReason"] is None


def test_decimal_financial_calculation_with_tax(client: TestClient):
    res = client.post(
        "/api/documents",
        json={
            "documentType": "850",
            "documentNumber": "PO-MTR-2026-999",
            "documentDate": "2026-11-11",
            "sender": "Metro Retail",
            "receiver": "ABC Components",
            "taxRatePct": "18",
            "summary": "Tax calculation check",
            "lineItems": [
                {"sku": "MON-27", "description": "Monitor", "quantity": 3, "unitPrice": "10000.33"}
            ],
            "mode": "draft",
        },
    )
    assert res.status_code == 201
    data = res.json()
    # 3 * 10000.33 = 30000.99; 18% = 5400.1782 -> 5400.18; total = 35401.17
    assert data["subtotal"] == 30000.99
    assert data["taxAmount"] == 5400.18
    assert data["amount"] == 35401.17


def test_approve_reject_validate_generate_edi(client: TestClient):
    val = client.post("/api/documents/TXN-2026-1014/validate")
    assert val.status_code == 200
    assert any(c["status"] == "fail" for c in val.json()["validationResults"])

    gen = client.post("/api/documents/TXN-2026-1014/generate-edi")
    assert gen.status_code == 200
    assert "BIG*" in gen.json()["ediPayload"]

    rej = client.post(
        "/api/documents/TXN-2026-1013/reject",
        json={"reason": "Budget hold"},
    )
    assert rej.status_code == 200
    assert rej.json()["status"] == "Rejected"

    app_res = client.post(
        "/api/documents/TXN-2026-1013/approve",
        json={"note": "Budget approved by CFO"},
    )
    assert app_res.status_code == 200
    assert app_res.json()["status"] == "Accepted"


def test_dashboard_reports_csv_and_assistant_queries(client: TestClient):
    summary = client.get("/api/dashboard/summary").json()
    assert summary["totalTransactions"] == 12
    assert summary["acceptedDocuments"] == 8
    assert summary["pendingTransactions"] == 2
    assert summary["rejectedDocuments"] == 2

    trends = client.get("/api/dashboard/trends").json()
    assert len(trends) >= 5

    dist = client.get("/api/dashboard/document-distribution").json()
    assert sum(d["count"] for d in dist) == 12

    csv_resp = client.get("/api/reports/export")
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]
    assert "TXN-2026-1014" in csv_resp.text

    q1 = client.post("/api/assistant/query", json={"question": "How many transactions are pending?"}).json()
    assert "2 pending transaction" in q1["reply"]
    assert "TXN-2026-1013" in q1["relatedTransactionIds"]

    q2 = client.post("/api/assistant/query", json={"question": "Which trading partner has the most rejected documents?"}).json()
    assert "ABC Components" in q2["reply"]


def test_mappings_crud_and_demo_reset(client: TestClient):
    created = client.post(
        "/api/mappings",
        json={
            "documentType": "850",
            "sourceField": "Buyer GSTIN",
            "sourcePath": "buyer.gstin",
            "ediSegment": "REF",
            "ediElement": "REF02",
            "ediDescription": "Tax registration ID",
            "transformRule": "UPPER(value)",
            "status": "Custom",
            "required": False,
        },
    )
    assert created.status_code == 201
    rule = created.json()

    patched = client.patch(f"/api/mappings/{rule['id']}", json={"ediElement": "REF03"})
    assert patched.status_code == 200
    assert patched.json()["ediElement"] == "REF03"

    deleted = client.delete(f"/api/mappings/{rule['id']}")
    assert deleted.status_code == 204

    # Create extra doc then reset
    client.post(
        "/api/documents",
        json={
            "documentType": "850",
            "documentNumber": "PO-TMP-1",
            "documentDate": "2026-11-11",
            "sender": "Metro Retail",
            "receiver": "ABC Components",
            "taxRatePct": "0",
            "lineItems": [{"sku": "X1", "description": "Item", "quantity": 1, "unitPrice": "100"}],
            "mode": "draft",
        },
    )
    assert client.get("/api/transactions").json()["total"] == 13

    reset = client.post("/api/settings/reset-demo")
    assert reset.status_code == 200
    assert client.get("/api/transactions").json()["total"] == 12

