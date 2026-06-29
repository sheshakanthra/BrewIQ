"""Database engine, session factory, and declarative base for BrewIQ."""
import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

# On Render the filesystem is ephemeral, so default to /tmp. Seed-on-startup
# repopulates it every boot. Locally, set DATABASE_URL=sqlite:///./brewiq.db in .env.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////tmp/brewiq.db")
_IS_SQLITE = DATABASE_URL.startswith("sqlite")

# check_same_thread is required for SQLite when used across FastAPI threads.
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if _IS_SQLITE else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


if _IS_SQLITE:

    @event.listens_for(Engine, "connect")
    def _enable_sqlite_fk(dbapi_connection, _connection_record):
        """SQLite ignores FOREIGN KEY constraints unless this PRAGMA is set per connection."""
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def init_db() -> None:
    """Create all tables. Imports models so they register on the Base metadata."""
    import models  # noqa: F401  (ensures models are registered before create_all)

    Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI dependency that yields a database session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
