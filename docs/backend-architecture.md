# EDI NEXUS — Phase 3 Backend & Database Architecture

## 1. Frontend-to-Database Data Model Mapping

| Frontend Type (`frontend/src/types/edi.ts`) | SQLAlchemy Model (`backend/app/models.py`) | SQLite Table | Notes |
|---|---|---|---|
| `TradingPartnerSummary` | `TradingPartner` | `trading_partners` | Stores business identity, role, ISA/GS routing IDs, JSON-serialized supported X12 doc codes, active flag, SLA, and `is_demo_seed`. |
| `TransactionRecord` (header/status) | `Transaction` | `transactions` | Authoritative ledger row (`transaction_id` unique e.g. `TXN-2026-1014`), FK links to sender/receiver partners, `Numeric(14,2)` amount, status & ack state. |
| `TransactionRecord` (doc fields & X12) | `Document` | `documents` | 1:1 with `Transaction`. Holds `document_number`, `document_type`, `reference_po`, `Decimal` subtotal/tax/grand_total, `summary`, `edi_payload`, and `supplier_receipt_simulated`. |
| `LineItem` | `DocumentLineItem` | `document_line_items` | Many:1 with `Document`. Stores `sku`, `description`, `quantity`, `Numeric(14,2)` `unit_price`, and `line_total`. |
| `ValidationCheckItem` | `ValidationResult` | `validation_results` | Many:1 with `Transaction`. Stores deterministic rule check outcomes (`REQ_HEADER`, `PARTNER_ELIGIBLE`, `LINE_POSITIVE`, `TOTAL_RECONCILE`, `PO_AMOUNT_MATCH`). |
| `ProcessingEvent` | `ProcessingEvent` | `processing_events` | Many:1 with `Transaction`. Chronological audit log of registration, validation, EDI generation, receipt/855 ack, corrections, approvals, rejections, reprocessing. |
| `AcknowledgementInfo` | `Acknowledgement` | `acknowledgements` | 1:1 with `Transaction`. Records linked `855` ack document number, code (`AC`/`AD`/`RD`), timestamp, and confirmation note. |
| `EdiMappingRule` | `EdiMappingRule` | `edi_mapping_rules` | Source field-to-ANSI X12 segment mapping rules (`850` / `810`), transform expression, required flag, and status. |
| `AppSettingsState` | `ApplicationSettings` | `application_settings` | Singleton configuration (`id=1`): organization profile, tax defaults, X12 delimiters, and local AI/OCR endpoint metadata. |

---

## 2. Financial Integrity & Precision Rules
- All monetary columns use SQLAlchemy `Numeric(14, 2)` (`asdecimal=True`).
- All subtotal, tax, grand total, and PO-vs-invoice variance calculations in `backend/app/services/finance.py` and `validator.py` use `decimal.Decimal` with `ROUND_HALF_UP` — never binary floating point.
- Invoice amounts are never silently altered on mismatch; discrepancies are recorded deterministically in `validation_results` and `transactions.exception_reason` until reviewed, corrected, and reprocessed by a human operator.

---

## 3. API & Frontend Sync Strategy
- FastAPI runs on `http://127.0.0.1:8000` with CORS restricted to local Vite origins (`http://localhost:5173`, `http://127.0.0.1:5173`).
- Vite proxies `/api/*` directly to `http://127.0.0.1:8000`.
- `EdiStoreContext` hydrates initial state from FastAPI (`GET /api/transactions`, `/api/partners`, `/api/mappings`, `/api/settings`) and performs all mutations directly against SQLite-backed API endpoints.
- Non-critical UI preferences (e.g., cached chat UI state if desired) remain separate from authoritative transaction records in SQLite.

