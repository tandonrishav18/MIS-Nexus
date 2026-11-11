from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TradingPartner(Base):
    __tablename__ = "trading_partners"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    partner_uid: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False)
    partner_code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    isa_qualifier: Mapped[str] = mapped_column(String(4), default="ZZ", nullable=False)
    isa_id: Mapped[str] = mapped_column(String(32), nullable=False)
    gs_id: Mapped[str] = mapped_column(String(32), nullable=False)
    supported_docs_json: Mapped[str] = mapped_column(Text, default='["850","855","810","856"]', nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_demo_seed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    gstin: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    city: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    state: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    contact_name: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    contact_email: Mapped[str] = mapped_column(String(150), default="", nullable=False)
    contact_phone: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    sla_ack_hours: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transaction_id: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    document_type: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    sender_partner_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("trading_partners.id", ondelete="SET NULL"), nullable=True
    )
    receiver_partner_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("trading_partners.id", ondelete="SET NULL"), nullable=True
    )
    sender_name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    receiver_name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    transaction_date: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2, asdecimal=True), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    ack_status: Mapped[str] = mapped_column(String(30), nullable=False)
    exception_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewer_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_demo_seed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    document: Mapped[Optional["Document"]] = relationship(
        "Document",
        back_populates="transaction",
        uselist=False,
        cascade="all, delete-orphan",
    )
    validation_results: Mapped[list["ValidationResult"]] = relationship(
        "ValidationResult",
        back_populates="transaction",
        cascade="all, delete-orphan",
        order_by="ValidationResult.id",
    )
    processing_events: Mapped[list["ProcessingEvent"]] = relationship(
        "ProcessingEvent",
        back_populates="transaction",
        cascade="all, delete-orphan",
        order_by="ProcessingEvent.id",
    )
    acknowledgement: Mapped[Optional["Acknowledgement"]] = relationship(
        "Acknowledgement",
        back_populates="transaction",
        uselist=False,
        cascade="all, delete-orphan",
    )


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transaction_pk: Mapped[int] = mapped_column(
        Integer, ForeignKey("transactions.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    document_number: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    document_type: Mapped[str] = mapped_column(String(10), nullable=False)
    document_date: Mapped[str] = mapped_column(String(40), nullable=False)
    reference_po: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2, asdecimal=True), nullable=False)
    tax_rate_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2, asdecimal=True), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2, asdecimal=True), nullable=False)
    grand_total: Mapped[Decimal] = mapped_column(Numeric(14, 2, asdecimal=True), nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="", nullable=False)
    edi_payload: Mapped[str] = mapped_column(Text, default="", nullable=False)
    supplier_receipt_simulated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    transaction: Mapped["Transaction"] = relationship("Transaction", back_populates="document")
    line_items: Mapped[list["DocumentLineItem"]] = relationship(
        "DocumentLineItem",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="DocumentLineItem.line_number",
    )


class DocumentLineItem(Base):
    __tablename__ = "document_line_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    line_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    sku: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2, asdecimal=True), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2, asdecimal=True), nullable=False)

    document: Mapped["Document"] = relationship("Document", back_populates="line_items")


class ValidationResult(Base):
    __tablename__ = "validation_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transaction_pk: Mapped[int] = mapped_column(
        Integer, ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rule_code: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    transaction: Mapped["Transaction"] = relationship("Transaction", back_populates="validation_results")


class ProcessingEvent(Base):
    __tablename__ = "processing_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transaction_pk: Mapped[int] = mapped_column(
        Integer, ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    timestamp: Mapped[str] = mapped_column(String(40), nullable=False)
    step: Mapped[str] = mapped_column(String(120), nullable=False)
    actor: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False)

    transaction: Mapped["Transaction"] = relationship("Transaction", back_populates="processing_events")


class Acknowledgement(Base):
    __tablename__ = "acknowledgements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transaction_pk: Mapped[int] = mapped_column(
        Integer, ForeignKey("transactions.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    ack_doc_number: Mapped[str] = mapped_column(String(80), nullable=False)
    ack_date: Mapped[str] = mapped_column(String(40), nullable=False)
    ack_code: Mapped[str] = mapped_column(String(10), nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False)

    transaction: Mapped["Transaction"] = relationship("Transaction", back_populates="acknowledgement")


class EdiMappingRule(Base):
    __tablename__ = "edi_mapping_rules"
    __table_args__ = (UniqueConstraint("rule_uid", name="uq_mapping_rule_uid"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    rule_uid: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    document_type: Mapped[str] = mapped_column(String(10), nullable=False)
    source_field: Mapped[str] = mapped_column(String(120), nullable=False)
    source_path: Mapped[str] = mapped_column(String(120), nullable=False)
    edi_segment: Mapped[str] = mapped_column(String(20), nullable=False)
    edi_element: Mapped[str] = mapped_column(String(40), nullable=False)
    edi_description: Mapped[str] = mapped_column(String(200), nullable=False)
    transform_rule: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class ApplicationSettings(Base):
    __tablename__ = "application_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_name: Mapped[str] = mapped_column(String(160), nullable=False)
    hub_code: Mapped[str] = mapped_column(String(60), nullable=False)
    hub_gstin: Mapped[str] = mapped_column(String(32), nullable=False)
    admin_email: Mapped[str] = mapped_column(String(150), nullable=False)
    default_tax_rate_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2, asdecimal=True), nullable=False)
    auto_validate_on_submit: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    edi_standard_version: Mapped[str] = mapped_column(String(60), nullable=False)
    segment_terminator: Mapped[str] = mapped_column(String(4), nullable=False)
    element_separator: Mapped[str] = mapped_column(String(4), nullable=False)
    ollama_endpoint: Mapped[str] = mapped_column(String(200), nullable=False)
    ollama_model: Mapped[str] = mapped_column(String(80), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

