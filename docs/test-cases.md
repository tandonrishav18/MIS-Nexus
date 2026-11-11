# EDI NEXUS — Verification & Test Case Matrix

All test suites were executed after final Phase 5 code changes against isolated SQLite databases (`pytest`) and the packaged single-origin FastAPI + React build (`uvicorn` + headless Microsoft Edge CDP).

- **Backend Automated Pytest Suite (`f:\MIS\backend\tests\`)**: **19 passed, 0 failed** (`pytest -v`, `35.69s`)
- **Frontend TypeScript Check (`tsc --noEmit`)**: **Passed (exit code `0`)**
- **Frontend Production Build (`vite build`)**: **Passed (`2111` modules transformed, `13.78s`, exit code `0`, zero bundle warnings)**
- **Full-Stack Browser QA (`1440×900`, `1280×800`, `768×1024`, `390×844`)**: **Passed (exit code `0`, zero horizontal overflow, zero console/runtime errors)**

---

## 1. Core API, Seed & Deterministic Engine Tests (`test_api.py`)

| Test Case ID | Scenario | Preconditions | Test Steps | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-API-01** | Database Initialization & Idempotent Seed | Fresh SQLite DB via `EDI_NEXUS_DATABASE_URL` | Call `GET /api/health`, `/api/partners`, `/api/transactions`, `/api/mappings`. | DB creates 9 tables and seeds 3 partners (`Metro Retail`, `ABC Components`, `Kaveri Logistics`), 12 transactions, 12 X12 rules. | Verified `total=12` transactions, `len=12` mappings, all 3 partners present. | **PASS** |
| **TC-API-02** | Trading Partner Creation & Active Toggle | Backend running with seeded DB | `POST /api/partners` (`Nova Peripherals` / `NOVAPER`), then `PATCH /api/partners/{id}` with `active=false`. | Partner persists as active (`201`), then toggles cleanly (`200`). | Created `NOVAPER`, toggled `active=False`. | **PASS** |
| **TC-API-03** | Scenario 1: Purchase Order & 855 Ack | Active `Metro Retail` & `ABC Components` | `POST /api/documents` (`850`, 100 × `₹45,000`), call `/simulate-receipt` and `/simulate-ack`. | Computes `₹45,00,000`, status `Pending`, valid X12 `BEG`/`PO1`, transitions to `Accepted` with linked `855` document. | Passed (`4500000.0`, `855` linked to `PO-MTR-2026-901`). | **PASS** |
| **TC-API-04** | Scenario 2: Invoice Discrepancy & Reprocess | `PO-MTR-2026-441` (`₹45,00,000`) seeded | Submit `810` for `₹46,00,000` (`46000` unit rate), `PATCH` rate to `45000`, call `/reprocess`. | Rejects mismatch (`-₹1,00,000`) without altering `₹46,00,000`; clears to `Accepted` after operator fix. | Passed (`Rejected` at `4600000.0`, then `Accepted` after reprocess). | **PASS** |
| **TC-API-05** | `Decimal` Financial Precision with GST | Seeded partners active | Submit draft PO for qty `3` @ `10000.33` with `18%` tax. | Exact `ROUND_HALF_UP`: subtotal `30000.99`, tax `5400.18`, total `35401.17`. | Exact values confirmed (`30000.99`, `5400.18`, `35401.17`). | **PASS** |
| **TC-API-06** | Validate, Generate EDI, Reject & Approve | Seeded `TXN-2026-1014` & `TXN-2026-1013` | Call `/validate` and `/generate-edi` on `1014`; call `/reject` then `/approve` on `1013`. | `1014` stays failed and emits `BIG*` X12; `1013` transitions `Rejected` → `Accepted`. | All status transitions and `BIG*` segment verified. | **PASS** |
| **TC-API-07** | Dashboard, Reports CSV & Assistant Queries | 12 baseline records | Query `/api/dashboard/summary`, `/trends`, `/document-distribution`, `/reports/export`, `/assistant/query`. | Summary returns `12` (`8` accepted, `2` pending, `2` rejected); CSV exports; assistant identifies pending/rejected records. | Verified metrics, `text/csv` payload, and `TXN-2026-1013` / `ABC Components` replies. | **PASS** |
| **TC-API-08** | Mapping Rules CRUD & Demo Reset | 12 seeded mapping rules | Create custom rule, edit/delete, mutate ledger, then call `POST /api/settings/reset-demo`. | Mapping CRUD succeeds cleanly; reset restores clean 12-record baseline. | All mapping operations and reset verified. | **PASS** |

---

## 2. Local AI, Extraction & OCR Tests (`test_ai_ocr.py`)

| Test Case ID | Scenario | Preconditions | Test Steps | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-AI-01** | Offline Ollama Graceful Fallback | Ollama unreachable mocked (`ConnectionError`) | Call `/api/ai/health`, `/api/assistant/query`, `/api/documents/TXN-2026-1014/ai-explain`. | Reports `Not Installed`/`Not Running`; returns deterministic SQLite query answer and `₹46,00,000` vs `₹45,00,000` variance (`ollamaUsed=false`). | Passed (`TXN-2026-1014` identified, exact INR figures returned). | **PASS** |
| **TC-AI-02** | Connected Local Qwen Model Inference | Mocked Ollama `/api/tags` + `/api/chat` (`qwen2.5:7b`) | Query `/api/ai/health` and `/api/assistant/query`. | Reports `Connected`; returns grounded Qwen output (`ollamaUsed=true`, `Ollama Local (qwen2.5:7b)`). | Passed (`serviceStatus=Connected`, `ollamaUsed=True`). | **PASS** |
| **TC-AI-03** | Missing / Unpulled Model Handling | Mocked Ollama running with `llama3.2:3b` only | Probe `/api/ai/test-connection` requesting `qwen2.5:7b`. | Reports `serviceStatus=Connected`, `modelStatus=Model Not Downloaded`. | Verified exact `Model Not Downloaded` status. | **PASS** |
| **TC-AI-04** | PyMuPDF PDF Extraction & No Auto-Save | Selectable-text PDF byte stream | `POST /api/documents/upload`, then check `GET /api/transactions` count. | Extracts text via `PyMuPDF` (`ocrUsed=false`), parses fields, and leaves SQLite count unchanged prior to user confirm. | Verified `PO-MTR-2026-777`, `ocrUsed=False`, unchanged count. | **PASS** |
| **TC-AI-05** | Missing Fields Flagging & Invalid JSON Guard | Sparse PDF & malformed LLM output (`{not valid json`) | Upload sparse PDF; call `/extract-structured` with mocked invalid JSON from model. | Missing fields stay `null` in `uncertain_fields`; invalid model JSON emits warning and falls back cleanly. | Verified `uncertain_fields` and safe warning notice. | **PASS** |
| **TC-AI-06** | Image OCR With & Without Tesseract Binary | PNG bytes with `find_tesseract_binary` mocked `None` and mocked present | Upload PNG to `/api/documents/ocr-extract` under both conditions. | Returns graceful warning without crashing when absent; executes `pytesseract` when present. | Both paths verified cleanly (`200`). | **PASS** |
| **TC-AI-07** | Unsupported File Extension Rejection | `.exe` byte payload | `POST /api/documents/upload` with `malware.exe`. | Request rejected safely with HTTP `422`. | Rejected with `422`. | **PASS** |

---

## 3. End-to-End Business Scenarios, DB Integrity & Security (`test_phase5_qa.py`)

| Test Case ID | Scenario | Preconditions | Test Steps | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-QA-01** | Scenario 1 Persistence Across Restart | Isolated file-backed SQLite DB | Submit `₹45,00,000` PO (`PO-MTR-2026-951`), confirm receipt & 855 Ack, verify Reports/Dashboard, reload FastAPI app onto same DB file. | PO (`Accepted`) and linked `855` persist cleanly across full backend process restart. | Both `850` and `855` verified after app reload. | **PASS** |
| **TC-QA-02** | Scenario 2 Full Financial Discrepancy Lifecycle | Seeded `PO-MTR-2026-441` | Submit `₹46,00,000` invoice (`INV-ABC-9952`), run `/ai-explain`, `PATCH` rate to `45000`, `/reprocess`, inspect Dashboard counts. | Amount stays `4600000.0` on rejection; `₹1,00,000` variance explained; transitions cleanly to `Accepted` after operator correction. | Full lifecycle & updated dashboard metrics verified. | **PASS** |
| **TC-QA-03** | Database Integrity & State Machine Guards | Seeded DB | Test duplicate `documentNumber`, duplicate partner (`409`), unknown partner, same-party route, negative qty/price, mismatched `declaredTotal` (`422`), approving/receipt/ack on `Draft`, editing `Accepted` lines, double `855` ack (`409`), and Demo Reset. | Invalid writes roll back cleanly leaving ledger count untouched; invalid transitions blocked (`409`); reset restores 12 records. | All constraints & rollbacks verified. | **PASS** |
| **TC-QA-04** | Security, Upload Size Limit & API 404 Guard | Packaged FastAPI app | Request `/api/nonexistent-endpoint`, upload >10 MB file, upload empty file, send untrusted `Origin` CORS preflight. | Unknown API returns JSON `404` (never HTML); oversized & empty files return `422`; untrusted origin denied `Access-Control-Allow-Origin`. | All security assertions passed. | **PASS** |

---

## 4. Full-Stack Responsive & Single-Origin Browser QA (`verify_phase5_browser_qa.py`)

| Test Case ID | Scenario | Preconditions | Test Steps | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-UI-01** | 9-Screen Responsive Audit (`1440px`, `1280px`, `768px`, `390px`) | Single-origin Uvicorn (`http://127.0.0.1:8000`) serving built `frontend/dist` | Navigate all 9 routes across 4 viewport sizes in headless Microsoft Edge; measure `scrollWidth - innerWidth`; capture 9 desktop screenshots. | All 9 modules load cleanly with zero horizontal overflow (`scrollWidth <= innerWidth`). | Passed across all 36 viewport/route checks; 9 screenshots visually inspected. | **PASS** |
| **TC-UI-02** | Transaction Register Search & Filtering | `/transactions` loaded with 12 baseline items | Enter `TXN-2026-1014` in search box. | Register narrows cleanly to `INV-ABC-8824` (`ABC Components`). | Verified live filtering and row rendering. | **PASS** |
| **TC-UI-03** | UI Scenario 1 PO Lifecycle End-to-End | `/create-document` loaded | Click `Load Scenario 1` → `Submit for Processing` → `Open in Document Processing` → `Simulate Supplier Receipt` → `Simulate Supplier EDI 855 Ack`. | PO transitions to `Accepted` with confirmed `997` receipt & recorded `855` ack. | Passed cleanly in browser. | **PASS** |
| **TC-UI-04** | UI Scenario 2 Discrepancy Resolution End-to-End | `/create-document` loaded | Click `Load Scenario 2` → `Submit for Processing` → `Open in Document Processing` → verify AI explanation → `Correct Invoice Amount` → set unit price `45000` → `Save & Reprocess`. | Invoice transitions from `Rejected` to `Reprocessed & Accepted`; zero JS/console errors across entire session. | Passed cleanly with `0` console/runtime errors; demo DB reset afterwards. | **PASS** |

