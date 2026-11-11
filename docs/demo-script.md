# EDI NEXUS — Faculty Demonstration Script

**Estimated Duration:** 10–12 minutes  
**Precondition:** Server started cleanly via `scripts/start-production.ps1` (`http://127.0.0.1:8000`) or `scripts/start-dev.ps1` (`http://localhost:5173`).

---

## Step 1: Project Introduction (1 min)
- Open EDI NEXUS in the browser.
- Explain the business problem: enterprises exchange Purchase Orders (`X12 850`), Acknowledgements (`855`), Invoices (`810`), and Shipping Notices (`856`) across trading partners (**Metro Retail — Buyer**, **ABC Components — Supplier**, **Kaveri Logistics — Carrier**).
- Highlight architectural discipline: deterministic Python validation using `Decimal` arithmetic (`Numeric(14,2)` in SQLite), full ANSI X12 segment generation, **zero external/paid AI APIs**, and optional local Ollama + OCR intelligence with deterministic fallbacks.

## Step 2: Executive Dashboard (`/`) (1.5 min)
- Point out live SQLite KPI cards: `12` total transactions, `8` accepted, `2` pending acknowledgement, `2` rejected exceptions, and total volume metrics.
- Show the **Transaction Volume Trend** chart, **Document Type Distribution**, and **AI & Operational Alerts** highlighting `INV-ABC-8824` (`TXN-2026-1014`) variance and open PO SLAs.
- Optionally reset to clean baseline anytime from **System Settings → Reset Demo Dataset**.

## Step 3: Trading Partners (`/partners`) (1 min)
- Navigate to **Trading Partners**.
- Click **Metro Retail** and **ABC Components** to show their **ISA/GS EDI routing IDs**, **GSTINs**, supported X12 document capabilities (`850/855/810/856`), SLA hours, and historical transaction ledger.

## Step 4: Scenario 1 — Successful Purchase Order Workflow (2.5 min)
1. Click **New Document** (`/create-document`).
2. Click **Load Scenario 1** — populates a Metro Retail → ABC Components PO for **100 Enterprise Laptops @ ₹45,000 = ₹45,00,000**.
3. Click **Submit for Processing**.
4. Click **Open in Document Processing**.
5. Point out:
   - Status is `Pending` / `Awaiting Ack`.
   - Under **Validation Results**, all rule checks pass (`Decimal` reconciliation verified).
   - Under **ANSI X12 Preview**, show the generated `ISA / GS / ST / BEG / PO1 / CTT / SE / GE / IEA` envelope using the live partner ISA IDs.
6. In the right **Acknowledgement Status** card, click **Simulate Supplier Receipt** (`997` logged in timeline), then click **Simulate EDI 855 Ack**.
7. Show that the PO status updates to **`Accepted` (`Acknowledged`)**, a linked **`855` Order Acknowledgement** transaction is persisted in SQLite, and the Processing Timeline records every step.

## Step 5: Scenario 2 — Invoice Discrepancy & Human Exception Resolution (2.5 min)
1. Return to **Create Document** (`/create-document`).
2. Click **Load Scenario 2** — populates an ABC Components Invoice for **₹46,00,000** (`100 × ₹46,000`) referencing the `₹45,00,000` PO.
3. Click **Submit for Processing**. Note the immediate rejection (`Rejected` status) and **unmodified ₹46,00,000** figure (system never silently changes supplier financial records).
4. Click **Open in Document Processing**.
5. Point out:
   - **Two-Way Purchase Order Match Exception Detected (`+₹1,00,000` Variance)**.
   - **AI Exception Analysis & Recommendation** card displaying exact SQLite figures (`Invoice total: ₹46,00,000 | Purchase order total: ₹45,00,000 | Difference: ₹1,00,000`).
6. Also briefly show the **Upload & Extract (PDF/OCR)** tab to explain how uploaded PDFs/images require explicit human review (`Confirm & Register Document in SQLite`) before persistence.
7. Click **Correct Invoice Amount**, update unit price from `46000` to `45000`, enter a review note, and click **Save & Reprocess**.
8. Show status transitioning cleanly from `Rejected` → `Processing` → **`Accepted`**, clearing the exception while preserving full correction audit history in the timeline.

## Step 6: EDI Mapping Studio (`/mapping`) (1 min)
- Navigate to **EDI Mapping**.
- Filter rules (`850` / `810`), show source field paths mapped to X12 segments (`BEG03`, `PO102`, `BIG04`), and click a sample transformation preview to show how business fields translate into delimited X12 segments.

## Step 7: AI Assistant (`/assistant`) & Diagnostics (`/settings`) (1 min)
- Open **AI Assistant** and note the transparent engine badge (`Deterministic SQLite Fallback Active` when Ollama is offline, or `Ollama Connected` when installed).
- Click **"Which documents require human review?"** — inspect live SQLite answer listing exact TXN IDs with one-click navigation links.
- Briefly open **Settings** to show honest `"Not Tested"` → real diagnostic probes for Ollama and Tesseract OCR.

## Step 8: Reports & Analytics (`/reports`) & Conclusion (1 min)
- Open **Reports & Analytics** to confirm Dashboard KPIs, partner scorecards, and transaction volumes reflect the Scenario 1 & Scenario 2 changes just executed.
- Click **Export CSV** to demonstrate clean spreadsheet reporting.
- Conclude with summary of zero paid APIs, deterministic financial integrity, SQLite persistence, and modular MIS architecture.

