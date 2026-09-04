# FinCtrl - AI Finance Controller and 3-Way Reconciliation Platform

An intelligent, full-stack FinOps platform for Payment Settlement Reconciliation and Anomaly Detection, powered by Google Gemini AI.

---

## Table of Contents

1. Project Overview
2. Tech Stack
3. System Architecture
4. Project Structure
5. Backend
   - Setup and Installation
   - Environment Variables
   - API Endpoints
   - Database Schema
   - Services and Business Logic
6. Frontend
   - Setup and Installation
   - Pages and Components
   - Auth Flow
7. Data Flow
8. Reconciliation Pipeline
9. Anomaly Detection
10. AI Report Generation
11. Running Locally
12. Known Issues and Troubleshooting

---

## Project Overview

FinCtrl is an autonomous FinOps platform designed to:

- Accept three data sources: Order/Ledger, Razorpay/PSP Settlement Report, and Bank Statement
- Perform 3-way reconciliation across all three sources
- Automatically detect financial anomalies (duplicates, fee spikes, delays, etc.)
- Generate AI-powered narrative reports using Google Gemini
- Provide a full Exception Workspace to manage, assign, comment on, and resolve discrepancies
- Support multi-tenant, user-scoped operations via JWT authentication

---

## Tech Stack

| Layer              | Technology                                    |
|--------------------|-----------------------------------------------|
| Frontend           | React 19, Vite 8, Vanilla CSS                 |
| Backend            | Python 3.13, FastAPI 0.115+                   |
| Database           | MySQL 8 (via XAMPP)                           |
| ORM                | SQLAlchemy 2.0                                |
| Data Processing    | Pandas 2.2, OpenPyXL, xlrd                    |
| AI / LLM           | Google Gemini API (google-generativeai)       |
| Auth               | Google OAuth 2.0 + JWT (PyJWT)                |
| Dev Server         | Uvicorn (backend), Vite proxy (frontend)      |

---

## System Architecture

`
     +------------------------------+
     |       React Frontend         |
     |   Vite Dev Server :5173      |
     |  Dashboard, Upload, Reports  |
     +-------------+----------------+
                   |  /api/* (Vite Proxy)
                   v
     +------------------------------+
     |      FastAPI Backend         |
     |      Uvicorn :8000           |
     |                              |
     |  Upload and Validation       |
     |  Normalization Engine        |
     |  3-Way Matching Engine       |
     |  Settlement Calculation      |
     |  Reconciliation              |
     |  Anomaly Detection           |
     |  Gemini AI Narrative         |
     +-------+----------------+-----+
             |                |
       SQL   |                |  Gemini API
             v                v
  +----------------+  +------------------+
  |  MySQL 8       |  |  Google Gemini   |
  |  XAMPP         |  |  gemini-flash    |
  +----------------+  +------------------+

Data Sources:
  Order/Ledger CSV/XLSX  -----+
  Razorpay/PSP CSV/XLSX  -----+--> Backend Upload API
  Bank Statement CSV/XLSX ----+
`

---

## Project Structure

`
FInanceRazorpay/
|-- backend/
|   |-- .env
|   |-- requirements.txt
|   +-- app/
|       |-- main.py
|       |-- models/
|       |   |-- database.py
|       |   +-- orm.py
|       |-- routes/
|       |   |-- auth.py
|       |   |-- upload.py
|       |   |-- reconciliation.py
|       |   |-- anomaly.py
|       |   |-- report.py
|       |   |-- exceptions.py
|       |   +-- schema.py
|       |-- services/
|       |   |-- auth.py
|       |   |-- parser.py
|       |   |-- normalizer.py
|       |   |-- schema_map.py
|       |   |-- data_quality.py
|       |   |-- matcher.py
|       |   |-- settlement.py
|       |   |-- reconciliation.py
|       |   |-- anomaly.py
|       |   |-- llm.py
|       |   |-- db_service.py
|       |   +-- recon_state.py
|       +-- schemas/
|           +-- transaction.py
|
|-- frontend/
|   |-- .env
|   |-- vite.config.js
|   |-- package.json
|   |-- index.html
|   +-- src/
|       |-- main.jsx
|       |-- App.jsx
|       |-- index.css
|       |-- context/
|       |   +-- AuthContext.jsx
|       |-- services/
|       |   +-- api.js
|       +-- components/
|           |-- LandingPage.jsx
|           |-- Dashboard.jsx
|           |-- FileUpload.jsx
|           |-- UploadResults.jsx
|           |-- SchemaMap.jsx
|           |-- Reconciliation.jsx
|           |-- ExceptionWorkspace.jsx
|           |-- AIReport.jsx
|           +-- DataQualityModule.jsx
|
+-- README.md
`

---

## Backend

### Setup and Installation

`ash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
`

- Backend API: http://localhost:8000
- Swagger Docs: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

---

### Environment Variables (backend/.env)

`
DB_HOST=localhost
DB_PORT=3306
DB_NAME=finance_controller
DB_USER=root
DB_PASSWORD=

GEMINI_API_KEY=your_gemini_api_key_here

APP_ENV=development
APP_HOST=0.0.0.0
APP_PORT=8000

UPLOAD_DIR=uploads
MAX_FILE_SIZE_MB=50

GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
`

NOTE: MySQL must be running before starting the backend.

---

### API Endpoints

#### Authentication /auth

| Method | Endpoint       | Description                              |
|--------|----------------|------------------------------------------|
| GET    | /auth/config   | Returns Google OAuth client ID           |
| POST   | /auth/google   | Login/register via Google ID token       |
| POST   | /auth/demo     | 1-click demo login, no OAuth required    |
| GET    | /auth/me       | Get current user profile and stats       |
| POST   | /auth/logout   | Logout                                   |

#### Upload /upload

| Method | Endpoint  | Description                                          |
|--------|-----------|------------------------------------------------------|
| POST   | /upload/  | Upload CSV/XLSX: parse, normalize, quality, save DB  |

Form parameters: file, source (order_ledger/razorpay_psp/bank_statement), include_transactions, run_quality

#### Reconciliation /reconciliation

| Method | Endpoint                      | Description                        |
|--------|-------------------------------|------------------------------------|
| POST   | /reconciliation/run           | Run 3-way reconciliation           |
| GET    | /reconciliation/latest        | Get latest reconciliation report   |
| GET    | /reconciliation/exceptions    | Get exceptions from latest run     |
| GET    | /reconciliation/history       | Get run history                    |
| GET    | /reconciliation/history/{id}  | Get specific run by ID             |

#### Anomaly Detection /anomaly

| Method | Endpoint     | Description                                  |
|--------|--------------|----------------------------------------------|
| GET    | /anomaly/run | Run anomaly detection on latest recon        |
| POST   | /anomaly/run | Run anomaly detection on provided report     |

#### AI Report /report

| Method | Endpoint          | Description                                   |
|--------|-------------------|-----------------------------------------------|
| POST   | /report/generate  | Generate Gemini AI narrative report           |
| GET    | /report/latest    | Get latest generated narrative                |

#### Exception Workspace /exceptions

| Method | Endpoint                  | Description                         |
|--------|---------------------------|-------------------------------------|
| GET    | /exceptions/              | List all exceptions                 |
| GET    | /exceptions/{id}          | Get single exception detail         |
| POST   | /exceptions/{id}/assign   | Assign to stakeholder               |
| POST   | /exceptions/{id}/comment  | Add comment                         |
| POST   | /exceptions/{id}/resolve  | Mark as RESOLVED                    |
| POST   | /exceptions/{id}/reopen   | Reopen exception                    |
| GET    | /exceptions/export/csv    | Export as CSV                       |
| GET    | /exceptions/export/xlsx   | Export as XLSX                      |

#### Schema /schema

| Method | Endpoint        | Description                                       |
|--------|-----------------|---------------------------------------------------|
| GET    | /schema/mapping | Full schema mapping (fields, aliases, pipeline)   |
| GET    | /schema/fields  | 14 canonical field definitions                    |

#### Health

| Method | Endpoint | Description      |
|--------|----------|------------------|
| GET    | /health  | Health check     |

---

### Database Schema

7 tables, auto-created on startup:

**users:** id, email (unique), name, avatar_url, google_id (unique), role, created_at

**upload_sessions:** id, user_id, filename, source (enum), total_rows, valid_rows, skipped_rows, normalised_count, quality_score, uploaded_at

**transactions:** id, session_id (FK), source (enum), transaction_id, order_id, settlement_id, merchant_id, txn_date, gross_amount, fee_amount, tax_amount, tds_amount, refund_amount, net_amount, reference, status, currency, raw_row_index, created_at

**reconciliation_runs:** id, user_id, run_name, order_session_id (FK), psp_session_id (FK), bank_session_id (FK), total_order, total_psp, total_bank, total_matched, total_reconciled, total_exceptions, match_rate, reconciliation_rate, total_expected_net, total_actual_bank, total_difference, tolerance_pct, run_at

**reconciliation_results:** id, run_id (FK), order_txn_id (FK), psp_txn_id (FK), bank_txn_id (FK), confidence, match_strategy, status (reconciled/exception/pending), reason_code, reason_detail, date_diff_days, created_at

**settlement_breakdowns:** id, result_id (FK), gross_amount, fee_amount, tax_amount, tds_amount, refund_amount, other_adjustments, expected_net, actual_bank_credit, difference

**narrative_reports:** id, user_id, run_id, markdown, summary, management_note, model_used, tokens_used, created_at

**exception_tickets:** id, user_id, run_id, exception_index, status (OPEN/IN_PROGRESS/RESOLVED), assigned_to, comments (JSON), resolved_at, resolved_by, updated_at

---

### Services and Business Logic

| File              | Purpose                                                        |
|-------------------|----------------------------------------------------------------|
| parser.py         | Parse CSV/XLSX bytes into TransactionBase Pydantic list        |
| normalizer.py     | Clean IDs, coerce amounts, derive net, produce audit trace     |
| schema_map.py     | 14 canonical fields plus per-source column alias dicts         |
| data_quality.py   | Missing fields, duplicates, format checks, quality_score 0-100 |
| matcher.py        | 3-way matching engine, 6 strategies, confidence scoring        |
| settlement.py     | Expected net = Gross - Fee - GST - TDS - Refunds               |
| reconciliation.py | Compare expected_net vs bank_credit, flag RECONCILED/EXCEPTION |
| anomaly.py        | Rule-based + Z-score anomaly detection, 7 anomaly types        |
| llm.py            | Google Gemini API integration, Markdown narrative generation   |
| auth.py           | Google OAuth verification, JWT encode/decode, demo user        |
| db_service.py     | SQLAlchemy save helpers for uploads and reconciliation runs    |
| recon_state.py    | Per-user in-memory cache for latest ReconciliationReport       |

#### Matching Strategies (ordered by confidence)

1. Transaction ID exact match         - confidence 100
2. Order / Reference ID match         - confidence 90
3. Settlement / Batch ID match        - confidence 80
4. Date window + amount match         - confidence 75
5. Amount + counterparty match        - confidence 65
6. Fuzzy / Heuristic match            - confidence 50

#### Settlement Calculation

Expected Net = Gross Amount - Fee - GST/Tax - TDS - Refunds - Other Adjustments

#### Reconciliation Decision Logic

Difference = Expected Net - Actual Bank Credit
If ABS(Difference) / Gross <= tolerance_pct (default 0.5%): RECONCILED
Else: EXCEPTION

---

## Frontend

### Setup and Installation

`ash
cd frontend
npm install
npm run dev
`

Available at: http://localhost:5173

Vite proxies /api/* to http://localhost:8000 (removes /api prefix).

---

### Pages and Components

| Component              | Description                                                 |
|------------------------|-------------------------------------------------------------|
| LandingPage.jsx        | Auth landing: Google OAuth + 1-click Demo login             |
| Dashboard.jsx          | Main shell with sidebar and tab routing                     |
| FileUpload.jsx         | Upload UI for 3 data sources, drag-and-drop support         |
| UploadResults.jsx      | Parse stats, normalization summary, quality report          |
| SchemaMap.jsx          | Schema explorer: 14 canonical fields + alias mappings       |
| Reconciliation.jsx     | 3-way reconciliation results table with filters             |
| ExceptionWorkspace.jsx | Exception management: assign, comment, resolve, export      |
| AIReport.jsx           | Gemini AI narrative viewer with Markdown rendering          |
| DataQualityModule.jsx  | Data quality score, issues, recommendations                 |

---

### Auth Flow

1. Page loads -> AuthContext checks localStorage for finops_auth_token
2. If token found -> GET /api/auth/me
3. Success -> populate user state -> show Dashboard
4. Failure / expired -> clear token -> show LandingPage

Login options:
- Google OAuth: posts credential to /api/auth/google, backend verifies via Google tokeninfo, returns JWT
- Demo Login: POST /api/auth/demo, no OAuth needed, returns JWT for persistent demo user

Token stored as finops_auth_token in localStorage. Injected as Authorization: Bearer <token> on all requests. Valid for 7 days.

---

## Data Flow

1. User uploads CSV/XLSX files
2. parser.py: detect format, map columns via schema_map.py aliases, build TransactionBase list
3. normalizer.py: clean IDs, coerce amounts, derive net_amount, produce audit trace
4. data_quality.py: missing fields, duplicates, format checks, compute quality_score
5. db_service.py: insert upload_sessions and transactions into DB
6. matcher.py: 3-way match Order/PSP/Bank with 6 strategies
7. settlement.py: compute expected_net per matched transaction
8. reconciliation.py: compare expected_net vs bank_credit, flag RECONCILED/EXCEPTION
9. anomaly.py: run 7 anomaly checks (rule-based + Z-score)
10. llm.py: call Gemini API with reconciliation + anomaly data, return Markdown narrative
11. Response returned to Frontend

---

## Reconciliation Pipeline

POST /reconciliation/run accepts 3 files and runs the full pipeline.

Parameters: order_ledger_file, psp_file, bank_file, tolerance_pct (default 0.5), date_window (default 3 days), run_name (optional)

Response includes: run_id, total counts per source, match_rate, reconciliation_rate, total_expected_net, total_actual_bank, total_difference, and per-transaction results array.

---

## Anomaly Detection

7 anomaly types checked automatically:

| Anomaly Type          | Method                    | Severity |
|-----------------------|---------------------------|----------|
| Duplicate charges     | Exact transaction ID match | HIGH    |
| Out-of-pattern amounts| Z-score > 2.5             | MEDIUM   |
| Settlement delays     | Date diff > 7 days        | HIGH     |
| Round-number bias     | Amount divisible by 1000  | LOW      |
| Unusual fee/tax ratio | Z-score on ratio          | MEDIUM   |
| Repeated mismatches   | Count threshold           | HIGH     |
| Missing bank credit   | Unmatched PSP rows        | HIGH     |

---

## AI Report Generation

POST /report/generate:
1. Get latest reconciliation report for current user
2. Run anomaly detection
3. Build structured prompt with recon + anomaly data
4. Call Google Gemini (gemini-flash)
5. Return Markdown narrative with:
   - Executive Summary
   - Reconciliation Analysis
   - Exception Breakdown
   - Anomaly Analysis
   - Root Cause Hypotheses
   - Suggested Next Steps
   - Management Summary

Report persisted to narrative_reports table and cached per user in memory.

---

## Running Locally

Prerequisites: Python 3.10+, Node.js 18+, MySQL 8 (XAMPP), Gemini API key, Google OAuth credentials

Steps:
1. Start MySQL via XAMPP Control Panel
2. Create database named: finance_controller (tables auto-created on first run)
3. Configure backend/.env with DB credentials and API keys
4. cd backend && pip install -r requirements.txt
5. python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
6. cd frontend && npm install && npm run dev
7. Open http://localhost:5173 and click Demo Login

---

## Known Issues and Troubleshooting

### ECONNREFUSED errors in Vite console

Cause: FastAPI backend is not running, or MySQL is stopped causing backend to crash on DB requests.

Fix:
1. Start MySQL via XAMPP Control Panel
2. Start backend: python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
3. Verify: curl http://localhost:8000/health

### 500 Internal Server Error on /auth/me

Cause: MySQL is stopped. The demo user fallback in get_current_user requires a live DB connection.

Fix: Start MySQL.

### MySQL service cannot start (WinError 10061)

Fix: Open PowerShell as Administrator and run: Start-Service MySQL80
Or start via XAMPP Control Panel.

### Google OAuth not working

Cause: Missing GOOGLE_CLIENT_ID in backend/.env.

Fix:
- Set GOOGLE_CLIENT_ID in backend/.env
- Add http://localhost:5173 to Authorized JavaScript origins in Google Cloud Console

Quickest alternative: Use Demo Login (no OAuth setup needed).

### File upload 422 error

Accepted formats: .csv, .xlsx, .xls
Max size: 50 MB (set MAX_FILE_SIZE_MB in backend/.env)
Ensure correct source is selected: order_ledger, razorpay_psp, or bank_statement.

---

## Dependencies

### Backend

fastapi>=0.115.0, uvicorn[standard]>=0.30.0, python-dotenv>=1.0.1, sqlalchemy>=2.0.36, pymysql>=1.1.1, cryptography>=42.0.0, pandas>=2.2.3, openpyxl>=3.1.2, xlrd>=2.0.1, python-multipart>=0.0.12, pydantic>=2.9.0, pydantic-settings>=2.5.0, google-generativeai>=0.8.0, PyJWT, requests

### Frontend

react ^19.2.8, react-dom ^19.2.8, react-markdown ^10.1.0
Dev: @vitejs/plugin-react ^6.1.0, vite ^8.2.2, oxlint ^1.79.0

---

Built using FastAPI + React + Google Gemini.