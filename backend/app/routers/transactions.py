import math
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Document, Transaction
from app.schemas import (
    DocumentCreateIn,
    PaginatedTransactionsOut,
    TransactionOut,
    TransactionUpdateIn,
)
from app.services.serializers import serialize_transaction
from app.services.workflow import (
    create_document_transaction,
    get_transaction_or_404,
    update_transaction_figures,
)

router = APIRouter(prefix="/api/transactions", tags=["Transactions"])


@router.get("", response_model=PaginatedTransactionsOut)
def list_transactions(
    search: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    doc_type: Optional[str] = Query(default=None),
    partner: Optional[str] = Query(default=None),
    sort_by: str = Query(default="transactionDate"),
    sort_dir: str = Query(default="desc"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Transaction)
        .options(
            joinedload(Transaction.document).joinedload(Document.line_items),
            joinedload(Transaction.validation_results),
            joinedload(Transaction.processing_events),
            joinedload(Transaction.acknowledgement),
        )
        .all()
    )

    q_low = (search or "").strip().lower()
    doc_labels = {
        "850": "purchase order po",
        "855": "order acknowledgement poa",
        "810": "invoice inv",
        "856": "advance shipping notice asn",
    }

    filtered: list[Transaction] = []
    for t in rows:
        if status_filter and status_filter != "ALL" and t.status != status_filter:
            continue
        if doc_type and doc_type != "ALL" and t.document_type != doc_type:
            continue
        if partner and partner != "ALL":
            if t.sender_name != partner and t.receiver_name != partner:
                continue
        if q_low:
            doc_num = t.document.document_number.lower() if t.document else ""
            summary = t.document.summary.lower() if t.document else ""
            dtype_words = doc_labels.get(t.document_type, "")
            if not (
                q_low in t.transaction_id.lower()
                or q_low in doc_num
                or q_low in t.sender_name.lower()
                or q_low in t.receiver_name.lower()
                or q_low in t.document_type.lower()
                or q_low in dtype_words
                or q_low in summary
            ):
                continue
        filtered.append(t)

    reverse = sort_dir.lower() == "desc"
    if sort_by == "amount":
        filtered.sort(key=lambda t: t.amount, reverse=reverse)
    elif sort_by == "transactionId":
        filtered.sort(key=lambda t: t.transaction_id, reverse=reverse)
    elif sort_by == "documentType":
        filtered.sort(key=lambda t: t.document_type, reverse=reverse)
    elif sort_by == "sender":
        filtered.sort(key=lambda t: t.sender_name, reverse=reverse)
    elif sort_by == "status":
        filtered.sort(key=lambda t: t.status, reverse=reverse)
    else:
        filtered.sort(key=lambda t: t.transaction_date, reverse=reverse)

    total = len(filtered)
    total_pages = max(1, math.ceil(total / page_size))
    safe_page = min(page, total_pages)
    start = (safe_page - 1) * page_size
    page_items = [serialize_transaction(t) for t in filtered[start : start + page_size]]

    return PaginatedTransactionsOut(
        items=page_items,
        total=total,
        page=safe_page,
        pageSize=page_size,
        totalPages=total_pages,
    )


@router.get("/{identifier}", response_model=TransactionOut)
def get_transaction(identifier: str, db: Session = Depends(get_db)):
    txn = get_transaction_or_404(db, identifier)
    return serialize_transaction(txn)


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(payload: DocumentCreateIn, db: Session = Depends(get_db)):
    txn = create_document_transaction(db, payload)
    return serialize_transaction(txn)


@router.patch("/{identifier}", response_model=TransactionOut)
def update_transaction(
    identifier: str,
    payload: TransactionUpdateIn,
    db: Session = Depends(get_db),
):
    txn = update_transaction_figures(db, identifier, payload)
    return serialize_transaction(txn)


@router.delete("/{identifier}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(identifier: str, db: Session = Depends(get_db)):
    txn = get_transaction_or_404(db, identifier)
    if txn.is_demo_seed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Seeded demonstration records cannot be deleted individually; use Demo Reset in Settings.",
        )
    db.delete(txn)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

