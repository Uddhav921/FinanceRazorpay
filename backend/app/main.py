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
    logger.info("🚀  AI Finance Controller backend starting up...")
    # Future: create DB tables here via SQLAlchemy
    yield
    logger.info("🛑  Backend shutting down.")


# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title       = "AI Finance Controller",
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
from app.routes import upload, schema, reconciliation   # noqa: E402

app.include_router(upload.router)
app.include_router(schema.router)
app.include_router(reconciliation.router)

# Placeholder routers — will be wired up in subsequent modules
# app.include_router(reconciliation.router)
# app.include_router(anomalies.router)
# app.include_router(reports.router)


# ─── Health Check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
def health_check():
    return {"status": "ok", "service": "AI Finance Controller", "version": "0.1.0"}


# ─── Dev Runner ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host    = os.getenv("APP_HOST", "0.0.0.0"),
        port    = int(os.getenv("APP_PORT", "8000")),
        reload  = True,
    )
