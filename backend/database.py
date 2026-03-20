"""
Database connection pool using psycopg2.

Provides a ThreadedConnectionPool that is created once at app startup
and closed on shutdown.  The ``get_db`` dependency yields a connection
from the pool for each request.
"""

from contextlib import contextmanager

import psycopg2
from psycopg2 import pool
from psycopg2 import extensions

from backend.config import SUPABASE_DB_URL

import logging

logger = logging.getLogger(__name__)

_pool: pool.ThreadedConnectionPool | None = None


def create_pool(minconn: int = 2, maxconn: int = 10) -> pool.ThreadedConnectionPool:
    global _pool
    _pool = pool.ThreadedConnectionPool(minconn, maxconn, dsn=SUPABASE_DB_URL)
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
