# AI Finance Controller -- Project Structure

## 1. Architecture

``` text
                 ┌──────────────────────────┐
                 │       Vercel Frontend    │
                 │      React / Next.js     │
                 │ Dashboard & Reports      │
                 └────────────┬─────────────┘
                              │ REST API
                              ▼
                 ┌──────────────────────────┐
                 │      FastAPI Backend     │
                 │                          │
                 │  Upload & Validation      │
                 │  Normalization            │
                 │  Matching Engine          │
                 │  Settlement Calculation   │
                 │  Reconciliation           │
                 │  Anomaly Detection        │
                 │  Gemini Explanation       │
                 └───────┬──────────┬────────┘
                         │          │
                SQL      │          │ Gemini API
                         ▼          ▼
              ┌────────────────┐  ┌───────────────┐
              │ XAMPP MySQL    │  │ Google Gemini │
              │ Database       │  │ LLM           │
              └────────────────┘  └───────────────┘

Data Sources:
Order/Ledger ─────┐
Razorpay/PSP ──────┼──► Backend Upload/API
Bank Statement ────┘
```

## 2. Frontend Structure

Use **React/Next.js** and deploy it on **Vercel**.

``` text
frontend/
├── app/
│   ├── page.jsx
│   ├── dashboard/
│   │   └── page.jsx
│   ├── reconciliation/
│   │   └── page.jsx
│   └── exceptions/
│       └── page.jsx
│
├── components/
│   ├── FileUpload.jsx
│   ├── SummaryCards.jsx
│   ├── ReconciliationTable.jsx
│   ├── ExceptionTable.jsx
│   └── AnomalyList.jsx
│
├── services/
│   └── api.js
│
└── package.json
```

### Main Frontend Screens

-   **Dashboard** -- reconciliation rate, exceptions, amounts and trends
-   **Upload** -- upload CSV/XLSX files
-   **Reconciliation** -- matched and unmatched transactions
-   **Exceptions** -- mismatch details and status
-   **Anomalies** -- duplicate, unusual amount, timing and fee anomalies

## 3. Backend Structure

Use **Python + FastAPI**.

``` text
backend/
├── app/
│   ├── main.py
│   │
│   ├── routes/
│   │   ├── upload.py
│   │   ├── reconciliation.py
│   │   ├── anomalies.py
│   │   └── reports.py
│   │
│   ├── services/
│   │   ├── parser.py
│   │   ├── normalizer.py
│   │   ├── matcher.py
│   │   ├── settlement.py
│   │   ├── reconciliation.py
│   │   ├── anomaly.py
│   │   └── gemini.py
│   │
│   ├── models/
│   │   └── database.py
│   │
│   └── schemas/
│       └── transaction.py
│
├── requirements.txt
└── .env
```

## 4. Backend Flow

``` text
CSV / XLSX / API
      ↓
Parse & Validate
      ↓
Normalize Data
      ↓
Match Transactions
      ↓
Calculate Expected Settlement
      ↓
Compare With Bank Credit
      ↓
Reconciled / Exception
      ↓
Anomaly Detection
      ↓
Google Gemini Explanation
      ↓
API Response → Frontend
```

## 5. Core Backend Logic

### Data Sources

1.  Order/Ledger
2.  Razorpay/PSP Settlement Report
3.  Bank Statement

### Standardized Transaction Fields

``` text
transaction_id
order_id
settlement_id
date
gross_amount
fee_amount
tax_amount
tds_amount
refund_amount
net_amount
reference
status
currency
merchant_id
```

### Matching

Perform matching in this order:

``` text
1. Transaction ID
2. Order / Reference ID
3. Date Window
4. Amount + Counterparty
5. Settlement / Batch
6. Fuzzy / Heuristic Match
```

### Settlement Calculation

``` text
Expected Net =
Gross Amount
- Platform / Processing Fee
- GST / Tax
- TDS
- Refunds
- Other Adjustments
```

### Reconciliation

``` text
Difference = Expected Net - Actual Bank Credit

If |Difference| <= tolerance:
    RECONCILED
Else:
    EXCEPTION
```

## 6. Anomaly Detection

Keep the first version simple:

``` text
- Duplicate charges
- Out-of-pattern amount
- Settlement delay
- Round-number bias
- Unusual fee/tax
- Repeated mismatches
```

Use rule-based checks and basic statistical checks such as Z-score where
useful.

## 7. Google Gemini Integration

Use **Google Gemini API** only for explanation and reporting.

``` text
Exception Data
     ↓
Gemini API
     ↓
Plain-English Explanation
     ↓
Root Cause Hypothesis
Suggested Next Steps
Management Summary
```

Store the Gemini API key in `.env`:

``` env
GEMINI_API_KEY=your_key_here
```

Do not put the API key in the frontend.

## 8. MySQL with XAMPP

Use **MySQL provided by XAMPP** for local development.

Suggested database:

``` text
finance_controller
```

Basic tables:

``` text
transactions
settlements
bank_transactions
reconciliation_results
anomalies
exceptions
```

Example connection settings:

``` env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=finance_controller
DB_USER=root
DB_PASSWORD=
GEMINI_API_KEY=your_key_here
```

## 9. API Endpoints

``` text
POST /upload
POST /reconciliation/run
GET  /reconciliation
GET  /exceptions
GET  /anomalies
GET  /dashboard
GET  /reports
POST /exceptions/{id}/resolve
```

## 10. Deployment

### Frontend

``` text
React / Next.js → Vercel
```

### Backend

``` text
FastAPI → Backend Server
```

### Database

``` text
Local Development → XAMPP MySQL
Production → Hosted MySQL
```

The frontend communicates with the backend through REST APIs. Gemini is
called only from the backend.

## 11. MVP Technology Stack

  Layer              Technology
  ------------------ -------------------
  Frontend           React / Next.js
  Frontend Hosting   Vercel
  Backend            Python + FastAPI
  Database           MySQL (XAMPP)
  Data Processing    Pandas
  AI                 Google Gemini API
  Input              CSV / XLSX
  API                REST

## 12. Recommended Implementation Order

``` text
1. Setup XAMPP + MySQL
2. Create FastAPI backend
3. Create database tables
4. Build CSV/XLSX upload
5. Normalize data
6. Build matching engine
7. Build settlement calculation
8. Build reconciliation
9. Add anomaly detection
10. Add Gemini explanations
11. Build React/Next.js dashboard
12. Connect frontend to FastAPI
13. Deploy frontend on Vercel
```
