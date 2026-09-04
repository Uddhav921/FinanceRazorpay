"""
main.py — FastAPI application entry point for the AI Finance Controller backend.

Start the server with:
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
"""

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    logger.info("🚀  FinCtrl backend starting up...")

    # Create all DB tables (safe — does nothing if tables already exist)
    try:
        from app.models.database import engine
        from app.models import orm        # ensure ORM classes are registered
        from app.models.orm import (
            User, UploadSession, Transaction,
            ReconciliationRun, ReconciliationResult, SettlementBreakdown,
            NarrativeReportModel, ExceptionTicket,
        )
        from sqlalchemy import inspect as sa_inspect, text
        from app.models.database import Base
        Base.metadata.create_all(bind=engine)

        # Check and add user_id column to upload_sessions and reconciliation_runs if missing
        with engine.connect() as conn:
            insp = sa_inspect(engine)
            upload_cols = [c["name"] for c in insp.get_columns("upload_sessions")]
            if "user_id" not in upload_cols:
                logger.info("Migrating upload_sessions: adding user_id column")
                conn.execute(text("ALTER TABLE upload_sessions ADD COLUMN user_id INT NULL"))
                conn.commit()

            recon_cols = [c["name"] for c in insp.get_columns("reconciliation_runs")]
            if "user_id" not in recon_cols:
                logger.info("Migrating reconciliation_runs: adding user_id column")
                conn.execute(text("ALTER TABLE reconciliation_runs ADD COLUMN user_id INT NULL"))
                conn.commit()
            if "run_name" not in recon_cols:
                conn.execute(text("ALTER TABLE reconciliation_runs ADD COLUMN run_name VARCHAR(255) NULL"))
                conn.commit()

        tables = sa_inspect(engine).get_table_names()
        logger.info("DB tables ready: %s", tables)
    except Exception as exc:
        logger.warning("DB init or migration error: %s", exc)

    yield
    logger.info("\U0001f6d1  Backend shutting down.")


# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title       = "FinCtrl",
    description = (
        "Payment Settlement Reconciliation & Anomaly Detection API. "
        "Supports 3-way reconciliation: Order/Ledger ↔ Razorpay/PSP ↔ Bank Statement."
    ),
    version     = "0.1.0",
    lifespan    = lifespan,
    docs_url    = "/docs",
    redoc_url   = "/redoc",
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],   # restrict in production
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ─── Routes ───────────────────────────────────────────────────────────────────
from app.routes import auth, upload, schema, reconciliation, anomaly, report, exceptions   # noqa: E402

app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(schema.router)
app.include_router(reconciliation.router)
app.include_router(anomaly.router)
app.include_router(report.router)
app.include_router(exceptions.router)


# ─── Health Check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
def health_check():
    return {"status": "ok", "service": "FinCtrl", "version": "0.1.0"}


# ─── Dev Runner ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host    = os.getenv("APP_HOST", "0.0.0.0"),
        port    = int(os.getenv("APP_PORT", "8000")),
        reload  = True,
    )
