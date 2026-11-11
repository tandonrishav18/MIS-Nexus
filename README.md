# EDI NEXUS

**Enterprise Electronic Data Interchange (EDI) Management Information System**

EDI NEXUS is an academic and demonstration Management Information System designed to model B2B electronic document exchange, financial validation, exception resolution, and local AI/OCR assistance between trading partners—specifically **Metro Retail** (Buyer), **ABC Components** (Supplier), and **Kaveri Logistics** (Logistics Partner).

---

## 1. Objectives

- Provide an enterprise MIS interface to create, validate, translate, monitor, and audit electronic business transactions (`X12 850` Purchase Orders, `855` Order Acknowledgements, `810` Invoices, and `856` Advance Shipping Notices).
- Enforce deterministic `Decimal`-based financial accounting and two-way PO-to-Invoice matching without silent financial mutation.
- Operate **100% locally with zero paid APIs, external AI APIs, or cloud API keys**, using optional local AI (`Ollama` + Qwen) and local document intelligence (`PyMuPDF`, `Pillow`, `Tesseract OCR`) with clean deterministic fallbacks when offline.

---

## 2. Core Features

1. **Executive Dashboard (`/`)** — Live KPI counters, volume trend charts, document mix breakdown, SLA acknowledgement alerts, partner summary, and global search filtering backed by SQLite.
2. **Transaction Register (`/transactions`)** — Searchable, filterable, sortable, paginated transaction ledger with CSV export and direct document drill-down.
3. **Create Document (`/create-document`)** — Interactive creator for `850` Purchase Orders and `810` Invoices with live `₹` subtotal/tax/total calculations, validation, draft/submit modes, and one-click presets for Demo Scenarios 1 and 2.
4. **Trading Partners (`/partners`)** — Partner directory managing ISA/GS EDI identifiers, GSTINs, supported document types, SLA windows, active status toggles, and partner registration.
5. **Document Processing (`/processing/:id`)** — Detailed inspection console displaying original document payload, extracted fields, deterministic rule checks, interactive ANSI X12 segment viewer, PDF/image upload extraction with human confirmation, exception banners with AI/deterministic explanations, human line-item correction, and immutable audit timeline.
6. **EDI Mapping Studio (`/mapping`)** — Configurable ANSI X12 segment mapping table with live JSON-to-X12 transformation preview and custom rule management.
7. **AI Assistant (`/assistant`)** — SQLite-grounded MIS query console using local Ollama (when available) or deterministic SQL queries (when offline) with clickable transaction inspection links.
8. **Reports & Analytics (`/reports`)** — Date-range analytics covering volume performance, trading partner scorecards, flagged exception queue, and filtered CSV downloads.
9. **System Settings (`/settings`)** — Hub configuration, GST/tax preferences, X12 delimiters, honest local AI & OCR diagnostics (`Not Tested` → real probe status), and deterministic **Reset Demo Data**.

---

## 3. Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, TypeScript 5.7, Vite 6, Tailwind CSS 3.4, Radix UI primitives, Recharts 2.15, Lucide Icons, `@fontsource/inter`, `@fontsource/jetbrains-mono` |
| **Backend** | Python 3.14, FastAPI, Uvicorn, SQLAlchemy 2, Pydantic 2, `httpx`, `python-multipart` |
| **Database** | SQLite (`backend/edi_nexus.db` with `Numeric(14, 2)` `Decimal` columns & foreign-key enforcement) |
| **Local AI & OCR (Optional / Zero-Cost)** | Ollama local HTTP runtime (Qwen instruct models e.g. `qwen2.5:7b`), PyMuPDF (`pymupdf`), Pillow, `pytesseract` + Tesseract OCR |

> **Cost & Privacy Guarantee:** Zero OpenAI, Gemini, Claude, or subscription APIs or API keys exist anywhere in the codebase. All processing happens locally.

---

## 4. Architecture & Project Structure

See detailed technical design in [docs/system-architecture.md](docs/system-architecture.md), [docs/design-system.md](docs/design-system.md), [docs/backend-architecture.md](docs/backend-architecture.md), and [docs/known-limitations.md](docs/known-limitations.md).

```text
MIS-Nexus/
├── README.md
├── docs/                            # Architecture, design tokens, demo walkthrough & QA evidence
├── scripts/                         # One-command dev, single-origin production & test runners
├── backend/
│   ├── requirements.txt
│   ├── app/                         # FastAPI routers, SQLAlchemy models & deterministic EDI/AI services
│   └── tests/                       # Pytest API, AI/OCR fallback & E2E integrity suites
└── frontend/
    ├── package.json
    ├── vite.config.ts
    └── src/                         # React + TypeScript + Tailwind UI modules
```

---

## 5. Quick Start

### Prerequisites
- Python 3.12+ and Node.js 18+ (`npm`)

### 1. Setup
```powershell
# Backend virtual environment & dependencies
cd backend
python -m venv .venv
.\.venv\Scripts\pip.exe install -r requirements.txt

# Frontend dependencies & production bundle
cd ..\frontend
npm install
npm run build
```

When FastAPI starts, [main.py](backend/app/main.py) initializes `backend/edi_nexus.db` and idempotently seeds 3 trading partners, 12 X12 mapping rules, application settings, and 12 baseline transactions.

### 2. Run
- **Single-Origin Mode (`http://127.0.0.1:8000`):**
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\start-production.ps1
  ```
- **Developer Hot-Reload Mode (`:5173` + `:8000`):**
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1
  ```
- **Run Full Test & Build Suite:**
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\verify-all.ps1
  ```

---

## 7. Optional Local AI (Ollama + Qwen) & Tesseract OCR Setup

EDI Nexus works completely without installing Ollama or Tesseract. To enable optional local LLM responses and scanned-image OCR on Windows:

1. **Ollama + Qwen (~4.7 GB disk space for `qwen2.5:7b` or ~1.9 GB for `qwen2.5:3b`)**:
   ```powershell
   winget install Ollama.Ollama
   ollama pull qwen2.5:7b
   ollama serve
   ```
2. **Tesseract OCR (~100 MB disk space for Windows installer + English data)**:
   ```powershell
   winget install UB-Mannheim.TesseractOCR
   ```
3. Open **System Settings** (`/settings`) and click **Test AI & OCR Connections** to confirm `Connected` status.

---

## 8. Quick Demonstration Instructions

See [docs/demo-script.md](docs/demo-script.md) for the full faculty walkthrough. Before starting:
- Navigate to **System Settings** (`/settings`) and click **Reset Demo Dataset** (optional; restores exact baseline of 12 transactions, 8 Accepted, 2 Pending, 2 Rejected).
- **Scenario 1 (Successful Purchase Order — ₹45,00,000):** Open **Create Document** (`/create-document`) → click **Load Scenario 1** → click **Submit for Processing** → open in **Document Processing** → click **Simulate Supplier Receipt** and **Simulate EDI 855 Ack**. Status transitions cleanly to `Accepted`.
- **Scenario 2 (Invoice Discrepancy — ₹46,00,000 vs ₹45,00,000):** Open **Create Document** → click **Load Scenario 2** → click **Submit for Processing** (system rejects with `-₹1,00,000` mismatch alert without modifying amounts) → inspect **AI Exception Analysis & Recommendation** → click **Correct Invoice Amount** → change unit price to `45000` → click **Save & Reprocess**. Transaction clears to `Accepted`.

