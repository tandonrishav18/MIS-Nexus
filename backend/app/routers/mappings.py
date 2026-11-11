from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import EdiMappingRule
from app.schemas import MappingRuleCreateIn, MappingRuleOut, MappingRuleUpdateIn
from app.services.serializers import serialize_mapping_rule

router = APIRouter(prefix="/api/mappings", tags=["EDI Mapping"])


def _find_rule_or_404(db: Session, identifier: str) -> EdiMappingRule:
    rule = db.query(EdiMappingRule).filter(EdiMappingRule.rule_uid == identifier).first()
    if not rule and identifier.isdigit():
        rule = db.query(EdiMappingRule).filter(EdiMappingRule.id == int(identifier)).first()
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mapping rule '{identifier}' not found.",
        )
    return rule


@router.get("", response_model=list[MappingRuleOut])
def list_mappings(db: Session = Depends(get_db)):
    rules = db.query(EdiMappingRule).order_by(EdiMappingRule.id).all()
    return [serialize_mapping_rule(r) for r in rules]


@router.post("", response_model=MappingRuleOut, status_code=status.HTTP_201_CREATED)
def create_mapping(payload: MappingRuleCreateIn, db: Session = Depends(get_db)):
    uid = f"map-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    rule = EdiMappingRule(
        rule_uid=uid,
        document_type=payload.documentType,
        source_field=payload.sourceField.strip(),
        source_path=payload.sourcePath.strip(),
        edi_segment=payload.ediSegment.strip().upper(),
        edi_element=payload.ediElement.strip().upper(),
        edi_description=payload.ediDescription.strip() or "Custom mapped X12 element",
        transform_rule=payload.transformRule.strip() or "DIRECT_STRING(value)",
        status=payload.status,
        required=payload.required,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return serialize_mapping_rule(rule)


@router.patch("/{identifier}", response_model=MappingRuleOut)
def update_mapping(
    identifier: str,
    payload: MappingRuleUpdateIn,
    db: Session = Depends(get_db),
):
    rule = _find_rule_or_404(db, identifier)
    if payload.documentType is not None:
        rule.document_type = payload.documentType
    if payload.sourceField is not None:
        rule.source_field = payload.sourceField.strip()
    if payload.sourcePath is not None:
        rule.source_path = payload.sourcePath.strip()
    if payload.ediSegment is not None:
        rule.edi_segment = payload.ediSegment.strip().upper()
    if payload.ediElement is not None:
        rule.edi_element = payload.ediElement.strip().upper()
    if payload.ediDescription is not None:
        rule.edi_description = payload.ediDescription.strip()
    if payload.transformRule is not None:
        rule.transform_rule = payload.transformRule.strip()
    if payload.status is not None:
        rule.status = payload.status

    db.commit()
    db.refresh(rule)
    return serialize_mapping_rule(rule)


@router.delete("/{identifier}", status_code=status.HTTP_204_NO_CONTENT)
def delete_mapping(identifier: str, db: Session = Depends(get_db)):
    rule = _find_rule_or_404(db, identifier)
    if rule.required:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Required ANSI X12 core mapping rules cannot be deleted.",
        )
    db.delete(rule)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

