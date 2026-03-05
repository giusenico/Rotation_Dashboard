"""
Rotation Dashboard — FastAPI application.

Run with:
    uvicorn backend.main:app --reload
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import CORS_ORIGINS
from backend.database import create_pool, close_pool
from backend.routers import rrg, prices, tickers, obv


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
    allow_origins=["*"],
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(rrg.router, prefix="/api/rrg", tags=["RRG"])
app.include_router(prices.router, prefix="/api/prices", tags=["Prices"])
app.include_router(tickers.router, prefix="/api/tickers", tags=["Tickers"])
app.include_router(obv.router, prefix="/api/obv", tags=["OBV"])


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
