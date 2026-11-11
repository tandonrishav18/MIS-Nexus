import os
from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = BACKEND_ROOT / "edi_nexus.db"

DATABASE_URL = os.getenv(
    "EDI_NEXUS_DATABASE_URL",
    f"sqlite:///{DEFAULT_DB_PATH.as_posix()}",
)


def make_engine(db_url: str = DATABASE_URL):
    connect_args = {"check_same_thread": False} if db_url.startswith("sqlite") else {}
    eng = create_engine(db_url, connect_args=connect_args, future=True)

    if db_url.startswith("sqlite"):
        @event.listens_for(eng, "connect")
        def _set_sqlite_pragma(dbapi_connection, _connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return eng


engine = make_engine()
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, class_=Session)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

