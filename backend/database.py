"""
Database connection pool using psycopg2.

Provides a ThreadedConnectionPool that is created once at app startup
and closed on shutdown.  The ``get_db`` dependency yields a connection
from the pool for each request.
"""

import os
from contextlib import contextmanager

import psycopg2
from psycopg2 import pool
from psycopg2 import extensions

from backend.config import SUPABASE_DB_URL

import logging

logger = logging.getLogger(__name__)

_pool: pool.ThreadedConnectionPool | None = None

# Defaults sized to stay under Supabase's session-pooler client cap (15 by
# default on port 5432). With transaction pooler (port 6543) you can safely
# raise DB_POOL_MAX via env without redeploy.
_DEFAULT_MIN = 2
_DEFAULT_MAX = 10


def create_pool(
    minconn: int | None = None,
    maxconn: int | None = None,
) -> pool.ThreadedConnectionPool:
    global _pool
    minconn = minconn if minconn is not None else int(os.getenv("DB_POOL_MIN", _DEFAULT_MIN))
    maxconn = maxconn if maxconn is not None else int(os.getenv("DB_POOL_MAX", _DEFAULT_MAX))
    _pool = pool.ThreadedConnectionPool(minconn, maxconn, dsn=SUPABASE_DB_URL)
    logger.info("DB pool created (min=%s, max=%s)", minconn, maxconn)
    return _pool


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.closeall()
        _pool = None


@contextmanager
def get_connection():
    """Context manager that checks out / returns a connection from the pool."""
    if _pool is None:
        raise RuntimeError("Connection pool not initialised — call create_pool() first")
    conn = _pool.getconn()
    try:
        yield conn
    except Exception:
        if conn is not None and conn.closed == 0:
            try:
                conn.rollback()
            except Exception as exc:
                logger.exception("Failed to rollback failed request connection: %s", exc)
        raise
    finally:
        if conn is not None:
            if conn.closed == 0 and conn.status != extensions.STATUS_READY:
                try:
                    conn.rollback()
                except Exception:
                    logger.exception("Failed to reset connection before return")
            _pool.putconn(conn)


def get_db():
    """FastAPI dependency — yields a psycopg2 connection."""
    with get_connection() as conn:
        yield conn
