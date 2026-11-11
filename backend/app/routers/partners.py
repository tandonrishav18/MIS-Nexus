import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Document, TradingPartner, Transaction
from app.schemas import PartnerCreateIn, PartnerDetailOut, PartnerOut, PartnerUpdateIn
from app.services.serializers import serialize_partner, serialize_transaction

router = APIRouter(prefix="/api/partners", tags=["Trading Partners"])


def _find_partner_or_404(db: Session, identifier: str) -> TradingPartner:
    partner = (
        db.query(TradingPartner)
        .filter(TradingPartner.partner_uid == identifier)
        .first()
    )
    if not partner and identifier.isdigit():
        partner = db.query(TradingPartner).filter(TradingPartner.id == int(identifier)).first()
    if not partner:
        partner = db.query(TradingPartner).filter(TradingPartner.partner_code == identifier).first()
    if not partner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trading partner '{identifier}' not found.",
        )
    return partner


@router.get("", response_model=list[PartnerOut])
def list_partners(db: Session = Depends(get_db)):
    partners = db.query(TradingPartner).order_by(TradingPartner.id).all()
    txns = db.query(Transaction).all()
    return [serialize_partner(p, txns) for p in partners]


@router.get("/{identifier}", response_model=PartnerDetailOut)
def get_partner(identifier: str, db: Session = Depends(get_db)):
    partner = _find_partner_or_404(db, identifier)
    txns = (
        db.query(Transaction)
        .options(
            joinedload(Transaction.document).joinedload(Document.line_items),
            joinedload(Transaction.validation_results),
            joinedload(Transaction.processing_events),
            joinedload(Transaction.acknowledgement),
        )
        .filter(
            (Transaction.sender_name == partner.name)
            | (Transaction.receiver_name == partner.name)
        )
        .order_by(Transaction.transaction_date.desc())
        .all()
    )
    return PartnerDetailOut(
        partner=serialize_partner(partner, txns),
        transactions=[serialize_transaction(t) for t in txns],
    )


@router.post("", response_model=PartnerOut, status_code=status.HTTP_201_CREATED)
def create_partner(payload: PartnerCreateIn, db: Session = Depends(get_db)):
    existing = (
        db.query(TradingPartner)
        .filter(
            (TradingPartner.name == payload.name.strip())
            | (TradingPartner.partner_code == payload.partnerCode.strip().upper())
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A trading partner with that name or partner code already exists.",
        )

    uid = f"ptr-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    partner = TradingPartner(
        partner_uid=uid,
        name=payload.name.strip(),
        role=payload.role,
        partner_code=payload.partnerCode.strip().upper(),
        isa_qualifier=payload.isaQualifier.strip().upper(),
        isa_id=payload.isaId.strip().upper(),
        gs_id=payload.gsId.strip().upper(),
        supported_docs_json=json.dumps(payload.supportedDocs),
        active=payload.active,
        is_demo_seed=False,
        gstin=payload.gstin.strip(),
        city=payload.city.strip(),
        state=payload.state.strip(),
        contact_name=payload.contactName.strip(),
        contact_email=payload.contactEmail.strip(),
        contact_phone=payload.contactPhone.strip(),
        sla_ack_hours=payload.slaAckHours,
        notes=payload.notes.strip(),
    )
    db.add(partner)
    db.commit()
    db.refresh(partner)
    return serialize_partner(partner, [])


@router.patch("/{identifier}", response_model=PartnerOut)
def update_partner(
    identifier: str,
    payload: PartnerUpdateIn,
    db: Session = Depends(get_db),
):
    partner = _find_partner_or_404(db, identifier)
    if payload.active is not None:
        partner.active = payload.active
    if payload.role is not None:
        partner.role = payload.role
    if payload.supportedDocs is not None:
        partner.supported_docs_json = json.dumps(payload.supportedDocs)
    if payload.contactName is not None:
        partner.contact_name = payload.contactName
    if payload.contactEmail is not None:
        partner.contact_email = payload.contactEmail
    if payload.contactPhone is not None:
        partner.contact_phone = payload.contactPhone
    if payload.slaAckHours is not None:
        partner.sla_ack_hours = payload.slaAckHours
    if payload.notes is not None:
        partner.notes = payload.notes

    db.commit()
    db.refresh(partner)
    txns = db.query(Transaction).all()
    return serialize_partner(partner, txns)

