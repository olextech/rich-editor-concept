from datetime import datetime, timezone
from sqlalchemy import DateTime, Integer, String, Text, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool

class Base(DeclarativeBase):
    pass

class Template(Base):
    __tablename__ = "templates"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    html: Mapped[str] = mapped_column(Text)
    page_size: Mapped[str] = mapped_column(String(2))
    orientation: Mapped[str] = mapped_column(String(9))
    margin_top_mm: Mapped[int] = mapped_column(Integer)
    margin_right_mm: Mapped[int] = mapped_column(Integer)
    margin_bottom_mm: Mapped[int] = mapped_column(Integer)
    margin_left_mm: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


def create_database(url, *, initialize=True):
    """Create storage handles; applications can defer schema setup to startup."""
    kwargs = {"connect_args": {"check_same_thread": False, "timeout": 10}} if url.startswith("sqlite") else {}
    if url in ("sqlite://", "sqlite:///:memory:"):
        kwargs["poolclass"] = StaticPool
    engine = create_engine(url, **kwargs)
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def configure_sqlite(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")
    if initialize:
        Base.metadata.create_all(engine)
    return engine, sessionmaker(engine, expire_on_commit=False)


def now():
    return datetime.now(timezone.utc)
