from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import AssistantQueryIn, AssistantQueryOut
from app.services.ai_assistant import answer_mis_query

router = APIRouter(prefix="/api/assistant", tags=["AI Assistant"])


@router.post("/query", response_model=AssistantQueryOut)
def query_assistant(payload: AssistantQueryIn, db: Session = Depends(get_db)):
    res = answer_mis_query(db, payload.question)
    return AssistantQueryOut(
        reply=res["reply"],
        engineLabel=res["engineLabel"],
        relatedTransactionIds=res["relatedTransactionIds"],
        ollamaUsed=bool(res.get("ollamaUsed", False)),
    )
