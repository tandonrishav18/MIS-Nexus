# EDI NEXUS — System Architecture

## 1. High-Level Overview

EDI NEXUS uses a two-tier local web architecture with an optional local-AI and document-extraction layer. Every financial computation, validation rule, and transaction state transition executes deterministically in Python against an embedded SQLite database.

```text
+-------------------------------------------------------------------+
|               Browser Client (React 18 + TypeScript)              |
|  Dashboard | Register | Create | Partners | Processing | Mapping  |
|  AI Assistant | Reports & Analytics | System Settings              |
+------------------------------+------------------------------------+
                               | Relative /api HTTP (JSON + FormData)
                               v
+-------------------------------------------------------------------+
|                 FastAPI Application (:8000)                        |
|  - SPA Static File & Fallback Server (serves frontend/dist in prod)|
|  - Routers: dashboard, transactions, documents, partners,          |
|             mappings, reports, assistant, ai, settings             |
|  - Validation, Decimal Finance, EDI X12 Translator, Audit Trail    |
+---------------+----------------------------------+----------------+
                |                                  | Optional Local
                v                                  v
+-------------------------------+  +--------------------------------+
|     SQLite (edi_nexus.db)     |  |  Local AI & Extraction Layer   |
|  9 Relational Tables with     |  |  - PyMuPDF (selectable PDFs)   |
|  Numeric(14,2) Decimal Money  |  |  - Pillow + Tesseract OCR      |
|  & Foreign Key Enforcement    |  |  - Ollama Local HTTP API       |
+-------------------------------+  +--------------------------------+
```

---

## 2. Frontend Architecture

- **Framework & Styling**: React 18, TypeScript (`strict`), Tailwind CSS, custom Radix UI-wrapped primitives (`Badge`, `Button`, `Card`, `Dialog`, `DropdownMenu`, `Input`, `Table`, `Tabs`), Recharts (`ResponsiveContainer`, `AreaChart`, `BarChart`, `PieChart`), and self-hosted fonts (`Inter`, `JetBrains Mono`).
- **Central State Store**: `EdiStoreContext` ([frontend/src/context/EdiStoreContext.tsx](../frontend/src/context/EdiStoreContext.tsx)) hydrates dashboard/register/partner/mapping/settings state from `/api/*` and dispatches all writes directly to FastAPI so UI telemetry never diverges from SQLite.
- **Responsive Application Shell**: Fixed left `Sidebar` on desktop (`>= 1024px`) collapsing into an accessible slide-out drawer on tablet/mobile (`< 1024px`), paired with a compact `Topbar` supporting global transaction/document/partner search and SLA notifications.
- **Bundle Packaging**: [frontend/vite.config.ts](../frontend/vite.config.ts) splits chunks into `vendor-react`, `vendor-charts`, `vendor-radix`, `vendor-icons`, and application bundles, keeping every JavaScript artifact well below 350 kB.

---

## 3. Backend Architecture

### API Layer (`backend/app/routers/`)
- `GET /api/health` & packaged SPA handler in [main.py](../backend/app/main.py).
- **Dashboard** (`/api/dashboard/summary`, `/api/dashboard/trends`, `/api/dashboard/document-distribution`).
- **Transactions** (`/api/transactions` CRUD + filter/sort/pagination + delete protection on seeded records).
- **Documents** (`/api/documents`, `/upload`, `/ocr-extract`, `/extract-structured`, `/{id}/validate`, `/{id}/generate-edi`, `/{id}/approve`, `/{id}/reject`, `/{id}/reprocess`, `/{id}/simulate-receipt`, `/{id}/simulate-ack`, `/{id}/ai-explain`).
- **Partners** (`/api/partners` list, detail, create, update/toggle).
- **Mappings** (`/api/mappings` list, create, edit, delete non-required rules).
- **Reports** (`/api/reports/summary`, `/partners`, `/exceptions`, `/export` UTF-8 BOM CSV stream).
- **Assistant & Local AI** (`/api/assistant/query`, `/api/ai/health`, `/api/ai/models`, `/api/ai/test-connection`, `/api/ai/query`).
- **Settings** (`/api/settings`, `/reset-demo`, `/capabilities`, `/test-ollama`).

### Business Logic Layer (`backend/app/services/`)
- **Financial Precision** ([finance.py](../backend/app/services/finance.py)): Uses `decimal.Decimal` (`ROUND_HALF_UP`) exclusively for line totals, subtotals, GST computation, and Indian numbering format (`₹45,00,000`).
- **Deterministic Validator** ([validator.py](../backend/app/services/validator.py)): Evaluates 5 explicit rules (`REQ_HEADER`, `PARTNER_ELIGIBLE`, `LINE_POSITIVE`, `TOTAL_RECONCILE`, and `PO_AMOUNT_MATCH` for `810` invoices against referenced `850` purchase orders).
- **EDI Translation Engine** ([edi_engine.py](../backend/app/services/edi_engine.py)): Generates ANSI X12 `ISA` / `GS` / `ST` / `BEG` or `BIG` / `N1` / `PO1` or `IT1` / `CTT` / `TDS` / `SE` / `GE` / `IEA` payloads dynamically using SQLite partner routing IDs, delimiter settings, and active mapping rules.
- **State Machine & Safeguards** ([workflow.py](../backend/app/services/workflow.py)): Enforces distinct buyer/supplier, registered trading partners, unique document numbers, declared-total reconciliation, state transition guards (preventing line edits on `Accepted` records, preventing double `855` acks, preventing receipt/approval on `Draft` transactions), and immutable `ProcessingEvent` logging.

---

## 4. Database Architecture

SQLite (`backend/edi_nexus.db`) runs with `PRAGMA foreign_keys=ON` and explicit session rollback on uncaught exceptions ([database.py](../backend/app/database.py)).

| Table | Purpose & Key Relationships |
| :--- | :--- |
| `trading_partners` | Unique partner name & `partner_code`, ISA/GS routing metadata, JSON supported X12 doc list |
| `transactions` | Authoritative ledger row (`transaction_id` unique), FK to sender/receiver partners (`SET NULL`), `Numeric(14,2)` amount, status, exception reason |
| `documents` | 1:1 child of `transactions` (`ON DELETE CASCADE`), `document_number`, `reference_po`, tax & totals, ANSI X12 string |
| `document_line_items` | Many:1 children of `documents` (`ON DELETE CASCADE`), SKU, qty, `Numeric(14,2)` unit price & line total |
| `validation_results` | Many:1 deterministic rule outcomes per transaction (`pass` / `warning` / `fail`) |
| `processing_events` | Immutable audit log steps (creation, validation, EDI translation, receipt, 855 ack, corrections, approvals) |
| `acknowledgements` | 1:1 `855` acknowledgement link and ISO acceptance code (`AC` / `AD` / `RD`) |
| `edi_mapping_rules` | Field-to-X12 segment transformation rules (`rule_uid` unique) |
| `application_settings` | Singleton organization, GST default, X12 delimiters, and local Ollama endpoint/model settings |

---

## 5. EDI Processing Workflow

```text
Create Document (850/810)
   ├── Draft mode ─────────────────────────────▶ Saved as Draft (editable, no ledger posting)
   └── Submit mode
         ├─► Validate 5 Deterministic Rules + Generate ANSI X12
         ├─► If 850 & Valid ───▶ Pending (Awaiting Ack) ─▶ Simulate Receipt (997) ─▶ Simulate 855 Ack ─▶ Accepted (+ linked 855)
         └─► If 810 & PO Mismatch ─▶ Rejected (Exception retained, amounts untouched)
                                        └─▶ Human Review + Line Correction (Processing) ─▶ Reprocess ─▶ Accepted
```

---

## 6. AI & OCR Architecture

- **Ollama Integration** ([ollama_client.py](../backend/app/services/ollama_client.py)): Probes local CLI binary (`shutil.which("ollama")` + Windows install paths) and `GET {endpoint}/api/tags` (`1.8s` timeout). Never masks timeouts or missing models as `"Connected"`.
- **SQLite-Grounded Assistant & Exception Explanation** ([ai_assistant.py](../backend/app/services/ai_assistant.py)): Builds a factual SQLite ledger snapshot for local Qwen models; if Ollama or the selected model is unavailable, executes deterministic Python SQL queries ([assistant.py](../backend/app/services/assistant.py)) with explicit disclosure badges.
- **Document Upload & Extraction Pipeline** ([document_extraction.py](../backend/app/services/document_extraction.py), [ocr_service.py](../backend/app/services/ocr_service.py), [structured_extraction.py](../backend/app/services/structured_extraction.py)):
  1. Validates extension (`.pdf`, `.png`, `.jpg`, `.jpeg`) and `<= 10 MB` size limit.
  2. Extracts selectable text via `PyMuPDF` (`>= 15` chars skips OCR); renders scanned PDF pages or uploaded images via `Pillow` grayscale/autocontrast scaling to `pytesseract` (if Tesseract binary is installed).
  3. Maps text via local Qwen JSON extraction or deterministic regex parser into `StructuredDocumentExtraction` (Pydantic-validated; invalid JSON rejected safely). Missing attributes remain `null` and appear in `uncertain_fields`.
  4. **Human Confirmation Safeguard**: Extracted payloads return strictly to the UI review form and are **never saved to SQLite** until the operator reviews values and clicks **Confirm & Register Document in SQLite**.

