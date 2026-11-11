# EDI NEXUS — Known Limitations & Scope Boundaries

EDI NEXUS is an academic and demonstration Management Information System built to illustrate electronic B2B document exchange, deterministic financial control, and local AI/OCR integration. In accordance with project scope, the following boundaries apply:

1. **Simulated Network Transport & Partner Endpoints**
   - Inbound supplier transmissions, `997` Functional Acknowledgements, and `855` Purchase Order Acknowledgements are simulated inside the local SQLite workflow (`Simulate Supplier Receipt` and `Simulate EDI 855 Ack`).
   - There is no live AS2, SFTP, VAN, or HTTP EDI gateway connecting to external third-party companies.

2. **Representative ANSI X12 Profiles**
   - EDI payloads generated for message sets `850` (Purchase Order), `855` (Order Acknowledgement), `810` (Invoice), and `856` (Advance Shipping Notice) implement structured representative `ISA` / `GS` / `ST` / body / `SE` / `GE` / `IEA` envelopes aligned with workspace mapping rules.
   - They are intended for clear academic and operational demonstration rather than certified production compliance with proprietary retail trading partner implementation guides.

3. **Optional Local AI & OCR Dependencies**
   - Local LLM inference (`Ollama` + Qwen instruct model) and raster image OCR (`Tesseract OCR` binary) are **optional external local installations** not bundled in the repository to avoid large multi-gigabyte binary/model downloads.
   - When `Ollama` is not installed or stopped, AI Assistant, Exception Analysis, and Document Field Parsing transparently use deterministic Python SQLite queries and pattern extraction.
   - When `Tesseract OCR` is not installed, selectable-text PDFs still extract cleanly via `PyMuPDF`, whereas PNG/JPG images and scanned PDFs report `Tesseract Not Installed` and allow manual operator entry.

4. **Deterministic Regex Extraction Constraints (When Offline)**
   - Without local LLM structuring enabled, offline deterministic extraction targets core labeled single-item fields (`document_type`, `document_number`, `document_date`, `buyer`, `supplier`, `reference_po`, primary `SKU`, `description`, `quantity`, `unit_price`, `tax`, `grand_total`) and places unrecognized or multi-line fields into `uncertain_fields` for mandatory operator verification.

5. **Single-Organization Local Demonstration Database**
   - SQLite (`backend/edi_nexus.db`) provides zero-configuration ACID persistence on the host machine for demonstration purposes.
   - Enterprise user authentication, role-based access control (RBAC), encrypted key management, and high-concurrency distributed workers are intentionally out of scope for this local MIS build.

