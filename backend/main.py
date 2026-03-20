"""
Rotation Dashboard — FastAPI application.

Run with:
    uvicorn backend.main:app --reload
"""

from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from backend.config import CORS_ORIGINS
from backend.database import create_pool, close_pool
from backend.routers import rrg, prices, tickers, flow, regime, volatility, macro, compare

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    create_pool()
    yield
    # Shutdown
    close_pool()


app = FastAPI(
    title="Rotation Dashboard API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rrg.router, prefix="/api/rrg", tags=["RRG"])
app.include_router(prices.router, prefix="/api/prices", tags=["Prices"])
app.include_router(tickers.router, prefix="/api/tickers", tags=["Tickers"])
app.include_router(flow.router, prefix="/api/obv", tags=["OBV"])
app.include_router(regime.router, prefix="/api/regime", tags=["Regime"])
app.include_router(volatility.router, prefix="/api/volatility", tags=["Volatility"])
app.include_router(macro.router, prefix="/api/macro", tags=["Macro"])
app.include_router(compare.router, prefix="/api/compare", tags=["Compare"])


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.detail},
        )
    logger.exception("Unhandled backend error at %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error. Please retry."},
    )


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
