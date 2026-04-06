import os
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Railway / Supabase: DATABASE_URL (postgres://...). SQLAlchemy 2 preferă postgresql://
_raw_url = os.getenv("DATABASE_URL", "").strip()
if _raw_url:
    if _raw_url.startswith("postgres://"):
        _raw_url = _raw_url.replace("postgres://", "postgresql://", 1)
    SQLALCHEMY_DATABASE_URL = _raw_url
    _connect_args = {}
    _poolclass = None
    if "supabase" in _raw_url.lower():
        if "sslmode=" not in _raw_url:
            _raw_url += "?sslmode=require" if "?" not in _raw_url else "&sslmode=require"
        SQLALCHEMY_DATABASE_URL = _raw_url
        # Supabase pooler (port 6543) recomandă NullPool pentru serverless / auto-scale
        from sqlalchemy.pool import NullPool
        _poolclass = NullPool
else:
    SQLALCHEMY_DATABASE_URL = "sqlite:///./imobiliare.db"
    _connect_args = {"check_same_thread": False}
    _poolclass = None

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args=_connect_args,
    **(dict(poolclass=_poolclass) if _poolclass else {}),
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# --- MODELE ---

class Property(Base):
    __tablename__ = "properties"

    id = Column(Integer, primary_key=True, index=True)
    ref_catastral = Column(String, unique=True, index=True)
    address = Column(String, nullable=True)
    lat = Column(Float)
    lon = Column(Float)
    year_built = Column(Integer, nullable=True)
    sq_meters = Column(Float, nullable=True)
    scor_oportunitate = Column(Integer, nullable=True)  # 0–100, pentru culoare pe hartă
    stare_piscina = Column(String, nullable=True)  # OK | CRITIC (din analiza satelit)
    last_updated = Column(DateTime, default=datetime.utcnow)


class SearchHistory(Base):
    __tablename__ = "search_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String)  # Placeholder până implementăm sistemul de useri
    prop_id = Column(Integer, ForeignKey("properties.id"))
    timestamp = Column(DateTime, default=datetime.utcnow)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    phone = Column(String, nullable=True)  # Pentru notificări SMS/WhatsApp
    is_active = Column(Boolean, default=True)


class PaymentContext(Base):
    """
    Stochează JSON mare (cadastral + financiar) între creeaza-plata și webhook Stripe
    (metadata Stripe e limitată la ~500 caractere per valoare).
    """

    __tablename__ = "payment_contexts"

    id = Column(String(40), primary_key=True, index=True)
    payload_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class DetailedReport(Base):
    __tablename__ = "detailed_reports"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    status = Column(String, default="pending")  # pending, processing, completed, failed
    external_request_id = Column(String, index=True)  # ID de la API-ul intermediar
    stripe_session_id = Column(String, unique=True, index=True, nullable=True)  # idempotență webhook
    product_tier = Column(String, nullable=True)  # nota_simple | expert_report
    extras_json = Column(Text, nullable=True)  # snapshot plată: cadastral_json, financial_data, market_data
    ai_job_id = Column(String, nullable=True, index=True)  # job async raport expert
    report_json = Column(Text, nullable=True)  # rezultat AI (schema expert_report)
    pdf_url = Column(String, nullable=True)
    extracted_owner = Column(String, nullable=True)
    cargas_resumen = Column(String, nullable=True)  # rezumat Cargas din OCR (ex. "Embargo 2023, Hipoteca...")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


def init_db():
    # Cache invalidation: force rebuild
    """Creează tabelele în baza de date. Apelat la startup-ul aplicației."""
    Base.metadata.create_all(bind=engine)
