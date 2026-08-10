"""SQLAlchemy engine, session factory, and Base for the hotel database.

The database URL is read from the ``DATABASE_URL`` env var and defaults to a
local SQLite file next to this package, so the app runs out of the box.
"""

import os
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# Default to a SQLite file living inside the backend/ directory.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_DEFAULT_SQLITE_PATH = _BACKEND_DIR / "ethereal_hotel.db"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{_DEFAULT_SQLITE_PATH}")

# ``check_same_thread`` is a SQLite-only argument; only pass it for SQLite so
# the same config also works if someone points DATABASE_URL at Postgres, etc.
_connect_args = (
    {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
)

engine = create_engine(DATABASE_URL, connect_args=_connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


def get_db() -> Iterator[Session]:
    """FastAPI dependency that yields a request-scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables if they don't exist yet.

    Alembic migrations are the source of truth, but this convenience call keeps
    the app runnable without a manual migration step (e.g. on a fresh clone or
    in tests). ``create_all`` is a no-op for tables that already exist.
    """
    # Import models so they register on Base.metadata before create_all.
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
